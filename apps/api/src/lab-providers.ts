import { labProviders, type TenantDb } from '@clinic/db';
import type { CreateLabProviderInput, UpdateLabProviderInput } from '@clinic/shared';
import { eq, sql } from 'drizzle-orm';
import type { AuditService } from './audit.ts';
import type { Principal } from './principal.ts';
import { HttpError, requireContext, type RequestMeta } from './services.ts';

// Proveedores de laboratorio (T-011b, ADR 0028; S-ADM-17), sobre la
// organización activa y bajo su RLS. Nombre único en la organización, se
// desactivan con motivo y nunca se borran; concurrencia optimista por
// versión; cada cambio se audita en la misma transacción. La lista va con la
// de Catálogos (CatalogService.list), solo para quien tiene catalog.manage.

const UNIQUE_VIOLATION = '23505';

function pgCode(error: unknown): string | undefined {
  const cause = (error as { cause?: unknown }).cause ?? error;
  return (cause as { code?: string }).code;
}

export class LabProviderService {
  readonly #tenantDb: TenantDb;
  readonly #audit: AuditService;

  constructor(tenantDb: TenantDb, audit: AuditService) {
    this.#tenantDb = tenantDb;
    this.#audit = audit;
  }

  /** «Nuevo laboratorio». */
  async create(actor: Principal, input: CreateLabProviderInput, meta: RequestMeta): Promise<{ id: string }> {
    const ctx = requireContext(actor);
    try {
      return await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
        const [row] = await tx
          .insert(labProviders)
          .values({ organizationId: ctx.organizationId, name: input.name, preference: input.preference })
          .returning({ id: labProviders.id });
        if (!row) throw new Error('No se creó el laboratorio');
        await this.#audit.inTx(tx, ctx.organizationId, {
          action: 'lab_provider.created',
          actorType: 'user',
          actorId: actor.userId,
          locationId: ctx.locationId,
          entityType: 'lab_provider',
          entityId: row.id,
          ...meta,
          metadata: { preference: input.preference },
        });
        return { id: row.id };
      });
    } catch (error) {
      if (pgCode(error) === UNIQUE_VIOLATION) throw new HttpError(409, 'lab_provider_name_taken');
      throw error;
    }
  }

  /** «Guardar»: nombre y orden de preferencia. */
  async update(actor: Principal, providerId: string, input: UpdateLabProviderInput, meta: RequestMeta): Promise<void> {
    const ctx = requireContext(actor);
    try {
      await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
        const [current] = await tx.select().from(labProviders).where(eq(labProviders.id, providerId)).for('update');
        if (!current) throw new HttpError(404, 'lab_provider_not_found');
        if (current.version !== input.expectedVersion) throw new HttpError(409, 'version_conflict');
        const fields = (['name', 'preference'] as const).filter((key) => input[key] !== current[key]);
        if (fields.length === 0) return;
        await tx
          .update(labProviders)
          .set({ name: input.name, preference: input.preference, version: sql`${labProviders.version} + 1` })
          .where(eq(labProviders.id, providerId));
        await this.#audit.inTx(tx, ctx.organizationId, {
          action: 'lab_provider.updated',
          actorType: 'user',
          actorId: actor.userId,
          locationId: ctx.locationId,
          entityType: 'lab_provider',
          entityId: providerId,
          ...meta,
          metadata: { fields: fields.join(',') },
        });
      });
    } catch (error) {
      if (pgCode(error) === UNIQUE_VIOLATION) throw new HttpError(409, 'lab_provider_name_taken');
      throw error;
    }
  }

  /** «Desactivar» (con motivo) y «Reactivar». Un laboratorio inactivo no se sugiere ni se puede marcar. */
  async setActive(
    actor: Principal,
    providerId: string,
    active: boolean,
    input: { expectedVersion: number; reason?: string },
    meta: RequestMeta,
  ): Promise<void> {
    const ctx = requireContext(actor);
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [current] = await tx.select().from(labProviders).where(eq(labProviders.id, providerId)).for('update');
      if (!current) throw new HttpError(404, 'lab_provider_not_found');
      if (current.version !== input.expectedVersion) throw new HttpError(409, 'version_conflict');
      if (current.active === active) throw new HttpError(409, active ? 'lab_provider_already_active' : 'lab_provider_already_inactive');
      await tx
        .update(labProviders)
        .set({ active, version: sql`${labProviders.version} + 1` })
        .where(eq(labProviders.id, providerId));
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: active ? 'lab_provider.reactivated' : 'lab_provider.deactivated',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'lab_provider',
        entityId: providerId,
        ...(input.reason ? { reason: input.reason } : {}),
        ...meta,
      });
    });
  }
}
