import { z } from 'zod';
import type { EncounterProvider } from './encounters.ts';
import type { WaitLevel, WaitThresholds } from './panel.ts';
import type { VisitRoute, VisitStatus } from './visit.ts';

// Enfermería (T-022; S-CLI-01, S-CLI-13 a 16). Lo comparten la web y la API:
// rangos y mensajes de los signos vitales (los mismos que valida el servidor,
// para que rara vez rechace), el IMC, la regla de «Enviar al proveedor»
// (ADR 0003), la división de la valoración (ADR 0036) y el estado de las
// alergias (ADR 0040).

// --- Signos vitales (S-CLI-14) ---------------------------------------------

export const VITAL_FIELDS = ['weightLb', 'heightIn', 'systolic', 'diastolic', 'pulse', 'respirations', 'temperatureF', 'spo2', 'glucose', 'pain'] as const;
export type VitalField = (typeof VITAL_FIELDS)[number];

/** Rango, decimales y unidad de cada campo (manual, S-CLI-14). Unidades imperiales fijas. */
export const VITAL_RULES: Record<VitalField, { label: string; unit: string; min: number; max: number; decimals: number }> = {
  weightLb: { label: 'Peso', unit: 'lb', min: 1, max: 1500, decimals: 2 },
  heightIn: { label: 'Estatura', unit: 'in', min: 10, max: 108, decimals: 2 },
  systolic: { label: 'Sistólica', unit: 'mmHg', min: 40, max: 300, decimals: 0 },
  diastolic: { label: 'Diastólica', unit: 'mmHg', min: 20, max: 200, decimals: 0 },
  pulse: { label: 'Pulso', unit: 'lpm', min: 20, max: 300, decimals: 0 },
  respirations: { label: 'Respiraciones', unit: '/min', min: 4, max: 80, decimals: 0 },
  temperatureF: { label: 'Temperatura', unit: '°F', min: 80, max: 115, decimals: 1 },
  spo2: { label: 'SpO2', unit: '%', min: 50, max: 100, decimals: 0 },
  glucose: { label: 'Glucosa', unit: 'mg/dL', min: 10, max: 1000, decimals: 0 },
  pain: { label: 'Dolor', unit: '/ 10', min: 0, max: 10, decimals: 0 },
};

export const VITALS_MESSAGES = {
  integer: 'Ingrese un número entero.',
  decimals: (n: number) => (n === 1 ? 'Ingrese un número (hasta 1 decimal).' : `Ingrese un número (hasta ${String(n)} decimales).`),
  range: (min: number, max: number) => `Debe estar entre ${String(min)} y ${String(max)}.`,
  diastolic: 'La diastólica debe ser menor que la sistólica.',
  bmi: 'El peso y la estatura dan un IMC inverosímil (debe estar entre 5 y 200).',
  inches: 'Las pulgadas deben ser menores que 12 cuando se indican pies.',
  feet: 'Debe estar entre 0 y 9.',
} as const;

/** Error de un valor ya convertido a número, o nulo si es válido. */
export function vitalError(field: VitalField, value: number): string | null {
  const rule = VITAL_RULES[field];
  if (!Number.isFinite(value)) return rule.decimals === 0 ? VITALS_MESSAGES.integer : VITALS_MESSAGES.decimals(rule.decimals);
  const scaled = value * 10 ** rule.decimals;
  if (Math.abs(scaled - Math.round(scaled)) > 1e-6) return rule.decimals === 0 ? VITALS_MESSAGES.integer : VITALS_MESSAGES.decimals(rule.decimals);
  if (value < rule.min || value > rule.max) return VITALS_MESSAGES.range(rule.min, rule.max);
  return null;
}

/** IMC = 703 × lb / in², con 1 decimal (manual). Nulo sin peso o sin estatura. */
export function bmiOf(weightLb: number | null, heightIn: number | null): number | null {
  if (weightLb === null || heightIn === null || heightIn <= 0) return null;
  return Math.round(((703 * weightLb) / (heightIn * heightIn)) * 10) / 10;
}

export const BMI_MIN = 5;
export const BMI_MAX = 200;

export type VitalsValues = Record<VitalField, number | null>;

export const EMPTY_VITALS: VitalsValues = Object.fromEntries(VITAL_FIELDS.map((f) => [f, null])) as VitalsValues;

