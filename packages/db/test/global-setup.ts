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
  project.provide('migratorUrl', migratorUrl);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
