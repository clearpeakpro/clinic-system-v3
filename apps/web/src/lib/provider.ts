import { consultStart, inProviderFilter, type ProviderQueueFilter, type ProviderQueueRow } from '@clinic/shared';
import { matchesSearch } from './panel.ts';

// Cola de proveedor en la web (T-023; S-CLI-02): filtros, contadores, textos
// y el botón de cada tarjeta. Sin React y sin la hora del dispositivo, para
// probarlo aparte.

// El filtro elegido se recuerda durante la sesión (S-CLI-02), solo en
// memoria: no es PHI, pero tampoco hace falta guardarlo en el navegador.
let rememberedFilter: ProviderQueueFilter = 'mine';

export function rememberedProviderFilter(): ProviderQueueFilter {
  return rememberedFilter;
}

export function rememberProviderFilter(filter: ProviderQueueFilter): void {
  rememberedFilter = filter;
}

/** Filas visibles con el filtro y la búsqueda (ADR 0012); el orden es el del servidor. */
export function providerQueueRows(rows: readonly ProviderQueueRow[], filter: ProviderQueueFilter, search: string, me: string): ProviderQueueRow[] {
  return rows.filter((r) => inProviderFilter(r, filter, me) && matchesSearch(r, search));
}

export function providerQueueCounts(rows: readonly ProviderQueueRow[], me: string): Record<ProviderQueueFilter, number> {
  return {
    mine: rows.filter((r) => inProviderFilter(r, 'mine', me)).length,
    unassigned: rows.filter((r) => inProviderFilter(r, 'unassigned', me)).length,
    all: rows.length,
  };
}

/** Subtítulo según el filtro activo (S-CLI-02). */
export function providerQueueSubtitle(count: number): string {
  if (count === 0) return 'Sin pacientes';
  return count === 1 ? '1 paciente' : `${String(count)} pacientes`;
}

/** «Sin asignar», «Asignado a mí», el nombre o «Asignado» (S-CLI-02). */
export function providerQueueLabel(row: Pick<ProviderQueueRow, 'provider'>, me: string): { text: string; unassigned: boolean } {
  if (!row.provider) return { text: 'Sin asignar', unassigned: true };
  if (row.provider.membershipId === me) return { text: 'Asignado a mí', unassigned: false };
  return { text: row.provider.name || 'Asignado', unassigned: false };
}

/**
 * Botón principal de la tarjeta:
 *  - «Iniciar consulta»: rol Proveedor, «Esperando proveedor» y sin asignar o
 *    suya (la de otro proveedor la rechaza el servidor, decisión del 2026-11-02);
 *  - «Continuar visita»: «Con proveedor» y suya (Stitch, decisión del 2026-11-02);
 *  - si no, solo «Abrir».
 */
export type ProviderCardAction = 'start' | 'continue' | 'open';

export function providerCardAction(row: Pick<ProviderQueueRow, 'status' | 'provider'>, me: string, canStart: boolean): ProviderCardAction {
  if (row.status === 'WAITING_FOR_PROVIDER' && canStart && consultStart(row.provider?.membershipId ?? null, me) !== 'assigned_to_other') return 'start';
  if (row.status === 'WITH_PROVIDER' && row.provider?.membershipId === me) return 'continue';
  return 'open';
}

/** Espera al proveedor (S-CLI-02): oculta en «Procedimiento pendiente». */
export function showsProviderWait(row: Pick<ProviderQueueRow, 'status'>): boolean {
  return row.status !== 'PROCEDURE_PENDING';
}
