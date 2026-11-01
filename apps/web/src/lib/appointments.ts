import { APPOINTMENT_STATUSES, type AgendaAppointment, type AppointmentProvider, type AppointmentStatus } from '@clinic/shared';
import { formatTime } from '@clinic/ui';
import { useSyncExternalStore } from 'react';
import { ApiError } from './api.ts';
import { userActionMessage } from './users.ts';

// Agenda (T-014; S-REC-06 a 08). Todo en la zona horaria de la sede: la hora
// de cada cita, su agrupación por hora y el día. La vista y el filtro de
// proveedor se conservan durante la sesión, solo en memoria (no son PHI, pero
// nada de la agenda va al almacenamiento del navegador); al cerrar sesión se
// reinician.

export type AgendaView = 'day' | 'list';
/** «Todos los proveedores», «Mis citas», «Sin asignar» o la membresía de un proveedor. */
export type ProviderFilter = 'all' | 'mine' | 'none' | `member:${string}`;

let view: AgendaView = 'day';
let provider: ProviderFilter | null = null;
let version = 0;
const listeners = new Set<() => void>();
const notify = () => {
  version += 1;
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const agendaPrefs = {
  setView(next: AgendaView) {
    view = next;
    notify();
  },
  setProvider(next: ProviderFilter) {
    provider = next;
    notify();
  },
  /** Al cerrar sesión. */
  reset() {
    view = 'day';
    provider = null;
    notify();
  },
};

/** Vista y filtro de proveedor de la sesión; sin filtro elegido, el inicial del rol. */
export function useAgendaPrefs(initialProvider: ProviderFilter): { view: AgendaView; provider: ProviderFilter } {
  useSyncExternalStore(subscribe, () => version);
  return { view, provider: provider ?? initialProvider };
}

/** Rol Proveedor sin Administrador ni Recepción → «Mis citas»; el resto, «Todos los proveedores» (S-REC-06). */
export function initialProviderFilter(roles: readonly string[]): ProviderFilter {
  return roles.includes('proveedor') && !roles.includes('administrador') && !roles.includes('recepcion') ? 'mine' : 'all';
}

export function matchesProvider(a: AgendaAppointment, filter: ProviderFilter, myMembershipId: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'none') return a.provider === null;
  if (filter === 'mine') return a.provider?.membershipId === myMembershipId;
  return a.provider?.membershipId === filter.slice('member:'.length);
}

/** Filtro de proveedor y de estados (vacío = todos), en el cliente sin nueva petición. */
export function filterAgenda(
  appointments: AgendaAppointment[],
  filter: ProviderFilter,
  statuses: readonly AppointmentStatus[],
  myMembershipId: string,
): AgendaAppointment[] {
  return appointments.filter((a) => matchesProvider(a, filter, myMembershipId) && (statuses.length === 0 || statuses.includes(a.status)));
}

/** Cuántas citas hay de cada estado (chips de S-REC-06). */
export function countByStatus(appointments: AgendaAppointment[]): Record<AppointmentStatus, number> {
  const counts = Object.fromEntries(APPOINTMENT_STATUSES.map((s) => [s, 0])) as Record<AppointmentStatus, number>;
  for (const a of appointments) counts[a.status] += 1;
  return counts;
}

// --- Fechas y horas en la zona de la sede --------------------------------

const dayFormats = new Map<string, Intl.DateTimeFormat>();

/** Día calendario de un instante en la zona de la sede (`AAAA-MM-DD`). */
export function localDay(value: string, timeZone: string): string {
  let format = dayFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    dayFormats.set(timeZone, format);
  }
  return format.format(new Date(value));
}

const hourFormats = new Map<string, Intl.DateTimeFormat>();

/** Hora local (0–23) de un instante en la zona de la sede. */
export function localHour(value: string, timeZone: string): number {
  let format = hourFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' });
    hourFormats.set(timeZone, format);
  }
  return Number(format.format(new Date(value)));
}

