import { randomBytes } from 'node:crypto';
import {
  invitations,
  kioskDevices,
  locations,
  membershipRoles,
  memberships,
  session as sessionTable,
  user as userTable,
  type TenantDb,
} from '@clinic/db';
import { isRole, ORG_WIDE_ROLES, type Role } from '@clinic/shared';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import type { AuditService } from './audit.ts';
import type { Auth } from './auth.ts';
import type { AppConfig } from './config.ts';
import type { RevocationBus } from './events.ts';
import type { Mailer } from './mailer.ts';
import { rolesAt, sha256Hex, type PersonPrincipal, type PrincipalResolver } from './principal.ts';

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function newSecret(): string {
  return randomBytes(32).toString('base64url');
}

export class ContextService {
  readonly #plain;
  constructor(pool: pg.Pool) {
    this.#plain = drizzle({ client: pool });
  }

  /** Cambia organización y sede activas tras validar membresía y rol en esa sede. */
  async select(principal: PersonPrincipal, organizationId: string, locationId: string): Promise<void> {
    if (rolesAt(principal.assignments, organizationId, locationId).length === 0) {
      throw new HttpError(403, 'not_a_member');
    }
    await this.#plain
      .update(sessionTable)
      .set({ activeOrganizationId: organizationId, activeLocationId: locationId })
      .where(eq(sessionTable.id, principal.sessionId));
  }
}

export interface InvitationInput {
  email: string;
  role: string;
  locationId: string | null;
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

  async create(inviter: PersonPrincipal, input: InvitationInput, ip: string | null): Promise<{ id: string }> {
    const ctx = inviter.context;
    if (!ctx) throw new HttpError(403, 'no_active_context');
    if (!isRole(input.role)) throw new HttpError(400, 'invalid_role');
    const role: Role = input.role;
    if (input.locationId === null && !ORG_WIDE_ROLES.includes(role)) {
      throw new HttpError(400, 'location_required');
    }
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
          email: input.email.trim().toLowerCase(),
          role,
          locationId: input.locationId,
          tokenHash: sha256Hex(secret),
          expiresAt: new Date(Date.now() + this.#config.invitationTtlSeconds * 1000),
          createdByUserId: inviter.userId,
        })
        .returning({ id: invitations.id });
      if (!row) throw new Error('No se creó la invitación');
      return row.id;
    });
    const link = `${this.#config.baseURL}/invitaciones/aceptar?org=${ctx.organizationId}&token=${secret}`;
    await this.#mailer.send({ to: input.email, subject: 'Invitación', text: link });
    await this.#audit.organization(ctx.organizationId, {
      action: 'invitation.created',
      actorType: 'user',
      actorId: inviter.userId,
      entityType: 'invitation',
      entityId: id,
      ip,
      metadata: { role },
    });
    return { id };
  }

  /**
   * Acepta una invitación. Si la persona no tiene cuenta, se crea con
   * auth.api.signUpEmail (llamada de servidor). Consumir la invitación y
   * crear la membresía van en una sola transacción.
   */
  async accept(
    input: { organizationId: string; token: string; name?: string; password?: string },
    signedIn: PersonPrincipal | null,
    signedInEmail: string | null,
    ip: string | null,
  ): Promise<{ membershipId: string; userId: string }> {
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

    let userId: string;
    if (signedIn) {
      if (signedInEmail?.toLowerCase() !== invitation.email) throw new HttpError(403, 'invitation_email_mismatch');
      userId = signedIn.userId;
    } else {
      if (!input.name || !input.password) throw new HttpError(400, 'account_required');
      // Llamada de servidor (sin `request`): el hook de registro cerrado la deja pasar.
      const created = await this.#auth.api.signUpEmail({
        body: { name: input.name, email: invitation.email, password: input.password },
      });
      userId = created.user.id;
    }

    const membershipId = await this.#tenantDb.withTenant(input.organizationId, async (tx) => {
      // Un solo uso: solo la primera aceptación encuentra la fila.
      const consumed = await tx
        .update(invitations)
        .set({ acceptedAt: new Date(), acceptedByUserId: userId })
        .where(
          and(
            eq(invitations.id, invitation.id),
            isNull(invitations.acceptedAt),
            gt(invitations.expiresAt, sql`now()`),
          ),
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
      return membership.id;
    });

    await this.#audit.organization(input.organizationId, {
      action: 'invitation.accepted',
      actorType: 'user',
      actorId: userId,
      entityType: 'invitation',
      entityId: invitation.id,
      ip,
    });
    return { membershipId, userId };
  }
}

