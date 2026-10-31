import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { Tx } from './with-tenant.ts';

// Códigos humanos con code_counters (ADR 0019), en la misma transacción que
// crea la entidad: el contador se bloquea hasta el COMMIT, así que dos altas a
// la vez no reciben el mismo número; si la transacción se deshace, el número
// tampoco se gasta.

const PREFIX = { patient: 'P' } as const;
export type CodeKind = keyof typeof PREFIX;

/** Siguiente código de la organización: `P-000123`. */
export async function nextCode(tx: Tx, organizationId: string, kind: CodeKind): Promise<string> {
  const { rows } = await tx.execute<{ last_value: number }>(sql`
    insert into app.code_counters (id, organization_id, kind, last_value)
    values (${uuidv7()}, ${organizationId}, ${kind}, 1)
    on conflict (organization_id, kind) do update set last_value = app.code_counters.last_value + 1
    returning last_value`);
  const value = rows[0]?.last_value;
  if (value === undefined) throw new Error('No se obtuvo el siguiente código');
  return `${PREFIX[kind]}-${String(value).padStart(6, '0')}`;
}
