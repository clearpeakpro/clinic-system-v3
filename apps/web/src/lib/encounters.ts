import {
  basisPointsToPercent,
  centsToDecimal,
  COVERAGE_MESSAGES,
  INSURANCE_TERM_LABELS,
  isOpenVisitStatus,
  parseMoneyToCents,
  parsePercentToBasisPoints,
  VISIT_STATUS_LABELS,
  type ArrivalCoverageInput,
  type EncounterCoverage,
  type EncounterTimelineEntry,
  type InsuranceTerm,
  type VisitStatus,
} from '@clinic/shared';
import { formatMoney } from '@clinic/ui';
import { ApiError } from './api.ts';
import { userActionMessage } from './users.ts';

// Pantalla de la visita (T-018; S-CLI-04 a 12, S-CLI-24): textos, errores,
// cronómetros y el borrador de la cobertura. Sin React, para probarlo aparte.
// Ninguna función lee la hora: reciben `now` (reglas de la fase 3). El
// borrador de la cobertura vive solo en memoria (CLAUDE.md, regla 9).

export const VERSION_CONFLICT_TEXT = 'Otra persona actualizó esta visita. La pantalla se ha actualizado.';
export const REOPEN_BLOCKED_TEXT = 'El paciente ya tiene una visita abierta en esta sede.';

const MESSAGES: Record<string, string> = {
  invalid_transition: 'Esta transición no está permitida en el estado actual.',
  transition_not_owned: 'Su rol no realiza este paso.',
  encounter_closed: 'La visita ya está cerrada.',
  version_conflict: VERSION_CONFLICT_TEXT,
  open_orders: 'Esta visita aún tiene órdenes pendientes o en curso. Complételas o cancélelas antes de continuar.',
  // T-028 (ADR 0042): con órdenes completadas no se cancela.
  completed_orders: 'Esta visita tiene órdenes completadas: no se puede cancelar. Ciérrela como «Se retiró antes».',
  invalid_provider: 'Ese usuario no es un proveedor activo en esta sede.',
  assign_not_allowed: 'Solo recepción o administradores pueden asignar un proveedor; los proveedores pueden asignarse a sí mismos.',
  encounter_already_open: REOPEN_BLOCKED_TEXT,
  encounter_not_found: 'No se encontró el registro solicitado.',
  coverage_not_found: 'No se encontró el registro solicitado.',
  membership_not_active: 'El paciente no tiene una membresía activa hoy. Elija otra cobertura.',
  forbidden: 'No tiene permiso para realizar esta acción.',
  no_active_context: 'No está autorizado para esta sede.',
  invalid_request: 'Algunos campos no son válidos. Revíselos.',
  // Enfermería (T-022; textos del manual, S-CLI-14 a 16).
  nursing_locked: 'Los datos de enfermería están bloqueados para esta visita.',
  vitals_required: 'Registre peso o presión arterial antes de enviar al proveedor.',
  not_with_nurse: 'La enfermería solo puede completarse mientras el paciente está con enfermería.',
  invalid_vitals: 'Un valor está fuera del rango aceptado.',
  // Proveedor (T-023).
  assigned_to_other: 'Esta visita está asignada a otro proveedor. Para tomarla, use «Asignarme».',
};

/** «Órdenes abiertas» (S-CLI-08): el servidor bloquea pasar a Caja con órdenes pendientes o en curso. */
export function isOpenOrders(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'open_orders';
}

/** Mensaje en «usted» de un error al actuar sobre la visita. */
export function encounterMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const text = MESSAGES[error.code];
    if (text) return text;
  }
  return userActionMessage(error);
}

export function isVersionConflict(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'version_conflict';
}

/**
 * Aviso tras un cambio de estado (S-CLI-07). El manual decía «Visita movida a
 * Se retiró.»: con los cierres se usa una frase propia.
 */
export function movedText(status: VisitStatus): string {
  if (status === 'LEFT_EARLY') return 'Visita cerrada: el paciente se retiró.';
  if (status === 'CANCELLED') return 'Visita cancelada.';
  return `Visita movida a ${VISIT_STATUS_LABELS[status]}.`;
}

// --- Cronómetros (S-CLI-05) ------------------------------------------------

/** Desfase entre el reloj del servidor y el del dispositivo, en ms (para no depender de la hora de la tableta). */
export function clockOffset(serverNow: string, deviceNow: number): number {
  return new Date(serverNow).getTime() - deviceNow;
}

/** Duración «mm:ss» o, desde una hora, «h:mm:ss». Nunca negativa. */
export function durationText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${String(h)}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

/**
 * Tiempos de espera del encabezado: total desde el registro (hasta el cierre
 * si está cerrada) y en el estado actual (solo abierta). `now` es la hora del
 * servidor estimada (dispositivo + desfase).
 */
