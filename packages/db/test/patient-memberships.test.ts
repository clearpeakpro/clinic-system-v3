import { randomUUID } from 'node:crypto';
import {
  MEMBERSHIP_CANCELLATIONS,
  MEMBERSHIP_EVENT_ACTIONS,
  MEMBERSHIP_FEE_KINDS,
  MEMBERSHIP_FEE_STATUSES,
  MEMBERSHIP_MEMBER_ROLES,
  PATIENT_MEMBERSHIP_STATUSES,
} from '@clinic/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { encounters, coverages } from '../src/encounters-schema.ts';
import { memberships } from '../src/identity-schema.ts';
import { membershipPlans } from '../src/membership-plans-schema.ts';
import {
  MEMBERSHIP_CANCELLATION_VALUES,
  MEMBERSHIP_EVENT_ACTION_VALUES,
  MEMBERSHIP_FEE_KIND_VALUES,
  MEMBERSHIP_FEE_STATUS_VALUES,
  MEMBERSHIP_MEMBER_ROLE_VALUES,
  membershipFees,
  patientMembershipEvents,
  patientMembershipMembers,
  patientMemberships,
  PATIENT_MEMBERSHIP_STATUS_VALUES,
} from '../src/patient-memberships-schema.ts';
import { settleMembership } from '../src/patient-memberships.ts';
import { DEMO } from '../src/seed.ts';
import { createTenantDb, type TenantDb } from '../src/with-tenant.ts';
import { expectPgError, SQLSTATE } from './helpers.ts';

// T-026b parte B: la membresía del paciente, sus personas, su historial y sus
// cuotas. Aislamiento con el rol real (clinic_app) y un pool: cada
// organización ve y escribe solo lo suyo y nada apunta a otra. Nada se borra;
// de la membresía no cambian plan, titular, inicio, día de cobro ni las
// cuotas con que se inscribió. Un paciente, en una sola membresía en curso.
// settleMembership con reloj fijado: suspende en D+1 y cancela en D+30 (hora
// de la sede, America/Chicago). Datos ficticios.

const NORTE = DEMO.norte;
const SUR = DEMO.sur;
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

type Org = typeof NORTE | typeof SUR;

