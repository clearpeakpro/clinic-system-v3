import { z } from 'zod';

export interface AppConfig {
  /** Conexión como clinic_app. Nunca clinic_migrator ni superusuario. */
  databaseUrl: string;
  baseURL: string;
  /** Orígenes (además de baseURL) desde los que se aceptan peticiones con cookies. */
  trustedOrigins: string[];
  /** Secreto de Better Auth (firma de cookies, cifrado de TOTP y códigos de recuperación). */
  authSecret: string;
  /** Clave del HMAC-SHA256 con que se guarda el correo de un inicio de sesión fallido. */
  auditHmacKey: string;
  /**
   * Límite de inactividad del cliente, en segundos (S-GEN-20: 15 min por
   * defecto). La web cierra la sesión al llegar a él; el servidor la corta a
   * los IDLE_GRACE_SECONDS siguientes sin actividad (manual: límite + 2 min).
   */
  idleTimeoutSeconds: number;
  /** Expiración absoluta desde el inicio de sesión, en segundos (nuestro guard). */
  absoluteTimeoutSeconds: number;
  invitationTtlSeconds: number;
  /** Vigencia del enlace de restablecimiento de contraseña que emite un administrador (S-ADM-04). */
  passwordResetTtlSeconds: number;
  /**
   * Límite por cuenta (ADR 0023): con este número de inicios de sesión
   * fallidos dentro de la ventana, la cuenta responde 429 hasta que los fallos
   * salen de la ventana. El límite por IP lo pone Better Auth.
   */
  signInAccountMaxFailures: number;
  signInAccountWindowSeconds: number;
  /**
   * Límite por IP del inicio de sesión (Better Auth). Holgado porque todo el
   * personal de una clínica sale por la misma IP pública.
   */
  signInIpMaxAttempts: number;
  signInIpWindowSeconds: number;
  /**
   * Límite por IP de /two-factor/* (Better Auth): inscripción, códigos TOTP y
   * de recuperación. Holgado por la misma razón que el del inicio de sesión.
   * El bloqueo por cuenta tras varios códigos incorrectos es aparte
   * (twoFactorMaxFailures).
   */
  twoFactorIpMaxAttempts: number;
  twoFactorIpWindowSeconds: number;
  /** Bloqueo por cuenta del plugin twoFactor: códigos incorrectos seguidos y duración. */
  twoFactorMaxFailures: number;
  twoFactorLockSeconds: number;
  /** Fuerza Secure y el prefijo __Secure- en las cookies. Siempre en producción. */
  secureCookies: boolean;
  /** Detrás de Caddy: confiar en X-Forwarded-For para la IP del cliente. */
  trustProxy: boolean;
  /**
   * Clave del cifrado del payload del outbox (T-008): la comparten la API, el
   * worker y org:create. Al menos 32 caracteres.
   */
  outboxKey: string;
  /**
   * Revalidación periódica de cada socket (T-009): sesión, membresía y sede.
   * Cubre lo que no avisa al instante el canal de tiempo real.
   */
  realtimeRevalidateSeconds: number;
}

/** Margen del servidor sobre el límite de inactividad del cliente (S-GEN-20). */
export const IDLE_GRACE_SECONDS = 120;

