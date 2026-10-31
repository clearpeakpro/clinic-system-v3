import type { AgendaColor } from './catalog.ts';

// Citas (T-014; S-REC-06 a 09 y S-PAC-07). Estados, transiciones y fechas de
// la agenda. Los valores son los mismos que exige la base de datos
// (packages/db, appointments-schema.ts); una prueba lo comprueba. Los colores
// e iconos de cada estado viven en packages/ui.

/** Estados de la cita (manual, S-REC-06). */
export const APPOINTMENT_STATUSES = ['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'CANCELLED', 'NO_SHOW'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'Programada',
  CONFIRMED: 'Confirmada',
  ARRIVED: 'Llegó',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No se presentó',
};

/**
 * Máquina de estados de la cita: Programada → Confirmada → Llegó; Programada
 * o Confirmada → Cancelada o No se presentó. Llegó, Cancelada y No se
 * presentó son finales. Las acciones llegan con T-015 y la llegada con la fase 3.
 */
export const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  SCHEDULED: ['CONFIRMED', 'ARRIVED', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['ARRIVED', 'CANCELLED', 'NO_SHOW'],
  ARRIVED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTransitionAppointment(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return APPOINTMENT_TRANSITIONS[from].includes(to);
}

/** Llegó, Cancelada y No se presentó: sin más acciones; en la agenda se ven atenuadas. */
export function isFinalAppointmentStatus(status: AppointmentStatus): boolean {
  return APPOINTMENT_TRANSITIONS[status].length === 0;
}

/** «N citas hoy» del Panel: todas menos Canceladas y No se presentó (S-REC-01). */
export function countsTowardToday(status: AppointmentStatus): boolean {
  return status !== 'CANCELLED' && status !== 'NO_SHOW';
}

/** `NOR1-A-000045` → `A-000045` (tarjeta, lista y perfil; el completo va en el detalle). */
export function shortAppointmentCode(code: string): string {
  const index = code.indexOf('-A-');
  return index >= 0 ? code.slice(index + 1) : code;
}

// --- Fechas de la agenda --------------------------------------------------
//
// Días calendario `AAAA-MM-DD` de la sede. Las cuentas se hacen en UTC sobre
// la fecha sola, así que no dependen de la zona del dispositivo ni de los
// cambios de horario.

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** ¿Es una fecha real con el formato `AAAA-MM-DD`? */
export function isCalendarDate(value: string): boolean {
  const match = DAY_PATTERN.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** `2026-10-31` + 1 → `2026-11-01`. */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Rango del selector de fecha de la agenda: del 1 de enero de dos años atrás al 31 de diciembre de dos años adelante. */
export function agendaDateRange(today: string): { min: string; max: string } {
  const year = Number(today.slice(0, 4));
  return { min: `${String(year - 2)}-01-01`, max: `${String(year + 2)}-12-31` };
}

/** La fecha pedida, o hoy en la sede si falta, no es válida o está fuera del rango (S-REC-06). */
export function agendaDate(requested: string | null | undefined, today: string): string {
  if (!requested || !isCalendarDate(requested)) return today;
  const { min, max } = agendaDateRange(today);
  return requested < min || requested > max ? today : requested;
}

// --- Respuestas de la API --------------------------------------------------

/** Proveedor asignado: la membresía y el nombre de la persona. */
export interface AppointmentProvider {
  membershipId: string;
  name: string;
}

/** Una cita en la agenda (S-REC-07 y 08). */
export interface AgendaAppointment {
  id: string;
  /** Completo: `NOR1-A-000045`. */
  code: string;
  startsAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  patient: { id: string; code: string; firstName: string; lastName: string };
  /** Con `active` en falso se muestra el código del tipo (S-REC-07). */
  type: { id: string; code: string; name: string; active: boolean; color: AgendaColor };
  provider: AppointmentProvider | null;
}

/** S-REC-06: un día de la agenda de la sede activa. */
export interface AgendaDay {
  /** El día mostrado (`AAAA-MM-DD`), ya validado por el servidor. */
  date: string;
  /** Hoy en la sede. */
  today: string;
  timeZone: string;
  appointments: AgendaAppointment[];
  /** Proveedores activos de la sede, para el filtro (sin quien llama). */
  providers: AppointmentProvider[];
  /** La membresía de quien llama, para «Mis citas». */
  myMembershipId: string;
}

/** S-REC-09 Detalle de la cita: notas y motivo de cancelación descifrados en el servidor. */
export interface AppointmentDetail extends AgendaAppointment {
  location: { id: string; code: string; name: string };
  timeZone: string;
  notes: string | null;
  cancelReason: string | null;
  createdAt: string;
  version: number;
}

/** Una fila de la pestaña Citas del perfil (S-PAC-07). */
export interface PatientAppointmentRow {
  id: string;
  code: string;
  startsAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  location: { id: string; code: string; name: string };
  type: { code: string; name: string; active: boolean; color: AgendaColor };
  provider: AppointmentProvider | null;
}

/** Filas por página de la pestaña Citas del perfil (S-PAC-07: «Cargar más»). */
export const PATIENT_APPOINTMENTS_PAGE_SIZE = 50;

export interface PatientAppointments {
  appointments: PatientAppointmentRow[];
  nextOffset: number | null;
  /** Próxima cita Programada o Confirmada (Resumen, S-PAC-06); solo en la primera página. */
  upcoming: PatientAppointmentRow | null;
  /** Hoy en la sede activa, para «Hoy» y «Mañana». */
  today: string;
}
