import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@clinic/shared';
import { authSchema, account, session, twoFactor as twoFactorTable, user, verification } from '@clinic/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { twoFactor } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import type { AuditService } from './audit.ts';
import { IDLE_GRACE_SECONDS, type AppConfig } from './config.ts';
import type { LogSink } from './logging.ts';
import { checkPassword } from './password-policy.ts';
import { SignInLimiter } from './sign-in-limits.ts';

/** Encabezado que pone nuestro montaje con la IP vista por Fastify. Se sobrescribe siempre. */
export const CLIENT_IP_HEADER = 'x-clinic-client-ip';
/** Encabezado interno con el id de petición de Fastify, para la auditoría. Se sobrescribe siempre. */
export const REQUEST_ID_HEADER = 'x-clinic-request-id';

// ADR 0023. Better Auth fijado en 1.7.7 (publicada el 2026-09-30). Antes de
// actualizarlo: apps/api/README.md, «Al actualizar Better Auth».

export interface AuthDeps {
  config: AppConfig;
  pool: pg.Pool;
  audit: AuditService;
  logs: LogSink;
}

export function createAuth({ config, pool, audit, logs }: AuthDeps) {
  // Better Auth usa el mismo pool de clinic_app, sin withTenant: el esquema
  // auth es global y no tiene RLS de organización.
  const db = drizzle({ client: pool });

  const ipOf = (headers: Headers | undefined) => headers?.get(CLIENT_IP_HEADER) ?? null;
  const requestIdOf = (headers: Headers | undefined) => headers?.get(REQUEST_ID_HEADER) ?? undefined;
  const limiter = new SignInLimiter(pool, config.signInAccountMaxFailures, config.signInAccountWindowSeconds);
  /**
   * Eventos de autenticación fail-closed (T-008, ADR 0023): Better Auth no
   * abre transacción al iniciar sesión, así que el evento no puede ir en la
   * misma transacción que la sesión. Si no se puede escribir, la petición
   * responde 503 en lugar de seguir sin dejar rastro.
   */
  // En 1.7.7, un error en un hook «after» cambia el cuerpo de la respuesta
  // pero no su estado (p. ej. un 401 seguiría siendo 401). Por eso además se
  // anota el id de la petición, y el montaje de Fastify (app.ts) responde 503.
  const auditFailures = new Set<string>();
  const record = async (event: Parameters<AuditService['platform']>[0]) => {
    try {
      await audit.platform(event);
    } catch {
      if (event.requestId) auditFailures.add(event.requestId);
      throw new APIError('SERVICE_UNAVAILABLE', { message: 'Auditoría no disponible', code: 'audit_unavailable' });
    }
  };
  const emailOf = (body: unknown) => {
    const email = (body as { email?: unknown } | undefined)?.email;
    return typeof email === 'string' ? email : null;
  };

  const auth = betterAuth({
    appName: 'Clinic System',
    baseURL: config.baseURL,
    secret: config.authSecret,
    trustedOrigins: config.trustedOrigins,
    // Condición 4: telemetría apagada (en 1.7.x ya viene apagada; lo fijamos).
    telemetry: { enabled: false },
    database: drizzleAdapter(db, {
      provider: 'pg',
      schemaName: authSchema.schemaName,
      schema: { user, session, account, verification, twoFactor: twoFactorTable },
    }),
    // autoSignIn: false: crear la cuenta al aceptar una invitación no abre sesión.
    // No se usa disableSignUp: también bloquea la creación desde el servidor
    // (informe T-002). El registro público se cierra con el hook de abajo.
    // Política de contraseñas (ADR 0023): Better Auth aplica la longitud en
    // alta, cambio y restablecimiento; el hook de abajo, la lista de comunes.
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      // Restablecimiento (S-GEN-10, T-006a): el token lo emite solo un
      // administrador (users.ts); /request-password-reset queda cerrado (no
      // hay sendResetPassword y el hook de abajo lo rechaza). Al fijar la
      // contraseña nueva se cierran todas las sesiones y se borra la marca de
      // restablecimiento del MFA.
      resetPasswordTokenExpiresIn: config.passwordResetTtlSeconds,
      revokeSessionsOnPasswordReset: true,
      onPasswordReset: async ({ user: resetUser }) => {
        await pool.query('update auth."user" set mfa_reset_at = null where id = $1', [resetUser.id]);
        // Corre después de fijar la contraseña: si la auditoría falla, la
        // respuesta es 503, pero la contraseña ya cambió.
        await record({ action: 'auth.password_reset.completed', actorType: 'user', actorId: resetUser.id, ip: null });
      },
    },
    // Los tokens de restablecimiento se guardan con hash (SHA-256), como el
    // secreto de las invitaciones: la tabla verification no los tiene en claro.
    verification: {
      storeIdentifier: { default: 'plain', overrides: { 'reset-password:': 'hashed' } },
    },
    user: {
      additionalFields: {
        disabledAt: { type: 'date', required: false, input: false },
        mfaResetAt: { type: 'date', required: false, input: false },
      },
    },
    session: {
      // Inactividad: expiración deslizante. updateAge corto para que cada uso
      // extienda la sesión. La expiración absoluta la aplica nuestro guard.
      // El servidor corta a límite + 2 min sin actividad (S-GEN-20); la web
      // cierra antes, al llegar al límite.
      expiresIn: config.idleTimeoutSeconds + IDLE_GRACE_SECONDS,
      updateAge: Math.min(60, Math.floor(config.idleTimeoutSeconds / 2)),
      // Condición 4: sin cookieCache. Cada petición consulta la base de datos,
      // así la revocación es inmediata.
      cookieCache: { enabled: false },
      additionalFields: {
        activeOrganizationId: { type: 'string', required: false, input: false },
        activeLocationId: { type: 'string', required: false, input: false },
      },
    },
    // Límite por IP (ADR 0023): el de Better Auth, activo en TODOS los
    // entornos (por defecto solo en producción). Todo el personal de una
    // clínica comparte la IP pública, y la regla de 1.7.7 (3 cada 10 s) la
    // bloquearía, así que el inicio de sesión (30 por minuto) y /two-factor/*
    // (20 por minuto) tienen la suya, configurable. El resto conserva las
    // reglas de 1.7.7 (/sign-up* y /change-password: 3 cada 10 s). La IP sale
    // de CLIENT_IP_HEADER, que pone el servidor. En memoria: vale con una
    // instancia (entorno B).
    rateLimit: {
      enabled: true,
      storage: 'memory',
      customRules: {
        '/sign-in/*': { window: config.signInIpWindowSeconds, max: config.signInIpMaxAttempts },
        '/two-factor/*': { window: config.twoFactorIpWindowSeconds, max: config.twoFactorIpMaxAttempts },
      },
    },
    advanced: {
      database: { generateId: () => uuidv7() },
      useSecureCookies: config.secureCookies,
      defaultCookieAttributes: { sameSite: 'lax', httpOnly: true },
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    logger: {
      level: 'error',
      log: (level, message) => {
        logs.write({ source: 'better-auth', level, message });
      },
    },
    plugins: [
      twoFactor({
        issuer: 'Clinic System',
        // Condición 4: por defecto los códigos de recuperación se guardan en
        // JSON sin cifrar.
        backupCodeOptions: { storeBackupCodes: 'encrypted' },
        // Bloqueo por cuenta (ADR 0023): tras N códigos incorrectos seguidos,
        // desde cualquier IP, la verificación queda bloqueada un tiempo.
        // Es el valor por defecto de 1.7.7, fijado aquí para que no cambie
        // con una actualización.
        accountLockout: {
          enabled: true,
          maxFailedAttempts: config.twoFactorMaxFailures,
          durationSeconds: config.twoFactorLockSeconds,
        },
      }),
    ],
    databaseHooks: {
      session: {
        create: {
          // Un usuario desactivado no puede abrir sesiones nuevas. Y ninguna
          // sesión existe sin su evento: se escribe ANTES de crearla, y si no
          // se puede, la sesión no se crea (503).
          before: async (newSession, ctx) => {
            const { rows } = await pool.query<{ disabled_at: Date | null; two_factor_enabled: boolean | null }>(
              'select disabled_at, two_factor_enabled from auth."user" where id = $1',
              [newSession.userId],
            );
            if (rows[0]?.disabled_at) {
              throw new APIError('FORBIDDEN', { message: 'Usuario desactivado', code: 'user_disabled' });
            }
            const path = ctx?.path ?? '';
            const ip = ipOf(ctx?.headers);
            const requestId = requestIdOf(ctx?.headers);
            if (path === '/sign-in/email') {
              // Con TOTP, el plugin descarta esta sesión y pide el código (twoFactorRedirect).
              await record({
                action: rows[0]?.two_factor_enabled ? 'auth.sign_in.mfa_required' : 'auth.sign_in.success',
                actorType: 'user',
                actorId: newSession.userId,
                ip,
                requestId,
              });
            } else if (path === '/two-factor/verify-totp' || path === '/two-factor/verify-backup-code') {
              await record({
                action: 'auth.mfa.success',
                actorType: 'user',
                actorId: newSession.userId,
                ip,
                requestId,
                metadata: { method: path.endsWith('totp') ? 'totp' : 'backup_code' },
              });
            } else {
              await record({ action: 'auth.session.created', actorType: 'user', actorId: newSession.userId, ip, requestId, metadata: { path } });
            }
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // Límite por cuenta (ADR 0023), además del de IP de Better Auth.
        if (ctx.path === '/sign-in/email') {
          const email = emailOf(ctx.body);
          if (email && (await limiter.isLocked(audit.hmacEmail(email)))) {
            await record({
              action: 'auth.sign_in.throttled',
              actorType: 'anonymous',
              ip: ipOf(ctx.headers),
              requestId: requestIdOf(ctx.headers),
              metadata: { emailHmac: audit.hmacEmail(email) },
            });
            throw new APIError('TOO_MANY_REQUESTS', {
              message: 'Demasiados intentos. Espere unos minutos.',
              code: 'too_many_attempts',
            });
          }
        }
        // Lista de contraseñas comunes en todo punto que fija una contraseña
        // (también en las llamadas de servidor, como al aceptar una invitación).
        const body = ctx.body as { password?: unknown; newPassword?: unknown } | undefined;
        const newPassword =
          ctx.path === '/sign-up/email' ? body?.password : ['/change-password', '/reset-password'].includes(ctx.path) ? body?.newPassword : undefined;
        if (typeof newPassword === 'string' && checkPassword(newPassword) === 'password_too_common') {
          throw new APIError('BAD_REQUEST', { message: 'Contraseña demasiado común', code: 'password_too_common' });
        }
        // Sin «¿olvidó su contraseña?» público: el restablecimiento lo emite un
        // administrador (S-ADM-02).
        if (ctx.path === '/request-password-reset' || ctx.path.startsWith('/reset-password/')) {
          throw new APIError('FORBIDDEN', { message: 'Restablecimiento solo por un administrador', code: 'password_reset_by_admin_only' });
        }
        // El cierre de sesión se audita antes de borrar la sesión (fail-closed).
        if (ctx.path === '/sign-out') {
          const current = await getSessionFromCtx(ctx);
          if (current) {
            await record({ action: 'auth.sign_out', actorType: 'user', actorId: current.user.id, ip: ipOf(ctx.headers), requestId: requestIdOf(ctx.headers) });
          }
        }
        // Perfil (T-006b): cambiar la contraseña, desactivar el MFA y regenerar
        // los códigos de recuperación solo pasan por /api/me/* (profile.ts),
        // que confirma con un código de la aplicación, aplica la regla de
        // roles y audita. Better Auth los ofrece por HTTP solo con la contraseña.
        if (ctx.request && ['/change-password', '/two-factor/disable', '/two-factor/generate-backup-codes'].includes(ctx.path)) {
          throw new APIError('FORBIDDEN', { message: 'Use el Perfil', code: 'use_profile' });
        }
        // Registro público cerrado: solo el servidor crea usuarios, al aceptar
        // una invitación. Las llamadas de auth.api no traen `request`.
        if (ctx.path === '/sign-up/email' && ctx.request) {
          throw new APIError('FORBIDDEN', { message: 'Registro cerrado', code: 'sign_up_disabled' });
        }
        // ADR 0023: sin «dispositivo de confianza» (saltarse el TOTP durante
        // 30 días) para el personal.
        if (ctx.path.startsWith('/two-factor/verify-') && (ctx.body as { trustDevice?: unknown } | undefined)?.trustDevice) {
          throw new APIError('BAD_REQUEST', { message: 'trustDevice no permitido', code: 'trust_device_disabled' });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const ip = ipOf(ctx.headers);
        const requestId = requestIdOf(ctx.headers);
        const returned = ctx.context.returned;
        const failed = returned instanceof APIError;
        const newSession = ctx.context.newSession;

        switch (ctx.path) {
          case '/sign-in/email': {
            const email = emailOf(ctx.body);
            if (email) {
              // Contraseña correcta (con o sin MFA pendiente): se olvidan los fallos.
              if (newSession) await limiter.reset(audit.hmacEmail(email));
              else if (failed) await limiter.recordFailure(audit.hmacEmail(email));
            }
            // El éxito (y mfa_required) se audita al crear la sesión (databaseHooks).
            if (!newSession && failed) {
              await record({
                action: 'auth.sign_in.failure',
                actorType: 'anonymous',
                ip,
                requestId,
                metadata: email ? { emailHmac: audit.hmacEmail(email) } : {},
              });
            }
            break;
          }
          case '/two-factor/enable':
            if (!failed && ctx.context.session) {
              await record({ action: 'auth.mfa.enrollment_started', actorType: 'user', actorId: ctx.context.session.user.id, ip, requestId });
            }
            break;
          case '/two-factor/verify-totp':
          case '/two-factor/verify-backup-code': {
            // Las llamadas de servidor del Perfil (profile.ts) confirman una
            // acción, no son un acceso: las audita el propio servicio. El éxito
            // de un inicio de sesión se audita al crear la sesión (databaseHooks).
            if (!ctx.request || !failed) break;
            const method = ctx.path.endsWith('totp') ? 'totp' : 'backup_code';
            const actorId = ctx.context.session?.user.id;
            await record({
              action: 'auth.mfa.failure',
              actorType: actorId ? 'user' : 'anonymous',
              actorId,
              ip,
              requestId,
              metadata: { method },
            });
            break;
          }
        }
      }),
    },
  });
  return Object.assign(auth, {
    /** true (una sola vez) si en esa petición no se pudo escribir un evento de auditoría. */
    consumeAuditFailure(requestId: string): boolean {
      return auditFailures.delete(requestId);
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
