import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Client,
  createStaff,
  enrollTotp,
  NORTE,
  selectContext,
  signIn,
  startApp,
  SUR,
  totp,
  type Staff,
  type TestApp,
} from './support.ts';

// Criterio 3: Propietario y Administrador sin TOTP solo llegan a la inscripción.
// La regla vive en nuestro preHandler (src/app.ts), no en el plugin.

describe('criterio 3: MFA por rol', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(async () => {
    await app.close();
  });

  const blockedPaths = [
    ['GET', '/me'],
    ['POST', '/context'],
    ['GET', '/patients'],
    ['POST', '/invitations'],
    ['GET', '/api/auth/list-sessions'],
    ['POST', '/api/auth/update-user'],
  ] as const;

  for (const role of ['propietario', 'administrador'] as const) {
    it(`${role} sin TOTP: toda ruta fuera de la inscripción responde 403 mfa_enrollment_required`, async () => {
      const staff = await createStaff(app, `mfa-${role}`, [{ org: NORTE, location: null, role }]);
      const client = new Client(app);
      expect((await signIn(client, staff)).statusCode).toBe(200);

      for (const [method, path] of blockedPaths) {
        const response = await client.request(method, path, method === 'POST' ? {} : undefined);
        expect(response.statusCode, `${method} ${path}`).toBe(403);
        expect(response.json(), `${method} ${path}`).toEqual({ code: 'mfa_enrollment_required' });
      }
      // La inscripción y la sesión sí están permitidas.
      expect((await client.get('/api/auth/get-session')).statusCode).toBe(200);
      await enrollTotp(client, staff);
      expect((await client.get('/me')).statusCode).toBe(200);
    });
  }

  it('una persona con rol administrativo en otra organización también necesita MFA', async () => {
    // Recepción en Norte, pero Administradora en Sur: el requisito es por persona.
    const staff = await createStaff(app, 'mfa-mixta', [
      { org: NORTE, location: 0, role: 'recepcion' },
      { org: SUR, location: null, role: 'administrador' },
    ]);
    const client = new Client(app);
    await signIn(client, staff);
    expect((await selectContext(client, NORTE)).json()).toEqual({ code: 'mfa_enrollment_required' });
  });

  it('Recepción y Enfermería no necesitan MFA', async () => {
    const staff = await createStaff(app, 'mfa-enfermeria', [{ org: SUR, location: 1, role: 'enfermeria' }]);
    const client = new Client(app);
    await signIn(client, staff);
    expect((await selectContext(client, SUR, 1)).statusCode).toBe(204);
    expect((await client.get('/patients')).statusCode).toBe(200);
  });

  describe('con TOTP inscrito', () => {
    let staff: Staff;
    let secret: string;
    let backupCodes: string[];

    beforeAll(async () => {
      staff = await createStaff(app, 'mfa-admin-inscrito', [{ org: NORTE, location: null, role: 'administrador' }]);
      const client = new Client(app);
      await signIn(client, staff);
      ({ secret, backupCodes } = await enrollTotp(client, staff));
    });

    it('el inicio de sesión exige el código', async () => {
      const client = new Client(app);
      const first = await signIn(client, staff);
      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({ twoFactorRedirect: true });
      // Sin el código no hay sesión.
      expect((await client.get('/me')).statusCode).toBe(401);

      const wrong = await client.post('/api/auth/two-factor/verify-totp', { code: '000000' });
      expect(wrong.statusCode).toBe(401);

      const ok = await client.post('/api/auth/two-factor/verify-totp', { code: await totp(secret) });
      expect(ok.statusCode).toBe(200);
      expect((await client.get('/me')).statusCode).toBe(200);
    });

    it('un código de recuperación funciona una sola vez', async () => {
      const code = backupCodes[0];
      if (!code) throw new Error('sin códigos de recuperación');

      const first = new Client(app);
      await signIn(first, staff);
      expect((await first.post('/api/auth/two-factor/verify-backup-code', { code })).statusCode).toBe(200);
      expect((await first.get('/me')).statusCode).toBe(200);

      const second = new Client(app);
      await signIn(second, staff);
      expect((await second.post('/api/auth/two-factor/verify-backup-code', { code })).statusCode).toBe(401);
      expect((await second.get('/me')).statusCode).toBe(401);
    });

    it('«dispositivo de confianza» rechazado', async () => {
      const client = new Client(app);
      await signIn(client, staff);
      const response = await client.post('/api/auth/two-factor/verify-totp', {
        code: await totp(secret),
        trustDevice: true,
      });
      expect(response.statusCode).toBe(400);
      expect((await client.get('/me')).statusCode).toBe(401);
    });

    it('el secreto TOTP y los códigos de recuperación se guardan cifrados', async () => {
      const { rows } = await app.pool.query<{ secret: string; backup_codes: string }>(
        'select secret, backup_codes from auth.two_factor where user_id = $1',
        [staff.userId],
      );
      const row = rows[0];
      if (!row) throw new Error('sin fila de two_factor');
      expect(row.secret).not.toContain(secret);
      for (const code of backupCodes) expect(row.backup_codes).not.toContain(code);
    });
  });
});
