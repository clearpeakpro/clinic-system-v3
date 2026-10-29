import { randomBytes } from 'node:crypto';
import {
  enqueueMail,
  invitationRoles,
  invitations,
  locations,
  membershipRoles,
  memberships,
  user as userTable,
  type TenantDb,
  type Tx,
} from '@clinic/db';
import {
  assignmentsFor,
  canAssignRole,
  isRole,
  needsLocation,
  type CreateInvitationInput,
} from '@clinic/shared';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { AuditService } from './audit.ts';
import { CLIENT_IP_HEADER, REQUEST_ID_HEADER, type Auth } from './auth.ts';
import type { AppConfig } from './config.ts';
import { checkPassword } from './password-policy.ts';
import { rolesInOrganization, sha256Hex, type Principal } from './principal.ts';
import { HttpError, requireContext, type RequestMeta } from './services.ts';

// Invitaciones (S-ADM-03, S-ADM-04, S-GEN-09). El enlace /invitacion/<token>
// sirve una sola vez y vence. El token lleva la organización (para buscar la
// invitación bajo su RLS) y un secreto; solo se guarda el sha256 del secreto.
// El correo es el canal principal: se escribe en el outbox en la misma
// transacción que la invitación (T-008) y lo entrega el worker. El diálogo de
// un solo uso (S-ADM-04) muestra el mismo enlace como respaldo.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** «<organización en base64url>.<secreto>». */
export function encodeInvitationToken(organizationId: string, secret: string): string {
  return `${Buffer.from(organizationId.replaceAll('-', ''), 'hex').toString('base64url')}.${secret}`;
}

export function decodeInvitationToken(token: string): { organizationId: string; secret: string } | null {
  const [org, secret, ...rest] = token.split('.');
  if (!org || !secret || rest.length > 0) return null;
  const hex = Buffer.from(org, 'base64url').toString('hex');
  if (hex.length !== 32) return null;
  const organizationId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return UUID_RE.test(organizationId) ? { organizationId, secret } : null;
}

export interface CreatedInvitation {
  invitationId: string;
  link: string;
  expiresAt: string;
}

/** Correo de invitación (el enlace lleva el token: el payload del outbox va cifrado). */
export function invitationMail(email: string, link: string, ttlSeconds: number, organizationName?: string) {
  const role = organizationName ? ` como Propietario de ${organizationName}` : '';
  return {
    to: email,
    subject: 'Invitación a Clinic System',
    text: `Le invitaron a Clinic System${role}. Abra este enlace para aceptar la invitación:\n\n${link}\n\nEl enlace sirve una sola vez y vence en ${String(Math.round(ttlSeconds / 3600))} horas.`,
  };
}

export interface AcceptResult {
  membershipId: string;
  /** La API abrió la sesión de la cuenta recién creada. */
  signedIn: boolean;
}

export class InvitationService {
  readonly #tenantDb: TenantDb;
  readonly #auth: Auth;
  readonly #audit: AuditService;
  readonly #config: AppConfig;

  constructor(tenantDb: TenantDb, auth: Auth, audit: AuditService, config: AppConfig) {
    this.#tenantDb = tenantDb;
    this.#auth = auth;
    this.#audit = audit;
    this.#config = config;
  }

