import { locations, notifyRealtime, type TenantDb, type Tx } from '@clinic/db';
import type { CreateLocationInput, UpdateLocationInput } from '@clinic/shared';
import { and, eq, ne, sql } from 'drizzle-orm';
import type { AuditService } from './audit.ts';
import type { Principal } from './principal.ts';
import { HttpError, requireContext, type RequestMeta } from './services.ts';

// Administración › Sedes (S-ADM-10 a 12, T-007). Todo sobre la organización
// activa de quien actúa, bajo su RLS:
//  - el código es único en la organización e inmutable (va en las URL);
//  - las sedes se desactivan, nunca se borran; no se desactiva la única
//    activa (si no, nadie de la organización podría entrar);
//  - concurrencia optimista por la versión de la sede;
//  - cada cambio se audita en la misma transacción (solo nombres de campos).

export interface LocationRow {
  id: string;
  code: string;
  name: string;
  timezone: string;
  address: string | null;
  phone: string | null;
  active: boolean;
  version: number;
}

const UNIQUE_VIOLATION = '23505';

export class LocationService {
  readonly #tenantDb: TenantDb;
  readonly #audit: AuditService;

  constructor(tenantDb: TenantDb, audit: AuditService) {
    this.#tenantDb = tenantDb;
    this.#audit = audit;
  }

  /** S-ADM-10: todas las sedes, también las inactivas. */
  async list(actor: Principal): Promise<LocationRow[]> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, (tx) =>
      tx
        .select({
          id: locations.id,
          code: locations.code,
          name: locations.name,
          timezone: locations.timezone,
          address: locations.address,
          phone: locations.phone,
          active: locations.active,
          version: locations.version,
        })
        .from(locations)
        .orderBy(locations.code),
    );
  }

  /** S-ADM-11 «Crear». */
  async create(actor: Principal, input: CreateLocationInput, meta: RequestMeta): Promise<{ id: string }> {
    const ctx = requireContext(actor);
    try {
      return await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
        const [row] = await tx
          .insert(locations)
          .values({
            organizationId: ctx.organizationId,
            code: input.code,
            name: input.name,
            timezone: input.timezone,
            address: input.address,
            phone: input.phone,
          })
          .returning({ id: locations.id });
        if (!row) throw new Error('No se creó la sede');
        await this.#audit.inTx(tx, ctx.organizationId, {
          action: 'location.created',
          actorType: 'user',
          actorId: actor.userId,
          locationId: ctx.locationId,
          entityType: 'location',
          entityId: row.id,
          ...meta,
          metadata: { code: input.code },
        });
        return { id: row.id };
      });
    } catch (error) {
      if (pgCode(error) === UNIQUE_VIOLATION) throw new HttpError(409, 'location_code_taken');
      throw error;
    }
  }

  /** S-ADM-11 «Guardar». El código no cambia. */
  async update(actor: Principal, locationId: string, input: UpdateLocationInput, meta: RequestMeta): Promise<void> {
    const ctx = requireContext(actor);
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const current = await this.#load(tx, locationId, input.expectedVersion);
      const next = { name: input.name, timezone: input.timezone, address: input.address, phone: input.phone };
      const fields = (Object.keys(next) as (keyof typeof next)[]).filter((key) => next[key] !== current[key]);
      await tx
        .update(locations)
        .set({ ...next, version: sql`${locations.version} + 1` })
        .where(eq(locations.id, locationId));
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'location.updated',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'location',
        entityId: locationId,
        ...meta,
        // Solo los nombres de los campos que cambian (ADR 0018).
        metadata: { fields: fields.join(',') },
      });
    });
  }

  /** S-ADM-10 «Desactivar» / «Activar». */
  async setActive(actor: Principal, locationId: string, active: boolean, expectedVersion: number, meta: RequestMeta): Promise<void> {
    const ctx = requireContext(actor);
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const current = await this.#load(tx, locationId, expectedVersion);
      if (current.active === active) throw new HttpError(409, active ? 'location_already_active' : 'location_already_inactive');
      if (!active) {
        // Bloquea las demás sedes activas: dos desactivaciones a la vez no
        // pueden dejar la organización sin ninguna.
        const others = await tx
          .select({ id: locations.id })
          .from(locations)
          .where(and(eq(locations.active, true), ne(locations.id, locationId)))
          .for('update');
        if (others.length === 0) throw new HttpError(409, 'last_active_location');
      }
      await tx
        .update(locations)
        .set({ active, version: sql`${locations.version} + 1` })
        .where(eq(locations.id, locationId));
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: active ? 'location.activated' : 'location.deactivated',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'location',
        entityId: locationId,
        ...meta,
      });
      // Quien trabajaba en ella pierde el contexto: sus sockets se cierran ya (T-009).
      if (!active) await notifyRealtime(tx, { t: 'revalidate', org: ctx.organizationId });
    });
  }

  /** Bloquea la fila y comprueba la versión (409 version_conflict). */
  async #load(tx: Tx, locationId: string, expectedVersion: number) {
    const [row] = await tx
      .select({
        name: locations.name,
        timezone: locations.timezone,
        address: locations.address,
        phone: locations.phone,
        active: locations.active,
        version: locations.version,
      })
      .from(locations)
      .where(eq(locations.id, locationId))
      .for('update');
    if (!row) throw new HttpError(404, 'location_not_found');
    if (row.version !== expectedVersion) throw new HttpError(409, 'version_conflict');
    return row;
  }
}

function pgCode(error: unknown): string | undefined {
  const cause = (error as { cause?: unknown }).cause ?? error;
  return (cause as { code?: string }).code;
}
