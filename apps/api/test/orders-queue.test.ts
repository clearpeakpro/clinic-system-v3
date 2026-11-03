import { randomUUID } from 'node:crypto';
import { createTenantDb, decryptNotificationPayload, labTests, nextCode, NOTIFICATION_EVENT, patients, prices, procedures, type NotificationPayload } from '@clinic/db';
import type { ArrivalResult, EncounterDetail, EncounterOrders, OrderAssignee, OrderLabOptions, OrderQueue, OrderQueueTab, OrderSaved, OrdersCreated } from '@clinic/shared';
import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { FixedClock } from '../src/clock.ts';
import { createStaff, membershipIdOf, NORTE, readAudit, signedInWithContext, startApp, type Client, type Staff, type TestApp } from './support.ts';

// T-026: ejecutar órdenes y cola de órdenes (S-CLI-03, 19, 20 y 22), con el reloj fijado.
//  - Enfermería se asigna una orden, la inicia y la completa, y la visita pasa
//    sola a «Listo para caja» en la misma transacción («Sistema» en el historial).
//  - Una orden asignada a otra persona no se puede iniciar, ni siquiera el
//    Administrador con rol Enfermería (ADR 0033, decisión del 2026-11-02).
//  - Una orden de laboratorio no se completa sin laboratorio (ADR 0028).
//  - El aviso «Orden asignada a usted» va por el outbox con el código de la orden.
//  - La cola lleva códigos, no nombres de pacientes, notas ni costos.
//  - «Completadas hoy», con el día de la sede: 11:59 p. m. y 12:01 a. m., y
//    el día del cambio de horario (1 nov 2026 en Chicago dura 25 horas).

/** 5 nov 2026, 10:00 a. m. en Chicago (NOR1). */
const NOW = '2026-11-05T16:00:00Z';
const NOTES = 'Nota ficticia de la orden lambda';
const COMPLETION = 'Nota de finalización ficticia mu';
/** Costos de la semilla de Norte (DEMO_LABS): ninguno debe aparecer en las respuestas clínicas. */
const NORTE_COSTS = [1200, 1500, 1800, 900, 1900, 2100, 1100, 1400];

