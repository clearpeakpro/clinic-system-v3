import { randomBytes } from 'node:crypto';
import {
  invitations,
  locations,
  membershipRoles,
  memberships,
  organizations,
  session as sessionTable,
  user as userTable,
  type TenantDb,
} from '@clinic/db';
import {
  canAssignRole,
  canChangeRoles,
  canManageMember,
  isRole,
  ORG_WIDE_ROLES,
  type ChangeRolesInput,
  type CreateInvitationInput,
  type Role,
} from '@clinic/shared';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import type { AuditService } from './audit.ts';
import type { Auth } from './auth.ts';
import type { AppConfig } from './config.ts';
import type { Mailer } from './mailer.ts';
import { checkPassword } from './password-policy.ts';
import {
  rolesAt,
  rolesInOrganization,
  sha256Hex,
  type Principal,
  type PrincipalResolver,
} from './principal.ts';

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

function newSecret(): string {
  return randomBytes(32).toString('base64url');
}

function requireContext(principal: Principal) {
  if (!principal.context) throw new HttpError(403, 'no_active_context');
  return principal.context;
}

function assertOrgWide(role: Role, locationId: string | null): void {
  if (locationId === null && !ORG_WIDE_ROLES.includes(role)) throw new HttpError(400, 'location_required');
}

export interface LocationChoice {
  organizationId: string;
  organizationName: string;
  locations: { id: string; code: string; name: string; timezone: string }[];
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
          .select({ id: locations.id, code: locations.code, name: locations.name, timezone: locations.timezone })
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

export class InvitationService {
  readonly #tenantDb: TenantDb;
  readonly #auth: Auth;
  readonly #mailer: Mailer;
  readonly #audit: AuditService;
  readonly #config: AppConfig;

  constructor(tenantDb: TenantDb, auth: Auth, mailer: Mailer, audit: AuditService, config: AppConfig) {
    this.#tenantDb = tenantDb;
    this.#auth = auth;
    this.#mailer = mailer;
    this.#audit = audit;
    this.#config = config;
  }

