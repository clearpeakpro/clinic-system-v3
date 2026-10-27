import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { membershipRoles, memberships } from '../src/identity-schema.ts';
import { DEMO } from '../src/seed.ts';
import { createTenantDb, type TenantDb } from '../src/with-tenant.ts';
import { expectPgError, SQLSTATE } from './helpers.ts';

// T-002, ajuste (1): las políticas own_memberships_read y
// own_membership_roles_read solo permiten LEER las membresías propias.

const NORTE = DEMO.norte;
const SUR = DEMO.sur;

interface Person {
  userId: string;
  memberships: Record<string, string>; // orgId → membershipId
}

describe('membresías propias con app.user_id (solo lectura)', () => {
  let pool: pg.Pool;
  let db: TenantDb;
  // ana: Norte y Sur. beto: solo Sur. carla: solo Norte.
  const people: Record<'ana' | 'beto' | 'carla', Person> = {
    ana: { userId: randomUUID(), memberships: {} },
    beto: { userId: randomUUID(), memberships: {} },
    carla: { userId: randomUUID(), memberships: {} },
  };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 4 });
    db = createTenantDb(pool);
    for (const [name, person] of Object.entries(people)) {
      await pool.query(
        `insert into auth."user" (id, name, email, email_verified, created_at, updated_at)
         values ($1, $2, $3, true, now(), now())`,
        [person.userId, `Persona ${name}`, `${name}.${person.userId}@example.test`],
      );
    }
    const assign = async (person: Person, org: typeof NORTE | typeof SUR, role: string) => {
      const membershipId = randomUUID();
      person.memberships[org.id] = membershipId;
      await db.withTenant(org.id, async (tx) => {
        await tx.insert(memberships).values({
          id: membershipId,
          organizationId: org.id,
          userId: person.userId,
        });
        await tx.insert(membershipRoles).values({
          organizationId: org.id,
          membershipId,
          locationId: org.locations[0].id,
          role,
        });
      });
    };
    await assign(people.ana, NORTE, 'recepcion');
    await assign(people.ana, SUR, 'enfermeria');
    await assign(people.beto, SUR, 'recepcion');
    await assign(people.carla, NORTE, 'enfermeria');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('una persona ve sus membresías en todas sus organizaciones y ninguna ajena', async () => {
    const rows = await db.withUser(people.ana.userId, (tx) =>
      tx.select({ userId: memberships.userId, orgId: memberships.organizationId }).from(memberships),
    );
    expect(rows.map((r) => r.orgId).sort()).toEqual([NORTE.id, SUR.id].sort());
    expect(rows.every((r) => r.userId === people.ana.userId)).toBe(true);
  });

  it('no ve membresías de otras personas, ni en otras organizaciones ni en la suya', async () => {
    const rows = await db.withUser(people.beto.userId, (tx) =>
      tx.select({ userId: memberships.userId }).from(memberships),
    );
    // beto solo está en Sur: no ve a carla (Norte) ni a ana (Norte y Sur).
    expect(rows).toEqual([{ userId: people.beto.userId }]);
  });

  it('membership_roles: solo los roles de sus membresías', async () => {
    const rows = await db.withUser(people.carla.userId, (tx) =>
      tx.select({ membershipId: membershipRoles.membershipId }).from(membershipRoles),
    );
    expect(rows).toEqual([{ membershipId: people.carla.memberships[NORTE.id] }]);
  });

  it('no puede actualizar su propia membresía de otra organización', async () => {
    const surMembership = people.ana.memberships[SUR.id];
    if (!surMembership) throw new Error('falta la membresía de prueba');
    const updated = await db.withUser(people.ana.userId, (tx) =>
      tx
        .update(memberships)
        .set({ status: 'inactive' })
        .where(eq(memberships.id, surMembership))
        .returning({ id: memberships.id }),
    );
    expect(updated).toEqual([]);

    // Ni siquiera con el contexto de otra organización (Norte).
    const fromNorte = await db.withTenant(NORTE.id, (tx) =>
      tx
        .update(memberships)
        .set({ status: 'inactive' })
        .where(eq(memberships.id, surMembership))
        .returning({ id: memberships.id }),
    );
    expect(fromNorte).toEqual([]);

    const still = await db.withTenant(SUR.id, (tx) =>
      tx.select({ status: memberships.status }).from(memberships).where(eq(memberships.id, surMembership)),
    );
    expect(still).toEqual([{ status: 'active' }]);
  });

  it('con app.user_id no puede crear membresías ni roles para sí misma', async () => {
    await expectPgError(
      db.withUser(people.beto.userId, (tx) =>
        tx.insert(memberships).values({ organizationId: NORTE.id, userId: people.beto.userId }),
      ),
      SQLSTATE.insufficientPrivilege,
    );
    const betoSur = people.beto.memberships[SUR.id];
    if (!betoSur) throw new Error('falta la membresía de prueba');
    await expectPgError(
      db.withUser(people.beto.userId, (tx) =>
        tx.insert(membershipRoles).values({
          organizationId: SUR.id,
          membershipId: betoSur,
          locationId: SUR.locations[0].id,
          role: 'enfermeria',
        }),
      ),
      SQLSTATE.insufficientPrivilege,
    );
  });

  it('con app.user_id no puede borrar sus propios roles', async () => {
    const deleted = await db.withUser(people.ana.userId, (tx) =>
      tx.delete(membershipRoles).returning({ id: membershipRoles.id }),
    );
    expect(deleted).toEqual([]);
  });

  it('withTenant sigue viendo solo la organización del contexto', async () => {
    const rows = await db.withTenant(NORTE.id, (tx) =>
      tx.select({ orgId: memberships.organizationId }).from(memberships),
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => r.orgId === NORTE.id)).toBe(true);
  });
});
