import { isOpenVisitStatus, waitLevel, type PanelMetrics, type PanelRow, type Role, type VisitStatus, type WaitLevel, type WaitThresholds } from '@clinic/shared';
import { useSyncExternalStore } from 'react';

// Panel en vivo (T-019; S-REC-01 a 05): filtros, búsqueda y orden de la lista,
// en el navegador y sin pedir datos. Las métricas y los niveles de espera de
// la respuesta los calcula el servidor; aquí solo se recalcula el nivel
// mientras pasa el tiempo (misma función, `waitLevel()` de @clinic/shared).

/**
 * Grupos de estados. Los seis primeros son los chips (S-REC-03); los demás,
 * tarjetas que no tienen chip propio (S-REC-02). «En espera» y «Completados
 * hoy» son a la vez tarjeta y chip.
 */
export type PanelGroup =
  | 'open'
  | 'nursing'
  | 'provider'
  | 'waiting'
  | 'checkout'
  | 'completed'
  | 'with_nurse'
  | 'waiting_provider'
  | 'with_provider'
  | 'procedure_pending'
  | 'ready_checkout'
  | 'in_checkout';

const OPEN: VisitStatus[] = ['CHECKED_IN', 'WAITING_FOR_NURSE', 'WITH_NURSE', 'WAITING_FOR_PROVIDER', 'WITH_PROVIDER', 'PROCEDURE_PENDING', 'READY_FOR_CHECKOUT', 'CHECKOUT'];

export const PANEL_GROUP_STATUSES: Record<PanelGroup, readonly VisitStatus[]> = {
  open: OPEN,
  nursing: ['CHECKED_IN', 'WAITING_FOR_NURSE', 'WITH_NURSE', 'PROCEDURE_PENDING'],
  provider: ['WAITING_FOR_PROVIDER', 'WITH_PROVIDER', 'PROCEDURE_PENDING'],
  waiting: ['CHECKED_IN', 'WAITING_FOR_NURSE'],
  checkout: ['READY_FOR_CHECKOUT', 'CHECKOUT'],
  // El servidor solo envía las completadas hoy (por su hora de cierre).
  completed: ['COMPLETED'],
  with_nurse: ['WITH_NURSE'],
  waiting_provider: ['WAITING_FOR_PROVIDER'],
  with_provider: ['WITH_PROVIDER'],
  procedure_pending: ['PROCEDURE_PENDING'],
  ready_checkout: ['READY_FOR_CHECKOUT'],
  in_checkout: ['CHECKOUT'],
};

/** Chips de estación (manual; «Caja» en lugar de «Cobro», CLAUDE.md regla 10). */
export const PANEL_CHIPS: { group: PanelGroup; label: string }[] = [
  { group: 'open', label: 'Todos los abiertos' },
  { group: 'nursing', label: 'Enfermería' },
  { group: 'provider', label: 'Proveedor' },
  { group: 'waiting', label: 'En espera' },
  { group: 'checkout', label: 'Caja' },
  { group: 'completed', label: 'Completados hoy' },
];

/** Tarjetas (S-REC-02), en el orden del manual. «Pacientes hoy» no filtra. */
export const PANEL_CARDS: { metric: keyof PanelMetrics; label: string; group: PanelGroup | null }[] = [
  { metric: 'patientsToday', label: 'Pacientes hoy', group: null },
  { metric: 'waiting', label: 'En espera', group: 'waiting' },
  { metric: 'withNurse', label: 'Con enfermería', group: 'with_nurse' },
  { metric: 'waitingForProvider', label: 'Esperando proveedor', group: 'waiting_provider' },
  { metric: 'withProvider', label: 'Con proveedor', group: 'with_provider' },
  { metric: 'procedurePending', label: 'Procedimiento pendiente', group: 'procedure_pending' },
  { metric: 'readyForCheckout', label: 'Listo para caja', group: 'ready_checkout' },
  { metric: 'checkout', label: 'En caja', group: 'in_checkout' },
  { metric: 'completedToday', label: 'Completados hoy', group: 'completed' },
];

