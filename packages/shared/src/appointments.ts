import { z } from 'zod';
import { APPOINTMENT_DURATION_MAX, APPOINTMENT_DURATION_MIN, type AgendaColor } from './catalog.ts';
import type { Role } from './permissions.ts';
import { reasonSchema } from './schemas.ts';

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

// --- Gestión de citas (T-015; S-REC-09 a 17) -------------------------------

/** Notas: el formulario admite 1000 caracteres; el servidor, hasta 4000 (S-REC-10). */
export const APPOINTMENT_NOTES_FORM_MAX = 1000;
export const APPOINTMENT_NOTES_MAX = 4000;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Hora local de la sede, `HH:MM` en 24 h. */
export function isClockTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

const dateField = z.string().refine(isCalendarDate);
const timeField = z.string().refine(isClockTime);
const durationField = z.number().int().min(APPOINTMENT_DURATION_MIN).max(APPOINTMENT_DURATION_MAX);
const notesField = z
  .string()
  .max(APPOINTMENT_NOTES_MAX)
  .transform((v) => v.trim())
  .transform((v) => (v.length === 0 ? null : v));
const expectedVersion = z.number().int().positive();

/**
 * S-REC-10 «Nueva cita». La fecha y la hora van en la hora local de la sede;
 * el servidor las convierte con su zona horaria.
 */
export const createAppointmentSchema = z.object({
  patientId: z.uuid(),
  appointmentTypeId: z.uuid(),
  date: dateField,
  time: timeField,
  durationMinutes: durationField,
  /** Nulo = «Sin proveedor». */
  providerMembershipId: z.uuid().nullable(),
  notes: notesField.nullable().default(null),
});
export type CreateAppointmentInput = z.input<typeof createAppointmentSchema>;

/** S-REC-10 «Editar cita»: tipo, duración, proveedor y notas. La fecha y la hora se reprograman. */
export const updateAppointmentSchema = z.object({
  expectedVersion,
  appointmentTypeId: z.uuid().optional(),
  durationMinutes: durationField.optional(),
  providerMembershipId: z.uuid().nullable().optional(),
  notes: notesField.nullable().optional(),
});
export type UpdateAppointmentInput = z.input<typeof updateAppointmentSchema>;

/** S-REC-13 Reprogramar: fecha, hora y duración. */
export const rescheduleAppointmentSchema = z.object({
  expectedVersion,
  date: dateField,
  time: timeField,
  durationMinutes: durationField,
});
export type RescheduleAppointmentInput = z.input<typeof rescheduleAppointmentSchema>;

/** S-REC-14 Cancelar: motivo operativo obligatorio (1 a 500 caracteres). */
export const cancelAppointmentSchema = z.object({ expectedVersion, reason: reasonSchema });
export type CancelAppointmentInput = z.input<typeof cancelAppointmentSchema>;

/** Confirmar y marcar no presentado: solo la versión. */
export const appointmentVersionSchema = z.object({ expectedVersion });

/** Comprobación del solapamiento antes de guardar (S-REC-10 y 13; decisión de T-015). */
export const appointmentOverlapSchema = z.object({
  providerMembershipId: z.uuid(),
  date: dateField,
  time: timeField,
  durationMinutes: durationField,
  /** La cita que se edita o reprograma, que no cuenta. */
  appointmentId: z.uuid().optional(),
});
export type AppointmentOverlapInput = z.input<typeof appointmentOverlapSchema>;

/** Respuesta de la comprobación: el inicio de la primera cita del proveedor que se cruza (sin datos del paciente). */
export interface AppointmentOverlap {
  overlap: boolean;
  conflictStartsAt: string | null;
}

/** Advertencias que devuelve el servidor al guardar; nunca bloquean. */
export type AppointmentWarning = 'provider_overlap';

/** Respuesta de cada cambio: ids y estado, sin datos del paciente; la web relee el detalle. */
export interface AppointmentSaved {
  id: string;
  /** Completo: `NOR1-A-000045`. */
  code: string;
  status: AppointmentStatus;
  version: number;
  warnings: AppointmentWarning[];
}

