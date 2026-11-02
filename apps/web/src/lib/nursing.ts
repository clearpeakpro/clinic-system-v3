import {
  allergyStatusOf,
  ASSESSMENT_MAX,
  ASSESSMENT_MAX_TEXT,
  bmiOf,
  cleanText,
  EMPTY_VITALS,
  HISTORY_FIELDS,
  VISIT_ASSESSMENT_FIELDS,
  VITAL_FIELDS,
  VITAL_RULES,
  VITALS_MESSAGES,
  vitalError,
  vitalsCrossErrors,
  type AssessmentField,
  type HistoryField,
  type NursingQueueRow,
  type PatientHistoryView,
  type SaveAssessmentInput,
  type VisitAssessmentField,
  type VisitAssessmentView,
  type VitalField,
  type VitalsValues,
} from '@clinic/shared';
import { matchesSearch } from './panel.ts';

// Enfermería en la web (T-022; S-CLI-01, S-CLI-13 a 16): borradores de los
// formularios, conversión de la estatura, cambios a enviar y filtros de la
// cola. Sin React y sin la hora del dispositivo (reciben lo que necesitan),
// para probarlo aparte. Los borradores viven solo en memoria (CLAUDE.md,
// regla 9): nunca en el almacenamiento del navegador.

// --- Signos vitales (S-CLI-14) ---------------------------------------------

export type HeightMode = 'ftin' | 'in';

/** Lo que se teclea: texto por campo; la estatura en ft/in o en pulgadas; el dolor con su interruptor. */
export interface VitalsDraft {
  text: Record<Exclude<VitalField, 'heightIn' | 'pain'>, string>;
  heightMode: HeightMode;
  feet: string;
  inches: string;
  heightTotal: string;
  painOn: boolean;
  pain: number;
}

const TEXT_FIELDS = VITAL_FIELDS.filter((f): f is Exclude<VitalField, 'heightIn' | 'pain'> => f !== 'heightIn' && f !== 'pain');

const round2 = (n: number) => Math.round(n * 100) / 100;
const numberText = (n: number | null) => (n === null ? '' : String(n));

export function vitalsDraft(saved: VitalsValues | null, heightMode: HeightMode = 'ftin'): VitalsDraft {
  const v = saved ?? EMPTY_VITALS;
  const text = Object.fromEntries(TEXT_FIELDS.map((f) => [f, numberText(v[f])])) as VitalsDraft['text'];
  const height = v.heightIn;
  const feet = height === null ? '' : String(Math.floor(height / 12));
  const inches = height === null ? '' : String(round2(height - Math.floor(height / 12) * 12));
  return { text, heightMode, feet, inches, heightTotal: numberText(height), painOn: v.pain !== null, pain: v.pain ?? 0 };
}

/** Texto → número: vacío es nulo; «abc» o demasiados decimales, error con el mensaje del manual. */
export function parseVital(field: VitalField, text: string): { value: number | null; error: string | null } {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return { value: null, error: null };
  const rule = VITAL_RULES[field];
  const pattern = rule.decimals === 0 ? /^\d+$/ : /^\d+(\.\d+)?$/;
  if (!pattern.test(trimmed)) return { value: null, error: rule.decimals === 0 ? VITALS_MESSAGES.integer : VITALS_MESSAGES.decimals(rule.decimals) };
  const value = Number(trimmed);
  return { value, error: vitalError(field, value) };
}

export type VitalsErrorKey = VitalField | 'feet' | 'inches' | 'bmi';

/** Valores y errores del borrador (validación en vivo, como el servidor). */
export function readVitalsDraft(draft: VitalsDraft): { values: VitalsValues; errors: Partial<Record<VitalsErrorKey, string>> } {
  const values: VitalsValues = { ...EMPTY_VITALS };
  const errors: Partial<Record<VitalsErrorKey, string>> = {};
  for (const field of TEXT_FIELDS) {
    const parsed = parseVital(field, draft.text[field]);
    values[field] = parsed.value;
    if (parsed.error) errors[field] = parsed.error;
  }
  if (draft.heightMode === 'in') {
    const parsed = parseVital('heightIn', draft.heightTotal);
    values.heightIn = parsed.value;
    if (parsed.error) errors.heightIn = parsed.error;
  } else if (draft.feet.trim() !== '' || draft.inches.trim() !== '') {
    const feet = draft.feet.trim() === '' ? 0 : Number(draft.feet.trim());
    const inches = draft.inches.trim() === '' ? 0 : Number(draft.inches.trim().replace(',', '.'));
    if (!/^\d*$/.test(draft.feet.trim())) errors.feet = VITALS_MESSAGES.integer;
    else if (feet > 9) errors.feet = VITALS_MESSAGES.feet;
    if (!/^\d*([.,]\d{0,2})?$/.test(draft.inches.trim())) errors.inches = VITALS_MESSAGES.decimals(2);
    else if (feet > 0 && inches >= 12) errors.inches = VITALS_MESSAGES.inches;
    if (!errors.feet && !errors.inches) {
      const total = round2(feet * 12 + inches);
      values.heightIn = total;
      const error = vitalError('heightIn', total);
      if (error) errors.heightIn = error;
    }
  }
  values.pain = draft.painOn ? draft.pain : null;
  const cross = vitalsCrossErrors(values);
  if (cross.diastolic) errors.diastolic = cross.diastolic;
  if (cross.bmi) errors.bmi = cross.bmi;
  return { values, errors };
}

