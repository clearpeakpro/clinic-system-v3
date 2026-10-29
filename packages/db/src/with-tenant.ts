import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import * as authSchema from './auth-schema.ts';
import * as identitySchema from './identity-schema.ts';
import * as opsSchema from './ops-schema.ts';
import * as appSchema from './schema.ts';

const schema = { ...appSchema, ...authSchema, ...identitySchema, ...opsSchema };

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
   * Fija solo `app.user_id` (ADR 0023). Con las políticas `own_*_read` (solo
   * SELECT), la persona LEE sus membresías y roles en todas sus organizaciones
   * y nada más; escribir sigue exigiendo withTenant. `userId` debe venir de la
   * sesión validada, nunca del cliente.
   */
  withUser: <T>(userId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>;
}

export function createTenantDb(client: pg.Pool | pg.Client): TenantDb {
  const db = drizzle({ client, schema });
  // ADR 0023, condición 2: estos son los dos únicos set_config de app.org_id y
  // app.user_id del repositorio, siempre locales a la transacción (true).
  // scripts/check-rls-context.mjs falla en la CI ante cualquier otro.
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
    withUser(userId, fn) {
      if (!UUID_RE.test(userId)) {
        return Promise.reject(new TypeError('withUser: userId no es un UUID válido'));
      }
      return db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
        return fn(tx);
      });
    },
  };
}
