import {
  appointmentTypes,
  billingStatements,
  charges,
  consultations,
  coverages,
  encounterEvents,
  encounters,
  labTests,
  locations,
  memberships,
  notifyRealtime,
  patients,
  procedures,
  touchStatement,
  user as userTable,
  type FieldCipher,
  type TenantDb,
  type Tx,
} from '@clinic/db';
import {
  addChargeSchema,
  isOpenVisitStatus,
  type BillingItemKind,
  type BillingStatement,
  type ChargeAdded,
  type ChargeOption,
  type ChargeOptions,
  type CheckoutQueue,
  type CheckoutQueueRow,
  type CoverageType,
} from '@clinic/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import type { AuditService } from './audit.ts';
import { prepareStatement, readStatement, totalsByVisit } from './billing-statement.ts';
import type { Clock } from './clock.ts';
import { hasOpenOrders, lockEncounter, type LockedEncounter } from './encounters.ts';
import type { IdempotencyService } from './idempotency.ts';
import type { BenefitChange } from './membership-benefits.ts';
import { loadPayments, myMembership, paymentViews } from './payments.ts';
import type { Principal } from './principal.ts';
import { HttpError, requireContext, type RequestMeta } from './services.ts';

// Caja: cola y estado de cuenta (T-027; S-CAJ-01 a 08, S-CAJ-16, S-CLI-23).
//  - Todo lo calcula el servidor, en centavos (CLAUDE.md, regla 4): subtotal,
//    beneficios de membresía, «A cargo del seguro» (ADR 0035), total a pagar
//    y saldo (computeStatement de @clinic/shared). La web solo da formato.
//  - Estado de cuenta: los cuatro roles clínicos lo ven; Recepción
//    (checkout.access) con sus líneas, Enfermería y el Proveedor solo los
//    totales. Al abrirlo con la visita abierta se recalculan los beneficios
//    de membresía (ADR 0034). Lectura auditada (`billing.statement_view`, con
//    la vista «full» o «totals»).
//  - «Agregar cargo» (S-CAJ-08, ADR 0041): solo un servicio del catálogo
//    (consulta, procedimiento o prueba) y la cantidad; el precio es el
//    vigente de la sede ese día (ADR 0029), nunca uno enviado por la web. En
//    cualquier estado abierto (cobro anticipado), con Idempotency-Key y la
//    versión del estado de cuenta. Recibe los beneficios de membresía, igual
//    que los cargos de orden. Auditado.
//  - Cola (S-CAJ-01/02): «En caja» y «Listo para caja» de la sede, primero
//    «En caja» y después de la que más espera a la que menos. El saldo sale
//    de lo guardado en los cargos (los beneficios se recalculan con cada
//    cargo, cobertura y apertura del estado de cuenta). Búsqueda por nombre
//    o código (ADR 0012). Lectura auditada (`billing.queue_view`), sin nombres.
//  - Eventos en vivo `billing.changed` con el id de la visita.

/** Tope de un cargo: el mayor entero de la columna `amount_cents`. */
const MAX_CHARGE_CENTS = 2_147_483_647;

export class BillingService {
  readonly #tenantDb: TenantDb;
  readonly #plain;
  readonly #audit: AuditService;
  readonly #cipher: FieldCipher;
  readonly #idempotency: IdempotencyService;
  readonly #clock: Clock;

  constructor(pool: pg.Pool, tenantDb: TenantDb, audit: AuditService, cipher: FieldCipher, idempotency: IdempotencyService, clock: Clock) {
    this.#tenantDb = tenantDb;
    this.#plain = drizzle({ client: pool });
    this.#audit = audit;
    this.#cipher = cipher;
    this.#idempotency = idempotency;
    this.#clock = clock;
  }

