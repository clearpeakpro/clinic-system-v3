import { appointmentTypes, labProviders, labTestCosts, labTests, locations, procedures, referralSources, prices, type TenantDb, type Tx } from '@clinic/db';
import {
  CATALOG_KINDS,
  compareLabProviders,
  PRICED_KINDS,
  type CatalogItem,
  type CatalogKind,
  type CatalogList,
  type CatalogPrice,
  type GeneralPriceInput,
  type LabCost,
  type LabCostChange,
  type LabTestLab,
  type LocationPriceInput,
  type PriceTimeline,
  type UseGeneralPriceInput,
} from '@clinic/shared';
import { asc, eq, sql } from 'drizzle-orm';
import type { AuditService } from './audit.ts';
import type { Principal } from './principal.ts';
import { HttpError, requireContext, type RequestMeta } from './services.ts';

// Catálogo mínimo y precios por sede (T-011; S-ADM-13 a 20). Todo sobre la
// organización activa, bajo su RLS:
//  - el código es único en la organización e inmutable;
//  - se desactiva con motivo, nunca se borra; concurrencia optimista por versión;
//  - el precio de venta es general (toda la organización) con excepción
//    opcional por sede; en una sede rige el propio si hay uno vigente y, si
//    no, el general;
//  - un precio nunca se modifica: cambiarlo es una fila nueva con su fecha de
//    vigencia (hoy o después);
//  - el precio vigente lo calcula siempre el servidor, para una sede y un día;
//  - cada cambio se audita en la misma transacción. Los catálogos no son datos
//    clínicos: en los precios se guardan el importe anterior y el nuevo.
// T-011b (ADR 0028): en las pruebas, «Laboratorios que la realizan» con el
// costo para la clínica en cada laboratorio. Como los precios, un costo es
// una fila nueva con su vigencia; desmarcar es una fila sin importe. Los
// costos solo salen en la lista de Administración (`withLabCosts`).

const TABLES = {
  'appointment-types': appointmentTypes,
  procedures,
  'lab-tests': labTests,
  'referral-sources': referralSources,
} as const;

/** Nombre de la entidad en la auditoría. */
const ENTITY: Record<CatalogKind, string> = {
  'appointment-types': 'appointment_type',
  procedures: 'procedure',
  'lab-tests': 'lab_test',
  'referral-sources': 'referral_source',
};

const UNIQUE_VIOLATION = '23505';

type Fields = Record<string, unknown> & { name: string; sortOrder: number | null };

function pgCode(error: unknown): string | undefined {
  const cause = (error as { cause?: unknown }).cause ?? error;
  return (cause as { code?: string }).code;
}

/** Campos propios de cada catálogo, en la forma de la API. */
function toItem(kind: CatalogKind, row: Record<string, unknown>): CatalogItem {
  const item: CatalogItem = {
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    sortOrder: row.sortOrder as number | null,
    active: row.active as boolean,
    version: row.version as number,
  };
  if (kind === 'appointment-types') {
    item.defaultDurationMinutes = row.defaultDurationMinutes as number | null;
    item.suggestedRoute = row.suggestedRoute as NonNullable<CatalogItem['suggestedRoute']> | null;
    item.color = row.color as NonNullable<CatalogItem['color']>;
  }
  if (kind === 'procedures') item.kind = row.kind as NonNullable<CatalogItem['kind']>;
  return item;
}

/** Los campos editables que llegan validados (sin código, versión ni precio). */
function editable(input: Record<string, unknown>): Fields {
  const excluded = ['code', 'expectedVersion', 'generalPrice', 'locationPrice', 'labCosts'];
  return Object.fromEntries(Object.entries(input).filter(([key]) => !excluded.includes(key))) as Fields;
}

export class CatalogService {
  readonly #tenantDb: TenantDb;
  readonly #audit: AuditService;

  constructor(tenantDb: TenantDb, audit: AuditService) {
    this.#tenantDb = tenantDb;
    this.#audit = audit;
  }

