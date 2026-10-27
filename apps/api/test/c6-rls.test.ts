import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Client, createStaff, NORTE, selectContext, signIn, startApp, SUR, type TestApp } from './support.ts';

// Criterio 6: Better Auth y la API funcionan conectadas como clinic_app,
// sin BYPASSRLS; los datos con RLS solo se leen dentro de withTenant.

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

  it('flujo completo de Better Auth como clinic_app: alta, inicio de sesión, sesión y cierre', async () => {
    const staff = await createStaff(app, 'rls-recepcion', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const client = new Client(app);

    const signedIn = await signIn(client, staff);
    expect(signedIn.statusCode).toBe(200);
    expect((await client.get('/api/auth/get-session')).json<{ user: { id: string } }>().user.id).toBe(staff.userId);

    expect((await selectContext(client, NORTE)).statusCode).toBe(204);
    const patients = await client.get('/patients');
    expect(patients.statusCode).toBe(200);
    const body = patients.json<{ ids: string[]; organizationIds: string[] }>();
    expect(body.ids).toHaveLength(NORTE.patients.length);
    expect(body.organizationIds).toEqual([NORTE.id]);

    expect((await client.post('/api/auth/sign-out', {})).statusCode).toBe(200);
    expect((await client.get('/me')).statusCode).toBe(401);
  });

  it('sin contexto, clinic_app no ve filas de app.* fuera de withTenant', async () => {
    const { rows } = await app.pool.query<{ n: number }>(
      `select (select count(*) from app.patients)::int + (select count(*) from app.memberships)::int as n`,
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
      { relname: 'two_factor', rls: false },
      { relname: 'user', rls: false },
      { relname: 'verification', rls: false },
    ]);
  });

  it('la persona de Sur no ve pacientes de Norte', async () => {
    const staff = await createStaff(app, 'rls-sur', [{ org: SUR, location: 0, role: 'enfermeria' }]);
    const client = new Client(app);
    await signIn(client, staff);
    await selectContext(client, SUR);
    const body = (await client.get('/patients')).json<{ organizationIds: string[] }>();
    expect(body.organizationIds).toEqual([SUR.id]);
  });

  it('el rol de migraciones no se usa en la API', () => {
    expect(new URL(app.config.databaseUrl).username).toBe('clinic_app');
    expect(new URL(inject('appUrl')).username).toBe('clinic_app');
    // Sin pg.Pool adicional: la API solo crea el suyo, con databaseUrl.
    expect(app.pool).toBeInstanceOf(pg.Pool);
  });
});
