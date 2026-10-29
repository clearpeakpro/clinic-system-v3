import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { invitationRoles, invitations, memberships } from '../src/identity-schema.ts';
import { DEMO } from '../src/seed.ts';
import { createTenantDb, type TenantDb } from '../src/with-tenant.ts';
import { sql } from 'drizzle-orm';
import { expectPgError, SQLSTATE } from './helpers.ts';

// T-006a: invitation_roles (aislamiento con el rol real y un pool), la
// función has_active_membership_elsewhere (solo responde sí o no) y la función
// last_sign_ins (último acceso de las personas de la organización del contexto).

const NORTE = DEMO.norte;
const SUR = DEMO.sur;

describe('invitation_roles: aislamiento por organización', () => {
  let pool: pg.Pool;
  let db: TenantDb;
  const invitationId = randomUUID();

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 4 });
    db = createTenantDb(pool);
    await db.withTenant(NORTE.id, async (tx) => {
      await tx.insert(invitations).values({
        id: invitationId,
        organizationId: NORTE.id,
        email: `aislada.${invitationId}@example.test`,
        name: 'Persona Ficticia',
        tokenHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
        expiresAt: new Date(Date.now() + 60_000),
        createdByUserId: randomUUID(),
      });
      await tx.insert(invitationRoles).values([
        { organizationId: NORTE.id, invitationId, locationId: NORTE.locations[0].id, role: 'recepcion' },
        { organizationId: NORTE.id, invitationId, locationId: null, role: 'administrador' },
      ]);
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('Norte ve sus roles; Sur y sin contexto no ven nada', async () => {
    const norte = await db.withTenant(NORTE.id, (tx) =>
      tx.select().from(invitationRoles).where(eq(invitationRoles.invitationId, invitationId)),
    );
    expect(norte).toHaveLength(2);
    const sur = await db.withTenant(SUR.id, (tx) => tx.select().from(invitationRoles));
    expect(sur.filter((r) => r.invitationId === invitationId)).toEqual([]);
    const { rows } = await pool.query('select * from app.invitation_roles');
    expect(rows).toEqual([]);
  });

  it('Sur no puede colgar roles de una invitación de Norte', async () => {
    await expectPgError(
      db.withTenant(SUR.id, (tx) =>
        tx.insert(invitationRoles).values({ organizationId: NORTE.id, invitationId, locationId: NORTE.locations[0].id, role: 'proveedor' }),
      ),
      SQLSTATE.insufficientPrivilege,
    );
    // Ni con su propia organización: la clave foránea compuesta lo impide.
    await expectPgError(
      db.withTenant(SUR.id, (tx) =>
        tx.insert(invitationRoles).values({ organizationId: SUR.id, invitationId, locationId: SUR.locations[0].id, role: 'proveedor' }),
      ),
      SQLSTATE.foreignKeyViolation,
    );
  });

  it('un rol clínico exige sede', async () => {
    await expect(
      db.withTenant(NORTE.id, (tx) =>
        tx.insert(invitationRoles).values({ organizationId: NORTE.id, invitationId, locationId: null, role: 'proveedor' }),
      ),
    ).rejects.toThrow();
  });
});

describe('has_active_membership_elsewhere', () => {
  let pool: pg.Pool;
  let db: TenantDb;
  const shared = randomUUID();
  const onlyNorte = randomUUID();
  const inactiveInSur = randomUUID();

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 4 });
    db = createTenantDb(pool);
    for (const userId of [shared, onlyNorte, inactiveInSur]) {
      await pool.query(
        `insert into auth."user" (id, name, email, email_verified, created_at, updated_at)
         values ($1, 'Persona Ficticia', $2, true, now(), now())`,
        [userId, `p.${userId}@example.test`],
      );
    }
    const join = (orgId: string, userId: string, status = 'active') =>
      db.withTenant(orgId, (tx) => tx.insert(memberships).values({ organizationId: orgId, userId, status }));
    await join(NORTE.id, shared);
    await join(SUR.id, shared);
    await join(NORTE.id, onlyNorte);
    await join(NORTE.id, inactiveInSur);
    await join(SUR.id, inactiveInSur, 'inactive');
  });

  afterAll(async () => {
    await pool.end();
  });

  const ask = async (userId: string, orgId: string) => {
    const { rows } = await pool.query<{ shared: boolean }>(
      'select app.has_active_membership_elsewhere($1, $2) as shared',
      [userId, orgId],
    );
    return rows[0]?.shared;
  };

  it('responde sí solo con una membresía ACTIVA en otra organización', async () => {
    expect(await ask(shared, NORTE.id)).toBe(true);
    expect(await ask(shared, SUR.id)).toBe(true);
    expect(await ask(onlyNorte, NORTE.id)).toBe(false);
    expect(await ask(inactiveInSur, NORTE.id)).toBe(false);
  });

  it('clinic_app sigue sin leer membresías ajenas: la política nueva es solo de clinic_owner', async () => {
    const sur = await db.withTenant(NORTE.id, (tx) => tx.select().from(memberships).where(eq(memberships.userId, shared)));
    expect(sur.map((m) => m.organizationId)).toEqual([NORTE.id]);
    const { rows } = await pool.query('select * from app.memberships');
    expect(rows).toEqual([]);
  });

  it('corre con search_path vacío y como SECURITY DEFINER de clinic_owner', async () => {
    const { rows } = await pool.query<{ owner: string; definer: boolean; config: string[] }>(
      `select pg_get_userbyid(p.proowner) as owner, p.prosecdef as definer, p.proconfig as config
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app' and p.proname = 'has_active_membership_elsewhere'`,
    );
    expect(rows).toEqual([{ owner: 'clinic_owner', definer: true, config: ['search_path=""'] }]);
  });
});

