import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { payments } from '../src/billing-schema.ts';
import { encounters } from '../src/encounters-schema.ts';
import { memberships } from '../src/identity-schema.ts';
import { DEMO } from '../src/seed.ts';
import { createTenantDb, type TenantDb } from '../src/with-tenant.ts';
import { expectPgError, SQLSTATE } from './helpers.ts';

// T-028: pagos. Aislamiento con el rol real (clinic_app) y un pool: cada
// organización ve y escribe solo lo suyo. Append-only: ni UPDATE ni DELETE;
// la anulación es una fila inversa, una sola por pago, con motivo.

const NORTE = DEMO.norte;
const SUR = DEMO.sur;
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

type Org = typeof NORTE | typeof SUR;

describe('pagos', () => {
  let pool: pg.Pool;
  let db: TenantDb;
  let nextPatient = 0;
  const member: Record<string, string> = {};

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
    }
  });
  afterAll(async () => {
    await pool.end();
  });

  const now = new Date('2026-11-05T15:30:00Z');

  async function visit(org: Org): Promise<{ encounterId: string; patientId: string }> {
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
          status: 'COMPLETED',
          arrivedAt: now,
          closedAt: now,
        })
        .returning({ id: encounters.id }),
    );
    if (!row) throw new Error('sin visita');
    return { encounterId: row.id, patientId: patient.id };
  }

  const payment = (org: Org, v: { encounterId: string; patientId: string }, extra: Partial<typeof payments.$inferInsert> = {}): typeof payments.$inferInsert => ({
    organizationId: org.id,
    locationId: org.locations[0].id,
    patientId: v.patientId,
    encounterId: v.encounterId,
    kind: 'payment',
    method: 'cash',
    amountCents: 4500,
    recordedByMembershipId: member[org.id] ?? '',
    recordedAt: now,
    ...extra,
  });

  it('cada organización ve solo sus pagos y no escribe en la otra', async () => {
    const v = await visit(NORTE);
    const surVisit = await visit(SUR);
    const [row] = await db.withTenant(NORTE.id, (tx) => tx.insert(payments).values(payment(NORTE, v)).returning({ id: payments.id }));
    expect(row).toBeDefined();
    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(payments).where(eq(payments.id, row?.id ?? '')))).toEqual([]);
    expect((await pool.query('select * from app.payments')).rows).toEqual([]);
    // Otra organización en la fila: RLS. La visita de otra organización: clave foránea.
    await expectPgError(db.withTenant(SUR.id, (tx) => tx.insert(payments).values(payment(NORTE, surVisit))), SQLSTATE.insufficientPrivilege);
    await expectPgError(db.withTenant(SUR.id, (tx) => tx.insert(payments).values(payment(SUR, { ...surVisit, encounterId: v.encounterId }))), SQLSTATE.foreignKeyViolation);
  });

  it('append-only: ni UPDATE ni DELETE; la anulación es una fila inversa, una sola por pago, con motivo', async () => {
    const v = await visit(NORTE);
    const [row] = await db.withTenant(NORTE.id, (tx) => tx.insert(payments).values(payment(NORTE, v)).returning({ id: payments.id }));
    const id = row?.id ?? '';
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.update(payments).set({ amountCents: 1 }).where(eq(payments.id, id))), SQLSTATE.insufficientPrivilege);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.delete(payments).where(eq(payments.id, id))), SQLSTATE.insufficientPrivilege);

    const reversal = payment(NORTE, v, { kind: 'void', amountCents: -4500, reversesPaymentId: id, reasonEnc: 'cifrado' });
    // Sin motivo, con monto positivo o sin el pago que anula: no.
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(payments).values({ ...reversal, reasonEnc: null })), CHECK_VIOLATION);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(payments).values({ ...reversal, amountCents: 4500 })), CHECK_VIOLATION);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(payments).values({ ...reversal, reversesPaymentId: null })), CHECK_VIOLATION);
    await db.withTenant(NORTE.id, (tx) => tx.insert(payments).values(reversal));
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(payments).values(reversal)), UNIQUE_VIOLATION);
  });

  it('un pago: monto mayor que cero, un método conocido y exactamente un destino (visita o cuota)', async () => {
    const v = await visit(NORTE);
    for (const bad of [{ amountCents: 0 }, { amountCents: -100 }, { method: 'check' }, { encounterId: null }, { reasonEnc: 'x' }]) {
      await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(payments).values(payment(NORTE, v, bad))), CHECK_VIOLATION);
    }
  });
});
