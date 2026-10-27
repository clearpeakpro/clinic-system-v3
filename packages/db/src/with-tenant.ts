import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import * as authSchema from './auth-schema.ts';
import * as identitySchema from './identity-schema.ts';
import * as appSchema from './schema.ts';

const schema = { ...appSchema, ...authSchema, ...identitySchema };

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TenantDb {
  /**
   * Ejecuta `fn` en una transacción con `app.org_id` fijado solo para esa
   * transacción. `orgId` debe venir de la sesión validada, nunca del cliente.
   */
  withTenant: <T>(orgId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>;
  /**
   * T-002 (exploración): fija solo `app.user_id`. Con la política
   * `own_memberships`, la persona ve sus membresías en todas sus
   * organizaciones y nada más. `userId` debe venir de la sesión validada.
   */
  withUser: <T>(userId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>;
}

export function createTenantDb(client: pg.Pool | pg.Client): TenantDb {
  const db = drizzle({ client, schema });
  const withSetting = <T>(name: string, value: string, fn: (tx: Tx) => Promise<T>) => {
    if (!UUID_RE.test(value)) {
      return Promise.reject(new TypeError(`${name}: no es un UUID válido`));
    }
    return db.transaction(async (tx) => {
      await tx.execute(sql`select set_config(${name}, ${value}, true)`);
      return fn(tx);
    });
  };
  return {
    withTenant: (orgId, fn) => withSetting('app.org_id', orgId, fn),
    withUser: (userId, fn) => withSetting('app.user_id', userId, fn),
  };
}
