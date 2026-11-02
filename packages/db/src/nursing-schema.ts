import { sql } from 'drizzle-orm';
import { check, foreignKey, integer, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { encounters } from './encounters-schema.ts';
import { memberships } from './identity-schema.ts';
import { patients } from './patients-schema.ts';
import { appSchema, locations, organizations } from './schema.ts';

// Enfermería (T-022; S-CLI-13 a 16). RLS, FORCE y GRANT en
// migrations/0032_nursing_rls.sql. Referencias compuestas con la organización.
//  - encounter_vitals: un registro de signos vitales por visita, con su propia
//    versión (un cambio no clínico de la visita no lo bloquea). Unidades
//    imperiales en enteros: peso y estatura en centésimas, temperatura en
//    décimas. El IMC lo calcula el servidor (décimas).
//  - patient_histories: historia del paciente (ADR 0036), una fila por
//    versión, append-only. Texto libre cifrado (FieldCipher). Alergias con un
//    estado explícito (ADR 0040): no registradas, sin alergias conocidas o
//    registradas (con texto).
//  - encounter_assessments: síntomas y notas de enfermería de la visita,
//    cifrados, con versión.

/** Estado de las alergias del paciente (ADR 0040). */
export const ALLERGY_STATUS_VALUES = ['not_recorded', 'none_known', 'recorded'] as const;

const createdBy = (name: string) => uuid(name);

export const encounterVitals = appSchema.table(
  'encounter_vitals',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    encounterId: uuid('encounter_id').notNull(),
    weightLbX100: integer('weight_lb_x100'),
    heightInX100: integer('height_in_x100'),
    systolic: integer('systolic'),
    diastolic: integer('diastolic'),
    pulse: integer('pulse'),
    respirations: integer('respirations'),
    temperatureFX10: integer('temperature_f_x10'),
    spo2: integer('spo2'),
    glucose: integer('glucose'),
    pain: integer('pain'),
    /** IMC × 10, calculado por el servidor; nulo sin peso o sin estatura. */
    bmiX10: integer('bmi_x10'),
    recordedByMembershipId: createdBy('recorded_by_membership_id').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    updatedByMembershipId: createdBy('updated_by_membership_id').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    version: integer('version').notNull().default(1),
  },
  (t) => [
    unique('encounter_vitals_organization_id_id_key').on(t.organizationId, t.id),
    unique('encounter_vitals_organization_id_encounter_id_key').on(t.organizationId, t.encounterId),
    foreignKey({ name: 'encounter_vitals_encounter_fk', columns: [t.organizationId, t.encounterId], foreignColumns: [encounters.organizationId, encounters.id] }),
    foreignKey({
      name: 'encounter_vitals_recorded_by_fk',
      columns: [t.organizationId, t.recordedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    foreignKey({
      name: 'encounter_vitals_updated_by_fk',
      columns: [t.organizationId, t.updatedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    // Rangos del manual (S-CLI-14), los mismos que valida @clinic/shared.
    check('encounter_vitals_weight_range', sql`${t.weightLbX100} between 100 and 150000`),
    check('encounter_vitals_height_range', sql`${t.heightInX100} between 1000 and 10800`),
    check('encounter_vitals_systolic_range', sql`${t.systolic} between 40 and 300`),
    check('encounter_vitals_diastolic_range', sql`${t.diastolic} between 20 and 200`),
    check('encounter_vitals_bp_order', sql`${t.systolic} is null or ${t.diastolic} is null or ${t.diastolic} < ${t.systolic}`),
    check('encounter_vitals_pulse_range', sql`${t.pulse} between 20 and 300`),
    check('encounter_vitals_respirations_range', sql`${t.respirations} between 4 and 80`),
    check('encounter_vitals_temperature_range', sql`${t.temperatureFX10} between 800 and 1150`),
    check('encounter_vitals_spo2_range', sql`${t.spo2} between 50 and 100`),
    check('encounter_vitals_glucose_range', sql`${t.glucose} between 10 and 1000`),
    check('encounter_vitals_pain_range', sql`${t.pain} between 0 and 10`),
    check('encounter_vitals_bmi_range', sql`${t.bmiX10} between 50 and 2000`),
    check('encounter_vitals_bmi_check', sql`(${t.bmiX10} is null) = (${t.weightLbX100} is null or ${t.heightInX100} is null)`),
    check('encounter_vitals_version_check', sql`${t.version} >= 1`),
  ],
);

export const patientHistories = appSchema.table(
  'patient_histories',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    patientId: uuid('patient_id').notNull(),
    /** 1, 2, 3…: la vigente es la mayor. */
    version: integer('version').notNull(),
    allergyStatus: text('allergy_status').notNull(),
    allergiesEnc: text('allergies_enc'),
    personalHistoryEnc: text('personal_history_enc'),
    familyHistoryEnc: text('family_history_enc'),
    surgeriesEnc: text('surgeries_enc'),
    lifestyleEnc: text('lifestyle_enc'),
    reproductiveHistoryEnc: text('reproductive_history_enc'),
    /** Visita y sede donde se registró esta versión. */
    encounterId: uuid('encounter_id').notNull(),
    locationId: uuid('location_id').notNull(),
    recordedByMembershipId: createdBy('recorded_by_membership_id').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    unique('patient_histories_organization_id_id_key').on(t.organizationId, t.id),
    unique('patient_histories_patient_version_key').on(t.organizationId, t.patientId, t.version),
    foreignKey({ name: 'patient_histories_patient_fk', columns: [t.organizationId, t.patientId], foreignColumns: [patients.organizationId, patients.id] }),
    foreignKey({ name: 'patient_histories_encounter_fk', columns: [t.organizationId, t.encounterId], foreignColumns: [encounters.organizationId, encounters.id] }),
    foreignKey({ name: 'patient_histories_location_fk', columns: [t.organizationId, t.locationId], foreignColumns: [locations.organizationId, locations.id] }),
    foreignKey({
      name: 'patient_histories_recorded_by_fk',
      columns: [t.organizationId, t.recordedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    check('patient_histories_allergy_status_check', sql`${t.allergyStatus} in (${sql.raw(ALLERGY_STATUS_VALUES.map((v) => `'${v}'`).join(', '))})`),
    // Con «registradas» hay texto; sin alergias conocidas o sin registrar, no.
    check('patient_histories_allergies_check', sql`(${t.allergyStatus} = 'recorded') = (${t.allergiesEnc} is not null)`),
    check('patient_histories_version_check', sql`${t.version} >= 1`),
  ],
);

export const encounterAssessments = appSchema.table(
  'encounter_assessments',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    encounterId: uuid('encounter_id').notNull(),
    symptomsEnc: text('symptoms_enc'),
    nursingNotesEnc: text('nursing_notes_enc'),
    recordedByMembershipId: createdBy('recorded_by_membership_id').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    updatedByMembershipId: createdBy('updated_by_membership_id').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    version: integer('version').notNull().default(1),
  },
  (t) => [
    unique('encounter_assessments_organization_id_id_key').on(t.organizationId, t.id),
    unique('encounter_assessments_organization_id_encounter_id_key').on(t.organizationId, t.encounterId),
    foreignKey({
      name: 'encounter_assessments_encounter_fk',
      columns: [t.organizationId, t.encounterId],
      foreignColumns: [encounters.organizationId, encounters.id],
    }),
    foreignKey({
      name: 'encounter_assessments_recorded_by_fk',
      columns: [t.organizationId, t.recordedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    foreignKey({
      name: 'encounter_assessments_updated_by_fk',
      columns: [t.organizationId, t.updatedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    check('encounter_assessments_version_check', sql`${t.version} >= 1`),
  ],
);
