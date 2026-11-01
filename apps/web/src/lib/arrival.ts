import {
  APPOINTMENT_STATUS_LABELS,
  COVERAGE_MESSAGES,
  parseMoneyToCents,
  parsePercentToBasisPoints,
  type AppointmentStatus,
  type ArrivalCoverageInput,
  type ArrivalInput,
  type InsuranceTerm,
  type VisitRoute,
} from '@clinic/shared';
import { ApiError } from './api.ts';
import { userActionMessage } from './users.ts';

// Asistente de llegada (S-REC-20 a 26; T-017): pasos, validación por paso y
// mensajes. Sin React, para probarlo aparte. El borrador vive solo en memoria
// (CLAUDE.md, regla 9): nunca va al almacenamiento del navegador. Los importes
// se validan como texto («25.00»); el servidor los convierte a centavos.

export type ArrivalStep = 'patient' | 'site' | 'route' | 'coverage' | 'payer' | 'confirm';

export const STEP_TITLES: Record<ArrivalStep, string> = {
  patient: 'Paciente',
  site: 'Sede',
  route: 'Ruta',
  coverage: 'Cobertura',
  payer: 'Datos del pagador',
  confirm: 'Confirmar',
};

/** Coberturas de la parte 3A (ADR 0034): «Membresía» llega con T-026b. */
export type DraftCoverage = 'self_pay' | 'insurance';

export interface ArrivalDraft {
  identityVerified: boolean;
  siteConfirmed: boolean;
  /** Solo sin cita: «Tipo de cita» (nulo = «Sin tipo de cita»). */
  appointmentTypeId: string | null;
  route: VisitRoute;
  coverage: DraftCoverage;
  insurerName: string;
  memberId: string;
  term: InsuranceTerm;
  value: string;
}

export function emptyDraft(route: VisitRoute): ArrivalDraft {
  return {
    identityVerified: false,
    siteConfirmed: false,
    appointmentTypeId: null,
    route,
    coverage: 'self_pay',
    insurerName: '',
    memberId: '',
    term: 'copay',
    value: '',
  };
}

/** 5 pasos con Pago directo; 6 con Seguro (S-REC-20). */
export function arrivalSteps(draft: Pick<ArrivalDraft, 'coverage'>): ArrivalStep[] {
  return draft.coverage === 'self_pay' ? ['patient', 'site', 'route', 'coverage', 'confirm'] : ['patient', 'site', 'route', 'coverage', 'payer', 'confirm'];
}

/** Cambiar de término vacía el valor: en el manual se conservaba (20 de copago pasaba a ser 20 %). */
export function withTerm(draft: ArrivalDraft, term: InsuranceTerm): ArrivalDraft {
  return term === draft.term ? draft : { ...draft, term, value: '' };
}

/** «Nombre del seguro» con mayúscula inicial por palabra (S-REC-25), sin tocar el resto. */
export function capitalizeWords(text: string): string {
  return text.replace(/(^|\s)(\p{Ll})/gu, (_m: string, space: string, letter: string) => `${space}${letter.toUpperCase()}`);
}

/** Incidencias de un paso (banner ámbar del marco); vacío si se puede continuar. */
export function stepIssues(step: ArrivalStep, draft: ArrivalDraft, siteActive: boolean): string[] {
  switch (step) {
    case 'patient':
      return draft.identityVerified ? [] : ['Verifique la identidad del paciente antes de continuar.'];
    case 'site':
      if (!siteActive) return ['Esta sede está inactiva. No es posible registrar llegadas aquí.'];
      return draft.siteConfirmed ? [] : ['Confirme la sede antes de continuar.'];
    case 'route':
    case 'coverage':
      return [];
    case 'payer': {
      if (draft.coverage !== 'insurance') return [];
      const issues: string[] = [];
      if (!draft.insurerName.trim()) issues.push(COVERAGE_MESSAGES.insurerName);
      if (draft.term === 'coinsurance' ? parsePercentToBasisPoints(draft.value) === null : parseMoneyToCents(draft.value) === null) {
        issues.push(draft.term === 'coinsurance' ? COVERAGE_MESSAGES.percent : COVERAGE_MESSAGES.money);
      }
      return issues;
    }
    case 'confirm':
      // Revalidación completa antes de enviar (S-REC-26).
      return arrivalSteps(draft)
        .filter((s) => s !== 'confirm')
        .flatMap((s) => stepIssues(s, draft, siteActive));
  }
}

