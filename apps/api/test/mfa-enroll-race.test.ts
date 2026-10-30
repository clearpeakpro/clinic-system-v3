import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client, createStaff, NORTE, signIn, startApp, totp, totpSecretFrom, type TestApp } from './support.ts';

// Fallo encontrado en la demo de la fase 1 (2026-10-30): en desarrollo, React
// monta dos veces la pantalla de inscripción del MFA (S-GEN-07) y se piden
// dos inscripciones a la vez. Better Auth 1.7.7 busca si ya hay una y, si no,
// la crea: las dos peticiones crean un registro, con secretos distintos. El
// código QR sale de uno y la verificación lee el otro: ningún código vale.

const twoFactorRows = async (userId: string) => {
  const db = new pg.Client({ connectionString: inject('operatorUrl') });
  await db.connect();
  try {
    return (await db.query<{ n: number }>('select count(*)::int as n from auth.two_factor where user_id = $1', [userId])).rows[0]?.n;
  } finally {
    await db.end();
  }
};

describe('inscripción del MFA con dos peticiones a la vez', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('deja un solo registro y el código del último código QR mostrado es válido', async () => {
    const staff = await createStaff(app, 'mfa-doble', [{ org: NORTE, location: null, role: 'administrador' }]);
    const client = new Client(app);
    await signIn(client, staff);

    // Varias peticiones a la vez (en desarrollo, React hace dos).
    const finished: string[] = [];
    const enable = () =>
      client.post('/api/auth/two-factor/enable', { password: staff.password }).then((response) => {
        expect(response.statusCode, response.body).toBe(200);
        const secret = totpSecretFrom(response.json<{ totpURI: string }>().totpURI);
        finished.push(secret);
        return secret;
      });
    await Promise.all([enable(), enable(), enable(), enable(), enable()]);

    expect(await twoFactorRows(staff.userId)).toBe(1);
    // La pantalla muestra el código QR de la última respuesta.
    const shown = finished.at(-1) ?? '';
    const verify = await client.post('/api/auth/two-factor/verify-totp', { code: await totp(shown) });
    expect(verify.statusCode, verify.body).toBe(200);
  });
});