/** Errores que dependen de varios campos (presión, IMC), sobre los valores ya combinados. */
export function vitalsCrossErrors(v: VitalsValues): Partial<Record<'diastolic' | 'bmi', string>> {
  const errors: Partial<Record<'diastolic' | 'bmi', string>> = {};
  if (v.systolic !== null && v.diastolic !== null && v.diastolic >= v.systolic) errors.diastolic = VITALS_MESSAGES.diastolic;
  const bmi = bmiOf(v.weightLb, v.heightIn);
  if (bmi !== null && (bmi < BMI_MIN || bmi > BMI_MAX)) errors.bmi = VITALS_MESSAGES.bmi;
  return errors;
}

/** ADR 0003: «Enviar al proveedor» exige peso, o sistólica y diastólica, ya guardados. */
export function hasRequiredVitals(v: Pick<VitalsValues, 'weightLb' | 'systolic' | 'diastolic'> | null): boolean {
  return v !== null && (v.weightLb !== null || (v.systolic !== null && v.diastolic !== null));
}

/** Guardar signos vitales: solo los campos cambiados (nulo borra) y la versión del registro (0 si aún no existe). */
export const saveVitalsSchema = z.object({
  changes: z.partialRecord(z.enum(VITAL_FIELDS), z.number().nullable()),
  expectedVersion: z.number().int().min(0),
});
export type SaveVitalsInput = z.input<typeof saveVitalsSchema>;

// --- Valoración (S-CLI-15, ADR 0036) ---------------------------------------

/** Del paciente: versionados y visibles en cada visita. */
export const HISTORY_FIELDS = ['allergies', 'personalHistory', 'familyHistory', 'surgeries', 'lifestyle', 'reproductiveHistory'] as const;
export type HistoryField = (typeof HISTORY_FIELDS)[number];
/** De la visita. */
export const VISIT_ASSESSMENT_FIELDS = ['symptoms', 'nursingNotes'] as const;
export type VisitAssessmentField = (typeof VISIT_ASSESSMENT_FIELDS)[number];
export type AssessmentField = HistoryField | VisitAssessmentField;

/** Orden y nombres del manual. */
export const ASSESSMENT_LABELS: Record<AssessmentField, string> = {
  allergies: 'Alergias',
  personalHistory: 'Antecedentes personales',
  familyHistory: 'Antecedentes familiares',
  surgeries: 'Cirugías',
  lifestyle: 'Estilo de vida',
  reproductiveHistory: 'Historia reproductiva',
  symptoms: 'Síntomas / motivo de consulta',
  nursingNotes: 'Notas de enfermería',
};

export const ASSESSMENT_MAX = 4000;
export const ASSESSMENT_MAX_TEXT = 'Máximo 4000 caracteres.';

/** Estado de las alergias (ADR 0040): un estado explícito, distinto de «no registradas». */
export const ALLERGY_STATUSES = ['not_recorded', 'none_known', 'recorded'] as const;
export type AllergyStatus = (typeof ALLERGY_STATUSES)[number];

export const ALLERGY_STATUS_LABELS: Record<AllergyStatus, string> = {
  not_recorded: 'Alergias no registradas',
  none_known: 'Sin alergias conocidas',
  recorded: 'Alergias',
};

