import { randomBytes } from 'node:crypto';
import { decryptNotificationPayload, NOTIFICATION_EVENT } from '@clinic/db';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { DEFAULTS, type AppConfig } from '../src/config.ts';
import { assertLocalDatabase, DemoBusyError, DemoUserError, resetDemo, sendDemoNotification } from '../src/demo.ts';
import { DEV_USERS } from '../src/dev-seed.ts';
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
  };
  const reset = () =>
    resetDemo({
      superuserUrl,
      migratorPassword: randomBytes(16).toString('hex'),
      appPassword,
      operatorPassword,
      config,
      seedPassword: SEED_PASSWORD,
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

  it('deja las dos organizaciones, sus cuatro sedes y los 11 usuarios ficticios, sin MFA', async () => {
    expect(await query('select name from app.organizations order by name')).toEqual([{ name: 'Clínica Demo Norte' }, { name: 'Clínica Demo Sur' }]);
    expect((await query<{ code: string }>('select code from app.locations order by code')).map((r) => r.code)).toEqual(['NOR1', 'NOR2', 'SUR1', 'SUR2']);
    const users = await query<{ email: string; two_factor_enabled: boolean }>('select email, two_factor_enabled from auth."user" order by email');
    expect(users.map((u) => u.email)).toEqual(DEV_USERS.map((u) => u.email).sort());
    expect(users.every((u) => !u.two_factor_enabled)).toBe(true);
    expect(await query('select 1 from auth.two_factor')).toEqual([]);
    expect(await query('select 1 from auth.session')).toEqual([]);
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

  it('se niega si hay conexiones abiertas (pnpm dev en marcha) y no borra nada', async () => {
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