/** Cambia el modo de la estatura conservando el valor (S-CLI-14). */
export function withHeightMode(draft: VitalsDraft, mode: HeightMode): VitalsDraft {
  if (mode === draft.heightMode) return draft;
  const { values } = readVitalsDraft(draft);
  const converted = vitalsDraft({ ...EMPTY_VITALS, heightIn: values.heightIn }, mode);
  return { ...draft, heightMode: mode, feet: converted.feet, inches: converted.inches, heightTotal: converted.heightTotal };
}

/** Solo los campos que cambiaron respecto a lo guardado (nulo = borrar). */
export function vitalsChanges(saved: VitalsValues | null, values: VitalsValues): Partial<Record<VitalField, number | null>> {
  const before = saved ?? EMPTY_VITALS;
  const changes: Partial<Record<VitalField, number | null>> = {};
  for (const field of VITAL_FIELDS) if (values[field] !== before[field]) changes[field] = values[field];
  return changes;
}

/** IMC de vista previa (el guardado lo calcula el servidor). */
export function bmiPreview(values: VitalsValues): number | null {
  return bmiOf(values.weightLb, values.heightIn);
}

/** «5' 6" (66 in)» del resumen de solo lectura. */
export function heightText(heightIn: number): string {
  const feet = Math.floor(heightIn / 12);
  return `${String(feet)}' ${String(round2(heightIn - feet * 12))}" (${String(heightIn)} in)`;
}

// --- Valoración (S-CLI-15, ADR 0036 y 0040) --------------------------------

export interface AssessmentDraft {
  text: Record<AssessmentField, string>;
  /** «Sin alergias conocidas» (ADR 0040). */
  noneKnown: boolean;
}

export function assessmentDraft(history: PatientHistoryView | null, assessment: VisitAssessmentView | null): AssessmentDraft {
  const text = {} as Record<AssessmentField, string>;
  for (const field of HISTORY_FIELDS) text[field] = history?.fields[field] ?? '';
  for (const field of VISIT_ASSESSMENT_FIELDS) text[field] = assessment?.fields[field] ?? '';
  return { text, noneKnown: history?.allergyStatus === 'none_known' };
}

export function assessmentErrors(draft: AssessmentDraft): Partial<Record<AssessmentField, string>> {
  const errors: Partial<Record<AssessmentField, string>> = {};
  for (const [field, value] of Object.entries(draft.text) as [AssessmentField, string][]) if (value.length > ASSESSMENT_MAX) errors[field] = ASSESSMENT_MAX_TEXT;
  return errors;
}

/** Lo que se envía: los apartados cambiados (recortados) y el estado de las alergias. */
export function assessmentInput(draft: AssessmentDraft, history: PatientHistoryView | null, assessment: VisitAssessmentView | null): SaveAssessmentInput {
  const historyChanges: Partial<Record<HistoryField, string | null>> = {};
  for (const field of HISTORY_FIELDS) {
    const next = cleanText(draft.text[field]);
    if (next !== (history?.fields[field] ?? null)) historyChanges[field] = next;
  }
  const visitChanges: Partial<Record<VisitAssessmentField, string | null>> = {};
  for (const field of VISIT_ASSESSMENT_FIELDS) {
    const next = cleanText(draft.text[field]);
    if (next !== (assessment?.fields[field] ?? null)) visitChanges[field] = next;
  }
  return {
    allergyStatus: allergyStatusOf(draft.text.allergies, draft.noneKnown),
    history: historyChanges,
    visit: visitChanges,
    historyVersion: history?.version ?? 0,
    assessmentVersion: assessment?.version ?? 0,
  };
}

export function assessmentDirty(draft: AssessmentDraft, history: PatientHistoryView | null, assessment: VisitAssessmentView | null): boolean {
  const input = assessmentInput(draft, history, assessment);
  return Object.keys(input.history).length > 0 || Object.keys(input.visit).length > 0 || input.allergyStatus !== (history?.allergyStatus ?? 'not_recorded');
}

// --- Cola de enfermería (S-CLI-01) -----------------------------------------

export type QueueFilter = 'all' | 'waiting' | 'with_nurse' | 'procedure';

export const QUEUE_FILTERS: { key: QueueFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'waiting', label: 'Esperando' },
  { key: 'with_nurse', label: 'Con enfermería' },
  { key: 'procedure', label: 'Procedimiento pendiente' },
];

const FILTER_STATUS: Record<Exclude<QueueFilter, 'all'>, NursingQueueRow['status']> = {
  waiting: 'WAITING_FOR_NURSE',
  with_nurse: 'WITH_NURSE',
  procedure: 'PROCEDURE_PENDING',
};

/** Filas visibles con el chip y la búsqueda (ADR 0012); el orden es el del servidor (mayor espera primero). */
export function queueRows(rows: readonly NursingQueueRow[], filter: QueueFilter, search: string): NursingQueueRow[] {
  return rows.filter((r) => (filter === 'all' || r.status === FILTER_STATUS[filter]) && matchesSearch(r, search));
}

export function queueCounts(rows: readonly NursingQueueRow[]): Record<QueueFilter, number> {
  return {
    all: rows.length,
    waiting: rows.filter((r) => r.status === 'WAITING_FOR_NURSE').length,
    with_nurse: rows.filter((r) => r.status === 'WITH_NURSE').length,
    procedure: rows.filter((r) => r.status === 'PROCEDURE_PENDING').length,
  };
}

/** Subtítulo (manual): cuenta todas las filas, también las que están con enfermería. */
export function queueSubtitle(count: number): string {
  if (count === 0) return 'Sin pacientes en espera';
  return count === 1 ? '1 paciente en espera' : `${String(count)} pacientes en espera`;
}
