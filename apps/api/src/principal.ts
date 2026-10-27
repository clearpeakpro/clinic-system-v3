import { createHash, timingSafeEqual } from 'node:crypto';
import {
  kioskDevices,
  membershipRoles,
  memberships,
  session as sessionTable,
  type TenantDb,
} from '@clinic/db';
import {
  isRole,
  KIOSK_PERMISSIONS,
  MFA_REQUIRED_ROLES,
  ORG_WIDE_ROLES,
  permissionsFor,
  type Permission,
  type Role,
} from '@clinic/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import type { Auth } from './auth.ts';
import type { AppConfig } from './config.ts';

export const KIOSK_COOKIE = 'clinic_kiosk';

export interface RoleAssignment {
  organizationId: string;
  locationId: string | null;
  role: Role;
}

export interface PersonPrincipal {
  kind: 'person';
  userId: string;
  sessionId: string;
  twoFactorEnabled: boolean;
  /** Roles activos en todas sus organizaciones (leídos con withUser). */
  assignments: RoleAssignment[];
  /** Contexto activo validado; nulo si no eligió o ya no es válido. */
  context: { organizationId: string; locationId: string } | null;
  permissions: Set<Permission>;
  mfaRequired: boolean;
}

export interface KioskPrincipal {
  kind: 'kiosk';
  deviceId: string;
  context: { organizationId: string; locationId: string };
  permissions: Set<Permission>;
}

export type Principal = PersonPrincipal | KioskPrincipal;

export type Resolution =
  | { ok: true; principal: Principal | null; setCookies?: string[] }
  | { ok: false; status: 401 | 403; code: string };

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ¿Tiene la persona algún rol válido en esa sede (o de toda la organización)? */
export function rolesAt(assignments: RoleAssignment[], organizationId: string, locationId: string): Role[] {
  return assignments
    .filter(
      (a) =>
        a.organizationId === organizationId &&
        (a.locationId === locationId || (a.locationId === null && ORG_WIDE_ROLES.includes(a.role))),
    )
    .map((a) => a.role);
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
   * Identifica a quien llama. El contexto (organización y sede) sale de la
   * sesión validada y de memberships; los encabezados del cliente se ignoran.
   */
  async resolve(headers: Headers, cookies: Record<string, string | undefined>): Promise<Resolution> {
    const kioskToken = cookies[KIOSK_COOKIE];
    const hasSessionCookie = Object.keys(cookies).some((name) => name.endsWith('session_token'));
    if (kioskToken !== undefined) {
      // El token de kiosco y la sesión de persona no se mezclan.
      if (hasSessionCookie) return { ok: false, status: 403, code: 'mixed_credentials' };
      return this.#resolveKiosk(kioskToken);
    }
    if (!hasSessionCookie) return { ok: true, principal: null };
    return this.#resolvePerson(headers);
  }

  async #resolvePerson(headers: Headers): Promise<Resolution> {
    // returnHeaders: al refrescar la sesión deslizante, Better Auth renueva la
    // cookie; la reenviamos en la respuesta.
    const { headers: authHeaders, response: result } = await this.#auth.api.getSession({
      headers,
      query: { disableCookieCache: true },
      returnHeaders: true,
    });
    if (!result) return { ok: false, status: 401, code: 'unauthenticated' };
    const { session, user } = result;

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

    let context: PersonPrincipal['context'] = null;
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
        kind: 'person',
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

  /** Roles activos de la persona en todas sus organizaciones (política own_*_read). */
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

  async #resolveKiosk(token: string): Promise<Resolution> {
    // Formato: <orgId>.<deviceId>.<secreto>. La organización no es secreta;
    // solo sirve si el hash del secreto coincide dentro de esa organización.
    const [orgId, deviceId, secret, ...rest] = token.split('.');
    if (!orgId || !deviceId || !secret || rest.length > 0 || !UUID_RE.test(orgId) || !UUID_RE.test(deviceId)) {
      return { ok: false, status: 401, code: 'invalid_kiosk_token' };
    }
    const device = await this.#tenantDb.withTenant(orgId, (tx) =>
      tx
        .select({ id: kioskDevices.id, locationId: kioskDevices.locationId, tokenHash: kioskDevices.tokenHash })
        .from(kioskDevices)
        .where(and(eq(kioskDevices.id, deviceId), isNull(kioskDevices.revokedAt)))
        .then((r) => r[0]),
    );
    if (!device || !safeEqualHex(device.tokenHash, sha256Hex(secret))) {
      return { ok: false, status: 401, code: 'invalid_kiosk_token' };
    }
    return {
      ok: true,
      principal: {
        kind: 'kiosk',
        deviceId: device.id,
        context: { organizationId: orgId, locationId: device.locationId },
        permissions: new Set(KIOSK_PERMISSIONS),
      },
    };
  }
}