export function waitingTimes(e: { status: VisitStatus; arrivedAt: string; closedAt: string | null; statusSince: string }, now: number): { total: string; inStatus: string | null } {
  const end = e.closedAt && !isOpenVisitStatus(e.status) ? new Date(e.closedAt).getTime() : now;
  return {
    total: durationText(end - new Date(e.arrivedAt).getTime()),
    inStatus: isOpenVisitStatus(e.status) ? durationText(now - new Date(e.statusSince).getTime()) : null,
  };
}

// --- Historial (S-CLI-24) --------------------------------------------------

/** Quién hizo el cambio: «Usted», su nombre, «Kiosco», «Sistema» o «Personal» si no se conoce. */
export function actorText(actor: EncounterTimelineEntry['actor']): string {
  switch (actor.kind) {
    case 'me':
      return 'Usted';
    case 'kiosk':
      return 'Kiosco';
    case 'system':
      return 'Sistema';
    case 'user':
      return actor.name ?? 'Personal';
  }
}

// --- Cobertura (S-CLI-11/12) -----------------------------------------------

/** Pares etiqueta / valor de la tarjeta, solo de lo informado. Los importes llegan en centavos; aquí solo se les da formato. */
export function coverageRows(c: EncounterCoverage): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (c.insurerName) rows.push({ label: 'Aseguradora', value: c.insurerName });
  if (c.memberId) rows.push({ label: 'ID de miembro', value: c.memberId });
  if (c.term === 'coinsurance' && c.coinsuranceBp !== null) rows.push({ label: INSURANCE_TERM_LABELS.coinsurance, value: `${basisPointsToPercent(c.coinsuranceBp)} %` });
  if (c.term && c.term !== 'coinsurance' && c.amountCents !== null) rows.push({ label: INSURANCE_TERM_LABELS[c.term], value: formatMoney(c.amountCents) });
  if (c.membership) rows.push({ label: 'Plan de membresía', value: c.membership.planName }, { label: 'Membresía', value: c.membership.code });
  return rows;
}

/** Coberturas del diálogo. «Membresía» (T-026b) solo con una membresía activa hoy; el plan sale de ella. */
export type CoverageDraftType = 'self_pay' | 'insurance' | 'membership';

export interface CoverageDraft {
  type: CoverageDraftType;
  insurerName: string;
  memberId: string;
  term: InsuranceTerm;
  value: string;
}

/** El borrador del diálogo a partir de la cobertura guardada (o «Pago directo» si no hay). */
export function coverageDraft(c: EncounterCoverage | null): CoverageDraft {
  if (c?.type === 'membership') return { type: 'membership', insurerName: '', memberId: '', term: 'copay', value: '' };
  if (c?.type !== 'insurance') return { type: 'self_pay', insurerName: '', memberId: '', term: 'copay', value: '' };
  const term = c.term ?? 'copay';
  const value = term === 'coinsurance' ? (c.coinsuranceBp !== null ? basisPointsToPercent(c.coinsuranceBp) : '') : c.amountCents !== null ? centsToDecimal(c.amountCents) : '';
  return { type: 'insurance', insurerName: c.insurerName ?? '', memberId: c.memberId ?? '', term, value };
}

/** Cambiar de término vacía el valor (como en la llegada): 20 de copago no pasa a ser 20 %. */
export function withCoverageTerm(draft: CoverageDraft, term: InsuranceTerm): CoverageDraft {
  return term === draft.term ? draft : { ...draft, term, value: '' };
}

/** Errores del borrador por campo (los mismos textos que la llegada); vacío si se puede guardar. */
export function coverageIssues(draft: CoverageDraft): { insurerName?: string; value?: string } {
  if (draft.type !== 'insurance') return {};
  const issues: { insurerName?: string; value?: string } = {};
  if (!draft.insurerName.trim()) issues.insurerName = COVERAGE_MESSAGES.insurerName;
  const valid = draft.term === 'coinsurance' ? parsePercentToBasisPoints(draft.value) !== null : parseMoneyToCents(draft.value) !== null;
  if (!valid) issues.value = draft.term === 'coinsurance' ? COVERAGE_MESSAGES.percent : COVERAGE_MESSAGES.money;
  return issues;
}

/** Lo que se envía: solo los campos del tipo elegido. El servidor convierte a centavos. */
export function coverageDraftInput(draft: CoverageDraft): ArrivalCoverageInput {
  if (draft.type === 'self_pay') return { type: 'self_pay' };
  if (draft.type === 'membership') return { type: 'membership' };
  return { type: 'insurance', insurerName: draft.insurerName.trim(), memberId: draft.memberId.trim() || null, term: draft.term, value: draft.value.trim() };
}

/** ¿Cambió algo respecto a lo guardado? (Estado «sucio», S-CLI-26.) */
export function coverageDirty(draft: CoverageDraft, saved: EncounterCoverage | null): boolean {
  return JSON.stringify(coverageDraftInput(draft)) !== JSON.stringify(coverageDraftInput(coverageDraft(saved)));
}