  async create(inviter: Principal, input: CreateInvitationInput, meta: RequestMeta): Promise<CreatedInvitation> {
    const ctx = requireContext(inviter);
    // Regla escalonada: solo roles de rango estrictamente menor al propio.
    const inviterRoles = rolesInOrganization(inviter.assignments, ctx.organizationId);
    if (!input.roles.every((role) => canAssignRole(inviterRoles, role))) throw new HttpError(403, 'role_not_assignable');
    const locationIds = [...new Set(input.locationIds)];
    if (needsLocation(input.roles) && locationIds.length === 0) throw new HttpError(400, 'location_required');
    if (!needsLocation(input.roles) && locationIds.length > 0) throw new HttpError(400, 'location_not_applicable');
    const email = input.email.trim().toLowerCase();
    const secret = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.#config.invitationTtlSeconds * 1000);
    const link = `${this.#config.baseURL}/invitacion/${encodeInvitationToken(ctx.organizationId, secret)}`;

    const invitationId = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      if (locationIds.length > 0) {
        const found = await tx.select({ id: locations.id, active: locations.active }).from(locations).where(inArray(locations.id, locationIds));
        if (found.length !== locationIds.length) throw new HttpError(400, 'invalid_location');
        if (found.some((l) => !l.active)) throw new HttpError(400, 'location_inactive');
      }
      // Un correo que ya es de alguien de la organización (activo o
      // deshabilitado) no se vuelve a invitar.
      const [existing] = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .innerJoin(userTable, eq(userTable.id, memberships.userId))
        .where(eq(userTable.email, email));
      if (existing) throw new HttpError(409, 'email_taken');
      // Volver a invitar a alguien aún «Invitado» emite un enlace nuevo: el anterior deja de servir.
      const replaced = await tx
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(and(eq(invitations.email, email), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
        .returning({ id: invitations.id });

      const [row] = await tx
        .insert(invitations)
        .values({
          organizationId: ctx.organizationId,
          email,
          name: input.name,
          tokenHash: sha256Hex(secret),
          expiresAt,
          createdByUserId: inviter.userId,
        })
        .returning({ id: invitations.id });
      if (!row) throw new Error('No se creó la invitación');
      await tx.insert(invitationRoles).values(
        assignmentsFor(input.roles, locationIds).map((a) => ({
          organizationId: ctx.organizationId,
          invitationId: row.id,
          locationId: a.locationId,
          role: a.role,
        })),
      );
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'invitation.created',
        actorType: 'user',
        actorId: inviter.userId,
        locationId: ctx.locationId,
        entityType: 'invitation',
        entityId: row.id,
        ...meta,
        metadata: { roles: [...new Set(input.roles)].sort().join(','), locations: locationIds.length, reissued: replaced.length > 0 },
      });
      await this.#enqueue(tx, ctx.organizationId, row.id, email, link);
      return row.id;
    });
    return { invitationId, link, expiresAt: expiresAt.toISOString() };
  }

  /**
   * S-ADM-02 «Reenviar»: emite un enlace nuevo para una invitación pendiente
   * (vencida o no), con los mismos roles y sedes, y anula el anterior. Misma
   * regla escalonada que al revocar.
   */
  async resend(actor: Principal, invitationId: string, meta: RequestMeta): Promise<CreatedInvitation> {
    const ctx = requireContext(actor);
    const actorRoles = rolesInOrganization(actor.assignments, ctx.organizationId);
    const secret = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.#config.invitationTtlSeconds * 1000);
    const link = `${this.#config.baseURL}/invitacion/${encodeInvitationToken(ctx.organizationId, secret)}`;

    const created = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [previous] = await tx
        .select({ email: invitations.email, name: invitations.name, acceptedAt: invitations.acceptedAt, revokedAt: invitations.revokedAt })
        .from(invitations)
        .where(eq(invitations.id, invitationId))
        .for('update');
      if (!previous) throw new HttpError(404, 'invitation_not_found');
      if (previous.acceptedAt || previous.revokedAt) throw new HttpError(409, 'invitation_not_pending');
      const roles = await tx
        .select({ role: invitationRoles.role, locationId: invitationRoles.locationId })
        .from(invitationRoles)
        .where(eq(invitationRoles.invitationId, invitationId));
      if (roles.length === 0 || !roles.every((r) => isRole(r.role) && canAssignRole(actorRoles, r.role))) {
        throw new HttpError(403, 'member_not_manageable');
      }

      await tx.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.id, invitationId));
      const [row] = await tx
        .insert(invitations)
        .values({
          organizationId: ctx.organizationId,
          email: previous.email,
          name: previous.name,
          tokenHash: sha256Hex(secret),
          expiresAt,
          createdByUserId: actor.userId,
        })
        .returning({ id: invitations.id });
      if (!row) throw new Error('No se creó la invitación');
      await tx.insert(invitationRoles).values(
        roles.map((r) => ({ organizationId: ctx.organizationId, invitationId: row.id, locationId: r.locationId, role: r.role })),
      );
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'invitation.resent',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'invitation',
        entityId: row.id,
        ...meta,
        metadata: { previousInvitationId: invitationId },
      });
      await this.#enqueue(tx, ctx.organizationId, row.id, previous.email, link);
      return { id: row.id };
    });
    return { invitationId: created.id, link, expiresAt: expiresAt.toISOString() };
  }

  /** El correo va al outbox en la misma transacción: si la invitación se deshace, el correo también. */
  async #enqueue(tx: Tx, organizationId: string, invitationId: string, email: string, link: string): Promise<void> {
    await enqueueMail(tx, this.#config.outboxKey, {
      organizationId,
      kind: 'mail.invitation',
      entityType: 'invitation',
      entityId: invitationId,
      mail: invitationMail(email, link, this.#config.invitationTtlSeconds),
    });
  }

  /** S-ADM-07 «Revocar invitación»: el enlace deja de funcionar. */
  async revoke(actor: Principal, invitationId: string, reason: string, meta: RequestMeta): Promise<void> {
    const ctx = requireContext(actor);
    const actorRoles = rolesInOrganization(actor.assignments, ctx.organizationId);
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [invitation] = await tx
        .select({ acceptedAt: invitations.acceptedAt, revokedAt: invitations.revokedAt })
        .from(invitations)
        .where(eq(invitations.id, invitationId))
        .for('update');
      if (!invitation) throw new HttpError(404, 'invitation_not_found');
      if (invitation.acceptedAt || invitation.revokedAt) throw new HttpError(409, 'invitation_not_pending');
      const roles = await tx
        .select({ role: invitationRoles.role })
        .from(invitationRoles)
        .where(eq(invitationRoles.invitationId, invitationId));
      if (!roles.every((r) => isRole(r.role) && canAssignRole(actorRoles, r.role))) {
        throw new HttpError(403, 'member_not_manageable');
      }
      await tx.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.id, invitationId));
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'invitation.revoked',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'invitation',
        entityId: invitationId,
        reason,
        ...meta,
      });
    });
  }

  /**
   * S-GEN-09. Sin sesión: crea la cuenta (auth.api.signUpEmail, llamada de
   * servidor) y después abre su sesión. Con sesión: la invitación debe ser de
   * su correo. Consumir la invitación, crear la membresía con sus roles y
   * auditar van en una sola transacción.
   */
  async accept(
    input: { token: string; name?: string | undefined; password?: string | undefined },
    signedIn: { principal: Principal; email: string } | null,
    meta: RequestMeta,
  ): Promise<AcceptResult & { setCookies: string[] }> {
    const decoded = decodeInvitationToken(input.token);
    if (!decoded) throw new HttpError(404, 'invitation_not_found');
    const { organizationId } = decoded;
    const tokenHash = sha256Hex(decoded.secret);

    const found = await this.#tenantDb.withTenant(organizationId, async (tx) => {
      const [invitation] = await tx.select().from(invitations).where(eq(invitations.tokenHash, tokenHash));
      if (!invitation) return null;
      const roles = await tx
        .select({ role: invitationRoles.role, locationId: invitationRoles.locationId })
        .from(invitationRoles)
        .where(eq(invitationRoles.invitationId, invitation.id));
      const [account] = await tx.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, invitation.email));
      return { invitation, roles, accountExists: account !== undefined };
    });
    if (!found) throw new HttpError(404, 'invitation_not_found');
    const { invitation, roles, accountExists } = found;
    if (invitation.acceptedAt) throw new HttpError(410, 'invitation_used');
    if (invitation.revokedAt) throw new HttpError(410, 'invitation_revoked');
    if (invitation.expiresAt.getTime() <= Date.now()) throw new HttpError(410, 'invitation_expired');
    if (roles.length === 0 || !roles.every((r) => isRole(r.role))) throw new HttpError(410, 'invitation_invalid');

    let userId: string;
    let created = false;
    if (signedIn) {
      if (signedIn.email.toLowerCase() !== invitation.email) throw new HttpError(403, 'invitation_email_mismatch');
      userId = signedIn.principal.userId;
    } else {
      // Con cuenta: debe aceptar con su sesión iniciada. (Better Auth no falla
      // al registrar un correo existente: devuelve un usuario simulado.)
      if (accountExists) throw new HttpError(409, 'account_exists');
      if (!input.name || !input.password) throw new HttpError(400, 'account_required');
      // Política de contraseñas (ADR 0023), con un código claro para la pantalla.
      const problem = checkPassword(input.password);
      if (problem) throw new HttpError(400, problem);
      // Llamada de servidor (sin `request`): el hook de registro cerrado la deja pasar.
      try {
        const result = await this.#auth.api.signUpEmail({
          body: { name: input.name, email: invitation.email, password: input.password },
        });
        userId = result.user.id;
        created = true;
      } catch {
        // Carrera: la cuenta se creó entre la comprobación y el registro.
        throw new HttpError(409, 'account_exists');
      }
    }

    const membershipId = await this.#tenantDb.withTenant(organizationId, async (tx) => {
      // Un solo uso: solo la primera aceptación encuentra la fila.
      const consumed = await tx
        .update(invitations)
        .set({ acceptedAt: new Date(), acceptedByUserId: userId })
        .where(
          and(
            eq(invitations.id, invitation.id),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
            gt(invitations.expiresAt, sql`now()`),
          ),
        )
        .returning({ id: invitations.id });
      if (consumed.length === 0) throw new HttpError(410, 'invitation_used');

      const [membership] = await tx
        .insert(memberships)
        .values({ organizationId, userId })
        .onConflictDoUpdate({
          target: [memberships.organizationId, memberships.userId],
          set: { status: 'active', version: sql`${memberships.version} + 1` },
        })
        .returning({ id: memberships.id });
      if (!membership) throw new Error('No se creó la membresía');
      await tx
        .insert(membershipRoles)
        .values(roles.map((r) => ({ organizationId, membershipId: membership.id, locationId: r.locationId, role: r.role })))
        .onConflictDoNothing();
      await this.#audit.inTx(tx, organizationId, {
        action: 'invitation.accepted',
        actorType: 'user',
        actorId: userId,
        entityType: 'invitation',
        entityId: invitation.id,
        ...meta,
      });
      return membership.id;
    });

    // La cuenta recién creada entra directamente (S-GEN-09). Si el inicio de
    // sesión falla (p. ej. por el límite de intentos), la web lleva a /login.
    let setCookies: string[] = [];
    if (created && input.password) {
      try {
        const headers = new Headers();
        if (meta.ip) headers.set(CLIENT_IP_HEADER, meta.ip);
        headers.set(REQUEST_ID_HEADER, meta.requestId);
        const { headers: responseHeaders } = await this.#auth.api.signInEmail({
          body: { email: invitation.email, password: input.password },
          headers,
          returnHeaders: true,
        });
        setCookies = responseHeaders.getSetCookie();
      } catch {
        setCookies = [];
      }
    }
    return { membershipId, signedIn: setCookies.length > 0, setCookies };
  }
}
