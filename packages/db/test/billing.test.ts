import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ensureStatement, touchStatement } from '../src/billing.ts';
import { billingStatements } from '../src/billing-schema.ts';
import { consultations, procedures } from '../src/catalog-schema.ts';
import { encounters } from '../src/encounters-schema.ts';
import { memberships } from '../src/identity-schema.ts';
import { charges } from '../src/orders-schema.ts';
import { DEMO } from '../src/seed.ts';
import { createTenantDb, type TenantDb } from '../src/with-tenant.ts';
import { expectPgError, SQLSTATE } from './helpers.ts';

// T-027: estado de cuenta de la visita y cargos de Caja. Aislamiento con el
// rol real (clinic_app) y un pool: cada organización ve y escribe solo lo
// suyo. Del estado de cuenta solo sube la versión y nada se borra. Un cargo
// de Caja no tiene orden, apunta a un servicio del catálogo de su
// organización y solo una consulta puede ser de Caja.

const NORTE = DEMO.norte;
const SUR = DEMO.sur;
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

type Org = typeof NORTE | typeof SUR;

describe('estado de cuenta y cargos de Caja', () => {
  let pool: pg.Pool;
  let db: TenantDb;
  let nextPatient = 0;
  const member: Record<string, string> = {};
  const consultation: Record<string, string> = {};
  const procedure: Record<string, string> = {};

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 10 });
    db = createTenantDb(pool);
    for (const org of [NORTE, SUR]) {
      const userId = randomUUID();
      await pool.query(
        `insert into auth."user" (id, name, email, email_verified, created_at, updated_at) values ($1, $2, $3, true, now(), now())`,
        [userId, 'Recepción ficticia', `rec.${userId}@example.test`],
      );
      const id = randomUUID();
      await db.withTenant(org.id, (tx) => tx.insert(memberships).values({ id, organizationId: org.id, userId }));
      member[org.id] = id;
      const [c] = await db.withTenant(org.id, (tx) => tx.select({ id: consultations.id }).from(consultations).limit(1));
      const [p] = await db.withTenant(org.id, (tx) => tx.select({ id: procedures.id }).from(procedures).limit(1));
      if (!c || !p) throw new Error('semilla sin catálogo');
      consultation[org.id] = c.id;
      procedure[org.id] = p.id;
    }
  });
  afterAll(async () => {
    await pool.end();
  });

  const now = new Date('2026-11-04T15:30:00Z');
  const key = (org: Org, encounterId: string) => ({ organizationId: org.id, locationId: org.locations[0].id, encounterId });

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
          code: `${org.locations[0].code}-V-7${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`,
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

  const cashierCharge = (org: Org, encounterId: string, extra: Partial<typeof charges.$inferInsert> = {}): typeof charges.$inferInsert => ({
    organizationId: org.id,
    locationId: org.locations[0].id,
    encounterId,
    source: 'cashier',
    consultationId: consultation[org.id] ?? '',
    itemCode: 'CONS-FICT',
    itemName: 'Consulta ficticia',
    unitPriceCents: 6000,
    quantity: 1,
    amountCents: 6000,
    priceDate: '2026-11-04',
    createdByMembershipId: member[org.id] ?? '',
    createdAt: now,
    ...extra,
  });

  it('un estado de cuenta por visita: se crea al necesitarse, sube su versión y cada organización ve solo los suyos', async () => {
    const encounterId = await visit(NORTE);
    const first = await db.withTenant(NORTE.id, (tx) => ensureStatement(tx, key(NORTE, encounterId), now));
    expect(first.version).toBe(1);
    const again = await db.withTenant(NORTE.id, (tx) => ensureStatement(tx, key(NORTE, encounterId), now));
    expect(again).toEqual(first);
    const touched = await db.withTenant(NORTE.id, (tx) => touchStatement(tx, key(NORTE, encounterId), now));
    expect(touched).toEqual({ id: first.id, version: 2 });
    // Otra visita sin estado de cuenta: touch lo crea en la versión 1.
    const other = await visit(NORTE);
    expect((await db.withTenant(NORTE.id, (tx) => touchStatement(tx, key(NORTE, other), now))).version).toBe(1);

    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(billingStatements).where(eq(billingStatements.id, first.id)))).toEqual([]);
    expect((await pool.query('select * from app.billing_statements')).rows).toEqual([]);
    expect(await db.withTenant(SUR.id, (tx) => tx.update(billingStatements).set({ version: 9 }).where(eq(billingStatements.id, first.id)).returning({ id: billingStatements.id }))).toEqual([]);
  });

  it('no se escribe en otra organización ni se apunta a sus visitas; nada se borra; solo cambian la versión y la fecha', async () => {
    const encounterId = await visit(NORTE);
    const surVisit = await visit(SUR);
    const row = await db.withTenant(NORTE.id, (tx) => ensureStatement(tx, key(NORTE, encounterId), now));
    const values = (org: Org, encounter: string) => ({ organizationId: org.id, locationId: org.locations[0].id, encounterId: encounter, createdAt: now, updatedAt: now });
    await expectPgError(db.withTenant(SUR.id, (tx) => tx.insert(billingStatements).values(values(NORTE, surVisit))), SQLSTATE.insufficientPrivilege);
    await expectPgError(db.withTenant(SUR.id, (tx) => tx.insert(billingStatements).values(values(SUR, encounterId))), SQLSTATE.foreignKeyViolation);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(billingStatements).values(values(NORTE, encounterId))), UNIQUE_VIOLATION);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.delete(billingStatements).where(eq(billingStatements.id, row.id))), SQLSTATE.insufficientPrivilege);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.update(billingStatements).set({ encounterId: surVisit }).where(eq(billingStatements.id, row.id))), SQLSTATE.insufficientPrivilege);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.update(billingStatements).set({ version: 0 }).where(eq(billingStatements.id, row.id))), CHECK_VIOLATION);
  });

  it('cargo de Caja: sin orden, con un solo servicio del catálogo de su organización; solo las consultas exigen Caja', async () => {
    const encounterId = await visit(NORTE);
    const [c] = await db.withTenant(NORTE.id, (tx) => tx.insert(charges).values(cashierCharge(NORTE, encounterId)).returning({ id: charges.id }));
    expect(c).toBeDefined();
    // Un procedimiento también puede agregarse en Caja.
    await db.withTenant(NORTE.id, (tx) => tx.insert(charges).values(cashierCharge(NORTE, encounterId, { consultationId: null, procedureId: procedure[NORTE.id] ?? '' })));
    // Ningún servicio o dos a la vez: no.
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(charges).values(cashierCharge(NORTE, encounterId, { consultationId: null }))), CHECK_VIOLATION);
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.insert(charges).values(cashierCharge(NORTE, encounterId, { procedureId: procedure[NORTE.id] ?? '' }))),
      CHECK_VIOLATION,
    );
    // Origen «Orden» sin orden, o una consulta de origen «Orden»: no.
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(charges).values(cashierCharge(NORTE, encounterId, { source: 'order' }))), CHECK_VIOLATION);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(charges).values(cashierCharge(NORTE, encounterId, { source: 'manual' }))), CHECK_VIOLATION);
    // El servicio de otra organización: no.
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.insert(charges).values(cashierCharge(NORTE, encounterId, { consultationId: consultation[SUR.id] ?? '' }))),
      SQLSTATE.foreignKeyViolation,
    );
    // Otra organización no lo ve.
    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(charges).where(eq(charges.id, c?.id ?? '')))).toEqual([]);
    // El precio y el servicio del cargo no cambian.
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.update(charges).set({ itemCode: 'OTRO' }).where(eq(charges.id, c?.id ?? ''))), SQLSTATE.insufficientPrivilege);
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.update(charges).set({ consultationId: null }).where(eq(charges.id, c?.id ?? ''))),
      SQLSTATE.insufficientPrivilege,
    );
  });
});
