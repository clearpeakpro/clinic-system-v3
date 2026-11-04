import { and, eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { consultations, labTests } from '../src/catalog-schema.ts';
import { membershipBenefitItems, membershipBenefits, membershipPlanFees, membershipPlans } from '../src/membership-plans-schema.ts';
import { DEMO, DEMO_MEMBERSHIP_PLANS } from '../src/seed.ts';
import { createTenantDb, type TenantDb } from '../src/with-tenant.ts';
import { expectPgError, SQLSTATE } from './helpers.ts';

// T-026b parte A: planes de membresía, sus cuotas, sus beneficios y los
// servicios de cada incluido. Aislamiento con el rol real (clinic_app) y un
// pool: cada organización ve y escribe solo lo suyo y nada apunta a otra.
// Reglas: cada tipo de beneficio con sus campos, un descuento activo por
// categoría, las cuotas no se modifican ni se borran, los planes y
// beneficios se desactivan y no se borran. Datos ficticios.

const NORTE = DEMO.norte;
const SUR = DEMO.sur;
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

describe('planes de membresía', () => {
  let pool: pg.Pool;
  let db: TenantDb;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 4 });
    db = createTenantDb(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  const planId = async (orgId: string, code: string) =>
    (await db.withTenant(orgId, (tx) => tx.select({ id: membershipPlans.id }).from(membershipPlans).where(eq(membershipPlans.code, code))))[0]?.id ?? '';
  const consultationId = async (orgId: string, code: string) =>
    (await db.withTenant(orgId, (tx) => tx.select({ id: consultations.id }).from(consultations).where(eq(consultations.code, code))))[0]?.id ?? '';
  const discount = (orgId: string, plan: string, values: Partial<typeof membershipBenefits.$inferInsert> = {}) =>
    db.withTenant(orgId, (tx) =>
      tx
        .insert(membershipBenefits)
        .values({ organizationId: orgId, planId: plan, type: 'discount', category: 'treatment', discountBp: 1000, ...values })
        .returning({ id: membershipBenefits.id }),
    );

  it('la semilla deja los cuatro planes en cada organización, con sus cuotas, sus incluidos y sus descuentos', async () => {
    for (const org of [NORTE, SUR]) {
      const rows = await db.withTenant(org.id, async (tx) => ({
        plans: await tx.select().from(membershipPlans),
        fees: await tx.select().from(membershipPlanFees),
        benefits: await tx.select().from(membershipBenefits),
        items: await tx.select().from(membershipBenefitItems),
      }));
      expect(rows.plans.map((p) => p.code).sort()).toEqual(DEMO_MEMBERSHIP_PLANS.plans.map((p) => p.code).sort());
      expect(rows.fees).toHaveLength(DEMO_MEMBERSHIP_PLANS.plans.length);
      const familiar = rows.plans.find((p) => p.code === 'FAMILIAR');
      expect(familiar?.maxMembers).toBe(4);
      expect(rows.fees.find((f) => f.planId === familiar?.id)).toMatchObject({ initialFeeCents: 25000, monthlyFeeCents: 9900 });
      // Total: consultas al 100 % y sus consultas de seguimiento incluyen los laboratorios de la misma visita.
      const total = rows.plans.find((p) => p.code === 'TOTAL');
      const totalBenefits = rows.benefits.filter((b) => b.planId === total?.id);
      expect(totalBenefits.find((b) => b.category === 'consultation')?.discountBp).toBe(10000);
      expect(totalBenefits.filter((b) => b.includesSameVisitLabs).map((b) => b.quantityPerYear)).toEqual([3]);
      expect(rows.items.length).toBeGreaterThan(0);
    }
  });

  it('cada organización ve solo sus planes, cuotas, beneficios y servicios; sin contexto no se ve nada', async () => {
    const norte = await planId(NORTE.id, 'TOTAL');
    expect(norte).not.toBe(await planId(SUR.id, 'TOTAL'));
    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(membershipPlans).where(eq(membershipPlans.id, norte)))).toEqual([]);
    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(membershipPlanFees).where(eq(membershipPlanFees.planId, norte)))).toEqual([]);
    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(membershipBenefits).where(eq(membershipBenefits.planId, norte)))).toEqual([]);
    for (const table of ['membership_plans', 'membership_plan_fees', 'membership_benefits', 'membership_benefit_items']) {
      expect((await pool.query(`select * from app.${table}`)).rows, table).toEqual([]);
    }
  });

  it('no se escribe en otra organización ni nada apunta a un plan, un beneficio o un servicio de otra', async () => {
    const norte = await planId(NORTE.id, 'ESENCIAL');
    const sur = await planId(SUR.id, 'ESENCIAL');
    await expectPgError(
      db.withTenant(SUR.id, (tx) => tx.insert(membershipPlans).values({ organizationId: NORTE.id, code: 'X-1', nameEs: 'X', nameEn: 'X', maxMembers: 1 })),
      SQLSTATE.insufficientPrivilege,
    );
    await expectPgError(
      db.withTenant(NORTE.id, (tx) =>
        tx.insert(membershipPlanFees).values({ organizationId: NORTE.id, planId: sur, initialFeeCents: 1, monthlyFeeCents: 1, effectiveFrom: '2026-02-01' }),
      ),
      SQLSTATE.foreignKeyViolation,
    );
    await expectPgError(discount(NORTE.id, sur), SQLSTATE.foreignKeyViolation);
    const [benefit] = await db.withTenant(NORTE.id, (tx) =>
      tx
        .insert(membershipBenefits)
        .values({ organizationId: NORTE.id, planId: norte, type: 'included', nameEs: 'Ficticio', nameEn: 'Dummy', quantityPerYear: 1 })
        .returning({ id: membershipBenefits.id }),
    );
    const surConsultation = await consultationId(SUR.id, 'CONS-INICIAL');
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.insert(membershipBenefitItems).values({ organizationId: NORTE.id, benefitId: benefit?.id ?? '', consultationId: surConsultation })),
      SQLSTATE.foreignKeyViolation,
    );
    await expectPgError(
      db.withTenant(SUR.id, (tx) =>
        tx.insert(membershipBenefitItems).values({ organizationId: SUR.id, benefitId: benefit?.id ?? '', consultationId: surConsultation }),
      ),
      SQLSTATE.foreignKeyViolation,
    );
  });

  it('cada tipo de beneficio lleva solo sus campos; porcentaje de 0 a 100 y cantidad de 1 a 100 000', async () => {
    const plan = await planId(NORTE.id, 'EXTENDIDO');
    const included = (values: Partial<typeof membershipBenefits.$inferInsert>) =>
      db.withTenant(NORTE.id, (tx) =>
        tx.insert(membershipBenefits).values({ organizationId: NORTE.id, planId: plan, type: 'included', nameEs: 'X', nameEn: 'X', quantityPerYear: 1, ...values }),
      );
    await expectPgError(included({ category: 'lab' }), CHECK_VIOLATION);
    await expectPgError(included({ quantityPerYear: null }), CHECK_VIOLATION);
    await expectPgError(included({ quantityPerYear: 0 }), CHECK_VIOLATION);
    await expectPgError(included({ quantityPerYear: 100_001 }), CHECK_VIOLATION);
    await expectPgError(discount(NORTE.id, plan, { category: 'lab', discountBp: 10_001 }), CHECK_VIOLATION);
    await expectPgError(discount(NORTE.id, plan, { category: 'otra' }), CHECK_VIOLATION);
    await expectPgError(discount(NORTE.id, plan, { nameEs: 'X' }), CHECK_VIOLATION);
    await expectPgError(discount(NORTE.id, plan, { includesSameVisitLabs: true }), CHECK_VIOLATION);
    await expectPgError(discount(NORTE.id, plan, { type: 'otro' }), CHECK_VIOLATION);
  });

  it('un solo descuento activo por categoría en cada plan; uno inactivo no cuenta', async () => {
    const plan = await planId(NORTE.id, 'FAMILIAR');
    // La semilla ya tiene «Tratamiento» activo en el plan.
    await expectPgError(discount(NORTE.id, plan), UNIQUE_VIOLATION);
    await discount(NORTE.id, plan, { active: false });
    await discount(NORTE.id, plan, { active: false });
  });

  it('un servicio es de un solo catálogo y no se repite en el beneficio', async () => {
    const plan = await planId(NORTE.id, 'ESENCIAL');
    const [benefit] = await db.withTenant(NORTE.id, (tx) =>
      tx
        .insert(membershipBenefits)
        .values({ organizationId: NORTE.id, planId: plan, type: 'included', nameEs: 'Ficticio 2', nameEn: 'Dummy 2', quantityPerYear: 2 })
        .returning({ id: membershipBenefits.id }),
    );
    const benefitId = benefit?.id ?? '';
    const consultation = await consultationId(NORTE.id, 'CONS-SEGUIMIENTO');
    const lab = (await db.withTenant(NORTE.id, (tx) => tx.select({ id: labTests.id }).from(labTests).where(eq(labTests.code, 'LAB-A1C'))))[0]?.id;
    await db.withTenant(NORTE.id, (tx) => tx.insert(membershipBenefitItems).values({ organizationId: NORTE.id, benefitId, consultationId: consultation }));
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.insert(membershipBenefitItems).values({ organizationId: NORTE.id, benefitId, consultationId: consultation })),
      UNIQUE_VIOLATION,
    );
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.insert(membershipBenefitItems).values({ organizationId: NORTE.id, benefitId, consultationId: consultation, labTestId: lab })),
      CHECK_VIOLATION,
    );
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(membershipBenefitItems).values({ organizationId: NORTE.id, benefitId })), CHECK_VIOLATION);
    // Los servicios son configuración: se reemplazan al editar el beneficio.
    await db.withTenant(NORTE.id, (tx) => tx.delete(membershipBenefitItems).where(eq(membershipBenefitItems.benefitId, benefitId)));
  });

  it('las cuotas no se modifican ni se borran; planes y beneficios se desactivan, no se borran; el código y el tipo no cambian', async () => {
    const plan = await planId(NORTE.id, 'EXTENDIDO');
    await db.withTenant(NORTE.id, (tx) =>
      tx.insert(membershipPlanFees).values({ organizationId: NORTE.id, planId: plan, initialFeeCents: 16000, monthlyFeeCents: 6100, effectiveFrom: '2026-12-01' }),
    );
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.insert(membershipPlanFees).values({ organizationId: NORTE.id, planId: plan, initialFeeCents: -1, monthlyFeeCents: 1, effectiveFrom: '2026-12-01' })),
      CHECK_VIOLATION,
    );
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.update(membershipPlanFees).set({ monthlyFeeCents: 1 }).where(eq(membershipPlanFees.planId, plan))),
      SQLSTATE.insufficientPrivilege,
    );
    for (const table of [membershipPlanFees, membershipPlans, membershipBenefits]) {
      await expectPgError(db.withTenant(NORTE.id, (tx) => tx.delete(table)), SQLSTATE.insufficientPrivilege);
    }
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.update(membershipPlans).set({ code: 'OTRO' }).where(eq(membershipPlans.id, plan))),
      SQLSTATE.insufficientPrivilege,
    );
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.update(membershipBenefits).set({ type: 'included' }).where(eq(membershipBenefits.planId, plan))),
      SQLSTATE.insufficientPrivilege,
    );
    const [row] = await db.withTenant(NORTE.id, (tx) =>
      tx
        .update(membershipPlans)
        .set({ active: false, version: 2 })
        .where(and(eq(membershipPlans.id, plan), eq(membershipPlans.version, 1)))
        .returning({ active: membershipPlans.active }),
    );
    expect(row?.active).toBe(false);
    await db.withTenant(NORTE.id, (tx) => tx.update(membershipPlans).set({ active: true, version: 3 }).where(eq(membershipPlans.id, plan)));
  });
});
