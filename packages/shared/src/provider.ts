import type { EncounterProvider } from './encounters.ts';
import type { AllergyNotice } from './nursing.ts';
import type { WaitLevel, WaitThresholds } from './panel.ts';
import type { VisitRoute, VisitStatus } from './visit.ts';

// Cola de proveedor (T-023; S-CLI-02). Tipos de la API y reglas puras de
// orden y filtro, las mismas en la API y en la web. Sin hora del sistema:
// el orden usa las horas de cada fila.

/** Estados de la cola, en el orden de sus grupos (S-CLI-02). «Procedimiento pendiente», de cualquier ruta. */
export const PROVIDER_QUEUE_STATUSES = ['WAITING_FOR_PROVIDER', 'WITH_PROVIDER', 'PROCEDURE_PENDING'] as const satisfies readonly VisitStatus[];
export type ProviderQueueStatus = (typeof PROVIDER_QUEUE_STATUSES)[number];

export interface ProviderQueueRow {
  id: string;
  code: string;
  status: ProviderQueueStatus;
  route: VisitRoute;
  version: number;
  arrivedAt: string;
  /** Entrada en el estado actual (ADR 0039: desde ahí cuentan «Alerta» y «Crítico»). */
  statusSince: string;
  /** «Enfermería lista {hora}»: el último «Enviar al proveedor». Nulo si no hubo enfermería. */
  nurseReadyAt: string | null;
  /** Desde cuándo espera al proveedor: al terminar enfermería o, si no hubo, a la llegada. */
  waitingSince: string;
  patient: { id: string; code: string; firstName: string; lastName: string };
  provider: EncounterProvider | null;
  appointmentType: string | null;
  /** Aviso de alergias de la tarjeta (ADR 0040; decisión del 2026-11-02). Nulo sin nursing.view. */
  allergies: AllergyNotice | null;
  /** ADR 0039: solo en «Esperando proveedor». */
  waitLevel: WaitLevel;
}

export interface ProviderQueue {
  serverNow: string;
  timeZone: string;
  rows: ProviderQueueRow[];
  myMembershipId: string;
  waitThresholds: WaitThresholds;
  /** «Iniciar consulta»: el rol Proveedor (dueño del paso en la máquina de estados). */
  canStart: boolean;
}

/** Orden de S-CLI-02: por grupo y, dentro de cada uno, la mayor espera primero (a igualdad, por código). */
export function compareProviderQueue(a: Pick<ProviderQueueRow, 'status' | 'waitingSince' | 'code'>, b: Pick<ProviderQueueRow, 'status' | 'waitingSince' | 'code'>): number {
  const group = PROVIDER_QUEUE_STATUSES.indexOf(a.status) - PROVIDER_QUEUE_STATUSES.indexOf(b.status);
  if (group !== 0) return group;
  const wait = new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime();
  if (wait !== 0) return wait;
  return a.code.localeCompare(b.code);
}

/** Filtros de S-CLI-02. «Mis pacientes» es el inicial (solo el rol Proveedor tiene la cola). */
export type ProviderQueueFilter = 'mine' | 'unassigned' | 'all';

export const PROVIDER_QUEUE_FILTERS: readonly { key: ProviderQueueFilter; label: string }[] = [
  { key: 'mine', label: 'Mis pacientes' },
  { key: 'unassigned', label: 'Sin asignar' },
  { key: 'all', label: 'Todos' },
];

export function inProviderFilter(row: Pick<ProviderQueueRow, 'provider'>, filter: ProviderQueueFilter, me: string): boolean {
  if (filter === 'mine') return row.provider?.membershipId === me;
  if (filter === 'unassigned') return row.provider === null;
  return true;
}
