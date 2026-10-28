import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULTS } from '../src/config.ts';
import { Client, createStaff, NORTE, readAudit, signIn, startApp, type Staff, type TestApp } from './support.ts';

// Límite de intentos de inicio de sesión (ADR 0023):
//  - por IP: el de Better Auth, activo en todos los entornos (3 cada 10 s por
//    IP en /sign-in*);
//  - por cuenta: el nuestro (10 fallos en 15 min por defecto), desde cualquier IP.

const MAX = DEFAULTS.signInAccountMaxFailures;
const WINDOW_MS = DEFAULTS.signInAccountWindowSeconds * 1000;

describe('límite de intentos de inicio de sesión', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(async () => {
    await app.close();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const attempt = (staff: Pick<Staff, 'email' | 'password'>, client = new Client(app)) =>
    client.post('/api/auth/sign-in/email', { email: staff.email, password: staff.password });

  describe('por IP (Better Auth)', () => {
    it('al cuarto intento en 10 s desde la misma IP responde 429, aunque la contraseña sea correcta', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
      const staff = await createStaff(app, 'lim-ip', [{ org: NORTE, location: 0, role: 'recepcion' }]);
      const sameIp = new Client(app);
      for (let i = 0; i < 3; i++) {
        expect((await attempt({ ...staff, password: 'Equivocada-123' }, sameIp)).statusCode).toBe(401);
      }
      expect((await signIn(sameIp, staff)).statusCode).toBe(429);
      // Desde otra IP sí entra.
      expect((await signIn(new Client(app), staff)).statusCode).toBe(200);
      // Pasada la ventana, la misma IP vuelve a poder.
      vi.setSystemTime(Date.now() + 11_000);
      expect((await signIn(sameIp, staff)).statusCode).toBe(200);
    });
  });

  describe('por cuenta (nuestro)', () => {
    it(`tras ${String(MAX)} fallos desde IPs distintas, la cuenta responde 429 incluso con la contraseña correcta`, async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
      const staff = await createStaff(app, 'lim-cuenta', [{ org: NORTE, location: 0, role: 'recepcion' }]);
      for (let i = 0; i < MAX; i++) {
        expect((await attempt({ ...staff, password: `Equivocada-${String(i)}-x` })).statusCode).toBe(401);
      }
      const blocked = await signIn(new Client(app), staff);
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json()).toMatchObject({ code: 'too_many_attempts' });

      // Cuando los fallos salen de la ventana, vuelve a entrar.
      vi.setSystemTime(Date.now() + WINDOW_MS + 1_000);
      expect((await signIn(new Client(app), staff)).statusCode).toBe(200);
    });

    it('un inicio correcto borra los fallos anteriores', async () => {
      const staff = await createStaff(app, 'lim-reset', [{ org: NORTE, location: 0, role: 'recepcion' }]);
      for (let i = 0; i < MAX - 1; i++) await attempt({ ...staff, password: `Equivocada-${String(i)}-y` });
      expect((await signIn(new Client(app), staff)).statusCode).toBe(200);
      for (let i = 0; i < MAX - 1; i++) await attempt({ ...staff, password: `Equivocada-${String(i)}-z` });
      expect((await signIn(new Client(app), staff)).statusCode).toBe(200);
    });

    it('la respuesta no revela si la cuenta existe', async () => {
      const ghost = { email: 'no.existe@example.test', password: 'Cualquiera-123' };
      for (let i = 0; i < MAX; i++) await attempt(ghost);
      const ghostBlocked = await attempt(ghost);

      const staff = await createStaff(app, 'lim-existe', [{ org: NORTE, location: 0, role: 'recepcion' }]);
      for (let i = 0; i < MAX; i++) await attempt({ ...staff, password: `Equivocada-${String(i)}-w` });
      const realBlocked = await attempt({ ...staff, password: 'Equivocada-final' });

      expect(ghostBlocked.statusCode).toBe(429);
      expect(realBlocked.statusCode).toBe(429);
      expect(ghostBlocked.json()).toEqual(realBlocked.json());
    });

    it('los bloqueos se auditan sin el correo (solo su HMAC)', async () => {
      const events = await readAudit(`action = 'auth.sign_in.throttled'`);
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) {
        expect(event.metadata).toEqual({ emailHmac: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown });
        expect(JSON.stringify(event)).not.toContain('@example.test');
      }
    });

    it('la tabla de fallos no guarda el correo', async () => {
      const { rows } = await app.pool.query<{ key_hash: string }>('select key_hash from auth.sign_in_failures');
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row.key_hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
