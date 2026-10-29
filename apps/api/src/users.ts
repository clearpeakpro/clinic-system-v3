import { randomBytes } from 'node:crypto';
import {
  account as accountTable,
  invitationRoles,
  invitations,
  locations,
  membershipRoles,
  memberships,
  notifyRealtime,
  outbox,
  session as sessionTable,
  twoFactor as twoFactorTable,
  user as userTable,
  verification as verificationTable,
  type TenantDb,
  type Tx,
} from '@clinic/db';
import {
  assignableRoles,
  canAssignRole,
  canChangeRoles,
  canManageMember,
  isRole,
  ORG_WIDE_ROLES,
  type ChangeRolesInput,
  type Role,
} from '@clinic/shared';
import { symmetricDecrypt } from 'better-auth/crypto';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import type { AuditService } from './audit.ts';
import type { Auth } from './auth.ts';
import type { AppConfig } from './config.ts';
import { rolesInOrganization, type Principal, type PrincipalResolver } from './principal.ts';
import { HttpError, requireContext, type RequestMeta } from './services.ts';

// Administración › Usuarios (S-ADM-02 a 09, T-006a). Todo sobre la
// organización activa de quien actúa, con la regla escalonada de
// packages/shared/src/permissions.ts:
//  - nadie actúa sobre sí mismo ni sobre alguien de rango igual o mayor;
//  - solo se asignan roles de rango menor al propio.
// Deshabilitar y reactivar cambian la MEMBRESÍA de esta organización. Editar
// el nombre, restablecer el MFA y emitir un restablecimiento de contraseña
// tocan la cuenta GLOBAL, así que solo se permiten si la persona no tiene
// membresías activas en otra organización (si no: 409 account_shared; lo
// resuelve el operador de la plataforma, T-007).

export interface Assignment {
  role: Role;
  locationId: string | null;
}

export interface MemberRow {
  kind: 'member';
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  status: 'active' | 'inactive';
  version: number;
  assignments: Assignment[];
  /** Estado de la verificación en dos pasos (columna de Stitch). */
  mfa: 'enabled' | 'disabled' | 'locked';
  /** Un administrador restableció el MFA y la persona aún no fijó una contraseña nueva. */
  mfaResetPending: boolean;
  /** La fila es la de quien consulta. */
  self: boolean;
  /** Quien consulta puede actuar sobre la fila (regla escalonada, sin contar el estado). */
  manageable: boolean;
  /** La cuenta tiene membresías activas en otra organización. */
  sharedAccount: boolean;
  /**
   * Último inicio de sesión completo (con el MFA, si lo tiene), de la
   * auditoría de inicio de sesión. Sin IP. null: nunca.
   */
  lastSignInAt: string | null;
}

export interface InvitationRow {
  kind: 'invitation';
  invitationId: string;
  name: string;
  email: string;
  assignments: Assignment[];
  expiresAt: string;
  /** Venció sin aceptarse (sigue en la lista como «Invitado» hasta reemitirla o revocarla). */
  expired: boolean;
  manageable: boolean;
  /**
   * Estado de su correo en el outbox (T-008): «failed» se muestra como
   * «Correo no entregado» junto a «Reenviar». Nulo si no hay correo.
   */
  mailStatus: 'pending' | 'sent' | 'failed' | null;
}

export interface UsersList {
  rows: (MemberRow | InvitationRow)[];
  /** Sedes de la organización, para los chips de S-ADM-03 / S-ADM-06 y la columna de sedes. Las inactivas no se ofrecen. */
  locations: { id: string; code: string; name: string; active: boolean }[];
  /** Roles que quien consulta puede asignar. */
  assignableRoles: Role[];
}

export interface MfaStatus {
  enrolled: boolean;
  lockedUntil: string | null;
  backupCodesLeft: number | null;
  resetPendingSince: string | null;
}

/** Enlace de un solo uso que se muestra en S-ADM-04. */
export interface OneTimeLink {
  link: string;
  expiresAt: string;
}