  /** S-CAJ-07 / S-CAJ-16: el estado de cuenta de la visita. Recalcula los beneficios si está abierta. Lectura auditada. */
  async statement(actor: Principal, encounterId: string, meta: RequestMeta): Promise<BillingStatement> {
    const ctx = requireContext(actor);
    // T-028: quien anula (billing.void con un rol clínico, ADR 0033) también ve el estado de cuenta completo.
    const canVoid = actor.permissions.has('billing.void') && actor.permissions.has('patients.access');
    const cashier = actor.permissions.has('checkout.access');
    const full = cashier || canVoid;
    const data = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const now = this.#clock.now();
      const current = await lockEncounter(tx, ctx.locationId, encounterId);
      const { version, changes } = await prepareStatement(tx, current, now);
      await this.#auditBenefits(tx, actor, current, changes, meta);
      if (changes.length > 0) await this.#billingChanged(tx, current);
      const data = await readStatement(tx, this.#cipher, current, version);
      const [patient] = full
        ? await tx.select({ id: patients.id, code: patients.code, firstName: patients.firstName, lastName: patients.lastName }).from(patients).where(eq(patients.id, current.patientId))
        : [];
      const loaded = full ? await loadPayments(tx, this.#cipher, { encounterId: current.id }) : null;
      const me = loaded ? await myMembership(tx, actor.userId) : '';
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'billing.statement_view',
        ...auditBase(actor, current, meta),
        metadata: { encounterCode: current.code, view: full ? 'full' : 'totals', lines: data.lines.length },
      });
      const statement: Omit<BillingStatement, 'payments'> = {
        encounter: { id: current.id, code: current.code, status: current.status, route: current.route, version: current.version, hasOpenOrders: await hasOpenOrders(tx, current.id) },
        patient: patient ?? null,
        coverage: data.coverage ? { type: data.coverage.type, term: data.coverage.term } : null,
        statementVersion: data.version,
        totals: data.totals,
        view: full ? 'full' : 'totals',
        lines: full ? data.lines : null,
        voided: full ? data.voided : null,
        editable: cashier && isOpenVisitStatus(current.status),
        canPay: cashier && current.status !== 'CANCELLED',
        canVoid: full && canVoid && current.status !== 'CANCELLED',
      };
      return { statement, loaded, me };
    });
    const names = data.loaded ? await this.#names(data.loaded.userIds) : new Map<string, string>();
    return { ...data.statement, payments: data.loaded ? paymentViews(data.loaded.rows, names, data.me) : null };
  }

  /** S-CAJ-08: los servicios activos del catálogo con su precio vigente en la sede hoy. */
  async chargeOptions(actor: Principal, encounterId: string): Promise<ChargeOptions> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const site = await this.#encounterSite(tx, ctx.locationId, encounterId);
      const date = dayIn(this.#clock.now(), site.timezone);
      const order = (table: typeof consultations | typeof procedures | typeof labTests) => [sql`${table.sortOrder} nulls last`, asc(table.code)];
      const consults = await tx
        .select({ id: consultations.id, code: consultations.code, name: consultations.name })
        .from(consultations)
        .where(eq(consultations.active, true))
        .orderBy(...order(consultations));
      const procs = await tx
        .select({ id: procedures.id, code: procedures.code, name: procedures.name, kind: procedures.kind })
        .from(procedures)
        .where(eq(procedures.active, true))
        .orderBy(...order(procedures));
      const labs = await tx.select({ id: labTests.id, code: labTests.code, name: labTests.name }).from(labTests).where(eq(labTests.active, true)).orderBy(...order(labTests));
      const prices = {
        consultation: await pricesOn(tx, 'consultation', consults.map((c) => c.id), ctx.locationId, date),
        procedure: await pricesOn(tx, 'procedure', procs.map((p) => p.id), ctx.locationId, date),
        lab_test: await pricesOn(tx, 'lab_test', labs.map((l) => l.id), ctx.locationId, date),
      };
      const items: ChargeOption[] = [
        ...consults.map((c) => ({ kind: 'consultation' as const, group: 'consultation' as const, ...c, unitPriceCents: prices.consultation.get(c.id) ?? null })),
        ...procs.map(({ kind, ...p }): ChargeOption => ({ kind: 'procedure', group: kind === 'injection' ? 'injection' : 'procedure', ...p, unitPriceCents: prices.procedure.get(p.id) ?? null })),
        ...labs.map((l) => ({ kind: 'lab_test' as const, group: 'lab_test' as const, ...l, unitPriceCents: prices.lab_test.get(l.id) ?? null })),
      ];
      return { date, items };
    });
  }

  /** S-CAJ-08 «Agregar cargo»: un servicio del catálogo al precio vigente de la sede, con Idempotency-Key y la versión del estado de cuenta. */
  async addCharge(actor: Principal, encounterId: string, raw: unknown, idempotencyKey: string, meta: RequestMeta): Promise<ChargeAdded> {
    const ctx = requireContext(actor);
    const input = addChargeSchema.parse(raw);
    const result = await this.#idempotency.run(
      ctx.organizationId,
      idempotencyKey,
      { method: 'POST', path: `/api/encounters/${encounterId}/charges`, body: raw },
      async (tx) => {
        const now = this.#clock.now();
        const current = await lockEncounter(tx, ctx.locationId, encounterId);
        if (!isOpenVisitStatus(current.status)) throw new HttpError(409, 'encounter_closed');
        // La versión leída: los beneficios se recalculan antes, igual que al abrir el estado de cuenta.
        const prepared = await prepareStatement(tx, current, now);
        await this.#auditBenefits(tx, actor, current, prepared.changes, meta);
        if (prepared.version !== input.expectedVersion) throw new HttpError(409, 'version_conflict');
        const me = await myMembership(tx, actor.userId);
        const site = await this.#encounterSite(tx, ctx.locationId, current.id);
        const date = dayIn(now, site.timezone);
        const item = await catalogItem(tx, input.item.kind, input.item.id);
        const unitPriceCents = (await pricesOn(tx, input.item.kind, [item.id], ctx.locationId, date)).get(item.id) ?? null;
        if (unitPriceCents === null) throw new HttpError(409, 'price_unavailable');
        const amountCents = unitPriceCents * input.quantity;
        if (amountCents > MAX_CHARGE_CENTS) throw new HttpError(409, 'amount_too_large');
        const chargeId = uuidv7();
        await tx.insert(charges).values({
          id: chargeId,
          organizationId: ctx.organizationId,
          locationId: ctx.locationId,
          encounterId: current.id,
          source: 'cashier',
          consultationId: input.item.kind === 'consultation' ? item.id : null,
          procedureId: input.item.kind === 'procedure' ? item.id : null,
          labTestId: input.item.kind === 'lab_test' ? item.id : null,
          itemCode: item.code,
          itemName: item.name,
          unitPriceCents,
          quantity: input.quantity,
          amountCents,
          priceDate: date,
          createdByMembershipId: me,
          createdAt: now,
        });
        await this.#audit.inTx(tx, ctx.organizationId, {
          action: 'charge.created',
          ...auditBase(actor, current, meta, 'charge', chargeId),
          metadata: {
            encounterCode: current.code,
            source: 'cashier',
            itemKind: input.item.kind,
            itemCode: item.code,
            previousCents: 'none',
            amountCents,
            unitPriceCents,
            quantity: input.quantity,
            priceDate: date,
          },
        });
        // El cargo nuevo recibe los beneficios de membresía, igual que los de orden.
        const { changes } = await prepareStatement(tx, current, now);
        await this.#auditBenefits(tx, actor, current, changes, meta);
        await touchStatement(tx, { organizationId: ctx.organizationId, locationId: ctx.locationId, encounterId: current.id }, now);
        await this.#billingChanged(tx, current);
        return { status: 201, resourceIds: [chargeId] };
      },
      (ids) => this.#added(actor, ids[0] ?? ''),
    );
    return result.body;
  }

  /** S-CAJ-01/02: la cola de Caja de la sede activa, con búsqueda por nombre o código. Lectura auditada sin nombres. */
  async queue(actor: Principal, search: string, meta: RequestMeta): Promise<CheckoutQueue> {
    const ctx = requireContext(actor);
    const now = this.#clock.now();
    const data = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const readySince = sql<Date | string | null>`(select ${encounterEvents.occurredAt} from ${encounterEvents}
        where ${encounterEvents.encounterId} = ${encounters.id} and ${encounterEvents.toStatus} = 'READY_FOR_CHECKOUT'
        order by ${encounterEvents.encounterVersion} desc limit 1)`;
      const rows = await tx
        .select({
          id: encounters.id,
          code: encounters.code,
          status: encounters.status,
          version: encounters.version,
          arrivedAt: encounters.arrivedAt,
          readySince,
          providerMembershipId: encounters.providerMembershipId,
          patientId: patients.id,
          patientCode: patients.code,
          firstName: patients.firstName,
          lastName: patients.lastName,
          typeName: appointmentTypes.name,
        })
        .from(encounters)
        .innerJoin(patients, eq(patients.id, encounters.patientId))
        .leftJoin(appointmentTypes, eq(appointmentTypes.id, encounters.appointmentTypeId))
        .where(and(eq(encounters.locationId, ctx.locationId), inArray(encounters.status, ['READY_FOR_CHECKOUT', 'CHECKOUT'])));
      const term = normalize(search);
      const found = term === '' ? rows : rows.filter((r) => [r.code, r.patientCode, `${r.firstName} ${r.lastName}`].some((v) => normalize(v).includes(term)));
      const totals = await totalsByVisit(tx, found.map((r) => r.id));
      const coverageRows =
        found.length > 0 ? await tx.select({ encounterId: coverages.encounterId, type: coverages.type }).from(coverages).where(inArray(coverages.encounterId, found.map((r) => r.id))) : [];
      const providerIds = [...new Set(found.map((r) => r.providerMembershipId).filter((id): id is string => id !== null))];
      const providers = providerIds.length > 0 ? await tx.select({ id: memberships.id, userId: memberships.userId }).from(memberships).where(inArray(memberships.id, providerIds)) : [];
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'billing.queue_view',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'encounter',
        ...meta,
        metadata: { results: found.length, searched: term !== '' },
      });
      return { found, totals, coverageRows, providers };
    });
    const names = await this.#names(data.providers.map((p) => p.userId));
    const providerName = new Map(data.providers.map((p) => [p.id, names.get(p.userId) ?? null]));
    const rows: CheckoutQueueRow[] = data.found.map((r) => ({
      encounterId: r.id,
      code: r.code,
      status: r.status as CheckoutQueueRow['status'],
      version: r.version,
      readySince: (r.readySince ? new Date(r.readySince) : r.arrivedAt).toISOString(),
      patient: { id: r.patientId, code: r.patientCode, firstName: r.firstName, lastName: r.lastName },
      appointmentType: r.typeName,
      provider: r.providerMembershipId ? (providerName.get(r.providerMembershipId) ?? null) : null,
      coverageType: (data.coverageRows.find((c) => c.encounterId === r.id)?.type ?? null) as CoverageType | null,
      balanceCents: data.totals.get(r.id)?.balanceCents ?? 0,
    }));
    // Primero «En caja» y después «Listo para caja», de la que más espera a la que menos.
    rows.sort((a, b) => (a.status === b.status ? a.readySince.localeCompare(b.readySince) || a.code.localeCompare(b.code) : a.status === 'CHECKOUT' ? -1 : 1));
    return { serverNow: now.toISOString(), rows };
  }

  // --- Ayudas ------------------------------------------------------------------

  async #auditBenefits(tx: Tx, actor: Principal, current: LockedEncounter, changes: BenefitChange[], meta: RequestMeta): Promise<void> {
    for (const change of changes) {
      await this.#audit.inTx(tx, current.organizationId, {
        action: 'charge.membership_benefits',
        ...auditBase(actor, current, meta, 'charge', change.chargeId),
        metadata: { encounterCode: current.code, previousDiscountCents: change.previousDiscountCents, discountCents: change.discountCents, includedQuantity: change.includedQuantity },
      });
    }
  }

  async #billingChanged(tx: Tx, current: LockedEncounter): Promise<void> {
    await notifyRealtime(tx, { t: 'event', org: current.organizationId, loc: current.locationId, name: 'billing.changed', ids: { encounter: current.id } });
  }

  async #added(actor: Principal, chargeId: string): Promise<ChargeAdded> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [row] = await tx
        .select({ id: charges.id, version: billingStatements.version })
        .from(charges)
        .innerJoin(billingStatements, eq(billingStatements.encounterId, charges.encounterId))
        .where(and(eq(charges.id, chargeId), eq(charges.locationId, ctx.locationId)));
      if (!row) throw new HttpError(404, 'charge_not_found');
      return { chargeId: row.id, statementVersion: row.version };
    });
  }

  async #encounterSite(tx: Tx, locationId: string, encounterId: string): Promise<{ timezone: string }> {
    const [row] = await tx
      .select({ timezone: locations.timezone })
      .from(encounters)
      .innerJoin(locations, eq(locations.id, encounters.locationId))
      .where(and(eq(encounters.id, encounterId), eq(encounters.locationId, locationId)));
    if (!row) throw new HttpError(404, 'encounter_not_found');
    return row;
  }

  /** Nombres del personal (cuentas globales, fuera de RLS; solo las ya filtradas por organización). */
  async #names(userIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Map();
    const rows = await this.#plain.select({ id: userTable.id, name: userTable.name }).from(userTable).where(inArray(userTable.id, unique));
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}

