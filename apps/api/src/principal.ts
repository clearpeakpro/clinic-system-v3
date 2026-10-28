import { createHash } from 'node:crypto';
import { membershipRoles, memberships, session as sessionTable, type TenantDb } from '@clinic/db';
import {
  isRole,
  MFA_REQUIRED_ROLES,
  ORG_WIDE_ROLES,
  permissionsFor,
  type Permission,
  type Role,
} from '@clinic/shared';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import type { Auth } from './auth.ts';
import type { AppConfig } from './config.ts';

export interface RoleAssignment {
  organizationId: string;
  locationId: string | null;
  role: Role;
}

export interface Principal {
  userId: string;
  sessionId: string;
  twoFactorEnabled: boolean;
  /** Roles activos en todas sus organizaciones (leídos con withUser). */
  assignments: RoleAssignment[];
  /** Contexto activo validado en esta petición; nulo si no eligió o ya no es válido. */
  context: { organizationId: string; locationId: string } | null;
  /** Permisos en el contexto activo: unión de sus roles en esa sede y de toda la organización. */
  permissions: Set<Permission>;
  mfaRequired: boolean;
}

export type Resolution =
  | { ok: true; principal: Principal | null; setCookies: string[] }
  | { ok: false; status: 401; code: string };

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Roles válidos de la persona en esa sede (o de toda la organización). */
export function rolesAt(assignments: RoleAssignment[], organizationId: string, locationId: string): Role[] {
  return assignments
    .filter(
      (a) =>
        a.organizationId === organizationId &&
        (a.locationId === locationId || (a.locationId === null && ORG_WIDE_ROLES.includes(a.role))),
    )
    .map((a) => a.role);
}

/** Todos sus roles en una organización, en cualquier sede (para la regla escalonada). */
export function rolesInOrganization(assignments: RoleAssignment[], organizationId: string): Role[] {
  return assignments.filter((a) => a.organizationId === organizationId).map((a) => a.role);
}

export class PrincipalResolver {
  readonly #auth: Auth;
  readonly #tenantDb: TenantDb;
  readonly #plain;
  readonly #config: AppConfig;

  constructor(auth: Auth, pool: pg.Pool, tenantDb: TenantDb, config: AppConfig) {
    this.#auth = auth;
    this.#tenantDb = tenantDb;
    this.#plain = drizzle({ client: pool });
    this.#config = config;
  }

  /**
   * Identifica a quien llama en cada petición. El contexto (organización y
   * sede) sale de la sesión validada y de memberships; los encabezados del
   * cliente se ignoran.
   */
  async resolve(headers: Headers, hasSessionCookie: boolean): Promise<Resolution> {
    if (!hasSessionCookie) return { ok: true, principal: null, setCookies: [] };

    // returnHeaders: al refrescar la sesión deslizante, Better Auth renueva la
    // cookie; la reenviamos en la respuesta.
    const { headers: authHeaders, response } = await this.#auth.api.getSession({
      headers,
      query: { disableCookieCache: true },
      returnHeaders: true,
    });
    if (!response) return { ok: false, status: 401, code: 'unauthenticated' };
    const { session, user } = response;

    if (user.disabledAt) {
      await this.revokeUserSessions(user.id);
      return { ok: false, status: 401, code: 'user_disabled' };
    }
    const absoluteLimit = new Date(session.createdAt).getTime() + this.#config.absoluteTimeoutSeconds * 1000;
    if (Date.now() >= absoluteLimit) {
      await this.#plain.delete(sessionTable).where(eq(sessionTable.id, session.id));
      return { ok: false, status: 401, code: 'session_expired' };
    }

    const assignments = await this.loadAssignments(user.id);
    const mfaRequired = assignments.some((a) => MFA_REQUIRED_ROLES.includes(a.role));

    let context: Principal['context'] = null;
    let roles: Role[] = [];
    const orgId = session.activeOrganizationId;
    const locationId = session.activeLocationId;
    if (orgId && locationId) {
      roles = rolesAt(assignments, orgId, locationId);
      if (roles.length > 0) context = { organizationId: orgId, locationId };
    }

    return {
      ok: true,
      principal: {
        userId: user.id,
        sessionId: session.id,
        twoFactorEnabled: user.twoFactorEnabled === true,
        assignments,
        context,
        permissions: permissionsFor(roles),
        mfaRequired,
      },
      setCookies: authHeaders.getSetCookie(),
    };
  }

  /** Roles activos de la persona en todas sus organizaciones (políticas own_*_read). */
  async loadAssignments(userId: string): Promise<RoleAssignment[]> {
    const rows = await this.#tenantDb.withUser(userId, (tx) =>
      tx
        .select({
          organizationId: membershipRoles.organizationId,
          locationId: membershipRoles.locationId,
          role: membershipRoles.role,
        })
        .from(membershipRoles)
        .innerJoin(
          memberships,
          and(
            eq(memberships.organizationId, membershipRoles.organizationId),
            eq(memberships.id, membershipRoles.membershipId),
          ),
        )
        .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active'))),
    );
    return rows.flatMap((r) => (isRole(r.role) ? [{ ...r, role: r.role }] : []));
  }

  async revokeUserSessions(userId: string): Promise<void> {
    await this.#plain.delete(sessionTable).where(eq(sessionTable.userId, userId));
  }

  /** Borra las sesiones de la persona cuyo contexto activo es esa organización. */
  async revokeOrganizationSessions(userId: string, organizationId: string): Promise<void> {
    await this.#plain
      .delete(sessionTable)
      .where(and(eq(sessionTable.userId, userId), eq(sessionTable.activeOrganizationId, organizationId)));
  }
}
