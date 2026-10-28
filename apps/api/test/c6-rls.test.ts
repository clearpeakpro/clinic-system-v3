import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createStaff, NORTE, selectContext, signIn, startApp, SUR, type TestApp } from './support.ts';

// Criterio 6 (T-002): Better Auth y la API funcionan conectadas como
// clinic_app, sin BYPASSRLS; los datos con RLS solo se leen dentro de
// withTenant / withUser.

interface Choice {
  organizationId: string;
  locations: { id: string }[];
}

describe('criterio 6: compatibilidad con RLS', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('la API se conecta como clinic_app, sin superusuario ni BYPASSRLS', async () => {
    const { rows } = await app.pool.query<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>(
      `select current_user, r.rolsuper, r.rolbypassrls from pg_roles r where r.rolname = current_user`,
    );
    expect(rows).toEqual([{ current_user: 'clinic_app', rolsuper: false, rolbypassrls: false }]);
  });

  it('createApp rechaza una conexión que no sea clinic_app', async () => {
    const url = new URL(app.config.databaseUrl);
    url.username = 'clinic_migrator';
    await expect(startApp({ databaseUrl: url.toString() })).rejects.toThrow('clinic_app');
  });

  it('flujo completo de Better Auth como clinic_app: alta, inicio de sesión, sesión, contexto y cierre', async () => {
    const staff = await createStaff(app, 'rls-recepcion', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const client = new Client(app);

    expect((await signIn(client, staff)).statusCode).toBe(200);
    expect((await client.get('/api/auth/get-session')).json<{ user: { id: string } }>().user.id).toBe(staff.userId);
    expect((await selectContext(client, NORTE)).statusCode).toBe(204);

    // /me/locations lee organizations y locations con withTenant.
    const choices = (await client.get('/me/locations')).json<Choice[]>();
    expect(choices).toEqual([
      expect.objectContaining({ organizationId: NORTE.id, locations: [expect.objectContaining({ id: NORTE.locations[0].id })] }),
    ]);

    expect((await client.post('/api/auth/sign-out', {})).statusCode).toBe(200);
    expect((await client.get('/me')).statusCode).toBe(401);
  });

  it('un rol de toda la organización ve todas sus sedes, y ninguna de la otra', async () => {
    const staff = await createStaff(app, 'rls-admin-sur', [{ org: SUR, location: null, role: 'administrador' }]);
    const client = new Client(app);
    await signIn(client, staff);
    // Sin MFA solo llega a la inscripción: /me/locations queda bloqueado.
    expect((await client.get('/me/locations')).statusCode).toBe(403);
    const { enrollTotp } = await import('./support.ts');
    await enrollTotp(client, staff);
    const choices = (await client.get('/me/locations')).json<Choice[]>();
    expect(choices.map((c) => c.organizationId)).toEqual([SUR.id]);
    expect(choices[0]?.locations.map((l) => l.id).sort()).toEqual(SUR.locations.map((l) => l.id).sort());
  });

  it('sin contexto, clinic_app no ve filas de app.* fuera de withTenant', async () => {
    const { rows } = await app.pool.query<{ n: number }>(
      `select (select count(*) from app.patients)::int
            + (select count(*) from app.memberships)::int
            + (select count(*) from app.invitations)::int as n`,
    );
    expect(rows[0]?.n).toBe(0);
  });

  it('las tablas de Better Auth están en el esquema auth, sin RLS de organización', async () => {
    const { rows } = await app.pool.query<{ relname: string; rls: boolean }>(
      `select c.relname, c.relrowsecurity as rls
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'auth' and c.relkind = 'r' order by c.relname`,
    );
    expect(rows).toEqual([
      { relname: 'account', rls: false },
      { relname: 'session', rls: false },
      { relname: 'sign_in_failures', rls: false },
      { relname: 'two_factor', rls: false },
      { relname: 'user', rls: false },
      { relname: 'verification', rls: false },
    ]);
  });
});