/** Etiqueta del grupo activo: la del chip o, si no tiene, la de su tarjeta. */
export function groupLabel(group: PanelGroup): string {
  return PANEL_CHIPS.find((c) => c.group === group)?.label ?? PANEL_CARDS.find((c) => c.group === group)?.label ?? '';
}

export function isChipGroup(group: PanelGroup): boolean {
  return PANEL_CHIPS.some((c) => c.group === group);
}

/** «all», «mine» (solo rol Proveedor), «none» (Sin asignar) o la membresía de un proveedor. */
export type PanelProviderFilter = 'all' | 'mine' | 'none' | (string & {});

export interface PanelFilter {
  group: PanelGroup;
  provider: PanelProviderFilter;
}

/**
 * Filtro inicial por la unión de roles (manual, S-REC-01): con Administrador
 * o Recepción, «Todos los abiertos»; si no, con Proveedor, «Proveedor» +
 * «Mis pacientes»; si no, con Enfermería, «Enfermería».
 */
export function initialPanelFilter(roles: readonly Role[]): PanelFilter {
  if (roles.includes('administrador') || roles.includes('recepcion')) return { group: 'open', provider: 'all' };
  if (roles.includes('proveedor')) return { group: 'provider', provider: 'mine' };
  if (roles.includes('enfermeria')) return { group: 'nursing', provider: 'all' };
  return { group: 'open', provider: 'all' };
}

/** «Mis pacientes» solo con el rol Proveedor (S-REC-03). */
export function canFilterMine(roles: readonly Role[]): boolean {
  return roles.includes('proveedor');
}

export function matchesGroup(row: Pick<PanelRow, 'status'>, group: PanelGroup): boolean {
  return PANEL_GROUP_STATUSES[group].includes(row.status);
}

export function matchesProvider(row: Pick<PanelRow, 'provider'>, filter: PanelProviderFilter, myMembershipId: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'none') return row.provider === null;
  if (filter === 'mine') return row.provider?.membershipId === myMembershipId;
  return row.provider?.membershipId === filter;
}

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Búsqueda en la cola (ADR 0012): por nombre (sin distinguir acentos ni
 * mayúsculas, en cualquier orden de palabras) o por código del paciente o de
 * la visita, completo o corto. Solo filtra lo que ya está en pantalla.
 */
export function matchesSearch(row: Pick<PanelRow, 'code' | 'patient'>, search: string): boolean {
  const words = fold(search).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fold(`${row.patient.firstName} ${row.patient.lastName} ${row.patient.code} ${row.code}`);
  return words.every((w) => haystack.includes(w));
}

/** Orden (S-REC-03): mayor espera primero; en «Completados hoy», el cierre más reciente primero. */
export function sortRows(rows: readonly PanelRow[], group: PanelGroup): PanelRow[] {
  const time = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
  const sorted = [...rows];
  if (group === 'completed') sorted.sort((a, b) => time(b.closedAt) - time(a.closedAt) || a.code.localeCompare(b.code));
  else sorted.sort((a, b) => time(a.arrivedAt) - time(b.arrivedAt) || a.code.localeCompare(b.code));
  return sorted;
}

/** Filas visibles: grupo y proveedor combinados, más la búsqueda, ya ordenadas. */
export function visibleRows(rows: readonly PanelRow[], filter: PanelFilter, search: string, myMembershipId: string): PanelRow[] {
  return sortRows(
    rows.filter((r) => matchesGroup(r, filter.group) && matchesProvider(r, filter.provider, myMembershipId) && matchesSearch(r, search)),
    filter.group,
  );
}

/** Número de filas de cada chip con el filtro de proveedor actual (como en Stitch). */
export function chipCounts(rows: readonly PanelRow[], provider: PanelProviderFilter, myMembershipId: string): Record<PanelGroup, number> {
  const counts = Object.fromEntries(Object.keys(PANEL_GROUP_STATUSES).map((g) => [g, 0])) as Record<PanelGroup, number>;
  for (const row of rows) {
    if (!matchesProvider(row, provider, myMembershipId)) continue;
    for (const group of Object.keys(counts) as PanelGroup[]) if (matchesGroup(row, group)) counts[group] += 1;
  }
  return counts;
}