  async create(inviter: Principal, input: CreateInvitationInput, meta: RequestMeta): Promise<{ id: string }> {
    const ctx = requireContext(inviter);
    // Regla escalonada: solo roles de rango estrictamente menor al propio.
    if (!canAssignRole(rolesInOrganization(inviter.assignments, ctx.organizationId), input.role)) {
      throw new HttpError(403, 'role_not_assignable');
    }
    assertOrgWide(input.role, input.locationId);
    const email = input.email.trim().toLowerCase();
    const secret = newSecret();

    const id = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      if (input.locationId) {
        const found = await tx.select({ id: locations.id }).from(locations).where(eq(locations.id, input.locationId));
        if (found.length === 0) throw new HttpError(400, 'invalid_location');
      }
      const [row] = await tx
        .insert(invitations)
        .values({
          organizationId: ctx.organizationId,
          email,
          role: input.role,
          locationId: input.locationId,
          tokenHash: sha256Hex(secret),
          expiresAt: new Date(Date.now() + this.#config.invitationTtlSeconds * 1000),
          createdByUserId: inviter.userId,
        })
        .returning({ id: invitations.id });
      if (!row) throw new Error('No se creó la invitación');
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'invitation.created',
        actorType: 'user',
        actorId: inviter.userId,
        locationId: ctx.locationId,
        entityType: 'invitation',
        entityId: row.id,
        ...meta,
        metadata: { role: input.role },
      });
      return row.id;
    });

    // Después del commit. Si el envío falla, la invitación queda sin usar y
    // vence sola; T-008 lo hará fiable con el outbox.
    const link = `${this.#config.baseURL}/invitaciones/aceptar?org=${ctx.organizationId}&token=${secret}`;
    try {
      await this.#mailer.send({
        to: email,
        subject: 'Invitación a Clinic System',
        text: `Le invitaron a Clinic System. Abra este enlace para aceptar la invitación:\n\n${link}\n\nEl enlace sirve una sola vez y vence en ${String(Math.round(this.#config.invitationTtlSeconds / 3600))} horas.`,
      });
    } catch {
      throw new HttpError(502, 'mail_failed');
    }
    return { id };
  }

  /**
   * Acepta una invitación. Si la persona no tiene cuenta, se crea con
   * auth.api.signUpEmail (llamada de servidor). Consumir la invitación, crear
   * la membresía y auditar van en una sola transacción.
   */
  async accept(
    input: { organizationId: string; token: string; name?: string | undefined; password?: string | undefined },
    signedIn: { principal: Principal; email: string } | null,
    meta: RequestMeta,
  ): Promise<{ membershipId: string }> {
    const tokenHash = sha256Hex(input.token);
    const invitation = await this.#tenantDb.withTenant(input.organizationId, (tx) =>
      tx
        .select()
        .from(invitations)
        .where(eq(invitations.tokenHash, tokenHash))
        .then((r) => r[0]),
    );
    if (!invitation) throw new HttpError(404, 'invitation_not_found');
    if (invitation.acceptedAt) throw new HttpError(410, 'invitation_used');
    if (invitation.expiresAt.getTime() <= Date.now()) throw new HttpError(410, 'invitation_expired');
    if (!isRole(invitation.role)) throw new Error('Invitación con rol desconocido');

    let userId: string;
    if (signedIn) {
      if (signedIn.email.toLowerCase() !== invitation.email) throw new HttpError(403, 'invitation_email_mismatch');
      userId = signedIn.principal.userId;
    } else {
      if (!input.name || !input.password) throw new HttpError(400, 'account_required');
      // Política de contraseñas (ADR 0023), con un código claro para la pantalla.
      const problem = checkPassword(input.password);
      if (problem) throw new HttpError(400, problem);
      // Llamada de servidor (sin `request`): el hook de registro cerrado la deja pasar.
      try {
        const created = await this.#auth.api.signUpEmail({
          body: { name: input.name, email: invitation.email, password: input.password },
        });
        userId = created.user.id;
      } catch {
        // P. ej. la cuenta ya existe: debe aceptar con su sesión iniciada.
        throw new HttpError(409, 'account_exists');
      }
    }

    const membershipId = await this.#tenantDb.withTenant(input.organizationId, async (tx) => {
      // Un solo uso: solo la primera aceptación encuentra la fila.
      const consumed = await tx
        .update(invitations)
        .set({ acceptedAt: new Date(), acceptedByUserId: userId })
        .where(
          and(eq(invitations.id, invitation.id), isNull(invitations.acceptedAt), gt(invitations.expiresAt, sql`now()`)),
        )
        .returning({ id: invitations.id });
      if (consumed.length === 0) throw new HttpError(410, 'invitation_used');

      const [membership] = await tx
        .insert(memberships)
        .values({ organizationId: input.organizationId, userId })
        .onConflictDoUpdate({
          target: [memberships.organizationId, memberships.userId],
          set: { status: 'active', version: sql`${memberships.version} + 1` },
        })
        .returning({ id: memberships.id });
      if (!membership) throw new Error('No se creó la membresía');
      await tx
        .insert(membershipRoles)
        .values({
          organizationId: input.organizationId,
          membershipId: membership.id,
          locationId: invitation.locationId,
          role: invitation.role,
        })
        .onConflictDoNothing();
      await this.#audit.inTx(tx, input.organizationId, {
        action: 'invitation.accepted',
        actorType: 'user',
        actorId: userId,
        locationId: invitation.locationId ?? undefined,
        entityType: 'invitation',
        entityId: invitation.id,
        ...meta,
      });
      return membership.id;
    });
    return { membershipId };
  }
}

export class MembershipService {
  readonly #tenantDb: TenantDb;
  readonly #plain;
  readonly #resolver: PrincipalResolver;
  readonly #audit: AuditService;

  constructor(pool: pg.Pool, tenantDb: TenantDb, resolver: PrincipalResolver, audit: AuditService) {
    this.#plain = drizzle({ client: pool });
    this.#tenantDb = tenantDb;
    this.#resolver = resolver;
    this.#audit = audit;
  }