export class MembershipService {
  readonly #tenantDb: TenantDb;
  readonly #plain;
  readonly #resolver: PrincipalResolver;
  readonly #bus: RevocationBus;
  readonly #audit: AuditService;

  constructor(
    pool: pg.Pool,
    tenantDb: TenantDb,
    resolver: PrincipalResolver,
    bus: RevocationBus,
    audit: AuditService,
  ) {
    this.#plain = drizzle({ client: pool });
    this.#tenantDb = tenantDb;
    this.#resolver = resolver;
    this.#bus = bus;
    this.#audit = audit;
  }

  /** Un Administrador quita la membresía de una persona en su organización. */
  async remove(admin: PersonPrincipal, membershipId: string, ip: string | null): Promise<void> {
    const ctx = admin.context;
    if (!ctx) throw new HttpError(403, 'no_active_context');
    const removed = await this.#tenantDb.withTenant(ctx.organizationId, (tx) =>
      tx
        .update(memberships)
        .set({ status: 'inactive', version: sql`${memberships.version} + 1` })
        .where(and(eq(memberships.id, membershipId), eq(memberships.status, 'active')))
        .returning({ userId: memberships.userId }),
    );
    const target = removed[0];
    if (!target) throw new HttpError(404, 'membership_not_found');
    this.#bus.emit('membershipRevoked', target.userId, ctx.organizationId);
    await this.#audit.organization(ctx.organizationId, {
      action: 'membership.revoked',
      actorType: 'user',
      actorId: admin.userId,
      entityType: 'membership',
      entityId: membershipId,
      ip,
    });
  }

  /**
   * Desactiva la cuenta global. Es una operación del operador de la
   * plataforma (sin endpoint en la prueba): marca al usuario, borra sus
   * sesiones y cierra sus sockets.
   */
  async deactivateUser(userId: string): Promise<void> {
    await this.#plain.update(userTable).set({ disabledAt: new Date() }).where(eq(userTable.id, userId));
    await this.#resolver.revokeUserSessions(userId);
    this.#bus.emit('userRevoked', userId);
    await this.#audit.platform({
      action: 'user.deactivated',
      actorType: 'anonymous',
      entityType: 'user',
      entityId: userId,
      ip: null,
      metadata: { by: 'platform_operator' },
    });
  }
}

export class KioskService {
  readonly #tenantDb: TenantDb;
  constructor(tenantDb: TenantDb) {
    this.#tenantDb = tenantDb;
  }

  /**
   * Registra un dispositivo y devuelve su token una sola vez. En el producto
   * se vincula con un código de un solo uso (ADR 0014); fuera de la prueba.
   */
  async register(organizationId: string, locationId: string): Promise<{ deviceId: string; token: string }> {
    const secret = newSecret();
    const [device] = await this.#tenantDb.withTenant(organizationId, (tx) =>
      tx
        .insert(kioskDevices)
        .values({ organizationId, locationId, name: 'Kiosco de prueba', tokenHash: sha256Hex(secret) })
        .returning({ id: kioskDevices.id }),
    );
    if (!device) throw new Error('No se registró el kiosco');
    return { deviceId: device.id, token: `${organizationId}.${device.id}.${secret}` };
  }

  async revoke(organizationId: string, deviceId: string): Promise<void> {
    await this.#tenantDb.withTenant(organizationId, (tx) =>
      tx.update(kioskDevices).set({ revokedAt: new Date() }).where(eq(kioskDevices.id, deviceId)),
    );
  }
}
