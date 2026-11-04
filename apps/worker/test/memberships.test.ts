import { randomUUID } from 'node:crypto';
import {
  createTenantDb,
  DEMO,
  membershipFees,
  membershipPlans,
  memberships,
  patientMembershipMembers,
  patientMemberships,
  type TenantDb,
} from '@clinic/db';
import { asc, eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { WORKER_DEFAULTS } from '../src/config.ts';
import { runMemberships } from '../src/memberships.ts';

// T-026b parte B: el trabajo de membresías del worker con el reloj fijado
// justo antes y justo después del vencimiento (12:00 a. m. de D+1) y de los
// 30 días (12:00 a. m. de D+30), en la hora de la sede (America/Chicago), en
// las dos organizaciones. Todo como clinic_app. Datos ficticios.

type Org = typeof DEMO.norte | typeof DEMO.sur;

describe('membresías en el worker', () => {
  let pool: pg.Pool;
  let tenantDb: TenantDb;
  const staff: Record<string, string> = {};
  let n = 0;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 4 });
    tenantDb = createTenantDb(pool);
    for (const org of [DEMO.norte, DEMO.sur]) {
      const userId = randomUUID();
      await pool.query(`insert into auth."user" (id, name, email, email_verified, created_at, updated_at) values ($1, $2, $3, true, now(), now())`, [
        userId,
        'Recepción ficticia',
        `rec.${userId}@example.test`,
      ]);
      const id = randomUUID();
      await tenantDb.withTenant(org.id, (tx) => tx.insert(memberships).values({ id, organizationId: org.id, userId }));
      staff[org.id] = id;
    }
  });
  afterAll(async () => {
    await pool.end();
  });

  async function enroll(org: Org, patientIndex: number, startDate: string, billingDay: number, initialPaid: boolean): Promise<string> {
    const id = randomUUID();
    const by = staff[org.id] ?? '';
    const patient = org.patients[patientIndex];
    if (!patient) throw new Error('sin paciente');
    const now = new Date(`${startDate}T16:00:00Z`);
    n += 1;
    await tenantDb.withTenant(org.id, async (tx) => {
      const [plan] = await tx.select({ id: membershipPlans.id }).from(membershipPlans).where(eq(membershipPlans.code, 'ESENCIAL'));
      await tx.insert(patientMemberships).values({
        id,
        organizationId: org.id,
        code: `${org.locations[0].code}-M-8${String(n).padStart(5, '0')}`,
        planId: plan?.id ?? '',
        holderPatientId: patient.id,
        locationId: org.locations[0].id,
        status: initialPaid ? 'active' : 'pending_payment',
        enrolledOn: startDate,
        startDate,
        billingDay,
        initialFeeCents: 10000,
        monthlyFeeCents: 3900,
        enrolledByMembershipId: by,
        identityVerifiedByMembershipId: by,
        identityVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(patientMembershipMembers).values({ organizationId: org.id, membershipId: id, patientId: patient.id, role: 'holder', addedByMembershipId: by, addedAt: now });
      await tx.insert(membershipFees).values({
        organizationId: org.id,
        membershipId: id,
        kind: 'initial',
        dueDate: startDate,
        periodStart: startDate,
        periodEnd: startDate,
        amountCents: 10000,
        status: initialPaid ? 'paid' : 'pending',
        paidAt: initialPaid ? now : null,
        createdAt: now,
      });
    });
    return id;
  }

  const state = async (org: Org, id: string) => {
    const [m] = await tenantDb.withTenant(org.id, (tx) => tx.select().from(patientMemberships).where(eq(patientMemberships.id, id)));
    const fees = await tenantDb.withTenant(org.id, (tx) => tx.select().from(membershipFees).where(eq(membershipFees.membershipId, id)).orderBy(asc(membershipFees.dueDate)));
    return { status: m?.status, cancellation: m?.cancellation, fees: fees.map((f) => `${f.kind}:${f.dueDate}:${f.status}`) };
  };
  /** 12:00 a. m. en Chicago (CST, −6) del día, más `minutes`. */
  const at = (day: string, minutes = 0) => new Date(new Date(`${day}T00:00:00-06:00`).getTime() + minutes * 60_000);

  it('corre cada hora por defecto', () => {
    expect(WORKER_DEFAULTS.membershipsCron).toBe('1 * * * *');
  });

  it('crea la mensualidad, suspende en D+1 y cancela en D+30, en las dos organizaciones', async () => {
    // Inicio 3 dic, día 20: la primera mensualidad vence el 20 ene 2027.
    const norte = await enroll(DEMO.norte, 10, '2026-12-03', 20, true);
    const sur = await enroll(DEMO.sur, 10, '2026-12-03', 20, true);
    // Sur: la cuota inicial nunca se paga.
    const surPending = await enroll(DEMO.sur, 11, '2026-12-03', 20, false);

    await runMemberships(pool, tenantDb, at('2027-01-05', 59));
    expect((await state(DEMO.norte, norte)).fees).toEqual(['initial:2026-12-03:paid']);
    // 14 días antes del 20 ene.
    const created = await runMemberships(pool, tenantDb, at('2027-01-06', 1));
    expect(created.feesCreated).toBeGreaterThanOrEqual(2);
    expect((await state(DEMO.norte, norte)).fees).toEqual(['initial:2026-12-03:paid', 'monthly:2027-01-20:pending']);
    // La pendiente de pago: cancelada a los 30 días de la inscripción (2 ene), sin mensualidades.
    expect(await state(DEMO.sur, surPending)).toEqual({ status: 'cancelled', cancellation: 'initial_unpaid', fees: ['initial:2026-12-03:voided'] });

    // Justo antes de las 12:00 a. m. del 21 ene: activa. Justo después: suspendida.
    await runMemberships(pool, tenantDb, at('2027-01-21', -1));
    expect((await state(DEMO.norte, norte)).status).toBe('active');
    const suspended = await runMemberships(pool, tenantDb, at('2027-01-21', 1));
    expect(suspended.changed).toBeGreaterThanOrEqual(2);
    expect((await state(DEMO.norte, norte)).status).toBe('suspended');
    expect((await state(DEMO.sur, sur)).status).toBe('suspended');

    // Correrlo otra vez en la misma hora no cambia nada.
    const again = await runMemberships(pool, tenantDb, at('2027-01-21', 30));
    expect(again).toMatchObject({ changed: 0, feesCreated: 0 });

    // Justo antes y justo después de las 12:00 a. m. del 19 feb (D+30).
    await runMemberships(pool, tenantDb, at('2027-02-19', -1));
    expect((await state(DEMO.norte, norte)).status).toBe('suspended');
    await runMemberships(pool, tenantDb, at('2027-02-19', 1));
    expect(await state(DEMO.norte, norte)).toEqual({
      status: 'cancelled',
      cancellation: 'non_payment',
      // La de febrero se creó el 6 feb; las dos pendientes se anulan, sin deuda.
      fees: ['initial:2026-12-03:paid', 'monthly:2027-01-20:voided', 'monthly:2027-02-20:voided'],
    });
    expect((await state(DEMO.sur, sur)).status).toBe('cancelled');
  });
});
