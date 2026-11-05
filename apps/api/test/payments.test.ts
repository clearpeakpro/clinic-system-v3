import { randomUUID } from 'node:crypto';
import { charges, consultations, createTenantDb, membershipFees, membershipPlans, nextCode, patients, payments } from '@clinic/db';
import type {
  ArrivalResult,
  BillingStatement,
  ChargeAdded,
  ChargeOptions,
  EncounterDetail,
  MembershipSaved,
  OrdersCreated,
  PatientBalances,
  PatientMembershipCard,
  PaymentRecorded,
  VoidResult,
} from '@clinic/shared';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixedClock } from '../src/clock.ts';
import { createStaff, NORTE, readAudit, signedInWithContext, SUR, type Client, type TestApp, startApp } from './support.ts';

// T-028: pagos, anulaciones y saldos (S-CAJ-10 a 13, S-CAJ-17, S-PAC-10), con
// el reloj fijado (America/Chicago). Decisiones del dueño del 2026-11-05
// (ADR 0042):
//  - un pago con Idempotency-Key se registra una sola vez y dos cajas a la vez
//    nunca superan el saldo;
//  - anulan el Propietario o el Administrador con un rol clínico en la sede;
//    Recepción y un Administrador sin rol clínico, no. Nada se borra;
//  - «Se retiró» se sigue debiendo (Saldos); «Cancelada» deja el estado de
//    cuenta «Anulado», con lo pagado como crédito a favor; con órdenes
//    completadas no se cancela;
//  - las cuotas de membresía se cobran completas: la inicial activa la
//    membresía y una mensualidad vencida la reactiva; anular el pago devuelve
//    la cuota a pendiente (o la deja anulada si la membresía se cancela).

/** 5 nov 2026, 10:00 a. m. en Chicago (NOR1). */
const NOW = '2026-11-05T16:00:00Z';
const REASON = 'Motivo ficticio de prueba';