describe('membresías del paciente', () => {
  let pool: pg.Pool;
  let superuser: pg.Pool;
  let db: TenantDb;
  const member: Record<string, string> = {};
  const plan: Record<string, string> = {};
  let nextCode = 0;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 6 });
    superuser = new pg.Pool({ connectionString: inject('superuserUrl'), max: 2 });
    db = createTenantDb(pool);
    for (const org of [NORTE, SUR]) {
      const userId = randomUUID();
      await pool.query(`insert into auth."user" (id, name, email, email_verified, created_at, updated_at) values ($1, $2, $3, true, now(), now())`, [
        userId,
        'Recepción ficticia',
        `rec.${userId}@example.test`,
      ]);
      const id = randomUUID();
      await db.withTenant(org.id, (tx) => tx.insert(memberships).values({ id, organizationId: org.id, userId }));
      member[org.id] = id;
      const [p] = await db.withTenant(org.id, (tx) => tx.select({ id: membershipPlans.id }).from(membershipPlans).where(eq(membershipPlans.code, 'FAMILIAR')));
      plan[org.id] = p?.id ?? '';
    }
  });
  afterAll(async () => {
    await Promise.all([pool.end(), superuser.end()]);
  });

  /** Una membresía con su titular y su cuota inicial (pagada o no). */
  async function enroll(org: Org, patientIndex: number, values: { startDate: string; billingDay: number; initialPaid: boolean; enrolledOn?: string }) {
    const id = randomUUID();
    const patient = org.patients[patientIndex];
    if (!patient) throw new Error('sin paciente');
    const by = member[org.id] ?? '';
    const now = new Date(`${values.enrolledOn ?? values.startDate}T15:00:00Z`);
    nextCode += 1;
    await db.withTenant(org.id, async (tx) => {
      await tx.insert(patientMemberships).values({
        id,
        organizationId: org.id,
        code: `${org.locations[0].code}-M-9${String(nextCode).padStart(5, '0')}`,
        planId: plan[org.id] ?? '',
        holderPatientId: patient.id,
        locationId: org.locations[0].id,
        status: values.initialPaid ? 'active' : 'pending_payment',
        enrolledOn: values.enrolledOn ?? values.startDate,
        startDate: values.startDate,
        billingDay: values.billingDay,
        initialFeeCents: 25000,
        monthlyFeeCents: 9900,
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
        dueDate: values.startDate,
        periodStart: values.startDate,
        periodEnd: values.startDate,
        amountCents: 25000,
        createdAt: now,
        status: values.initialPaid ? 'paid' : 'pending',
        paidAt: values.initialPaid ? now : null,
      });
    });
    return { id, patientId: patient.id };
  }

  /** 12:00 a. m. (más `minutes`) de un día en Chicago. */
  const midnight = (day: string, minutes = 0) => {
    const base = new Date(`${day}T00:00:00-06:00`);
    return new Date(base.getTime() + minutes * 60_000);
  };
  const statusOf = async (org: Org, id: string) =>
    (await db.withTenant(org.id, (tx) => tx.select().from(patientMemberships).where(eq(patientMemberships.id, id))))[0];
  const settle = (org: Org, id: string, now: Date) => db.withTenant(org.id, (tx) => settleMembership(tx, id, now));

  it('los valores permitidos coinciden con @clinic/shared', () => {
    expect(PATIENT_MEMBERSHIP_STATUS_VALUES).toEqual(PATIENT_MEMBERSHIP_STATUSES);
    expect(MEMBERSHIP_CANCELLATION_VALUES).toEqual(MEMBERSHIP_CANCELLATIONS);
    expect(MEMBERSHIP_MEMBER_ROLE_VALUES).toEqual(MEMBERSHIP_MEMBER_ROLES);
    expect(MEMBERSHIP_FEE_KIND_VALUES).toEqual(MEMBERSHIP_FEE_KINDS);
    expect(MEMBERSHIP_FEE_STATUS_VALUES).toEqual(MEMBERSHIP_FEE_STATUSES);
    expect(MEMBERSHIP_EVENT_ACTION_VALUES).toEqual(MEMBERSHIP_EVENT_ACTIONS);
  });

  it('cada organización ve solo sus membresías, personas, historial y cuotas; sin contexto no se ve nada', async () => {
    const { id } = await enroll(NORTE, 0, { startDate: '2026-11-03', billingDay: 15, initialPaid: false });
    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(patientMemberships).where(eq(patientMemberships.id, id)))).toEqual([]);
    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(membershipFees).where(eq(membershipFees.membershipId, id)))).toEqual([]);
    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(patientMembershipMembers).where(eq(patientMembershipMembers.membershipId, id)))).toEqual([]);
    for (const table of ['patient_memberships', 'patient_membership_members', 'patient_membership_events', 'membership_fees']) {
      expect((await pool.query(`select * from app.${table}`)).rows, table).toEqual([]);
    }
    // El trabajo del worker solo recibe ids de organizaciones.
    const { rows } = await pool.query<{ organization_id: string }>('select * from app.membership_organizations()');
    expect(rows.map((r) => r.organization_id)).toContain(NORTE.id);
  });

  it('no se escribe en otra organización ni nada apunta a un paciente, un plan o una membresía de otra', async () => {
    const { id } = await enroll(NORTE, 1, { startDate: '2026-11-03', billingDay: 15, initialPaid: true });
    const by = member[SUR.id] ?? '';
    await expectPgError(
      db.withTenant(SUR.id, (tx) =>
        tx.insert(membershipFees).values({ organizationId: NORTE.id, membershipId: id, kind: 'monthly', dueDate: '2026-12-15', periodStart: '2026-12-15', periodEnd: '2027-01-14', amountCents: 1, createdAt: new Date() }),
      ),
      SQLSTATE.insufficientPrivilege,
    );
    await expectPgError(
      db.withTenant(SUR.id, (tx) =>
        tx.insert(membershipFees).values({ organizationId: SUR.id, membershipId: id, kind: 'monthly', dueDate: '2026-12-15', periodStart: '2026-12-15', periodEnd: '2027-01-14', amountCents: 1, createdAt: new Date() }),
      ),
      SQLSTATE.foreignKeyViolation,
    );
    await expectPgError(
      db.withTenant(SUR.id, (tx) =>
        tx.insert(patientMembershipMembers).values({ organizationId: SUR.id, membershipId: id, patientId: SUR.patients[0].id, role: 'affiliate', addedByMembershipId: by, addedAt: new Date() }),
      ),
      SQLSTATE.foreignKeyViolation,
    );
    // Un paciente de Norte en una membresía de Sur.
    await expectPgError(
      db.withTenant(SUR.id, (tx) =>
        tx.insert(patientMemberships).values({
          organizationId: SUR.id,
          code: 'SUR1-M-900001',
          planId: plan[SUR.id] ?? '',
          holderPatientId: NORTE.patients[2].id,
          locationId: SUR.locations[0].id,
          enrolledOn: '2026-11-03',
          startDate: '2026-11-03',
          billingDay: 1,
          initialFeeCents: 1,
          monthlyFeeCents: 1,
          enrolledByMembershipId: by,
          identityVerifiedByMembershipId: by,
          identityVerifiedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      SQLSTATE.foreignKeyViolation,
    );
  });

  it('nada se borra; plan, titular, inicio, día de cobro, cuotas e importes no cambian', async () => {
    const { id } = await enroll(NORTE, 3, { startDate: '2026-11-03', billingDay: 15, initialPaid: true });
    for (const table of ['patient_memberships', 'patient_membership_members', 'patient_membership_events', 'membership_fees']) {
      await expectPgError(
        db.withTenant(NORTE.id, (tx) => tx.execute(sql.raw(`delete from app.${table}`))),
        SQLSTATE.insufficientPrivilege,
      );
    }
    for (const set of [{ planId: plan[NORTE.id] ?? '' }, { startDate: '2026-11-04' }, { billingDay: 1 }, { monthlyFeeCents: 1 }, { holderPatientId: NORTE.patients[4].id }]) {
      await expectPgError(
        db.withTenant(NORTE.id, (tx) => tx.update(patientMemberships).set(set).where(eq(patientMemberships.id, id))),
        SQLSTATE.insufficientPrivilege,
      );
    }
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.update(membershipFees).set({ amountCents: 1 }).where(eq(membershipFees.membershipId, id))),
      SQLSTATE.insufficientPrivilege,
    );
  });

  it('un paciente solo está en una membresía en curso; los estados y las cuotas se validan', async () => {
    const { id, patientId } = await enroll(NORTE, 5, { startDate: '2026-11-03', billingDay: 15, initialPaid: true });
    const other = await enroll(NORTE, 6, { startDate: '2026-11-03', billingDay: 15, initialPaid: true });
    const by = member[NORTE.id] ?? '';
    await expectPgError(
      db.withTenant(NORTE.id, (tx) =>
        tx.insert(patientMembershipMembers).values({ organizationId: NORTE.id, membershipId: other.id, patientId, role: 'affiliate', addedByMembershipId: by, addedAt: new Date() }),
      ),
      UNIQUE_VIOLATION,
    );
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.update(patientMemberships).set({ status: 'cancelled' }).where(eq(patientMemberships.id, id))),
      CHECK_VIOLATION,
    );
    // Anulada sin fecha de anulación.
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.update(membershipFees).set({ status: 'voided' }).where(eq(membershipFees.membershipId, id))),
      CHECK_VIOLATION,
    );
    await expectPgError(
      db.withTenant(NORTE.id, (tx) =>
        tx.insert(membershipFees).values({ organizationId: NORTE.id, membershipId: id, kind: 'initial', dueDate: '2026-11-04', periodStart: '2026-11-04', periodEnd: '2026-11-04', amountCents: 1, createdAt: new Date() }),
      ),
      UNIQUE_VIOLATION,
    );
    // La cobertura «Membresía» exige la membresía, y solo ella.
    const [visit] = await db.withTenant(NORTE.id, (tx) =>
      tx
        .insert(encounters)
        .values({
          organizationId: NORTE.id,
          locationId: NORTE.locations[0].id,
          patientId,
          code: `NOR1-V-7${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`,
          source: 'walk_in',
          route: 'STANDARD',
          status: 'CANCELLED',
          arrivedAt: new Date(),
          closedAt: new Date(),
        })
        .returning({ id: encounters.id }),
    );
    const encounterId = visit?.id ?? '';
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(coverages).values({ organizationId: NORTE.id, encounterId, type: 'membership' })), CHECK_VIOLATION);
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.insert(coverages).values({ organizationId: NORTE.id, encounterId, type: 'self_pay', patientMembershipId: id })),
      CHECK_VIOLATION,
    );
    await db.withTenant(NORTE.id, (tx) => tx.insert(coverages).values({ organizationId: NORTE.id, encounterId, type: 'membership', patientMembershipId: id }));
  });

  it('settleMembership: crea la mensualidad 14 días antes, suspende en D+1 y cancela en D+30 sin dejar deuda', async () => {
    // Inicio 3 nov, día 15: la primera mensualidad vence el 15 dic.
    const { id, patientId } = await enroll(NORTE, 7, { startDate: '2026-11-03', billingDay: 15, initialPaid: true });
    expect(await settle(NORTE, id, midnight('2026-11-30', 30))).toMatchObject({ status: 'active', changed: false, feesCreated: 0 });
    expect(await settle(NORTE, id, midnight('2026-12-01', 30))).toMatchObject({ status: 'active', changed: false, feesCreated: 1 });
    expect(await settle(NORTE, id, midnight('2026-12-01', 40))).toMatchObject({ feesCreated: 0 });
    const fees = await db.withTenant(NORTE.id, (tx) => tx.select().from(membershipFees).where(eq(membershipFees.membershipId, id)).orderBy(asc(membershipFees.dueDate)));
    expect(fees.map((f) => [f.kind, f.dueDate, f.periodEnd, f.amountCents, f.status])).toEqual([
      ['initial', '2026-11-03', '2026-11-03', 25000, 'paid'],
      ['monthly', '2026-12-15', '2027-01-14', 9900, 'pending'],
    ]);
    // Justo antes y justo después de las 12:00 a. m. de D+1.
    expect(await settle(NORTE, id, midnight('2026-12-16', -1))).toMatchObject({ status: 'active', changed: false });
    expect(await settle(NORTE, id, midnight('2026-12-16'))).toMatchObject({ status: 'suspended', changed: true });
    expect(await settle(NORTE, id, midnight('2026-12-16', 60))).toMatchObject({ status: 'suspended', changed: false });
    // La mensualidad siguiente (15 ene) se crea el 1 ene aunque esté suspendida.
    expect(await settle(NORTE, id, midnight('2027-01-01', 10))).toMatchObject({ status: 'suspended', feesCreated: 1 });
    // Justo antes y justo después de las 12:00 a. m. de D+30 (14 ene).
    expect(await settle(NORTE, id, midnight('2027-01-14', -1))).toMatchObject({ status: 'suspended' });
    expect(await settle(NORTE, id, midnight('2027-01-14'))).toMatchObject({ status: 'cancelled', changed: true });
    expect(await settle(NORTE, id, midnight('2027-01-14', 5))).toMatchObject({ status: 'cancelled', changed: false });
    expect(await statusOf(NORTE, id)).toMatchObject({ status: 'cancelled', cancelledOn: '2027-01-14', cancellation: 'non_payment', version: 3 });
    const after = await db.withTenant(NORTE.id, (tx) => tx.select().from(membershipFees).where(eq(membershipFees.membershipId, id)).orderBy(asc(membershipFees.dueDate)));
    expect(after.map((f) => f.status)).toEqual(['paid', 'voided', 'voided']);
    // Las personas quedan libres para otra membresía.
    const people = await db.withTenant(NORTE.id, (tx) => tx.select().from(patientMembershipMembers).where(eq(patientMembershipMembers.patientId, patientId)));
    expect(people.every((p) => p.removedAt !== null)).toBe(true);
    const events = await db.withTenant(NORTE.id, (tx) =>
      tx.select().from(patientMembershipEvents).where(eq(patientMembershipEvents.membershipId, id)).orderBy(asc(patientMembershipEvents.id)),
    );
    expect(events.map((e) => [e.action, e.fromStatus, e.toStatus, e.actorType])).toEqual([
      ['suspended', 'active', 'suspended', 'system'],
      ['cancelled', 'suspended', 'cancelled', 'system'],
    ]);
    // La auditoría solo la lee el operador: aquí, el superusuario de la prueba.
    const { rows: audit } = await superuser.query<{ action: string; actor_type: string; metadata: Record<string, unknown> }>(
      'select action, actor_type, metadata from app.audit_log where entity_id = $1 order by id',
      [id],
    );
    expect(audit.map((a) => a.action)).toEqual([
      'membership_fee.created',
      'patient_membership.suspended',
      'membership_fee.created',
      'patient_membership.cancelled',
    ]);
    expect(audit.every((a) => a.actor_type === 'system')).toBe(true);
    expect(audit[3]?.metadata).toMatchObject({ cancellation: 'non_payment', feesVoided: 2 });
  });

  it('settleMembership: la cuota inicial sin pagar cancela a los 30 días de la inscripción, sin mensualidades', async () => {
    const { id } = await enroll(SUR, 0, { startDate: '2026-11-03', billingDay: 3, initialPaid: false });
    expect(await settle(SUR, id, midnight('2026-12-03', -1))).toMatchObject({ status: 'pending_payment', feesCreated: 0 });
    expect(await settle(SUR, id, midnight('2026-12-03'))).toMatchObject({ status: 'cancelled' });
    expect(await statusOf(SUR, id)).toMatchObject({ cancellation: 'initial_unpaid', cancelledOn: '2026-12-03' });
    const fees = await db.withTenant(SUR.id, (tx) => tx.select().from(membershipFees).where(eq(membershipFees.membershipId, id)));
    expect(fees.map((f) => [f.kind, f.status])).toEqual([['initial', 'voided']]);
  });

  it('settleMembership: pagada la mensualidad, la suspendida vuelve a «Activa»; el día del cambio de horario', async () => {
    // 1 nov 2026 dura 25 horas en Chicago.
    const { id } = await enroll(SUR, 1, { startDate: '2026-09-30', billingDay: 31, initialPaid: true });
    expect(await settle(SUR, id, midnight('2026-10-20'))).toMatchObject({ feesCreated: 1 });
    const [fee] = await db.withTenant(SUR.id, (tx) => tx.select().from(membershipFees).where(and(eq(membershipFees.membershipId, id), eq(membershipFees.kind, 'monthly'))));
    expect(fee?.dueDate).toBe('2026-10-31');
    // 11:59 p. m. del 31 oct (CDT) todavía activa; 12:00 a. m. del 1 nov, suspendida.
    expect(await settle(SUR, id, new Date('2026-11-01T04:59:00Z'))).toMatchObject({ status: 'active' });
    expect(await settle(SUR, id, new Date('2026-11-01T05:00:00Z'))).toMatchObject({ status: 'suspended' });
    await db.withTenant(SUR.id, (tx) => tx.update(membershipFees).set({ status: 'paid', paidAt: new Date(), version: 2 }).where(eq(membershipFees.id, fee?.id ?? '')));
    expect(await settle(SUR, id, new Date('2026-11-02T12:00:00Z'))).toMatchObject({ status: 'active', changed: true });
    const events = await db.withTenant(SUR.id, (tx) => tx.select().from(patientMembershipEvents).where(eq(patientMembershipEvents.membershipId, id)).orderBy(asc(patientMembershipEvents.id)));
    expect(events.map((e) => e.action)).toEqual(['suspended', 'reactivated']);
  });
});