describe('T-026 ejecutar órdenes y cola de órdenes', () => {
  const clock = new FixedClock(NOW);
  let app: TestApp;
  let recepcion: Client;
  let enfermeria: Client;
  let enfermeria2: Client;
  let proveedor: Client;
  let adminSinRol: Client;
  let adminConEnfermeria: Client;
  let recepcionStaff: Staff;
  let enfermeriaStaff: Staff;
  let enfermeria2Staff: Staff;
  let proveedorStaff: Staff;
  let counter = 0;
  let procedure = '';
  const lab: Record<string, string> = {};
  const lastNames: string[] = [];
  const db = () => createTenantDb(app.pool);

  beforeAll(async () => {
    app = await startApp({}, { clock });
    recepcionStaff = await createStaff(app, 'oq-rec', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    enfermeriaStaff = await createStaff(app, 'oq-enf', [{ org: NORTE, location: 0, role: 'enfermeria' }]);
    enfermeria2Staff = await createStaff(app, 'oq-enf2', [{ org: NORTE, location: 0, role: 'enfermeria' }]);
    recepcion = await signedInWithContext(app, recepcionStaff, NORTE, 0);
    enfermeria = await signedInWithContext(app, enfermeriaStaff, NORTE, 0);
    enfermeria2 = await signedInWithContext(app, enfermeria2Staff, NORTE, 0);
    proveedorStaff = await createStaff(app, 'oq-prov', [{ org: NORTE, location: 0, role: 'proveedor' }]);
    proveedor = await signedInWithContext(app, proveedorStaff, NORTE, 0);
    adminSinRol = await signedInWithContext(app, await createStaff(app, 'oq-admin', [{ org: NORTE, location: null, role: 'administrador' }]), NORTE, 0, { mfa: true });
    adminConEnfermeria = await signedInWithContext(
      app,
      await createStaff(app, 'oq-admin-enf', [
        { org: NORTE, location: null, role: 'administrador' },
        { org: NORTE, location: 0, role: 'enfermeria' },
      ]),
      NORTE,
      0,
      { mfa: true },
    );
    const tests = await db().withTenant(NORTE.id, (tx) => tx.select({ id: labTests.id, code: labTests.code }).from(labTests));
    for (const t of tests) lab[t.code] = t.id;
    const suffix = randomUUID().slice(0, 6).toUpperCase();
    procedure = uuidv7();
    await db().withTenant(NORTE.id, async (tx) => {
      await tx.insert(procedures).values({ id: procedure, organizationId: NORTE.id, code: `PROC-T026-${suffix}`, name: 'Procedimiento ficticio T-026', kind: 'procedure' });
      await tx.insert(prices).values({ organizationId: NORTE.id, locationId: null, procedureId: procedure, amountCents: 2020, effectiveFrom: '2026-01-01' });
    });
  });
  afterAll(async () => {
    await app.close();
  });

  async function newPatient(): Promise<string> {
    const lastName = `Cola ${randomUUID().slice(0, 8)}`;
    lastNames.push(lastName);
    return db().withTenant(NORTE.id, async (tx) => {
      const id = uuidv7();
      await tx.insert(patients).values({
        id,
        organizationId: NORTE.id,
        registeredLocationId: NORTE.locations[0].id,
        code: await nextCode(tx, NORTE.id, 'patient'),
        firstName: 'Prueba',
        lastName,
        birthDate: '1990-11-05',
      });
      return id;
    });
  }

  const key = () => `oq-${String(Date.now())}-${String((counter += 1))}`;

  /** Visita sin cita en NOR1, ruta «Solo procedimiento» (acepta órdenes en «Registrado»). */
  async function arrive(options: { insurance?: boolean } = {}): Promise<{ id: string; code: string }> {
    const coverage = options.insurance ? { type: 'insurance', insurerName: 'Aseguradora ficticia', memberId: null, term: 'copay', value: '20.00' } : { type: 'self_pay' };
    const response = await recepcion.post(
      '/api/encounters',
      { source: 'walk_in', patientId: await newPatient(), appointmentTypeId: null, route: 'PROCEDURE_ONLY', coverage },
      { 'idempotency-key': key() },
    );
    expect(response.statusCode, response.body).toBe(201);
    const { encounter } = response.json<ArrivalResult>();
    return { id: encounter.id, code: encounter.code };
  }

  const createOrder = async (encounterId: string, body: unknown) => {
    const response = await proveedor.post(`/api/encounters/${encounterId}/orders`, body, { 'idempotency-key': key() });
    expect(response.statusCode, response.body).toBe(201);
    const [order] = response.json<OrdersCreated>().orders;
    if (!order) throw new Error('sin orden');
    return order;
  };
  const procedureOrder = (encounterId: string, notes?: string) => createOrder(encounterId, { type: 'procedure', lines: [{ itemId: procedure, quantity: 1 }], ...(notes ? { notes } : {}) });
  const queue = async (client: Client, tab: OrderQueueTab = 'pending', mine = false) => {
    const response = await client.get(`/api/orders/queue?tab=${tab}${mine ? '&mine=1' : ''}`);
    expect(response.statusCode, response.body).toBe(200);
    return response.json<OrderQueue>();
  };
  const start = (client: Client, orderId: string, expectedVersion: number) => client.post(`/api/orders/${orderId}/start`, { expectedVersion });
  const complete = (client: Client, orderId: string, expectedVersion: number, notes?: string) =>
    client.post(`/api/orders/${orderId}/complete`, { expectedVersion, ...(notes === undefined ? {} : { notes }) });
  const assign = (client: Client, orderId: string, membershipId: string | null, expectedVersion: number) => client.post(`/api/orders/${orderId}/assign`, { membershipId, expectedVersion });
  const code = (response: { json: () => unknown }) => (response.json() as { code: string }).code;
  const ok = (response: Awaited<ReturnType<Client['post']>>) => {
    expect(response.statusCode, response.body).toBe(200);
    return response.json<OrderSaved>();
  };

  const notificationsFor = async (orderId: string): Promise<NotificationPayload[]> => {
    const operator = new pg.Client({ connectionString: inject('operatorUrl') });
    await operator.connect();
    try {
      const { rows } = await operator.query<{ id: string; payload: string }>(
        'select id, payload from app.outbox where kind = $1 and organization_id = $2 and entity_id = $3 and payload is not null order by created_at, id',
        [NOTIFICATION_EVENT, NORTE.id, orderId],
      );
      return rows.map((r) => decryptNotificationPayload(app.config.outboxKey, { organizationId: NORTE.id, eventId: r.id }, r.payload));
    } finally {
      await operator.end();
    }
  };

  it('Enfermería se asigna la orden, la inicia y la completa; la visita pasa sola a «Listo para caja»', async () => {
    clock.set(NOW);
    const v = await arrive();
    const order = await procedureOrder(v.id, NOTES);
    ok(await recepcion.post(`/api/encounters/${v.id}/transition`, { action: 'send_to_procedure', expectedVersion: 1 }));

    const pending = await queue(enfermeria);
    const card = pending.rows.find((r) => r.id === order.id);
    expect(card).toMatchObject({ status: 'PENDING', encounter: { id: v.id, code: v.code, status: 'PROCEDURE_PENDING' }, assignedTo: null });
    expect(card?.abilities).toMatchObject({ start: true, complete: false, assign: true, cancel: false });

    const me = await membershipIdOf(app, NORTE, enfermeriaStaff.userId);
    const assignees = (await enfermeria.get('/api/orders/assignees')).json<OrderAssignee[]>();
    expect(assignees.find((a) => a.membershipId === me)).toMatchObject({ me: true, roles: ['enfermeria'] });
    // Recepción no es elegible.
    expect(assignees.some((a) => a.name.includes('oq-rec'))).toBe(false);

    const assigned = ok(await assign(enfermeria, order.id, me, 1));
    expect(assigned.order).toMatchObject({ status: 'PENDING', version: 2 });
    // «Asignarme»: nadie se avisa a sí mismo.
    expect(await notificationsFor(order.id)).toEqual([]);
    expect((await queue(enfermeria, 'pending', true)).rows.map((r) => r.id)).toContain(order.id);

    const started = ok(await start(enfermeria, order.id, 2));
    expect(started.order).toMatchObject({ status: 'IN_PROGRESS', version: 3 });
    expect((await queue(enfermeria, 'in_progress')).rows.find((r) => r.id === order.id)?.abilities).toMatchObject({ start: false, complete: true });

    const done = ok(await complete(enfermeria, order.id, 3, COMPLETION));
    expect(done).toMatchObject({ order: { status: 'COMPLETED', version: 4 }, encounter: { status: 'READY_FOR_CHECKOUT' } });
    const detail = (await enfermeria.get(`/api/encounters/${v.id}`)).json<EncounterDetail>();
    expect(detail.timeline[0]).toMatchObject({ action: 'ready_for_checkout', fromStatus: 'PROCEDURE_PENDING', toStatus: 'READY_FOR_CHECKOUT', actor: { kind: 'system' } });

    // La nota de finalización se añade a las notas, cifradas.
    const view = (await proveedor.get(`/api/encounters/${v.id}/orders`)).json<EncounterOrders>();
    expect(view.orders.find((o) => o.id === order.id)?.notes).toBe(`${NOTES}\n\n${COMPLETION}`);
    expect((await queue(enfermeria, 'completed_today')).rows.find((r) => r.id === order.id)).toMatchObject({ status: 'COMPLETED', completedAt: NOW.replace('Z', '.000Z') });

    // Auditoría: de la nota, solo el nombre del campo (ADR 0018).
    const audit = await readAudit(`entity_id = $1 and action like 'order.%'`, [order.id]);
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['order.assigned', 'order.started', 'order.completed']));
    expect(audit.find((a) => a.action === 'order.completed')?.metadata).toMatchObject({ fields: 'notes', from: 'IN_PROGRESS', to: 'COMPLETED' });
    expect(JSON.stringify(audit)).not.toContain(COMPLETION);

    // Ya completada: nada más.
    expect(code(await complete(enfermeria, order.id, 4))).toBe('order_closed');
    expect(code(await assign(enfermeria, order.id, null, 4))).toBe('order_closed');
  });

  it('una orden asignada a otra persona no se puede iniciar, ni siquiera por el Administrador con rol Enfermería; el aviso lleva el código', async () => {
    clock.set(NOW);
    const v = await arrive();
    const order = await procedureOrder(v.id);
    const other = await membershipIdOf(app, NORTE, enfermeria2Staff.userId);

    // Recepción no es elegible; la versión se respeta.
    const recepcionId = await membershipIdOf(app, NORTE, recepcionStaff.userId);
    const notEligible = await assign(proveedor, order.id, recepcionId, 1);
    expect([notEligible.statusCode, code(notEligible)]).toEqual([400, 'assignee_not_eligible']);
    const stale = await assign(proveedor, order.id, other, 7);
    expect([stale.statusCode, code(stale)]).toEqual([409, 'version_conflict']);

    ok(await assign(proveedor, order.id, other, 1));
    const sent = await notificationsFor(order.id);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ userId: enfermeria2Staff.userId, kind: 'order.assigned', entityType: 'order', entityId: order.id, code: order.code });
    // Elegir otra vez la misma: no escribe nada.
    expect(ok(await assign(proveedor, order.id, other, 2)).order.version).toBe(2);

    expect((await queue(enfermeria)).rows.find((r) => r.id === order.id)?.abilities).toMatchObject({ start: false, assign: true });
    for (const client of [enfermeria, adminConEnfermeria, proveedor]) {
      const denied = await start(client, order.id, 2);
      expect([denied.statusCode, code(denied)]).toEqual([403, 'order_assigned_to_other']);
    }
    // Completar una Pendiente: no.
    const early = await complete(enfermeria2, order.id, 2);
    expect([early.statusCode, code(early)]).toEqual([409, 'invalid_order_transition']);

    const started = ok(await start(enfermeria2, order.id, 2));
    // Completar no exige ser quien la inició; con la versión leída.
    const conflict = await complete(enfermeria, order.id, 2);
    expect([conflict.statusCode, code(conflict)]).toEqual([409, 'version_conflict']);
    // Quitar la asignación.
    const unassigned = ok(await assign(enfermeria, order.id, null, started.order.version));
    expect((await queue(enfermeria, 'in_progress')).rows.find((r) => r.id === order.id)?.assignedTo).toBeNull();
    ok(await complete(enfermeria, order.id, unassigned.order.version));
  });

  it('una orden de laboratorio no se completa sin laboratorio asignado: antes, «Cambiar laboratorio…»', async () => {
    clock.set(NOW);
    const v = await arrive({ insurance: true });
    const a1c = lab['LAB-A1C'] ?? '';
    // Con seguro, el Proveedor puede dejarla sin laboratorio (ADR 0028).
    const order = await createOrder(v.id, { type: 'lab', lines: [{ itemId: a1c, quantity: 1 }], labGroups: [{ labTestIds: [a1c], labProviderId: null }] });
    ok(await start(enfermeria, order.id, 1));
    expect((await queue(enfermeria, 'in_progress')).rows.find((r) => r.id === order.id)).toMatchObject({ lab: null, abilities: { complete: false, needsLab: true, changeLab: true } });
    const blocked = await complete(enfermeria, order.id, 2);
    expect([blocked.statusCode, code(blocked)]).toEqual([409, 'lab_not_assigned']);

    const options = (await enfermeria.get(`/api/orders/${order.id}/lab-options`)).json<OrderLabOptions>();
    const chosen = options.options[0];
    if (!chosen) throw new Error('sin laboratorios');
    ok(await enfermeria.post(`/api/orders/${order.id}/lab`, { labProviderId: chosen.id, reason: 'Red del seguro ficticia', expectedVersion: 2 }));
    expect((await queue(enfermeria, 'in_progress')).rows.find((r) => r.id === order.id)).toMatchObject({ lab: { id: chosen.id }, abilities: { complete: true, needsLab: false } });
    expect(ok(await complete(enfermeria, order.id, 3)).order.status).toBe('COMPLETED');
  });

  it('la cola: solo Enfermería y Proveedor; códigos, servicio y personal, sin nombres de pacientes, notas ni costos; lectura auditada', async () => {
    clock.set(NOW);
    const v = await arrive();
    const order = await procedureOrder(v.id, NOTES);
    const a1c = lab['LAB-A1C'] ?? '';
    await createOrder(v.id, { type: 'lab', lines: [{ itemId: a1c, quantity: 1 }] });

    for (const client of [recepcion, adminSinRol]) {
      expect((await client.get('/api/orders/queue')).statusCode).toBe(403);
      expect((await start(client, order.id, 1)).statusCode).toBe(403);
      expect((await client.get('/api/orders/assignees')).statusCode).toBe(403);
    }
    expect((await enfermeria.get('/api/orders/queue?tab=todas')).statusCode).toBe(400);

    const response = await proveedor.get('/api/orders/queue?tab=pending');
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json<OrderQueue>();
    const card = body.rows.find((r) => r.id === order.id);
    expect(card).toMatchObject({
      code: order.code,
      type: 'procedure',
      items: [{ name: 'Procedimiento ficticio T-026', quantity: 1 }],
      encounter: { code: v.code },
      orderedBy: { kind: 'me' },
      abilities: { start: true, cancel: true },
    });
    expect(card?.patientCode).toMatch(/^P-\d{6,}$/);
    expect(body).toMatchObject({ tab: 'pending', mine: false, today: '2026-11-05', timeZone: 'America/Chicago' });
    expect(body.counts.pending).toBeGreaterThanOrEqual(2);
    // Nunca nombres de pacientes, notas ni costos de laboratorio.
    for (const tab of ['pending', 'in_progress', 'completed_today', 'cancelled'] as const) {
      const text = (await enfermeria.get(`/api/orders/queue?tab=${tab}`)).body;
      for (const lastName of lastNames) expect(text).not.toContain(lastName);
      expect(text).not.toContain(NOTES);
      expect(text).not.toContain(COMPLETION);
      expect(text).not.toMatch(/notes|cost/i);
      for (const cents of NORTE_COSTS) expect(text).not.toMatch(new RegExp(`[":]${String(cents)}[,}]`));
    }
    // «Asignadas a mí»: solo las suyas.
    expect((await queue(enfermeria2, 'pending', true)).rows.every((r) => r.assignedTo?.kind === 'me')).toBe(true);

    const audit = await readAudit(`action = 'order.queue_view' and actor_id = $1`, [proveedorStaff.userId]);
    expect(audit.at(-1)?.metadata).toMatchObject({ tab: 'pending', mine: false });
  });

  describe('«Completadas hoy» con el día de la sede', () => {
    /** Completa una orden nueva a esa hora (UTC). */
    async function completedAt(instant: string): Promise<string> {
      clock.set(instant);
      const v = await arrive();
      const order = await procedureOrder(v.id);
      ok(await start(enfermeria, order.id, 1));
      ok(await complete(enfermeria, order.id, 2));
      return order.id;
    }
    const today = async (instant: string) => {
      clock.set(instant);
      const body = await queue(enfermeria, 'completed_today');
      return { today: body.today, ids: body.rows.map((r) => r.id) };
    };

    it('11:59 p. m. y 12:01 a. m. de la sede', async () => {
      const morning = await completedAt('2026-11-10T14:00:00Z'); // 8:00 a. m. CST del 10.
      const late = await completedAt('2026-11-11T05:58:00Z'); // 11:58 p. m. CST del 10.
      const yesterday = await completedAt('2026-11-10T05:00:00Z'); // 11:00 p. m. CST del 9.
      const before = await today('2026-11-11T05:59:00Z'); // 11:59 p. m. del 10.
      expect(before.today).toBe('2026-11-10');
      expect(before.ids).toEqual(expect.arrayContaining([late, morning]));
      expect(before.ids).not.toContain(yesterday);
      // Las más recientes primero.
      expect(before.ids.indexOf(late)).toBeLessThan(before.ids.indexOf(morning));
      const after = await today('2026-11-11T06:01:00Z'); // 12:01 a. m. del 11.
      expect(after.today).toBe('2026-11-11');
      expect(after.ids).not.toContain(late);
      expect(after.ids).not.toContain(morning);
    });

    it('el día del cambio de horario (1 nov 2026, 25 horas): desde las 12:00 a. m. CDT hasta las 11:59 p. m. CST', async () => {
      const first = await completedAt('2026-11-01T05:30:00Z'); // 12:30 a. m. CDT del 1.
      const last = await completedAt('2026-11-02T05:30:00Z'); // 11:30 p. m. CST del 1.
      const previous = await completedAt('2026-11-01T04:30:00Z'); // 11:30 p. m. CDT del 31 oct.
      const before = await today('2026-11-02T05:59:00Z');
      expect(before.today).toBe('2026-11-01');
      expect(before.ids).toEqual(expect.arrayContaining([first, last]));
      expect(before.ids).not.toContain(previous);
      const after = await today('2026-11-02T06:01:00Z');
      expect(after.today).toBe('2026-11-02');
      expect(after.ids).not.toContain(first);
      expect(after.ids).not.toContain(last);
      clock.set(NOW);
    });
  });
});