  /**
   * S-ADM-13 a 18: los cuatro catálogos de la organización, con los precios
   * en la sede elegida. `activeOnly`: lo que usa el resto del personal.
   * `withLabCosts` (solo Administración, catalog.manage): los laboratorios y,
   * en cada prueba, sus costos (ADR 0028). Nunca para el resto del personal.
   */
  async list(actor: Principal, locationId: string, options: { activeOnly: boolean; withLabCosts: boolean }): Promise<CatalogList> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const today = await this.#today(tx, locationId);
      const generalToday = await this.#generalToday(tx);
      const items = {} as CatalogList['items'];
      for (const kind of CATALOG_KINDS) {
        const table = TABLES[kind];
        const query = tx.select().from(table).orderBy(sql`${table.sortOrder} nulls last`, asc(table.code));
        const rows = options.activeOnly ? await query.where(eq(table.active, true)) : await query;
        items[kind] = rows.map((row) => toItem(kind, row as Record<string, unknown>));
      }
      for (const kind of PRICED_KINDS) {
        const column = kind === 'procedures' ? 'procedure_id' : 'lab_test_id';
        const timeline = async (scope: string | null) => {
          const current = await this.#prices(tx, column, scope, today, 'current');
          const next = await this.#prices(tx, column, scope, today, 'next');
          return (id: string): PriceTimeline => ({ current: current.get(id) ?? null, next: next.get(id) ?? null });
        };
        const general = await timeline(null);
        const own = await timeline(locationId);
        for (const item of items[kind]) {
          const g = general(item.id);
          const l = own(item.id);
          // Sin importe, la sede «Usa el precio general» (P-15).
          item.price = { general: g, location: l, effective: l.current && l.current.amountCents !== null ? l.current : g.current };
        }
      }
      if (!options.withLabCosts) return { locationId, today, generalToday, items };
      const providers = (await tx.select().from(labProviders)).sort(compareLabProviders);
      const labs = await this.#labTimelines(tx, today);
      for (const item of items['lab-tests']) item.labs = labs.get(item.id) ?? [];
      return {
        locationId,
        today,
        generalToday,
        items,
        labProviders: providers.map((p) => ({ id: p.id, name: p.name, preference: p.preference, active: p.active, version: p.version })),
      };
    });
  }

  /** Por prueba, los laboratorios con algún costo: el que rige `today` y el próximo programado. */
  async #labTimelines(tx: Tx, today: string): Promise<Map<string, LabTestLab[]>> {
    const query = (which: 'current' | 'next') =>
      tx.execute<{ lab_test_id: string; lab_provider_id: string; amount_cents: number | null; effective_from: string }>(sql`
        select distinct on (lab_test_id, lab_provider_id) lab_test_id, lab_provider_id, amount_cents, effective_from::text as effective_from
          from app.lab_test_costs
         where ${which === 'current' ? sql`effective_from <= ${today}::date` : sql`effective_from > ${today}::date`}
         order by lab_test_id, lab_provider_id, effective_from ${which === 'current' ? sql`desc` : sql`asc`}, created_at desc, id desc`);
    const byTest = new Map<string, Map<string, LabTestLab>>();
    const entry = (testId: string, providerId: string) => {
      const labs = byTest.get(testId) ?? new Map<string, LabTestLab>();
      byTest.set(testId, labs);
      const lab = labs.get(providerId) ?? { labProviderId: providerId, current: null, next: null };
      labs.set(providerId, lab);
      return lab;
    };
    const cost = (r: { amount_cents: number | null; effective_from: string }): LabCost => ({ amountCents: r.amount_cents, effectiveFrom: r.effective_from });
    for (const r of (await query('current')).rows) entry(r.lab_test_id, r.lab_provider_id).current = cost(r);
    for (const r of (await query('next')).rows) entry(r.lab_test_id, r.lab_provider_id).next = cost(r);
    return new Map([...byTest].map(([testId, labs]) => [testId, [...labs.values()]]));
  }

  /** S-ADM-19 «Crear». En procedimientos y pruebas, con el precio general y, si se da, el de una sede. */
  async create(actor: Principal, kind: CatalogKind, input: Record<string, unknown>, meta: RequestMeta): Promise<{ id: string }> {
    const ctx = requireContext(actor);
    const table = TABLES[kind];
    try {
      return await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
        const [row] = await tx
          .insert(table)
          .values({ ...editable(input), code: input.code as string, organizationId: ctx.organizationId } as typeof table.$inferInsert)
          .returning({ id: table.id });
        if (!row) throw new Error('No se creó el ítem');
        await this.#audit.inTx(tx, ctx.organizationId, {
          action: 'catalog.created',
          actorType: 'user',
          actorId: actor.userId,
          locationId: ctx.locationId,
          entityType: ENTITY[kind],
          entityId: row.id,
          ...meta,
          metadata: { code: input.code as string },
        });
        await this.#setPrices(tx, actor, kind, row.id, input, meta);
        await this.#setLabCosts(tx, actor, row.id, input, meta);
        return { id: row.id };
      });
    } catch (error) {
      if (pgCode(error) === UNIQUE_VIOLATION) throw new HttpError(409, 'catalog_code_taken');
      throw error;
    }
  }

  /** S-ADM-19 «Guardar». El código no cambia; un precio nuevo es una fila nueva. */
  async update(actor: Principal, kind: CatalogKind, itemId: string, input: Record<string, unknown>, meta: RequestMeta): Promise<void> {
    const ctx = requireContext(actor);
    const table = TABLES[kind];
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const current = await this.#load(tx, kind, itemId, input.expectedVersion as number);
      const next = editable(input);
      const fields = Object.keys(next).filter((key) => next[key] !== current[key]);
      if (fields.length > 0) {
        await tx
          .update(table)
          // Los campos ya llegan validados por el esquema de su catálogo.
          .set({ ...next, version: sql`${table.version} + 1` })
          .where(eq(table.id, itemId));
        await this.#audit.inTx(tx, ctx.organizationId, {
          action: 'catalog.updated',
          actorType: 'user',
          actorId: actor.userId,
          locationId: ctx.locationId,
          entityType: ENTITY[kind],
          entityId: itemId,
          ...meta,
          metadata: { fields: fields.join(',') },
        });
      }
      await this.#setPrices(tx, actor, kind, itemId, input, meta);
      await this.#setLabCosts(tx, actor, itemId, input, meta);
    });
  }

  /**
   * «Laboratorios que la realizan» (ADR 0028), en la misma transacción que la
   * prueba: marcar un laboratorio activo o cambiar su costo, o desmarcarlo
   * («No la realiza desde»). Cada cambio es una fila nueva, desde hoy o
   * después en la sede más adelantada (como el precio general), y se audita
   * con el costo que regía ese día y el nuevo. Desmarcar exige que el
   * laboratorio la haya hecho alguna vez.
   */
  async #setLabCosts(tx: Tx, actor: Principal, labTestId: string, input: Record<string, unknown>, meta: RequestMeta): Promise<void> {
    const changes = input.labCosts as LabCostChange[] | undefined;
    if (!changes || changes.length === 0) return;
    const ctx = requireContext(actor);
    const minimum = await this.#generalToday(tx);
    for (const change of changes) {
      if (change.effectiveFrom < minimum) throw new HttpError(400, 'effective_from_past');
      const [provider] = await tx.select({ active: labProviders.active }).from(labProviders).where(eq(labProviders.id, change.labProviderId));
      if (!provider) throw new HttpError(400, 'invalid_lab_provider');
      if (change.amountCents !== null && !provider.active) throw new HttpError(400, 'lab_provider_inactive');
      const history = await tx.execute<{ amount_cents: number | null; effective_from: string }>(sql`
        select amount_cents, effective_from::text as effective_from from app.lab_test_costs
         where lab_test_id = ${labTestId} and lab_provider_id = ${change.labProviderId}
         order by effective_from desc, created_at desc, id desc`);
      if (change.amountCents === null && !history.rows.some((r) => r.amount_cents !== null)) throw new HttpError(409, 'lab_not_assigned');
      // El costo que regía ese día antes del cambio (nulo o sin fila: no la hacía).
      const before = history.rows.find((r) => r.effective_from <= change.effectiveFrom)?.amount_cents ?? null;
      await tx.insert(labTestCosts).values({
        organizationId: ctx.organizationId,
        labTestId,
        labProviderId: change.labProviderId,
        amountCents: change.amountCents,
        effectiveFrom: change.effectiveFrom,
      });
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: change.amountCents === null ? 'catalog.lab_unassigned' : before === null ? 'catalog.lab_assigned' : 'catalog.lab_cost_set',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'lab_test',
        entityId: labTestId,
        ...meta,
        // Datos financieros, no clínicos: costo anterior y nuevo (ADR 0018).
        metadata: {
          labProviderId: change.labProviderId,
          effectiveFrom: change.effectiveFrom,
          previousCents: before ?? 'none',
          newCents: change.amountCents ?? 'none',
        },
      });
    }
  }

  /** S-ADM-20 «Desactivar» (con motivo) y «Reactivar». */
  async setActive(
    actor: Principal,
    kind: CatalogKind,
    itemId: string,
    active: boolean,
    input: { expectedVersion: number; reason?: string },
    meta: RequestMeta,
  ): Promise<void> {
    const ctx = requireContext(actor);
    const table = TABLES[kind];
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const current = await this.#load(tx, kind, itemId, input.expectedVersion);
      if (current.active === active) throw new HttpError(409, active ? 'catalog_item_already_active' : 'catalog_item_already_inactive');
      await tx
        .update(table)
        .set({ active, version: sql`${table.version} + 1` })
        .where(eq(table.id, itemId));
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: active ? 'catalog.reactivated' : 'catalog.deactivated',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: ENTITY[kind],
        entityId: itemId,
        ...(input.reason ? { reason: input.reason } : {}),
        ...meta,
      });
    });
  }

  /** Hoy en la sede (`AAAA-MM-DD`). La sede debe ser de la organización (RLS). */
  async #today(tx: Tx, locationId: string): Promise<string> {
    const [row] = await tx
      .select({ today: sql<string>`((now() at time zone ${locations.timezone})::date)::text` })
      .from(locations)
      .where(eq(locations.id, locationId));
    if (!row) throw new HttpError(400, 'invalid_location');
    return row.today;
  }

  /** El día más adelantado entre las sedes activas: un precio general no puede cambiar el pasado de ninguna. */
  async #generalToday(tx: Tx): Promise<string> {
    const [row] = await tx
      .select({ today: sql<string>`(max((now() at time zone ${locations.timezone})::date))::text` })
      .from(locations)
      .where(eq(locations.active, true));
    if (!row?.today) throw new HttpError(409, 'no_active_location');
    return row.today;
  }

  /**
   * Por ítem, el precio que rige `today` (`current`) o el próximo programado
   * (`next`): los generales (`scope` nulo) o los propios de una sede.
   */
  async #prices(tx: Tx, column: 'procedure_id' | 'lab_test_id', scope: string | null, today: string, which: 'current' | 'next') {
    const item = sql.raw(`"${column}"`);
    const rows = await tx.execute<{ item_id: string; amount_cents: number | null; effective_from: string }>(sql`
      select distinct on (${item}) ${item} as item_id, amount_cents, effective_from::text as effective_from
        from app.prices
       where ${scope === null ? sql`location_id is null` : sql`location_id = ${scope}`} and ${item} is not null
         and ${which === 'current' ? sql`effective_from <= ${today}::date` : sql`effective_from > ${today}::date`}
       order by ${item}, effective_from ${which === 'current' ? sql`desc` : sql`asc`}, created_at desc, id desc`);
    return new Map<string, CatalogPrice>(rows.rows.map((r) => [r.item_id, { amountCents: r.amount_cents, effectiveFrom: r.effective_from }]));
  }

  /** Los precios que trae «Crear» o «Guardar»: el general y, si se da, el de una sede. */
  async #setPrices(tx: Tx, actor: Principal, kind: CatalogKind, itemId: string, input: Record<string, unknown>, meta: RequestMeta): Promise<void> {
    const general = input.generalPrice as GeneralPriceInput | undefined;
    const location = input.locationPrice as LocationPriceInput | undefined;
    if (general) await this.#setPrice(tx, actor, kind, itemId, { ...general, locationId: null }, meta);
    if (location) await this.#setPrice(tx, actor, kind, itemId, location, meta);
  }

  /**
   * Precio nuevo, general (`locationId` nulo) o de una sede activa: fila nueva,
   * sin tocar las anteriores, vigente desde hoy o después (el general, desde
   * el día más adelantado de las sedes activas). Se audita con el importe que
   * regía ese día antes del cambio y el nuevo.
   */
  async #setPrice(
    tx: Tx,
    actor: Principal,
    kind: CatalogKind,
    itemId: string,
    price: { locationId: string | null; amountCents: number; effectiveFrom: string },
    meta: RequestMeta,
  ): Promise<void> {
    const ctx = requireContext(actor);
    let minimum: string;
    if (price.locationId === null) {
      minimum = await this.#generalToday(tx);
    } else {
      const [site] = await tx
        .select({ active: locations.active, today: sql<string>`((now() at time zone ${locations.timezone})::date)::text` })
        .from(locations)
        .where(eq(locations.id, price.locationId));
      if (!site) throw new HttpError(400, 'invalid_location');
      if (!site.active) throw new HttpError(400, 'location_inactive');
      minimum = site.today;
    }
    if (price.effectiveFrom < minimum) throw new HttpError(400, 'effective_from_past');
    const column = kind === 'procedures' ? 'procedure_id' : 'lab_test_id';
    const before = await this.#priceOn(tx, column, itemId, price.locationId, price.effectiveFrom);
    await tx.insert(prices).values({
      organizationId: ctx.organizationId,
      locationId: price.locationId,
      ...(kind === 'procedures' ? { procedureId: itemId } : { labTestId: itemId }),
      amountCents: price.amountCents,
      effectiveFrom: price.effectiveFrom,
    });
    await this.#audit.inTx(tx, ctx.organizationId, {
      action: 'catalog.price_set',
      actorType: 'user',
      actorId: actor.userId,
      locationId: ctx.locationId,
      entityType: ENTITY[kind],
      entityId: itemId,
      ...meta,
      // Datos financieros, no clínicos: importe anterior y nuevo (ADR 0018).
      metadata: {
        priceLocationId: price.locationId ?? 'general',
        effectiveFrom: price.effectiveFrom,
        previousCents: before ?? 'none',
        newCents: price.amountCents,
      },
    });
  }

  /**
   * Importe que rige un ítem en una fecha: el general (`locationId` nulo) o,
   * en una sede, su propio precio si la última fila de la sede tiene importe;
   * si no tiene o es «Usa el precio general», el general.
   */
  async #priceOn(tx: Tx, column: 'procedure_id' | 'lab_test_id', itemId: string, locationId: string | null, date: string): Promise<number | undefined> {
    const item = sql.raw(`"${column}"`);
    const scopes = locationId === null ? [null] : [locationId, null];
    for (const scope of scopes) {
      const rows = await tx.execute<{ amount_cents: number | null }>(sql`
        select amount_cents from app.prices
         where ${scope === null ? sql`location_id is null` : sql`location_id = ${scope}`} and ${item} = ${itemId} and effective_from <= ${date}::date
         order by effective_from desc, created_at desc, id desc limit 1`);
      const amount = rows.rows[0]?.amount_cents;
      if (amount !== undefined && amount !== null) return amount;
    }
    return undefined;
  }

  /**
   * «Volver al precio general» (P-15, ADR 0029): una fila de la sede sin
   * importe, desde hoy o después en la sede, que no borra ni modifica nada.
   * Solo si la sede tiene algún precio propio.
   */
  async useGeneralPrice(actor: Principal, kind: CatalogKind, itemId: string, input: UseGeneralPriceInput, meta: RequestMeta): Promise<void> {
    const ctx = requireContext(actor);
    const table = TABLES[kind];
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [exists] = await tx.select({ id: table.id }).from(table).where(eq(table.id, itemId));
      if (!exists) throw new HttpError(404, 'catalog_item_not_found');
      const [site] = await tx
        .select({ active: locations.active, today: sql<string>`((now() at time zone ${locations.timezone})::date)::text` })
        .from(locations)
        .where(eq(locations.id, input.locationId));
      if (!site) throw new HttpError(400, 'invalid_location');
      if (!site.active) throw new HttpError(400, 'location_inactive');
      if (input.effectiveFrom < site.today) throw new HttpError(400, 'effective_from_past');
      const column = kind === 'procedures' ? 'procedure_id' : 'lab_test_id';
      const item = sql.raw(`"${column}"`);
      const own = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from app.prices
         where location_id = ${input.locationId} and ${item} = ${itemId} and amount_cents is not null`);
      if ((own.rows[0]?.n ?? 0) === 0) throw new HttpError(409, 'no_location_price');
      const before = await this.#priceOn(tx, column, itemId, input.locationId, input.effectiveFrom);
      await tx.insert(prices).values({
        organizationId: ctx.organizationId,
        locationId: input.locationId,
        ...(kind === 'procedures' ? { procedureId: itemId } : { labTestId: itemId }),
        amountCents: null,
        effectiveFrom: input.effectiveFrom,
      });
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'catalog.price_use_general',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: ENTITY[kind],
        entityId: itemId,
        ...meta,
        metadata: { priceLocationId: input.locationId, effectiveFrom: input.effectiveFrom, previousCents: before ?? 'none' },
      });
    });
  }

  /** Bloquea la fila y comprueba la versión (409 version_conflict). */
  async #load(tx: Tx, kind: CatalogKind, itemId: string, expectedVersion: number): Promise<Record<string, unknown>> {
    const table = TABLES[kind];
    const [row] = await tx.select().from(table).where(eq(table.id, itemId)).for('update');
    if (!row) throw new HttpError(404, 'catalog_item_not_found');
    if (row.version !== expectedVersion) throw new HttpError(409, 'version_conflict');
    return row;
  }
}
