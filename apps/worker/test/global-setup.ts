import { randomBytes } from 'node:crypto';
import { bootstrap, migrate, seed } from '@clinic/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

// Pruebas del worker (T-008): Postgres desechable con bootstrap, migraciones
// (incluido pg-boss) y la semilla ficticia. El worker se conecta como clinic_app.

declare module 'vitest' {
  export interface ProvidedContext {
    appUrl: string;
    /** Superusuario de la base desechable: solo para leer y alterar audit_log en las pruebas. */
    superuserUrl: string;
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
  project.provide('superuserUrl', superuserUrl);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
