import { randomBytes } from 'node:crypto';
import { bootstrap, migrate, seed } from '@clinic/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    appUrl: string;
    /** Solo para leer audit_log en las pruebas, como lo haría el operador de la plataforma. */
    operatorUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

function urlFor(base: string, user: string, password: string): string {
  const url = new URL(base);
  url.username = user;
  url.password = password;
  return url.toString();
}

export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const superuserUrl = container.getConnectionUri();
  const migratorPassword = randomBytes(16).toString('hex');
  const appPassword = randomBytes(16).toString('hex');

  await bootstrap({ superuserUrl, migratorPassword, appPassword });
  const migratorUrl = urlFor(superuserUrl, 'clinic_migrator', migratorPassword);
  await migrate(migratorUrl);
  await seed(migratorUrl);

  project.provide('appUrl', urlFor(superuserUrl, 'clinic_app', appPassword));
  project.provide('operatorUrl', superuserUrl);
}

export async function teardown(): Promise<void> {
  // T-002: qué operaciones hizo la suite sobre auth.* (para justificar los GRANT).
  if (process.env.T002_GRANT_STATS && container) {
    const client = new pg.Client({ connectionString: container.getConnectionUri() });
    await client.connect();
    const { rows } = await client.query(
      `select relname, n_tup_ins as ins, n_tup_upd as upd, n_tup_del as del
         from pg_stat_user_tables where schemaname = 'auth' order by relname`,
    );
    await client.end();
    process.stdout.write(`T002_GRANT_STATS ${JSON.stringify(rows)}
`);
  }
  await container?.stop();
}
