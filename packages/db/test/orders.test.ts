import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { labProviders, procedures } from '../src/catalog-schema.ts';
import { encounters } from '../src/encounters-schema.ts';
import { memberships } from '../src/identity-schema.ts';
import { charges, orderItems, orders } from '../src/orders-schema.ts';
import { DEMO } from '../src/seed.ts';
import { createTenantDb, type TenantDb } from '../src/with-tenant.ts';
import { expectPgError, SQLSTATE } from './helpers.ts';

// T-025: órdenes, sus líneas y sus cargos. Aislamiento con el rol real
// (clinic_app) y un pool: cada organización ve y escribe solo lo suyo y nada
// apunta a otra. Nada se borra; del cargo solo se cambia la anulación y de la
// orden, su estado, asignación, laboratorio y cancelación. Reglas: centavos
// ≥ 0, importe = precio × cantidad, cantidad 1 a 1000, un cargo por línea.

const NORTE = DEMO.norte;
const SUR = DEMO.sur;
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

type Org = typeof NORTE | typeof SUR;

describe('órdenes y cargos', () => {
  let pool: pg.Pool;
  let db: TenantDb;
  let nextPatient = 0;
  const member: Record<string, string> = {};
  const procedure: Record<string, string> = {};
  const lab: Record<string, string> = {};

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 10 });
    db = createTenantDb(pool);
    // Un proveedor ficticio en cada organización (quien ordena).
    for (const org of [NORTE, SUR]) {
      const userId = randomUUID();
      await pool.query(
        `insert into auth."user" (id, name, email, email_verified, created_at, updated_at) values ($1, $2, $3, true, now(), now())`,
        [userId, 'Proveedor ficticio', `prov.${userId}@example.test`],
      );
      const id = randomUUID();
      await db.withTenant(org.id, (tx) => tx.insert(memberships).values({ id, organizationId: org.id, userId }));
      member[org.id] = id;
      const [p] = await db.withTenant(org.id, (tx) => tx.select({ id: procedures.id }).from(procedures).limit(1));
      const [l] = await db.withTenant(org.id, (tx) => tx.select({ id: labProviders.id }).from(labProviders).limit(1));
      if (!p || !l) throw new Error('semilla sin catálogo');
      procedure[org.id] = p.id;
      lab[org.id] = l.id;
    }
  });
  afterAll(async () => {
    await pool.end();
  });

  const by = (org: Org) => member[org.id] ?? '';
  const now = new Date('2026-11-02T15:30:00Z');

  /** Una visita cerrada de un paciente de la semilla. */
  async function visit(org: Org): Promise<string> {
    const patient = org.patients[(nextPatient += 1) % org.patients.length];
    if (!patient) throw new Error('sin paciente');
    const [row] = await db.withTenant(org.id, (tx) =>
      tx
        .insert(encounters)
        .values({
          organizationId: org.id,
          locationId: org.locations[0].id,
          patientId: patient.id,
          code: `${org.locations[0].code}-V-8${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`,
          source: 'walk_in',
          route: 'STANDARD',
          status: 'CANCELLED',
          arrivedAt: now,
          closedAt: now,
        })
        .returning({ id: encounters.id }),
    );
    if (!row) throw new Error('sin visita');
    return row.id;
  }

  const order = (org: Org, encounterId: string, extra: Partial<typeof orders.$inferInsert> = {}): typeof orders.$inferInsert => ({
    organizationId: org.id,
    locationId: org.locations[0].id,
    encounterId,
    code: `${org.locations[0].code}-O-9${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`,
    type: 'procedure',
    orderedByMembershipId: by(org),
    orderedAt: now,
    ...extra,
  });
  const item = (org: Org, orderId: string, extra: Partial<typeof orderItems.$inferInsert> = {}): typeof orderItems.$inferInsert => ({
    organizationId: org.id,
    orderId,
    procedureId: procedure[org.id] ?? '',
    quantity: 2,
    itemCode: 'INJ-B12',
    itemName: 'Inyección ficticia',
    ...extra,
  });
  const charge = (org: Org, ids: { encounterId: string; orderId: string; orderItemId: string }, extra: Partial<typeof charges.$inferInsert> = {}): typeof charges.$inferInsert => ({
    organizationId: org.id,
    locationId: org.locations[0].id,
    ...ids,
    procedureId: procedure[org.id] ?? '',
    itemCode: 'INJ-B12',
    itemName: 'Inyección ficticia',
    unitPriceCents: 2000,
    quantity: 2,
    amountCents: 4000,
    priceDate: '2026-11-02',
    createdByMembershipId: by(org),
    createdAt: now,
    ...extra,
  });

  /** Orden, línea y cargo de una visita nueva. */
  async function full(org: Org) {
    const encounterId = await visit(org);
    return db.withTenant(org.id, async (tx) => {
      const [o] = await tx.insert(orders).values(order(org, encounterId)).returning({ id: orders.id });
      if (!o) throw new Error('sin orden');
      const [i] = await tx.insert(orderItems).values(item(org, o.id)).returning({ id: orderItems.id });
      if (!i) throw new Error('sin línea');
      const [c] = await tx.insert(charges).values(charge(org, { encounterId, orderId: o.id, orderItemId: i.id })).returning({ id: charges.id });
      if (!c) throw new Error('sin cargo');
      return { encounterId, orderId: o.id, orderItemId: i.id, chargeId: c.id };
    });
  }

  it('cada organización ve solo sus órdenes, líneas y cargos; sin contexto no se ve nada', async () => {
    const n = await full(NORTE);
    expect(await db.withTenant(NORTE.id, (tx) => tx.select().from(orders).where(eq(orders.id, n.orderId)))).toHaveLength(1);
    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(orders).where(eq(orders.id, n.orderId)))).toEqual([]);
    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(orderItems).where(eq(orderItems.id, n.orderItemId)))).toEqual([]);
    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(charges).where(eq(charges.id, n.chargeId)))).toEqual([]);
    for (const name of ['orders', 'order_items', 'charges']) {
      expect((await pool.query(`select * from app.${name}`)).rows).toEqual([]);
    }
    const updated = await db.withTenant(SUR.id, (tx) => tx.update(orders).set({ status: 'COMPLETED' }).where(eq(orders.id, n.orderId)).returning({ id: orders.id }));
    expect(updated).toEqual([]);
  });

  it('no se escribe en otra organización ni se apunta a sus visitas, órdenes, catálogo, laboratorios o membresías', async () => {
    const n = await full(NORTE);
    const surVisit = await visit(SUR);
    await expectPgError(db.withTenant(SUR.id, (tx) => tx.insert(orders).values(order(NORTE, n.encounterId))), SQLSTATE.insufficientPrivilege);
    await expectPgError(db.withTenant(SUR.id, (tx) => tx.insert(orders).values(order(SUR, n.encounterId))), SQLSTATE.foreignKeyViolation);
    await expectPgError(db.withTenant(SUR.id, (tx) => tx.insert(orders).values(order(SUR, surVisit, { orderedByMembershipId: by(NORTE) }))), SQLSTATE.foreignKeyViolation);
    await expectPgError(
      db.withTenant(SUR.id, (tx) => tx.insert(orders).values(order(SUR, surVisit, { type: 'lab', labProviderId: lab[NORTE.id] ?? '' }))),
      SQLSTATE.foreignKeyViolation,
    );
    await expectPgError(db.withTenant(SUR.id, (tx) => tx.insert(orderItems).values(item(SUR, n.orderId, { procedureId: procedure[SUR.id] ?? '' }))), SQLSTATE.foreignKeyViolation);
    const [surOrder] = await db.withTenant(SUR.id, (tx) => tx.insert(orders).values(order(SUR, surVisit)).returning({ id: orders.id }));
    if (!surOrder) throw new Error('sin orden');
    await expectPgError(db.withTenant(SUR.id, (tx) => tx.insert(orderItems).values(item(SUR, surOrder.id, { procedureId: procedure[NORTE.id] ?? '' }))), SQLSTATE.foreignKeyViolation);
    await expectPgError(
      db.withTenant(SUR.id, (tx) => tx.insert(charges).values(charge(SUR, { encounterId: surVisit, orderId: surOrder.id, orderItemId: n.orderItemId }))),
      SQLSTATE.foreignKeyViolation,
    );
  });

  it('nada se borra; del cargo solo se cambia la anulación y de la orden ni el código, ni el tipo, ni la visita; las líneas no cambian', async () => {
    const n = await full(NORTE);
    for (const table of [orders, orderItems, charges]) {
      await expectPgError(db.withTenant(NORTE.id, (tx) => tx.delete(table).where(eq(table.organizationId, NORTE.id))), SQLSTATE.insufficientPrivilege);
    }
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.update(charges).set({ amountCents: 1 }).where(eq(charges.id, n.chargeId))), SQLSTATE.insufficientPrivilege);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.update(charges).set({ unitPriceCents: 1 }).where(eq(charges.id, n.chargeId))), SQLSTATE.insufficientPrivilege);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.update(orders).set({ code: 'NOR1-O-999999' }).where(eq(orders.id, n.orderId))), SQLSTATE.insufficientPrivilege);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.update(orders).set({ type: 'lab' }).where(eq(orders.id, n.orderId))), SQLSTATE.insufficientPrivilege);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.update(orderItems).set({ quantity: 3 }).where(eq(orderItems.id, n.orderItemId))), SQLSTATE.insufficientPrivilege);
    // Anular sí, con motivo, quién y cuándo.
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.update(charges).set({ status: 'voided' }).where(eq(charges.id, n.chargeId))), CHECK_VIOLATION);
    await db.withTenant(NORTE.id, (tx) =>
      tx.update(charges).set({ status: 'voided', voidReasonEnc: 'cifrado-ficticio', voidedByMembershipId: by(NORTE), voidedAt: now, version: 2 }).where(eq(charges.id, n.chargeId)),
    );
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.update(orders).set({ status: 'CANCELLED' }).where(eq(orders.id, n.orderId))), CHECK_VIOLATION);
    await db.withTenant(NORTE.id, (tx) =>
      tx.update(orders).set({ status: 'CANCELLED', cancelReasonEnc: 'cifrado-ficticio', cancelledByMembershipId: by(NORTE), cancelledAt: now, version: 2 }).where(eq(orders.id, n.orderId)),
    );
  });

  it('reglas: centavos ≥ 0, importe = precio × cantidad, cantidad 1 a 1000, un cargo por línea, un solo ítem por línea, código y laboratorio', async () => {
    const n = await full(NORTE);
    const ids = { encounterId: n.encounterId, orderId: n.orderId, orderItemId: n.orderItemId };
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(charges).values(charge(NORTE, ids))), UNIQUE_VIOLATION);
    const [other] = await db.withTenant(NORTE.id, (tx) => tx.insert(orderItems).values(item(NORTE, n.orderId)).returning({ id: orderItems.id }));
    if (!other) throw new Error('sin línea');
    const ids2 = { ...ids, orderItemId: other.id };
    for (const extra of [{ unitPriceCents: -1, amountCents: -2 }, { amountCents: 3999 }, { quantity: 0, amountCents: 0 }, { quantity: 1001, amountCents: 2_002_000 }]) {
      await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(charges).values(charge(NORTE, ids2, extra))), CHECK_VIOLATION);
    }
    await db.withTenant(NORTE.id, (tx) => tx.insert(charges).values(charge(NORTE, ids2, { unitPriceCents: 0, amountCents: 0 })));
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(orderItems).values(item(NORTE, n.orderId, { quantity: 0 }))), CHECK_VIOLATION);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(orderItems).values(item(NORTE, n.orderId, { procedureId: null }))), CHECK_VIOLATION);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(orders).values(order(NORTE, n.encounterId, { code: 'NOR1-V-000001' }))), CHECK_VIOLATION);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(orders).values(order(NORTE, n.encounterId, { labProviderId: lab[NORTE.id] ?? '' }))), CHECK_VIOLATION);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(orders).values(order(NORTE, n.encounterId, { status: 'DONE' }))), CHECK_VIOLATION);
  });

  it('T-026: iniciar y completar exigen quién y cuándo; no se apunta a personal de otra organización; las notas se pueden ampliar', async () => {
    const n = await full(NORTE);
    const set = (values: Partial<typeof orders.$inferInsert>) => db.withTenant(NORTE.id, (tx) => tx.update(orders).set(values).where(eq(orders.id, n.orderId)));
    // «En curso» sin quién ni cuándo; «Pendiente» con inicio; solo uno de los dos.
    await expectPgError(set({ status: 'IN_PROGRESS' }), CHECK_VIOLATION);
    await expectPgError(set({ startedAt: now, startedByMembershipId: by(NORTE) }), CHECK_VIOLATION);
    await expectPgError(set({ status: 'IN_PROGRESS', startedAt: now }), CHECK_VIOLATION);
    // Personal de otra organización: no.
    await expectPgError(set({ status: 'IN_PROGRESS', startedAt: now, startedByMembershipId: by(SUR) }), SQLSTATE.foreignKeyViolation);
    await set({ status: 'IN_PROGRESS', startedAt: now, startedByMembershipId: by(NORTE), version: 2 });
    // «Completada» sin quién ni cuándo, y completar sin estar completada.
    await expectPgError(set({ status: 'COMPLETED' }), CHECK_VIOLATION);
    await expectPgError(set({ completedAt: now, completedByMembershipId: by(NORTE) }), CHECK_VIOLATION);
    await expectPgError(set({ status: 'COMPLETED', completedAt: now, completedByMembershipId: by(SUR) }), SQLSTATE.foreignKeyViolation);
    await set({ status: 'COMPLETED', completedAt: now, completedByMembershipId: by(NORTE), notesEnc: 'cifrado-ficticio', version: 3 });
    // Otra organización no la ve ni la cambia.
    expect(await db.withTenant(SUR.id, (tx) => tx.update(orders).set({ notesEnc: 'x' }).where(eq(orders.id, n.orderId)).returning({ id: orders.id }))).toEqual([]);
    // Completada sin haberse iniciado: no.
    const m = await full(NORTE);
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.update(orders).set({ status: 'COMPLETED', completedAt: now, completedByMembershipId: by(NORTE) }).where(eq(orders.id, m.orderId))),
      CHECK_VIOLATION,
    );
  });
});
