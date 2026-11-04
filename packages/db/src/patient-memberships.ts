import { membershipStanding, monthlyFeesDue, type MembershipFeeKind, type MembershipFeeStatus, type PatientMembershipStatus } from '@clinic/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { auditLog } from './identity-schema.ts';
import { membershipFees, patientMembershipEvents, patientMembershipMembers, patientMemberships } from './patient-memberships-schema.ts';
import { locations } from './schema.ts';
import type { Tx } from './with-tenant.ts';

// Deja guardado el estado de una membresía del paciente según el reloj
// (T-026b; ADR 0034). Lo usan el trabajo del worker (memberships.daily, cada
// hora) y la API antes de leer o cambiar una membresía, así el estado
// guardado nunca se queda atrás del calculado:
//  - crea las mensualidades que ya deben existir (14 días antes de vencer),
//    con la mensualidad con que se inscribió («Monto fijo»);
//  - suspende (D+1), reactiva, activa o cancela (D+30, 30 días sin cuota
//    inicial o fin del aviso), con su fila en el historial y su auditoría con
//    el actor «Sistema»;
//  - al cancelarse, anula las cuotas pendientes (sin dejar deuda) y da de baja
//    a todas las personas, que quedan libres para otra membresía.
// Es idempotente: correrla dos veces no repite nada. La membresía se bloquea
// (FOR UPDATE) mientras tanto.

/** AAAA-MM-DD de `instant` en la zona de la sede. */
export function localDay(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

export interface SettledMembership {
  status: PatientMembershipStatus;
  version: number;
  /** Hoy en la sede de inscripción. */
  today: string;
  changed: boolean;
  feesCreated: number;
}

const EVENT: Record<PatientMembershipStatus, 'activated' | 'reactivated' | 'suspended' | 'cancelled' | null> = {
  pending_payment: null,
  active: 'activated',
  suspended: 'suspended',
  cancelled: 'cancelled',
};

export async function settleMembership(tx: Tx, membershipId: string, now: Date): Promise<SettledMembership | null> {
  const [m] = await tx
    .select({
      id: patientMemberships.id,
      organizationId: patientMemberships.organizationId,
      code: patientMemberships.code,
      locationId: patientMemberships.locationId,
      status: patientMemberships.status,
      enrolledOn: patientMemberships.enrolledOn,
      startDate: patientMemberships.startDate,
      billingDay: patientMemberships.billingDay,
      monthlyFeeCents: patientMemberships.monthlyFeeCents,
      benefitsEndDate: patientMemberships.benefitsEndDate,
      version: patientMemberships.version,
    })
    .from(patientMemberships)
    .where(eq(patientMemberships.id, membershipId))
    .for('update');
  if (!m) return null;
  const [site] = await tx.select({ timezone: locations.timezone }).from(locations).where(eq(locations.id, m.locationId));
  const today = localDay(now, site?.timezone ?? 'UTC');
  const stored = m.status as PatientMembershipStatus;
  if (stored === 'cancelled') return { status: stored, version: m.version, today, changed: false, feesCreated: 0 };

  const fees = await tx
    .select({ id: membershipFees.id, kind: membershipFees.kind, dueDate: membershipFees.dueDate, status: membershipFees.status })
    .from(membershipFees)
    .where(eq(membershipFees.membershipId, m.id));
  const audit = (action: string, metadata: Record<string, string | number | boolean>) =>
    tx.insert(auditLog).values({
      organizationId: m.organizationId,
      locationId: m.locationId,
      actorType: 'system',
      actorId: null,
      action,
      entityType: 'patient_membership',
      entityId: m.id,
      ip: null,
      metadata: { code: m.code, ...metadata },
    });

  // Las mensualidades se generan solo con la cuota inicial pagada.
  let feesCreated = 0;
  if (!fees.some((f) => f.kind === 'initial' && f.status === 'pending')) {
    const due = monthlyFeesDue(
      { startDate: m.startDate, billingDay: m.billingDay, benefitsEndDate: m.benefitsEndDate, existingDueDates: fees.filter((f) => f.kind === 'monthly').map((f) => f.dueDate) },
      today,
    );
    for (const fee of due) {
      const id = uuidv7();
      await tx.insert(membershipFees).values({
        id,
        organizationId: m.organizationId,
        membershipId: m.id,
        kind: 'monthly',
        dueDate: fee.dueDate,
        periodStart: fee.periodStart,
        periodEnd: fee.periodEnd,
        amountCents: m.monthlyFeeCents,
        createdAt: now,
      });
      fees.push({ id, kind: 'monthly', dueDate: fee.dueDate, status: 'pending' });
      await audit('membership_fee.created', { kind: 'monthly', dueDate: fee.dueDate, amountCents: m.monthlyFeeCents, previousCents: 'none' });
      feesCreated += 1;
    }
  }

  const standing = membershipStanding(
    {
      status: stored,
      enrolledOn: m.enrolledOn,
      benefitsEndDate: m.benefitsEndDate,
      fees: fees.map((f) => ({ kind: f.kind as MembershipFeeKind, dueDate: f.dueDate, status: f.status as MembershipFeeStatus })),
    },
    today,
  );
  if (standing.status === stored) return { status: stored, version: m.version, today, changed: false, feesCreated };

  const version = m.version + 1;
  const action = standing.status === 'active' && stored === 'suspended' ? 'reactivated' : EVENT[standing.status];
  if (standing.status === 'cancelled') {
    const cancelledOn = standing.on ?? today;
    const cancellation = standing.cancellation ?? 'non_payment';
    await tx.update(patientMemberships).set({ status: 'cancelled', cancelledOn, cancellation, version, updatedAt: now }).where(eq(patientMemberships.id, m.id));
    // Sin deuda: las cuotas pendientes se anulan (decisión del 2026-11-04).
    const pending = fees.filter((f) => f.status === 'pending');
    for (const fee of pending) {
      await tx
        .update(membershipFees)
        .set({ status: 'voided', voidedAt: now, version: sql`${membershipFees.version} + 1` })
        .where(and(eq(membershipFees.id, fee.id), eq(membershipFees.status, 'pending')));
    }
    await tx
      .update(patientMembershipMembers)
      .set({ removedAt: now })
      .where(and(eq(patientMembershipMembers.membershipId, m.id), isNull(patientMembershipMembers.removedAt)));
    await audit('patient_membership.cancelled', { from: stored, to: 'cancelled', cancellation, cancelledOn, feesVoided: pending.length, version });
  } else {
    await tx.update(patientMemberships).set({ status: standing.status, version, updatedAt: now }).where(eq(patientMemberships.id, m.id));
    await audit(`patient_membership.${action ?? standing.status}`, {
      from: stored,
      to: standing.status,
      version,
      ...(standing.status === 'suspended' ? { overdueDueDate: standing.overdueDueDate } : {}),
    });
  }
  if (action) {
    await tx.insert(patientMembershipEvents).values({
      organizationId: m.organizationId,
      membershipId: m.id,
      action,
      fromStatus: stored,
      toStatus: standing.status,
      actorType: 'system',
      actorMembershipId: null,
      occurredAt: now,
    });
  }
  return { status: standing.status, version, today, changed: true, feesCreated };
}
