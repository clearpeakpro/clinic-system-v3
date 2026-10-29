import { createHash } from 'node:crypto';
import { idempotencyKeys, type TenantDb, type Tx } from '@clinic/db';
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { HttpError } from './services.ts';

// Idempotency-Key (ADR 0019, T-008). Lista para la fase 3: llegada, kiosco,
// pagos y anulaciones la usarán. La clave se reserva en la misma transacción
// que el cambio y guarda solo el código de estado y los ids de lo creado,
// nunca la respuesta (que en la fase 3 podría llevar datos de pacientes).
// Ante una repetición con el mismo contenido se vuelve a leer el recurso con
// las mismas comprobaciones de permisos de quien llama.
//  - misma clave y mismo contenido → mismo estado y el recurso releído;
//  - misma clave con otro contenido → 409 idempotency_key_reused;
//  - dos peticiones a la vez con la misma clave: la segunda espera a la
//    primera (índice único) y después se comporta como una repetición;
//  - si el cambio falla, la clave no queda reservada y se puede reintentar.

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const TTL_MS = 24 * 60 * 60 * 1000;

/** Valor del encabezado Idempotency-Key, o 400 si falta o no es válido. */
export function idempotencyKeyOf(headers: Record<string, string | string[] | undefined>): string {
  const raw = headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !KEY_PATTERN.test(value)) throw new HttpError(400, 'idempotency_key_required');
  return value;
}

/** Parámetro de un controlador: `@IdempotencyKey() key: string`. */
export const IdempotencyKey = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  idempotencyKeyOf(ctx.switchToHttp().getRequest<FastifyRequest>().headers),
);

/** JSON con las claves ordenadas: el mismo contenido da siempre el mismo hash. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return value === undefined ? 'null' : JSON.stringify(value);
}

export function requestHash(request: { method: string; path: string; body: unknown }): string {
  return createHash('sha256').update(`${request.method.toUpperCase()} ${request.path}\n${canonical(request.body)}`).digest('hex');
}

export interface IdempotentResult<T> {
  status: number;
  body: T;
  /** true si fue una repetición (no se volvió a ejecutar el cambio). */
  replayed: boolean;
}

export class IdempotencyService {
  readonly #tenantDb: TenantDb;

  constructor(tenantDb: TenantDb) {
    this.#tenantDb = tenantDb;
  }

  /**
   * `work` hace el cambio dentro de la transacción y devuelve el estado y los
   * ids de lo creado; `read` los vuelve a leer (con los permisos de quien
   * llama), tanto la primera vez como en cada repetición.
   */
  async run<T>(
    organizationId: string,
    key: string,
    request: { method: string; path: string; body: unknown },
    work: (tx: Tx) => Promise<{ status: number; resourceIds: string[] }>,
    read: (resourceIds: string[]) => Promise<T>,
  ): Promise<IdempotentResult<T>> {
    const hash = requestHash(request);
    const outcome = await this.#tenantDb.withTenant(organizationId, async (tx) => {
      const expiresAt = new Date(Date.now() + TTL_MS);
      // Reserva: si otra transacción tiene la misma clave sin confirmar, espera.
      const [reserved] = await tx
        .insert(idempotencyKeys)
        .values({ organizationId, key, requestHash: hash, responseStatus: 0, resourceIds: [], expiresAt })
        .onConflictDoNothing({ target: [idempotencyKeys.organizationId, idempotencyKeys.key] })
        .returning({ id: idempotencyKeys.id });
      let rowId = reserved?.id;
      if (!rowId) {
        const [existing] = await tx.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key)).for('update');
        if (!existing) throw new Error('clave de idempotencia sin fila');
        if (existing.expiresAt.getTime() > Date.now()) {
          if (existing.requestHash !== hash) throw new HttpError(409, 'idempotency_key_reused');
          return { status: existing.responseStatus, resourceIds: existing.resourceIds, replayed: true };
        }
        // Vencida y aún sin purgar: se reutiliza como nueva.
        await tx
          .update(idempotencyKeys)
          .set({ requestHash: hash, responseStatus: 0, resourceIds: [], createdAt: new Date(), expiresAt })
          .where(eq(idempotencyKeys.id, existing.id));
        rowId = existing.id;
      }
      const result = await work(tx);
      await tx
        .update(idempotencyKeys)
        .set({ responseStatus: result.status, resourceIds: result.resourceIds })
        .where(eq(idempotencyKeys.id, rowId));
      return { ...result, replayed: false };
    });
    return { status: outcome.status, body: await read(outcome.resourceIds), replayed: outcome.replayed };
  }
}
