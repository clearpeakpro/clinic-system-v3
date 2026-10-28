import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Client,
  createStaff,
  enrollTotp,
  membershipIdOf,
  NORTE,
  signedInWithContext,
  signIn,
  startApp,
  type TestApp,
} from './support.ts';

// ADR 0023, condición 4. Estas pruebas vigilan la configuración de Better
// Auth: corren siempre en la CI y se revisan en cada actualización de Better
// Auth (apps/api/README.md, «Al actualizar Better Auth»). Cada punto se
// comprueba en la configuración Y por su efecto.

interface PluginWithOptions {
  id: string;
  options?: { backupCodeOptions?: { storeBackupCodes?: unknown } };
}

describe('condición 4 del ADR 0023: configuración de Better Auth', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(async () => {
    await app.close();
  });

  describe('cookieCache apagado', () => {
    it('en la configuración', () => {
      expect(app.auth.options.session.cookieCache.enabled).toBe(false);
    });

    it('en su efecto: la revocación vale en la siguiente petición', async () => {
      const adminStaff = await createStaff(app, 'cfg-admin', [{ org: NORTE, location: null, role: 'administrador' }]);
      const admin = await signedInWithContext(app, adminStaff, NORTE, 0, { mfa: true });
      const staff = await createStaff(app, 'cfg-revocada', [{ org: NORTE, location: 0, role: 'recepcion' }]);
      const client = await signedInWithContext(app, staff, NORTE);
      expect((await client.get('/me')).statusCode).toBe(200);
      const membershipId = await membershipIdOf(app, NORTE, staff.userId);
      await admin.post(`/memberships/${membershipId}/deactivate`, { reason: 'Prueba de configuración' });
      expect((await client.get('/me')).statusCode).toBe(401);
    });
  });

  describe('códigos de recuperación cifrados', () => {
    it('en la configuración', () => {
      const plugin = (app.auth.options.plugins as PluginWithOptions[] | undefined)?.find((p) => p.id === 'two-factor');
      expect(plugin?.options?.backupCodeOptions?.storeBackupCodes).toBe('encrypted');
    });

    it('en su efecto: ningún código aparece en claro en la base de datos', async () => {
      const staff = await createStaff(app, 'cfg-codigos', [{ org: NORTE, location: null, role: 'administrador' }]);
      const client = new Client(app);
      await signIn(client, staff);
      const { secret, backupCodes } = await enrollTotp(client, staff);
      const { rows } = await app.pool.query<{ secret: string; backup_codes: string }>(
        'select secret, backup_codes from auth.two_factor where user_id = $1',
        [staff.userId],
      );
      const row = rows[0];
      if (!row) throw new Error('sin fila de two_factor');
      expect(backupCodes.length).toBeGreaterThan(0);
      for (const code of backupCodes) expect(row.backup_codes).not.toContain(code);
      expect(row.backup_codes.startsWith('[')).toBe(false);
      expect(row.secret).not.toContain(secret);
    });
  });

  describe('registro público cerrado', () => {
    it('en su efecto: el POST público responde 403', async () => {
      const response = await new Client(app).post('/api/auth/sign-up/email', {
        name: 'Intrusa',
        email: 'cfg-intrusa@example.test',
        password: 'Ficticia-clave-123',
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('resto de la configuración base', () => {
    it('telemetría apagada', () => {
      expect(app.auth.options.telemetry.enabled).toBe(false);
    });

    it('trustDevice rechazado', async () => {
      const staff = await createStaff(app, 'cfg-trust', [{ org: NORTE, location: null, role: 'administrador' }]);
      const client = new Client(app);
      await signIn(client, staff);
      const { totp, enrollTotp: enroll } = await import('./support.ts');
      const { secret } = await enroll(client, staff);
      const second = new Client(app);
      await signIn(second, staff);
      const response = await second.post('/api/auth/two-factor/verify-totp', { code: await totp(secret), trustDevice: true });
      expect(response.statusCode).toBe(400);
    });

    it('cookies httpOnly y SameSite=Lax', async () => {
      const staff = await createStaff(app, 'cfg-cookie', [{ org: NORTE, location: 0, role: 'recepcion' }]);
      const response = await signIn(new Client(app), staff);
      const cookie = response.cookies.find((c) => c.name.endsWith('session_token'));
      expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
    });
  });
});
