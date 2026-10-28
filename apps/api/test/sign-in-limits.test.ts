import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULTS } from '../src/config.ts';
import { Client, createStaff, NORTE, randomTestIp, readAudit, signIn, startApp, type Staff, type TestApp } from './support.ts';

// Límite de intentos de inicio de sesión (ADR 0023):
//  - por IP: el de Better Auth, activo en todos los entornos (30 intentos por
//    minuto por IP en /sign-in*: toda la clínica comparte la IP pública);
//  - por cuenta: el nuestro (10 fallos en 15 min por defecto), desde cualquier IP.

const MAX = DEFAULTS.signInAccountMaxFailures;
const WINDOW_MS = DEFAULTS.signInAccountWindowSeconds * 1000;
const IP_MAX = DEFAULTS.signInIpMaxAttempts;
const IP_WINDOW_MS = DEFAULTS.signInIpWindowSeconds * 1000;

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
    it('8 personas distintas inician sesión desde la misma IP sin recibir 429', async () => {
      const clinicIp = randomTestIp();
      for (let i = 0; i < 8; i++) {
        const staff = await createStaff(app, `lim-clinica-${String(i)}`, [{ org: NORTE, location: 0, role: 'recepcion' }]);
        const response = await signIn(new Client(app, clinicIp), staff);
        expect(response.statusCode, `persona ${String(i + 1)}`).toBe(200);
      }
    });

    it(`al intento ${String(IP_MAX + 1)} en un minuto desde la misma IP responde 429, aunque la contraseña sea correcta`, async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
      const staff = await createStaff(app, 'lim-ip', [{ org: NORTE, location: 0, role: 'recepcion' }]);
      const clinicIp = randomTestIp();
      // Correos distintos e inexistentes: así no salta el límite por cuenta.
      for (let i = 0; i < IP_MAX; i++) {
        const response = await attempt({ email: `ip.${String(i)}@example.test`, password: 'Equivocada-123' }, new Client(app, clinicIp));
        expect(response.statusCode, `intento ${String(i + 1)}`).toBe(401);
      }
      expect((await signIn(new Client(app, clinicIp), staff)).statusCode).toBe(429);
      // Desde otra IP sí entra.
      expect((await signIn(new Client(app), staff)).statusCode).toBe(200);
      // Pasada la ventana, la misma IP vuelve a poder.
      vi.setSystemTime(Date.now() + IP_WINDOW_MS + 1_000);
      expect((await signIn(new Client(app, clinicIp), staff)).statusCode).toBe(200);
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
