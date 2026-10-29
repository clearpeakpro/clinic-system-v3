import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Client,
  createStaff,
  enrollTotp,
  NORTE,
  readAudit,
  selectContext,
  signedInWithContext,
  signIn,
  startApp,
  totp,
  type Staff,
  type TestApp,
} from './support.ts';

// Perfil (S-GEN-21 a 25, T-006b) y ADR 0023, condición 3: cambiar la propia
// contraseña y desactivar el MFA con los permisos mínimos de clinic_app
// (UPDATE en auth.account, DELETE en auth.two_factor; packages/db/test/roles.test.ts).

const NEW_PASSWORD = 'una frase nueva y ficticia';

describe('Perfil', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(async () => {
    await app.close();
  });

  const clinical = (label: string) => createStaff(app, label, [{ org: NORTE, location: 0, role: 'recepcion' }]);

  describe('cambiar la contraseña', () => {
    it('con la actual: cierra las demás sesiones, esta sigue con su sede y se audita', async () => {
      const staff = await clinical('perfil-clave');
      const here = await signedInWithContext(app, staff, NORTE);
      const elsewhere = await signedInWithContext(app, staff, NORTE);

      const response = await here.post('/api/me/password', { currentPassword: staff.password, newPassword: NEW_PASSWORD });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ otherSessionsClosed: 1 });

      // Esta sesión conserva su contexto; la otra se cerró.
      expect((await here.get('/api/me')).json()).toMatchObject({ context: { organizationId: NORTE.id, locationId: NORTE.locations[0].id } });
      expect((await elsewhere.get('/api/me')).statusCode).toBe(401);
      // La contraseña anterior ya no sirve; la nueva sí.
      expect((await signIn(new Client(app), staff)).statusCode).toBe(401);
      expect((await signIn(new Client(app), { ...staff, password: NEW_PASSWORD })).statusCode).toBe(200);

      const [event] = await readAudit("action = 'user.password_changed' and actor_id = $1", [staff.userId]);
      expect(event).toMatchObject({ organization_id: NORTE.id, metadata: { otherSessionsClosed: 1 } });
      // Nunca la contraseña en la auditoría.
      expect(JSON.stringify(event)).not.toContain(NEW_PASSWORD);
    });

    it('contraseña actual incorrecta, nueva demasiado corta o común: 400 sin cambios', async () => {
      const staff = await clinical('perfil-clave-mal');
      const client = await signedInWithContext(app, staff, NORTE);
      const attempt = (currentPassword: string, newPassword: string) => client.post('/api/me/password', { currentPassword, newPassword });
      expect((await attempt('Equivocada-12345', NEW_PASSWORD)).json()).toEqual({ code: 'invalid_password' });
      expect((await attempt(staff.password, 'corta')).json()).toEqual({ code: 'PASSWORD_TOO_SHORT' });
      expect((await attempt(staff.password, 'password1234')).json()).toEqual({ code: 'password_too_common' });
      expect((await signIn(new Client(app), staff)).statusCode).toBe(200);
    });

    it('las contraseñas actuales incorrectas cuentan para el límite por cuenta', async () => {
      const staff = await clinical('perfil-clave-limite');
      const client = await signedInWithContext(app, staff, NORTE);
      for (let i = 0; i < app.config.signInAccountMaxFailures; i++) {
        expect((await client.post('/api/me/password', { currentPassword: `Equivocada-${String(i)}-xx`, newPassword: NEW_PASSWORD })).statusCode).toBe(400);
      }
      const blocked = await client.post('/api/me/password', { currentPassword: staff.password, newPassword: NEW_PASSWORD });
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json()).toEqual({ code: 'too_many_attempts' });
    });
  });

  it('los endpoints de Better Auth equivalentes están cerrados por HTTP', async () => {
    const staff = await clinical('perfil-cerrados');
    const client = await signedInWithContext(app, staff, NORTE, 0, { mfa: true });
    for (const [path, body] of [
      ['/api/auth/change-password', { currentPassword: staff.password, newPassword: NEW_PASSWORD, revokeOtherSessions: true }],
      ['/api/auth/two-factor/disable', { password: staff.password }],
      ['/api/auth/two-factor/generate-backup-codes', { password: staff.password }],
    ] as const) {
      const response = await client.post(path, body);
      expect(response.statusCode, path).toBe(403);
      expect(response.json(), path).toMatchObject({ code: 'use_profile' });
    }
    expect((await client.get('/api/me')).json()).toMatchObject({ twoFactorEnabled: true });
  });

  describe('verificación en dos pasos propia', () => {
    let staff: Staff;
    let client: Client;
    let secret: string;
    let oldBackupCodes: string[];

    beforeAll(async () => {
      staff = await clinical('perfil-mfa');
      client = new Client(app);
      await signIn(client, staff);
      await selectContext(client, NORTE);
      expect((await client.get('/api/me/mfa')).json()).toEqual({ enrolled: false, required: false, lockedUntil: null, backupCodesLeft: null });
      ({ secret, backupCodes: oldBackupCodes } = await enrollTotp(client, staff));
    });

    it('estado: activada, no obligatoria, 10 códigos', async () => {
      expect((await client.get('/api/me/mfa')).json()).toEqual({ enrolled: true, required: false, lockedUntil: null, backupCodesLeft: 10 });
      expect((await client.get('/api/me')).json()).toMatchObject({
        assignments: [{ role: 'recepcion', locationId: NORTE.locations[0].id }],
      });
    });

    it('nuevos códigos de recuperación: exige un código actual; los anteriores dejan de servir', async () => {
      const wrong = await client.post('/api/me/mfa/recovery-codes', { code: '000000' });
      expect(wrong.statusCode).toBe(400);
      expect(wrong.json()).toEqual({ code: 'invalid_code' });
      expect((await client.post('/api/me/mfa/recovery-codes', { code: 'abc' })).statusCode).toBe(400);

      const before = await readAudit("action = 'auth.mfa.success' and actor_id = $1", [staff.userId]);
      const response = await client.post('/api/me/mfa/recovery-codes', { code: await totp(secret) });
      expect(response.statusCode).toBe(201);
      const { backupCodes } = response.json<{ backupCodes: string[] }>();
      expect(backupCodes).toHaveLength(10);
      expect(backupCodes[0]).toMatch(/^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/);
      // Confirmar en el Perfil no cuenta como un acceso («Último acceso»).
      expect(await readAudit("action = 'auth.mfa.success' and actor_id = $1", [staff.userId])).toHaveLength(before.length);
      expect(await readAudit("action = 'user.mfa_recovery_codes_regenerated' and actor_id = $1", [staff.userId])).toMatchObject([
        { organization_id: NORTE.id },
      ]);

      const old = new Client(app);
      await signIn(old, staff);
      expect((await old.post('/api/auth/two-factor/verify-backup-code', { code: oldBackupCodes[0] })).statusCode).toBe(401);
      const fresh = new Client(app);
      await signIn(fresh, staff);
      expect((await fresh.post('/api/auth/two-factor/verify-backup-code', { code: backupCodes[0] })).statusCode).toBe(200);
    });

    it('desactivar: con un código actual quita el factor; al entrar ya no se pide código', async () => {
      expect((await client.post('/api/me/mfa/disable', { code: '000000' })).json()).toEqual({ code: 'invalid_code' });
      const response = await client.post('/api/me/mfa/disable', { code: await totp(secret) });
      expect(response.statusCode).toBe(204);
      expect((await client.get('/api/me')).json()).toMatchObject({ twoFactorEnabled: false });
      expect((await client.get('/api/me/mfa')).json()).toMatchObject({ enrolled: false });
      const { rows } = await app.pool.query('select 1 from auth.two_factor where user_id = $1', [staff.userId]);
      expect(rows).toHaveLength(0);
      const next = await signIn(new Client(app), staff);
      expect(next.json()).not.toHaveProperty('twoFactorRedirect');
      expect(await readAudit("action = 'user.mfa_disabled' and actor_id = $1", [staff.userId])).toMatchObject([{ organization_id: NORTE.id }]);
      // Sin factor no hay nada que desactivar ni regenerar.
      expect((await client.post('/api/me/mfa/disable', { code: '123456' })).json()).toEqual({ code: 'mfa_not_enrolled' });
    });
  });

  it('un Administrador no puede desactivar su MFA (su rol lo exige); sí regenerar códigos', async () => {
    const staff = await createStaff(app, 'perfil-admin', [{ org: NORTE, location: null, role: 'administrador' }]);
    const client = new Client(app);
    await signIn(client, staff);
    const { secret } = await enrollTotp(client, staff);
    await selectContext(client, NORTE);
    expect((await client.get('/api/me/mfa')).json()).toMatchObject({ enrolled: true, required: true });
    const denied = await client.post('/api/me/mfa/disable', { code: await totp(secret) });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({ code: 'mfa_required_for_role' });
    expect((await client.get('/api/me')).json()).toMatchObject({ twoFactorEnabled: true });
    expect((await client.post('/api/me/mfa/recovery-codes', { code: await totp(secret) })).statusCode).toBe(201);
  });

  it('códigos incorrectos en el Perfil también bloquean el factor', async () => {
    const staff = await clinical('perfil-bloqueo');
    const client = new Client(app);
    await signIn(client, staff);
    const { secret } = await enrollTotp(client, staff);
    await selectContext(client, NORTE);
    for (let i = 0; i < app.config.twoFactorMaxFailures; i++) {
      expect((await client.post('/api/me/mfa/recovery-codes', { code: '000000' })).statusCode, `código ${String(i + 1)}`).toBe(400);
    }
    const locked = await client.post('/api/me/mfa/disable', { code: '000000' });
    expect(locked.statusCode).toBe(429);
    expect(locked.json()).toEqual({ code: 'mfa_locked' });
    expect((await client.get('/api/me/mfa')).json<{ lockedUntil: string | null }>().lockedUntil).not.toBeNull();
    // El contador es el de Better Auth: tampoco se entra con el código correcto.
    const other = new Client(app);
    await signIn(other, staff);
    const signInLocked = await other.post('/api/auth/two-factor/verify-totp', { code: await totp(secret) });
    expect(signInLocked.statusCode).toBe(429);
    expect(signInLocked.json()).toMatchObject({ code: 'ACCOUNT_TEMPORARILY_LOCKED' });
  });
});
