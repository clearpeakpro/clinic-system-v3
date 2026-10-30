import { appointmentTypes, labTests, locations, procedures, referralSources, prices, type TenantDb, type Tx } from '@clinic/db';
import {
  CATALOG_KINDS,
  PRICED_KINDS,
  type CatalogItem,
  type CatalogKind,
  type CatalogList,
  type CatalogPrice,
  type CatalogPriceInput,
} from '@clinic/shared';
import { asc, eq, sql } from 'drizzle-orm';
import type { AuditService } from './audit.ts';
import type { Principal } from './principal.ts';
import { HttpError, requireContext, type RequestMeta } from './services.ts';

// Catálogo mínimo y precios por sede (T-011; S-ADM-13 a 20). Todo sobre la
// organización activa, bajo su RLS:
//  - el código es único en la organización e inmutable;
//  - se desactiva con motivo, nunca se borra; concurrencia optimista por versión;
//  - un precio nunca se modifica: cambiarlo es una fila nueva con su fecha de
//    vigencia (hoy o después, en la zona horaria de la sede);
//  - el precio vigente lo calcula siempre el servidor, para una sede y un día;
//  - cada cambio se audita en la misma transacción. Los catálogos no son datos
//    clínicos: en los precios se guardan el importe anterior y el nuevo.

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
  return Object.fromEntries(Object.entries(input).filter(([key]) => !['code', 'expectedVersion', 'price'].includes(key))) as Fields;
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
   */
  async list(actor: Principal, locationId: string, options: { activeOnly: boolean }): Promise<CatalogList> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const today = await this.#today(tx, locationId);
      const items = {} as CatalogList['items'];
      for (const kind of CATALOG_KINDS) {
        const table = TABLES[kind];
        const query = tx.select().from(table).orderBy(sql`${table.sortOrder} nulls last`, asc(table.code));
        const rows = options.activeOnly ? await query.where(eq(table.active, true)) : await query;
        items[kind] = rows.map((row) => toItem(kind, row as Record<string, unknown>));
      }
      for (const kind of PRICED_KINDS) {
        const column = kind === 'procedures' ? 'procedure_id' : 'lab_test_id';
        const current = await this.#prices(tx, column, locationId, today, 'current');
        const next = await this.#prices(tx, column, locationId, today, 'next');
        for (const item of items[kind]) item.price = { current: current.get(item.id) ?? null, next: next.get(item.id) ?? null };
      }
      return { locationId, today, items };
    });
  }

  /** S-ADM-19 «Crear». En procedimientos y pruebas, con el precio de la sede elegida. */
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
        const price = input.price as CatalogPriceInput | undefined;
        if (price) await this.#setPrice(tx, actor, kind, row.id, price, meta);
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
      const price = input.price as CatalogPriceInput | undefined;
      if (price) await this.#setPrice(tx, actor, kind, itemId, price, meta);
    });
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

  /** Precio vigente hoy (`current`) o el próximo programado (`next`) de cada ítem en la sede. */
  async #prices(tx: Tx, column: 'procedure_id' | 'lab_test_id', locationId: string, today: string, which: 'current' | 'next') {
    const item = sql.raw(`"${column}"`);
    const rows = await tx.execute<{ item_id: string; amount_cents: number; effective_from: string }>(sql`
      select distinct on (${item}) ${item} as item_id, amount_cents, effective_from::text as effective_from
        from app.prices
       where location_id = ${locationId} and ${item} is not null
         and ${which === 'current' ? sql`effective_from <= ${today}::date` : sql`effective_from > ${today}::date`}
       order by ${item}, effective_from ${which === 'current' ? sql`desc` : sql`asc`}, created_at desc, id desc`);
    return new Map<string, CatalogPrice>(rows.rows.map((r) => [r.item_id, { amountCents: r.amount_cents, effectiveFrom: r.effective_from }]));
  }

  /**
   * Precio nuevo: fila nueva, sin tocar las anteriores. Vigente desde hoy o
   * después en la sede, que debe estar activa. Se audita con el importe que
   * regía ese día antes del cambio y el nuevo.
   */
  async #setPrice(tx: Tx, actor: Principal, kind: CatalogKind, itemId: string, price: CatalogPriceInput, meta: RequestMeta): Promise<void> {
    const ctx = requireContext(actor);
    const [site] = await tx
      .select({ active: locations.active, today: sql<string>`((now() at time zone ${locations.timezone})::date)::text` })
      .from(locations)
      .where(eq(locations.id, price.locationId));
    if (!site) throw new HttpError(400, 'invalid_location');
    if (!site.active) throw new HttpError(400, 'location_inactive');
    if (price.effectiveFrom < site.today) throw new HttpError(400, 'effective_from_past');
    const column = kind === 'procedures' ? 'procedure_id' : 'lab_test_id';
    const before = (await this.#pricesOn(tx, column, itemId, price.locationId, price.effectiveFrom)) ?? null;
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
        priceLocationId: price.locationId,
        effectiveFrom: price.effectiveFrom,
        previousCents: before ?? 'none',
        newCents: price.amountCents,
      },
    });
  }

  /** Importe que rige un ítem en una sede en una fecha. */
  async #pricesOn(tx: Tx, column: 'procedure_id' | 'lab_test_id', itemId: string, locationId: string, date: string): Promise<number | undefined> {
    const item = sql.raw(`"${column}"`);
    const rows = await tx.execute<{ amount_cents: number }>(sql`
      select amount_cents from app.prices
       where location_id = ${locationId} and ${item} = ${itemId} and effective_from <= ${date}::date
       order by effective_from desc, created_at desc, id desc limit 1`);
    return rows.rows[0]?.amount_cents;
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