describe('last_sign_ins', () => {
  let pool: pg.Pool;
  let db: TenantDb;
  const norteUser = randomUUID();
  const surUser = randomUUID();
  const neverUser = randomUUID();

  const signInEvent = (userId: string, action: string, at: string) =>
    pool.query(
      `insert into app.audit_log (id, organization_id, actor_type, actor_id, action, ip, created_at)
       values ($4, null, 'user', $1, $2, '203.0.113.9', $3)`,
      [userId, action, at, randomUUID()],
    );

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 4 });
    db = createTenantDb(pool);
    for (const userId of [norteUser, surUser, neverUser]) {
      await pool.query(
        `insert into auth."user" (id, name, email, email_verified, created_at, updated_at)
         values ($1, 'Persona Ficticia', $2, true, now(), now())`,
        [userId, `u.${userId}@example.test`],
      );
    }
    await db.withTenant(NORTE.id, (tx) => tx.insert(memberships).values([{ organizationId: NORTE.id, userId: norteUser }, { organizationId: NORTE.id, userId: neverUser }]));
    await db.withTenant(SUR.id, (tx) => tx.insert(memberships).values({ organizationId: SUR.id, userId: surUser }));
    await signInEvent(norteUser, 'auth.sign_in.success', '2026-10-20T13:00:00Z');
    await signInEvent(norteUser, 'auth.mfa.success', '2026-10-27T12:45:00Z');
    // Otros eventos no cuentan como acceso.
    await signInEvent(norteUser, 'auth.sign_out', '2026-10-28T09:00:00Z');
    await signInEvent(norteUser, 'auth.sign_in.mfa_required', '2026-10-28T09:30:00Z');
    await signInEvent(surUser, 'auth.sign_in.success', '2026-10-26T15:00:00Z');
  });

  afterAll(async () => {
    await pool.end();
  });

  const lastIn = (orgId: string) =>
    db.withTenant(orgId, async (tx) => {
      const { rows } = await tx.execute<{ user_id: string; last_sign_in_at: Date }>(sql`select user_id, last_sign_in_at from app.last_sign_ins()`);
      return new Map(rows.map((r) => [r.user_id, new Date(r.last_sign_in_at).toISOString()]));
    });

  it('devuelve el último acceso solo de las personas de la organización del contexto', async () => {
    const norte = await lastIn(NORTE.id);
    expect(norte.get(norteUser)).toBe('2026-10-27T12:45:00.000Z');
    expect(norte.has(surUser)).toBe(false);
    expect(norte.has(neverUser)).toBe(false);
    const sur = await lastIn(SUR.id);
    expect(sur.get(surUser)).toBe('2026-10-26T15:00:00.000Z');
    expect(sur.has(norteUser)).toBe(false);
  });

  it('sin contexto no devuelve nada, y clinic_app sigue sin leer audit_log', async () => {
    const { rows } = await pool.query('select * from app.last_sign_ins()');
    expect(rows).toEqual([]);
    await expectPgError(pool.query('select * from app.audit_log'), SQLSTATE.insufficientPrivilege);
  });

  it('solo devuelve usuario y hora (sin IP), con search_path vacío y como SECURITY DEFINER de clinic_owner', async () => {
    const { rows } = await pool.query<{ owner: string; definer: boolean; config: string[]; result: string }>(
      `select pg_get_userbyid(p.proowner) as owner, p.prosecdef as definer, p.proconfig as config,
              pg_get_function_result(p.oid) as result
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app' and p.proname = 'last_sign_ins'`,
    );
    expect(rows).toEqual([
      { owner: 'clinic_owner', definer: true, config: ['search_path=""'], result: 'TABLE(user_id uuid, last_sign_in_at timestamp with time zone)' },
    ]);
  });
});
