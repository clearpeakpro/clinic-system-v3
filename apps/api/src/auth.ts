import { authSchema, account, session, twoFactor as twoFactorTable, user, verification } from '@clinic/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { twoFactor } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import type { AuditService } from './audit.ts';
import type { AppConfig } from './config.ts';
import type { LogSink } from './logging.ts';

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

  return betterAuth({
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
    // Longitud mínima: la de Better Auth (8). La política de contraseñas no está
    // decidida todavía (se anota en el PR).
    emailAndPassword: { enabled: true, autoSignIn: false },
    user: {
      additionalFields: {
        disabledAt: { type: 'date', required: false, input: false },
      },
    },
    session: {
      // Inactividad: expiración deslizante. updateAge corto para que cada uso
      // extienda la sesión. La expiración absoluta la aplica nuestro guard.
      expiresIn: config.idleTimeoutSeconds,
      updateAge: Math.min(60, Math.floor(config.idleTimeoutSeconds / 2)),
      // Condición 4: sin cookieCache. Cada petición consulta la base de datos,
      // así la revocación es inmediata.
      cookieCache: { enabled: false },
      additionalFields: {
        activeOrganizationId: { type: 'string', required: false, input: false },
        activeLocationId: { type: 'string', required: false, input: false },
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
      }),
    ],
    databaseHooks: {
      session: {
        create: {
          // Un usuario desactivado no puede abrir sesiones nuevas.
          before: async (newSession) => {
            const { rows } = await pool.query<{ disabled_at: Date | null }>(
              'select disabled_at from auth."user" where id = $1',
              [newSession.userId],
            );
            if (rows[0]?.disabled_at) {
              throw new APIError('FORBIDDEN', { message: 'Usuario desactivado', code: 'user_disabled' });
            }
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware((ctx) => {
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
        return Promise.resolve();
      }),
      after: createAuthMiddleware(async (ctx) => {
        const ip = ipOf(ctx.headers);
        const requestId = requestIdOf(ctx.headers);
        const returned = ctx.context.returned;
        const failed = returned instanceof APIError;
        const newSession = ctx.context.newSession;

        switch (ctx.path) {
          case '/sign-in/email': {
            // OJO: este hook corre ANTES que el del plugin twoFactor. Aquí
            // newSession todavía existe aunque el plugin la descarte después
            // (twoFactorRedirect). Con trustDevice desactivado, un usuario con
            // TOTP siempre queda pendiente del segundo factor.
            if (newSession && (newSession.user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled) {
              await audit.platform({ action: 'auth.sign_in.mfa_required', actorType: 'user', actorId: newSession.user.id, ip, requestId });
            } else if (newSession) {
              await audit.platform({ action: 'auth.sign_in.success', actorType: 'user', actorId: newSession.user.id, ip, requestId });
            } else if (failed) {
              const email = (ctx.body as { email?: unknown } | undefined)?.email;
              await audit.platform({
                action: 'auth.sign_in.failure',
                actorType: 'anonymous',
                ip,
                requestId,
                metadata: typeof email === 'string' ? { emailHmac: audit.hmacEmail(email) } : {},
              });
            }
            break;
          }
          case '/two-factor/enable':
            if (!failed && ctx.context.session) {
              await audit.platform({ action: 'auth.mfa.enrollment_started', actorType: 'user', actorId: ctx.context.session.user.id, ip, requestId });
            }
            break;
          case '/two-factor/verify-totp':
          case '/two-factor/verify-backup-code': {
            const method = ctx.path.endsWith('totp') ? 'totp' : 'backup_code';
            const actorId = newSession?.user.id ?? ctx.context.session?.user.id;
            await audit.platform({
              action: failed ? 'auth.mfa.failure' : 'auth.mfa.success',
              actorType: actorId ? 'user' : 'anonymous',
              actorId,
              ip,
              requestId,
              metadata: { method },
            });
            break;
          }
          case '/sign-out':
            if (ctx.context.session) {
              await audit.platform({ action: 'auth.sign_out', actorType: 'user', actorId: ctx.context.session.user.id, ip, requestId });
            }
            break;
        }
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
