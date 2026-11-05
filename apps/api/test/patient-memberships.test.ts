import { randomUUID } from 'node:crypto';
import {
  charges,
  createTenantDb,
  labTests,
  membershipBenefitItems,
  membershipBenefits,
  membershipFees,
  membershipPlanFees,
  membershipPlans,
  nextCode,
  orderItems,
  patientMembershipMembers,
  patientMemberships,
  patients,
  procedures,
} from '@clinic/db';
import {
  monthlyFeesDue,
  percentOfCents,
  type ArrivalContext,
  type ArrivalResult,
  type EncounterDetail,
  type EncounterOrders,
  type EnrollmentOptions,
  type MembershipCancelResult,
  type MembershipSaved,
  type OrdersCreated,
  type PatientMembershipCard,
} from '@clinic/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixedClock } from '../src/clock.ts';
import { createStaff, membershipIdOf, NORTE, readAudit, signedInWithContext, SUR, type Client, type TestApp, startApp } from './support.ts';

// T-026b parte B (ADR 0034): membresía del paciente, sus cuotas y sus
// beneficios, con el reloj fijado (America/Chicago).
//  - Inscribe Recepción, con «Identidad verificada»; queda «Pendiente de
//    pago» con la cuota inicial pendiente. Un paciente, en una sola membresía.
//  - «Monto fijo»: la membresía guarda las cuotas vigentes el día de la
//    inscripción; un cambio de cuota del plan solo aplica a las nuevas.
//  - «Membresía» en la llegada solo con una membresía que da beneficios hoy.
//  - Beneficios en el servidor: incluido primero (por unidad), después el
//    descuento; «Paquete» y «Cupo compartido»; cancelar la orden libera el
//    incluido; año de beneficios (primer y último día).
//  - Aviso de cancelación con 15 días o más, y con menos.

/** 5 nov 2026, 10:00 a. m. en Chicago. */
const NOW = '2026-11-05T16:00:00Z';
const REASON = 'Motivo ficticio de prueba';