  /**
   * Quita (desactiva) la membresía de una persona en la organización activa.
   * Sus sesiones en esa organización se borran; si no le queda ninguna
   * membresía activa, todas.
   */
  async deactivate(actor: Principal, membershipId: string, reason: string, meta: RequestMeta): Promise<void> {
    const ctx = requireContext(actor);
    const actorRoles = rolesInOrganization(actor.assignments, ctx.organizationId);
    const target = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const found = await this.#loadTarget(tx, membershipId);
      if (!canManageMember(actorRoles, found.roles)) throw new HttpError(403, 'member_not_manageable');
      const updated = await tx
        .update(memberships)
        .set({ status: 'inactive', version: sql`${memberships.version} + 1` })
        .where(and(eq(memberships.id, membershipId), eq(memberships.status, 'active')))
        .returning({ id: memberships.id });
      if (updated.length === 0) throw new HttpError(409, 'membership_not_active');
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'membership.deactivated',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'membership',
        entityId: membershipId,
        reason,
        ...meta,
      });
      return found;
    });

    await this.#resolver.revokeOrganizationSessions(target.userId, ctx.organizationId);
    const remaining = await this.#resolver.loadAssignments(target.userId);
    if (remaining.length === 0) await this.#resolver.revokeUserSessions(target.userId);
  }

  /** Reemplaza los roles de una persona en la organización activa. */
  async changeRoles(actor: Principal, membershipId: string, input: ChangeRolesInput, meta: RequestMeta): Promise<void> {
    const ctx = requireContext(actor);
    const actorRoles = rolesInOrganization(actor.assignments, ctx.organizationId);
    for (const assignment of input.roles) assertOrgWide(assignment.role, assignment.locationId);

    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const target = await this.#loadTarget(tx, membershipId);
      if (target.status !== 'active') throw new HttpError(409, 'membership_not_active');
      if (!canChangeRoles(actorRoles, target.roles, input.roles.map((r) => r.role))) {
        throw new HttpError(403, 'role_change_not_allowed');
      }
      const locationIds = [...new Set(input.roles.flatMap((r) => (r.locationId ? [r.locationId] : [])))];
      if (locationIds.length > 0) {
        const found = await tx.select({ id: locations.id }).from(locations).where(inArray(locations.id, locationIds));
        if (found.length !== locationIds.length) throw new HttpError(400, 'invalid_location');
      }
      await tx.delete(membershipRoles).where(eq(membershipRoles.membershipId, membershipId));
      await tx.insert(membershipRoles).values(
        input.roles.map((r) => ({
          organizationId: ctx.organizationId,
          membershipId,
          locationId: r.locationId,
          role: r.role,
        })),
      );
      await tx
        .update(memberships)
        .set({ version: sql`${memberships.version} + 1` })
        .where(eq(memberships.id, membershipId));
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'membership.roles_changed',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'membership',
        entityId: membershipId,
        reason: input.reason,
        ...meta,
        metadata: { roles: [...new Set(input.roles.map((r) => r.role))].sort().join(',') },
      });
    });
  }

  /**
   * Desactiva la cuenta global. Es una operación del operador de la
   * plataforma (su endpoint llega con T-007): marca al usuario y borra sus
   * sesiones. Better Auth no le deja abrir sesiones nuevas (databaseHooks).
   */
  async deactivateUser(userId: string, reason: string): Promise<void> {
    await this.#plain.update(userTable).set({ disabledAt: new Date() }).where(eq(userTable.id, userId));
    await this.#resolver.revokeUserSessions(userId);
    await this.#audit.platform({
      action: 'user.deactivated',
      actorType: 'anonymous',
      entityType: 'user',
      entityId: userId,
      ip: null,
      reason,
      metadata: { by: 'platform_operator' },
    });
  }

  async #loadTarget(tx: Parameters<Parameters<TenantDb['withTenant']>[1]>[0], membershipId: string) {
    const [membership] = await tx
      .select({ userId: memberships.userId, status: memberships.status })
      .from(memberships)
      .where(eq(memberships.id, membershipId));
    if (!membership) throw new HttpError(404, 'membership_not_found');
    const roles = await tx
      .select({ role: membershipRoles.role })
      .from(membershipRoles)
      .where(eq(membershipRoles.membershipId, membershipId));
    return { ...membership, roles: roles.flatMap((r) => (isRole(r.role) ? [r.role] : [])) };
  }
}
