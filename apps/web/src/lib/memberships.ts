import {
  type CoverageMembership,
  firstDueDate,
  MEMBERSHIP_CANCELLATION_LABELS,
  PATIENT_MEMBERSHIP_STATUS_LABELS,
  type PatientMembershipStatus,
  type PatientMembershipView,
} from '@clinic/shared';
import { ApiError } from './api.ts';
import { formatDay } from './catalog.ts';
import { userActionMessage } from './users.ts';

// Membresía del paciente en la web (T-026b; S-PAC-22 y 23). Sin React, para
// probarlo aparte. Los importes y el estado los calcula el servidor: aquí
// solo se les da formato. La primera mensualidad que se muestra al inscribir
// es una fecha (decisión 5), no un importe.

export type MembershipTone = 'success' | 'warning' | 'danger' | 'neutral';

/** Estado con icono + texto + color (regla 10). */
export const MEMBERSHIP_STATUS_TONES: Record<PatientMembershipStatus, MembershipTone> = {
  pending_payment: 'warning',
  active: 'success',
  suspended: 'danger',
  cancelled: 'neutral',
};

export function membershipStatusLabel(status: PatientMembershipStatus): string {
  return PATIENT_MEMBERSHIP_STATUS_LABELS[status];
}

/** La línea de estado bajo el plan: por qué está así y hasta cuándo. */
export function membershipStatusDetail(m: PatientMembershipView): string | null {
  switch (m.status) {
    case 'pending_payment':
      return 'Sin beneficios hasta que se pague la cuota inicial en Caja.';
    case 'suspended':
      return m.overdueDueDate && m.suspendedSince
        ? `Suspendida desde el ${formatDay(m.suspendedSince)}: la mensualidad del ${formatDay(m.overdueDueDate)} no se ha pagado. Los beneficios vuelven al pagarla.`
        : 'Suspendida: hay una mensualidad vencida sin pagar.';
    case 'cancelled':
      return [m.cancelledOn ? `Cancelada el ${formatDay(m.cancelledOn)}` : 'Cancelada', m.cancellation ? MEMBERSHIP_CANCELLATION_LABELS[m.cancellation].toLowerCase() : null]
        .filter(Boolean)
        .join(': ')
        .concat('.');
    case 'active':
      if (m.benefitsEndDate) return `Aviso de cancelación registrado: beneficios hasta el ${formatDay(m.benefitsEndDate)}.`;
      return null;
  }
}

/** «Membresía activa: {plan} (desde {fecha})» de S-REC-24 y S-CLI-12. */
export function membershipNotice(m: CoverageMembership): string {
  return `Membresía activa: ${m.planName} (desde ${formatDay(m.startDate)})`;
}

/** «Primera mensualidad: 15 dic 2026» del diálogo de inscripción (decisión 5). */
export function firstDueText(startDate: string, billingDay: number): string {
  return `Primera mensualidad: ${formatDay(firstDueDate(startDate, billingDay))}. La cuota inicial cubre hasta el día anterior.`;
}

const MESSAGES: Record<string, string> = {
  patient_in_membership: 'Este paciente ya está en una membresía en curso.',
  too_many_members: 'El plan no admite más personas.',
  invalid_start_date: 'La fecha de inicio debe ser hoy o hasta 30 días después.',
  plan_not_enrollable: 'Ese plan ya no está disponible. Elija otro.',
  holder_not_removable: 'El titular no se puede quitar de la membresía.',
  member_not_found: 'Esa persona ya no está en la membresía.',
  membership_cancelled: 'Esta membresía ya está cancelada.',
  cancel_notice_exists: 'Ya se registró el aviso de cancelación.',
  membership_not_found: 'No se encontró la membresía.',
  membership_not_active: 'El paciente no tiene una membresía activa hoy. Elija otra cobertura.',
  patient_inactive: 'Ese paciente está inactivo.',
  patient_merged: 'Ese registro fue fusionado con otro paciente.',
  patient_not_found: 'No se encontró el paciente.',
  version_conflict: 'Esta membresía fue actualizada por otro usuario. Actualice para continuar.',
  location_inactive: 'Esta sede está inactiva.',
};

export function membershipMessage(error: unknown): string {
  if (error instanceof ApiError) return MESSAGES[error.code] ?? userActionMessage(error);
  return userActionMessage(error);
}
