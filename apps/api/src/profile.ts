import { session as sessionTable, twoFactor as twoFactorTable, user as userTable, type TenantDb } from '@clinic/db';
import { APIError } from 'better-auth/api';
import { generateRandomString, symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto';
import { and, eq, ne, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import type { AuditService } from './audit.ts';
import type { Auth } from './auth.ts';
import type { AppConfig } from './config.ts';
import type { Principal } from './principal.ts';
import { HttpError, requireContext, type RequestMeta } from './services.ts';
import { SignInLimiter } from './sign-in-limits.ts';

// Perfil (S-GEN-21 a 25, T-006b; ADR 0023, condición 3). Lo que la persona
// hace sobre su propia cuenta:
//  - cambiar la contraseña (con la actual), cerrando sus demás sesiones;
//  - regenerar los códigos de recuperación o desactivar el MFA, confirmando
//    con un código actual de la aplicación (S-GEN-24). Desactivarlo no se
//    permite si alguno de sus roles lo exige (Propietario, Administrador).
// Los endpoints de Better Auth equivalentes (/change-password,
// /two-factor/disable y /two-factor/generate-backup-codes) están cerrados a
// las peticiones HTTP (auth.ts): estos son el único camino. Cada acción se
// audita en la organización y la sede activas.

/** Better Auth en 1.7.7: 10 códigos, «xxxxx-xxxxx», cifrados con el secreto (storeBackupCodes: 'encrypted'). */
const BACKUP_CODES = 10;

export interface OwnMfaStatus {
  enrolled: boolean;
  /** Alguno de sus roles (en cualquier organización) exige el MFA. */
  required: boolean;
  lockedUntil: string | null;
  backupCodesLeft: number | null;
}

export class ProfileService {
  readonly #plain;
  readonly #tenantDb: TenantDb;
  readonly #auth: Auth;
  readonly #audit: AuditService;
  readonly #limiter: SignInLimiter;
  readonly #maxCodeFailures: number;
  readonly #lockMs: number;

  constructor(pool: pg.Pool, tenantDb: TenantDb, auth: Auth, audit: AuditService, config: AppConfig) {
    this.#plain = drizzle({ client: pool });
    this.#tenantDb = tenantDb;
    this.#auth = auth;
    this.#audit = audit;
    this.#limiter = new SignInLimiter(pool, config.signInAccountMaxFailures, config.signInAccountWindowSeconds);
    this.#maxCodeFailures = config.twoFactorMaxFailures;
    this.#lockMs = config.twoFactorLockSeconds * 1000;
  }

  /** S-GEN-22: estado del propio factor. */
  async mfaStatus(principal: Principal): Promise<OwnMfaStatus> {
    const [factor] = await this.#plain
      .select({ backupCodes: twoFactorTable.backupCodes, lockedUntil: twoFactorTable.lockedUntil })
      .from(twoFactorTable)
      .where(and(eq(twoFactorTable.userId, principal.userId), eq(twoFactorTable.verified, true)));
    const enrolled = principal.twoFactorEnabled && factor !== undefined;
    return {
      enrolled,
      required: principal.mfaRequired,
      lockedUntil: factor?.lockedUntil && factor.lockedUntil.getTime() > Date.now() ? factor.lockedUntil.toISOString() : null,
      backupCodesLeft: enrolled ? await this.#countBackupCodes(factor.backupCodes) : null,
    };
  }

  /**
   * Cambia la contraseña con Better Auth (política del ADR 0023 en su hook) y
   * cierra las demás sesiones de la cuenta; esta sigue abierta con su sede.
   * Las contraseñas actuales incorrectas cuentan para el límite por cuenta del
   * inicio de sesión.
   */
  async changePassword(
    principal: Principal,
    input: { currentPassword: string; newPassword: string },
    headers: Headers,
    meta: RequestMeta,
  ): Promise<{ otherSessionsClosed: number }> {
    const ctx = requireContext(principal);
    const key = this.#audit.hmacEmail(principal.email);
    if (await this.#limiter.isLocked(key)) throw new HttpError(429, 'too_many_attempts');
    try {
      await this.#auth.api.changePassword({
        body: { currentPassword: input.currentPassword, newPassword: input.newPassword, revokeOtherSessions: false },
        headers,
      });
    } catch (error) {
      const code = apiErrorCode(error);
      if (code === 'INVALID_PASSWORD') {
        await this.#limiter.recordFailure(key);
        throw new HttpError(400, 'invalid_password');
      }
      if (code === 'PASSWORD_TOO_SHORT' || code === 'PASSWORD_TOO_LONG' || code === 'password_too_common') throw new HttpError(400, code);
      throw error;
    }
    await this.#limiter.reset(key);

    const closed = await this.#plain
      .delete(sessionTable)
      .where(and(eq(sessionTable.userId, principal.userId), ne(sessionTable.id, principal.sessionId)))
      .returning({ id: sessionTable.id });
    await this.#audit.organization(ctx.organizationId, {
      action: 'user.password_changed',
      actorType: 'user',
      actorId: principal.userId,
      locationId: ctx.locationId,
      entityType: 'user',
      entityId: principal.userId,
      ...meta,
      metadata: { otherSessionsClosed: closed.length },
    });
    return { otherSessionsClosed: closed.length };
  }

  /** S-GEN-24 «Nuevos códigos de recuperación» → S-GEN-25. Los anteriores dejan de servir. */
  async regenerateRecoveryCodes(principal: Principal, code: string, headers: Headers, meta: RequestMeta): Promise<{ backupCodes: string[] }> {
    const ctx = requireContext(principal);
    await this.#verifyCode(principal, code, headers, meta);
    const backupCodes = Array.from({ length: BACKUP_CODES }, () => {
      const raw = generateRandomString(10, 'a-z', '0-9', 'A-Z');
      return `${raw.slice(0, 5)}-${raw.slice(5)}`;
    });
    const authContext = await this.#auth.$context;
    const encrypted = await symmetricEncrypt({ key: authContext.secretConfig, data: JSON.stringify(backupCodes) });
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const updated = await tx
        .update(twoFactorTable)
        .set({ backupCodes: encrypted })
        .where(eq(twoFactorTable.userId, principal.userId))
        .returning({ id: twoFactorTable.id });
      if (updated.length === 0) throw new HttpError(409, 'mfa_not_enrolled');
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'user.mfa_recovery_codes_regenerated',
        actorType: 'user',
        actorId: principal.userId,
        locationId: ctx.locationId,
        entityType: 'user',
        entityId: principal.userId,
        ...meta,
      });
    });
    return { backupCodes };
  }

  /** S-GEN-24 «Desactivar»: solo sin un rol que exija el MFA. */
  async disableMfa(principal: Principal, code: string, headers: Headers, meta: RequestMeta): Promise<void> {
    const ctx = requireContext(principal);
    if (principal.mfaRequired) throw new HttpError(403, 'mfa_required_for_role');
    await this.#verifyCode(principal, code, headers, meta);
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      await tx.delete(twoFactorTable).where(eq(twoFactorTable.userId, principal.userId));
      await tx.update(userTable).set({ twoFactorEnabled: false, updatedAt: new Date() }).where(eq(userTable.id, principal.userId));
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'user.mfa_disabled',
        actorType: 'user',
        actorId: principal.userId,
        locationId: ctx.locationId,
        entityType: 'user',
        entityId: principal.userId,
        ...meta,
      });
    });
  }

  /**
   * Comprueba el código con Better Auth (llamada de servidor sobre la sesión
   * abierta). En 1.7.7, con sesión, Better Auth NO aplica su bloqueo por
   * cuenta (solo lo hace al iniciar sesión): aquí se aplica el mismo, sobre
   * sus columnas (failed_verification_count, locked_until), así el Perfil y el
   * inicio de sesión comparten el contador. El hook de auditoría de Better
   * Auth no registra estas llamadas como un acceso; el fallo se audita aquí.
   */
  async #verifyCode(principal: Principal, code: string, headers: Headers, meta: RequestMeta): Promise<void> {
    if (!principal.twoFactorEnabled) throw new HttpError(409, 'mfa_not_enrolled');
    const now = Date.now();
    const [factor] = await this.#plain
      .select({ lockedUntil: twoFactorTable.lockedUntil })
      .from(twoFactorTable)
      .where(eq(twoFactorTable.userId, principal.userId));
    if (!factor) throw new HttpError(409, 'mfa_not_enrolled');
    if (factor.lockedUntil && factor.lockedUntil.getTime() > now) throw new HttpError(429, 'mfa_locked');
    if (factor.lockedUntil) {
      // Bloqueo vencido: se empieza de cero, como hace Better Auth.
      await this.#plain.update(twoFactorTable).set({ failedVerificationCount: 0, lockedUntil: null }).where(eq(twoFactorTable.userId, principal.userId));
    }

    try {
      await this.#auth.api.verifyTOTP({ body: { code }, headers });
    } catch (error) {
      if (apiErrorCode(error) !== 'INVALID_CODE') throw error;
      const lockAt = new Date(now + this.#lockMs);
      // Atómico: dos fallos a la vez no pierden la cuenta.
      await this.#plain
        .update(twoFactorTable)
        .set({
          failedVerificationCount: sql`coalesce(${twoFactorTable.failedVerificationCount}, 0) + 1`,
          lockedUntil: sql`case when coalesce(${twoFactorTable.failedVerificationCount}, 0) + 1 >= ${this.#maxCodeFailures} then ${lockAt.toISOString()}::timestamptz else ${twoFactorTable.lockedUntil} end`,
        })
        .where(eq(twoFactorTable.userId, principal.userId));
      await this.#audit.platform({
        action: 'auth.mfa.failure',
        actorType: 'user',
        actorId: principal.userId,
        ...meta,
        metadata: { method: 'totp', purpose: 'profile' },
      });
      throw new HttpError(400, 'invalid_code');
    }
    await this.#plain.update(twoFactorTable).set({ failedVerificationCount: 0 }).where(eq(twoFactorTable.userId, principal.userId));
  }

  async #countBackupCodes(encrypted: string): Promise<number | null> {
    try {
      const authContext = await this.#auth.$context;
      const codes: unknown = JSON.parse(await symmetricDecrypt({ key: authContext.secretConfig, data: encrypted }));
      return Array.isArray(codes) ? codes.length : null;
    } catch {
      return null;
    }
  }
}

/** Código de un APIError de Better Auth («INVALID_PASSWORD», «INVALID_CODE»…). */
function apiErrorCode(error: unknown): string | null {
  if (!(error instanceof APIError)) return null;
  const code = (error.body as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? code : null;
}
