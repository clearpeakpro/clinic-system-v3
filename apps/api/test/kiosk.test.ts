import { createTenantDb, kioskCheckins, kioskDevices } from '@clinic/db';
import type { KioskDeviceView, KioskPairing } from '@clinic/shared';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { FixedClock } from '../src/clock.ts';
import { Client, createStaff, NORTE, readAudit, signedInWithContext, startApp, SUR, type TestApp } from './support.ts';

// T-020: kiosco de autorregistro (S-KIO-01, S-ADM-10), con el reloj fijado.
//  - Sedes: vincular (código de un solo uso, 10 min), generar otro, revocar.
//  - La tableta: cookie httpOnly solo para /api/kiosk; renovar devuelve solo
//    su sede; enviar con Idempotency-Key, validación y límite por tableta.
//  - Revocada: 401 al instante. Con su token no se lee nada: se recorren
//    todas las rutas de la API.
//  - El contenido va cifrado y no aparece en la auditoría ni en los logs.
//  - Vence al cierre del día de la sede (también el día del cambio de
//    horario) y se vacía a las 24 h.

/** 5 nov 2026, 10:00 a. m. en Chicago (NOR1). */
const NOW = '2026-11-05T16:00:00Z';
const later = (iso: string, minutes: number) => new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();

// Datos ficticios fáciles de buscar en la auditoría y en los logs.
const PATIENT = {
  firstName: 'Quintiliano',
  lastName: 'Kioscovich Ficticio',
  birthDate: '1988-05-14',
  phone: '(214) 555-0199',
  firstVisit: true,
  reason: 'sick',
  symptoms: 'Síntoma ficticio xilófono',
};