function mailStatusOf(mails: { entityId: string | null; status: string; createdAt: Date }[], invitationId: string): InvitationRow['mailStatus'] {
  const latest = mails.filter((m) => m.entityId === invitationId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return latest?.status === 'pending' || latest?.status === 'sent' || latest?.status === 'failed' ? latest.status : null;
}

function lastSignIn(rows: { user_id: string; last_sign_in_at: Date | string }[], userId: string): string | null {
  const row = rows.find((r) => r.user_id === userId);
  return row ? new Date(row.last_sign_in_at).toISOString() : null;
}

function toAssignments(rows: { role: string; locationId: string | null }[]): Assignment[] {
  return rows.flatMap((r) => (isRole(r.role) ? [{ role: r.role, locationId: r.locationId }] : []));
}

export class MembershipService {
  readonly #tenantDb: TenantDb;
  readonly #plain;
  readonly #resolver: PrincipalResolver;
  readonly #audit: AuditService;
  readonly #auth: Auth;
  readonly #config: AppConfig;

  constructor(pool: pg.Pool, tenantDb: TenantDb, resolver: PrincipalResolver, audit: AuditService, auth: Auth, config: AppConfig) {
    this.#plain = drizzle({ client: pool });
    this.#tenantDb = tenantDb;
    this.#resolver = resolver;
    this.#audit = audit;
    this.#auth = auth;
    this.#config = config;
  }

  /** S-ADM-02: personas de la organización e invitaciones pendientes. */
  async list(actor: Principal): Promise<UsersList> {
    const ctx = requireContext(actor);
    const actorRoles = rolesInOrganization(actor.assignments, ctx.organizationId);

    const data = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const members = await tx
        .select({ id: memberships.id, userId: memberships.userId, status: memberships.status, version: memberships.version })
        .from(memberships);
      const roles = await tx
        .select({ membershipId: membershipRoles.membershipId, role: membershipRoles.role, locationId: membershipRoles.locationId })
        .from(membershipRoles);
      const pending = await tx
        .select({ id: invitations.id, name: invitations.name, email: invitations.email, expiresAt: invitations.expiresAt })
        .from(invitations)
        .where(and(isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));
      const pendingRoles = await tx
        .select({ invitationId: invitationRoles.invitationId, role: invitationRoles.role, locationId: invitationRoles.locationId })
        .from(invitationRoles);
      // El último correo de cada invitación pendiente.
      const mails = pending.length
        ? await tx
            .select({ entityId: outbox.entityId, status: outbox.status, createdAt: outbox.createdAt })
            .from(outbox)
            .where(and(eq(outbox.entityType, 'invitation'), inArray(outbox.entityId, pending.map((p) => p.id))))
        : [];
      const sites = await tx
        .select({ id: locations.id, code: locations.code, name: locations.name, active: locations.active })
        .from(locations)
        .orderBy(locations.code);
      // Solo de las personas de esta organización (migración 0010).
      const { rows: lastSignIns } = await tx.execute<{ user_id: string; last_sign_in_at: Date | string }>(
        sql`select user_id, last_sign_in_at from app.last_sign_ins()`,
      );
      return { members, roles, pending, pendingRoles, sites, lastSignIns, mails };
    });

    const userIds = data.members.map((m) => m.userId);
    const users = userIds.length
      ? await this.#plain
          .select({
            id: userTable.id,
            name: userTable.name,
            email: userTable.email,
            twoFactorEnabled: userTable.twoFactorEnabled,
            mfaResetAt: userTable.mfaResetAt,
          })
          .from(userTable)
          .where(inArray(userTable.id, userIds))
      : [];
    const factors = userIds.length
      ? await this.#plain
          .select({ userId: twoFactorTable.userId, lockedUntil: twoFactorTable.lockedUntil })
          .from(twoFactorTable)
          .where(inArray(twoFactorTable.userId, userIds))
      : [];
    const shared = await this.#sharedAccounts(userIds, ctx.organizationId);

    const now = Date.now();
    const rows: (MemberRow | InvitationRow)[] = [];
    for (const m of data.members) {
      const u = users.find((x) => x.id === m.userId);
      if (!u) continue;
      const assignments = toAssignments(data.roles.filter((r) => r.membershipId === m.id));
      const lockedUntil = factors.find((f) => f.userId === m.userId)?.lockedUntil;
      rows.push({
        kind: 'member',
        membershipId: m.id,
        userId: m.userId,
        name: u.name,
        email: u.email,
        status: m.status === 'active' ? 'active' : 'inactive',
        version: m.version,
        assignments,
        mfa: lockedUntil && lockedUntil.getTime() > now ? 'locked' : u.twoFactorEnabled ? 'enabled' : 'disabled',
        mfaResetPending: u.mfaResetAt !== null,
        self: m.userId === actor.userId,
        manageable: m.userId !== actor.userId && canManageMember(actorRoles, assignments.map((a) => a.role)),
        sharedAccount: shared.has(m.userId),
        lastSignInAt: lastSignIn(data.lastSignIns, m.userId),
      });
    }
    for (const inv of data.pending) {
      const assignments = toAssignments(data.pendingRoles.filter((r) => r.invitationId === inv.id));
      rows.push({
        kind: 'invitation',
        invitationId: inv.id,
        name: inv.name,
        email: inv.email,
        assignments,
        expiresAt: inv.expiresAt.toISOString(),
        expired: inv.expiresAt.getTime() <= now,
        manageable: assignments.every((a) => canAssignRole(actorRoles, a.role)),
        mailStatus: mailStatusOf(data.mails, inv.id),
      });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name, 'es') || a.email.localeCompare(b.email));
    return { rows, locations: data.sites, assignableRoles: assignableRoles(actorRoles) };
  }

  /** S-ADM-05: nombre para mostrar (cuenta global). */
  async rename(actor: Principal, membershipId: string, input: { name: string; expectedVersion: number }, meta: RequestMeta): Promise<void> {
    const ctx = requireContext(actor);
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const target = await this.#loadManageable(tx, actor, membershipId);
      assertVersion(target.version, input.expectedVersion);
      await this.#assertNotShared(tx, target.userId, ctx.organizationId);
      await tx.update(userTable).set({ name: input.name, updatedAt: new Date() }).where(eq(userTable.id, target.userId));
      await this.#bumpVersion(tx, membershipId);
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'user.renamed',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'membership',
        entityId: membershipId,
        ...meta,
        // Solo el nombre del campo (ADR 0018).
        metadata: { fields: 'name' },
      });
    });
  }

  /** S-ADM-06: reemplaza los roles por sede de la persona en la organización activa. */
  async changeRoles(actor: Principal, membershipId: string, input: ChangeRolesInput, meta: RequestMeta): Promise<void> {
    const ctx = requireContext(actor);
    const actorRoles = rolesInOrganization(actor.assignments, ctx.organizationId);
    for (const assignment of input.roles) assertOrgWide(assignment.role, assignment.locationId);

    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const target = await this.#load(tx, membershipId);
      if (target.userId === actor.userId) throw new HttpError(403, 'cannot_modify_self');
      if (!canChangeRoles(actorRoles, target.roles, input.roles.map((r) => r.role))) {
        throw new HttpError(403, 'role_change_not_allowed');
      }
      assertVersion(target.version, input.expectedVersion);
      const locationIds = [...new Set(input.roles.flatMap((r) => (r.locationId ? [r.locationId] : [])))];
      if (locationIds.length > 0) {
        const found = await tx
          .select({ id: locations.id, active: locations.active })
          .from(locations)
          .where(inArray(locations.id, locationIds));
        if (found.length !== locationIds.length) throw new HttpError(400, 'invalid_location');
        // Una sede inactiva no se asigna de nuevo; las asignaciones que ya
        // tenía en ella se conservan (T-007).
        const current = await tx
          .select({ locationId: membershipRoles.locationId })
          .from(membershipRoles)
          .where(eq(membershipRoles.membershipId, membershipId));
        const kept = new Set(current.map((c) => c.locationId));
        if (found.some((l) => !l.active && !kept.has(l.id))) throw new HttpError(400, 'location_inactive');
      }
      await tx.delete(membershipRoles).where(eq(membershipRoles.membershipId, membershipId));
      await tx.insert(membershipRoles).values(
        uniqueAssignments(input.roles).map((r) => ({
          organizationId: ctx.organizationId,
          membershipId,
          locationId: r.locationId,
          role: r.role,
        })),
      );
      await this.#bumpVersion(tx, membershipId);
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'membership.roles_changed',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'membership',
        entityId: membershipId,
        reason: input.reason,
        ...meta,
        metadata: {
          roles: [...new Set(input.roles.map((r) => r.role))].sort().join(','),
          locations: locationIds.length,
        },
      });
      // Sus sockets se revalidan ya: si pierde la sede activa, se cierran (T-009).
      await notifyRealtime(tx, { t: 'revalidate', org: ctx.organizationId, user: target.userId });
    });
  }

  /**
   * S-ADM-07 «Deshabilitar»: la membresía de esta organización queda inactiva.
   * Sus sesiones en esa organización se borran; si no le queda ninguna
   * membresía activa, todas.
   */
  async deactivate(actor: Principal, membershipId: string, input: { reason: string; expectedVersion: number }, meta: RequestMeta): Promise<void> {
    const ctx = requireContext(actor);
    const target = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const found = await this.#loadManageable(tx, actor, membershipId);
      assertVersion(found.version, input.expectedVersion);
      if (found.status !== 'active') throw new HttpError(409, 'membership_not_active');
      await tx
        .update(memberships)
        .set({ status: 'inactive', version: sql`${memberships.version} + 1` })
        .where(eq(memberships.id, membershipId));
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'membership.deactivated',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'membership',
        entityId: membershipId,
        reason: input.reason,
        ...meta,
      });
      return found;
    });

    await this.#resolver.revokeOrganizationSessions(target.userId, ctx.organizationId);
    const remaining = await this.#resolver.loadAssignments(target.userId);
    if (remaining.length === 0) await this.#resolver.revokeUserSessions(target.userId);
  }

  /** S-ADM-09 «Reactivar»: la membresía vuelve a estar activa con sus roles y sedes. La contraseña no cambia. */
  async reactivate(actor: Principal, membershipId: string, input: { reason: string; expectedVersion: number }, meta: RequestMeta): Promise<void> {
    const ctx = requireContext(actor);
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const target = await this.#loadManageable(tx, actor, membershipId);
      assertVersion(target.version, input.expectedVersion);
      if (target.status !== 'inactive') throw new HttpError(409, 'membership_not_inactive');
      await tx
        .update(memberships)
        .set({ status: 'active', version: sql`${memberships.version} + 1` })
        .where(eq(memberships.id, membershipId));
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'membership.reactivated',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'membership',
        entityId: membershipId,
        reason: input.reason,
        ...meta,
      });
    });
  }

  /** S-ADM-08: estado del MFA de la persona, leído antes de restablecerlo. */
  async mfaStatus(actor: Principal, membershipId: string): Promise<MfaStatus> {
    const ctx = requireContext(actor);
    const target = await this.#tenantDb.withTenant(ctx.organizationId, (tx) => this.#loadManageable(tx, actor, membershipId));
    const [u] = await this.#plain
      .select({ twoFactorEnabled: userTable.twoFactorEnabled, mfaResetAt: userTable.mfaResetAt })
      .from(userTable)
      .where(eq(userTable.id, target.userId));
    const [factor] = await this.#plain
      .select({ backupCodes: twoFactorTable.backupCodes, lockedUntil: twoFactorTable.lockedUntil })
      .from(twoFactorTable)
      .where(eq(twoFactorTable.userId, target.userId));
    const enrolled = u?.twoFactorEnabled === true && factor !== undefined;
    return {
      enrolled,
      lockedUntil: factor?.lockedUntil && factor.lockedUntil.getTime() > Date.now() ? factor.lockedUntil.toISOString() : null,
      backupCodesLeft: enrolled ? await this.#countBackupCodes(factor.backupCodes) : null,
      resetPendingSince: u?.mfaResetAt?.toISOString() ?? null,
    };
  }

  /**
   * S-ADM-08: quita el factor TOTP y sus códigos, deja inservible la
   * contraseña y cierra todas las sesiones. Si la membresía está activa,
   * devuelve un enlace de restablecimiento de contraseña (S-ADM-04). Al
   * volver a entrar, solo los roles que exigen MFA deben inscribirse de nuevo.
   */
  async resetMfa(actor: Principal, membershipId: string, reason: string, meta: RequestMeta): Promise<OneTimeLink | null> {
    const ctx = requireContext(actor);
    const authContext = await this.#auth.$context;
    // Contraseña aleatoria que nadie conoce: la anterior deja de funcionar.
    const unusable = await authContext.password.hash(randomBytes(32).toString('base64url'));

    const target = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const found = await this.#loadManageable(tx, actor, membershipId);
      await this.#assertNotShared(tx, found.userId, ctx.organizationId);
      const [u] = await tx
        .select({ twoFactorEnabled: userTable.twoFactorEnabled, mfaResetAt: userTable.mfaResetAt })
        .from(userTable)
        .where(eq(userTable.id, found.userId));
      if (u?.mfaResetAt) throw new HttpError(409, 'mfa_reset_pending');
      if (u?.twoFactorEnabled !== true) throw new HttpError(409, 'mfa_not_enrolled');

      await tx.delete(twoFactorTable).where(eq(twoFactorTable.userId, found.userId));
      await tx
        .update(userTable)
        .set({ twoFactorEnabled: false, mfaResetAt: new Date(), updatedAt: new Date() })
        .where(eq(userTable.id, found.userId));
      await tx
        .update(accountTable)
        .set({ password: unusable, updatedAt: new Date() })
        .where(and(eq(accountTable.userId, found.userId), eq(accountTable.providerId, 'credential')));
      await tx.delete(sessionTable).where(eq(sessionTable.userId, found.userId));
      await tx.delete(verificationTable).where(eq(verificationTable.value, found.userId));
      await this.#bumpVersion(tx, membershipId);
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'user.mfa_reset',
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

    if (target.status !== 'active') return null;
    return this.#issuePasswordReset(target.userId);
  }

  /**
   * «Crear restablecimiento de contraseña» (S-ADM-02) y «Emitir un token
   * nuevo» (S-ADM-08): cualquier enlace anterior deja de funcionar.
   */
  async createPasswordReset(actor: Principal, membershipId: string, reason: string, meta: RequestMeta): Promise<OneTimeLink> {
    const ctx = requireContext(actor);
    const target = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const found = await this.#loadManageable(tx, actor, membershipId);
      if (found.status !== 'active') throw new HttpError(409, 'membership_not_active');
      await this.#assertNotShared(tx, found.userId, ctx.organizationId);
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'user.password_reset_created',
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
    return this.#issuePasswordReset(target.userId);
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

  /**
   * Token de restablecimiento en el formato de Better Auth
   * («reset-password:<token>», guardado con hash; ver auth.ts), para que
   * /api/auth/reset-password lo consuma. Antes se borran los anteriores.
   */
  async #issuePasswordReset(userId: string): Promise<OneTimeLink> {
    const authContext = await this.#auth.$context;
    await this.#plain.delete(verificationTable).where(eq(verificationTable.value, userId));
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.#config.passwordResetTtlSeconds * 1000);
    await authContext.internalAdapter.createVerificationValue({ value: userId, identifier: `reset-password:${token}`, expiresAt });
    return { link: `${this.#config.baseURL}/restablecer/${token}`, expiresAt: expiresAt.toISOString() };
  }

  /** Cuántos códigos de recuperación quedan. Se descifran solo para contarlos. */
  async #countBackupCodes(encrypted: string): Promise<number | null> {
    try {
      const authContext = await this.#auth.$context;
      const codes: unknown = JSON.parse(await symmetricDecrypt({ key: authContext.secretConfig, data: encrypted }));
      return Array.isArray(codes) ? codes.length : null;
    } catch {
      return null;
    }
  }

  async #sharedAccounts(userIds: string[], organizationId: string): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await this.#plain.execute<{ user_id: string; shared: boolean }>(
      sql`select u as user_id, app.has_active_membership_elsewhere(u, ${organizationId}::uuid) as shared
            from unnest(${`{${userIds.join(',')}}`}::uuid[]) as u`,
    );
    return new Set(rows.rows.filter((r) => r.shared).map((r) => r.user_id));
  }

  async #assertNotShared(tx: Tx, userId: string, organizationId: string): Promise<void> {
    const result = await tx.execute<{ shared: boolean }>(
      sql`select app.has_active_membership_elsewhere(${userId}::uuid, ${organizationId}::uuid) as shared`,
    );
    if (result.rows[0]?.shared) throw new HttpError(409, 'account_shared');
  }

  async #bumpVersion(tx: Tx, membershipId: string): Promise<void> {
    await tx.update(memberships).set({ version: sql`${memberships.version} + 1` }).where(eq(memberships.id, membershipId));
  }

  async #load(tx: Tx, membershipId: string) {
    const [membership] = await tx
      .select({ userId: memberships.userId, status: memberships.status, version: memberships.version })
      .from(memberships)
      .where(eq(memberships.id, membershipId))
      .for('update');
    if (!membership) throw new HttpError(404, 'membership_not_found');
    const roles = await tx
      .select({ role: membershipRoles.role })
      .from(membershipRoles)
      .where(eq(membershipRoles.membershipId, membershipId));
    return { ...membership, roles: roles.flatMap((r) => (isRole(r.role) ? [r.role] : [])) };
  }

  /** Carga la membresía y aplica la regla escalonada: nunca la propia ni una de rango igual o mayor. */
  async #loadManageable(tx: Tx, actor: Principal, membershipId: string) {
    const ctx = requireContext(actor);
    const target = await this.#load(tx, membershipId);
    if (target.userId === actor.userId) throw new HttpError(403, 'cannot_modify_self');
    if (!canManageMember(rolesInOrganization(actor.assignments, ctx.organizationId), target.roles)) {
      throw new HttpError(403, 'member_not_manageable');
    }
    return target;
  }
}

function assertVersion(current: number, expected: number): void {
  if (current !== expected) throw new HttpError(409, 'version_conflict');
}

export function assertOrgWide(role: Role, locationId: string | null): void {
  if (locationId === null && !ORG_WIDE_ROLES.includes(role)) throw new HttpError(400, 'location_required');
}

function uniqueAssignments(assignments: Assignment[]): Assignment[] {
  const seen = new Set<string>();
  return assignments.filter((a) => {
    const key = `${a.role}:${a.locationId ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
