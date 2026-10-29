import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { auditLog, invitationRoles, invitations } from '../src/identity-schema.ts';
import { locations, organizations } from '../src/schema.ts';
import { DEMO } from '../src/seed.ts';
import { createTenantDb, type TenantDb } from '../src/with-tenant.ts';
import { expectPgError, SQLSTATE } from './helpers.ts';

// T-007: sedes (código único por organización, formato) y el operador de la
// plataforma (ADR 0024): sus permisos, sus altas y su lectura auditada de los
// eventos sin organización.

const NORTE = DEMO.norte;

describe('sedes: código por organización', () => {
  let pool: pg.Pool;
  let operator: pg.Pool;
  let db: TenantDb;
  // Organizaciones propias de esta prueba (las ficticias no se tocan).
  const orgA = randomUUID();
  const orgB = randomUUID();

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 2 });
    operator = new pg.Pool({ connectionString: inject('operatorUrl'), max: 2 });
    db = createTenantDb(pool);
    for (const id of [orgA, orgB]) {
      await createTenantDb(operator).withTenant(id, (tx) => tx.insert(organizations).values({ id, name: 'Organización de prueba' }));
    }
  });
  afterAll(async () => {
    await pool.end();
    await operator.end();
  });

  const newLocation = (organizationId: string, code: string) => ({
    organizationId,
    code,
    name: 'Sede Ficticia',
    timezone: 'America/Chicago',
  });

  it('un código repetido se rechaza en la misma organización y se permite en otra', async () => {
    await db.withTenant(orgA, (tx) => tx.insert(locations).values(newLocation(orgA, 'DUP1')));
    await expect(db.withTenant(orgA, (tx) => tx.insert(locations).values(newLocation(orgA, 'DUP1')))).rejects.toThrow();
    await db.withTenant(orgB, (tx) => tx.insert(locations).values(newLocation(orgB, 'DUP1')));
  });

  it('el código tiene de 2 a 8 caracteres, empieza por letra y solo usa A–Z y dígitos', async () => {
    for (const code of ['A', 'nor3', '1ABC', 'ABCDEFGHI', 'AB-1']) {
      await expect(db.withTenant(orgA, (tx) => tx.insert(locations).values(newLocation(orgA, code))), code).rejects.toThrow();
    }
    await db.withTenant(orgA, (tx) => tx.insert(locations).values(newLocation(orgA, 'AB')));
    await db.withTenant(orgA, (tx) => tx.insert(locations).values(newLocation(orgA, 'NOR3ABCD')));
  });
});

