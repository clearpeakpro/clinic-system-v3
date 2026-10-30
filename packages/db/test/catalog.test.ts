import { and, eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { appointmentTypes, labTests, prices, procedures, referralSources } from '../src/catalog-schema.ts';
import { DEMO, DEMO_CATALOG } from '../src/seed.ts';
import { createTenantDb, type TenantDb } from '../src/with-tenant.ts';
import { expectPgError, SQLSTATE } from './helpers.ts';

// T-011: catálogo mínimo y precios por sede. Aislamiento con el rol real y un
// pool, reglas de la base de datos (código, rangos, un ítem por precio) y que
// nada se borra ni un precio se modifica. Datos ficticios.

const NORTE = DEMO.norte;
const SUR = DEMO.sur;
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

describe('catálogo', () => {
  let pool: pg.Pool;
  let db: TenantDb;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 4 });
    db = createTenantDb(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  const procedureId = async (orgId: string, code: string) =>
    (await db.withTenant(orgId, (tx) => tx.select({ id: procedures.id }).from(procedures).where(eq(procedures.code, code))))[0]?.id ?? '';

  it('la semilla deja el catálogo básico en cada organización: precio general y, en Norte, excepciones en NOR2', async () => {
    for (const org of [NORTE, SUR]) {
      const rows = await db.withTenant(org.id, async (tx) => ({
        types: await tx.select().from(appointmentTypes),
        procedures: await tx.select().from(procedures),
        labs: await tx.select().from(labTests),
        sources: await tx.select().from(referralSources),
        prices: await tx.select().from(prices),
      }));
      expect(rows.types.map((t) => t.code).sort()).toEqual(DEMO_CATALOG.appointmentTypes.map((t) => t.code).sort());
      expect(rows.procedures).toHaveLength(DEMO_CATALOG.procedures.length);
      expect(rows.labs).toHaveLength(DEMO_CATALOG.labTests.length);
      expect(rows.sources).toHaveLength(DEMO_CATALOG.referralSources.length);
      // Tres ítems con precio general; en Norte, dos con excepción en NOR2.
      expect(rows.prices.filter((p) => p.locationId === null)).toHaveLength(3);
      const exceptions = rows.prices.filter((p) => p.locationId !== null);
      expect(exceptions.map((p) => p.locationId)).toEqual(org === NORTE ? [NORTE.locations[1].id, NORTE.locations[1].id] : []);
    }
  });

  it('cada organización ve solo su catálogo; sin contexto no se ve nada', async () => {
    const norte = await procedureId(NORTE.id, 'INJ-B12');
    const sur = await procedureId(SUR.id, 'INJ-B12');
    expect(norte).not.toBe(sur);
    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(procedures).where(eq(procedures.id, norte)))).toEqual([]);
    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(prices).where(eq(prices.procedureId, norte)))).toEqual([]);
    for (const table of ['appointment_types', 'procedures', 'lab_tests', 'referral_sources', 'prices']) {
      expect((await pool.query(`select * from app.${table}`)).rows, table).toEqual([]);
    }
  });

  it('no se escribe en otra organización ni un precio apunta a una sede o un ítem de otra', async () => {
    await expectPgError(
      db.withTenant(SUR.id, (tx) => tx.insert(procedures).values({ organizationId: NORTE.id, code: 'X-1', name: 'X', kind: 'procedure' })),
      SQLSTATE.insufficientPrivilege,
    );
    const norte = await procedureId(NORTE.id, 'INJ-B12');
    await expectPgError(
      db.withTenant(NORTE.id, (tx) =>
        tx.insert(prices).values({ organizationId: NORTE.id, locationId: SUR.locations[0].id, procedureId: norte, amountCents: 100, effectiveFrom: '2026-02-01' }),
      ),
      SQLSTATE.foreignKeyViolation,
    );
    const sur = await procedureId(SUR.id, 'INJ-B12');
    await expectPgError(
      db.withTenant(NORTE.id, (tx) =>
        tx.insert(prices).values({ organizationId: NORTE.id, locationId: NORTE.locations[0].id, procedureId: sur, amountCents: 100, effectiveFrom: '2026-02-01' }),
      ),
      SQLSTATE.foreignKeyViolation,
    );
  });

  it('el código es único por organización y tiene formato (acepta guion)', async () => {
    const insert = (code: string) =>
      db.withTenant(NORTE.id, (tx) => tx.insert(labTests).values({ organizationId: NORTE.id, code, name: 'Prueba ficticia' }));
    await insert('LAB-FORMATO_1');
    await expectPgError(insert('LAB-FORMATO_1'), UNIQUE_VIOLATION);
    await expectPgError(insert('lab-minusculas'), CHECK_VIOLATION);
    await expectPgError(insert('1LAB'), CHECK_VIOLATION);
    await expectPgError(insert('L'), CHECK_VIOLATION);
    // El mismo código en otra organización sí.
    await db.withTenant(SUR.id, (tx) => tx.insert(labTests).values({ organizationId: SUR.id, code: 'LAB-FORMATO_1', name: 'Prueba ficticia' }));
  });

  it('rangos y valores permitidos: duración de 5 a 480, ruta, color y tipo', async () => {
    const type = (values: Partial<typeof appointmentTypes.$inferInsert>) =>
      db.withTenant(NORTE.id, (tx) =>
        tx.insert(appointmentTypes).values({ organizationId: NORTE.id, code: `T-${String(Math.random()).slice(2, 8)}`, name: 'Tipo ficticio', ...values }),
      );
    await type({ defaultDurationMinutes: 5, suggestedRoute: 'LAB_ONLY', color: 'stone' });
    await type({ defaultDurationMinutes: 480 });
    await expectPgError(type({ defaultDurationMinutes: 4 }), CHECK_VIOLATION);
    await expectPgError(type({ defaultDurationMinutes: 481 }), CHECK_VIOLATION);
    await expectPgError(type({ suggestedRoute: 'OTRA' }), CHECK_VIOLATION);
    await expectPgError(type({ color: 'red' }), CHECK_VIOLATION);
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.insert(procedures).values({ organizationId: NORTE.id, code: 'P-KIND', name: 'X', kind: 'otro' })),
      CHECK_VIOLATION,
    );
  });

  it('un precio general (sin sede) vale para la organización; una excepción no puede ser de una sede de otra', async () => {
    const norte = await procedureId(NORTE.id, 'PROC-LAVOT');
    await db.withTenant(NORTE.id, (tx) => tx.insert(prices).values({ organizationId: NORTE.id, locationId: null, procedureId: norte, amountCents: 3100, effectiveFrom: '2026-04-01' }));
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.insert(prices).values({ organizationId: NORTE.id, locationId: SUR.locations[1].id, procedureId: norte, amountCents: 3100, effectiveFrom: '2026-04-01' })),
      SQLSTATE.foreignKeyViolation,
    );
  });

  it('un precio es de un solo ítem, no negativo, y nunca se modifica ni se borra', async () => {
    const norte = await procedureId(NORTE.id, 'INJ-B12');
    const lab = (await db.withTenant(NORTE.id, (tx) => tx.select({ id: labTests.id }).from(labTests).where(eq(labTests.code, 'LAB-STREP'))))[0]?.id;
    const base = { organizationId: NORTE.id, locationId: NORTE.locations[0].id, effectiveFrom: '2026-03-01' };
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(prices).values({ ...base, amountCents: 100 })), CHECK_VIOLATION);
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.insert(prices).values({ ...base, procedureId: norte, labTestId: lab, amountCents: 100 })),
      CHECK_VIOLATION,
    );
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(prices).values({ ...base, procedureId: norte, amountCents: -1 })), CHECK_VIOLATION);
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.update(prices).set({ amountCents: 1 }).where(eq(prices.procedureId, norte))),
      SQLSTATE.insufficientPrivilege,
    );
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.delete(prices).where(eq(prices.procedureId, norte))), SQLSTATE.insufficientPrivilege);
  });

  it('los ítems se desactivan, no se borran', async () => {
    for (const table of [appointmentTypes, procedures, labTests, referralSources]) {
      await expectPgError(db.withTenant(NORTE.id, (tx) => tx.delete(table)), SQLSTATE.insufficientPrivilege);
    }
    const [row] = await db.withTenant(NORTE.id, (tx) =>
      tx
        .update(referralSources)
        .set({ active: false, version: 2 })
        .where(and(eq(referralSources.code, 'LETRERO'), eq(referralSources.version, 1)))
        .returning({ active: referralSources.active }),
    );
    expect(row?.active).toBe(false);
    await db.withTenant(NORTE.id, (tx) => tx.update(referralSources).set({ active: true }).where(eq(referralSources.code, 'LETRERO')));
  });
});
