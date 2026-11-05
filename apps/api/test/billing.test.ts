import { randomUUID } from 'node:crypto';
import { charges, consultations, createTenantDb, membershipFees, membershipPlans, nextCode, nextOrderCode, orders, patients, prices } from '@clinic/db';
import type { ArrivalResult, BillingStatement, ChargeAdded, ChargeOptions, CheckoutQueue, EncounterDetail, MembershipSaved, OrdersCreated } from '@clinic/shared';
import { and, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixedClock } from '../src/clock.ts';
import { createStaff, membershipIdOf, NORTE, readAudit, signedInWithContext, SUR, type Client, type TestApp, startApp } from './support.ts';

// T-027: Caja, cola y estado de cuenta (S-CAJ-01 a 08, S-CAJ-16), con el reloj
// fijado (America/Chicago) y casos calculados a mano (ADR 0034, 0035 y 0041).
//  - Pago directo, seguro con copago (también mayor que el total), con
//    coaseguro (redondeo al centavo, la mitad hacia arriba) y con deducible.
//  - Membresía: consulta inicial gratis, 3 de seguimiento con dos consultas
//    distintas en el mismo cupo y la 4.ª con el descuento del plan; al abrir
//    el estado de cuenta se recalculan los beneficios.
//  - «Agregar cargo» lleva el precio vigente de la sede (11:59 p. m. y
//    12:01 a. m.), no acepta precio ni descuento de la web, con
//    Idempotency-Key y la versión del estado de cuenta.
//  - «Iniciar caja» con órdenes abiertas se rechaza; completar con saldo
//    pide confirmación.
//  - Enfermería y Proveedor solo ven totales; la cola y los cargos son de Recepción.

/** 5 nov 2026, 10:00 a. m. en Chicago (NOR1). */
const NOW = '2026-11-05T16:00:00Z';
const BEFORE_MIDNIGHT = '2026-11-06T05:59:00Z';
const AFTER_MIDNIGHT = '2026-11-06T06:01:00Z';
const REASON = 'Motivo ficticio de prueba';

