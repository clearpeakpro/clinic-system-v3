import { CHARGE_QUANTITY_MAX, type ChargeItemGroup, type ChargeOption, type StatementStatus, type StatementTotals } from '@clinic/shared';
import { formatMoney, type SEMANTIC_TONES } from '@clinic/ui';
import { ApiError } from './api.ts';
import { PRICE_UNAVAILABLE_TEXT } from './orders.ts';
import { userActionMessage } from './users.ts';

// Caja (T-027; S-CAJ-01 a 08, S-CAJ-16): textos, errores y filtros, sin React,
// para probarlos aparte. La web NUNCA suma, resta ni multiplica importes: los
// totales, el «Total línea» y el saldo llegan calculados del servidor
// (CLAUDE.md, regla 4) y aquí solo se les da formato o se eligen etiquetas.

export const BILLING_CONFLICT_TEXT = 'Otra persona actualizó el estado de cuenta. Se ha actualizado.';
export const OPEN_ORDERS_TEXT = 'Esta visita aún tiene órdenes pendientes o en curso. Complételas o cancélelas antes de continuar.';
export const CLOSED_STATEMENT_TEXT = 'Esta visita está cerrada. El estado de cuenta es de solo lectura.';
// T-028 (textos del manual, S-CAJ-10 a 13; «Cancelada»: ADR 0042).
export const VOIDED_STATEMENT_TEXT = 'Esta visita fue cancelada: el estado de cuenta está anulado y no admite más cambios. Lo pagado queda como crédito a favor.';
export const NOTHING_DUE_TEXT = 'No hay nada pendiente en este estado de cuenta.';
export const AMOUNT_EXCEEDS_TEXT = 'El monto supera el saldo actual. El estado de cuenta se ha actualizado.';
export const REFERENCE_HINT = 'Número de cheque o de autorización de la terminal. Solo se guardan los últimos 4 caracteres.';
export const VOID_CHARGE_PAID_TEXT = 'Si el cargo ya está pagado, el paciente quedará con crédito a favor: en V1 no hay reembolsos.';
export const VOID_PAYMENT_RECEIPTS_TEXT = 'Los recibos ya emitidos no cambian: siguen mostrando este pago.';
export const VOID_CANCELS_MEMBERSHIP_TEXT = 'Esto cancelará la membresía: la cuota vuelve a quedar sin pagar y ya pasó su plazo de 30 días. La cuota quedará anulada, sin deuda.';
export const CANCEL_BLOCKED_TEXT = 'Esta visita tiene órdenes completadas: no se puede cancelar. Ciérrela como «Se retiró antes»; su saldo quedará en la cuenta del paciente.';

const MESSAGES: Record<string, string> = {
  encounter_closed: 'La visita ya está cerrada.',
  encounter_not_found: 'No se encontró la visita.',
  price_unavailable: PRICE_UNAVAILABLE_TEXT,
  item_inactive: 'Este servicio ya no está activo. Elija otro.',
  item_not_found: 'No se encontró el servicio elegido.',
  amount_too_large: 'El importe del cargo es demasiado alto. Revise la cantidad.',
  version_conflict: BILLING_CONFLICT_TEXT,
  open_orders: OPEN_ORDERS_TEXT,
  invalid_transition: 'Esta transición no está permitida en el estado actual.',
  transition_not_owned: 'Su rol no realiza este paso.',
  forbidden: 'No tiene permiso para realizar esta acción.',
  invalid_request: 'Algunos campos no son válidos. Revíselos.',
  nothing_due: NOTHING_DUE_TEXT,
  amount_exceeds_balance: AMOUNT_EXCEEDS_TEXT,
  statement_voided: 'Esta visita fue cancelada; el estado de cuenta está anulado.',
  charge_from_order: 'Los cargos de órdenes se anulan cancelando la orden, no aquí.',
  charge_already_voided: 'Este cargo ya está anulado.',
  charge_not_found: 'No se encontró el cargo.',
  payment_already_voided: 'Este pago ya está anulado.',
  payment_not_found: 'No se encontró el pago.',
  fee_not_pending: 'Esta cuota ya no está pendiente.',
  fee_not_found: 'No se encontró la cuota.',
  completed_orders: CANCEL_BLOCKED_TEXT,
  membership_cancelled: 'La membresía está cancelada.',
};

