import { randomBytes } from 'node:crypto';
import { decryptNotificationPayload, NOTIFICATION_EVENT } from '@clinic/db';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { DEFAULTS, type AppConfig } from '../src/config.ts';
import { assertLocalDatabase, assertOperatorPassword, DemoBusyError, DemoUserError, resetDemo, sendDemoNotification } from '../src/demo.ts';
import { waitLevel, type VisitStatus } from '@clinic/shared';
import { FixedClock, type Clock } from '../src/clock.ts';
import { DEMO_TABLET_NAME, DEMO_VISITS } from '../src/dev-encounters.ts';
import { operatorErrorMessage } from '../src/platform.ts';
import { DEMO_AGENDA, DEV_USERS, TODAY_ARRIVED } from '../src/dev-seed.ts';
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
  const reset = (overrides: { operatorUrl?: string; clock?: Clock } = {}) =>
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

  it('deja las dos organizaciones, sus cuatro sedes, los 13 usuarios ficticios sin MFA y las citas de la semilla', async () => {
    expect(await query('select name from app.organizations order by name')).toEqual([{ name: 'Clínica Demo Norte' }, { name: 'Clínica Demo Sur' }]);
    expect((await query<{ code: string }>('select code from app.locations order by code')).map((r) => r.code)).toEqual(['NOR1', 'NOR2', 'SUR1', 'SUR2']);
    const users = await query<{ email: string; two_factor_enabled: boolean }>('select email, two_factor_enabled from auth."user" order by email');
    expect(users.map((u) => u.email)).toEqual(DEV_USERS.map((u) => u.email).sort());
    expect(users.every((u) => !u.two_factor_enabled)).toBe(true);
    expect(await query('select 1 from auth.two_factor')).toEqual([]);
    expect(await query('select 1 from auth.session')).toEqual([]);
    // T-014: 21 citas por sede (ayer, hoy y los próximos días; T-016 añade una de ayer sin marcar).
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

  // T-024: visitas de la demo 3A, sembradas con los servicios y el reloj fijado.
  /** Jueves 5 nov 2026, 10:00 a. m. en Chicago. */
  const MORNING = '2026-11-05T16:00:00Z';

  async function visitsAt(site: string) {
    return query<{ name: string; status: VisitStatus; since: Date; source: string; appointment_status: string | null; events: number; last_to: string }>(
      `select p.first_name || ' ' || p.last_name as name, e.status, e.source, a.status as appointment_status,
              (select ev.to_status from app.encounter_events ev where ev.encounter_id = e.id order by ev.occurred_at desc, ev.encounter_version desc limit 1) as last_to,
              (select max(ev.occurred_at) from app.encounter_events ev where ev.encounter_id = e.id) as since,
              (select count(*)::int from app.encounter_events ev where ev.encounter_id = e.id) as events
         from app.encounters e
         join app.locations l on l.id = e.location_id
         join app.patients p on p.id = e.patient_id
         left join app.appointments a on a.id = e.appointment_id
        where l.code = $1 order by e.arrived_at`,
      [site],
    );
  }

  it('T-024: visitas abiertas en NOR1 y SUR1 en cada estado de 3A, con «Alerta» y «Crítico» a la hora del reinicio', async () => {
    await db.end();
    await reset({ clock: new FixedClock(MORNING) });
    db = new pg.Pool({ connectionString: superuserUrl, max: 1 });
    const now = new Date(MORNING).getTime();
    const thresholds = { alertMinutes: 5, criticalMinutes: 10 };

    const nor1 = await visitsAt('NOR1');
    expect(nor1.map((v) => [v.name, v.status])).toEqual([
      ['Sofía Navarro Morales', 'READY_FOR_CHECKOUT'],
      ['Valentina Castillo Ríos', 'WITH_PROVIDER'],
      ['Raúl Ortiz Fuentes', 'WAITING_FOR_PROVIDER'],
      ['Ángel Domínguez Vega', 'WITH_NURSE'],
      ['Óscar Delgado Núñez', 'PROCEDURE_PENDING'],
      ['Gabriela Jiménez Soto', 'CHECKED_IN'],
      ['Tomás Gutiérrez León', 'WAITING_FOR_NURSE'],
    ]);
    const level = (name: string) => {
      const v = nor1.find((r) => r.name === name);
      return v ? waitLevel({ status: v.status, statusSince: v.since.toISOString() }, now, thresholds) : null;
    };
    expect(level('Gabriela Jiménez Soto')).toBe('critical');
    expect(level('Tomás Gutiérrez León')).toBe('alert');
    expect(level('Raúl Ortiz Fuentes')).toBe('critical');
    // Cada paso pasó por la máquina de estados: un evento por versión.
    for (const v of nor1) {
      expect(v.last_to).toBe(v.status);
      expect(v.events).toBeGreaterThanOrEqual(1);
    }
    // Llegada, a enfermería, inicio de la enfermería, al proveedor, consulta y «Listo para caja».
    expect(nor1.find((v) => v.name === 'Sofía Navarro Morales')?.events).toBe(6);
    expect((await visitsAt('SUR1')).map((v) => v.status)).toEqual(['WAITING_FOR_PROVIDER', 'WITH_NURSE', 'WAITING_FOR_NURSE', 'CHECKED_IN']);
    expect(await visitsAt('NOR2')).toEqual([]);
    expect(await visitsAt('SUR2')).toEqual([]);

    // Las citas «Llegó» de hoy de NOR1 y SUR1 tienen su visita; en NOR2 y SUR2 siguen sin ella.
    for (const site of ['NOR1', 'SUR1']) {
      const withAppointment = (await visitsAt(site)).filter((v) => v.source === 'appointment');
      expect(withAppointment).toHaveLength(TODAY_ARRIVED.length);
      expect(withAppointment.every((v) => v.appointment_status === 'ARRIVED')).toBe(true);
    }
    const arrivedToday = await query<{ code: string; n: number }>(
      `select l.code, count(*)::int as n from app.appointments a join app.locations l on l.id = a.location_id
        where a.status = 'ARRIVED' and a.starts_at >= $1::timestamptz - interval '10 hours' and a.starts_at < $1::timestamptz + interval '14 hours'
        group by l.code order by l.code`,
      [MORNING],
    );
    expect(arrivedToday).toEqual(['NOR1', 'NOR2', 'SUR1', 'SUR2'].map((code) => ({ code, n: TODAY_ARRIVED.length })));

    // Alergias en sus tres estados (ADR 0040): registradas, sin alergias conocidas y sin registrar.
    const allergies = await query<{ name: string; status: string }>(
      `select distinct on (h.patient_id) p.first_name || ' ' || p.last_name as name, h.allergy_status as status
         from app.patient_histories h join app.patients p on p.id = h.patient_id
        order by h.patient_id, h.version desc`,
    );
    expect(allergies.find((a) => a.name === 'Valentina Castillo Ríos')?.status).toBe('recorded');
    expect(allergies.find((a) => a.name === 'Raúl Ortiz Fuentes')?.status).toBe('none_known');
    expect(allergies.find((a) => a.name === 'Ángel Domínguez Vega')).toBeUndefined();

    // Una tableta vinculada en NOR1 y en SUR1.
    const tablets = await query<{ code: string; name: string; status: string }>(
      `select l.code, k.name, k.status from app.kiosk_devices k join app.locations l on l.id = k.location_id order by l.code`,
    );
    expect(tablets).toEqual([
      { code: 'NOR1', name: DEMO_TABLET_NAME, status: 'active' },
      { code: 'SUR1', name: DEMO_TABLET_NAME, status: 'active' },
    ]);
    // La auditoría de los pasos existe y no lleva valores clínicos.
    const audit = await query<{ metadata: string }>(`select metadata::text from app.audit_log where action like 'encounter.%' or action like 'patient.history%'`);
    expect(audit.length).toBeGreaterThan(0);
    expect(audit.some((a) => a.metadata.includes('Penicilina'))).toBe(false);
    expect(DEMO_VISITS.flatMap((s) => s.visits)).toHaveLength(11);
  });

  it('T-024: poco después de medianoche, las visitas con cita de hoy se siembran igual', async () => {
    await db.end();
    // Viernes 6 nov 2026, 12:05 a. m. en Chicago.
    await reset({ clock: new FixedClock('2026-11-06T06:05:00Z') });
    db = new pg.Pool({ connectionString: superuserUrl, max: 1 });
    const nor1 = await visitsAt('NOR1');
    expect(nor1).toHaveLength(7);
    const first = nor1.find((v) => v.name === 'Sofía Navarro Morales');
    expect(first?.status).toBe('READY_FOR_CHECKOUT');
    expect(first?.since.getTime()).toBeGreaterThanOrEqual(new Date('2026-11-06T06:00:00Z').getTime());
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
    // La cita de la sede más cercana a ahora (T-015) o, sin citas, un código inventado.
    // El contador admite más de 6 cifras (otras pruebas crean citas `NOR1-A-8xxxxxx`).
    expect(code).toMatch(/^NOR1-[AC]-\d{6,}$/);
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
    if (code.includes('-A-')) {
      // Apunta a esa cita real, con su hora: tocar el aviso abre su detalle.
      const check = new pg.Client({ connectionString: inject('operatorUrl') });
      await check.connect();
      const { rows: found } = await check.query<{ id: string }>('select id from app.appointments where organization_id = $1 and code = $2', [NORTE.id, code]);
      await check.end();
      expect(payload).toMatchObject({ entityType: 'appointment', entityId: found[0]?.id });
      expect(payload.startsAt).toEqual(expect.any(String));
    }
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