describe('T-026b membresías del paciente', () => {
  const clock = new FixedClock(NOW);
  let app: TestApp;
  let recepcion: Client;
  let enfermeria: Client;
  let proveedor: Client;
  let recepcionSur: Client;
  let recepcionMembership = '';
  let counter = 0;
  const plan: Record<string, string> = {};
  const lab: Record<string, string> = {};
  const procedure: Record<string, string> = {};
  const db = () => createTenantDb(app.pool);

  beforeAll(async () => {
    app = await startApp({}, { clock });
    const rec = await createStaff(app, 'pm-rec', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    recepcion = await signedInWithContext(app, rec, NORTE, 0);
    recepcionMembership = await membershipIdOf(app, NORTE, rec.userId);
    enfermeria = await signedInWithContext(app, await createStaff(app, 'pm-enf', [{ org: NORTE, location: 0, role: 'enfermeria' }]), NORTE, 0);
    proveedor = await signedInWithContext(app, await createStaff(app, 'pm-prov', [{ org: NORTE, location: 0, role: 'proveedor' }]), NORTE, 0);
    recepcionSur = await signedInWithContext(app, await createStaff(app, 'pm-rec-sur', [{ org: SUR, location: 0, role: 'recepcion' }]), SUR, 0);
    await db().withTenant(NORTE.id, async (tx) => {
      for (const p of await tx.select({ id: membershipPlans.id, code: membershipPlans.code }).from(membershipPlans)) plan[p.code] = p.id;
      for (const t of await tx.select({ id: labTests.id, code: labTests.code }).from(labTests)) lab[t.code] = t.id;
      for (const p of await tx.select({ id: procedures.id, code: procedures.code }).from(procedures)) procedure[p.code] = p.id;
    });
  });
  afterAll(async () => {
    await app.close();
  });

  const key = () => `pm-${String(Date.now())}-${String((counter += 1))}`;
  const code = (response: { json: () => unknown }) => (response.json() as { code: string }).code;

  async function newPatient(): Promise<string> {
    return db().withTenant(NORTE.id, async (tx) => {
      const id = uuidv7();
      await tx.insert(patients).values({
        id,
        organizationId: NORTE.id,
        registeredLocationId: NORTE.locations[0].id,
        code: await nextCode(tx, NORTE.id, 'patient'),
        firstName: 'Prueba',
        lastName: `Membresía ${String((counter += 1))}`,
        birthDate: '1985-11-05',
      });
      return id;
    });
  }

  const enroll = (patientId: string, body: Record<string, unknown>, idempotencyKey = key(), client = recepcion) =>
    client.post(`/api/patients/${patientId}/membership`, { startDate: '2026-11-05', billingDay: 15, affiliatePatientIds: [], identityVerified: true, ...body }, { 'idempotency-key': idempotencyKey });
  const enrolled = async (patientId: string, body: Record<string, unknown>) => {
    const response = await enroll(patientId, body);
    expect(response.statusCode, response.body).toBe(201);
    return response.json<MembershipSaved>();
  };
  const card = async (patientId: string, client = recepcion) => {
    const response = await client.get(`/api/patients/${patientId}/membership`);
    expect(response.statusCode, response.body).toBe(200);
    return response.json<PatientMembershipCard>();
  };
  /** Lo que hará T-028: pagar la cuota inicial (la membresía se activa en la próxima lectura). */
  const payInitial = (membershipId: string) =>
    db().withTenant(NORTE.id, (tx) =>
      tx
        .update(membershipFees)
        .set({ status: 'paid', paidAt: new Date(clock.now()), version: 2 })
        .where(and(eq(membershipFees.membershipId, membershipId), eq(membershipFees.kind, 'initial'))),
    );
  const active = async (planCode = 'ESENCIAL') => {
    const patientId = await newPatient();
    const saved = await enrolled(patientId, { planId: plan[planCode] });
    await payInitial(saved.id);
    expect((await card(patientId)).membership?.status).toBe('active');
    return { patientId, membershipId: saved.id };
  };

  async function arrive(patientId: string, coverage: Record<string, unknown>, route = 'LAB_ONLY') {
    return recepcion.post('/api/encounters', { source: 'walk_in', patientId, appointmentTypeId: null, route, coverage }, { 'idempotency-key': key() });
  }
  async function visit(patientId: string, route = 'LAB_ONLY') {
    const response = await arrive(patientId, { type: 'membership' }, route);
    expect(response.statusCode, response.body).toBe(201);
    return response.json<ArrivalResult>().encounter;
  }
  const order = async (encounterId: string, body: unknown) => {
    const response = await proveedor.post(`/api/encounters/${encounterId}/orders`, body, { 'idempotency-key': key() });
    expect(response.statusCode, response.body).toBe(201);
    return response.json<OrdersCreated>().orders;
  };
  const labOrder = (encounterId: string, lines: [string, number][]) => order(encounterId, { type: 'lab', lines: lines.map(([c, quantity]) => ({ itemId: lab[c], quantity })) });
  const chargesOf = (encounterId: string) => db().withTenant(NORTE.id, (tx) => tx.select().from(charges).where(eq(charges.encounterId, encounterId)));
  const closeVisit = async (encounterId: string) => {
    const detail = (await recepcion.get(`/api/encounters/${encounterId}`)).json<EncounterDetail>();
    const response = await recepcion.post(`/api/encounters/${encounterId}/close`, { outcome: 'LEFT_EARLY', reason: REASON, expectedVersion: detail.version });
    expect(response.statusCode, response.body).toBe(200);
  };

  it('Recepción inscribe con «Identidad verificada»: «Pendiente de pago» con la cuota inicial pendiente; nada de nombres en la auditoría', async () => {
    clock.set(NOW);
    const options = (await recepcion.get('/api/patient-memberships/enrollment-options')).json<EnrollmentOptions>();
    expect(options).toMatchObject({ today: '2026-11-05', maxStartDate: '2026-12-05' });
    expect(options.plans.find((p) => p.code === 'FAMILIAR')).toMatchObject({ maxMembers: 4, initialFeeCents: 25000, monthlyFeeCents: 9900 });

    const patientId = await newPatient();
    // Sin «Identidad verificada», o con una fecha de inicio fuera de rango, no.
    expect((await enroll(patientId, { planId: plan.ESENCIAL, identityVerified: false })).statusCode).toBe(400);
    expect(code(await enroll(patientId, { planId: plan.ESENCIAL, startDate: '2026-11-04' }))).toBe('invalid_start_date');
    expect(code(await enroll(patientId, { planId: plan.ESENCIAL, startDate: '2026-12-06' }))).toBe('invalid_start_date');
    // Enfermería no inscribe.
    expect((await enroll(patientId, { planId: plan.ESENCIAL }, key(), enfermeria)).statusCode).toBe(403);

    const k = key();
    const first = await enroll(patientId, { planId: plan.ESENCIAL }, k);
    expect(first.statusCode, first.body).toBe(201);
    // El reintento con la misma clave no inscribe otra vez.
    const replay = await enroll(patientId, { planId: plan.ESENCIAL }, k);
    expect(replay.json<MembershipSaved>().id).toBe(first.json<MembershipSaved>().id);
    // Un paciente, en una sola membresía.
    expect(code(await enroll(patientId, { planId: plan.EXTENDIDO }))).toBe('patient_in_membership');

    const view = await card(patientId);
    expect(view.canEnroll).toBe(false);
    expect(view.membership).toMatchObject({
      status: 'pending_payment',
      plan: { code: 'ESENCIAL', name: 'Plan Esencial' },
      location: { code: 'NOR1' },
      enrolledOn: '2026-11-05',
      startDate: '2026-11-05',
      billingDay: 15,
      initialFeeCents: 10000,
      monthlyFeeCents: 3900,
      hasBenefitsToday: false,
      identityVerified: { by: 'Usted' },
      abilities: { cancel: true },
      fees: [{ kind: 'initial', dueDate: '2026-11-05', periodStart: '2026-11-05', periodEnd: '2026-12-14', amountCents: 10000, status: 'pending' }],
      history: [{ action: 'enrolled', toStatus: 'pending_payment', actor: { kind: 'me' } }],
    });
    expect(view.membership?.code).toMatch(/^NOR1-M-\d{6}$/);
    // Enfermería ve la tarjeta, sin acciones.
    const nurse = await card(patientId, enfermeria);
    expect(nurse.membership?.abilities).toEqual({ addMember: false, removeMember: false, cancel: false, payFee: false, voidFeePayment: false });
    expect(nurse.canEnroll).toBe(false);
    // Otra organización no la ve.
    expect((await recepcionSur.get(`/api/patients/${patientId}/membership`)).statusCode).toBe(404);

    const [audit] = await readAudit(`action = 'patient_membership.enrolled' and entity_id = $1`, [first.json<MembershipSaved>().id]);
    expect(audit?.metadata).toMatchObject({ planCode: 'ESENCIAL', startDate: '2026-11-05', initialFeeCents: 10000, identityVerified: true });
    expect(JSON.stringify(audit?.metadata)).not.toContain('Prueba');
  });

  it('«Monto fijo»: un cambio de cuota del plan aplica solo a las inscripciones nuevas; la mensualidad sale con la cuota de la inscripción', async () => {
    clock.set(NOW);
    // Un plan propio de la prueba: el resto de las pruebas no ve su cambio de cuota.
    const planId = uuidv7();
    await db().withTenant(NORTE.id, async (tx) => {
      await tx.insert(membershipPlans).values({ id: planId, organizationId: NORTE.id, code: `FIJO-${randomUUID().slice(0, 6).toUpperCase()}`, nameEs: 'Plan fijo', nameEn: 'Fixed plan', maxMembers: 1 });
      await tx.insert(membershipPlanFees).values({ organizationId: NORTE.id, planId, initialFeeCents: 5000, monthlyFeeCents: 2000, effectiveFrom: '2026-01-01' });
    });
    const before = await newPatient();
    const old = await enrolled(before, { planId });
    await db().withTenant(NORTE.id, (tx) => tx.insert(membershipPlanFees).values({ organizationId: NORTE.id, planId, initialFeeCents: 7000, monthlyFeeCents: 3000, effectiveFrom: '2026-11-05' }));
    const after = await newPatient();
    await enrolled(after, { planId });
    expect((await card(after)).membership).toMatchObject({ initialFeeCents: 7000, monthlyFeeCents: 3000 });
    expect((await card(before)).membership).toMatchObject({ initialFeeCents: 5000, monthlyFeeCents: 2000 });
    // La primera mensualidad (15 dic) se crea el 1 dic, con la cuota de la inscripción.
    await payInitial(old.id);
    clock.set('2026-12-01T16:00:00Z');
    const view = (await card(before)).membership;
    expect(view?.status).toBe('active');
    expect(view?.fees.map((f) => [f.kind, f.dueDate, f.amountCents, f.status])).toEqual([
      ['initial', '2026-11-05', 5000, 'paid'],
      ['monthly', '2026-12-15', 2000, 'pending'],
    ]);
    clock.set(NOW);
  });

  it('plan Familiar: hasta 4 personas registradas; se añaden y se quitan afiliados con la versión; el titular no se quita', async () => {
    clock.set(NOW);
    const [holder, a, b, c, d] = await Promise.all([newPatient(), newPatient(), newPatient(), newPatient(), newPatient()]);
    if (!holder || !a || !b || !c || !d) throw new Error('sin pacientes');
    expect(code(await enroll(holder, { planId: plan.FAMILIAR, affiliatePatientIds: [a, b, c, d] }))).toBe('too_many_members');
    // Un afiliado no puede estar en otra membresía.
    const elsewhere = await newPatient();
    await enrolled(elsewhere, { planId: plan.ESENCIAL });
    expect(code(await enroll(holder, { planId: plan.FAMILIAR, affiliatePatientIds: [elsewhere] }))).toBe('patient_in_membership');

    const saved = await enrolled(holder, { planId: plan.FAMILIAR, affiliatePatientIds: [a, b] });
    const add = await recepcion.post(`/api/patient-memberships/${saved.id}/members`, { patientId: c, expectedVersion: saved.version });
    expect(add.statusCode, add.body).toBe(200);
    const v2 = add.json<MembershipSaved>().version;
    expect(code(await recepcion.post(`/api/patient-memberships/${saved.id}/members`, { patientId: d, expectedVersion: saved.version }))).toBe('version_conflict');
    expect(code(await recepcion.post(`/api/patient-memberships/${saved.id}/members`, { patientId: d, expectedVersion: v2 }))).toBe('too_many_members');
    expect(code(await recepcion.post(`/api/patient-memberships/${saved.id}/members/${holder}/remove`, { expectedVersion: v2 }))).toBe('holder_not_removable');
    const removed = await recepcion.post(`/api/patient-memberships/${saved.id}/members/${c}/remove`, { expectedVersion: v2 });
    expect(removed.statusCode, removed.body).toBe(200);
    // El afiliado ve la misma membresía; el quitado ya puede inscribirse.
    const view = (await card(a)).membership;
    expect(view?.id).toBe(saved.id);
    expect(view?.members.map((m) => m.role)).toEqual(['holder', 'affiliate', 'affiliate']);
    expect(view?.history.map((h) => h.action)).toEqual(['member_removed', 'member_added', 'enrolled']);
    expect((await card(c)).canEnroll).toBe(true);
  });

  it('«Membresía» en la llegada solo con una membresía que da beneficios hoy; el plan sale de la membresía', async () => {
    clock.set(NOW);
    const patientId = await newPatient();
    const saved = await enrolled(patientId, { planId: plan.ESENCIAL });
    const context = (await recepcion.get(`/api/arrivals/patients/${patientId}`)).json<ArrivalContext>();
    expect(context.membership).toBeNull();
    expect(code(await arrive(patientId, { type: 'membership' }))).toBe('membership_not_active');
    await payInitial(saved.id);
    const ready = (await recepcion.get(`/api/arrivals/patients/${patientId}`)).json<ArrivalContext>();
    expect(ready.membership).toMatchObject({ planName: 'Plan Esencial', startDate: '2026-11-05' });
    const v = await visit(patientId);
    const detail = (await recepcion.get(`/api/encounters/${v.id}`)).json<EncounterDetail>();
    expect(detail.coverage).toMatchObject({ type: 'membership', membership: { planName: 'Plan Esencial', startDate: '2026-11-05' } });
  });

  it('beneficios: primero el incluido por unidad («Paquete»: 1 A1c y 1 TSH), después el descuento; cancelar la orden libera el incluido', async () => {
    clock.set(NOW);
    const { patientId } = await active('ESENCIAL');
    const v = await visit(patientId);
    const [made] = await labOrder(v.id, [
      ['LAB-A1C', 2],
      ['LAB-TSH', 1],
      ['LAB-STREP', 1],
    ]);
    const rows = await db().withTenant(NORTE.id, (tx) =>
      tx.select({ charge: charges, labTestId: orderItems.labTestId }).from(charges).innerJoin(orderItems, eq(orderItems.id, charges.orderItemId)).where(eq(charges.encounterId, v.id)),
    );
    const by = (labId: string | undefined) => rows.find((r) => r.labTestId === labId && r.charge.status === 'active')?.charge;
    const a1c = by(lab['LAB-A1C']);
    const tsh = by(lab['LAB-TSH']);
    const strep = by(lab['LAB-STREP']);
    // A1c × 2: 1 incluida y la otra con el 25 % del plan Esencial.
    expect(a1c).toMatchObject({ membershipIncludedQuantity: 1, membershipDiscountBp: 2500, membershipDiscountCents: (a1c?.unitPriceCents ?? 0) + percentOfCents(a1c?.unitPriceCents ?? 0, 2500) });
    // TSH: también del chequeo («Paquete»).
    expect(tsh).toMatchObject({ membershipIncludedQuantity: 1, membershipDiscountCents: tsh?.unitPriceCents });
    // Estreptococo: no está incluido; solo el descuento de laboratorio.
    expect(strep).toMatchObject({ membershipIncludedQuantity: 0, includedBenefitId: null, membershipDiscountCents: percentOfCents(strep?.unitPriceCents ?? 0, 2500) });

    const list = (await proveedor.get(`/api/encounters/${v.id}/orders`)).json<EncounterOrders>();
    const total = rows.filter((r) => r.charge.status === 'active').reduce((sum, r) => sum + r.charge.membershipDiscountCents, 0);
    expect(list.orders.reduce((s, o) => s + o.membershipDiscountCents, 0)).toBe(total);
    expect((await readAudit(`action = 'charge.membership_benefits' and metadata->>'encounterCode' = $1`, [v.code])).length).toBeGreaterThanOrEqual(3);

    // Cancelar la orden anula sus cargos y libera el incluido para la siguiente.
    const lab1 = made ?? { id: '', version: 1 };
    const cancelled = await proveedor.post(`/api/orders/${lab1.id}/cancel`, { reason: REASON, expectedVersion: lab1.version }, { 'idempotency-key': key() });
    expect(cancelled.statusCode, cancelled.body).toBe(200);
    const [again] = await labOrder(v.id, [['LAB-A1C', 1]]);
    const [charge] = await db().withTenant(NORTE.id, (tx) => tx.select().from(charges).where(eq(charges.orderId, again?.id ?? '')));
    expect(charge).toMatchObject({ membershipIncludedQuantity: 1, membershipDiscountCents: charge?.unitPriceCents });

    // Cambiar la cobertura a «Pago directo» quita los beneficios; volver a «Membresía» los recalcula.
    const coverageVersion = () => recepcion.get(`/api/encounters/${v.id}`).then((r) => r.json<EncounterDetail>().coverage?.version ?? 0);
    expect((await recepcion.post(`/api/encounters/${v.id}/coverage`, { coverage: { type: 'self_pay' }, expectedVersion: await coverageVersion() })).statusCode).toBe(200);
    const [plain] = await db().withTenant(NORTE.id, (tx) => tx.select().from(charges).where(eq(charges.orderId, again?.id ?? '')));
    expect(plain).toMatchObject({ patientMembershipId: null, membershipIncludedQuantity: 0, membershipDiscountCents: 0 });
    expect((await recepcion.post(`/api/encounters/${v.id}/coverage`, { coverage: { type: 'membership' }, expectedVersion: await coverageVersion() })).statusCode).toBe(200);
    const [back] = await db().withTenant(NORTE.id, (tx) => tx.select().from(charges).where(eq(charges.orderId, again?.id ?? '')));
    expect(back?.membershipIncludedQuantity).toBe(1);

    // En otra visita, el chequeo ya se usó este año: A1c solo con el descuento.
    await closeVisit(v.id);
    const v2 = await visit(patientId);
    const [next] = await labOrder(v2.id, [['LAB-A1C', 1]]);
    const [later] = await db().withTenant(NORTE.id, (tx) => tx.select().from(charges).where(eq(charges.orderId, next?.id ?? '')));
    expect(later).toMatchObject({ membershipIncludedQuantity: 0, membershipDiscountCents: percentOfCents(later?.unitPriceCents ?? 0, 2500) });
  });

  it('«Cupo compartido»: dos servicios distintos gastan la misma cantidad por año', async () => {
    clock.set(NOW);
    // Plan propio: 2 al año entre la inyección B12 y el lavado ótico, sin descuentos.
    const planId = uuidv7();
    await db().withTenant(NORTE.id, async (tx) => {
      await tx.insert(membershipPlans).values({ id: planId, organizationId: NORTE.id, code: `CUPO-${randomUUID().slice(0, 6).toUpperCase()}`, nameEs: 'Plan cupo', nameEn: 'Quota plan', maxMembers: 1 });
      await tx.insert(membershipPlanFees).values({ organizationId: NORTE.id, planId, initialFeeCents: 100, monthlyFeeCents: 100, effectiveFrom: '2026-01-01' });
      const [benefit] = await tx
        .insert(membershipBenefits)
        .values({ organizationId: NORTE.id, planId, type: 'included', nameEs: 'Procedimientos', nameEn: 'Procedures', quantityPerYear: 2, quotaMode: 'shared' })
        .returning({ id: membershipBenefits.id });
      await tx.insert(membershipBenefitItems).values([
        { organizationId: NORTE.id, benefitId: benefit?.id ?? '', procedureId: procedure['INJ-B12'] },
        { organizationId: NORTE.id, benefitId: benefit?.id ?? '', procedureId: procedure['PROC-LAVOT'] },
      ]);
    });
    const patientId = await newPatient();
    const saved = await enrolled(patientId, { planId });
    await payInitial(saved.id);
    const v = await visit(patientId, 'PROCEDURE_ONLY');
    const [b12] = await order(v.id, { type: 'injection', lines: [{ itemId: procedure['INJ-B12'], quantity: 1 }] });
    const [lavado] = await order(v.id, { type: 'procedure', lines: [{ itemId: procedure['PROC-LAVOT'], quantity: 2 }] });
    const rows = await db().withTenant(NORTE.id, (tx) => tx.select().from(charges).where(inArray(charges.orderId, [b12?.id ?? '', lavado?.id ?? ''])));
    const of = (id: string | undefined) => rows.find((r) => r.orderId === id);
    expect(of(b12?.id)).toMatchObject({ membershipIncludedQuantity: 1 });
    // Queda 1 del cupo de 2: un lavado sin costo y el otro a precio completo (el plan no tiene descuentos).
    expect(of(lavado?.id)).toMatchObject({ membershipIncludedQuantity: 1, discountBenefitId: null, membershipDiscountCents: of(lavado?.id)?.unitPriceCents });
  });

  it('año de beneficios: el último día aún cuenta lo usado; el primer día del año siguiente vuelve el cupo', async () => {
    // Una membresía que empezó el 6 nov 2025, con todas sus cuotas pagadas: el 5 nov 2026 es el último día de su primer año.
    clock.set(NOW);
    const patientId = await newPatient();
    const membershipId = uuidv7();
    await db().withTenant(NORTE.id, async (tx) => {
      const at = new Date('2025-11-06T16:00:00Z');
      await tx.insert(patientMemberships).values({
        id: membershipId,
        organizationId: NORTE.id,
        code: `NOR1-M-9${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`,
        planId: plan.ESENCIAL ?? '',
        holderPatientId: patientId,
        locationId: NORTE.locations[0].id,
        status: 'active',
        enrolledOn: '2025-11-06',
        startDate: '2025-11-06',
        billingDay: 20,
        initialFeeCents: 10000,
        monthlyFeeCents: 3900,
        enrolledByMembershipId: recepcionMembership,
        identityVerifiedByMembershipId: recepcionMembership,
        identityVerifiedAt: at,
        createdAt: at,
        updatedAt: at,
      });
      await tx.insert(patientMembershipMembers).values({ organizationId: NORTE.id, membershipId, patientId, role: 'holder', addedByMembershipId: recepcionMembership, addedAt: at });
      await tx.insert(membershipFees).values({
        organizationId: NORTE.id,
        membershipId,
        kind: 'initial',
        dueDate: '2025-11-06',
        periodStart: '2025-11-06',
        periodEnd: '2025-12-19',
        amountCents: 10000,
        status: 'paid',
        paidAt: at,
        createdAt: at,
      });
      const monthly = monthlyFeesDue({ startDate: '2025-11-06', billingDay: 20, benefitsEndDate: null, existingDueDates: [] }, '2026-11-05');
      await tx.insert(membershipFees).values(monthly.map((f) => ({ organizationId: NORTE.id, membershipId, kind: 'monthly', ...f, amountCents: 3900, status: 'paid', paidAt: at, createdAt: at })));
    });
    const view = (await card(patientId)).membership;
    expect(view).toMatchObject({ status: 'active', benefitYear: { start: '2025-11-06', end: '2026-11-05' } });

    // Último día del año: la primera A1c sale incluida y la segunda, con descuento.
    const v1 = await visit(patientId);
    await labOrder(v1.id, [['LAB-A1C', 1]]);
    await labOrder(v1.id, [['LAB-A1C', 1]]);
    const first = (await chargesOf(v1.id)).sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime() || x.id.localeCompare(y.id));
    expect(first.map((c) => [c.membershipIncludedQuantity, c.benefitYearStart])).toEqual([
      [1, '2025-11-06'],
      [0, '2025-11-06'],
    ]);
    await closeVisit(v1.id);

    // Primer día del año siguiente: el cupo vuelve.
    clock.set('2026-11-06T16:00:00Z');
    expect((await card(patientId)).membership?.benefitYear).toEqual({ start: '2026-11-06', end: '2027-11-05' });
    const v2 = await visit(patientId);
    await labOrder(v2.id, [['LAB-A1C', 1]]);
    const [renewed] = await chargesOf(v2.id);
    expect(renewed).toMatchObject({ membershipIncludedQuantity: 1, benefitYearStart: '2026-11-06' });
    await closeVisit(v2.id);
    clock.set(NOW);
  });

  it('aviso de cancelación: con 15 días o más, hasta el día antes del cobro; con menos, se debe esa mensualidad y dura un mes más', async () => {
    clock.set(NOW);
    // Inicio 5 nov, día 15: el próximo cobro es el 15 dic (40 días).
    const early = await active('EXTENDIDO');
    const v1 = (await card(early.patientId)).membership?.version ?? 0;
    const notice = await recepcion.post(`/api/patient-memberships/${early.membershipId}/cancel`, { expectedVersion: v1 });
    expect(notice.statusCode, notice.body).toBe(200);
    expect(notice.json<MembershipCancelResult>()).toMatchObject({ status: 'active', benefitsEndDate: '2026-12-14', owedDueDate: null });
    const after = (await card(early.patientId)).membership;
    expect(after).toMatchObject({ cancelNoticeOn: '2026-11-05', benefitsEndDate: '2026-12-14', abilities: { cancel: false } });
    expect(after?.history[0]).toMatchObject({ action: 'cancel_notice', actor: { kind: 'me' } });
    expect(code(await recepcion.post(`/api/patient-memberships/${early.membershipId}/cancel`, { expectedVersion: after?.version }))).toBe('cancel_notice_exists');
    // El 14 dic aún da beneficios; el 15 dic se cancela y el paciente puede volver a inscribirse.
    clock.set('2026-12-15T05:59:00Z');
    expect((await card(early.patientId)).membership?.hasBenefitsToday).toBe(true);
    clock.set('2026-12-15T06:00:00Z');
    const ended = await card(early.patientId);
    expect(ended.membership).toMatchObject({ status: 'cancelled', cancellation: 'notice', cancelledOn: '2026-12-15' });
    expect(ended.canEnroll).toBe(true);

    // Con menos de 15 días (2 dic): la del 15 dic se debe y los beneficios duran hasta el 14 ene.
    clock.set(NOW);
    const late = await active('EXTENDIDO');
    clock.set('2026-12-02T16:00:00Z');
    const v2 = (await card(late.patientId)).membership?.version ?? 0;
    const short = await recepcion.post(`/api/patient-memberships/${late.membershipId}/cancel`, { expectedVersion: v2 });
    expect(short.json<MembershipCancelResult>()).toMatchObject({ benefitsEndDate: '2027-01-14', owedDueDate: '2026-12-15' });
    expect((await card(late.patientId)).membership?.fees.map((f) => [f.kind, f.dueDate, f.status])).toEqual([
      ['initial', '2026-11-05', 'paid'],
      ['monthly', '2026-12-15', 'pending'],
    ]);

    // «Pendiente de pago»: se cancela en el momento y se anula la cuota inicial.
    clock.set(NOW);
    const pendingPatient = await newPatient();
    const pending = await enrolled(pendingPatient, { planId: plan.ESENCIAL });
    const cancelled = await recepcion.post(`/api/patient-memberships/${pending.id}/cancel`, { expectedVersion: pending.version });
    expect(cancelled.json<MembershipCancelResult>()).toMatchObject({ status: 'cancelled' });
    const gone = await card(pendingPatient);
    expect(gone.membership?.fees.map((f) => f.status)).toEqual(['voided']);
    expect(gone.canEnroll).toBe(true);
  });
});
