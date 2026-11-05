import { and, eq, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { billingStatements } from './billing-schema.ts';
import type { Tx } from './with-tenant.ts';

// Estado de cuenta de la visita (T-027). Una fila por visita, creada cuando
// se necesita. Se llama siempre dentro de withTenant, con la visita ya
// bloqueada por quien llama (orden de bloqueo: visita → estado de cuenta).

export interface StatementKey {
  organizationId: string;
  locationId: string;
  encounterId: string;
}

export interface StatementRow {
  id: string;
  version: number;
}

/** El estado de cuenta de la visita, creado si no existe y bloqueado (FOR UPDATE). */
export async function ensureStatement(tx: Tx, key: StatementKey, now: Date): Promise<StatementRow> {
  await tx
    .insert(billingStatements)
    .values({ id: uuidv7(), organizationId: key.organizationId, locationId: key.locationId, encounterId: key.encounterId, createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: [billingStatements.organizationId, billingStatements.encounterId] });
  const [row] = await tx
    .select({ id: billingStatements.id, version: billingStatements.version })
    .from(billingStatements)
    .where(and(eq(billingStatements.organizationId, key.organizationId), eq(billingStatements.encounterId, key.encounterId)))
    .for('update');
  if (!row) throw new Error('billing_statement_missing');
  return row;
}

/** Cambió algún importe de la visita: el estado de cuenta sube su versión (y se crea si no existía). */
export async function touchStatement(tx: Tx, key: StatementKey, now: Date): Promise<StatementRow> {
  const [row] = await tx
    .insert(billingStatements)
    .values({ id: uuidv7(), organizationId: key.organizationId, locationId: key.locationId, encounterId: key.encounterId, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [billingStatements.organizationId, billingStatements.encounterId],
      set: { version: sql`${billingStatements.version} + 1`, updatedAt: now },
    })
    .returning({ id: billingStatements.id, version: billingStatements.version });
  if (!row) throw new Error('billing_statement_missing');
  return row;
}