describe('operador de la plataforma (clinic_operator)', () => {
  let operator: pg.Pool;
  let app: pg.Pool;
  let operatorDb: TenantDb;

  beforeAll(() => {
    operator = new pg.Pool({ connectionString: inject('operatorUrl'), max: 2 });
    app = new pg.Pool({ connectionString: inject('appUrl'), max: 2 });
    operatorDb = createTenantDb(operator);
  });
  afterAll(async () => {
    await operator.end();
    await app.end();
  });

  it('no es superusuario, no ignora RLS y no es miembro de otros roles', async () => {
    const { rows } = await operator.query<Record<string, unknown>>(
      `select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb,
              (select count(*)::int from pg_auth_members m where m.member = r.oid) as memberships
         from pg_roles r where rolname = 'clinic_operator'`,
    );
    expect(rows).toEqual([{ rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false, memberships: 0 }]);
  });

  it('sin acceso a pacientes, al esquema auth ni a leer audit_log directamente', async () => {
    const { rows } = await operator.query<{ table_schema: string; table_name: string; privilege_type: string }>(
      `select table_schema, table_name, privilege_type from information_schema.role_table_grants
        where grantee = 'clinic_operator' order by table_schema, table_name, privilege_type`,
    );
    expect(rows.map((r) => `${r.table_schema}.${r.table_name}:${r.privilege_type}`)).toEqual([
      'app.audit_log:INSERT',
      'app.invitation_roles:INSERT',
      'app.invitation_roles:SELECT',
      'app.invitations:INSERT',
      'app.invitations:SELECT',
      'app.locations:INSERT',
      'app.locations:SELECT',
      'app.organizations:INSERT',
      'app.organizations:SELECT',
    ]);
    await expectPgError(operator.query('select * from app.patients'), SQLSTATE.insufficientPrivilege);
    await expectPgError(operator.query('select * from app.audit_log'), SQLSTATE.insufficientPrivilege);
    await expectPgError(operator.query('select * from auth."user"'), SQLSTATE.insufficientPrivilege);
    await expectPgError(operator.query('select * from app.memberships'), SQLSTATE.insufficientPrivilege);
  });

  it('da de alta una organización con su sede y la invitación del Propietario, bajo RLS', async () => {
    const organizationId = randomUUID();
    await operatorDb.withTenant(organizationId, async (tx) => {
      await tx.insert(organizations).values({ id: organizationId, name: 'Clínica Ficticia Nueva' });
      await tx.insert(locations).values({ organizationId, code: 'NUE1', name: 'Nueva Centro', timezone: 'America/Chicago' });
      const [invitation] = await tx
        .insert(invitations)
        .values({
          organizationId,
          email: `propietario.${organizationId}@example.test`,
          name: 'Propietaria Ficticia',
          tokenHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
          expiresAt: new Date(Date.now() + 60_000),
          createdByUserId: null,
        })
        .returning({ id: invitations.id });
      if (!invitation) throw new Error('sin invitación');
      await tx.insert(invitationRoles).values({ organizationId, invitationId: invitation.id, locationId: null, role: 'propietario' });
    });
    // Fuera de su contexto, la RLS lo impide.
    await expectPgError(
      operatorDb.withTenant(randomUUID(), (tx) => tx.insert(locations).values({ organizationId, code: 'OTRA', name: 'Otra', timezone: 'America/Chicago' })),
      SQLSTATE.insufficientPrivilege,
    );
    await expectPgError(operator.query(`insert into app.organizations (id, name) values ($1, 'Sin contexto')`, [randomUUID()]), SQLSTATE.insufficientPrivilege);
    // Y no puede cambiar nada de lo que existe.
    await expectPgError(
      operatorDb.withTenant(NORTE.id, (tx) => tx.update(locations).set({ name: 'X' }).where(eq(locations.organizationId, NORTE.id))),
      SQLSTATE.insufficientPrivilege,
    );
  });

  describe('read_platform_audit', () => {
    const marker = `prueba.${randomUUID()}`;

    beforeAll(async () => {
      // Un evento sin organización y uno con organización, insertados por la API.
      await app.query(`insert into app.audit_log (id, organization_id, actor_type, action) values ($1, null, 'anonymous', $2)`, [randomUUID(), marker]);
      await createTenantDb(app).withTenant(NORTE.id, (tx) =>
        tx.insert(auditLog).values({ id: randomUUID(), organizationId: NORTE.id, actorType: 'anonymous', action: marker }),
      );
    });

    it('devuelve solo los eventos sin organización y deja auditada cada lectura', async () => {
      const since = new Date(Date.now() - 60_000).toISOString();
      const { rows } = await operator.query<{ action: string; ip: string | null }>('select * from app.read_platform_audit($1, null, $2)', [since, marker]);
      expect(rows.map((r) => r.action)).toEqual([marker]);

      const reads = await operator.query<{ action: string; actor_type: string; metadata: Record<string, unknown> }>(
        'select * from app.read_platform_audit($1, null, $2)',
        [since, 'platform.audit_read'],
      );
      expect(reads.rows.length).toBeGreaterThanOrEqual(2);
      expect(reads.rows[0]).toMatchObject({ actor_type: 'operator', metadata: { dbUser: 'clinic_operator', action: marker, limit: 500 } });
    });

    it('rechaza un límite fuera de rango', async () => {
      await expect(operator.query('select * from app.read_platform_audit(now(), null, null, 0)')).rejects.toThrow(/p_limit/);
    });

    it('clinic_app no puede ejecutarla ni leer audit_log', async () => {
      await expectPgError(app.query('select * from app.read_platform_audit(now())'), SQLSTATE.insufficientPrivilege);
      await expectPgError(app.query('select * from app.audit_log'), SQLSTATE.insufficientPrivilege);
    });

    it('corre con search_path vacío y como SECURITY DEFINER de clinic_owner', async () => {
      const { rows } = await operator.query<{ owner: string; definer: boolean; config: string[] }>(
        `select pg_get_userbyid(p.proowner) as owner, p.prosecdef as definer, p.proconfig as config
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'app' and p.proname = 'read_platform_audit'`,
      );
      expect(rows).toEqual([{ owner: 'clinic_owner', definer: true, config: ['search_path=""'] }]);
    });
  });
});
