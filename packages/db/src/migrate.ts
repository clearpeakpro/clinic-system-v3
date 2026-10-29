import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as drizzleMigrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { setupJobQueues } from './jobs.ts';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

/**
 * Aplica las migraciones como clinic_migrator. Hace SET ROLE clinic_owner para
 * que los objetos creados pertenezcan a clinic_owner.
 */
export async function migrate(migratorUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: migratorUrl });
  await client.connect();
  try {
    await client.query('SET ROLE clinic_owner');
    await drizzleMigrate(drizzle({ client }), { migrationsFolder, migrationsSchema: 'drizzle' });
  } finally {
    await client.end();
  }
  // Colas del worker (pg-boss), también como clinic_owner.
  await setupJobQueues(migratorUrl);
}
