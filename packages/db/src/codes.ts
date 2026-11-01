import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { Tx } from './with-tenant.ts';

// Códigos humanos con code_counters (ADR 0019), en la misma transacción que
// crea la entidad: el contador se bloquea hasta el COMMIT, así que dos altas a
// la vez no reciben el mismo número; si la transacción se deshace, el número
// tampoco se gasta.

const PREFIX = { patient: 'P' } as const;
export type CodeKind = keyof typeof PREFIX;

/** Siguiente valor del contador `kind` de la organización. */
async function nextValue(tx: Tx, organizationId: string, kind: string): Promise<number> {
  const { rows } = await tx.execute<{ last_value: number }>(sql`
    insert into app.code_counters (id, organization_id, kind, last_value)
    values (${uuidv7()}, ${organizationId}, ${kind}, 1)
    on conflict (organization_id, kind) do update set last_value = app.code_counters.last_value + 1
    returning last_value`);
  const value = rows[0]?.last_value;
  if (value === undefined) throw new Error('No se obtuvo el siguiente código');
  return value;
}

const padded = (value: number) => String(value).padStart(6, '0');

/** Siguiente código de la organización: `P-000123`. */
export async function nextCode(tx: Tx, organizationId: string, kind: CodeKind): Promise<string> {
  return `${PREFIX[kind]}-${padded(await nextValue(tx, organizationId, kind))}`;
}

/**
 * Siguiente código de cita de una sede: `NOR1-A-000045` (T-014). Cada sede
 * tiene su contador (`appointment:<id de la sede>`); el prefijo es el código
 * que la sede tiene al crear la cita.
 */
export async function nextAppointmentCode(tx: Tx, organizationId: string, location: { id: string; code: string }): Promise<string> {
  return `${location.code}-A-${padded(await nextValue(tx, organizationId, `appointment:${location.id}`))}`;
}

/**
 * Siguiente código de visita de una sede: `NOR1-V-000123` (T-017; ADR 0019).
 * Contador propio por sede (`encounter:<id de la sede>`).
 */
export async function nextEncounterCode(tx: Tx, organizationId: string, location: { id: string; code: string }): Promise<string> {
  return `${location.code}-V-${padded(await nextValue(tx, organizationId, `encounter:${location.id}`))}`;
}
