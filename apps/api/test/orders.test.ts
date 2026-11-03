import { randomUUID } from 'node:crypto';
import { charges, createTenantDb, labTests, nextCode, orders, patients, prices, procedures } from '@clinic/db';
import {
  ORDER_STATUSES,
  type ArrivalResult,
  type EncounterDetail,
  type EncounterOrders,
  type OrderableItems,
  type OrderLabOptions,
  type OrderPreview,
  type OrderSaved,
  type OrdersCreated,
} from '@clinic/shared';
import { ORDER_STATUS_VALUES } from '@clinic/db';
import { eq, inArray } from 'drizzle-orm';
import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { FixedClock } from '../src/clock.ts';
import { createStaff, NORTE, readAudit, signedInWithContext, startApp, type Client, type TestApp } from './support.ts';

// T-025: órdenes con su cargo y laboratorio sugerido (S-CLI-17, 18 y 21), con el reloj fijado.
//  - El cargo nace con el precio propio de la sede si lo hay, o con el
//    general (precios fechados; 11:59 p. m. y 12:01 a. m. de la sede).
//  - Si falla el cargo, no queda la orden.
//  - Tres pruebas en una sola orden con el laboratorio más barato; con
//    seguro, sin sugerencia.
//  - Ninguna respuesta a Enfermería ni al Proveedor contiene costos.
//  - Cancelar anula el cargo y, si era la última orden abierta en
//    «Procedimiento pendiente», la visita pasa sola a «Listo para caja».
//  - Solo el rol Proveedor crea (ADR 0033); cancela el que la ordenó.
//  - «Cambiar laboratorio…» con motivo, auditado.

/** 5 nov 2026, 10:00 a. m. en Chicago (NOR1). */
const NOW = '2026-11-05T16:00:00Z';
/** 11:59 p. m. del 5 y 12:01 a. m. del 6 de noviembre en Chicago (CST, UTC−6). */
const BEFORE_MIDNIGHT = '2026-11-06T05:59:00Z';
const AFTER_MIDNIGHT = '2026-11-06T06:01:00Z';

const NOTES = 'Nota ficticia de la orden kappa';
/** Precio que el disparador de la prueba de atomicidad hace fallar al insertar el cargo. */
const FAILING_PRICE = 424_242;
/** Costos de la semilla de Norte (DEMO_LABS): ninguno debe aparecer en las respuestas clínicas. */
const NORTE_COSTS = [1200, 1500, 1800, 900, 1900, 2100, 1100, 1400];