/** Nivel de espera de una fila ahora (hora del servidor estimada). */
export function rowWaitLevel(row: PanelRow, now: number, thresholds: WaitThresholds): WaitLevel {
  return waitLevel(row, now, thresholds);
}

const RANK: Record<WaitLevel, number> = { none: 0, alert: 1, critical: 2 };

/** La marca más grave de las visitas de una tarjeta. */
export function worstLevel(rows: readonly PanelRow[], group: PanelGroup, now: number, thresholds: WaitThresholds): WaitLevel {
  let worst: WaitLevel = 'none';
  for (const row of rows) {
    if (!matchesGroup(row, group)) continue;
    const level = rowWaitLevel(row, now, thresholds);
    if (RANK[level] > RANK[worst]) worst = level;
  }
  return worst;
}

/** «12 min» o «1 h 05 min» (S-REC-04). Nunca negativo. */
export function minutesText(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${String(minutes)} min`;
  return `${String(Math.floor(minutes / 60))} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/**
 * Tiempo de espera de la lista: desde la llegada hasta ahora (manual). En las
 * completadas, «Finalizada» (Stitch), para no seguir contando.
 */
export function waitingText(row: Pick<PanelRow, 'status' | 'arrivedAt'>, now: number): string {
  if (!isOpenVisitStatus(row.status)) return 'Finalizada';
  return minutesText(now - new Date(row.arrivedAt).getTime());
}

/** Minutos en el estado actual, para la marca de espera. */
export function inStatusText(row: Pick<PanelRow, 'statusSince'>, now: number): string {
  return minutesText(now - new Date(row.statusSince).getTime());
}

/** Código corto sin la sede: `NOR1-P-000123` → `P-000123`. */
export function shortCode(code: string): string {
  const parts = code.split('-');
  return parts.length > 2 ? parts.slice(-2).join('-') : code;
}

/** «Sin asignar», «Usted», el nombre o «Asignado» si no se conoce (S-REC-04). */
export function providerLabel(row: Pick<PanelRow, 'provider'>, myMembershipId: string): { text: string; unassigned: boolean } {
  if (!row.provider) return { text: 'Sin asignar', unassigned: true };
  if (row.provider.membershipId === myMembershipId) return { text: 'Usted', unassigned: false };
  return { text: row.provider.name || 'Asignado', unassigned: false };
}

/** Etiqueta del menú de proveedor (S-REC-03). Un proveedor que ya no está en el directorio: «Asignado». */
export function providerFilterLabel(filter: PanelProviderFilter, providers: readonly { membershipId: string; name: string }[]): string {
  if (filter === 'all') return 'Todos los proveedores';
  if (filter === 'mine') return 'Mis pacientes';
  if (filter === 'none') return 'Sin asignar';
  return providers.find((p) => p.membershipId === filter)?.name ?? 'Asignado';
}

/** «Sin citas hoy», «1 cita hoy» o «{n} citas hoy» (manual, S-REC-01). */
export function todayText(count: number): string {
  if (count === 0) return 'Sin citas hoy';
  return count === 1 ? '1 cita hoy' : `${String(count)} citas hoy`;
}

// --- Filtro de la sesión ---------------------------------------------------
// Dura toda la sesión (no se pierde al navegar y volver) y se borra al cerrar
// sesión. Solo en memoria: no lleva datos de pacientes, pero tampoco hace
// falta guardarlo. La búsqueda no se guarda.

let chosen: PanelFilter | null = null;
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

export const panelPrefs = {
  set(next: PanelFilter) {
    chosen = next;
    notify();
  },
  /** «Restablecer filtros»: vuelve al filtro inicial del rol. */
  clear() {
    chosen = null;
    notify();
  },
  /** Al cerrar sesión. */
  reset() {
    chosen = null;
    notify();
  },
};

export function usePanelFilter(roles: readonly Role[]): PanelFilter {
  useSyncExternalStore(subscribe, () => version);
  return chosen ?? initialPanelFilter(roles);
}