/** El texto se recorta; vacío es nulo (manual). */
export function cleanText(text: string | null | undefined): string | null {
  const trimmed = (text ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Estado de las alergias a partir de lo que se escribió (ADR 0040): con texto,
 * «registradas»; sin texto y con «Sin alergias conocidas» marcado, ese
 * estado; si no, «no registradas».
 */
export function allergyStatusOf(text: string | null, noneKnown: boolean): AllergyStatus {
  if (cleanText(text) !== null) return 'recorded';
  return noneKnown ? 'none_known' : 'not_recorded';
}

const assessmentText = z.string().max(ASSESSMENT_MAX, ASSESSMENT_MAX_TEXT).nullable();

/**
 * Guardar la valoración: los apartados cambiados de la historia del paciente
 * y de la visita (nulo o vacío borra), el estado de las alergias y las dos
 * versiones leídas (0 si aún no existen).
 */
export const saveAssessmentSchema = z.object({
  allergyStatus: z.enum(ALLERGY_STATUSES),
  history: z.partialRecord(z.enum(HISTORY_FIELDS), assessmentText),
  visit: z.partialRecord(z.enum(VISIT_ASSESSMENT_FIELDS), assessmentText),
  historyVersion: z.number().int().min(0),
  assessmentVersion: z.number().int().min(0),
});
export type SaveAssessmentInput = z.input<typeof saveAssessmentSchema>;

// --- Enviar al proveedor (S-CLI-16) ----------------------------------------

/** Con `reason`: la excepción del ADR 0033 (Propietario o Administrador con rol clínico). */
export const sendToProviderSchema = z.object({
  expectedVersion: z.number().int().min(1),
  reason: z.string().trim().min(1, 'Se requiere un motivo.').max(500, 'Máximo 500 caracteres.').optional(),
});
export type SendToProviderInput = z.input<typeof sendToProviderSchema>;

// --- Respuestas --------------------------------------------------------------

/** Aviso de alergias del encabezado (ADR 0040). Nulo para quien no ve datos clínicos (Recepción). */
export interface AllergyNotice {
  status: AllergyStatus;
  /** Solo con «registradas». */
  text: string | null;
}

export interface NursingVitals {
  values: VitalsValues;
  /** IMC calculado por el servidor. */
  bmi: number | null;
  recordedAt: string;
  updatedAt: string;
  version: number;
}

export interface PatientHistoryView {
  allergyStatus: AllergyStatus;
  fields: Record<HistoryField, string | null>;
  /** 0: aún no hay historia. */
  version: number;
  recordedAt: string | null;
}

export interface VisitAssessmentView {
  fields: Record<VisitAssessmentField, string | null>;
  /** 0: aún no hay valoración de esta visita. */
  version: number;
  updatedAt: string | null;
}

/** Por qué no se puede escribir: en Caja o con la visita cerrada (S-CLI-13). */
export type NursingLock = 'checkout' | 'closed' | null;

export interface NursingAbilities {
  editVitals: boolean;
  editAssessment: boolean;
  /** «Enviar al proveedor» regular (Enfermería). */
  sendToProvider: boolean;
  /** «Enviar con excepción…» (ADR 0033). */
  sendException: boolean;
}

/** `GET /api/encounters/:id/nursing` (S-CLI-13). */
export interface NursingSection {
  encounterId: string;
  status: VisitStatus;
  route: VisitRoute;
  /** Versión de la visita (para «Enviar al proveedor»). */
  encounterVersion: number;
  /** `limited`: Recepción, solo fechas, sin ningún valor. */
  view: 'full' | 'limited';
  summary: { vitalsAt: string | null; assessmentAt: string | null; completedAt: string | null };
  vitals: NursingVitals | null;
  history: PatientHistoryView | null;
  assessment: VisitAssessmentView | null;
  /** ADR 0003: lo guardado ya basta para enviar. */
  hasRequiredVitals: boolean;
  lock: NursingLock;
  abilities: NursingAbilities;
}

/** Respuesta de un guardado: versiones nuevas y el estado de la visita (puede haber pasado a «Con enfermería»). */
export interface NursingSaved {
  version: number;
  historyVersion?: number;
  encounterStatus: VisitStatus;
  encounterVersion: number;
  /** El guardado inició la enfermería (Esperando enfermería → Con enfermería). */
  startedNursing: boolean;
}

/** S-CLI-01: una fila de la cola de enfermería. Del paciente, solo nombre y código. */
export interface NursingQueueRow {
  id: string;
  code: string;
  status: VisitStatus;
  route: VisitRoute;
  version: number;
  arrivedAt: string;
  statusSince: string;
  patient: { id: string; code: string; firstName: string; lastName: string };
  provider: EncounterProvider | null;
  appointmentType: string | null;
  /** ADR 0039: solo en «Esperando enfermería». */
  waitLevel: WaitLevel;
}

export interface NursingQueue {
  serverNow: string;
  timeZone: string;
  rows: NursingQueueRow[];
  myMembershipId: string;
  waitThresholds: WaitThresholds;
  /** «Iniciar»: el rol Enfermería (dueño de «Iniciar enfermería»). */
  canStart: boolean;
}

/** Estados en que se escriben signos vitales y valoración (S-CLI-13). */
export const NURSING_WRITABLE_STATUSES: readonly VisitStatus[] = ['CHECKED_IN', 'WAITING_FOR_NURSE', 'WITH_NURSE', 'WAITING_FOR_PROVIDER', 'WITH_PROVIDER', 'PROCEDURE_PENDING'];

export function nursingLock(status: VisitStatus): NursingLock {
  if (NURSING_WRITABLE_STATUSES.includes(status)) return null;
  return status === 'READY_FOR_CHECKOUT' || status === 'CHECKOUT' ? 'checkout' : 'closed';
}

export const NURSING_MESSAGES = {
  locked: 'Los datos de enfermería están bloqueados para esta visita.',
  closed: 'La visita ya está cerrada.',
  vitalsRequired: 'Registre peso o presión arterial antes de enviar al proveedor.',
  notWithNurse: 'La enfermería solo puede completarse mientras el paciente está con enfermería.',
  outOfRange: 'Un valor está fuera del rango aceptado.',
  limited: 'Su rol solo puede ver el resumen de enfermería.',
} as const;
