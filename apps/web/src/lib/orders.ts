import { ORDER_QUANTITY_MAX, ORDER_QUANTITY_MIN, type LabGroupChoice, type LabGroupPreview, type OrderableItem, type OrderView } from '@clinic/shared';
import { ApiError } from './api.ts';
import { userActionMessage } from './users.ts';

// Órdenes (T-025; S-CLI-17, 18 y 21): textos, errores y el borrador de
// «Nueva orden», sin React, para probarlo aparte. La web nunca suma importes:
// el «Cargo estimado» y el total los devuelve la API (CLAUDE.md, regla 4).
// El borrador vive solo en memoria (regla 9).

export const ORDER_CONFLICT_TEXT = 'Otro usuario actualizó esta orden. La lista se ha actualizado.';
export const ESTIMATE_NOTE = 'Las estimaciones provienen del catálogo; el estado de cuenta es la autoridad.';
export const NO_LAB_TEXT = 'Sin laboratorio asignado';

const MESSAGES: Record<string, string> = {
  encounter_closed: 'Esta consulta está cerrada.',
  encounter_not_found: 'No se encontró el registro solicitado.',
  price_unavailable: 'Este elemento no tiene precio vigente en esta sede.',
  item_inactive: 'Este elemento ya no está activo. Elija otro.',
  item_not_found: 'No se encontró el elemento elegido.',
  amount_too_large: 'El importe del cargo es demasiado alto. Revise la cantidad.',
  invalid_lab: 'Ese laboratorio no realiza todas las pruebas de esta orden.',
  lab_groups_changed: 'Los laboratorios disponibles cambiaron. Revise la sugerencia y vuelva a intentarlo.',
  lab_change_reason_required: 'Escriba el motivo del cambio de laboratorio.',
  lab_unchanged: 'La orden ya tiene ese laboratorio.',
  not_lab_order: 'Esta orden no es de laboratorio.',
  order_not_found: 'No se encontró la orden.',
  order_not_owned: 'Solo el proveedor que la ordenó o el proveedor de la consulta pueden cancelar esta orden.',
  order_closed: 'Esta orden ya está cerrada.',
  version_conflict: ORDER_CONFLICT_TEXT,
  forbidden: 'No tiene permiso para realizar esta acción.',
  invalid_request: 'Algunos campos no son válidos. Revíselos.',
};

/** Mensaje en «usted» de un error al actuar sobre una orden. */
export function orderMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const text = MESSAGES[error.code];
    if (text) return text;
  }
  return userActionMessage(error);
}

export function isOrderConflict(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'version_conflict';
}

/** «No se permiten órdenes ahora» (S-CLI-18): el servidor responde `encounter_not_orderable`. */
export function isNotOrderable(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'encounter_not_orderable';
}

/** Los grupos de laboratorio cambiaron entre la vista previa y la creación: se vuelve a pedir la vista previa. */
export function isLabGroupsChanged(error: unknown): boolean {
  return error instanceof ApiError && (error.code === 'lab_groups_changed' || error.code === 'invalid_lab');
}

/** «Cantidad» (S-CLI-18): solo dígitos, de 1 a 1000. Nulo si es válida. */
export function quantityError(text: string): string | null {
  if (!/^\d+$/.test(text.trim())) return 'Ingrese un número entero.';
  const value = Number(text.trim());
  if (value < ORDER_QUANTITY_MIN || value > ORDER_QUANTITY_MAX) return 'La cantidad debe estar entre 1 y 1000.';
  return null;
}

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

/** «Buscar por código o nombre»: sin distinguir mayúsculas ni acentos. */
export function filterOrderables(items: readonly OrderableItem[], query: string): OrderableItem[] {
  const q = fold(query.trim());
  if (!q) return [...items];
  return items.filter((i) => fold(i.code).includes(q) || fold(i.name).includes(q));
}

// --- Laboratorio del borrador -------------------------------------------------

/** Clave de un grupo: sus pruebas, en cualquier orden. */
export function groupKey(labTestIds: readonly string[]): string {
  return [...labTestIds].sort().join(',');
}

/** Laboratorio elegido por grupo; sin elección, el sugerido (o ninguno). */
export type LabChoices = Record<string, string | null>;

export function chosenLab(group: LabGroupPreview, choices: LabChoices): string | null {
  const key = groupKey(group.labTestIds);
  return key in choices ? (choices[key] ?? null) : (group.suggested?.id ?? null);
}

/** ¿Se cambió algún laboratorio sugerido? Entonces hace falta el motivo (ADR 0028). Con seguro no hay sugerido: elegir no es cambiar. */
export function labChanged(groups: readonly LabGroupPreview[], choices: LabChoices): boolean {
  return groups.some((g) => g.suggested !== null && chosenLab(g, choices) !== g.suggested.id);
}

/** Los grupos con el laboratorio elegido, para «Crear orden». */
export function labGroupsInput(groups: readonly LabGroupPreview[], choices: LabChoices): LabGroupChoice[] {
  return groups.map((g) => ({ labTestIds: g.labTestIds, labProviderId: chosenLab(g, choices) }));
}

// --- Sección «Órdenes» --------------------------------------------------------

/** Las canceladas se ocultan salvo con «Mostrar canceladas ({n})». */
export function visibleOrders(orders: readonly OrderView[], showCancelled: boolean): OrderView[] {
  return showCancelled ? [...orders] : orders.filter((o) => o.status !== 'CANCELLED');
}

/** «Ordenada por {nombre}» / «Usted». */
export function personText(person: OrderView['orderedBy'] | null): string {
  if (!person) return 'Sin asignar';
  return person.kind === 'me' ? 'Usted' : (person.name ?? 'Miembro del personal');
}
