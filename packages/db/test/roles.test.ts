import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { DEMO } from '../src/seed.ts';
import { expectPgError, SQLSTATE } from './helpers.ts';

const TABLES = [
  'organizations',
  'locations',
  'patients',
  // T-002
  'memberships',
  'membership_roles',
  'invitations',
  'kiosk_devices',
  'audit_log',
];

describe('clinic_app no puede saltarse RLS', () => {
  let pool: pg.Pool;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 2 });
  });

  afterAll(async () => {
    await pool.end();
  });

  it.each([
    'ALTER TABLE app.patients DISABLE ROW LEVEL SECURITY',
    'ALTER TABLE app.patients NO FORCE ROW LEVEL SECURITY',
    'DROP POLICY tenant_isolation ON app.patients',
    'ALTER TABLE app.patients ADD COLUMN x int',
    'CREATE ROLE intruso',
    'SET ROLE clinic_owner',
    'SET ROLE clinic_migrator',
    'CREATE TABLE app.intrusa (id int)',
    `DELETE FROM app.patients WHERE id = '${DEMO.norte.patients[0].id}'`,
    'INSERT INTO app.organizations (id, name) VALUES (gen_random_uuid(), \'Intrusa\')',
  ])('7. falla: %s', async (statement) => {
    await expectPgError(pool.query(statement), SQLSTATE.insufficientPrivilege);
  });
});

describe('configuración de roles y tablas', () => {
  let client: pg.Client;

  beforeAll(async () => {
    // Las comprobaciones del catálogo se hacen como clinic_app: lo que importa
    // es lo que ve y puede hacer ese rol.
    client = new pg.Client({ connectionString: inject('appUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it('8. clinic_app y clinic_migrator no son superusuarios ni ignoran RLS', async () => {
    const { rows } = await client.query<{
      rolname: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
    }>(
      `select rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
         from pg_roles where rolname in ('clinic_app', 'clinic_migrator') order by rolname`,
    );
    expect(rows).toEqual([
      { rolname: 'clinic_app', rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false },
      { rolname: 'clinic_migrator', rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false },
    ]);
  });

  it('8. clinic_app no es dueño de nada ni miembro de otros roles', async () => {
    const owned = await client.query(
      `select c.relname from pg_class c join pg_roles r on r.oid = c.relowner
        where r.rolname = 'clinic_app'`,
    );
    expect(owned.rows).toEqual([]);

    const memberships = await client.query(
      `select g.rolname from pg_auth_members m
         join pg_roles g on g.oid = m.roleid
         join pg_roles u on u.oid = m.member
        where u.rolname = 'clinic_app'`,
    );
    expect(memberships.rows).toEqual([]);
  });

  it('8. toda tabla del esquema app es de clinic_owner, con RLS forzada y política', async () => {
    const { rows } = await client.query<{
      relname: string;
      owner: string;
      rls: boolean;
      force: boolean;
      policies: number;
    }>(
      `select c.relname,
              pg_get_userbyid(c.relowner) as owner,
              c.relrowsecurity as rls,
              c.relforcerowsecurity as force,
              (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'app' and c.relkind in ('r', 'p')
        order by c.relname`,
    );
    expect(rows.map((r) => r.relname)).toEqual([...TABLES].sort());
    for (const row of rows) {
      expect(row, row.relname).toMatchObject({ owner: 'clinic_owner', rls: true, force: true });
      expect(row.policies, row.relname).toBeGreaterThan(0);
    }
  });

  it('T-002: permisos exactos de clinic_app en el esquema auth', async () => {
    const { rows } = await client.query<{ table_name: string; privileges: string }>(
      `select table_name, string_agg(privilege_type, ',' order by privilege_type) as privileges
         from information_schema.role_table_grants
        where grantee = 'clinic_app' and table_schema = 'auth'
        group by table_name order by table_name`,
    );
    expect(rows).toEqual([
      { table_name: 'account', privileges: 'INSERT,SELECT' },
      { table_name: 'session', privileges: 'DELETE,INSERT,SELECT,UPDATE' },
      { table_name: 'two_factor', privileges: 'INSERT,SELECT,UPDATE' },
      { table_name: 'user', privileges: 'INSERT,SELECT,UPDATE' },
      { table_name: 'verification', privileges: 'DELETE,INSERT,SELECT' },
    ]);
  });

  it('T-002: clinic_app solo puede insertar en audit_log', async () => {
    const { rows } = await client.query<{ privileges: string }>(
      `select string_agg(privilege_type, ',' order by privilege_type) as privileges
         from information_schema.role_table_grants
        where grantee = 'clinic_app' and table_schema = 'app' and table_name = 'audit_log'`,
    );
    expect(rows[0]?.privileges).toBe('INSERT');
  });
});
