import { formatDate, formatMoney } from '@clinic/ui';
import type { CatalogKind, CatalogPrice } from '@clinic/shared';
import { ApiError } from './api.ts';
import { userActionMessage } from './users.ts';

// Textos y formatos de Catálogos y precios (S-ADM-13 a 20, T-011).

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

/** El precio programado bajo el vigente: «Desde 31 oct: $40.00». */
export function nextPriceText(next: CatalogPrice): string {
  const [dayOfMonth, month] = formatDay(next.effectiveFrom).split(' ');
  return `Desde ${dayOfMonth ?? ''} ${month ?? ''}: ${formatMoney(next.amountCents)}`;
}

const MESSAGES: Record<string, string> = {
  catalog_code_taken: 'Este registro ya existe.',
  effective_from_past: 'La fecha de vigencia no puede ser anterior a hoy en la sede.',
  location_inactive: 'La sede está inactiva: no se le pueden poner precios.',
  catalog_item_already_active: 'Este registro ya está activo. Actualice la lista.',
  catalog_item_already_inactive: 'Este registro ya está inactivo. Actualice la lista.',
};

export function catalogMessage(error: unknown): string {
  if (error instanceof ApiError && MESSAGES[error.code]) return MESSAGES[error.code] ?? '';
  return userActionMessage(error);
}
