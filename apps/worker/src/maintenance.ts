import { auditLog, type TenantDb } from '@clinic/db';
import { drizzle } from 'drizzle-orm/node-postgres';
import { v7 as uuidv7 } from 'uuid';
import type pg from 'pg';

// Trabajos diarios del worker (T-008): verificación de las cadenas de
// auditoría (ADR 0018) y purga de las claves de idempotencia vencidas
// (ADR 0019). Las funciones de la base de datos no devuelven ningún dato de
// las filas: solo si la cadena está bien, su tamaño y su cabeza.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface ChainResult {
  chain: string;
  ok: boolean;
  rows: number;
  headSeq: number | null;
  firstBrokenSeq: number | null;
}

interface VerifyRow {
  ok: boolean;
  row_count: string;
  head_seq: string | null;
  head_hash: string | null;
  first_broken_seq: string | null;
}

/**
 * Verifica cada cadena y deja el resultado en la propia cadena:
 * `audit.chain_verified` con el hash de la cabeza (el anclaje en S3 llega en
 * la fase 4) o `audit.chain_broken` con el primer número roto.
 */
export async function verifyAuditChains(pool: pg.Pool, tenantDb: TenantDb): Promise<ChainResult[]> {
  const { rows: chains } = await pool.query<{ chain_id: string }>('select chain_id from app.audit_chains()');
  const results: ChainResult[] = [];
  for (const { chain_id: chain } of chains) {
    // Cada cadena en su propia transacción: el bloqueo de la cadena dura solo su verificación.
    const { rows } = await pool.query<VerifyRow>('select * from app.verify_audit_chain($1)', [chain]);
    const row = rows[0];
    if (!row) continue;
    const result: ChainResult = {
      chain,
      ok: row.ok,
      rows: Number(row.row_count),
      headSeq: row.head_seq === null ? null : Number(row.head_seq),
      firstBrokenSeq: row.first_broken_seq === null ? null : Number(row.first_broken_seq),
    };
    results.push(result);
    const metadata: Record<string, string | number | boolean> = { rows: result.rows };
    if (result.headSeq !== null) metadata.headSeq = result.headSeq;
    if (row.ok && row.head_hash) metadata.headHash = row.head_hash;
    if (result.firstBrokenSeq !== null) metadata.firstBrokenSeq = result.firstBrokenSeq;
    const event = {
      id: uuidv7(),
      actorType: 'system',
      action: row.ok ? 'audit.chain_verified' : 'audit.chain_broken',
      ip: null,
      metadata,
    };
    if (UUID_RE.test(chain)) {
      await tenantDb.withTenant(chain, (tx) => tx.insert(auditLog).values({ ...event, organizationId: chain }));
    } else {
      // Cadena de plataforma: evento sin organización (permitido sin contexto).
      await drizzle({ client: pool }).insert(auditLog).values({ ...event, organizationId: null });
    }
  }
  return results;
}

/** Borra las claves de idempotencia vencidas (24 h) de todas las organizaciones. */
export async function purgeIdempotencyKeys(pool: pg.Pool): Promise<number> {
  const { rows } = await pool.query<{ purged: number }>('select app.purge_idempotency_keys() as purged');
  return rows[0]?.purged ?? 0;
}
