import { signInFailures } from '@clinic/db';
import { and, eq, gt, lte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';

/**
 * Límite de inicios de sesión fallidos por cuenta (ADR 0023). La clave es el
 * HMAC del correo: se cuenta igual exista o no la cuenta, así la respuesta no
 * revela si el correo está registrado. Las horas salen del reloj de la API.
 */
export class SignInLimiter {
  readonly #db;
  readonly #maxFailures: number;
  readonly #windowMs: number;

  constructor(pool: pg.Pool, maxFailures: number, windowSeconds: number) {
    this.#db = drizzle({ client: pool });
    this.#maxFailures = maxFailures;
    this.#windowMs = windowSeconds * 1000;
  }

  async isLocked(keyHash: string): Promise<boolean> {
    const since = new Date(Date.now() - this.#windowMs);
    const rows = await this.#db
      .select({ id: signInFailures.id })
      .from(signInFailures)
      .where(and(eq(signInFailures.keyHash, keyHash), gt(signInFailures.createdAt, since)))
      .limit(this.#maxFailures);
    return rows.length >= this.#maxFailures;
  }

  async recordFailure(keyHash: string): Promise<void> {
    const now = Date.now();
    await this.#db
      .delete(signInFailures)
      .where(and(eq(signInFailures.keyHash, keyHash), lte(signInFailures.createdAt, new Date(now - this.#windowMs))));
    await this.#db.insert(signInFailures).values({ keyHash, createdAt: new Date(now) });
  }

  /** Contraseña correcta: se olvidan los fallos anteriores de esa cuenta. */
  async reset(keyHash: string): Promise<void> {
    await this.#db.delete(signInFailures).where(eq(signInFailures.keyHash, keyHash));
  }
}
