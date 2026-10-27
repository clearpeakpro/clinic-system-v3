import { eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { locations, organizations, patients } from '../src/schema.ts';
import { DEMO } from '../src/seed.ts';
import { createTenantDb, type TenantDb, type Tx } from '../src/with-tenant.ts';
import { expectPgError, SQLSTATE } from './helpers.ts';

const A = DEMO.norte;
const B = DEMO.sur;

/** Se lanza para deshacer una transacción que sí debía funcionar. */
class Rollback extends Error {}

async function counts(tx: Tx) {
  // Secuencial: una transacción usa una sola conexión.
  const orgs = await tx.select({ id: organizations.id }).from(organizations);
  const locs = await tx.select({ organizationId: locations.organizationId }).from(locations);
  const pats = await tx.select({ organizationId: patients.organizationId }).from(patients);
  return { orgs, locs, pats };
}

function newPatient(orgId: string, locationId: string) {
  return {
    organizationId: orgId,
    registeredLocationId: locationId,
    firstName: 'Paciente',
    lastName: 'De Prueba',
    birthDate: '2000-01-01',
  };
}

describe('aislamiento entre organizaciones como clinic_app', () => {
  let pool: pg.Pool;
  let db: TenantDb;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 4 });
    db = createTenantDb(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('1. en el contexto A solo se ven filas de A', async () => {
    const { orgs, locs, pats } = await db.withTenant(A.id, counts);

    expect(orgs.map((o) => o.id)).toEqual([A.id]);
    expect(locs).toHaveLength(A.locations.length);
    expect(pats).toHaveLength(A.patients.length);
    expect(locs.every((l) => l.organizationId === A.id)).toBe(true);
    expect(pats.every((p) => p.organizationId === A.id)).toBe(true);

    const bPatient = await db.withTenant(A.id, (tx) =>
      tx.select().from(patients).where(eq(patients.id, B.patients[0].id)),
    );
    expect(bPatient).toEqual([]);
  });

  it('2. un INSERT con el organization_id de B en el contexto A falla', async () => {
    // Control: el mismo INSERT con los datos de A sí funciona.
    await expect(
      db.withTenant(A.id, async (tx) => {
        await tx.insert(patients).values(newPatient(A.id, A.locations[0].id));
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);

    await expectPgError(
      db.withTenant(A.id, (tx) => tx.insert(patients).values(newPatient(B.id, B.locations[0].id))),
      SQLSTATE.insufficientPrivilege,
    );
    await expectPgError(
      db.withTenant(A.id, (tx) =>
        tx.insert(locations).values({
          organizationId: B.id,
          code: 'XXX',
          name: 'Sede intrusa',
          timezone: 'America/New_York',
        }),
      ),
      SQLSTATE.insufficientPrivilege,
    );
  });

  it('3. un UPDATE que mueve una fila a B falla', async () => {
    // Control: actualizar una fila propia sí funciona.
    await expect(
      db.withTenant(A.id, async (tx) => {
        const updated = await tx
          .update(locations)
          .set({ name: 'Nombre nuevo' })
          .where(eq(locations.id, A.locations[0].id))
          .returning({ id: locations.id });
        expect(updated).toHaveLength(1);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);

    await expectPgError(
      db.withTenant(A.id, (tx) =>
        tx.update(locations).set({ organizationId: B.id }).where(eq(locations.id, A.locations[0].id)),
      ),
      SQLSTATE.insufficientPrivilege,
    );
    await expectPgError(
      db.withTenant(A.id, (tx) =>
        tx
          .update(patients)
          .set({ organizationId: B.id, registeredLocationId: B.locations[0].id })
          .where(eq(patients.id, A.patients[0].id)),
      ),
      SQLSTATE.insufficientPrivilege,
    );
  });

  it('3b. un UPDATE en el contexto A no alcanza filas de B', async () => {
    const updated = await db.withTenant(A.id, (tx) =>
      tx
        .update(patients)
        .set({ firstName: 'Cambiado' })
        .where(eq(patients.id, B.patients[0].id))
        .returning({ id: patients.id }),
    );
    expect(updated).toEqual([]);
  });

  it('4. un paciente de A no puede referenciar una sede de B', async () => {
    await expectPgError(
      db.withTenant(A.id, (tx) => tx.insert(patients).values(newPatient(A.id, B.locations[0].id))),
      SQLSTATE.foreignKeyViolation,
    );
    await expectPgError(
      db.withTenant(A.id, (tx) =>
        tx
          .update(patients)
          .set({ registeredLocationId: B.locations[0].id })
          .where(eq(patients.id, A.patients[0].id)),
      ),
      SQLSTATE.foreignKeyViolation,
    );
  });

  it('5. sin contexto no se ve nada y los INSERT fallan', async () => {
    for (const table of ['organizations', 'locations', 'patients']) {
      const { rows } = await pool.query<{ n: number }>(
        `select count(*)::int as n from app.${table}`,
      );
      expect(rows[0]?.n, table).toBe(0);
    }
    await expectPgError(
      pool.query(
        `insert into app.patients (id, organization_id, registered_location_id, first_name, last_name, birth_date)
         values (gen_random_uuid(), $1, $2, 'Paciente', 'De Prueba', '2000-01-01')`,
        [A.id, A.locations[0].id],
      ),
      SQLSTATE.insufficientPrivilege,
    );
  });

  it('6. en el mismo pool, A seguido de B no hereda el contexto', async () => {
    const single = new pg.Pool({ connectionString: inject('appUrl'), max: 1 });
    const singleDb = createTenantDb(single);
    const pid = (tx: Tx) =>
      tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`).then((r) => r.rows[0]?.pid);
    try {
      const a = await singleDb.withTenant(A.id, async (tx) => ({
        pid: await pid(tx),
        ...(await counts(tx)),
      }));
      const b = await singleDb.withTenant(B.id, async (tx) => ({
        pid: await pid(tx),
        ...(await counts(tx)),
      }));

      expect(b.pid).toBe(a.pid);
      expect(a.pats.every((p) => p.organizationId === A.id)).toBe(true);
      expect(b.pats).toHaveLength(B.patients.length);
      expect(b.pats.every((p) => p.organizationId === B.id)).toBe(true);

      // Tras las transacciones, la misma conexión queda sin contexto. El valor
      // vuelve a '' (no NULL): las políticas usan NULLIF para no fallar.
      const after = await single.query<{ pid: number; org: string | null; n: number }>(
        `select pg_backend_pid() as pid,
                current_setting('app.org_id', true) as org,
                (select count(*)::int from app.patients) as n`,
      );
      expect(after.rows[0]?.pid).toBe(a.pid);
      expect(after.rows[0]?.org ?? '').toBe('');
      expect(after.rows[0]?.n).toBe(0);
    } finally {
      await single.end();
    }
  });

  it('withTenant rechaza un orgId que no es UUID', async () => {
    await expect(db.withTenant("x' or true --", counts)).rejects.toBeInstanceOf(TypeError);
  });
});
