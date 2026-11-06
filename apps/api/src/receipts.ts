import {
  coverages,
  encounters,
  locations,
  membershipFees,
  membershipPlans,
  memberships,
  nextReceiptCode,
  notifyRealtime,
  organizations,
  patientMemberships,
  patients,
  receiptPrints,
  receipts,
  user as userTable,
  type FieldCipher,
  type TenantDb,
  type Tx,
} from '@clinic/db';
import {
  generateFeeReceiptSchema,
  generateVisitReceiptSchema,
  printReceiptSchema,
  RECEIPT_PRINTS_PER_MINUTE,
  receiptSnapshotSchema,
  renderReceipt,
  type PaymentMethod,
  type ReceiptCoverageSnapshot,
  type ReceiptDocument,
  type ReceiptGenerated,
  type ReceiptLanguage,
  type ReceiptListItem,
  type ReceiptSnapshot,
  type ReceiptsPanel,
} from '@clinic/shared';
import { and, count, desc, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import type { AuditService } from './audit.ts';
import { prepareStatement, readStatement } from './billing-statement.ts';
import type { Clock } from './clock.ts';
import { lockEncounter, type LockedEncounter } from './encounters.ts';
import type { IdempotencyService } from './idempotency.ts';
import { loadPayments, myMembership, type LoadedPayment } from './payments.ts';
import type { Principal } from './principal.ts';
import { HttpError, requireContext, type RequestMeta } from './services.ts';

// Recibos (T-029; S-CAJ-14, 15 y 24; ADR 0018, 0019 y 0037).
//  - Generar (receipts.generate, Recepción), con Idempotency-Key: en una sola
//    transacción, la visita bloqueada (o la cuota), el estado de cuenta
//    recalculado, el código `NOR1-R-2026-000045` (contador por sede y año
//    de la sede, sin huecos), la instantánea cifrada y la auditoría
//    `receipt.generated`. Visita «Cancelada» (estado de cuenta «Anulado»):
//    409 `statement_voided`. Un pago vinculado ya anulado: 409
//    `payment_voided`. Una cuota sin pagar: 409 `fee_not_paid`.
//  - Ver (receipts.print con un rol clínico): el texto del servidor en el
//    idioma pedido, con la lectura auditada (`receipt.view`).
//  - Imprimir y reimprimir: el límite de 30 por persona y minuto, la fila de
//    receipt_prints y la auditoría `receipt.printed` van en una transacción;
//    el texto sale solo después de que se confirma. Si la auditoría falla,
//    no hay texto y la web no imprime nada. Reimprimir muestra la
//    instantánea original, en el idioma elegido.
//  - La auditoría no lleva nombres: códigos, idioma e importes.
//  - Un recibo de visita se ve en la sede de la visita; uno de cuota, en
//    cualquier sede de la organización (la membresía es de la organización).
//  - Todas las horas salen del reloj inyectable.

const snapshotContext = (organizationId: string, recordId: string) => ({ organizationId, table: 'receipts', column: 'snapshot', recordId });
const insurerContext = (organizationId: string, recordId: string) => ({ organizationId, table: 'coverages', column: 'insurer_name', recordId });

const PRINT_WINDOW_MS = 60_000;

type ReceiptRow = typeof receipts.$inferSelect;

export class ReceiptService {
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

  // --- Tarjeta «Recibos» -----------------------------------------------------------

  /** S-CAJ-14 de una visita: sus recibos, si se puede generar y el último pago para vincular. */
  async visitPanel(actor: Principal, encounterId: string): Promise<ReceiptsPanel> {
    const ctx = requireContext(actor);
    const data = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [visit] = await tx
        .select({ id: encounters.id, status: encounters.status })
        .from(encounters)
        .where(and(eq(encounters.id, encounterId), eq(encounters.locationId, ctx.locationId)));
      if (!visit) throw new HttpError(404, 'encounter_not_found');
      const rows = await this.#list(tx, eq(receipts.encounterId, visit.id));
      const loaded = await loadPayments(tx, this.#cipher, { encounterId: visit.id });
      return { rows, payments: loaded.rows, me: await myMembership(tx, actor.userId), latest: latestActive(loaded.rows), blocked: visit.status === 'CANCELLED' ? ('statement_voided' as const) : null };
    });
    return this.#panel(actor, data);
  }

  /** La tarjeta de recibos de una cuota de membresía (en la tarjeta «Membresía» del perfil). */
  async feePanel(actor: Principal, feeId: string): Promise<ReceiptsPanel> {
    const ctx = requireContext(actor);
    const data = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [fee] = await tx.select({ id: membershipFees.id, status: membershipFees.status }).from(membershipFees).where(eq(membershipFees.id, feeId));
      if (!fee) throw new HttpError(404, 'fee_not_found');
      const rows = await this.#list(tx, eq(receipts.membershipFeeId, fee.id));
      const loaded = await loadPayments(tx, this.#cipher, { feeIds: [fee.id] });
      const latest = latestActive(loaded.rows);
      return { rows, payments: loaded.rows, me: await myMembership(tx, actor.userId), latest, blocked: fee.status === 'paid' && latest ? null : ('fee_not_paid' as const) };
    });
    return this.#panel(actor, data);
  }

  // --- Generar -------------------------------------------------------------------

  /** S-CAJ-14 «Generar recibo» de una visita, con o sin el pago vinculado. */
  async generateForVisit(actor: Principal, encounterId: string, raw: unknown, idempotencyKey: string, meta: RequestMeta): Promise<ReceiptGenerated> {
    const ctx = requireContext(actor);
    const input = generateVisitReceiptSchema.parse(raw);
    const result = await this.#idempotency.run(
      ctx.organizationId,
      idempotencyKey,
      { method: 'POST', path: `/api/encounters/${encounterId}/receipts`, body: raw },
      async (tx) => {
        const now = this.#clock.now();
        const current = await lockEncounter(tx, ctx.locationId, encounterId);
        if (current.status === 'CANCELLED') throw new HttpError(409, 'statement_voided');
        // Los beneficios al día, igual que al abrir el estado de cuenta.
        const { version, changes } = await prepareStatement(tx, current, now);
        for (const change of changes) {
          await this.#audit.inTx(tx, ctx.organizationId, {
            action: 'charge.membership_benefits',
            ...base(actor, current.locationId, 'charge', change.chargeId, meta),
            metadata: { encounterCode: current.code, previousDiscountCents: change.previousDiscountCents, discountCents: change.discountCents, includedQuantity: change.includedQuantity },
          });
        }
        const statement = await readStatement(tx, this.#cipher, current, version);
        const loaded = await loadPayments(tx, this.#cipher, { encounterId: current.id });
        const linked = input.paymentId === null ? null : linkedPayment(loaded.rows, input.paymentId);
        const site = await this.#site(tx, ctx.locationId);
        const year = yearIn(now, site.timezone);
        const id = uuidv7();
        const code = await nextReceiptCode(tx, ctx.organizationId, site, year);
        const snapshot: ReceiptSnapshot = {
          ...(await this.#header(tx, actor, ctx.organizationId, site, current.patientId, code, now)),
          target: {
            kind: 'visit',
            encounterCode: current.code,
            coverage: await this.#coverage(tx, current),
            lines: statement.lines.map((l) => ({
              itemCode: l.itemCode,
              itemName: l.itemName,
              quantity: l.quantity,
              unitPriceCents: l.unitPriceCents,
              amountCents: l.amountCents,
              discountCents: l.discountCents,
              includedQuantity: l.includedQuantity,
              lineTotalCents: l.lineTotalCents,
            })),
            totals: {
              subtotalCents: statement.totals.subtotalCents,
              discountCents: statement.totals.discountCents,
              insuranceCents: statement.totals.insuranceCents,
              totalDueCents: statement.totals.totalDueCents,
              paidCents: statement.totals.paidCents,
              balanceCents: statement.totals.balanceCents,
              creditCents: statement.totals.creditCents,
              status: statement.totals.status,
            },
          },
          payments: activePayments(loaded.rows),
          linkedPaymentId: linked?.payment.id ?? null,
        };
        await this.#insert(tx, actor, { id, code, year, snapshot, locationId: site.id, patientId: current.patientId, encounterId: current.id, membershipFeeId: null, paymentId: linked?.payment.id ?? null, now });
        await this.#audit.inTx(tx, ctx.organizationId, {
          action: 'receipt.generated',
          ...base(actor, site.id, 'receipt', id, meta),
          metadata: {
            receiptCode: code,
            encounterCode: current.code,
            linkedPayment: linked !== null,
            totalDueCents: statement.totals.totalDueCents,
            paidCents: statement.totals.paidCents,
            balanceCents: statement.totals.balanceCents,
          },
        });
        // La tarjeta «Recibos» de quien tenga abierta la Caja de la visita.
        await notifyRealtime(tx, { t: 'event', org: ctx.organizationId, loc: current.locationId, name: 'billing.changed', ids: { encounter: current.id } });
        return { status: 201, resourceIds: [id] };
      },
      (ids) => this.#generated(actor, ids[0] ?? ''),
    );
    return result.body;
  }

  /** «Generar recibo» de una cuota de membresía pagada, vinculado a su pago. */
  async generateForFee(actor: Principal, feeId: string, raw: unknown, idempotencyKey: string, meta: RequestMeta): Promise<ReceiptGenerated> {
    const ctx = requireContext(actor);
    generateFeeReceiptSchema.parse(raw);
    const result = await this.#idempotency.run(
      ctx.organizationId,
      idempotencyKey,
      { method: 'POST', path: `/api/membership-fees/${feeId}/receipts`, body: raw },
      async (tx) => {
        const now = this.#clock.now();
        // Bloqueada: una anulación del pago a la vez no se cruza con el recibo.
        const [fee] = await tx.select().from(membershipFees).where(eq(membershipFees.id, feeId)).for('update');
        if (!fee) throw new HttpError(404, 'fee_not_found');
        const loaded = await loadPayments(tx, this.#cipher, { feeIds: [fee.id] });
        const payment = latestActive(loaded.rows);
        if (fee.status !== 'paid' || !payment) throw new HttpError(409, 'fee_not_paid');
        const [m] = await tx
          .select({ code: patientMemberships.code, holderPatientId: patientMemberships.holderPatientId, planNameEs: membershipPlans.nameEs, planNameEn: membershipPlans.nameEn })
          .from(patientMemberships)
          .innerJoin(membershipPlans, eq(membershipPlans.id, patientMemberships.planId))
          .where(eq(patientMemberships.id, fee.membershipId));
        if (!m) throw new HttpError(404, 'fee_not_found');
        const site = await this.#site(tx, ctx.locationId);
        const year = yearIn(now, site.timezone);
        const id = uuidv7();
        const code = await nextReceiptCode(tx, ctx.organizationId, site, year);
        const snapshot: ReceiptSnapshot = {
          ...(await this.#header(tx, actor, ctx.organizationId, site, m.holderPatientId, code, now)),
          target: {
            kind: 'membership_fee',
            membershipCode: m.code,
            planNameEs: m.planNameEs,
            planNameEn: m.planNameEn,
            feeKind: fee.kind as 'initial' | 'monthly',
            dueDate: fee.dueDate,
            periodStart: fee.periodStart,
            periodEnd: fee.periodEnd,
            amountCents: fee.amountCents,
          },
          payments: activePayments(loaded.rows),
          linkedPaymentId: payment.payment.id,
        };
        await this.#insert(tx, actor, { id, code, year, snapshot, locationId: site.id, patientId: m.holderPatientId, encounterId: null, membershipFeeId: fee.id, paymentId: payment.payment.id, now });
        await this.#audit.inTx(tx, ctx.organizationId, {
          action: 'receipt.generated',
          ...base(actor, site.id, 'receipt', id, meta),
          metadata: { receiptCode: code, membershipCode: m.code, feeKind: fee.kind, linkedPayment: true, amountCents: fee.amountCents },
        });
        return { status: 201, resourceIds: [id] };
      },
      (ids) => this.#generated(actor, ids[0] ?? ''),
    );
    return result.body;
  }

  // --- Ver e imprimir ---------------------------------------------------------------

  /** S-CAJ-15: el texto del recibo en el idioma elegido. Lectura auditada. */
  async view(actor: Principal, receiptId: string, language: ReceiptLanguage, meta: RequestMeta): Promise<ReceiptDocument> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const row = await this.#visible(tx, ctx.locationId, receiptId);
      const snapshot = await this.#snapshot(row);
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'receipt.view',
        ...base(actor, ctx.locationId, 'receipt', row.id, meta),
        metadata: { receiptCode: row.code, language },
      });
      return { id: row.id, code: row.code, language, text: renderReceipt(snapshot, language) };
    });
  }

  /**
   * S-CAJ-24 «Imprimir» / «Reimprimir»: primero la auditoría (y el límite de
   * 30 por minuto), después el texto. Si algo falla, la transacción se
   * deshace y no sale ningún texto que imprimir.
   */
  async print(actor: Principal, receiptId: string, raw: unknown, meta: RequestMeta): Promise<ReceiptDocument> {
    const ctx = requireContext(actor);
    const { language } = printReceiptSchema.parse(raw);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const now = this.#clock.now();
      const row = await this.#visible(tx, ctx.locationId, receiptId);
      const me = await myMembership(tx, actor.userId);
      // Las impresiones de una persona, de una en una: el conteo no se cruza.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`receipt_prints:${me}`}))`);
      const [recent] = await tx
        .select({ n: count() })
        .from(receiptPrints)
        .where(and(eq(receiptPrints.printedByMembershipId, me), gt(receiptPrints.printedAt, new Date(now.getTime() - PRINT_WINDOW_MS)), lte(receiptPrints.printedAt, now)));
      if ((recent?.n ?? 0) >= RECEIPT_PRINTS_PER_MINUTE) throw new HttpError(429, 'print_rate_limited');
      const [before] = await tx.select({ n: count() }).from(receiptPrints).where(eq(receiptPrints.receiptId, row.id));
      await tx.insert(receiptPrints).values({ organizationId: ctx.organizationId, locationId: ctx.locationId, receiptId: row.id, language, printedByMembershipId: me, printedAt: now });
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'receipt.printed',
        ...base(actor, ctx.locationId, 'receipt', row.id, meta),
        metadata: { receiptCode: row.code, language, reprint: (before?.n ?? 0) > 0 },
      });
      const snapshot = await this.#snapshot(row);
      return { id: row.id, code: row.code, language, text: renderReceipt(snapshot, language) };
    });
  }

  // --- Ayudas ------------------------------------------------------------------------

  async #list(tx: Tx, where: ReturnType<typeof eq>) {
    return tx
      .select({ receipt: receipts, userId: memberships.userId })
      .from(receipts)
      .innerJoin(memberships, eq(memberships.id, receipts.issuedByMembershipId))
      .where(where)
      .orderBy(desc(receipts.issuedAt), desc(receipts.code));
  }

  async #panel(
    actor: Principal,
    data: { rows: { receipt: ReceiptRow; userId: string }[]; payments: LoadedPayment[]; me: string; latest: LoadedPayment | null; blocked: ReceiptsPanel['blocked'] },
  ): Promise<ReceiptsPanel> {
    const names = await this.#names(data.rows.map((r) => r.userId));
    const linked = new Map(data.payments.map((p) => [p.payment.id, { method: p.payment.method as PaymentMethod, amountCents: p.payment.amountCents }]));
    const receiptsList: ReceiptListItem[] = data.rows.map(({ receipt, userId }) => ({
      id: receipt.id,
      code: receipt.code,
      issuedAt: receipt.issuedAt.toISOString(),
      issuedBy: receipt.issuedByMembershipId === data.me ? 'Usted' : (names.get(userId) ?? null),
      linkedPayment: receipt.paymentId ? (linked.get(receipt.paymentId) ?? null) : null,
    }));
    const canGenerate = actor.permissions.has('receipts.generate') && actor.permissions.has('patients.access') && data.blocked === null;
    return {
      receipts: receiptsList,
      canGenerate,
      canPrint: actor.permissions.has('receipts.print') && actor.permissions.has('patients.access'),
      blocked: data.blocked,
      latestPayment: data.latest ? { id: data.latest.payment.id, method: data.latest.payment.method as PaymentMethod, amountCents: data.latest.payment.amountCents } : null,
    };
  }

  /** El recibo, si quien mira puede verlo: el de una visita, en su sede; el de una cuota, en cualquiera. */
  async #visible(tx: Tx, locationId: string, receiptId: string): Promise<ReceiptRow> {
    const [row] = await tx.select().from(receipts).where(eq(receipts.id, receiptId));
    if (!row || (row.encounterId !== null && row.locationId !== locationId)) throw new HttpError(404, 'receipt_not_found');
    return row;
  }

  async #snapshot(row: ReceiptRow): Promise<ReceiptSnapshot> {
    const json = await this.#cipher.decrypt(row.snapshotEnc, snapshotContext(row.organizationId, row.id));
    return receiptSnapshotSchema.parse(JSON.parse(json));
  }

  async #insert(
    tx: Tx,
    actor: Principal,
    r: { id: string; code: string; year: number; snapshot: ReceiptSnapshot; locationId: string; patientId: string; encounterId: string | null; membershipFeeId: string | null; paymentId: string | null; now: Date },
  ): Promise<void> {
    const ctx = requireContext(actor);
    await tx.insert(receipts).values({
      id: r.id,
      organizationId: ctx.organizationId,
      locationId: r.locationId,
      patientId: r.patientId,
      encounterId: r.encounterId,
      membershipFeeId: r.membershipFeeId,
      paymentId: r.paymentId,
      code: r.code,
      year: r.year,
      snapshotEnc: await this.#cipher.encrypt(JSON.stringify(receiptSnapshotSchema.parse(r.snapshot)), snapshotContext(ctx.organizationId, r.id)),
      issuedByMembershipId: await myMembership(tx, actor.userId),
      issuedAt: r.now,
    });
  }

  /** Encabezado y paciente de la instantánea (decisiones del 2026-11-05: sin EIN, sin nacimiento ni teléfono del paciente). */
  async #header(tx: Tx, actor: Principal, organizationId: string, site: Site, patientId: string, code: string, now: Date) {
    const [org] = await tx.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId));
    const [patient] = await tx.select({ code: patients.code, firstName: patients.firstName, lastName: patients.lastName }).from(patients).where(eq(patients.id, patientId));
    if (!org || !patient) throw new HttpError(404, 'not_found');
    const issuedBy = (await this.#names([actor.userId])).get(actor.userId) ?? null;
    return {
      v: 1 as const,
      code,
      issuedAt: now.toISOString(),
      timeZone: site.timezone,
      clinic: { name: org.name },
      location: { code: site.code, name: site.name, address: site.address, phone: site.phone },
      issuedBy,
      patient,
    };
  }

  /** La cobertura de la visita: el tipo, el plan (membresía) o el tipo y la aseguradora (seguro). Nunca el número de miembro. */
  async #coverage(tx: Tx, current: LockedEncounter): Promise<ReceiptCoverageSnapshot | null> {
    const [row] = await tx
      .select({ id: coverages.id, type: coverages.type, term: coverages.term, coinsuranceBp: coverages.coinsuranceBp, insurerNameEnc: coverages.insurerNameEnc, patientMembershipId: coverages.patientMembershipId })
      .from(coverages)
      .where(eq(coverages.encounterId, current.id));
    if (!row) return null;
    if (row.type === 'insurance') {
      return {
        type: 'insurance',
        term: row.term as 'copay' | 'coinsurance' | 'deductible' | null,
        coinsuranceBp: row.coinsuranceBp,
        insurerName: row.insurerNameEnc ? await this.#cipher.decrypt(row.insurerNameEnc, insurerContext(current.organizationId, row.id)) : null,
      };
    }
    if (row.type === 'membership') {
      const [plan] = row.patientMembershipId
        ? await tx
            .select({ nameEs: membershipPlans.nameEs, nameEn: membershipPlans.nameEn })
            .from(patientMemberships)
            .innerJoin(membershipPlans, eq(membershipPlans.id, patientMemberships.planId))
            .where(eq(patientMemberships.id, row.patientMembershipId))
        : [];
      return { type: 'membership', planNameEs: plan?.nameEs ?? null, planNameEn: plan?.nameEn ?? null };
    }
    return { type: 'self_pay' };
  }

  async #site(tx: Tx, locationId: string): Promise<Site> {
    const [row] = await tx
      .select({ id: locations.id, code: locations.code, name: locations.name, address: locations.address, phone: locations.phone, timezone: locations.timezone })
      .from(locations)
      .where(eq(locations.id, locationId));
    if (!row) throw new HttpError(404, 'location_not_found');
    return row;
  }

  async #generated(actor: Principal, id: string): Promise<ReceiptGenerated> {
    const ctx = requireContext(actor);
    const [row] = await this.#tenantDb.withTenant(ctx.organizationId, (tx) => tx.select({ id: receipts.id, code: receipts.code }).from(receipts).where(eq(receipts.id, id)));
    if (!row) throw new HttpError(404, 'receipt_not_found');
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