describe('T-020 kiosco', () => {
  const clock = new FixedClock(NOW);
  let app: TestApp;
  let admin: Client;
  let adminSur: Client;
  let recepcion: Client;
  let counter = 0;
  const db = () => createTenantDb(app.pool);

  beforeAll(async () => {
    app = await startApp({ kioskSubmitMax: 5 }, { clock });
    admin = await signedInWithContext(app, await createStaff(app, 'ki-admin', [{ org: NORTE, location: null, role: 'administrador' }]), NORTE, 0, { mfa: true });
    adminSur = await signedInWithContext(app, await createStaff(app, 'ki-admin-sur', [{ org: SUR, location: null, role: 'administrador' }]), SUR, 0, { mfa: true });
    recepcion = await signedInWithContext(app, await createStaff(app, 'ki-rec', [{ org: NORTE, location: 0, role: 'recepcion' }]), NORTE, 0);
  });
  afterAll(async () => {
    await app.close();
  });

  const NOR1 = () => NORTE.locations[0];
  const code = (response: { json: () => unknown }) => (response.json() as { code: string }).code;
  const key = () => `ki-${String(Date.now())}-${String((counter += 1))}`;

  async function pairing(name = 'Tableta ficticia'): Promise<KioskPairing> {
    const response = await admin.post(`/api/locations/${NOR1().id}/kiosks`, { name });
    expect(response.statusCode, response.body).toBe(201);
    return response.json<KioskPairing>();
  }

  /** Una tableta vinculada a NOR1: un cliente sin sesión del personal, con su cookie. */
  async function tablet(): Promise<{ client: Client; deviceId: string }> {
    const p = await pairing();
    const client = new Client(app);
    const linked = await client.post('/api/kiosk/link', { locationCode: 'nor1', code: p.code.toLowerCase() });
    expect(linked.statusCode, linked.body).toBe(200);
    return { client, deviceId: p.device.id };
  }

  const submit = (client: Client, body: unknown = PATIENT, k = key()) => client.post('/api/kiosk/checkins', body, { 'idempotency-key': k });

  it('Sedes: vincular genera un código de un solo uso; solo Propietario y Administración, y solo de su organización', async () => {
    clock.set(NOW);
    const p = await pairing('Tableta recepción 1');
    expect(p.code).toMatch(/^[A-HJ-KM-NP-Z2-9]{6}$/);
    expect(p).toMatchObject({ expiresAt: later(NOW, 10), device: { name: 'Tableta recepción 1', status: 'pending' } });
    const list = (await admin.get(`/api/locations/${NOR1().id}/kiosks`)).json<KioskDeviceView[]>();
    expect(list.find((d) => d.id === p.device.id)).toMatchObject({ status: 'pending', linkedAt: null });
    expect(JSON.stringify(list)).not.toContain(p.code);
    expect((await recepcion.get(`/api/locations/${NOR1().id}/kiosks`)).statusCode).toBe(403);
    expect((await adminSur.get(`/api/locations/${NOR1().id}/kiosks`)).statusCode).toBe(404);
    expect((await adminSur.post(`/api/locations/${NOR1().id}/kiosks`, { name: 'Intrusa' })).statusCode).toBe(404);
    // «Generar nuevo código» anula el anterior.
    const again = await admin.post(`/api/locations/${NOR1().id}/kiosks/${p.device.id}/code`, { expectedVersion: 1 });
    expect(again.statusCode, again.body).toBe(200);
    const fresh = again.json<KioskPairing>();
    expect(fresh.code).not.toBe(p.code);
    const tabletClient = new Client(app);
    expect((await tabletClient.post('/api/kiosk/link', { locationCode: 'NOR1', code: p.code })).statusCode).toBe(400);
    expect((await tabletClient.post('/api/kiosk/link', { locationCode: 'NOR1', code: fresh.code })).statusCode).toBe(200);
    expect(await readAudit(`action in ('kiosk.pairing_created', 'kiosk.pairing_regenerated', 'kiosk.linked') and entity_id = $1`, [p.device.id])).toHaveLength(3);
  });

  it('vincular: cookie httpOnly solo para /api/kiosk; código vencido, usado o de otra sede no sirve; límite por IP', async () => {
    clock.set(NOW);
    const p = await pairing();
    const client = new Client(app);
    // Otra sede (el código es de NOR1).
    expect(code(await client.post('/api/kiosk/link', { locationCode: 'NOR2', code: p.code }))).toBe('invalid_kiosk_code');
    const linked = await client.post('/api/kiosk/link', { locationCode: 'NOR1', code: p.code });
    expect(linked.statusCode).toBe(200);
    expect(linked.json()).toEqual({ location: { code: 'NOR1', name: NOR1().name } });
    const cookie = String(linked.headers['set-cookie']);
    expect(cookie).toMatch(/^clinic_kiosk=[A-Za-z0-9_-]{43}; Path=\/api\/kiosk; Max-Age=7776000; HttpOnly; SameSite=Strict/);
    // Ya usado.
    expect((await new Client(app).post('/api/kiosk/link', { locationCode: 'NOR1', code: p.code })).statusCode).toBe(400);
    // Vencido a los 10 min.
    const old = await pairing();
    clock.set(later(NOW, 10));
    expect((await new Client(app).post('/api/kiosk/link', { locationCode: 'NOR1', code: old.code })).statusCode).toBe(400);
    clock.set(NOW);
    // 10 fallos desde una IP: 429 también con un código válido.
    const attacker = new Client(app);
    for (let i = 0; i < 10; i += 1) expect((await attacker.post('/api/kiosk/link', { locationCode: 'NOR1', code: 'AAAAAA' })).statusCode).toBe(400);
    const valid = await pairing();
    expect(code(await attacker.post('/api/kiosk/link', { locationCode: 'NOR1', code: valid.code }))).toBe('too_many_attempts');
    // Ningún código ni token en la auditoría ni en los logs.
    expect(app.logs.text()).not.toContain(p.code);
  });

  it('la sesión de la tableta devuelve solo su sede y renueva 90 días; sin cookie o con la sesión del personal, 401', async () => {
    clock.set(NOW);
    const { client, deviceId } = await tablet();
    clock.set(later(NOW, 60 * 24 * 30));
    const session = await client.post('/api/kiosk/session');
    expect(session.statusCode).toBe(200);
    expect(session.json()).toEqual({ location: { code: 'NOR1', name: NOR1().name } });
    const [row] = await db().withTenant(NORTE.id, (tx) => tx.select().from(kioskDevices).where(eq(kioskDevices.id, deviceId)));
    expect(row?.tokenExpiresAt?.toISOString()).toBe(later(NOW, 60 * 24 * 120));
    expect((await new Client(app).post('/api/kiosk/session')).statusCode).toBe(401);
    expect((await admin.post('/api/kiosk/session')).statusCode).toBe(401);
    expect((await submit(recepcion)).statusCode).toBe(401);
    // A los 90 días sin uso, vence.
    clock.set(later(NOW, 60 * 24 * 121));
    expect((await client.post('/api/kiosk/session')).statusCode).toBe(401);
    clock.set(NOW);
  });

  it('envía en español y en inglés: 201 sin datos, contenido cifrado, auditoría con actor «kiosk» y sin datos del paciente', async () => {
    clock.set(NOW);
    const { client, deviceId } = await tablet();
    const response = await submit(client);
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toEqual({ received: true });
    // El inglés solo cambia los textos de la tableta: el mismo registro.
    const english = await submit(client, { ...PATIENT, reason: 'results', firstVisit: false, symptoms: '' });
    expect(english.statusCode).toBe(201);
    const rows = await db().withTenant(NORTE.id, (tx) => tx.select().from(kioskCheckins).where(eq(kioskCheckins.deviceId, deviceId)));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ status: 'pending', serviceDate: '2026-11-05', locationId: NOR1().id });
    expect(rows[0]?.expiresAt.toISOString()).toBe('2026-11-06T06:00:00.000Z');
    expect(rows[0]?.purgeAt.toISOString()).toBe('2026-11-06T16:00:00.000Z');
    for (const row of rows) {
      expect(row.contentEnc).not.toContain('Quintiliano');
      expect(row.contentEnc).not.toContain('2145550199');
    }
    const audit = await readAudit(`action = 'kiosk.checkin_submitted' and actor_id = $1`, [deviceId]);
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ actor_type: 'kiosk', location_id: NOR1().id });
    const everything = JSON.stringify(await readAudit(`organization_id = $1`, [NORTE.id])) + app.logs.text();
    for (const value of ['Quintiliano', 'Kioscovich', '2145550199', '1988-05-14', 'xilófono']) expect(everything).not.toContain(value);
  });

  it('Idempotency-Key: la misma clave no crea dos registros; con otro contenido, 409; sin clave, 400', async () => {
    clock.set(NOW);
    const { client, deviceId } = await tablet();
    const k = key();
    expect((await submit(client, PATIENT, k)).statusCode).toBe(201);
    expect((await submit(client, PATIENT, k)).statusCode).toBe(201);
    expect(code(await submit(client, { ...PATIENT, firstName: 'Otra' }, k))).toBe('idempotency_key_reused');
    expect((await client.post('/api/kiosk/checkins', PATIENT)).statusCode).toBe(400);
    expect(await db().withTenant(NORTE.id, (tx) => tx.select().from(kioskCheckins).where(eq(kioskCheckins.deviceId, deviceId)))).toHaveLength(1);
  });

  it('valida en el servidor (teléfono, fecha futura del día de la sede) y limita los envíos por tableta', async () => {
    clock.set(NOW);
    const { client } = await tablet();
    expect((await submit(client, { ...PATIENT, phone: '555-01' })).statusCode).toBe(400);
    expect((await submit(client, { ...PATIENT, birthDate: '2026-11-06' })).statusCode).toBe(400);
    expect((await submit(client, { ...PATIENT, reason: 'surgery' })).statusCode).toBe(400);
    expect((await submit(client, { ...PATIENT, birthDate: '2026-11-05' })).statusCode).toBe(201);
    // Límite de la prueba: 5 cada 10 min.
    for (let i = 0; i < 4; i += 1) expect((await submit(client)).statusCode).toBe(201);
    expect(code(await submit(client))).toBe('kiosk_rate_limited');
    clock.set(later(NOW, 10));
    expect((await submit(client)).statusCode).toBe(201);
    clock.set(NOW);
  });

  it('revocar corta la tableta al instante: 401 al enviar y al renovar (y se borra la cookie)', async () => {
    clock.set(NOW);
    const { client, deviceId } = await tablet();
    expect((await submit(client)).statusCode).toBe(201);
    expect((await recepcion.post(`/api/locations/${NOR1().id}/kiosks/${deviceId}/revoke`, { reason: 'Prueba', expectedVersion: 2 })).statusCode).toBe(403);
    const revoked = await admin.post(`/api/locations/${NOR1().id}/kiosks/${deviceId}/revoke`, { reason: 'Tableta perdida (prueba)', expectedVersion: 2 });
    expect(revoked.statusCode, revoked.body).toBe(200);
    expect(revoked.json<KioskDeviceView>()).toMatchObject({ status: 'revoked', revokedAt: new Date(NOW).toISOString() });
    const token = client.cookies.get('clinic_kiosk');
    expect(code(await submit(client))).toBe('kiosk_unauthorized');
    const session = await client.post('/api/kiosk/session');
    expect(session.statusCode).toBe(401);
    expect(String(session.headers['set-cookie'])).toContain('clinic_kiosk=; Path=/api/kiosk; Max-Age=0');
    // Con el token guardado, tampoco.
    const replay = new Client(app);
    replay.cookies.set('clinic_kiosk', token ?? '');
    expect((await submit(replay)).statusCode).toBe(401);
    expect(await readAudit(`action = 'kiosk.revoked' and entity_id = $1`, [deviceId])).toHaveLength(1);
  });

  it('con el token del kiosco no se lee nada: cada ruta de la API responde igual que sin sesión', async () => {
    clock.set(NOW);
    const { client } = await tablet();
    const token = client.cookies.get('clinic_kiosk') ?? '';
    expect(token).not.toBe('');
    const anonymous = new Client(app);
    const withToken = new Client(app);
    withToken.cookies.set('clinic_kiosk', token);
    const uuid = '019a2000-0000-7000-8000-00000000dead';
    const routes = app.routes.filter((r) => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method) && !r.url.startsWith('/api/kiosk/'));
    expect(routes.length).toBeGreaterThan(50);
    for (const route of routes) {
      const url = route.url.replace(/:[A-Za-z]+/g, uuid).replace('*', 'get-session');
      const method = route.method as 'GET' | 'POST' | 'PUT';
      const a = await anonymous.request(method, url, method === 'GET' ? undefined : {});
      const b = await withToken.request(method, url, method === 'GET' ? undefined : {});
      expect(`${route.method} ${route.url} ${String(b.statusCode)}`).toBe(`${route.method} ${route.url} ${String(a.statusCode)}`);
      if (b.statusCode < 300) expect(b.body, `${route.method} ${route.url}`).toBe(a.body);
    }
    // Y la cookie nunca llega a otras rutas: el navegador solo la envía a /api/kiosk.
  });

  it('vence al cierre del día de la sede (11:59 p. m. / 12:01 a. m.), también el día del cambio de horario, y se vacía a las 24 h', async () => {
    const operator = new pg.Pool({ connectionString: inject('appUrl'), max: 1 });
    try {
      const expire = (at: string) => operator.query('select app.expire_kiosk_checkins($1)', [at]);
      const purge = (at: string) => operator.query('select app.purge_kiosk_checkins($1)', [at]);
      // Domingo 1 nov 2026: termina el horario de verano en Chicago (el día dura 25 h).
      for (const { sentAt, end } of [
        { sentAt: '2026-11-01T16:00:00Z', end: '2026-11-02T06:00:00Z' },
        { sentAt: '2026-11-05T16:00:00Z', end: '2026-11-06T06:00:00Z' },
      ]) {
        clock.set(sentAt);
        const { client, deviceId } = await tablet();
        expect((await submit(client)).statusCode).toBe(201);
        const read = async () => (await db().withTenant(NORTE.id, (tx) => tx.select().from(kioskCheckins).where(eq(kioskCheckins.deviceId, deviceId))))[0];
        expect((await read())?.expiresAt.toISOString()).toBe(new Date(end).toISOString());
        await expire(later(end, -1)); // 11:59 p. m. de la sede
        expect((await read())?.status).toBe('pending');
        await expire(later(end, 1)); // 12:01 a. m.
        expect((await read())?.status).toBe('expired');
        await purge(later(sentAt, 24 * 60 - 1));
        expect((await read())?.contentEnc).not.toBeNull();
        await purge(later(sentAt, 24 * 60));
        expect(await read()).toMatchObject({ contentEnc: null, contentPurgedAt: new Date(later(sentAt, 24 * 60)) });
      }
    } finally {
      clock.set(NOW);
      await operator.end();
    }
  });
});