/** Mensaje en «usted» de un error en Caja. */
export function billingMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const text = MESSAGES[error.code];
    if (text) return text;
  }
  return userActionMessage(error);
}

export function isBillingConflict(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'version_conflict';
}

/** «Completar visita» con saldo (S-CAJ-05): el servidor lo rechaza con el saldo; nulo si es otro error. */
export function pendingBalance(error: unknown): number | null {
  if (!(error instanceof ApiError) || error.code !== 'balance_pending') return null;
  const cents = error.details.balanceCents;
  return typeof cents === 'number' && Number.isSafeInteger(cents) ? cents : null;
}

/** S-CAJ-05: el mensaje del diálogo, con el saldo exacto del servidor. */
export function completeWithBalanceText(balanceCents: number): string {
  return `Queda un saldo de ${formatMoney(balanceCents)}. Permanecerá en la cuenta del paciente como saldo abierto. ¿Completar la visita de todos modos?`;
}

/** Subtítulo de la cola (S-CAJ-01). */
export function checkoutQueueSubtitle(count: number): string {
  if (count === 0) return 'Sin visitas en Caja';
  return count === 1 ? '1 visita en Caja' : `${String(count)} visitas en Caja`;
}

/** Tono del chip de estado del estado de cuenta: «Abierto» ámbar, «Pago parcial» azul, «Pagado» verde (S-CAJ-07). */
export const STATEMENT_STATUS_TONE: Record<StatementStatus, keyof typeof SEMANTIC_TONES> = { open: 'warning', partial: 'info', paid: 'success', voided: 'neutral' };

/** Las filas de totales (S-CAJ-07 y S-CAJ-16), en el orden del ADR 0035, con los importes tal como llegan. */
export function totalRows(t: StatementTotals): { key: string; label: string; cents: number; strong?: boolean }[] {
  return [
    { key: 'subtotal', label: 'Subtotal', cents: t.subtotalCents },
    { key: 'discount', label: 'Descuento total', cents: t.discountCents },
    { key: 'insurance', label: 'A cargo del seguro', cents: t.insuranceCents },
    { key: 'due', label: 'Total a pagar', cents: t.totalDueCents, strong: true },
    { key: 'paid', label: 'Pagado', cents: t.paidCents },
  ];
}

/**
 * «Monto (USD)» de «Registrar pago» (S-CAJ-11). Los centavos ya vienen del
 * campo de dinero; aquí solo se comparan con el saldo del servidor (tope).
 */
export function paymentAmountError(text: string, cents: number | null, balanceCents: number): string | null {
  if (text.trim() === '') return 'Ingrese un monto.';
  if (cents === null) return 'Ingrese un monto válido con hasta dos decimales.';
  if (cents <= 0) return 'El monto debe ser mayor que cero.';
  if (cents > balanceCents) return 'El monto supera el saldo.';
  return null;
}

/** «Ref. ••••1234» (S-CAJ-12): solo los últimos 4 caracteres que guarda el servidor. */
export function maskedReference(last4: string | null): string | null {
  return last4 ? `Ref. ••••${last4}` : null;
}

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();

/** «Agregar cargo» (S-CAJ-08): los servicios de un grupo que coinciden con lo escrito (nombre o código). */
export function filterChargeOptions(items: readonly ChargeOption[], group: ChargeItemGroup, query: string): ChargeOption[] {
  const q = fold(query);
  return items.filter((i) => i.group === group && (q === '' || fold(i.name).includes(q) || fold(i.code).includes(q)));
}

/** «Cantidad» (S-CAJ-08): solo dígitos, de 1 a 1000. Nulo si es válida. */
export function chargeQuantityError(text: string): string | null {
  if (!/^\d+$/.test(text.trim())) return 'Ingrese un número entero.';
  const value = Number(text.trim());
  if (value < 1 || value > CHARGE_QUANTITY_MAX) return `La cantidad debe estar entre 1 y ${String(CHARGE_QUANTITY_MAX)}.`;
  return null;
}
