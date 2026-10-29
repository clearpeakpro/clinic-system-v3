import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULTS } from '../src/config.ts';
import { Client, createStaff, enrollTotp, NORTE, randomTestIp, signIn, startApp, totp, type TestApp } from './support.ts';

// Límites de /two-factor/* (ADR 0023):
//  - por IP: el de Better Auth, 20 peticiones por minuto (configurable). Todo
//    el personal de una clínica comparte la IP pública; la regla de 1.7.7
//    (3 cada 10 s) cortaba a la cuarta persona;
//  - por cuenta: el bloqueo del plugin twoFactor tras varios códigos
//    incorrectos seguidos, desde cualquier IP.

const IP_MAX = DEFAULTS.twoFactorIpMaxAttempts;
const IP_WINDOW_MS = DEFAULTS.twoFactorIpWindowSeconds * 1000;
const MAX_FAILURES = DEFAULTS.twoFactorMaxFailures;

describe('límites de la verificación en dos pasos', () => {
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

  it('en la configuración', () => {
    expect(app.config.twoFactorIpMaxAttempts).toBe(20);
    expect(app.config.twoFactorIpWindowSeconds).toBe(60);
    const plugins = app.auth.options.plugins as { id: string; options?: { accountLockout?: { enabled?: boolean; maxFailedAttempts?: number } } }[];
    const plugin = plugins.find((p) => p.id === 'two-factor');
    expect(plugin?.options?.accountLockout).toMatchObject({ enabled: true, maxFailedAttempts: MAX_FAILURES });
  });

  it('6 personas configuran y usan el MFA a la vez desde la misma IP sin recibir 429', async () => {
    const clinicIp = randomTestIp();
    const people = await Promise.all(
      Array.from({ length: 6 }, (_, i) => createStaff(app, `mfa-clinica-${String(i)}`, [{ org: NORTE, location: null, role: 'administrador' }])),
    );
    // Inscripción (2 peticiones a /two-factor/* cada una), todas a la vez.
    const secrets = await Promise.all(
      people.map(async (staff) => {
        const client = new Client(app, clinicIp);
        expect((await signIn(client, staff)).statusCode).toBe(200);
        return (await enrollTotp(client, staff)).secret;
      }),
    );
    // Después, inician sesión con el código (1 petición más cada una), todas a la vez.
    const codes = await Promise.all(
      people.map(async (staff, i) => {
        const client = new Client(app, clinicIp);
        await signIn(client, staff);
        const response = await client.post('/api/auth/two-factor/verify-totp', { code: await totp(secrets[i] ?? '') });
        return response.statusCode;
      }),
    );
    expect(codes).toEqual([200, 200, 200, 200, 200, 200]);
  });

  it(`a la petición ${String(IP_MAX + 1)} en un minuto desde la misma IP responde 429; desde otra IP, no`, async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
    const clinicIp = randomTestIp();
    // Sin desafío pendiente: cuentan para el límite por IP sin tocar ninguna cuenta.
    for (let i = 0; i < IP_MAX; i++) {
      const response = await new Client(app, clinicIp).post('/api/auth/two-factor/verify-totp', { code: '000000' });
      expect(response.statusCode, `petición ${String(i + 1)}`).not.toBe(429);
    }
    expect((await new Client(app, clinicIp).post('/api/auth/two-factor/verify-totp', { code: '000000' })).statusCode).toBe(429);
    expect((await new Client(app).post('/api/auth/two-factor/verify-totp', { code: '000000' })).statusCode).not.toBe(429);
    // Pasada la ventana, la misma IP vuelve a poder.
    vi.setSystemTime(Date.now() + IP_WINDOW_MS + 1_000);
    expect((await new Client(app, clinicIp).post('/api/auth/two-factor/verify-totp', { code: '000000' })).statusCode).not.toBe(429);
  });

  it(`tras ${String(MAX_FAILURES)} códigos incorrectos la cuenta se bloquea, incluso con el código correcto y desde otra IP`, async () => {
    const staff = await createStaff(app, 'mfa-bloqueo', [{ org: NORTE, location: null, role: 'administrador' }]);
    const enroller = new Client(app);
    await signIn(enroller, staff);
    const { secret } = await enrollTotp(enroller, staff);

    // Better Auth anula cada desafío tras 5 códigos incorrectos (400): se
    // vuelve a iniciar sesión y se sigue contando, porque el bloqueo es de la cuenta.
    const client = new Client(app);
    for (let i = 0; i < MAX_FAILURES; i++) {
      if (i % 5 === 0) expect((await signIn(client, staff)).json()).toMatchObject({ twoFactorRedirect: true });
      const wrong = await client.post('/api/auth/two-factor/verify-totp', { code: '000000' });
      expect(wrong.statusCode, `código ${String(i + 1)}`).toBe(401);
    }
    await signIn(client, staff);
    const locked = await client.post('/api/auth/two-factor/verify-totp', { code: await totp(secret) });
    expect(locked.statusCode).toBe(429);
    expect(locked.json()).toMatchObject({ code: 'ACCOUNT_TEMPORARILY_LOCKED' });

    // El bloqueo es de la cuenta: otra IP y otro inicio de sesión tampoco pasan.
    const other = new Client(app);
    await signIn(other, staff);
    const again = await other.post('/api/auth/two-factor/verify-totp', { code: await totp(secret) });
    expect(again.statusCode).toBe(429);
    expect(again.json()).toMatchObject({ code: 'ACCOUNT_TEMPORARILY_LOCKED' });
    expect((await other.get('/api/me')).statusCode).toBe(401);
  });
});
