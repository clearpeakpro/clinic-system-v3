import { randomUUID } from 'node:crypto';
import { bootstrap, createTenantDb, enqueueNotification, locations, migrate, seed, user as userTable } from '@clinic/db';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { createApp, type ClinicApp } from './app.ts';
import type { AppConfig } from './config.ts';
import { seedDevAppointments, seedDevUsers } from './dev-seed.ts';
import { MemoryLogSink } from './logging.ts';
import { operatorErrorMessage } from './platform.ts';

// Demo de la fase 1 (T-010), solo en desarrollo:
//  - resetDemo: deja la base de datos local como recién instalada, con las dos
//    organizaciones ficticias, sus 12 usuarios (ninguno con MFA) y sus citas.
//  - sendDemoNotification: un aviso ficticio para ver la campana en vivo.

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** Solo una base de datos de esta computadora. */
export function assertLocalDatabase(url: string): void {
  if (!LOCAL_HOSTS.has(new URL(url).hostname)) {
    throw new Error('demo:reset solo funciona con una base de datos local (127.0.0.1).');
  }
}

export class DemoBusyError extends Error {
  readonly connections: number;
  constructor(connections: number) {
    super(`La base de datos tiene ${String(connections)} conexiones abiertas. Detenga «pnpm dev» (Ctrl+C) y vuelva a intentarlo.`);
    this.connections = connections;
  }
}

export interface ResetOptions {
  /** Superusuario, conectado a la base de datos de la aplicación. */
  superuserUrl: string;
  migratorPassword: string;
  appPassword: string;
  operatorPassword: string;
  /**
   * Conexión del operador (DATABASE_OPERATOR_URL). Al terminar se comprueba
   * que entra con ella: así `pnpm org:create` funciona sin pasos extra.
   */
  operatorUrl: string;
  /** Configuración de la API (conexión como clinic_app a esa misma base). */
  config: AppConfig;
  /** Contraseña de todos los usuarios ficticios. */
  seedPassword: string;
}

function withDatabase(url: string, database: string, user?: string, password?: string): string {
  const next = new URL(url);
  next.pathname = `/${database}`;
  if (user) next.username = user;
  if (password) next.password = password;
  return next.toString();
}

/**
 * Borra y vuelve a crear la base de datos, con roles, migraciones, la semilla
 * de las dos organizaciones y los usuarios ficticios. Se niega si hay
 * conexiones abiertas (la API o el worker en marcha).
 */
export async function resetDemo(options: ResetOptions): Promise<void> {
  const database = decodeURIComponent(new URL(options.superuserUrl).pathname.slice(1));
  if (!/^[a-z_][a-z0-9_]*$/.test(database)) throw new Error('Nombre de base de datos no válido');
  const admin = new pg.Client({ connectionString: withDatabase(options.superuserUrl, 'postgres') });
  await admin.connect();
  try {
    const { rows } = await admin.query<{ n: number }>(
      'select count(*)::int as n from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
      [database],
    );
    const open = rows[0]?.n ?? 0;
    if (open > 0) throw new DemoBusyError(open);
    await admin.query(`DROP DATABASE IF EXISTS ${database}`);
    await admin.query(`CREATE DATABASE ${database}`);
  } finally {
    await admin.end();
  }

  await bootstrap({
    superuserUrl: options.superuserUrl,
    migratorPassword: options.migratorPassword,
    appPassword: options.appPassword,
    operatorPassword: options.operatorPassword,
  });
  const migratorUrl = withDatabase(options.superuserUrl, database, 'clinic_migrator', options.migratorPassword);
  await migrate(migratorUrl);
  await seed(migratorUrl, { fieldKey: options.config.fieldEncryptionKey });

  const app = await createApp({ config: options.config, logs: new MemoryLogSink() });
  try {
    await seedDevUsers(app, options.seedPassword);
    await seedDevAppointments(app, options.config.fieldEncryptionKey);
  } finally {
    await app.close();
  }
  await verifyOperator(options.operatorUrl);
}

/** La contraseña de DATABASE_OPERATOR_URL debe ser la de CLINIC_OPERATOR_PASSWORD. */
export function assertOperatorPassword(operatorUrl: string, operatorPassword: string): void {
  const url = new URL(operatorUrl);
  if (url.username !== 'clinic_operator' || decodeURIComponent(url.password) !== operatorPassword) {
    throw new Error(
      'En su .env, DATABASE_OPERATOR_URL debe usar el usuario clinic_operator con la misma contraseña que CLINIC_OPERATOR_PASSWORD (ver .env.example).',
    );
  }
}

/** Entra como clinic_operator con la conexión de .env, como lo hará org:create. */
async function verifyOperator(operatorUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: operatorUrl });
  try {
    await client.connect();
    await client.query('select 1');
  } catch (error) {
    throw new Error(operatorErrorMessage(error, 'comprobar el acceso del operador (clinic_operator)'), { cause: error });
  } finally {
    await client.end().catch(() => undefined);
  }
}

export class DemoUserError extends Error {}

/**
 * Escribe en el outbox un aviso ficticio «Cita actualizada» para la persona,
 * en la primera de sus sedes, con un código inventado. Lo entrega el worker.
 */
export async function sendDemoNotification(
  app: Pick<ClinicApp, 'pool' | 'resolver'>,
  outboxKey: string,
  email: string,
): Promise<{ code: string }> {
  const plain = drizzle({ client: app.pool });
  const [found] = await plain.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, email.trim().toLowerCase()));
  if (!found) throw new DemoUserError(`No existe ningún usuario con el correo ${email}.`);
  const assignments = await app.resolver.loadAssignments(found.id);
  const assignment = assignments.find((a) => a.locationId !== null) ?? assignments[0];
  if (!assignment) throw new DemoUserError(`${email} no tiene ninguna membresía activa.`);

  return createTenantDb(app.pool).withTenant(assignment.organizationId, async (tx) => {
    const [site] = await tx
      .select({ id: locations.id, code: locations.code })
      .from(locations)
      .where(assignment.locationId ? eq(locations.id, assignment.locationId) : eq(locations.active, true))
      .orderBy(locations.code)
      .limit(1);
    const code = `${site?.code ?? 'DEMO'}-C-${String(Math.floor(Math.random() * 900_000) + 100_000)}`;
    await enqueueNotification(tx, outboxKey, {
      organizationId: assignment.organizationId,
      userId: found.id,
      kind: 'appointment.changed',
      ...(site ? { locationId: site.id } : {}),
      entityType: 'appointment',
      // Entidad nueva en cada aviso: así no reemplaza al anterior.
      entityId: randomUUID(),
      code,
    });
    return { code };
  });
}