export function coverageInput(draft: ArrivalDraft): ArrivalCoverageInput {
  if (draft.coverage === 'self_pay') return { type: 'self_pay' };
  return {
    type: 'insurance',
    insurerName: draft.insurerName.trim(),
    memberId: draft.memberId.trim() || null,
    term: draft.term,
    value: draft.value.trim(),
  };
}

export function arrivalInput(
  draft: ArrivalDraft,
  target: { kind: 'appointment'; appointmentId: string; version: number } | { kind: 'walk_in'; patientId: string },
): ArrivalInput {
  const coverage = coverageInput(draft);
  if (target.kind === 'appointment') {
    return { source: 'appointment', appointmentId: target.appointmentId, expectedVersion: target.version, route: draft.route, coverage };
  }
  return { source: 'walk_in', patientId: target.patientId, appointmentTypeId: draft.appointmentTypeId, route: draft.route, coverage };
}

/** Solo Programada o Confirmada admiten la llegada (S-REC-18). */
export function canArrive(status: AppointmentStatus): boolean {
  return status === 'SCHEDULED' || status === 'CONFIRMED';
}

/**
 * «Esta cita está {estado}…» del manual daba frases agramaticales («Esta cita
 * está Llegó»): aquí cada estado tiene su frase.
 */
export function notArrivableText(status: AppointmentStatus): string {
  switch (status) {
    case 'ARRIVED':
      return 'Ya se registró la llegada de esta cita.';
    case 'CANCELLED':
      return 'Esta cita está cancelada y no admite registro de llegada.';
    case 'NO_SHOW':
      return 'Esta cita está marcada como «No se presentó» y no admite registro de llegada.';
    default:
      return `Esta cita está ${APPOINTMENT_STATUS_LABELS[status].toLowerCase()} y no admite registro de llegada.`;
  }
}

export const INACTIVE_PATIENT_TEXT = 'Este paciente está inactivo. Reactívelo desde su perfil antes de registrar la llegada.';
export const MERGED_PATIENT_TEXT = 'Este registro fue fusionado con otro paciente.';
const NOT_ALLOWED = 'Esta acción no está permitida en el estado actual.';

const MESSAGES: Record<string, string> = {
  encounter_already_open: NOT_ALLOWED,
  appointment_already_checked_in: NOT_ALLOWED,
  invalid_appointment_transition: NOT_ALLOWED,
  appointment_not_today: 'Solo se puede registrar la llegada de las citas de hoy.',
  version_conflict: 'Este registro fue actualizado por otro usuario. Actualice para continuar.',
  patient_inactive: INACTIVE_PATIENT_TEXT,
  patient_merged: MERGED_PATIENT_TEXT,
  patient_not_found: 'No se encontró el paciente.',
  appointment_not_found: 'No se encontró la cita.',
  appointment_type_inactive: 'Ese tipo de cita ya no está activo. Elija otro.',
  appointment_type_not_found: 'Ese tipo de cita ya no está activo. Elija otro.',
  location_inactive: 'Esta sede está inactiva. No es posible registrar llegadas aquí.',
  forbidden: 'No tiene permiso para realizar esta acción.',
  no_active_context: 'No está autorizado para esta sede.',
  invalid_request: 'Algunos campos no son válidos. Revíselos.',
};

/** Error del servidor al registrar: mensaje y, si aplica, el enlace que da contexto. */
export interface ArrivalFailure {
  message: string;
  link: { kind: 'encounter'; id: string } | { kind: 'patient'; id: string; label: string } | null;
}

export function arrivalFailure(error: unknown): ArrivalFailure {
  if (!(error instanceof ApiError)) return { message: userActionMessage(error), link: null };
  const message = MESSAGES[error.code] ?? userActionMessage(error);
  const id = (key: string) => {
    const value = error.details[key];
    return typeof value === 'string' ? value : null;
  };
  if (error.code === 'encounter_already_open') {
    const encounterId = id('encounterId');
    return { message, link: encounterId ? { kind: 'encounter', id: encounterId } : null };
  }
  if (error.code === 'patient_inactive') {
    const patientId = id('patientId');
    return { message, link: patientId ? { kind: 'patient', id: patientId, label: 'Abrir perfil del paciente' } : null };
  }
  if (error.code === 'patient_merged') {
    const principalId = id('principalId');
    return { message, link: principalId ? { kind: 'patient', id: principalId, label: 'Abrir registro principal' } : null };
  }
  return { message, link: null };
}
