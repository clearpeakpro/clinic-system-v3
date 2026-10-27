import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { KIOSK_COOKIE } from '../src/principal.ts';
import { Client, createStaff, NORTE, selectContext, signIn, startApp, SUR, type TestApp } from './support.ts';

// Criterio 7: el token de kiosco (persistente, con hash en la BD, permiso
// único kiosk.submit) convive con las sesiones de personas sin mezclarse.

describe('criterio 7: kiosco', () => {
  let app: TestApp;
  let kiosk: Client;
  let device: { deviceId: string; token: string };

  beforeAll(async () => {
    app = await startApp();
    device = await app.services.kiosks.register(NORTE.id, NORTE.locations[0].id);
    kiosk = new Client(app);
    kiosk.cookies.set(KIOSK_COOKIE, device.token);
  });
  afterAll(async () => {
    await app.close();
  });

  it('el kiosco puede enviar un registro', async () => {
    const response = await kiosk.post('/kiosk/checkins', {});
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: true, locationId: NORTE.locations[0].id });
  });

  it('el kiosco recibe 403 en endpoints de lectura y de personas', async () => {
    for (const path of ['/patients', '/me', '/api/auth/get-session']) {
      expect((await kiosk.get(path)).statusCode, path).toBe(403);
    }
    expect((await kiosk.post('/context', { organizationId: NORTE.id, locationId: NORTE.locations[0].id })).statusCode).toBe(403);
    expect((await kiosk.post('/invitations', { email: 'x@example.test', role: 'recepcion' })).statusCode).toBe(403);
  });

  it('una sesión de persona no sirve como kiosco', async () => {
    const staff = await createStaff(app, 'kiosk-recepcion', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const client = new Client(app);
    await signIn(client, staff);
    await selectContext(client, NORTE);
    expect((await client.post('/kiosk/checkins', {})).statusCode).toBe(403);
  });

  it('credenciales mezcladas (kiosco + sesión) se rechazan', async () => {
    const staff = await createStaff(app, 'kiosk-mezcla', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const client = new Client(app);
    await signIn(client, staff);
    client.cookies.set(KIOSK_COOKIE, device.token);
    expect((await client.post('/kiosk/checkins', {})).statusCode).toBe(403);
    expect((await client.get('/patients')).statusCode).toBe(403);
  });

  it('un token alterado o de otra organización da 401', async () => {
    const [org, id, secret] = device.token.split('.');
    const variants = [
      `${String(org)}.${String(id)}.${String(secret)}x`,
      `${SUR.id}.${String(id)}.${String(secret)}`,
      'basura',
    ];
    for (const token of variants) {
      const client = new Client(app);
      client.cookies.set(KIOSK_COOKIE, token);
      expect((await client.post('/kiosk/checkins', {})).statusCode, token.slice(0, 12)).toBe(401);
    }
  });

  it('un token revocado da 401', async () => {
    const other = await app.services.kiosks.register(NORTE.id, NORTE.locations[1].id);
    const client = new Client(app);
    client.cookies.set(KIOSK_COOKIE, other.token);
    expect((await client.post('/kiosk/checkins', {})).statusCode).toBe(202);
    await app.services.kiosks.revoke(NORTE.id, other.deviceId);
    expect((await client.post('/kiosk/checkins', {})).statusCode).toBe(401);
  });

  it('solo se guarda el hash del token', async () => {
    const { rows } = await app.pool.query<{ n: number }>(
      // Sin contexto RLS no se ve nada; por eso se comprueba con withTenant abajo.
      'select count(*)::int as n from app.kiosk_devices',
    );
    expect(rows[0]?.n).toBe(0);
    const { createTenantDb, kioskDevices } = await import('@clinic/db');
    const stored = await createTenantDb(app.pool).withTenant(NORTE.id, (tx) =>
      tx.select({ tokenHash: kioskDevices.tokenHash }).from(kioskDevices),
    );
    const secret = device.token.split('.')[2] ?? '';
    for (const row of stored) {
      expect(row.tokenHash).not.toContain(secret);
      expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
