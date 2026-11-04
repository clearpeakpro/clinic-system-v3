import { MEMBERSHIP_BENEFIT_TYPE_VALUES, MEMBERSHIP_FEE_MAX_CENTS as DB_FEE_MAX } from '@clinic/db';
import {
  MEMBERSHIP_BENEFIT_TYPES,
  MEMBERSHIP_FEE_MAX_CENTS,
  type CatalogList,
  type MembershipPlanDetail,
  type MembershipPlanList,
} from '@clinic/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStaff, NORTE, readAudit, signedInWithContext, startApp, SUR, type Client, type TestApp } from './support.ts';

// T-026b parte A: planes de membresía (S-ADM-21) y sus beneficios (S-ADM-22).
// Las cuotas valen en todas las sedes y tienen vigencia (un cambio «desde
// mañana» no altera las de hoy); un descuento activo por categoría; el tipo
// del beneficio no cambia; todo se audita con el antes y el después; solo
// Administración; Sur no ve los planes de Norte. Datos ficticios.

/** La auditoría en el orden en que se escribió (ids uuidv7): en una misma transacción, `created_at` empata. */
async function auditOf(where: string, params: unknown[]) {
  const rows = (await readAudit(where, params)) as (Awaited<ReturnType<typeof readAudit>>[number] & { id: string })[];
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

function nextDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

describe('T-026b planes de membresía y beneficios', () => {
  let app: TestApp;
  let admin: Client;
  let surAdmin: Client;
  let recepcion: Client;

  beforeAll(async () => {
    app = await startApp();
    admin = await signedInWithContext(app, await createStaff(app, 'plan-admin', [{ org: NORTE, location: null, role: 'administrador' }]), NORTE, 0, { mfa: true });
    surAdmin = await signedInWithContext(app, await createStaff(app, 'plan-sur', [{ org: SUR, location: null, role: 'administrador' }]), SUR, 0, { mfa: true });
    recepcion = await signedInWithContext(app, await createStaff(app, 'plan-rec', [{ org: NORTE, location: 0, role: 'recepcion' }]), NORTE, 0);
  });
  afterAll(async () => {
    await app.close();
  });

  const list = async (client: Client = admin) => {
    const response = await client.get('/api/admin/membership-plans');
    expect(response.statusCode, response.body).toBe(200);
    return response.json<MembershipPlanList>();
  };
  const detail = async (planId: string, client: Client = admin) => {
    const response = await client.get(`/api/admin/membership-plans/${planId}`);
    expect(response.statusCode, response.body).toBe(200);
    return response.json<MembershipPlanDetail & { generalToday: string }>();
  };
  const planOf = async (code: string) => (await list()).plans.find((p) => p.code === code);
  const catalogId = async (code: string) => {
    const catalog = (await admin.get('/api/admin/catalog')).json<CatalogList>();
    return Object.values(catalog.items)
      .flat()
      .find((i) => i.code === code)?.id ?? '';
  };

  it('los valores permitidos de la web y de la base de datos son los mismos', () => {
    expect([...MEMBERSHIP_BENEFIT_TYPES]).toEqual([...MEMBERSHIP_BENEFIT_TYPE_VALUES]);
    expect(MEMBERSHIP_FEE_MAX_CENTS).toBe(DB_FEE_MAX);
  });

  it('el Administrador ve los planes de la semilla con sus cuotas y sus beneficios', async () => {
    const { plans, generalToday } = await list();
    expect(generalToday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(plans.map((p) => p.code)).toEqual(['ESENCIAL', 'EXTENDIDO', 'TOTAL', 'FAMILIAR']);
    const familiar = plans.find((p) => p.code === 'FAMILIAR');
    expect(familiar).toMatchObject({
      nameEs: 'Plan Familiar',
      nameEn: 'Family Plan',
      maxMembers: 4,
      active: true,
      fee: { current: { initialFeeCents: 25000, monthlyFeeCents: 9900, effectiveFrom: '2026-01-01' }, next: null },
      activeBenefits: 8,
    });
    const total = await detail(plans.find((p) => p.code === 'TOTAL')?.id ?? '');
    const followUp = total.benefits.find((b) => b.nameEs === 'Consultas de seguimiento o enfermedad');
    expect(followUp).toMatchObject({ type: 'included', quantityPerYear: 3, includesSameVisitLabs: true });
    expect(followUp?.items.map((i) => [i.kind, i.code])).toEqual([['consultations', 'CONS-SEGUIMIENTO']]);
    const checkup = total.benefits.find((b) => b.nameEs === 'Chequeo general');
    expect(checkup?.items.map((i) => i.code)).toEqual(['LAB-A1C', 'LAB-TSH']);
    expect(total.benefits.find((b) => b.category === 'consultation')).toMatchObject({ type: 'discount', discountBp: 10000, nameEs: null });
  });

  it('crea un plan con sus cuotas; un cambio de cuotas desde mañana no altera las de hoy; todo queda auditado', async () => {
    const { generalToday } = await list();
    const base = { nameEs: 'Plan Ficticio', nameEn: 'Dummy Plan', descriptionEs: null, descriptionEn: null, maxMembers: 2, sortOrder: null };
    const created = await admin.post('/api/admin/membership-plans', {
      ...base,
      code: 'FICTICIO',
      fee: { initialFeeCents: 5000, monthlyFeeCents: 2000, effectiveFrom: generalToday },
    });
    expect(created.statusCode, created.body).toBe(201);
    const { id } = created.json<{ id: string }>();
    const plan = await planOf('FICTICIO');
    expect(plan?.fee).toEqual({ current: { initialFeeCents: 5000, monthlyFeeCents: 2000, effectiveFrom: generalToday }, next: null });

    const tomorrow = nextDay(generalToday);
    const save = await admin.post(`/api/admin/membership-plans/${id}`, {
      ...base,
      maxMembers: 3,
      expectedVersion: plan?.version,
      fee: { initialFeeCents: 6000, monthlyFeeCents: 2500, effectiveFrom: tomorrow },
    });
    expect(save.statusCode, save.body).toBe(204);
    const after = await planOf('FICTICIO');
    expect(after?.maxMembers).toBe(3);
    expect(after?.fee).toEqual({
      current: { initialFeeCents: 5000, monthlyFeeCents: 2000, effectiveFrom: generalToday },
      next: { initialFeeCents: 6000, monthlyFeeCents: 2500, effectiveFrom: tomorrow },
    });

    // Sin contexto RLS, los planes y sus cuotas no se ven.
    const { rows } = await app.pool.query<{ n: number }>('select count(*)::int as n from app.membership_plan_fees where plan_id = $1', [id]);
    expect(rows[0]?.n).toBe(0);
    const audit = await auditOf(`entity_id = $1`, [id]);
    expect(audit.map((a) => [a.action, a.metadata])).toEqual([
      ['membership_plan.created', { code: 'FICTICIO', maxMembers: 2 }],
      [
        'membership_plan.fee_set',
        { effectiveFrom: generalToday, previousInitialCents: 'none', previousMonthlyCents: 'none', newInitialCents: 5000, newMonthlyCents: 2000 },
      ],
      ['membership_plan.updated', { fields: 'maxMembers', previousMaxMembers: 2, newMaxMembers: 3 }],
      [
        'membership_plan.fee_set',
        { effectiveFrom: tomorrow, previousInitialCents: 5000, previousMonthlyCents: 2000, newInitialCents: 6000, newMonthlyCents: 2500 },
      ],
    ]);
  });

  it('rechaza unas cuotas con fecha pasada, un código repetido, una versión vieja y desactivar sin motivo', async () => {
    const plan = await planOf('ESENCIAL');
    const base = { nameEs: 'Plan Esencial', nameEn: 'Essential Plan', descriptionEs: null, descriptionEn: null, maxMembers: 1, sortOrder: 10 };
    const past = await admin.post(`/api/admin/membership-plans/${plan?.id ?? ''}`, {
      ...base,
      expectedVersion: plan?.version,
      fee: { initialFeeCents: 1, monthlyFeeCents: 1, effectiveFrom: '2026-01-01' },
    });
    expect(past.json()).toEqual({ code: 'effective_from_past' });
    const taken = await admin.post('/api/admin/membership-plans', {
      ...base,
      code: 'ESENCIAL',
      fee: { initialFeeCents: 1, monthlyFeeCents: 1, effectiveFrom: (await list()).generalToday },
    });
    expect([taken.statusCode, taken.json<{ code: string }>().code]).toEqual([409, 'catalog_code_taken']);
    const stale = await admin.post(`/api/admin/membership-plans/${plan?.id ?? ''}`, { ...base, expectedVersion: 999 });
    expect([stale.statusCode, stale.json<{ code: string }>().code]).toEqual([409, 'version_conflict']);
    expect((await admin.post(`/api/admin/membership-plans/${plan?.id ?? ''}/deactivate`, { expectedVersion: plan?.version })).statusCode).toBe(400);
    // Montos en centavos enteros y un máximo de personas de 1 a 1000.
    expect((await admin.post('/api/admin/membership-plans', { ...base, code: 'X-1', fee: { initialFeeCents: 10.5, monthlyFeeCents: 1, effectiveFrom: '2027-01-01' } })).statusCode).toBe(400);
    expect((await admin.post('/api/admin/membership-plans', { ...base, code: 'X-2', maxMembers: 0, fee: { initialFeeCents: 1, monthlyFeeCents: 1, effectiveFrom: '2027-01-01' } })).statusCode).toBe(400);
  });

  it('desactivar un plan con motivo y reactivarlo; queda auditado', async () => {
    const plan = await planOf('FICTICIO');
    const id = plan?.id ?? '';
    expect((await admin.post(`/api/admin/membership-plans/${id}/deactivate`, { reason: 'Ya no se vende', expectedVersion: plan?.version })).statusCode).toBe(204);
    const inactive = await planOf('FICTICIO');
    expect(inactive?.active).toBe(false);
    const again = await admin.post(`/api/admin/membership-plans/${id}/deactivate`, { reason: 'Otra vez', expectedVersion: inactive?.version });
    expect(again.json()).toEqual({ code: 'catalog_item_already_inactive' });
    expect((await admin.post(`/api/admin/membership-plans/${id}/reactivate`, { expectedVersion: inactive?.version })).statusCode).toBe(204);
    const audit = await auditOf(`entity_id = $1 and action like 'membership_plan.%activated'`, [id]);
    expect(audit.map((a) => [a.action, a.reason])).toEqual([
      ['membership_plan.deactivated', 'Ya no se vende'],
      ['membership_plan.reactivated', null],
    ]);
  });

  it('beneficios: incluido con sus servicios y descuento por categoría; el tipo no cambia; un descuento activo por categoría', async () => {
    const plan = await planOf('FICTICIO');
    const planId = plan?.id ?? '';
    const consult = await catalogId('CONS-INICIAL');
    const a1c = await catalogId('LAB-A1C');
    const b12 = await catalogId('INJ-B12');

    const included = await admin.post(`/api/admin/membership-plans/${planId}/benefits`, {
      type: 'included',
      nameEs: 'Consulta inicial ficticia',
      nameEn: 'Dummy initial visit',
      quantityPerYear: 1,
      includesSameVisitLabs: false,
      items: [
        { kind: 'consultations', id: consult },
        { kind: 'lab-tests', id: a1c },
      ],
      sortOrder: null,
    });
    expect(included.statusCode, included.body).toBe(201);
    const includedId = included.json<{ id: string }>().id;
    const discount = await admin.post(`/api/admin/membership-plans/${planId}/benefits`, { type: 'discount', category: 'treatment', discountBp: 2500, sortOrder: null });
    expect(discount.statusCode, discount.body).toBe(201);
    const discountId = discount.json<{ id: string }>().id;

    // Un segundo descuento activo de la misma categoría, no.
    const repeated = await admin.post(`/api/admin/membership-plans/${planId}/benefits`, { type: 'discount', category: 'treatment', discountBp: 1000, sortOrder: null });
    expect([repeated.statusCode, repeated.json<{ code: string }>().code]).toEqual([409, 'benefit_category_taken']);
    // Un servicio que no existe o un porcentaje fuera de rango, no.
    const unknown = await admin.post(`/api/admin/membership-plans/${planId}/benefits`, {
      type: 'included',
      nameEs: 'X',
      nameEn: 'X',
      quantityPerYear: 1,
      includesSameVisitLabs: false,
      items: [{ kind: 'procedures', id: consult }],
      sortOrder: null,
    });
    expect(unknown.json()).toEqual({ code: 'invalid_benefit_item' });
    expect((await admin.post(`/api/admin/membership-plans/${planId}/benefits`, { type: 'discount', category: 'lab', discountBp: 10001, sortOrder: null })).statusCode).toBe(400);
    // Un incluido sin servicios, no.
    expect(
      (await admin.post(`/api/admin/membership-plans/${planId}/benefits`, { type: 'included', nameEs: 'X', nameEn: 'X', quantityPerYear: 1, includesSameVisitLabs: false, items: [], sortOrder: null }))
        .statusCode,
    ).toBe(400);

    let benefits = (await detail(planId)).benefits;
    const savedIncluded = benefits.find((b) => b.id === includedId);
    expect(savedIncluded?.items.map((i) => i.code)).toEqual(['CONS-INICIAL', 'LAB-A1C']);
    expect((await detail(planId)).plan.activeBenefits).toBe(2);

    // Editar el incluido: otra cantidad y otros servicios (se reemplazan).
    const edit = await admin.post(`/api/admin/membership-plans/benefits/${includedId}`, {
      type: 'included',
      nameEs: 'Consulta inicial ficticia',
      nameEn: 'Dummy initial visit',
      quantityPerYear: 2,
      includesSameVisitLabs: true,
      items: [{ kind: 'procedures', id: b12 }],
      sortOrder: null,
      expectedVersion: savedIncluded?.version,
    });
    expect(edit.statusCode, edit.body).toBe(204);
    // El tipo no cambia.
    const savedDiscount = benefits.find((b) => b.id === discountId);
    const retype = await admin.post(`/api/admin/membership-plans/benefits/${discountId}`, {
      type: 'included',
      nameEs: 'X',
      nameEn: 'X',
      quantityPerYear: 1,
      includesSameVisitLabs: false,
      items: [{ kind: 'procedures', id: b12 }],
      sortOrder: null,
      expectedVersion: savedDiscount?.version,
    });
    expect(retype.json()).toEqual({ code: 'benefit_type_immutable' });
    const percent = await admin.post(`/api/admin/membership-plans/benefits/${discountId}`, {
      type: 'discount',
      category: 'treatment',
      discountBp: 3000,
      sortOrder: null,
      expectedVersion: savedDiscount?.version,
    });
    expect(percent.statusCode, percent.body).toBe(204);
    benefits = (await detail(planId)).benefits;
    expect(benefits.find((b) => b.id === includedId)).toMatchObject({ quantityPerYear: 2, includesSameVisitLabs: true, items: [{ code: 'INJ-B12' }] });
    expect(benefits.find((b) => b.id === discountId)).toMatchObject({ discountBp: 3000, version: 2 });

    // Desactivar el descuento deja crear otro de la misma categoría; reactivar el primero, no.
    expect((await admin.post(`/api/admin/membership-plans/benefits/${discountId}/deactivate`, { reason: 'Cambio de plan', expectedVersion: 2 })).statusCode).toBe(204);
    expect(
      (await admin.post(`/api/admin/membership-plans/${planId}/benefits`, { type: 'discount', category: 'treatment', discountBp: 1000, sortOrder: null })).statusCode,
    ).toBe(201);
    const reactivate = await admin.post(`/api/admin/membership-plans/benefits/${discountId}/reactivate`, { expectedVersion: 3 });
    expect([reactivate.statusCode, reactivate.json<{ code: string }>().code]).toEqual([409, 'benefit_category_taken']);

    // La auditoría guarda el antes y el después (importes, porcentajes y códigos del catálogo).
    const audit = await auditOf(`entity_id = $1`, [includedId]);
    expect(audit.map((a) => [a.action, a.metadata])).toEqual([
      ['membership_benefit.created', { planId, type: 'included', newQuantity: 1, newSameVisitLabs: false, newItems: 'CONS-INICIAL,LAB-A1C' }],
      [
        'membership_benefit.updated',
        {
          planId,
          type: 'included',
          previousQuantity: 1,
          previousSameVisitLabs: false,
          previousItems: 'CONS-INICIAL,LAB-A1C',
          newQuantity: 2,
          newSameVisitLabs: true,
          newItems: 'INJ-B12',
        },
      ],
    ]);
    const discountAudit = await auditOf(`entity_id = $1`, [discountId]);
    expect(discountAudit.map((a) => [a.action, a.metadata, a.reason])).toEqual([
      ['membership_benefit.created', { planId, type: 'discount', newCategory: 'treatment', newDiscountBp: 2500 }, null],
      [
        'membership_benefit.updated',
        { planId, type: 'discount', previousCategory: 'treatment', previousDiscountBp: 2500, newCategory: 'treatment', newDiscountBp: 3000 },
        null,
      ],
      ['membership_benefit.deactivated', { planId }, 'Cambio de plan'],
    ]);
  });

  it('solo Propietario y Administrador gestionan los planes', async () => {
    expect((await recepcion.get('/api/admin/membership-plans')).statusCode).toBe(403);
    const plan = await planOf('ESENCIAL');
    expect((await recepcion.get(`/api/admin/membership-plans/${plan?.id ?? ''}`)).statusCode).toBe(403);
    expect((await recepcion.post(`/api/admin/membership-plans/${plan?.id ?? ''}/benefits`, { type: 'discount', category: 'lab', discountBp: 100, sortOrder: null })).statusCode).toBe(
      403,
    );
  });

  it('Sur no ve los planes de Norte ni puede cambiarlos', async () => {
    const norte = await planOf('FICTICIO');
    const sur = await list(surAdmin);
    expect(sur.plans.find((p) => p.code === 'FICTICIO')).toBeUndefined();
    expect(sur.plans.find((p) => p.code === 'TOTAL')?.id).not.toBe((await planOf('TOTAL'))?.id);
    expect((await surAdmin.get(`/api/admin/membership-plans/${norte?.id ?? ''}`)).statusCode).toBe(404);
    expect((await surAdmin.post(`/api/admin/membership-plans/${norte?.id ?? ''}/deactivate`, { reason: 'x', expectedVersion: 1 })).statusCode).toBe(404);
    expect(
      (await surAdmin.post(`/api/admin/membership-plans/${norte?.id ?? ''}/benefits`, { type: 'discount', category: 'lab', discountBp: 100, sortOrder: null })).statusCode,
    ).toBe(404);
  });
});