/** «9:00 a. m.» para el encabezado de cada hora. */
export function hourLabel(hour: number): string {
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(hour12)}:00 ${hour < 12 ? 'a. m.' : 'p. m.'}`;
}

/**
 * Vista Día (S-REC-07): una sección por hora local de inicio, solo las horas
 * con citas, en orden. En el cambio de horario de otoño la 1:00 a. m. se
 * repite: sus citas quedan juntas en una sola sección, en orden real.
 */
export function groupByHour(appointments: AgendaAppointment[], timeZone: string): { key: string; hour: number; items: AgendaAppointment[] }[] {
  const groups: { key: string; hour: number; items: AgendaAppointment[] }[] = [];
  for (const a of appointments) {
    const hour = localHour(a.startsAt, timeZone);
    const last = groups.at(-1);
    if (last?.hour === hour) last.items.push(a);
    else groups.push({ key: `${String(hour)}-${a.startsAt}`, hour, items: [a] });
  }
  return groups;
}

/** «9:00 – 9:20 a. m.» o, si cambia de mañana a tarde, «11:50 a. m. – 12:10 p. m.». */
export function timeRange(startsAt: string, minutes: number, timeZone: string): string {
  const start = formatTime(startsAt, timeZone);
  const end = formatTime(new Date(new Date(startsAt).getTime() + minutes * 60_000), timeZone);
  const suffix = (t: string) => t.slice(t.indexOf(' '));
  return suffix(start) === suffix(end) ? `${start.slice(0, start.indexOf(' '))} – ${end}` : `${start} – ${end}`;
}

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const;
const SHORT_MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEPT', 'OCT', 'NOV', 'DIC'] as const;

const parts = (day: string) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return { y, m, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};

/** `2026-10-25` → «Domingo, 25 de octubre de 2026» (subtítulo de Citas). */
export function longDay(day: string): string {
  const { y, m, d, weekday } = parts(day);
  return `${WEEKDAYS[weekday] ?? ''}, ${String(d)} de ${MONTHS[m - 1] ?? ''} de ${String(y)}`;
}

/** Insignia de la próxima cita (S-PAC-06): «OCT» y «15». */
export function dayBadge(day: string): { month: string; day: string } {
  const { m, d } = parts(day);
  return { month: SHORT_MONTHS[m - 1] ?? '', day: String(d) };
}

/** «Hoy», «Mañana» o «Martes 3 de noviembre» (próxima cita). */
export function relativeDay(day: string, today: string, tomorrow: string): string {
  if (day === today) return 'Hoy';
  if (day === tomorrow) return 'Mañana';
  const { m, d, weekday } = parts(day);
  return `${WEEKDAYS[weekday] ?? ''} ${String(d)} de ${MONTHS[m - 1] ?? ''}`;
}

/** Proveedor en la tarjeta y el detalle: «Sin proveedor», «Yo · Nombre», el nombre o «Proveedor asignado». */
export function providerLabel(provider: AppointmentProvider | null, myMembershipId?: string): { text: string; unassigned: boolean } {
  if (!provider) return { text: 'Sin proveedor', unassigned: true };
  const name = provider.name || 'Proveedor asignado';
  return { text: provider.membershipId === myMembershipId ? `Yo · ${name}` : name, unassigned: false };
}

/** Nombre del tipo de cita; si el tipo está inactivo, su código (S-REC-07). */
export function typeLabel(type: { code: string; name: string; active: boolean }): string {
  return type.active ? type.name : type.code;
}

const timeFormats = new Map<string, Intl.DateTimeFormat>();

/** Hora local `HH:MM` (24 h) de un instante en la zona de la sede: el valor del campo Hora. */
export function localClock(value: string, timeZone: string): string {
  let format = timeFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    timeFormats.set(timeZone, format);
  }
  return format.format(new Date(value));
}

// --- Gestión de citas (T-015) ----------------------------------------------

/** Clave para Idempotency-Key: una por formulario abierto; reintentar el mismo envío no crea dos citas. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

const MESSAGES: Record<string, string> = {
  appointment_in_past: 'No se pueden agendar citas en días anteriores a hoy.',
  patient_inactive: 'No se pueden agendar citas a un paciente inactivo.',
  patient_merged: 'Esta acción no está permitida en el estado actual.',
  patient_not_found: 'No se encontró el paciente.',
  appointment_type_inactive: 'Ese tipo de cita ya no está activo. Elija otro.',
  appointment_type_not_found: 'Ese tipo de cita ya no está activo. Elija otro.',
  invalid_provider: 'Ese proveedor no está disponible en esta sede. Elija otro.',
  provider_scope: 'Solo puede gestionar las citas asignadas a usted.',
  location_inactive: 'La sede está inactiva: no se pueden agendar citas.',
  appointment_not_editable: 'Esta acción no está permitida en el estado actual.',
  invalid_appointment_transition: 'Esta acción no está permitida en el estado actual.',
  no_show_before_start: 'Solo se puede marcar como no presentado desde la hora de la cita.',
  appointment_not_found: 'No se encontró la cita.',
  missing_reason: 'Se requiere un motivo.',
  forbidden: 'No tiene permiso para realizar esta acción.',
  invalid_request: 'Algunos campos no son válidos. Revíselos.',
};

/** Mensaje de un error de citas; los demás, el genérico de la aplicación. */
export function appointmentMessage(error: unknown): string {
  if (error instanceof ApiError && MESSAGES[error.code]) return MESSAGES[error.code] ?? '';
  return userActionMessage(error);
}

/** ¿Es un conflicto de versión (S-REC-16)? */
export function isVersionConflict(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'version_conflict';
}

/** Texto del aviso de solapamiento (Stitch, S-REC-10): «{Proveedor} ya tiene una cita que se solapa a las 9:00 a. m.». */
export function overlapText(providerName: string, conflictStartsAt: string, timeZone: string): string {
  // La hora ya termina en punto («a. m.»): no se añade otro.
  return `${providerName || 'El proveedor'} ya tiene una cita que se solapa a las ${formatTime(conflictStartsAt, timeZone)}`;
}