describe('T-025 órdenes', () => {
  const clock = new FixedClock(NOW);
  let app: TestApp;
  let recepcion: Client;
  let enfermeria: Client;
  let proveedor: Client;
  let otroProveedor: Client;
  let adminSinRol: Client;
  let adminConRecepcion: Client;
  let counter = 0;
  let operator: pg.Client;
  const lab: Record<string, string> = {};
  let procedure = '';
  let failing = '';
  /** Todas las respuestas que recibieron Enfermería y Proveedor, para buscar costos. */
  const clinicalBodies: string[] = [];
  const db = () => createTenantDb(app.pool);

  beforeAll(async () => {
    app = await startApp({}, { clock });
    recepcion = await signedInWithContext(app, await createStaff(app, 'or-rec', [{ org: NORTE, location: 0, role: 'recepcion' }]), NORTE, 0);
    enfermeria = await signedInWithContext(app, await createStaff(app, 'or-enf', [{ org: NORTE, location: 0, role: 'enfermeria' }]), NORTE, 0);
    proveedor = await signedInWithContext(app, await createStaff(app, 'or-prov', [{ org: NORTE, location: 0, role: 'proveedor' }]), NORTE, 0);
    otroProveedor = await signedInWithContext(app, await createStaff(app, 'or-prov2', [{ org: NORTE, location: 0, role: 'proveedor' }]), NORTE, 0);
    adminSinRol = await signedInWithContext(app, await createStaff(app, 'or-admin', [{ org: NORTE, location: null, role: 'administrador' }]), NORTE, 0, { mfa: true });
    adminConRecepcion = await signedInWithContext(
      app,
      await createStaff(app, 'or-admin-rec', [
        { org: NORTE, location: null, role: 'administrador' },
        { org: NORTE, location: 0, role: 'recepcion' },
      ]),
      NORTE,
      0,
      { mfa: true },
    );
    for (const client of [enfermeria, proveedor, otroProveedor]) {
      const original = client.request.bind(client);
      client.request = async (...args: Parameters<Client['request']>) => {
        const response = await original(...args);
        clinicalBodies.push(response.body);
        return response;
      };
    }
    // Pruebas de la semilla, por código.
    const tests = await db().withTenant(NORTE.id, (tx) => tx.select({ id: labTests.id, code: labTests.code }).from(labTests));
    for (const t of tests) lab[t.code] = t.id;
    // Un procedimiento propio con precios fechados (ADR 0029): general 10,10 y,
    // desde el 6 de noviembre, 15,10; NOR1 tiene 13,10 desde el 6 y vuelve al
    // general desde el 7.
    const suffix = randomUUID().slice(0, 6).toUpperCase();
    await db().withTenant(NORTE.id, async (tx) => {
      procedure = uuidv7();
      failing = uuidv7();
      await tx.insert(procedures).values([
        { id: procedure, organizationId: NORTE.id, code: `PROC-T025-${suffix}`, name: 'Procedimiento ficticio T-025', kind: 'procedure' },
        { id: failing, organizationId: NORTE.id, code: `PROC-FAIL-${suffix}`, name: 'Procedimiento que falla', kind: 'procedure' },
      ]);
      const nor1 = NORTE.locations[0].id;
      await tx.insert(prices).values([
        { organizationId: NORTE.id, locationId: null, procedureId: procedure, amountCents: 1010, effectiveFrom: '2026-01-01' },
        { organizationId: NORTE.id, locationId: null, procedureId: procedure, amountCents: 1510, effectiveFrom: '2026-11-06' },
        { organizationId: NORTE.id, locationId: nor1, procedureId: procedure, amountCents: 1310, effectiveFrom: '2026-11-06' },
        { organizationId: NORTE.id, locationId: nor1, procedureId: procedure, amountCents: null, effectiveFrom: '2026-11-07' },
        { organizationId: NORTE.id, locationId: null, procedureId: failing, amountCents: FAILING_PRICE, effectiveFrom: '2026-01-01' },
      ]);
    });
    // Un cargo que falla dentro de la transacción (atomicidad): disparador de prueba.
    operator = new pg.Client({ connectionString: inject('operatorUrl') });
    await operator.connect();
    await operator.query(`
      create or replace function app.t025_fail_charge() returns trigger language plpgsql as $$
      begin
        if new.unit_price_cents = ${String(FAILING_PRICE)} then raise exception 'cargo ficticio que falla'; end if;
        return new;
      end $$;
      create trigger t025_fail_charge before insert on app.charges for each row execute function app.t025_fail_charge();`);
  });
  afterAll(async () => {
    await operator.query('drop trigger if exists t025_fail_charge on app.charges; drop function if exists app.t025_fail_charge();');
    await operator.end();
    await app.close();
  });

  async function newPatient(): Promise<string> {
    return db().withTenant(NORTE.id, async (tx) => {
      const id = uuidv7();
      await tx.insert(patients).values({
        id,
        organizationId: NORTE.id,
        registeredLocationId: NORTE.locations[0].id,
        code: await nextCode(tx, NORTE.id, 'patient'),
        firstName: 'Prueba',
        lastName: `Órdenes ${String((counter += 1))}`,
        birthDate: '1990-11-05',
      });
      return id;
    });
  }

  const key = () => `or-${String(Date.now())}-${String((counter += 1))}`;

  /** Abre una visita sin cita en NOR1 (ruta directa por defecto: acepta órdenes en «Registrado»). */
  async function arrive(options: { route?: string; insurance?: boolean } = {}): Promise<{ id: string; version: number }> {
    const coverage = options.insurance ? { type: 'insurance', insurerName: 'Aseguradora ficticia', memberId: null, term: 'copay', value: '20.00' } : { type: 'self_pay' };
    const response = await recepcion.post(
      '/api/encounters',
      { source: 'walk_in', patientId: await newPatient(), appointmentTypeId: null, route: options.route ?? 'PROCEDURE_ONLY', coverage },
      { 'idempotency-key': key() },
    );
    expect(response.statusCode, response.body).toBe(201);
    const { encounter } = response.json<ArrivalResult>();
    return { id: encounter.id, version: encounter.version };
  }

  const create = (client: Client, encounterId: string, body: unknown, idempotencyKey = key()) =>
    client.post(`/api/encounters/${encounterId}/orders`, body, { 'idempotency-key': idempotencyKey });
  const created = async (encounterId: string, body: unknown) => {
    const response = await create(proveedor, encounterId, body);
    expect(response.statusCode, response.body).toBe(201);
    return response.json<OrdersCreated>().orders;
  };
  const list = async (client: Client, encounterId: string) => {
    const response = await client.get(`/api/encounters/${encounterId}/orders`);
    expect(response.statusCode, response.body).toBe(200);
    return response.json<EncounterOrders>();
  };
  const chargesOf = (orderIds: string[]) => db().withTenant(NORTE.id, (tx) => tx.select().from(charges).where(inArray(charges.orderId, orderIds)));
  const code = (response: { json: () => unknown }) => (response.json() as { code: string }).code;
  const procedureLine = (quantity = 1) => ({ type: 'procedure', lines: [{ itemId: procedure, quantity }] });

  it('los estados de la orden son los de la base', () => {
    expect([...ORDER_STATUSES]).toEqual([...ORDER_STATUS_VALUES]);
  });

  it('un servicio sin precio vigente en la sede no se puede ordenar (409 price_unavailable) y no deja orden', async () => {
    clock.set(NOW);
    const unpriced = uuidv7();
    await db().withTenant(NORTE.id, (tx) =>
      tx.insert(procedures).values({ id: unpriced, organizationId: NORTE.id, code: `PROC-NOPRICE-${randomUUID().slice(0, 6).toUpperCase()}`, name: 'Procedimiento sin precio', kind: 'procedure' }),
    );
    const v = await arrive();
    const orderable = (await proveedor.get(`/api/encounters/${v.id}/orderables?type=procedure`)).json<OrderableItems>();
    expect(orderable.items.find((i) => i.id === unpriced)?.unitPriceCents).toBeNull();
    const response = await create(proveedor, v.id, { type: 'procedure', lines: [{ itemId: unpriced, quantity: 1 }] });
    expect([response.statusCode, code(response)]).toEqual([409, 'price_unavailable']);
    expect((await list(proveedor, v.id)).orders).toEqual([]);
  });

  it('el cargo nace con el precio vigente en la sede el día de la sede: general, propio de la sede y «Usa el precio general»', async () => {
    const charged = async (instant: string) => {
      clock.set(instant);
      const v = await arrive();
      const [order] = await created(v.id, procedureLine(2));
      if (!order) throw new Error('sin orden');
      expect(order.code).toMatch(/^NOR1-O-\d{6}$/);
      const [charge] = await chargesOf([order.id]);
      return charge;
    };
    // 11:59 p. m. del 5 en Chicago: aún rige el general de siempre.
    expect(await charged(BEFORE_MIDNIGHT)).toMatchObject({ unitPriceCents: 1010, quantity: 2, amountCents: 2020, priceDate: '2026-11-05', status: 'active' });
    // 12:01 a. m. del 6: rige el propio de NOR1 (no el general nuevo).
    expect(await charged(AFTER_MIDNIGHT)).toMatchObject({ unitPriceCents: 1310, amountCents: 2620, priceDate: '2026-11-06' });
    // El 7, NOR1 «Usa el precio general»: el general vigente.
    expect(await charged('2026-11-07T16:00:00Z')).toMatchObject({ unitPriceCents: 1510, amountCents: 3020, priceDate: '2026-11-07' });
    clock.set(NOW);
  });

  it('el catálogo y el «Cargo estimado» los calcula el servidor', async () => {
    clock.set(AFTER_MIDNIGHT);
    const v = await arrive();
    const items = (await proveedor.get(`/api/encounters/${v.id}/orderables?type=procedure`)).json<OrderableItems>();
    expect(items.date).toBe('2026-11-06');
    expect(items.items.find((i) => i.id === procedure)).toMatchObject({ unitPriceCents: 1310 });
    // Inyección y Procedimiento son listas distintas del mismo catálogo.
    const injections = (await proveedor.get(`/api/encounters/${v.id}/orderables?type=injection`)).json<OrderableItems>();
    expect(injections.items.map((i) => i.code)).toContain('INJ-B12');
    expect(injections.items.map((i) => i.id)).not.toContain(procedure);
    const preview = await proveedor.post(`/api/encounters/${v.id}/orders/preview`, procedureLine(3));
    expect(preview.statusCode, preview.body).toBe(200);
    expect(preview.json<OrderPreview>()).toMatchObject({ totalCents: 3930, lab: null, lines: [{ unitPriceCents: 1310, quantity: 3, amountCents: 3930 }] });
    clock.set(NOW);
  });

  it('si falla el cargo, no queda la orden ni se gasta el código; la clave se puede reintentar', async () => {
    const before = await arrive();
    const [a] = await created(before.id, procedureLine());
    const v = await arrive();
    const k = key();
    const failed = { type: 'procedure', lines: [{ itemId: failing, quantity: 1 }] };
    expect((await create(proveedor, v.id, failed, k)).statusCode).toBe(500);
    expect(await db().withTenant(NORTE.id, (tx) => tx.select().from(orders).where(eq(orders.encounterId, v.id)))).toEqual([]);
    expect((await create(proveedor, v.id, failed, k)).statusCode).toBe(500);
    const [b] = await created(v.id, procedureLine());
    expect(Number(b?.code.slice(-6))).toBe(Number(a?.code.slice(-6)) + 1);
  });

  it('tres pruebas salen en una sola orden con el laboratorio más barato; una sin laboratorio va aparte', async () => {
    const v = await arrive({ route: 'LAB_ONLY' });
    const body = { type: 'lab', lines: ['LAB-A1C', 'LAB-TSH', 'LAB-PSA'].map((c) => ({ itemId: lab[c], quantity: 1 })) };
    const preview = (await proveedor.post(`/api/encounters/${v.id}/orders/preview`, body)).json<OrderPreview>();
    expect(preview.totalCents).toBe(3500 + 4500 + 5000);
    expect(preview.lab?.coverage).toBe('self_pay');
    expect(preview.lab?.groups).toHaveLength(1);
    expect(preview.lab?.groups[0]?.suggested?.name).toBe('LabCorp');
    expect(preview.lab?.groups[0]?.options.map((o) => o.name)).toEqual(['LabCorp', 'CPL']);
    const made = await created(v.id, { ...body, notes: NOTES });
    expect(made).toHaveLength(1);
    const view = await list(proveedor, v.id);
    expect(view.orders[0]).toMatchObject({ type: 'lab', status: 'PENDING', lab: { name: 'LabCorp' }, estimateCents: 13000, notes: NOTES, assignedTo: null });
    expect(view.orders[0]?.items.map((i) => i.code)).toEqual(['LAB-A1C', 'LAB-TSH', 'LAB-PSA']);
    expect(await chargesOf([made[0]?.id ?? ''])).toHaveLength(3);

    const v2 = await arrive({ route: 'LAB_ONLY' });
    const withStrep = await created(v2.id, { type: 'lab', lines: ['LAB-STREP', 'LAB-A1C'].map((c) => ({ itemId: lab[c], quantity: 1 })) });
    expect(withStrep).toHaveLength(2);
    const labs = (await list(proveedor, v2.id)).orders.map((o) => ({ items: o.items.map((i) => i.code), lab: o.lab?.name ?? null }));
    expect(labs).toEqual(expect.arrayContaining([{ items: ['LAB-STREP'], lab: null }, { items: ['LAB-A1C'], lab: 'CPL' }]));
  });

  it('con seguro no se sugiere: el Proveedor puede elegir uno de los que las hacen todas o dejarla sin laboratorio', async () => {
    const v = await arrive({ route: 'LAB_ONLY', insurance: true });
    const body = { type: 'lab', lines: ['LAB-A1C', 'LAB-PSA'].map((c) => ({ itemId: lab[c], quantity: 1 })) };
    const preview = (await proveedor.post(`/api/encounters/${v.id}/orders/preview`, body)).json<OrderPreview>();
    expect(preview.lab).toMatchObject({ coverage: 'insurance', groups: [{ suggested: null }] });
    expect(preview.lab?.groups[0]?.options.map((o) => o.name)).toEqual(['LabCorp', 'CPL']);
    const [none] = await created(v.id, body);
    // Elegir es opcional y no es un cambio: sin motivo.
    const cpl = preview.lab?.groups[0]?.options.find((o) => o.name === 'CPL')?.id ?? '';
    const [chosen] = await created(v.id, { ...body, labGroups: [{ labTestIds: [lab['LAB-A1C'], lab['LAB-PSA']], labProviderId: cpl }] });
    const quest = (await proveedor.post(`/api/encounters/${v.id}/orders/preview`, { type: 'lab', lines: [{ itemId: lab['LAB-A1C'], quantity: 1 }] })).json<OrderPreview>()
      .lab?.groups[0]?.options.find((o) => o.name === 'Quest Diagnostics')?.id;
    // Quest no hace PSA: no es una opción.
    const invalid = await create(proveedor, v.id, { ...body, labGroups: [{ labTestIds: [lab['LAB-A1C'], lab['LAB-PSA']], labProviderId: quest }] });
    expect([invalid.statusCode, code(invalid)]).toEqual([409, 'invalid_lab']);
    const view = await list(proveedor, v.id);
    expect(view.orders.find((o) => o.id === none?.id)?.lab).toBeNull();
    expect(view.orders.find((o) => o.id === chosen?.id)?.lab?.name).toBe('CPL');
  });

  it('cambiar el laboratorio sugerido al crear exige motivo y queda auditado', async () => {
    const v = await arrive({ route: 'LAB_ONLY' });
    const tests = [lab['LAB-A1C'] ?? '', lab['LAB-TSH'] ?? ''];
    const preview = (await proveedor.post(`/api/encounters/${v.id}/orders/preview`, { type: 'lab', lines: tests.map((itemId) => ({ itemId, quantity: 1 })) })).json<OrderPreview>();
    const group = preview.lab?.groups[0];
    expect(group?.suggested?.name).toBe('Quest Diagnostics');
    const labcorp = group?.options.find((o) => o.name === 'LabCorp')?.id ?? null;
    const body = { type: 'lab', lines: tests.map((itemId) => ({ itemId, quantity: 1 })), labGroups: [{ labTestIds: tests, labProviderId: labcorp }] };
    const missing = await create(proveedor, v.id, body);
    expect([missing.statusCode, code(missing)]).toEqual([400, 'lab_change_reason_required']);
    const [order] = await created(v.id, { ...body, labChangeReason: 'Preferencia ficticia del paciente' });
    const [audit] = await readAudit(`action = 'order.created' and entity_id = $1`, [order?.id]);
    expect(audit).toMatchObject({ reason: 'Preferencia ficticia del paciente', metadata: { labChanged: true, labAssigned: true } });
    // Los grupos deben ser los del servidor.
    const stale = await create(proveedor, v.id, { ...body, labGroups: [{ labTestIds: [tests[0]], labProviderId: null }], labChangeReason: 'x' });
    expect([stale.statusCode, code(stale)]).toEqual([409, 'lab_groups_changed']);
  });

  it('«Cambiar laboratorio…»: Enfermería elige el de una orden sin laboratorio, con motivo y versión; solo los que hacen todas', async () => {
    const v = await arrive({ route: 'LAB_ONLY', insurance: true });
    const [order] = await created(v.id, { type: 'lab', lines: ['LAB-A1C', 'LAB-PSA'].map((c) => ({ itemId: lab[c], quantity: 1 })) });
    if (!order) throw new Error('sin orden');
    const options = (await enfermeria.get(`/api/orders/${order.id}/lab-options`)).json<OrderLabOptions>();
    expect(options.current).toBeNull();
    expect(options.options.map((o) => o.name)).toEqual(['LabCorp', 'CPL']);
    expect((await list(enfermeria, v.id)).orders[0]?.abilities.changeLab).toBe(true);
    const labcorp = options.options[0]?.id ?? '';
    const noReason = await enfermeria.post(`/api/orders/${order.id}/lab`, { labProviderId: labcorp, expectedVersion: 1 });
    expect(noReason.statusCode).toBe(400);
    const ok = await enfermeria.post(`/api/orders/${order.id}/lab`, { labProviderId: labcorp, reason: 'Red del seguro ficticio', expectedVersion: 1 });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json<OrderSaved>().order.version).toBe(2);
    const stale = await enfermeria.post(`/api/orders/${order.id}/lab`, { labProviderId: options.options[1]?.id, reason: 'Otra', expectedVersion: 1 });
    expect([stale.statusCode, code(stale)]).toEqual([409, 'version_conflict']);
    const [audit] = await readAudit(`action = 'order.lab_changed' and entity_id = $1`, [order.id]);
    expect(audit).toMatchObject({ reason: 'Red del seguro ficticio', metadata: { previousLabProviderId: 'none', labProviderId: labcorp } });
    // Recepción no lo cambia.
    expect((await recepcion.post(`/api/orders/${order.id}/lab`, { labProviderId: labcorp, reason: 'x', expectedVersion: 2 })).statusCode).toBe(403);
  });

  it('solo el rol Proveedor crea órdenes (ADR 0033), y solo en los estados que las aceptan', async () => {
    const v = await arrive();
    for (const client of [recepcion, enfermeria, adminSinRol, adminConRecepcion]) {
      expect((await create(client, v.id, procedureLine())).statusCode).toBe(403);
      expect((await client.post(`/api/encounters/${v.id}/orders/preview`, procedureLine())).statusCode).toBe(403);
    }
    expect((await list(recepcion, v.id)).canCreate).toBe(false);
    expect((await list(proveedor, v.id)).canCreate).toBe(true);
    // Estándar en «Registrado»: no acepta órdenes.
    const standard = await arrive({ route: 'STANDARD' });
    const refused = await create(proveedor, standard.id, procedureLine());
    expect([refused.statusCode, code(refused)]).toEqual([409, 'encounter_not_orderable']);
    expect((await list(proveedor, standard.id)).orderable).toBe(false);
  });

  it('Idempotency-Key: la misma clave devuelve la misma orden; con otro contenido, 409', async () => {
    const v = await arrive();
    const k = key();
    const first = await create(proveedor, v.id, procedureLine(), k);
    const again = await create(proveedor, v.id, procedureLine(), k);
    expect(again.json<OrdersCreated>()).toEqual(first.json<OrdersCreated>());
    expect((await list(proveedor, v.id)).orders).toHaveLength(1);
    const other = await create(proveedor, v.id, procedureLine(2), k);
    expect([other.statusCode, code(other)]).toEqual([409, 'idempotency_key_reused']);
    expect((await proveedor.post(`/api/encounters/${v.id}/orders`, procedureLine())).statusCode).toBe(400);
  });

  it('órdenes abiertas bloquean «Listo para caja» (S-CLI-08); cancelar la última en «Procedimiento pendiente» anula su cargo y la visita pasa sola', async () => {
    const v = await arrive();
    const [first] = await created(v.id, procedureLine());
    const [second] = await created(v.id, { ...procedureLine(), notes: NOTES });
    if (!first || !second) throw new Error('sin órdenes');
    const sent = await recepcion.post(`/api/encounters/${v.id}/transition`, { action: 'send_to_procedure', expectedVersion: 1 });
    expect(sent.statusCode, sent.body).toBe(200);
    const blocked = await enfermeria.post(`/api/encounters/${v.id}/transition`, { action: 'ready_for_checkout', expectedVersion: 2 });
    expect([blocked.statusCode, code(blocked)]).toEqual([409, 'open_orders']);

    const cancel = (client: Client, orderId: string, body: unknown, k = key()) => client.post(`/api/orders/${orderId}/cancel`, body, { 'idempotency-key': k });
    // Enfermería no cancela; otro proveedor que no la ordenó ni es el de la visita, tampoco.
    expect((await cancel(enfermeria, first.id, { reason: 'x', expectedVersion: 1 })).statusCode).toBe(403);
    const notOwned = await cancel(otroProveedor, first.id, { reason: 'x', expectedVersion: 1 });
    expect([notOwned.statusCode, code(notOwned)]).toEqual([403, 'order_not_owned']);
    expect((await list(otroProveedor, v.id)).orders.every((o) => !o.abilities.cancel)).toBe(true);
    expect((await cancel(proveedor, first.id, { expectedVersion: 1 })).statusCode).toBe(400);

    const k = key();
    const one = await cancel(proveedor, first.id, { reason: 'Motivo ficticio uno', expectedVersion: 1 }, k);
    expect(one.statusCode, one.body).toBe(200);
    expect(one.json<OrderSaved>()).toMatchObject({ order: { status: 'CANCELLED', version: 2 }, encounter: { status: 'PROCEDURE_PENDING' } });
    // Repetición con la misma clave: la misma respuesta, sin volver a cancelar.
    expect((await cancel(proveedor, first.id, { reason: 'Motivo ficticio uno', expectedVersion: 1 }, k)).json<OrderSaved>()).toEqual(one.json<OrderSaved>());
    const closed = await cancel(proveedor, first.id, { reason: 'Otra vez', expectedVersion: 2 });
    expect([closed.statusCode, code(closed)]).toEqual([409, 'order_closed']);
    expect((await chargesOf([first.id])).map((c) => c.status)).toEqual(['voided']);
    expect((await chargesOf([second.id])).map((c) => c.status)).toEqual(['active']);

    const two = await cancel(proveedor, second.id, { reason: 'Motivo ficticio dos', expectedVersion: 1 });
    expect(two.json<OrderSaved>().encounter).toMatchObject({ status: 'READY_FOR_CHECKOUT', version: 3 });
    const detail = (await proveedor.get(`/api/encounters/${v.id}`)).json<EncounterDetail>();
    expect(detail.timeline[0]).toMatchObject({ action: 'ready_for_checkout', fromStatus: 'PROCEDURE_PENDING', toStatus: 'READY_FOR_CHECKOUT', actor: { kind: 'system' } });

    const view = await list(proveedor, v.id);
    expect(view.orders.map((o) => o.status)).toEqual(['CANCELLED', 'CANCELLED']);
    expect(view.orders.find((o) => o.id === first.id)).toMatchObject({ cancelReason: 'Motivo ficticio uno', estimateCents: 1010 });
    // Recepción: solo lectura, sin notas ni motivos clínicos.
    const reception = await list(recepcion, v.id);
    expect(reception.orders.every((o) => o.notes === null && o.cancelReason === null && !o.abilities.cancel && !o.abilities.changeLab)).toBe(true);
  });

  it('ninguna respuesta a Enfermería ni al Proveedor contiene costos de laboratorio', () => {
    expect(clinicalBodies.length).toBeGreaterThan(20);
    for (const body of clinicalBodies) {
      expect(body).not.toMatch(/cost/i);
      const numbers: number[] = [];
      JSON.parse(body || 'null', (_k, value: unknown) => {
        if (typeof value === 'number') numbers.push(value);
        return value;
      });
      for (const cents of NORTE_COSTS) expect(numbers, body).not.toContain(cents);
    }
  });

  it('la auditoría no contiene el texto de las notas ni de los motivos fuera del campo «motivo»', async () => {
    const rows = await readAudit(`action in ('order.created', 'order.cancelled', 'charge.created', 'charge.voided', 'encounter.orders_view')`);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(JSON.stringify(row.metadata)).not.toContain(NOTES);
    expect(rows.some((r) => r.action === 'order.created' && r.metadata?.fields === 'notes')).toBe(true);
  });
});
