import { ROLES } from '@clinic/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEV_OWNERS, DEV_USERS, seedDevUsers } from '../src/dev-seed.ts';
import { Client, enrollTotp, NORTE, selectContext, signIn, startApp, SUR, type TestApp } from './support.ts';

// El primer Propietario de cada organización ficticia lo crea solo la semilla
// de desarrollo, nunca la API (T-003).

describe('semilla de desarrollo: Propietarios ficticios', () => {
  let app: TestApp;
  const password = 'Ficticia-semilla-123';

  beforeAll(async () => {
    app = await startApp();
    await seedDevUsers(app, password);
    // Idempotente: una segunda ejecución no duplica nada.
    await seedDevUsers(app, password);
  });
  afterAll(async () => {
    await app.close();
  });

  it('cada Propietario entra, inscribe MFA y ve todas las sedes de su organización y ninguna otra', async () => {
    for (const owner of DEV_OWNERS) {
      const client = new Client(app);
      const staff = { userId: '', email: owner.email, password };
      expect((await signIn(client, staff)).statusCode).toBe(200);
      // Rol que exige MFA: obligado a inscribirse primero.
      expect((await client.get('/api/me/locations')).statusCode).toBe(403);
      await enrollTotp(client, staff);
      const choices = (await client.get('/api/me/locations')).json<{ organizationId: string; locations: unknown[] }[]>();
      expect(choices).toHaveLength(1);
      expect(choices[0]?.organizationId).toBe(owner.org.id);
      expect(choices[0]?.locations).toHaveLength(owner.org.locations.length);
      const other = owner.org.id === NORTE.id ? SUR : NORTE;
      expect((await selectContext(client, other)).statusCode).toBe(403);
      expect((await selectContext(client, owner.org)).statusCode).toBe(204);
    }
  });

  it('no duplica usuarios ni roles al repetirse', async () => {
    const { rows } = await app.pool.query<{ n: number }>(
      `select count(*)::int as n from auth."user" where email = any($1)`,
      [DEV_USERS.map((u) => u.email)],
    );
    expect(rows[0]?.n).toBe(DEV_USERS.length);
  });

  it('los cinco roles en cada organización, una persona de las dos y nadie con MFA (T-010)', async () => {
    for (const org of [NORTE, SUR]) {
      const roles = new Set(DEV_USERS.flatMap((u) => u.roles.filter((r) => r.org.id === org.id).map((r) => r.role)));
      expect([...roles].sort()).toEqual([...ROLES].sort());
    }
    expect(DEV_USERS.filter((u) => new Set(u.roles.map((r) => r.org.id)).size === 2)).toHaveLength(1);
    expect(new Set(DEV_USERS.map((u) => u.email)).size).toBe(DEV_USERS.length);
    const { rows } = await app.pool.query<{ n: number }>(
      `select count(*)::int as n from auth."user" where email = any($1) and two_factor_enabled`,
      [DEV_USERS.filter((u) => !DEV_OWNERS.some((o) => o.email === u.email)).map((u) => u.email)],
    );
    expect(rows[0]?.n).toBe(0);
  });
});
