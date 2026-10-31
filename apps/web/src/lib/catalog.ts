import { formatDate, formatMoney } from '@clinic/ui';
import type { CatalogItem, CatalogKind, CatalogPrice, LabCost, LabProvider } from '@clinic/shared';
import { ApiError } from './api.ts';
import { userActionMessage } from './users.ts';

// Textos y formatos de Catálogos y precios (S-ADM-13 a 20, T-011) y de los
// laboratorios (S-ADM-16 y 17, T-011b).

/** «Nuevo procedimiento», «Nueva prueba de laboratorio»… (botón y título del formulario). */
export const NEW_LABELS: Record<CatalogKind, string> = {
  'appointment-types': 'Nuevo tipo de cita',
  procedures: 'Nuevo procedimiento',
  'lab-tests': 'Nueva prueba de laboratorio',
  'referral-sources': 'Nueva fuente de referido',
};

export const EDIT_LABELS: Record<CatalogKind, string> = {
  'appointment-types': 'Editar tipo de cita',
  procedures: 'Editar procedimiento',
  'lab-tests': 'Editar prueba de laboratorio',
  'referral-sources': 'Editar fuente de referido',
};

/** Una fecha `AAAA-MM-DD` (sin hora ni zona): «1 ene 2026». */
export function formatDay(day: string): string {
  return formatDate(`${day}T12:00:00Z`, 'UTC');
}

/**
 * El precio programado bajo el vigente: «Desde 31 oct: $40.00», o «Desde 31
 * oct: usa el precio general» si la sede vuelve al general (P-15).
 */
export function nextPriceText(next: CatalogPrice): string {
  const [dayOfMonth, month] = formatDay(next.effectiveFrom).split(' ');
  return `Desde ${dayOfMonth ?? ''} ${month ?? ''}: ${next.amountCents === null ? 'usa el precio general' : formatMoney(next.amountCents)}`;
}

/** El costo programado de un laboratorio: «Desde 31 oct: $17.00» o «Desde 31 oct: no la realiza». */
export function nextLabCostText(next: LabCost): string {
  const [dayOfMonth, month] = formatDay(next.effectiveFrom).split(' ');
  return `Desde ${dayOfMonth ?? ''} ${month ?? ''}: ${next.amountCents === null ? 'no la realiza' : formatMoney(next.amountCents)}`;
}

/**
 * «Sin laboratorio asignado» (ADR 0028): ningún laboratorio activo la realiza
 * hoy, así que no se podría sugerir laboratorio para ella.
 */
export function hasNoLab(item: CatalogItem, providers: readonly LabProvider[]): boolean {
  const active = new Set(providers.filter((p) => p.active).map((p) => p.id));
  return !(item.labs ?? []).some((l) => active.has(l.labProviderId) && l.current !== null && l.current.amountCents !== null);
}

/** Un precio con importe (el general siempre; el de una sede, salvo «Usa el precio general»). */
export function withAmount(price: CatalogPrice | null | undefined): (CatalogPrice & { amountCents: number }) | null {
  return price && price.amountCents !== null ? { ...price, amountCents: price.amountCents } : null;
}

const MESSAGES: Record<string, string> = {
  catalog_code_taken: 'Este registro ya existe.',
  effective_from_past: 'La fecha de vigencia no puede ser anterior a hoy en la sede.',
  location_inactive: 'La sede está inactiva: no se le pueden poner precios.',
  no_location_price: 'Esta sede ya usa el precio general.',
  catalog_item_already_active: 'Este registro ya está activo. Actualice la lista.',
  catalog_item_already_inactive: 'Este registro ya está inactivo. Actualice la lista.',
  lab_provider_name_taken: 'Ya existe un laboratorio con este nombre.',
  lab_provider_already_active: 'Este laboratorio ya está activo. Actualice la lista.',
  lab_provider_already_inactive: 'Este laboratorio ya está inactivo. Actualice la lista.',
  lab_provider_inactive: 'Un laboratorio inactivo no se puede marcar. Actualice la lista.',
  invalid_lab_provider: 'Ese laboratorio ya no existe. Actualice la lista.',
  lab_not_assigned: 'Ese laboratorio no realiza esta prueba. Actualice la lista.',
};

export function catalogMessage(error: unknown): string {
  if (error instanceof ApiError && MESSAGES[error.code]) return MESSAGES[error.code] ?? '';
  return userActionMessage(error);
}