interface Site {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  timezone: string;
}

/** Los pagos vigentes (sin anular), en el orden en que se registraron. */
function activePayments(rows: LoadedPayment[]): ReceiptSnapshot['payments'] {
  return rows
    .filter((r) => r.voided === null)
    .map((r) => ({ id: r.payment.id, method: r.payment.method as PaymentMethod, amountCents: r.payment.amountCents, referenceLast4: r.referenceLast4, recordedAt: r.payment.recordedAt.toISOString() }));
}

/** El último pago registrado y vigente (S-CAJ-14 «Vincular al último pago»). */
function latestActive(rows: LoadedPayment[]): LoadedPayment | null {
  return rows.filter((r) => r.voided === null).at(-1) ?? null;
}

/** El pago que se pidió vincular: de esta visita y sin anular. */
function linkedPayment(rows: LoadedPayment[], paymentId: string): LoadedPayment {
  const found = rows.find((r) => r.payment.id === paymentId);
  if (!found) throw new HttpError(404, 'payment_not_found');
  if (found.voided) throw new HttpError(409, 'payment_voided');
  return found;
}

/** El año en la zona de la sede (el del código del recibo). */
function yearIn(instant: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric' }).format(instant));
}

function base(actor: Principal, locationId: string, entityType: string, entityId: string, meta: RequestMeta) {
  return { actorType: 'user' as const, actorId: actor.userId, locationId, entityType, entityId, ...meta };
}