export const DEFAULTS = {
  idleTimeoutSeconds: 15 * 60,
  absoluteTimeoutSeconds: 12 * 60 * 60,
  invitationTtlSeconds: 48 * 60 * 60,
  passwordResetTtlSeconds: 48 * 60 * 60,
  signInAccountMaxFailures: 10,
  signInAccountWindowSeconds: 15 * 60,
  signInIpMaxAttempts: 30,
  signInIpWindowSeconds: 60,
  twoFactorIpMaxAttempts: 20,
  twoFactorIpWindowSeconds: 60,
  twoFactorMaxFailures: 10,
  twoFactorLockSeconds: 15 * 60,
  realtimeRevalidateSeconds: 30,
} as const;

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const seconds = z.coerce.number().int().positive();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_APP_URL: z.url(),
  BASE_URL: z.url(),
  TRUSTED_ORIGINS: z.string().default(''),
  BETTER_AUTH_SECRET: z.string().min(32),
  AUDIT_HMAC_KEY: z.string().min(32),
  IDLE_TIMEOUT_SECONDS: seconds.default(DEFAULTS.idleTimeoutSeconds),
  ABSOLUTE_TIMEOUT_SECONDS: seconds.default(DEFAULTS.absoluteTimeoutSeconds),
  INVITATION_TTL_SECONDS: seconds.default(DEFAULTS.invitationTtlSeconds),
  PASSWORD_RESET_TTL_SECONDS: seconds.default(DEFAULTS.passwordResetTtlSeconds),
  SIGN_IN_ACCOUNT_MAX_FAILURES: seconds.default(DEFAULTS.signInAccountMaxFailures),
  SIGN_IN_ACCOUNT_WINDOW_SECONDS: seconds.default(DEFAULTS.signInAccountWindowSeconds),
  SIGN_IN_IP_MAX_ATTEMPTS: seconds.default(DEFAULTS.signInIpMaxAttempts),
  SIGN_IN_IP_WINDOW_SECONDS: seconds.default(DEFAULTS.signInIpWindowSeconds),
  TWO_FACTOR_IP_MAX_ATTEMPTS: seconds.default(DEFAULTS.twoFactorIpMaxAttempts),
  TWO_FACTOR_IP_WINDOW_SECONDS: seconds.default(DEFAULTS.twoFactorIpWindowSeconds),
  TWO_FACTOR_MAX_FAILURES: seconds.default(DEFAULTS.twoFactorMaxFailures),
  TWO_FACTOR_LOCK_SECONDS: seconds.default(DEFAULTS.twoFactorLockSeconds),
  TRUST_PROXY: bool.default(false),
  OUTBOX_KEY: z.string().min(32),
  REALTIME_REVALIDATE_SECONDS: seconds.default(DEFAULTS.realtimeRevalidateSeconds),
});

/**
 * Lee y valida la configuración. Falla al arrancar si falta un secreto, si la
 * base de datos no se usa como clinic_app o si en producción no hay HTTPS.
 * Los mensajes nombran la variable, nunca su valor.
 */
export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => i.path.join('.')))].join(', ');
    throw new Error(`Configuración inválida: ${names}`);
  }
  const e = parsed.data;
  const config: AppConfig = {
    databaseUrl: e.DATABASE_APP_URL,
    baseURL: e.BASE_URL,
    trustedOrigins: e.TRUSTED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
    authSecret: e.BETTER_AUTH_SECRET,
    auditHmacKey: e.AUDIT_HMAC_KEY,
    idleTimeoutSeconds: e.IDLE_TIMEOUT_SECONDS,
    absoluteTimeoutSeconds: e.ABSOLUTE_TIMEOUT_SECONDS,
    invitationTtlSeconds: e.INVITATION_TTL_SECONDS,
    passwordResetTtlSeconds: e.PASSWORD_RESET_TTL_SECONDS,
    signInAccountMaxFailures: e.SIGN_IN_ACCOUNT_MAX_FAILURES,
    signInAccountWindowSeconds: e.SIGN_IN_ACCOUNT_WINDOW_SECONDS,
    signInIpMaxAttempts: e.SIGN_IN_IP_MAX_ATTEMPTS,
    signInIpWindowSeconds: e.SIGN_IN_IP_WINDOW_SECONDS,
    twoFactorIpMaxAttempts: e.TWO_FACTOR_IP_MAX_ATTEMPTS,
    twoFactorIpWindowSeconds: e.TWO_FACTOR_IP_WINDOW_SECONDS,
    twoFactorMaxFailures: e.TWO_FACTOR_MAX_FAILURES,
    twoFactorLockSeconds: e.TWO_FACTOR_LOCK_SECONDS,
    secureCookies: e.NODE_ENV === 'production',
    trustProxy: e.TRUST_PROXY,
    outboxKey: e.OUTBOX_KEY,
    realtimeRevalidateSeconds: e.REALTIME_REVALIDATE_SECONDS,
  };
  assertConfig(config, e.NODE_ENV === 'production');
  return config;
}

export function assertConfig(config: AppConfig, production: boolean): void {
  if (new URL(config.databaseUrl).username !== 'clinic_app') {
    throw new Error('Configuración inválida: la API solo se conecta como clinic_app');
  }
  if (config.absoluteTimeoutSeconds < config.idleTimeoutSeconds) {
    throw new Error('Configuración inválida: la expiración absoluta es menor que la de inactividad');
  }
  if (production && !config.baseURL.startsWith('https://')) {
    throw new Error('Configuración inválida: BASE_URL debe usar https en producción');
  }
}
