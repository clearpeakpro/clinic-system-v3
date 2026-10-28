import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { checkPassword, COMMON_PASSWORD_COUNT } from '../src/password-policy.ts';
import {
  Client,
  createStaff,
  lastInvitationLink,
  NORTE,
  signedInWithContext,
  signIn,
  startApp,
  type TestApp,
} from './support.ts';

// Política de contraseñas (ADR 0023): 12 a 128 caracteres, sin reglas de
// composición, sin contraseñas comunes (lista local) y sin caducidad.

describe('política de contraseñas', () => {
  describe('regla', () => {
    it('carga la lista local de contraseñas comunes', () => {
      expect(COMMON_PASSWORD_COUNT).toBeGreaterThan(40_000);
    });

    it('longitud de 12 a 128', () => {
      expect(checkPassword('a'.repeat(5) + 'b'.repeat(6))).toBe('password_too_short');
      expect(checkPassword('bosque lluvioso')).toBeNull();
      expect(checkPassword('x'.repeat(64) + 'y'.repeat(64))).toBeNull();
      expect(checkPassword('x'.repeat(64) + 'y'.repeat(65))).toBe('password_too_long');
    });

    it('rechaza contraseñas comunes, sin distinguir mayúsculas', () => {
      for (const common of ['password1234', 'PASSWORD1234', 'Password1234', 'qwertyuiop123']) {
        expect(checkPassword(common), common).toBe('password_too_common');
      }
    });

    it('sin reglas de composición: frases solo en minúsculas, sin números ni símbolos, valen', () => {
      expect(checkPassword('el gato duerme en la ventana')).toBeNull();
      expect(checkPassword('sincomposicionalguna')).toBeNull();
    });
  });

  describe('en la API', () => {
    let app: TestApp;
    let admin: Client;

    beforeAll(async () => {
      app = await startApp();
      const adminStaff = await createStaff(app, 'pwd-admin', [{ org: NORTE, location: null, role: 'administrador' }]);
      admin = await signedInWithContext(app, adminStaff, NORTE, 0, { mfa: true });
    });
    afterAll(async () => {
      await app.close();
    });

    const invite = async (email: string) => {
      expect((await admin.post('/invitations', { email, role: 'recepcion', locationId: NORTE.locations[0].id })).statusCode).toBe(201);
      const link = lastInvitationLink(app, email);
      return { organizationId: link.searchParams.get('org'), token: link.searchParams.get('token') };
    };

    it('aceptar una invitación aplica la política con códigos claros', async () => {
      const link = await invite('pwd.nueva@example.test');
      const cases: [string, string][] = [
        ['corta-11ch', 'password_too_short'],
        ['password1234', 'password_too_common'],
        ['z'.repeat(129), 'password_too_long'],
      ];
      for (const [password, code] of cases) {
        const response = await new Client(app).post('/invitations/accept', { ...link, name: 'Persona', password });
        expect(response.statusCode, code).toBe(400);
        expect(response.json(), code).toEqual({ code });
      }
      // La invitación sigue sin usar y acepta una contraseña válida sin composición.
      const ok = await new Client(app).post('/invitations/accept', { ...link, name: 'Persona', password: 'el gato duerme en la ventana' });
      expect(ok.statusCode).toBe(201);
    });

    it('también en las llamadas de servidor a Better Auth (defensa en profundidad)', async () => {
      await expect(
        app.auth.api.signUpEmail({ body: { name: 'X', email: 'pwd.comun@example.test', password: 'Password1234' } }),
      ).rejects.toMatchObject({ body: { code: 'password_too_common' } });
      await expect(
        app.auth.api.signUpEmail({ body: { name: 'X', email: 'pwd.corta@example.test', password: 'once-chars!' } }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('sin caducidad periódica: una contraseña de hace 3 años sigue sirviendo', async () => {
      const staff = await createStaff(app, 'pwd-antigua', [{ org: NORTE, location: 0, role: 'recepcion' }]);
      // Se envejece la cuenta como operador (clinic_app no puede tocar account).
      const operator = new pg.Client({ connectionString: inject('operatorUrl') });
      await operator.connect();
      try {
        await operator.query(
          `update auth.account set created_at = now() - interval '3 years', updated_at = now() - interval '3 years'
            where user_id = $1`,
          [staff.userId],
        );
      } finally {
        await operator.end();
      }
      expect((await signIn(new Client(app), staff)).statusCode).toBe(200);
    });
  });
});