/**
 * Precio vigente en la sede un día (ADR 0029), por servicio: la última fila
 * de la sede vigente ese día si tiene importe; si no (o es «Usa el precio
 * general»), la última general vigente. Nulo si no hay ninguno.
 */
export async function pricesOn(tx: Tx, kind: BillingItemKind, itemIds: string[], locationId: string, date: string): Promise<Map<string, number | null>> {
  if (itemIds.length === 0) return new Map();
  const column = sql.raw(kind === 'lab_test' ? '"lab_test_id"' : kind === 'consultation' ? '"consultation_id"' : '"procedure_id"');
  const latest = (scope: ReturnType<typeof sql>) => sql`(
    select p.amount_cents from app.prices p
     where ${scope} and p.${column} = i.id and p.effective_from <= ${date}::date
     order by p.effective_from desc, p.created_at desc, p.id desc limit 1)`;
  const { rows } = await tx.execute<{ item_id: string; own: number | null; general: number | null }>(sql`
    select i.id as item_id,
           ${latest(sql`p.location_id = ${locationId}`)} as own,
           ${latest(sql`p.location_id is null`)} as general
      from unnest(array[${sql.join(
        itemIds.map((id) => sql`${id}`),
        sql`, `,
      )}]::uuid[]) as i(id)`);
  return new Map(rows.map((r) => [r.item_id, r.own ?? r.general]));
}

/** El servicio del catálogo: 400 si no existe, 409 si está inactivo. */
async function catalogItem(tx: Tx, kind: BillingItemKind, id: string): Promise<{ id: string; code: string; name: string }> {
  const table = kind === 'consultation' ? consultations : kind === 'procedure' ? procedures : labTests;
  const [row] = await tx.select({ id: table.id, code: table.code, name: table.name, active: table.active }).from(table).where(eq(table.id, id));
  if (!row) throw new HttpError(400, 'item_not_found');
  if (!row.active) throw new HttpError(409, 'item_inactive');
  return { id: row.id, code: row.code, name: row.name };
}

function auditBase(actor: Principal, current: LockedEncounter, meta: RequestMeta, entityType: 'encounter' | 'charge' = 'encounter', entityId: string = current.id) {
  return { actorType: 'user' as const, actorId: actor.userId, locationId: current.locationId, entityType, entityId, ...meta };
}

/** AAAA-MM-DD en la zona de la sede. */
function dayIn(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** Minúsculas y sin acentos, para buscar. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}