describe('T-027 Caja: cola y estado de cuenta', () => {
  const clock = new FixedClock(NOW);
  let app: TestApp;
  let recepcion: Client;
  let enfermeria: Client;
  let proveedor: Client;
  let recepcionSur: Client;
  let adminSinRol: Client;
  let recepcionMembership = '';
  let counter = 0;
  const consult: Record<string, string> = {};
  const plan: Record<string, string> = {};
  let datedConsult = '';
  let unpricedConsult = '';
  let inactiveConsult = '';
  const db = () => createTenantDb(app.pool);

  beforeAll(async () => {
    app = await startApp({}, { clock });
    const rec = await createStaff(app, 'caja-rec', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    recepcion = await signedInWithContext(app, rec, NORTE, 0);
    recepcionMembership = await membershipIdOf(app, NORTE, rec.userId);
    enfermeria = await signedInWithContext(app, await createStaff(app, 'caja-enf', [{ org: NORTE, location: 0, role: 'enfermeria' }]), NORTE, 0);
    proveedor = await signedInWithContext(app, await createStaff(app, 'caja-prov', [{ org: NORTE, location: 0, role: 'proveedor' }]), NORTE, 0);
    recepcionSur = await signedInWithContext(app, await createStaff(app, 'caja-rec-sur', [{ org: SUR, location: 0, role: 'recepcion' }]), SUR, 0);
    adminSinRol = await signedInWithContext(app, await createStaff(app, 'caja-admin', [{ org: NORTE, location: null, role: 'administrador' }]), NORTE, 0, { mfa: true });
    const suffix = randomUUID().slice(0, 6).toUpperCase();
    await db().withTenant(NORTE.id, async (tx) => {
      for (const c of await tx.select({ id: consultations.id, code: consultations.code }).from(consultations)) consult[c.code] = c.id;
      for (const p of await tx.select({ id: membershipPlans.id, code: membershipPlans.code }).from(membershipPlans)) plan[p.code] = p.id;
      // Consultas propias de la prueba: una con precios fechados (general 10,00;
      // desde el 6 de noviembre, 13,00 en NOR1), una sin precio y una inactiva.
      datedConsult = uuidv7();
      unpricedConsult = uuidv7();
      inactiveConsult = uuidv7();
      await tx.insert(consultations).values([
        { id: datedConsult, organizationId: NORTE.id, code: `CONS-T027-${suffix}`, name: 'Consulta ficticia T-027' },
        { id: unpricedConsult, organizationId: NORTE.id, code: `CONS-NOPRICE-${suffix}`, name: 'Consulta sin precio' },
        { id: inactiveConsult, organizationId: NORTE.id, code: `CONS-OFF-${suffix}`, name: 'Consulta inactiva', active: false },
      ]);
      await tx.insert(prices).values([
        { organizationId: NORTE.id, locationId: null, consultationId: datedConsult, amountCents: 1000, effectiveFrom: '2026-01-01' },
        { organizationId: NORTE.id, locationId: NORTE.locations[0].id, consultationId: datedConsult, amountCents: 1300, effectiveFrom: '2026-11-06' },
        { organizationId: NORTE.id, locationId: null, consultationId: inactiveConsult, amountCents: 1000, effectiveFrom: '2026-01-01' },
      ]);
    });
  });
  afterAll(async () => {
    await app.close();
  });

  const key = () => `caja-${String(Date.now())}-${String((counter += 1))}`;
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
        lastName: `Caja ${String((counter += 1))}`,
        birthDate: '1980-11-05',
      });
      return id;
    });
  }

  const SELF_PAY = { type: 'self_pay' };
  const insurance = (term: string, value: string) => ({ type: 'insurance', insurerName: 'Aseguradora ficticia', memberId: null, term, value });

  /** Una visita sin cita en NOR1, ruta «Solo laboratorio» (acepta órdenes en «Registrado»). */
  async function arrive(coverage: Record<string, unknown> = SELF_PAY, patientId?: string): Promise<string> {
    const response = await recepcion.post(
      '/api/encounters',
      { source: 'walk_in', patientId: patientId ?? (await newPatient()), appointmentTypeId: null, route: 'LAB_ONLY', coverage },
      { 'idempotency-key': key() },
    );
    expect(response.statusCode, response.body).toBe(201);
    return response.json<ArrivalResult>().encounter.id;
  }
  const statement = async (encounterId: string, client = recepcion) => {
    const response = await client.get(`/api/encounters/${encounterId}/statement`);
    expect(response.statusCode, response.body).toBe(200);
    return response.json<BillingStatement>();
  };
  const addCharge = async (encounterId: string, item: { kind: string; id: string }, quantity = 1, idempotencyKey = key()) =>
    recepcion.post(`/api/encounters/${encounterId}/charges`, { item, quantity, expectedVersion: (await statement(encounterId)).statementVersion }, { 'idempotency-key': idempotencyKey });
  const added = async (encounterId: string, item: { kind: string; id: string }, quantity = 1) => {
    const response = await addCharge(encounterId, item, quantity);
    expect(response.statusCode, response.body).toBe(201);
    return response.json<ChargeAdded>();
  };
  const consultation = (c: string) => ({ kind: 'consultation', id: consult[c] ?? '' });
  /** Inyección de vitamina B12 ($20.00 en NOR1), ordenada por el Proveedor. */
  const orderB12 = async (encounterId: string, quantity = 1) => {
    const options = (await recepcion.get(`/api/encounters/${encounterId}/charge-options`)).json<ChargeOptions>();
    const b12 = options.items.find((i) => i.code === 'INJ-B12');
    const response = await proveedor.post(`/api/encounters/${encounterId}/orders`, { type: 'injection', lines: [{ itemId: b12?.id, quantity }] }, { 'idempotency-key': key() });
    expect(response.statusCode, response.body).toBe(201);
    return response.json<OrdersCreated>().orders;
  };
  const detail = async (encounterId: string) => (await recepcion.get(`/api/encounters/${encounterId}`)).json<EncounterDetail>();
  const transition = async (client: Client, encounterId: string, action: string, extra: Record<string, unknown> = {}) =>
    client.post(`/api/encounters/${encounterId}/transition`, { action, expectedVersion: (await detail(encounterId)).version, ...extra });
  const moved = async (client: Client, encounterId: string, action: string, extra: Record<string, unknown> = {}) => {
    const response = await transition(client, encounterId, action, extra);
    expect(response.statusCode, response.body).toBe(200);
  };
  /** «Registrado» → «Procedimiento pendiente» → «Listo para caja». */
  const toReady = async (encounterId: string) => {
    await moved(recepcion, encounterId, 'send_to_procedure');
    await moved(enfermeria, encounterId, 'ready_for_checkout');
  };

  it('pago directo: subtotal, sin descuento ni seguro, con cargos de orden y de Caja; la regla del manual', async () => {
    clock.set(NOW);
    const v = await arrive();
    await orderB12(v, 2);
    await added(v, consultation('CONS-INICIAL'));
    const s = await statement(v);
    expect(s.totals).toEqual({ subtotalCents: 10000, discountCents: 0, insuranceCents: 0, totalDueCents: 10000, paidCents: 0, balanceCents: 10000, creditCents: 0, status: 'open', rule: 'self_pay' });
    expect(s.view).toBe('full');
    expect(s.editable).toBe(true);
    expect(s.coverage).toEqual({ type: 'self_pay', term: null });
    expect(s.lines?.map((l) => [l.source, l.kind, l.itemCode, l.quantity, l.unitPriceCents, l.amountCents, l.discountCents, l.lineTotalCents])).toEqual([
      ['order', 'procedure', 'INJ-B12', 2, 2000, 4000, 0, 4000],
      ['cashier', 'consultation', 'CONS-INICIAL', 1, 6000, 6000, 0, 6000],
    ]);
    expect(s.lines?.[0]?.orderCode).toMatch(/^NOR1-O-\d{6}$/);
    expect(s.lines?.[1]?.orderCode).toBeNull();
  });

  it('seguro con copago: $20.00 el paciente, el resto «A cargo del seguro»; un copago mayor que el total deja el total', async () => {
    const v = await arrive(insurance('copay', '20.00'));
    await orderB12(v, 2);
    await added(v, consultation('CONS-INICIAL'));
    expect((await statement(v)).totals).toMatchObject({ subtotalCents: 10000, discountCents: 0, insuranceCents: 8000, totalDueCents: 2000, balanceCents: 2000, rule: 'insurance_copay' });
    const big = await arrive(insurance('copay', '500.00'));
    await added(big, consultation('CONS-INICIAL'));
    expect((await statement(big)).totals).toMatchObject({ subtotalCents: 6000, insuranceCents: 0, totalDueCents: 6000 });
  });

  it('seguro con coaseguro: 12.5 % redondeado al centavo, la mitad hacia arriba; el seguro cubre el resto exacto', async () => {
    const v = await arrive(insurance('coinsurance', '12.5'));
    // Consulta de seguimiento $45.00: 12.5 % = $5.625 → $5.63; el seguro, $39.37.
    await added(v, consultation('CONS-SEGUIMIENTO'));
    expect((await statement(v)).totals).toMatchObject({ subtotalCents: 4500, totalDueCents: 563, insuranceCents: 3937, rule: 'insurance_coinsurance' });
    // Más la consulta inicial $60.00: 12.5 % de $105.00 = $13.125 → $13.13.
    await added(v, consultation('CONS-INICIAL'));
    expect((await statement(v)).totals).toMatchObject({ subtotalCents: 10500, totalDueCents: 1313, insuranceCents: 9187 });
  });

  it('seguro con deducible: el paciente debe el monto completo', async () => {
    const v = await arrive(insurance('deductible', '1000.00'));
    await added(v, consultation('CONS-INICIAL'));
    expect((await statement(v)).totals).toMatchObject({ totalDueCents: 6000, insuranceCents: 0, rule: 'insurance_deductible' });
  });

  it('cambiar la cobertura recalcula el estado de cuenta y sube su versión', async () => {
    const v = await arrive();
    await added(v, consultation('CONS-INICIAL'));
    const before = await statement(v);
    const coverageVersion = (await detail(v)).coverage?.version ?? 0;
    const response = await recepcion.post(`/api/encounters/${v}/coverage`, { coverage: insurance('copay', '15.00'), expectedVersion: coverageVersion });
    expect(response.statusCode, response.body).toBe(200);
    const after = await statement(v);
    expect(after.statementVersion).toBeGreaterThan(before.statementVersion);
    expect(after.totals).toMatchObject({ totalDueCents: 1500, insuranceCents: 4500 });
  });

  it('«Agregar cargo» lleva el precio vigente de la sede el día de la sede (11:59 p. m. y 12:01 a. m.)', async () => {
    const priced = async (instant: string) => {
      clock.set(instant);
      const v = await arrive();
      const options = (await recepcion.get(`/api/encounters/${v}/charge-options`)).json<ChargeOptions>();
      const option = options.items.find((i) => i.id === datedConsult);
      await added(v, { kind: 'consultation', id: datedConsult }, 2);
      const [charge] = await db().withTenant(NORTE.id, (tx) => tx.select().from(charges).where(eq(charges.encounterId, v)));
      return { date: options.date, option, charge };
    };
    const before = await priced(BEFORE_MIDNIGHT);
    expect(before.date).toBe('2026-11-05');
    expect(before.option).toMatchObject({ kind: 'consultation', group: 'consultation', unitPriceCents: 1000 });
    expect(before.charge).toMatchObject({ source: 'cashier', orderId: null, unitPriceCents: 1000, quantity: 2, amountCents: 2000, priceDate: '2026-11-05', status: 'active' });
    const after = await priced(AFTER_MIDNIGHT);
    expect(after.date).toBe('2026-11-06');
    expect(after.charge).toMatchObject({ unitPriceCents: 1300, amountCents: 2600, priceDate: '2026-11-06' });
    clock.set(NOW);
  });

  it('«Agregar cargo» no acepta precio, descuento ni texto libre; sin precio o inactivo, no; cantidad 1 a 1000', async () => {
    const v = await arrive();
    const version = (await statement(v)).statementVersion;
    const post = (body: Record<string, unknown>) => recepcion.post(`/api/encounters/${v}/charges`, { item: consultation('CONS-INICIAL'), quantity: 1, expectedVersion: version, ...body }, { 'idempotency-key': key() });
    for (const extra of [{ unitPriceCents: 1 }, { discountCents: 6000 }, { amountCents: 0 }, { description: 'CONSULTA_LIBRE' }, { item: { kind: 'manual', id: uuidv7() } }]) {
      const response = await post(extra);
      expect([response.statusCode, code(response)], JSON.stringify(extra)).toEqual([400, 'invalid_request']);
    }
    for (const quantity of [0, 1001]) expect((await post({ quantity })).statusCode).toBe(400);
    expect(code(await post({ item: { kind: 'consultation', id: unpricedConsult } }))).toBe('price_unavailable');
    expect(code(await post({ item: { kind: 'consultation', id: inactiveConsult } }))).toBe('item_inactive');
    expect(code(await post({ item: { kind: 'consultation', id: uuidv7() } }))).toBe('item_not_found');
    // Un procedimiento del catálogo con el «kind» de otro: no existe como consulta.
    const options = (await recepcion.get(`/api/encounters/${v}/charge-options`)).json<ChargeOptions>();
    const b12 = options.items.find((i) => i.code === 'INJ-B12');
    expect(b12).toMatchObject({ kind: 'procedure', group: 'injection', unitPriceCents: 2000 });
    expect(code(await post({ item: { kind: 'consultation', id: b12?.id } }))).toBe('item_not_found');
    expect((await statement(v)).lines).toEqual([]);
    expect(await db().withTenant(NORTE.id, (tx) => tx.select().from(charges).where(eq(charges.encounterId, v)))).toEqual([]);
  });

  it('«Agregar cargo» con Idempotency-Key: la misma clave no duplica; otro contenido, 409; una versión vieja, 409', async () => {
    const v = await arrive();
    const version = (await statement(v)).statementVersion;
    const body = { item: consultation('CONS-INICIAL'), quantity: 1, expectedVersion: version };
    const idempotencyKey = key();
    const first = await recepcion.post(`/api/encounters/${v}/charges`, body, { 'idempotency-key': idempotencyKey });
    const again = await recepcion.post(`/api/encounters/${v}/charges`, body, { 'idempotency-key': idempotencyKey });
    expect(first.statusCode, first.body).toBe(201);
    expect(again.json<ChargeAdded>()).toEqual(first.json<ChargeAdded>());
    expect(first.json<ChargeAdded>().statementVersion).toBeGreaterThan(version);
    const reused = await recepcion.post(`/api/encounters/${v}/charges`, { ...body, quantity: 2 }, { 'idempotency-key': idempotencyKey });
    expect([reused.statusCode, code(reused)]).toEqual([409, 'idempotency_key_reused']);
    // Sin clave, no.
    expect((await recepcion.post(`/api/encounters/${v}/charges`, body)).statusCode).toBe(400);
    // La versión que se leyó ya no es la actual.
    const stale = await recepcion.post(`/api/encounters/${v}/charges`, body, { 'idempotency-key': key() });
    expect([stale.statusCode, code(stale)]).toEqual([409, 'version_conflict']);
    expect(await db().withTenant(NORTE.id, (tx) => tx.select().from(charges).where(eq(charges.encounterId, v)))).toHaveLength(1);
    // Auditado, sin nombres.
    const [audit] = await readAudit(`action = 'charge.created' and metadata->>'source' = 'cashier' and entity_id = $1`, [first.json<ChargeAdded>().chargeId]);
    expect(audit?.metadata).toMatchObject({ itemCode: 'CONS-INICIAL', amountCents: 6000, unitPriceCents: 6000, quantity: 1, priceDate: '2026-11-05' });
    expect(JSON.stringify(audit)).not.toContain('Prueba');
  });

  it('Enfermería y Proveedor ven solo los totales; no agregan cargos ni ven la cola; un Administrador sin rol clínico, nada', async () => {
    const v = await arrive();
    await added(v, consultation('CONS-INICIAL'));
    for (const client of [enfermeria, proveedor]) {
      const s = await statement(v, client);
      expect(s).toMatchObject({ view: 'totals', lines: null, voided: null, patient: null, editable: false });
      expect(s.totals.totalDueCents).toBe(6000);
      expect(JSON.stringify(s)).not.toContain('CONS-INICIAL');
      const post = await client.post(`/api/encounters/${v}/charges`, { item: consultation('CONS-INICIAL'), quantity: 1, expectedVersion: s.statementVersion }, { 'idempotency-key': key() });
      expect(post.statusCode).toBe(403);
      expect((await client.get('/api/checkout/queue')).statusCode).toBe(403);
      expect((await client.get(`/api/encounters/${v}/charge-options`)).statusCode).toBe(403);
    }
    expect((await adminSinRol.get(`/api/encounters/${v}/statement`)).statusCode).toBe(403);
    expect((await adminSinRol.get('/api/checkout/queue')).statusCode).toBe(403);
    // Otra organización: no existe.
    expect((await recepcionSur.get(`/api/encounters/${v}/statement`)).statusCode).toBe(404);
    // Lecturas auditadas con su vista.
    const views = await readAudit(`action = 'billing.statement_view' and entity_id = $1`, [v]);
    expect(new Set(views.map((a) => (a.metadata as { view: string }).view))).toEqual(new Set(['full', 'totals']));
    expect(views.filter((a) => (a.metadata as { view: string }).view === 'totals')).toHaveLength(2);
  });

  it('«Iniciar caja» con órdenes abiertas se rechaza; sin ellas pasa a «En caja» y aparece primero en la cola', async () => {
    const v = await arrive();
    await toReady(v);
    // Una orden abierta (como si se hubiera reabierto el trabajo clínico).
    await db().withTenant(NORTE.id, async (tx) =>
      tx.insert(orders).values({
        organizationId: NORTE.id,
        locationId: NORTE.locations[0].id,
        encounterId: v,
        code: await nextOrderCode(tx, NORTE.id, { id: NORTE.locations[0].id, code: NORTE.locations[0].code }),
        type: 'procedure',
        orderedByMembershipId: recepcionMembership,
        orderedAt: new Date(NOW),
      }),
    );
    const blocked = await transition(recepcion, v, 'start_checkout');
    expect([blocked.statusCode, code(blocked)]).toEqual([409, 'open_orders']);
    expect((await statement(v)).encounter.hasOpenOrders).toBe(true);
    await db().withTenant(NORTE.id, (tx) =>
      tx.update(orders).set({ status: 'CANCELLED', cancelReasonEnc: 'cifrado-ficticio', cancelledByMembershipId: recepcionMembership, cancelledAt: new Date(NOW), version: 2 }).where(eq(orders.encounterId, v)),
    );
    const ready = await arrive();
    await toReady(ready);
    await moved(recepcion, v, 'start_checkout');
    const queue = (await recepcion.get('/api/checkout/queue')).json<CheckoutQueue>();
    const mine = queue.rows.filter((r) => [v, ready].includes(r.encounterId));
    expect(mine.map((r) => [r.encounterId, r.status])).toEqual([
      [v, 'CHECKOUT'],
      [ready, 'READY_FOR_CHECKOUT'],
    ]);
    expect(queue.rows.findIndex((r) => r.encounterId === v)).toBeLessThan(queue.rows.findIndex((r) => r.encounterId === ready));
    expect(mine[1]).toMatchObject({ coverageType: 'self_pay', balanceCents: 0, provider: null });
    // Búsqueda por código de la visita.
    const searched = (await recepcion.get(`/api/checkout/queue?q=${encodeURIComponent((await detail(ready)).code.toLowerCase())}`)).json<CheckoutQueue>();
    expect(searched.rows.map((r) => r.encounterId)).toEqual([ready]);
    // Otra sede o la otra organización no la ven.
    const sur = (await recepcionSur.get('/api/checkout/queue')).json<CheckoutQueue>();
    expect(sur.rows.map((r) => r.encounterId)).not.toContain(v);
  });

  it('completar con saldo pide confirmación (409 balance_pending con el saldo); confirmado, se completa y queda en solo lectura', async () => {
    const v = await arrive();
    await added(v, consultation('CONS-INICIAL'));
    await toReady(v);
    await moved(recepcion, v, 'start_checkout');
    const pending = await transition(recepcion, v, 'complete');
    expect(pending.statusCode).toBe(409);
    expect(pending.json()).toEqual({ code: 'balance_pending', balanceCents: 6000 });
    expect((await detail(v)).status).toBe('CHECKOUT');
    await moved(recepcion, v, 'complete', { acknowledgeBalance: true });
    const s = await statement(v);
    expect(s).toMatchObject({ editable: false, encounter: { status: 'COMPLETED' }, totals: { balanceCents: 6000 } });
    const late = await addCharge(v, consultation('CONS-INICIAL'));
    expect([late.statusCode, code(late)]).toEqual([409, 'encounter_closed']);
    // Sin saldo no hace falta confirmar.
    const free = await arrive();
    await toReady(free);
    await moved(recepcion, free, 'start_checkout');
    await moved(recepcion, free, 'complete');
  });

  it('una visita cerrada como «Se retiró» muestra su estado de cuenta en solo lectura, con su saldo', async () => {
    const v = await arrive();
    await added(v, consultation('CONS-INICIAL'));
    const response = await recepcion.post(`/api/encounters/${v}/close`, { outcome: 'LEFT_EARLY', reason: REASON, expectedVersion: (await detail(v)).version });
    expect(response.statusCode, response.body).toBe(200);
    expect(await statement(v)).toMatchObject({ editable: false, totals: { totalDueCents: 6000, balanceCents: 6000, status: 'open' } });
  });

  describe('membresía (plan Esencial: consultas al 35 %)', () => {
    let patientId = '';

    beforeAll(async () => {
      clock.set(NOW);
      patientId = await newPatient();
      const response = await recepcion.post(
        `/api/patients/${patientId}/membership`,
        { planId: plan.ESENCIAL, startDate: '2026-11-05', billingDay: 15, affiliatePatientIds: [], identityVerified: true },
        { 'idempotency-key': key() },
      );
      expect(response.statusCode, response.body).toBe(201);
      // Lo que hará T-028: pagar la cuota inicial.
      await db().withTenant(NORTE.id, (tx) =>
        tx
          .update(membershipFees)
          .set({ status: 'paid', paidAt: new Date(NOW), version: 2 })
          .where(and(eq(membershipFees.membershipId, response.json<MembershipSaved>().id), eq(membershipFees.kind, 'initial'))),
      );
    });

    /** Una visita con «Membresía», su consulta agregada en Caja y su estado de cuenta; después se completa. */
    const visitWith = async (consultCode: string, instant: string) => {
      clock.set(instant);
      const v = await arrive({ type: 'membership' }, patientId);
      await added(v, consultation(consultCode));
      const s = await statement(v);
      await toReady(v);
      await moved(recepcion, v, 'start_checkout');
      await moved(recepcion, v, 'complete', { acknowledgeBalance: true });
      return s;
    };

    it('consulta inicial gratis, 3 de seguimiento (dos consultas distintas en el mismo cupo) y la 4.ª con el 35 %', async () => {
      // 1. Consulta inicial $60.00: sin costo.
      const inicial = await visitWith('CONS-INICIAL', '2026-11-05T17:00:00Z');
      expect(inicial.totals).toMatchObject({ subtotalCents: 6000, discountCents: 6000, totalDueCents: 0, status: 'paid', rule: 'membership_applied' });
      expect(inicial.lines?.[0]).toMatchObject({ source: 'cashier', discountCents: 6000, includedQuantity: 1, lineTotalCents: 0 });
      // 2-4. Seguimiento $45.00, enfermedad $50.00 y seguimiento $45.00: sin costo (cupo compartido de 3).
      for (const [c, cents, instant] of [
        ['CONS-SEGUIMIENTO', 4500, '2026-11-20T17:00:00Z'],
        ['CONS-ENFERMEDAD', 5000, '2026-11-25T17:00:00Z'],
        ['CONS-SEGUIMIENTO', 4500, '2026-11-30T17:00:00Z'],
      ] as const) {
        const s = await visitWith(c, instant);
        expect(s.totals, c).toMatchObject({ subtotalCents: cents, discountCents: cents, totalDueCents: 0 });
        expect(s.lines?.[0]?.includedQuantity).toBe(1);
      }
      // 5. La 4.ª de seguimiento, $45.00: 35 % = $15.75; paga $29.25.
      const cuarta = await visitWith('CONS-SEGUIMIENTO', '2026-12-02T17:00:00Z');
      expect(cuarta.totals).toMatchObject({ subtotalCents: 4500, discountCents: 1575, insuranceCents: 0, totalDueCents: 2925, balanceCents: 2925, rule: 'membership_applied' });
      expect(cuarta.lines?.[0]).toMatchObject({ includedQuantity: 0, discountCents: 1575, lineTotalCents: 2925 });
      clock.set(NOW);
    });

    it('al abrir el estado de cuenta se recalculan los beneficios: con la membresía suspendida, el monto completo', async () => {
      clock.set('2026-12-10T17:00:00Z');
      const v = await arrive({ type: 'membership' }, patientId);
      // Las 3 de seguimiento ya se usaron: la consulta lleva el 35 %.
      await added(v, consultation('CONS-ENFERMEDAD'));
      const before = await statement(v);
      expect(before.totals).toMatchObject({ discountCents: 1750, totalDueCents: 3250 });
      // La mensualidad del 15 de diciembre vence sin pagarse: suspendida desde las 12:00 a. m. del 16.
      clock.set('2026-12-16T06:01:00Z');
      const after = await statement(v);
      expect(after.totals).toMatchObject({ discountCents: 0, totalDueCents: 5000, rule: 'membership_none' });
      expect(after.statementVersion).toBeGreaterThan(before.statementVersion);
      const [audit] = await readAudit(`action = 'charge.membership_benefits' and metadata->>'encounterCode' = $1 and (metadata->>'discountCents')::int = 0`, [after.encounter.code]);
      expect(audit).toBeDefined();
      clock.set(NOW);
    });
  });
});