describe('T-028 pagos, anulaciones y saldos', () => {
  const clock = new FixedClock(NOW);
  let app: TestApp;
  let recepcion: Client;
  let enfermeria: Client;
  let proveedor: Client;
  let adminConRol: Client;
  let adminEnfermeria: Client;
  let adminSinRol: Client;
  let recepcionSur: Client;
  let counter = 0;
  const consult: Record<string, string> = {};
  const plan: Record<string, string> = {};
  const db = () => createTenantDb(app.pool);

  beforeAll(async () => {
    app = await startApp({}, { clock });
    recepcion = await signedInWithContext(app, await createStaff(app, 'pagos-rec', [{ org: NORTE, location: 0, role: 'recepcion' }]), NORTE, 0);
    enfermeria = await signedInWithContext(app, await createStaff(app, 'pagos-enf', [{ org: NORTE, location: 0, role: 'enfermeria' }]), NORTE, 0);
    proveedor = await signedInWithContext(app, await createStaff(app, 'pagos-prov', [{ org: NORTE, location: 0, role: 'proveedor' }]), NORTE, 0);
    adminConRol = await signedInWithContext(
      app,
      await createStaff(app, 'pagos-admin-rec', [
        { org: NORTE, location: null, role: 'administrador' },
        { org: NORTE, location: 0, role: 'recepcion' },
      ]),
      NORTE,
      0,
      { mfa: true },
    );
    adminEnfermeria = await signedInWithContext(
      app,
      await createStaff(app, 'pagos-admin-enf', [
        { org: NORTE, location: null, role: 'administrador' },
        { org: NORTE, location: 0, role: 'enfermeria' },
      ]),
      NORTE,
      0,
      { mfa: true },
    );
    adminSinRol = await signedInWithContext(app, await createStaff(app, 'pagos-admin', [{ org: NORTE, location: null, role: 'administrador' }]), NORTE, 0, { mfa: true });
    recepcionSur = await signedInWithContext(app, await createStaff(app, 'pagos-rec-sur', [{ org: SUR, location: 0, role: 'recepcion' }]), SUR, 0);
    await db().withTenant(NORTE.id, async (tx) => {
      for (const c of await tx.select({ id: consultations.id, code: consultations.code }).from(consultations)) consult[c.code] = c.id;
      for (const p of await tx.select({ id: membershipPlans.id, code: membershipPlans.code }).from(membershipPlans)) plan[p.code] = p.id;
    });
  });
  afterAll(async () => {
    await app.close();
  });

  const key = () => `pagos-${randomUUID()}`;
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
        lastName: `Pagos ${String((counter += 1))}`,
        birthDate: '1980-11-05',
      });
      return id;
    });
  }

  /** Una visita sin cita en NOR1, ruta «Solo laboratorio», con pago directo. */
  async function arrive(patientId?: string): Promise<string> {
    const response = await recepcion.post(
      '/api/encounters',
      { source: 'walk_in', patientId: patientId ?? (await newPatient()), appointmentTypeId: null, route: 'LAB_ONLY', coverage: { type: 'self_pay' } },
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
  /** Una consulta agregada en Caja: inicial $60.00 o de seguimiento $45.00 en NOR1. */
  const addConsult = async (encounterId: string, c = 'CONS-INICIAL') => {
    const response = await recepcion.post(
      `/api/encounters/${encounterId}/charges`,
      { item: { kind: 'consultation', id: consult[c] ?? '' }, quantity: 1, expectedVersion: (await statement(encounterId)).statementVersion },
      { 'idempotency-key': key() },
    );
    expect(response.statusCode, response.body).toBe(201);
    return response.json<ChargeAdded>();
  };
  const pay = async (encounterId: string, amountCents: number, extra: Record<string, unknown> = {}, client = recepcion, idempotencyKey = key()) =>
    client.post(
      `/api/encounters/${encounterId}/payments`,
      { method: 'cash', amountCents, expectedVersion: (await statement(encounterId)).statementVersion, ...extra },
      { 'idempotency-key': idempotencyKey },
    );
  const paid = async (encounterId: string, amountCents: number, extra: Record<string, unknown> = {}) => {
    const response = await pay(encounterId, amountCents, extra);
    expect(response.statusCode, response.body).toBe(201);
    return response.json<PaymentRecorded>();
  };
  const voidPayment = async (client: Client, encounterId: string, paymentId: string, reason = REASON) =>
    client.post(`/api/payments/${paymentId}/void`, { reason, expectedVersion: (await statement(encounterId)).statementVersion }, { 'idempotency-key': key() });
  const voidCharge = async (client: Client, encounterId: string, chargeId: string) =>
    client.post(`/api/charges/${chargeId}/void`, { reason: REASON, expectedVersion: (await statement(encounterId)).statementVersion }, { 'idempotency-key': key() });
  const detail = async (encounterId: string) => (await recepcion.get(`/api/encounters/${encounterId}`)).json<EncounterDetail>();
  const moved = async (client: Client, encounterId: string, action: string, extra: Record<string, unknown> = {}) => {
    const response = await client.post(`/api/encounters/${encounterId}/transition`, { action, expectedVersion: (await detail(encounterId)).version, ...extra });
    expect(response.statusCode, response.body).toBe(200);
  };
  const complete = async (encounterId: string) => {
    await moved(recepcion, encounterId, 'send_to_procedure');
    await moved(enfermeria, encounterId, 'ready_for_checkout');
    await moved(recepcion, encounterId, 'start_checkout');
    await moved(recepcion, encounterId, 'complete', { acknowledgeBalance: true });
  };
  const close = async (encounterId: string, outcome: 'LEFT_EARLY' | 'CANCELLED') =>
    recepcion.post(`/api/encounters/${encounterId}/close`, { outcome, reason: REASON, expectedVersion: (await detail(encounterId)).version });
  const balances = async (patientId: string, client = recepcion) => {
    const response = await client.get(`/api/patients/${patientId}/balances`);
    expect(response.statusCode, response.body).toBe(200);
    return response.json<PatientBalances>();
  };
  const paymentRows = (encounterId: string) => db().withTenant(NORTE.id, (tx) => tx.select().from(payments).where(eq(payments.encounterId, encounterId)));

  it('pago parcial y después el resto: «Pago parcial» y «Pagado»; solo los últimos 4 de la referencia; auditado sin la referencia', async () => {
    const v = await arrive();
    await addConsult(v);
    const first = await paid(v, 2000, { method: 'credit_card', reference: ' AUTH-987654 ' });
    expect((await statement(v)).totals).toMatchObject({ totalDueCents: 6000, paidCents: 2000, balanceCents: 4000, status: 'partial' });
    await paid(v, 4000);
    const s = await statement(v);
    expect(s.totals).toMatchObject({ paidCents: 6000, balanceCents: 0, creditCents: 0, status: 'paid' });
    expect(s.payments?.map((p) => [p.method, p.amountCents, p.referenceLast4, p.recordedBy, p.voided])).toEqual([
      ['credit_card', 2000, '7654', 'Usted', null],
      ['cash', 4000, null, 'Usted', null],
    ]);
    expect(s).toMatchObject({ canPay: true, canVoid: false });
    // En la base solo hay los últimos 4, cifrados: nunca la referencia completa.
    const rows = await paymentRows(v);
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows)).not.toContain('987654');
    expect(JSON.stringify(rows)).not.toContain('7654');
    const [audit] = await readAudit(`action = 'payment.recorded' and entity_id = $1`, [first.paymentId]);
    expect(audit?.metadata).toMatchObject({ method: 'credit_card', amountCents: 2000, hasReference: true, beforeBalanceCents: 6000, afterBalanceCents: 4000, afterPaidCents: 2000 });
    expect(JSON.stringify(audit)).not.toContain('7654');
    expect(JSON.stringify(audit)).not.toContain('Prueba');
    // Sin saldo, no se cobra más.
    const more = await pay(v, 100);
    expect([more.statusCode, code(more)]).toEqual([409, 'nothing_due']);
  });

  it('dos pulsaciones o un reintento con la misma clave registran un solo pago; otro contenido, 409; más que el saldo, 409 con el saldo', async () => {
    const v = await arrive();
    await addConsult(v);
    const version = (await statement(v)).statementVersion;
    const body = { method: 'cash', amountCents: 1500, expectedVersion: version };
    const idempotencyKey = key();
    const [a, b] = await Promise.all([
      recepcion.post(`/api/encounters/${v}/payments`, body, { 'idempotency-key': idempotencyKey }),
      recepcion.post(`/api/encounters/${v}/payments`, body, { 'idempotency-key': idempotencyKey }),
    ]);
    expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
    expect(a.json<PaymentRecorded>()).toEqual(b.json<PaymentRecorded>());
    const retry = await recepcion.post(`/api/encounters/${v}/payments`, body, { 'idempotency-key': idempotencyKey });
    expect(retry.json<PaymentRecorded>()).toEqual(a.json<PaymentRecorded>());
    expect(await paymentRows(v)).toHaveLength(1);
    const reused = await recepcion.post(`/api/encounters/${v}/payments`, { ...body, amountCents: 1000 }, { 'idempotency-key': idempotencyKey });
    expect([reused.statusCode, code(reused)]).toEqual([409, 'idempotency_key_reused']);
    // Sin clave, no. La versión vieja, 409.
    expect((await recepcion.post(`/api/encounters/${v}/payments`, body)).statusCode).toBe(400);
    const stale = await recepcion.post(`/api/encounters/${v}/payments`, body, { 'idempotency-key': key() });
    expect([stale.statusCode, code(stale)]).toEqual([409, 'version_conflict']);
    // Más que el saldo: 409 con el saldo actual ($45.00).
    const over = await pay(v, 4501);
    expect(over.statusCode).toBe(409);
    expect(over.json()).toEqual({ code: 'amount_exceeds_balance', balanceCents: 4500 });
    // Monto o campos no válidos: 400. Un número de tarjeta no tiene dónde ir.
    for (const extra of [{ amountCents: 0 }, { amountCents: 10.5 }, { method: 'check' }, { cardNumber: '4111111111111111' }, { reference: 'x'.repeat(65) }]) {
      expect((await pay(v, 1000, extra)).statusCode, JSON.stringify(extra)).toBe(400);
    }
    expect(await paymentRows(v)).toHaveLength(1);
  });

  it('dos cajas cobrando a la vez nunca superan el saldo', async () => {
    const v = await arrive();
    await addConsult(v);
    const version = (await statement(v)).statementVersion;
    const otra = adminConRol;
    // Cada caja intenta cobrar el saldo completo ($60.00) con su propia clave.
    const results = await Promise.all(
      [recepcion, otra, recepcion, otra].map((client) =>
        client.post(`/api/encounters/${v}/payments`, { method: 'cash', amountCents: 6000, expectedVersion: version }, { 'idempotency-key': key() }),
      ),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409, 409, 409]);
    expect((await statement(v)).totals).toMatchObject({ paidCents: 6000, balanceCents: 0 });
    // También con la versión al día: el bloqueo del estado de cuenta las ordena y la segunda ve el saldo nuevo.
    const w = await arrive();
    await addConsult(w);
    const fresh = (await statement(w)).statementVersion;
    const both = await Promise.all(
      [recepcion, otra].map((client) => client.post(`/api/encounters/${w}/payments`, { method: 'cash', amountCents: 4000, expectedVersion: fresh }, { 'idempotency-key': key() })),
    );
    expect(both.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    const total = (await paymentRows(w)).reduce((sum, p) => sum + p.amountCents, 0);
    expect(total).toBeLessThanOrEqual(6000);
  });

  it('anular un pago: fila inversa con motivo, el saldo vuelve a subir, nada se borra; auditado con el antes y el después', async () => {
    const v = await arrive();
    await addConsult(v);
    const { paymentId } = await paid(v, 6000);
    // Recepción cobra pero no anula; un Administrador sin rol clínico tampoco.
    for (const client of [recepcion, adminSinRol]) expect((await voidPayment(client, v, paymentId)).statusCode).toBe(403);
    // Sin motivo, 400.
    expect((await voidPayment(adminConRol, v, paymentId, '  ')).statusCode).toBe(400);
    const response = await voidPayment(adminConRol, v, paymentId);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json<VoidResult>().id).toBe(paymentId);
    const s = await statement(v, adminConRol);
    expect(s.totals).toMatchObject({ paidCents: 0, balanceCents: 6000, status: 'open' });
    expect(s.payments?.[0]).toMatchObject({ id: paymentId, amountCents: 6000, voided: { reason: REASON, by: 'Usted' } });
    expect(s.canVoid).toBe(true);
    const rows = await paymentRows(v);
    expect(rows.map((r) => [r.kind, r.amountCents, r.reversesPaymentId])).toEqual([
      ['payment', 6000, null],
      ['void', -6000, paymentId],
    ]);
    expect(JSON.stringify(rows)).not.toContain(REASON);
    const again = await voidPayment(adminConRol, v, paymentId);
    expect([again.statusCode, code(again)]).toEqual([409, 'payment_already_voided']);
    const [audit] = await readAudit(`action = 'payment.voided' and entity_id = $1`, [paymentId]);
    expect(audit?.metadata).toMatchObject({ amountCents: 6000, from: 'recorded', to: 'voided', beforePaidCents: 6000, beforeBalanceCents: 0, afterPaidCents: 0, afterBalanceCents: 6000 });
    // Otra organización no lo ve ni lo anula.
    expect((await recepcionSur.get(`/api/encounters/${v}/statement`)).statusCode).toBe(404);
  });

  it('un Administrador con rol Enfermería ve el estado de cuenta completo y anula, pero no cobra', async () => {
    const v = await arrive();
    const { chargeId } = await addConsult(v);
    const s = await statement(v, adminEnfermeria);
    expect(s).toMatchObject({ view: 'full', canPay: false, canVoid: true, editable: false });
    expect((await pay(v, 1000, {}, adminEnfermeria)).statusCode).toBe(403);
    expect((await voidCharge(adminEnfermeria, v, chargeId)).statusCode).toBe(200);
    // Enfermería sola sigue viendo solo los totales.
    expect(await statement(v, enfermeria)).toMatchObject({ view: 'totals', payments: null, canPay: false, canVoid: false });
  });

  it('anular un cargo de Caja: con motivo y auditado; ya pagado deja «Crédito a favor»; los de orden, no', async () => {
    const v = await arrive();
    const first = await addConsult(v, 'CONS-INICIAL');
    await addConsult(v, 'CONS-SEGUIMIENTO');
    await paid(v, 10500);
    expect((await voidCharge(recepcion, v, first.chargeId)).statusCode).toBe(403);
    const response = await voidCharge(adminConRol, v, first.chargeId);
    expect(response.statusCode, response.body).toBe(200);
    const s = await statement(v);
    expect(s.totals).toMatchObject({ totalDueCents: 4500, paidCents: 10500, balanceCents: -6000, creditCents: 6000, status: 'paid' });
    expect(s.voided).toEqual([expect.objectContaining({ id: first.chargeId, itemCode: 'CONS-INICIAL', quantity: 1, reason: REASON })]);
    const again = await voidCharge(adminConRol, v, first.chargeId);
    expect([again.statusCode, code(again)]).toEqual([409, 'charge_already_voided']);
    const [audit] = await readAudit(`action = 'charge.voided' and entity_id = $1`, [first.chargeId]);
    expect(audit?.metadata).toMatchObject({ source: 'cashier', amountCents: 6000, beforeBalanceCents: 0, afterBalanceCents: -6000 });
    // El cargo de una orden: 409.
    const options = (await recepcion.get(`/api/encounters/${v}/charge-options`)).json<ChargeOptions>();
    const b12 = options.items.find((i) => i.code === 'INJ-B12');
    const ordered = await proveedor.post(`/api/encounters/${v}/orders`, { type: 'injection', lines: [{ itemId: b12?.id, quantity: 1 }] }, { 'idempotency-key': key() });
    expect(ordered.statusCode, ordered.body).toBe(201);
    const [orderCharge] = await db().withTenant(NORTE.id, (tx) => tx.select({ id: charges.id }).from(charges).where(eq(charges.orderId, ordered.json<OrdersCreated>().orders[0]?.id ?? '')));
    const fromOrder = await voidCharge(adminConRol, v, orderCharge?.id ?? '');
    expect([fromOrder.statusCode, code(fromOrder)]).toEqual([409, 'charge_from_order']);
  });

  it('el saldo de una visita completada aparece en Saldos y se cobra después; «Se retiró» también se debe', async () => {
    const patientId = await newPatient();
    const v = await arrive(patientId);
    await addConsult(v);
    await paid(v, 1000);
    await complete(v);
    const left = await arrive(patientId);
    await addConsult(left, 'CONS-SEGUIMIENTO');
    expect((await close(left, 'LEFT_EARLY')).statusCode).toBe(200);
    const list = await balances(patientId);
    expect(list.canCollect).toBe(true);
    expect(list.visits.map((r) => [r.encounterId, r.status, r.totalDueCents, r.paidCents, r.balanceCents, r.statementStatus])).toEqual([
      [left, 'LEFT_EARLY', 4500, 0, 4500, 'open'],
      [v, 'COMPLETED', 6000, 1000, 5000, 'partial'],
    ]);
    expect(list.visits[0]?.location.code).toBe('NOR1');
    // Se cobra desde Saldos (la Caja de la visita completada, ADR 0004).
    const s = await statement(v);
    expect(s).toMatchObject({ editable: false, canPay: true });
    await paid(v, 5000);
    await paid(left, 4500);
    expect((await balances(patientId)).visits).toEqual([]);
    // El Proveedor ve la lista sin cobrar; Enfermería y un Administrador sin rol clínico, no.
    expect((await balances(patientId, proveedor)).canCollect).toBe(false);
    for (const client of [enfermeria, adminSinRol]) expect((await client.get(`/api/patients/${patientId}/balances`)).statusCode).toBe(403);
    const [audit] = await readAudit(`action = 'billing.balances_view' and entity_id = $1`, [patientId]);
    expect(audit?.metadata).toMatchObject({ locations: 1 });
  });

  it('«Cancelada»: estado de cuenta «Anulado», lo pagado como crédito a favor, no se cobra ni aparece en Saldos; con órdenes completadas no se cancela', async () => {
    const patientId = await newPatient();
    const v = await arrive(patientId);
    await addConsult(v);
    const { paymentId } = await paid(v, 2000);
    expect((await close(v, 'CANCELLED')).statusCode).toBe(200);
    const s = await statement(v);
    expect(s.totals).toMatchObject({ subtotalCents: 6000, totalDueCents: 0, paidCents: 2000, balanceCents: -2000, creditCents: 2000, status: 'voided' });
    expect(s).toMatchObject({ canPay: false, editable: false });
    expect(await statement(v, adminConRol)).toMatchObject({ canVoid: false });
    const late = await pay(v, 100);
    expect([late.statusCode, code(late)]).toEqual([409, 'statement_voided']);
    const lateVoid = await voidPayment(adminConRol, v, paymentId);
    expect([lateVoid.statusCode, code(lateVoid)]).toEqual([409, 'statement_voided']);
    expect((await balances(patientId)).visits).toEqual([]);

    // Con una orden completada: «Cancelada» se rechaza; «Se retiró» sí.
    const w = await arrive(patientId);
    const options = (await recepcion.get(`/api/encounters/${w}/charge-options`)).json<ChargeOptions>();
    const b12 = options.items.find((i) => i.code === 'INJ-B12');
    const ordered = await proveedor.post(`/api/encounters/${w}/orders`, { type: 'injection', lines: [{ itemId: b12?.id, quantity: 1 }] }, { 'idempotency-key': key() });
    const order = ordered.json<OrdersCreated>().orders[0];
    expect((await enfermeria.post(`/api/orders/${order?.id ?? ''}/start`, { expectedVersion: 1 })).statusCode).toBe(200);
    expect((await enfermeria.post(`/api/orders/${order?.id ?? ''}/complete`, { expectedVersion: 2 })).statusCode).toBe(200);
    expect((await detail(w)).abilities).toMatchObject({ close: true, cancelBlocked: true });
    const cancelled = await close(w, 'CANCELLED');
    expect([cancelled.statusCode, code(cancelled)]).toEqual([409, 'completed_orders']);
    expect((await close(w, 'LEFT_EARLY')).statusCode).toBe(200);
    expect((await balances(patientId)).visits.map((r) => [r.encounterId, r.balanceCents])).toEqual([[w, 2000]]);
  });

  describe('cuotas de membresía (plan Esencial)', () => {
    let patientId = '';
    let membershipId = '';

    const card = async (client = recepcion) => {
      const response = await client.get(`/api/patients/${patientId}/membership`);
      expect(response.statusCode, response.body).toBe(200);
      return response.json<PatientMembershipCard>().membership;
    };
    const feeOf = async (kind: 'initial' | 'monthly') => {
      const fee = (await card())?.fees.find((f) => f.kind === kind);
      if (!fee) throw new Error(`sin cuota ${kind}`);
      return fee;
    };
    const payFee = async (kind: 'initial' | 'monthly', idempotencyKey = key()) => {
      const fee = await feeOf(kind);
      return recepcion.post(`/api/membership-fees/${fee.id}/payments`, { method: 'debit_card', reference: '000123', expectedVersion: fee.version }, { 'idempotency-key': idempotencyKey });
    };
    const voidFee = async (kind: 'initial' | 'monthly') => {
      const fee = await feeOf(kind);
      return adminConRol.post(`/api/payments/${fee.payment?.id ?? ''}/void`, { reason: REASON, expectedVersion: fee.version }, { 'idempotency-key': key() });
    };

    beforeAll(async () => {
      clock.set(NOW);
      patientId = await newPatient();
      const response = await recepcion.post(
        `/api/patients/${patientId}/membership`,
        { planId: plan.ESENCIAL, startDate: '2026-11-05', billingDay: 15, affiliatePatientIds: [], identityVerified: true },
        { 'idempotency-key': key() },
      );
      expect(response.statusCode, response.body).toBe(201);
      membershipId = response.json<MembershipSaved>().id;
    });

    it('la cuota inicial pendiente aparece en Saldos; pagarla (completa, una vez) activa la membresía en la misma transacción', async () => {
      clock.set(NOW);
      const before = await card();
      expect(before).toMatchObject({ status: 'pending_payment', abilities: { payFee: true, voidFeePayment: false } });
      const initial = await feeOf('initial');
      expect((await balances(patientId)).fees).toEqual([expect.objectContaining({ feeId: initial.id, membershipId, kind: 'initial', amountCents: initial.amountCents })]);
      // Un monto enviado por la web no se acepta: la cuota se cobra completa.
      const withAmount = await recepcion.post(`/api/membership-fees/${initial.id}/payments`, { method: 'cash', amountCents: 1, expectedVersion: initial.version }, { 'idempotency-key': key() });
      expect(withAmount.statusCode).toBe(400);
      // Enfermería y el Proveedor no cobran.
      for (const client of [enfermeria, proveedor]) {
        expect((await client.post(`/api/membership-fees/${initial.id}/payments`, { method: 'cash', expectedVersion: initial.version }, { 'idempotency-key': key() })).statusCode).toBe(403);
      }
      const idempotencyKey = key();
      const [a, b] = await Promise.all([payFee('initial', idempotencyKey), payFee('initial', idempotencyKey)]);
      expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
      const after = await card();
      expect(after?.status).toBe('active');
      expect(after?.fees.find((f) => f.kind === 'initial')).toMatchObject({ status: 'paid', payment: { method: 'debit_card', amountCents: initial.amountCents, referenceLast4: '0123' }, voidCancelsMembership: false });
      expect(await db().withTenant(NORTE.id, (tx) => tx.select().from(payments).where(eq(payments.membershipFeeId, initial.id)))).toHaveLength(1);
      expect((await balances(patientId)).fees).toEqual([]);
      const again = await payFee('initial');
      expect([again.statusCode, code(again)]).toEqual([409, 'fee_not_pending']);
      const [audit] = await readAudit(`action = 'membership_fee.paid' and metadata->>'membershipCode' = $1`, [after?.code ?? '']);
      expect(audit?.metadata).toMatchObject({ feeKind: 'initial', membershipFrom: 'pending_payment', membershipTo: 'active' });
    });

    it('anular el pago de la cuota inicial dentro de los 30 días la devuelve a pendiente («Pendiente de pago»)', async () => {
      clock.set('2026-11-20T16:00:00Z');
      expect((await voidFee('initial')).statusCode).toBe(200);
      const after = await card();
      expect(after?.status).toBe('pending_payment');
      expect(after?.fees.find((f) => f.kind === 'initial')).toMatchObject({ status: 'pending', payment: null });
      expect((await payFee('initial')).statusCode).toBe(201);
      expect((await card())?.status).toBe('active');
    });

    it('pagar una mensualidad vencida reactiva la membresía suspendida (reloj fijado)', async () => {
      // La primera mensualidad vence el 15 de diciembre; el 16 a la 1:00 a. m. de la sede ya está suspendida.
      clock.set('2026-12-16T07:00:00Z');
      expect((await card())?.status).toBe('suspended');
      const monthly = await feeOf('monthly');
      expect((await balances(patientId)).fees.map((f) => [f.kind, f.dueDate])).toEqual([['monthly', '2026-12-15']]);
      expect(monthly.status).toBe('pending');
      expect((await payFee('monthly')).statusCode).toBe(201);
      expect((await card())?.status).toBe('active');
      const [audit] = await readAudit(`action = 'membership_fee.paid' and metadata->>'feeKind' = 'monthly' and metadata->>'dueDate' = '2026-12-15'`);
      expect(audit?.metadata).toMatchObject({ membershipFrom: 'suspended', membershipTo: 'active' });
    });

    it('pasados los 30 días, anular el pago de la cuota inicial cancela la membresía (se avisa antes) y la cuota queda anulada, sin deuda', async () => {
      clock.set('2026-12-16T07:00:00Z');
      expect((await feeOf('initial')).voidCancelsMembership).toBe(true);
      expect((await feeOf('monthly')).voidCancelsMembership).toBe(false);
      expect((await voidFee('initial')).statusCode).toBe(200);
      const after = await card();
      expect(after).toMatchObject({ status: 'cancelled', cancellation: 'initial_unpaid' });
      expect(after?.fees.find((f) => f.kind === 'initial')?.status).toBe('voided');
      // Ya cancelada: anular el pago de la mensualidad la deja «Anulada», no pendiente.
      expect((await voidFee('monthly')).statusCode).toBe(200);
      expect((await card())?.fees.map((f) => [f.kind, f.status])).toEqual([
        ['initial', 'voided'],
        ['monthly', 'voided'],
      ]);
      expect((await balances(patientId)).fees).toEqual([]);
      // Nada se borró: dos pagos de la cuota inicial y dos anulaciones; un pago de la mensualidad y su anulación.
      const rows = await db().withTenant(NORTE.id, (tx) => tx.select({ kind: payments.kind }).from(payments).innerJoin(membershipFees, eq(membershipFees.id, payments.membershipFeeId)).where(eq(membershipFees.membershipId, membershipId)));
      expect(rows.map((r) => r.kind).sort()).toEqual(['payment', 'payment', 'payment', 'void', 'void', 'void']);
      clock.set(NOW);
    });
  });
});
