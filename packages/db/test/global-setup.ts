import { randomBytes } from 'node:crypto';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import { bootstrap } from '../src/bootstrap.ts';
import { migrate } from '../src/migrate.ts';
import { seed } from '../src/seed.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    appUrl: string;
    migratorUrl: string;
    /** Operador de la plataforma (ADR 0024). */
    operatorUrl: string;
    /** Superusuario de la base desechable: solo para simular una alteración de la auditoría (T-008). */
    superuserUrl: string;
    /** Clave de cifrado de campos con la que se sembraron los detalles del referido (T-012). */
    fieldKey: string;
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
  const operatorPassword = randomBytes(16).toString('hex');

  await bootstrap({ superuserUrl, migratorPassword, appPassword, operatorPassword });
  const migratorUrl = urlFor(superuserUrl, 'clinic_migrator', migratorPassword);
  await migrate(migratorUrl);
  const fieldKey = randomBytes(32).toString('hex');
  await seed(migratorUrl, { fieldKey });

  project.provide('appUrl', urlFor(superuserUrl, 'clinic_app', appPassword));
  project.provide('migratorUrl', migratorUrl);
  project.provide('operatorUrl', urlFor(superuserUrl, 'clinic_operator', operatorPassword));
  project.provide('superuserUrl', superuserUrl);
  project.provide('fieldKey', fieldKey);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
