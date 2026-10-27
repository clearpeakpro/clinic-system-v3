export interface AppConfig {
  /** Conexión como clinic_app. Nunca clinic_migrator ni superusuario. */
  databaseUrl: string;
  baseURL: string;
  /** Secreto de Better Auth (firma de cookies, cifrado del secreto TOTP). */
  authSecret: string;
  /** Clave del HMAC-SHA256 con que se guarda el correo de un inicio de sesión fallido. */
  auditHmacKey: string;
  /** Expiración por inactividad, en segundos (session.expiresIn deslizante). */
  idleTimeoutSeconds: number;
  /** Expiración absoluta desde el inicio de sesión, en segundos (nuestro guard). */
  absoluteTimeoutSeconds: number;
  /** Cada cuánto se revalidan los WebSockets abiertos, en ms (respaldo de la revocación). */
  socketRevalidateMs: number;
  /** Fuerza el atributo Secure (y el prefijo __Secure-) en las cookies. */
  secureCookies: boolean;
  invitationTtlSeconds: number;
}

export const DEFAULTS = {
  idleTimeoutSeconds: 30 * 60,
  absoluteTimeoutSeconds: 12 * 60 * 60,
  socketRevalidateMs: 30_000,
  invitationTtlSeconds: 48 * 60 * 60,
} as const;
