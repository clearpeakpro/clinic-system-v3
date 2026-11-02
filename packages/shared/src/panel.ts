import type { EncounterProvider } from './encounters.ts';
import type { VisitRoute, VisitStatus } from './visit.ts';

// Panel en vivo de la sede (T-019; S-REC-01 a 05). Lo comparten la API y la
// web: la forma de la respuesta y el nivel de espera («Alerta» y «Crítico»,
// ADR 0039). Las métricas las calcula siempre el servidor con el día de la
// sede; la web solo filtra y ordena las filas que recibe.

/** Valores por defecto de cada organización (ADR 0039); los guarda `organizations`. */
export const DEFAULT_WAIT_ALERT_MINUTES = 5;
export const DEFAULT_WAIT_CRITICAL_MINUTES = 10;

export interface WaitThresholds {
  alertMinutes: number;
  criticalMinutes: number;
}

/** Estados de espera (ADR 0039): ni en atención, ni en Caja, ni cerradas. */
export const WAIT_ALERT_STATUSES: readonly VisitStatus[] = ['CHECKED_IN', 'WAITING_FOR_NURSE', 'WAITING_FOR_PROVIDER'];

export type WaitLevel = 'none' | 'alert' | 'critical';

export const WAIT_LEVEL_LABELS: Record<Exclude<WaitLevel, 'none'>, string> = {
  alert: 'Alerta',
  critical: 'Crítico',
};

/**
 * Nivel de espera de una visita (ADR 0039): desde que entró en su estado
 * actual hasta `now` (la hora del servidor). «Alerta» desde `alertMinutes`
 * cumplidos y «Crítico» desde `criticalMinutes` cumplidos.
 */
export function waitLevel(row: { status: VisitStatus; statusSince: string }, now: number, thresholds: WaitThresholds): WaitLevel {
  if (!WAIT_ALERT_STATUSES.includes(row.status)) return 'none';
  const elapsed = now - new Date(row.statusSince).getTime();
  if (elapsed >= thresholds.criticalMinutes * 60_000) return 'critical';
  if (elapsed >= thresholds.alertMinutes * 60_000) return 'alert';
  return 'none';
}

/** S-REC-02: las nueve tarjetas, calculadas por el servidor con el día de la sede. */
export interface PanelMetrics {
  /** Pacientes distintos con llegada hoy. */
  patientsToday: number;
  /** Abiertas de cualquier día en Registrado o Esperando enfermería. */
  waiting: number;
  withNurse: number;
  waitingForProvider: number;
  withProvider: number;
  procedurePending: number;
  readyForCheckout: number;
  checkout: number;
  /** Completadas cuyo cierre fue hoy. */
  completedToday: number;
}

/** S-REC-04: una fila de la lista. Solo nombre y código del paciente (mínimo necesario). */
export interface PanelRow {
  id: string;
  code: string;
  status: VisitStatus;
  route: VisitRoute;
  arrivedAt: string;
  /** Desde cuándo está en su estado actual (último cambio del historial). */
  statusSince: string;
  closedAt: string | null;
  patient: { id: string; code: string; firstName: string; lastName: string };
  provider: EncounterProvider | null;
  /** Nombre del tipo de cita; nulo = «Sin cita». */
  appointmentType: string | null;
  /** Nivel de espera a la hora `serverNow` de la respuesta. */
  waitLevel: WaitLevel;
}

/** `GET /api/panel`: una sola foto del Panel de la sede activa. */
export interface PanelSnapshot {
  serverNow: string;
  /** Hoy en la sede (`AAAA-MM-DD`). */
  today: string;
  timeZone: string;
  location: { id: string; code: string; name: string };
  /** «N citas hoy»: las de hoy menos Canceladas y No se presentó. */
  appointmentsToday: number;
  metrics: PanelMetrics;
  /** Abiertas de cualquier día y completadas hoy (por la hora de cierre), de la llegada más antigua a la más reciente. */
  rows: PanelRow[];
  /** Proveedores activos de la sede, por nombre (sin quien llama). */
  providers: EncounterProvider[];
  myMembershipId: string;
  waitThresholds: WaitThresholds;
}