/** Proveedores del formulario (S-REC-10): los activos de la sede, con quien llama si es Proveedor. */
export interface AppointmentFormOptions {
  providers: AppointmentProvider[];
  myMembershipId: string;
  /** ¿Quien llama es Proveedor en la sede? Solo entonces aparece «Yo ·». */
  iAmProvider: boolean;
  scope: AppointmentScope;
  today: string;
  timeZone: string;
}

/** ¿Se cruzan [a, a + da) y [b, b + db)? Inicios en milisegundos, duraciones en minutos. */
export function intervalsOverlap(aStart: number, aMinutes: number, bStart: number, bMinutes: number): boolean {
  return aStart < bStart + bMinutes * 60_000 && bStart < aStart + aMinutes * 60_000;
}

/** Las citas Canceladas y No se presentó no ocupan al proveedor. */
export function occupiesProvider(status: AppointmentStatus): boolean {
  return status !== 'CANCELLED' && status !== 'NO_SHOW';
}

/** Solo desde hoy en la sede (decisión de T-015): `date` es el día local de la cita. */
export function isBookableDay(date: string, today: string): boolean {
  return date >= today;
}

/**
 * Alcance de gestión según los roles en la sede: Recepción, cualquier cita;
 * Proveedor (sin Recepción), solo las suyas; el resto, ninguna (ADR 0027).
 */
export type AppointmentScope = 'all' | 'own' | 'none';
export function appointmentScope(roles: readonly Role[]): AppointmentScope {
  if (roles.includes('recepcion')) return 'all';
  if (roles.includes('proveedor')) return 'own';
  return 'none';
}

export type AppointmentAction = 'edit' | 'reschedule' | 'confirm' | 'cancel' | 'no_show' | 'check_in';

/**
 * Matriz estado × rol del detalle (S-REC-09), la misma en la web y en la API:
 *  - Programada: Editar, Reprogramar, Confirmar, Cancelar, No presentado y Registrar llegada;
 *  - Confirmada: las mismas menos Confirmar;
 *  - Llegó, Cancelada y No se presentó: ninguna.
 * El Proveedor, solo en sus citas. «Marcar no presentado», solo desde la hora
 * de inicio (T-015). «Registrar llegada», solo hoy y con appointments.check_in.
 */
export function appointmentActions(input: {
  status: AppointmentStatus;
  scope: AppointmentScope;
  /** ¿La cita está asignada a quien llama? */
  isOwn: boolean;
  canCheckIn: boolean;
  startsAt: string;
  now: Date;
  /** ¿La cita es de hoy en la sede? */
  isToday: boolean;
}): AppointmentAction[] {
  if (isFinalAppointmentStatus(input.status)) return [];
  if (input.scope === 'none' || (input.scope === 'own' && !input.isOwn)) return [];
  const actions: AppointmentAction[] = ['edit', 'reschedule'];
  if (canTransitionAppointment(input.status, 'CONFIRMED')) actions.push('confirm');
  actions.push('cancel');
  if (input.now.getTime() >= new Date(input.startsAt).getTime()) actions.push('no_show');
  if (input.canCheckIn && input.isToday) actions.push('check_in');
  return actions;
}

const SHORT_MONTHS_LOWER = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'] as const;
const whenFormats = new Map<string, Intl.DateTimeFormat>();

/** «3 nov, 9:00 a. m.» en la zona de la sede (avisos de la campana, T-015). */
export function appointmentWhenLabel(startsAt: Date | string, timeZone: string): string {
  let format = whenFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', { timeZone, month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
    whenFormats.set(timeZone, format);
  }
  const parts = format.formatToParts(typeof startsAt === 'string' ? new Date(startsAt) : startsAt);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const hour = get('hour');
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(get('day'))} ${SHORT_MONTHS_LOWER[get('month') - 1] ?? ''}, ${String(hour12)}:${String(get('minute')).padStart(2, '0')} ${hour < 12 ? 'a. m.' : 'p. m.'}`;
}
