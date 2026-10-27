import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import * as schema from './schema.ts';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TenantDb {
  /**
   * Ejecuta `fn` en una transacción con `app.org_id` fijado solo para esa
   * transacción. `orgId` debe venir de la sesión validada, nunca del cliente.
   */
  withTenant: <T>(orgId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>;
}

export function createTenantDb(client: pg.Pool | pg.Client): TenantDb {
  const db = drizzle({ client, schema });
  return {
    withTenant(orgId, fn) {
      if (!UUID_RE.test(orgId)) {
        return Promise.reject(new TypeError('withTenant: orgId no es un UUID válido'));
      }
      return db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
        return fn(tx);
      });
    },
  };
}
