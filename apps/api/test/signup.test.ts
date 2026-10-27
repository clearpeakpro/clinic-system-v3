import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, startApp, type TestApp } from './support.ts';

// Ajuste (4): ¿sirve emailAndPassword.disableSignUp sin impedir que el
// servidor cree usuarios al aceptar una invitación?

describe('registro público cerrado', () => {
  describe('con el hook (configuración elegida)', () => {
    let app: TestApp;
    beforeAll(async () => {
      app = await startApp();
    });
    afterAll(async () => {
      await app.close();
    });

    it('POST /api/auth/sign-up/email desde HTTP responde 403', async () => {
      const response = await new Client(app).post('/api/auth/sign-up/email', {
        name: 'Intrusa',
        email: 'intrusa@example.test',
        password: 'Ficticia-clave-123',
      });
      expect(response.statusCode).toBe(403);
      const { rows } = await app.pool.query('select 1 from auth."user" where email = $1', ['intrusa@example.test']);
      expect(rows).toEqual([]);
    });

    it('el servidor sí puede crear la cuenta (auth.api, sin request)', async () => {
      const { user } = await app.auth.api.signUpEmail({
        body: { name: 'Desde servidor', email: 'servidor@example.test', password: 'Ficticia-clave-123' },
      });
      expect(user.email).toBe('servidor@example.test');
    });
  });

  describe('con disableSignUp: true', () => {
    let app: TestApp;
    beforeAll(async () => {
      app = await startApp({}, { disableSignUp: true });
    });
    afterAll(async () => {
      await app.close();
    });

    it('bloquea el registro público', async () => {
      const response = await new Client(app).post('/api/auth/sign-up/email', {
        name: 'Intrusa',
        email: 'intrusa2@example.test',
        password: 'Ficticia-clave-123',
      });
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('también bloquea la creación desde el servidor: no sirve para aceptar invitaciones', async () => {
      await expect(
        app.auth.api.signUpEmail({
          body: { name: 'Desde servidor', email: 'servidor2@example.test', password: 'Ficticia-clave-123' },
        }),
      ).rejects.toMatchObject({ body: { code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED' } });
    });
  });
});
