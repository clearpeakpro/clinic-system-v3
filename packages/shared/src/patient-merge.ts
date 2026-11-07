import { z } from 'zod';
import { HISTORY_FIELDS, type AllergyStatus, type HistoryField } from './nursing.ts';
import type { PatientStatus } from './patients.ts';
import type { MembershipMemberRole, PatientMembershipStatus } from './patient-memberships.ts';
import { reasonSchema } from './schemas.ts';

// Fusionar pacientes (T-030; S-PAC-13 y 14; ADR 0032). Lo hacen el
// Propietario o el Administrador con un rol clínico en la sede. Todo pasa al
// principal en una sola transacción; el duplicado queda «Fusionado», con
// merged_into, y su código lleva al principal. Es irreversible.

/** Palabra que hay que escribir para habilitar «Fusionar» (en el manual era «MERGE»). No distingue mayúsculas. */
export const MERGE_CONFIRM_WORD = 'FUSIONAR';

export const isMergeConfirmation = (text: string): boolean => text.trim().toLocaleUpperCase('es') === MERGE_CONFIRM_WORD;

/**
 * `POST /api/patients/:id/merge`: `:id` es el duplicado (se fusiona) y
 * `principalId` el que se conserva. Con las versiones leídas de los dos (409
 * `version_conflict` si cualquiera cambió), el motivo y la palabra escrita.
 */
export const mergePatientsSchema = z
  .object({
    principalId: z.uuid(),
    principalVersion: z.number().int().positive(),
    duplicateVersion: z.number().int().positive(),
    reason: reasonSchema,
    confirm: z.string().refine(isMergeConfirmation, { message: 'confirm_required' }),
  })
  .strict();
export type MergePatientsInput = z.input<typeof mergePatientsSchema>;
export type MergePatientsData = z.output<typeof mergePatientsSchema>;

/** Lo que impide fusionar a los dos pacientes (ADR 0032, decisiones 2b y 5). */
export const MERGE_BLOCKERS = ['same_patient', 'patient_not_active', 'patient_merged', 'open_visits_same_location', 'both_in_membership'] as const;
export type MergeBlocker = (typeof MERGE_BLOCKERS)[number];

export const MERGE_BLOCKER_MESSAGES: Record<MergeBlocker, string> = {
  same_patient: 'Seleccione un paciente distinto.',
  patient_not_active: 'Los dos pacientes deben estar activos. Reactive al paciente inactivo antes de fusionar.',
  patient_merged: 'Ese registro ya fue fusionado con otro paciente.',
  open_visits_same_location: 'Los dos pacientes tienen una visita abierta en la misma sede. Cierre una antes de fusionar.',
  both_in_membership: 'Los dos pacientes están en una membresía. Quite a uno como afiliado o cancele una membresía antes de fusionar.',
};

/** Una tarjeta de S-PAC-13: «Principal (se conserva)» o «Duplicado (se fusiona)». */
export interface MergeCandidate {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  phone: string | null;
  status: PatientStatus;
  mergedInto: string | null;
  version: number;
  createdAt: string;
  appointments: number;
  encounters: number;
  /** Códigos de las sedes donde tiene una visita abierta. */
  openVisitLocations: string[];
  /** Su membresía en curso, si está en una. */
  membership: { code: string; role: MembershipMemberRole; status: PatientMembershipStatus } | null;
}

/** `GET /api/patients/:id/merge-preview?with=<id>`: los dos pacientes y lo que lo impide (no depende de la dirección). */
export interface MergePreview {
  patients: [MergeCandidate, MergeCandidate];
  blockers: MergeBlocker[];
}

/** Conteos de lo movido al principal: van a la auditoría `patient.merge`, sin nombres. */
export interface MergeCounts {
  appointments: number;
  encounters: number;
  orders: number;
  charges: number;
  payments: number;
  receipts: number;
  memberships: number;
  kioskCheckins: number;
  /** 1 si se creó la versión combinada de la historia. */
  history: number;
}

export interface MergeResult {
  principalId: string;
}

/** Una versión de la historia del paciente, ya descifrada. */
export interface HistorySnapshot {
  allergyStatus: AllergyStatus;
  fields: Record<HistoryField, string | null>;
}

const ALLERGY_RANK: Record<AllergyStatus, number> = { not_recorded: 0, none_known: 1, recorded: 2 };

function joinText(principal: string | null, duplicate: string | null, duplicateCode: string): string | null {
  if (duplicate === null) return principal;
  if (principal === null || principal.trim() === duplicate.trim()) return principal ?? duplicate;
  return `${principal}\n\nDel registro fusionado ${duplicateCode}:\n${duplicate}`;
}

/**
 * La historia combinada del principal (ADR 0032, decisión 3). En cada
 * apartado: si solo uno tiene texto, ese; si los dos y son distintos, el del
 * principal, una línea en blanco, «Del registro fusionado P-000123:» y el del
 * duplicado. Alergias: «registradas» si cualquiera las tiene; si no, «Sin
 * alergias conocidas» si alguno lo marcó; si no, «no registradas». Así «Sin
 * alergias conocidas» nunca tapa una alergia registrada. Nula si no hace falta
 * una versión nueva (el duplicado no tiene historia o no añade nada).
 */
export function combineHistories(principal: HistorySnapshot | null, duplicate: HistorySnapshot | null, duplicateCode: string): HistorySnapshot | null {
  if (!duplicate) return null;
  const base: HistorySnapshot = principal ?? { allergyStatus: 'not_recorded', fields: Object.fromEntries(HISTORY_FIELDS.map((f) => [f, null])) as Record<HistoryField, string | null> };
  const allergyStatus = ALLERGY_RANK[duplicate.allergyStatus] > ALLERGY_RANK[base.allergyStatus] ? duplicate.allergyStatus : base.allergyStatus;
  const fields = {} as Record<HistoryField, string | null>;
  for (const field of HISTORY_FIELDS) {
    if (field === 'allergies') {
      const p = base.allergyStatus === 'recorded' ? base.fields.allergies : null;
      const d = duplicate.allergyStatus === 'recorded' ? duplicate.fields.allergies : null;
      fields.allergies = allergyStatus === 'recorded' ? joinText(p, d, duplicateCode) : null;
    } else {
      fields[field] = joinText(base.fields[field], duplicate.fields[field], duplicateCode);
    }
  }
  const same = principal !== null && allergyStatus === principal.allergyStatus && HISTORY_FIELDS.every((f) => fields[f] === principal.fields[f]);
  const empty = allergyStatus === 'not_recorded' && HISTORY_FIELDS.every((f) => fields[f] === null);
  return same || (principal === null && empty) ? null : { allergyStatus, fields };
}
