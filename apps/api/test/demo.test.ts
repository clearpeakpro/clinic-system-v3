import { randomBytes } from 'node:crypto';
import { decryptNotificationPayload, NOTIFICATION_EVENT } from '@clinic/db';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { DEFAULTS, type AppConfig } from '../src/config.ts';
import { assertLocalDatabase, assertOperatorPassword, DemoBusyError, DemoUserError, resetDemo, sendDemoNotification } from '../src/demo.ts';
import { operatorErrorMessage } from '../src/platform.ts';
import { DEMO_AGENDA, DEV_USERS } from '../src/dev-seed.ts';
import { createStaff, NORTE, startApp, type TestApp } from './support.ts';

// T-010: pnpm demo:reset y pnpm demo:aviso. demo:reset se prueba en una base
// de datos aparte dentro del contenedor desechable, nunca en la local.

const DATABASE = 'demo_reset_prueba';
const SEED_PASSWORD = 'Ficticia-demo-123';

function withDatabase(url: string, database: string, user?: string, password?: string): string {
  const next = new URL(url);
  next.pathname = `/${database}`;
  if (user) next.username = user;
  if (password) next.password = password;
  return next.toString();
}

describe('pnpm demo:reset', () => {
  // operatorUrl es el superusuario del contenedor de pruebas (ver global-setup).
  const superuser = inject('operatorUrl');
  const appPassword = decodeURIComponent(new URL(inject('appUrl')).password);
  const operatorPassword = decodeURIComponent(new URL(inject('platformOperatorUrl')).password);
  const superuserUrl = withDatabase(superuser, DATABASE);
  const config: AppConfig = {
    ...DEFAULTS,
    databaseUrl: withDatabase(superuser, DATABASE, 'clinic_app', appPassword),
    baseURL: 'http://localhost:3000',
    trustedOrigins: [],
    authSecret: randomBytes(32).toString('hex'),
    auditHmacKey: randomBytes(32).toString('hex'),
    secureCookies: false,
    trustProxy: false,
    outboxKey: randomBytes(32).toString('hex'),
    fieldEncryptionKey: randomBytes(32).toString('hex'),
  };
  const operatorUrl = withDatabase(superuser, DATABASE, 'clinic_operator', operatorPassword);
  const reset = (overrides: { operatorUrl?: string } = {}) =>
    resetDemo({
      superuserUrl,
      migratorPassword: randomBytes(16).toString('hex'),
      appPassword,
      operatorPassword,
      operatorUrl,
      config,
      seedPassword: SEED_PASSWORD,
      ...overrides,
    });
  let db: pg.Pool;
  const query = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

  beforeAll(async () => {
    await reset();
    db = new pg.Pool({ connectionString: superuserUrl, max: 1 });
  });
  afterAll(async () => {
    await db.end();
    const admin = new pg.Client({ connectionString: withDatabase(superuser, 'postgres') });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${DATABASE}`);
    await admin.end();
  });

  it('deja las dos organizaciones, sus cuatro sedes, los 12 usuarios ficticios sin MFA y las citas de la semilla', async () => {
    expect(await query('select name from app.organizations order by name')).toEqual([{ name: 'Clínica Demo Norte' }, { name: 'Clínica Demo Sur' }]);
    expect((await query<{ code: string }>('select code from app.locations order by code')).map((r) => r.code)).toEqual(['NOR1', 'NOR2', 'SUR1', 'SUR2']);
    const users = await query<{ email: string; two_factor_enabled: boolean }>('select email, two_factor_enabled from auth."user" order by email');
    expect(users.map((u) => u.email)).toEqual(DEV_USERS.map((u) => u.email).sort());
    expect(users.every((u) => !u.two_factor_enabled)).toBe(true);
    expect(await query('select 1 from auth.two_factor')).toEqual([]);
    expect(await query('select 1 from auth.session')).toEqual([]);
    // T-014: 20 citas por sede (ayer, hoy y los próximos días).
    const perSite = await query<{ code: string; n: number }>(
      'select l.code, count(*)::int as n from app.appointments a join app.locations l on l.id = a.location_id group by l.code order by l.code',
    );
    expect(perSite).toEqual(['NOR1', 'NOR2', 'SUR1', 'SUR2'].map((code) => ({ code, n: DEMO_AGENDA.length })));
  });

  it('una segunda vez borra lo que se hizo (MFA, cuentas nuevas) y vuelve al mismo estado', async () => {
    await query(`update auth."user" set two_factor_enabled = true where email = 'propietario.norte@example.test'`);
    await query(`insert into auth."user" (id, name, email, email_verified, created_at, updated_at) values (gen_random_uuid(), 'Extra', 'extra@example.test', true, now(), now())`);
    await db.end();
    await reset();
    db = new pg.Pool({ connectionString: superuserUrl, max: 1 });
    const users = await query<{ email: string; two_factor_enabled: boolean }>('select email, two_factor_enabled from auth."user" order by email');
    expect(users.map((u) => u.email)).toEqual(DEV_USERS.map((u) => u.email).sort());
    expect(users.every((u) => !u.two_factor_enabled)).toBe(true);
    // La auditoría también empieza de cero: sin eventos de antes del reinicio.
    expect(await query(`select 1 from app.audit_log where metadata::text like '%extra@example.test%'`)).toEqual([]);
  });

  it('deja al operador listo con la contraseña de .env, aunque tuviera otra', async () => {
    const admin = new pg.Client({ connectionString: superuser });
    await admin.connect();
    await admin.query(`ALTER ROLE clinic_operator PASSWORD 'otra-contrasena-anterior'`);
    await admin.end();
    await db.end();
    await reset();
    db = new pg.Pool({ connectionString: superuserUrl, max: 1 });
    const operator = new pg.Client({ connectionString: operatorUrl });
    await operator.connect();
    expect((await operator.query<{ u: string }>('select current_user as u')).rows[0]?.u).toBe('clinic_operator');
    await operator.end();
  });

  it('si la conexión del operador de .env no entra, lo explica en lenguaje claro', async () => {
    await db.end();
    const wrong = withDatabase(superuser, DATABASE, 'clinic_operator', 'no-es-la-contrasena');
    await expect(reset({ operatorUrl: wrong })).rejects.toThrow(/contraseña del operador en \.env no coincide.*pnpm db:bootstrap.*28P01/);
    db = new pg.Pool({ connectionString: superuserUrl, max: 1 });
    expect(() => {
      assertOperatorPassword(wrong, operatorPassword);
    }).toThrow(/DATABASE_OPERATOR_URL/);
    expect(() => {
      assertOperatorPassword(operatorUrl, operatorPassword);
    }).not.toThrow();
  });

  it('se niega si hay conexiones abiertas (pnpm dev en marcha) y no borra nada', async () => {
    await query('select 1');
    await expect(reset()).rejects.toBeInstanceOf(DemoBusyError);
    expect((await query<{ n: number }>('select count(*)::int as n from auth."user"'))[0]?.n).toBe(DEV_USERS.length);
  });

  it('solo con una base de datos local', () => {
    expect(() => {
      assertLocalDatabase('postgres://postgres:x@db.example.test:5432/clinic');
    }).toThrow(/local/);
    expect(() => {
      assertLocalDatabase('postgres://postgres:x@127.0.0.1:5432/clinic');
    }).not.toThrow();
  });
});

describe('pnpm demo:aviso', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('escribe en el outbox un aviso «Cita actualizada» con un código de su sede, sin datos personales', async () => {
    const staff = await createStaff(app, 'demo-aviso', [{ org: NORTE, location: 0, role: 'proveedor' }]);
    const { code } = await sendDemoNotification(app, app.config.outboxKey, staff.email);
    expect(code).toMatch(/^NOR1-C-\d{6}$/);
    const { rows } = await app.pool.query<{ id: string; payload: string }>(
      'select id, payload from app.outbox where kind = $1 order by created_at desc limit 1',
      [NOTIFICATION_EVENT],
    );
    // Sin contexto RLS no se ve: se lee con el superusuario.
    const admin = new pg.Client({ connectionString: inject('operatorUrl') });
    await admin.connect();
    const [row] = (
      await admin.query<{ id: string; payload: string }>(
        `select id, payload from app.outbox where kind = $1 and organization_id = $2 order by created_at desc limit 1`,
        [NOTIFICATION_EVENT, NORTE.id],
      )
    ).rows;
    await admin.end();
    expect(rows).toEqual([]);
    const payload = decryptNotificationPayload(app.config.outboxKey, { organizationId: NORTE.id, eventId: row?.id ?? '' }, row?.payload ?? '');
    expect(payload).toMatchObject({ userId: staff.userId, kind: 'appointment.changed', code, locationId: NORTE.locations[0].id });
  });

  it('un correo que no existe da un mensaje claro', async () => {
    await expect(sendDemoNotification(app, app.config.outboxKey, 'nadie@example.test')).rejects.toBeInstanceOf(DemoUserError);
  });
});

describe('mensajes de los comandos del operador', () => {
  it('explican qué hacer en lugar de mostrar solo el código', async () => {
    const wrong = new URL(inject('platformOperatorUrl'));
    wrong.password = 'no-es-la-contrasena';
    const client = new pg.Client({ connectionString: wrong.toString() });
    const error: unknown = await client.connect().then(
      () => null,
      (e: unknown) => e,
    );
    await client.end().catch(() => undefined);
    expect(operatorErrorMessage(error, 'crear la organización')).toBe(
      'No se pudo crear la organización. La contraseña del operador en .env no coincide con la de la base de datos; ejecute pnpm db:bootstrap y vuelva a intentarlo. (código 28P01)',
    );
    expect(operatorErrorMessage({ cause: { code: '3D000' } }, 'crear la organización')).toMatch(/pnpm demo:reset/);
    expect(operatorErrorMessage({ errors: [{ code: 'ECONNREFUSED' }] }, 'crear la organización')).toMatch(/Docker Desktop/);
    expect(operatorErrorMessage(new Error('otro'), 'crear la organización')).toBe(
      'No se pudo crear la organización. Inténtelo de nuevo; si se repite, avise al soporte.',
    );
  });
});
