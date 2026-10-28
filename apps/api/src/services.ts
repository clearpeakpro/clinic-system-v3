import { locations, organizations, session as sessionTable, type TenantDb } from '@clinic/db';
import { ORG_WIDE_ROLES } from '@clinic/shared';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import { rolesAt, type Principal } from './principal.ts';

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

/** Datos de la petición que van a la auditoría. */
export interface RequestMeta {
  ip: string | null;
  requestId: string;
}

export function requireContext(principal: Principal) {
  if (!principal.context) throw new HttpError(403, 'no_active_context');
  return principal.context;
}

export interface LocationChoice {
  organizationId: string;
  organizationName: string;
  locations: { id: string; code: string; name: string; timezone: string; address: string | null }[];
}

export class ContextService {
  readonly #plain;
  readonly #tenantDb: TenantDb;

  constructor(pool: pg.Pool, tenantDb: TenantDb) {
    this.#plain = drizzle({ client: pool });
    this.#tenantDb = tenantDb;
  }

  /** Cambia organización y sede activas tras validar membresía y rol en esa sede. */
  async select(principal: Principal, organizationId: string, locationId: string): Promise<void> {
    if (rolesAt(principal.assignments, organizationId, locationId).length === 0) {
      throw new HttpError(403, 'not_a_member');
    }
    await this.#plain
      .update(sessionTable)
      .set({ activeOrganizationId: organizationId, activeLocationId: locationId })
      .where(eq(sessionTable.id, principal.sessionId));
  }

  /** Organizaciones y sedes que la persona puede elegir (selector de sede, T-004). */
  async choices(principal: Principal): Promise<LocationChoice[]> {
    const orgIds = [...new Set(principal.assignments.map((a) => a.organizationId))].sort();
    const result: LocationChoice[] = [];
    for (const organizationId of orgIds) {
      const orgWide = principal.assignments.some(
        (a) => a.organizationId === organizationId && a.locationId === null && ORG_WIDE_ROLES.includes(a.role),
      );
      const ids = principal.assignments
        .filter((a) => a.organizationId === organizationId && a.locationId !== null)
        .map((a) => a.locationId as string);
      const choice = await this.#tenantDb.withTenant(organizationId, async (tx) => {
        const [org] = await tx.select({ name: organizations.name }).from(organizations);
        const rows = await tx
          .select({
            id: locations.id,
            code: locations.code,
            name: locations.name,
            timezone: locations.timezone,
            address: locations.address,
          })
          .from(locations)
          // Con un rol de toda la organización, todas sus sedes; si no, solo
          // las de sus roles (la base de datos impide roles clínicos sin sede).
          .where(orgWide ? undefined : inArray(locations.id, ids))
          .orderBy(locations.code);
        return { organizationId, organizationName: org?.name ?? '', locations: rows };
      });
      result.push(choice);
    }
    return result;
  }
}

