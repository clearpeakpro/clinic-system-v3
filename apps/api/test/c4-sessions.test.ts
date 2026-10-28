import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { IDLE_GRACE_SECONDS } from '../src/config.ts';
import { Client, createStaff, NORTE, signIn, startApp, type TestApp } from './support.ts';

// Criterio 4: sesiones en la base de datos, cookie segura, expiración por
// inactividad (Better Auth, deslizante) y absoluta (nuestro guard).

const IDLE = 30 * 60; // 30 min (el servidor suma IDLE_GRACE_SECONDS)
const ABSOLUTE = 2 * 60 * 60; // 2 h

describe('criterio 4: sesiones', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startApp({ idleTimeoutSeconds: IDLE, absoluteTimeoutSeconds: ABSOLUTE });
  });
  afterAll(async () => {
    await app.close();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const newSignedInClient = async (label: string) => {
    const staff = await createStaff(app, label, [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const client = new Client(app);
    const response = await signIn(client, staff);
    return { staff, client, response };
  };

  it('la sesión se guarda en auth.session', async () => {
    const { staff } = await newSignedInClient('ses-bd');
    const { rows } = await app.pool.query<{ n: number }>(
      'select count(*)::int as n from auth.session where user_id = $1',
      [staff.userId],
    );
    expect(rows[0]?.n).toBe(1);
  });

  it('cookie httpOnly y SameSite=Lax; sin Secure en desarrollo', async () => {
    const { response } = await newSignedInClient('ses-cookie');
    const cookie = response.cookies.find((c) => c.name.endsWith('session_token'));
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
    expect(cookie?.secure).toBeFalsy();
  });

  it('con secureCookies: Secure y prefijo __Secure-', async () => {
    // En producción BASE_URL debe ser https; el cliente de prueba envía este origen.
    const secureApp = await startApp({
      secureCookies: true,
      baseURL: 'https://clinica.example.test',
      trustedOrigins: ['http://localhost:3000'],
    });
    try {
      const staff = await createStaff(secureApp, 'ses-secure', [{ org: NORTE, location: 0, role: 'recepcion' }]);
      const response = await signIn(new Client(secureApp), staff);
      const cookie = response.cookies.find((c) => c.name.endsWith('session_token'));
      expect(cookie?.name.startsWith('__Secure-')).toBe(true);
      expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax' });
    } finally {
      await secureApp.close();
    }
  });

  it('expira por inactividad', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
    const { client } = await newSignedInClient('ses-idle');
    expect((await client.get('/api/me')).statusCode).toBe(200);

    vi.setSystemTime(Date.now() + (IDLE + IDLE_GRACE_SECONDS + 60) * 1000);
    expect((await client.get('/api/me')).statusCode).toBe(401);
  });

  it('el uso extiende la sesión (deslizante)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
    const { client } = await newSignedInClient('ses-sliding');
    // 3 × 20 min = 60 min de uso, más que IDLE (30 min), sin cortarse.
    for (let i = 0; i < 3; i++) {
      vi.setSystemTime(Date.now() + 20 * 60 * 1000);
      expect((await client.get('/api/me')).statusCode, `vuelta ${String(i)}`).toBe(200);
    }
  });

  it('expira por tiempo absoluto aunque haya actividad', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
    const { client, staff } = await newSignedInClient('ses-absolute');
    // Actividad cada 20 min hasta pasar las 2 h.
    const start = Date.now();
    let cut: { status: number; code: unknown; elapsed: number } | null = null;
    for (let elapsed = 0; elapsed <= ABSOLUTE + 20 * 60; elapsed += 20 * 60) {
      vi.setSystemTime(Date.now() + 20 * 60 * 1000);
      const response = await client.get('/api/me');
      if (response.statusCode !== 200) {
        cut = { status: response.statusCode, code: response.json<{ code: unknown }>().code, elapsed: Date.now() - start };
        break;
      }
    }
    // Se corta por la regla absoluta (no por inactividad) justo al llegar a las 2 h.
    expect(cut).toEqual({ status: 401, code: 'session_expired', elapsed: ABSOLUTE * 1000 });
    const { rows } = await app.pool.query<{ n: number }>(
      'select count(*)::int as n from auth.session where user_id = $1',
      [staff.userId],
    );
    expect(rows[0]?.n).toBe(0);
  });

  it('la API responde con Cache-Control: no-store', async () => {
    const { client } = await newSignedInClient('ses-nostore');
    expect((await client.get('/api/me')).headers['cache-control']).toBe('no-store');
    expect((await client.get('/api/auth/get-session')).headers['cache-control']).toBe('no-store');
  });
});
