import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { appointmentTypes } from './catalog-schema.ts';
import { memberships } from './identity-schema.ts';
import { patients } from './patients-schema.ts';
import { appSchema, locations, organizations } from './schema.ts';

// Citas (T-014; S-REC-06 a 09). RLS, FORCE y GRANT en
// migrations/0025_appointments_rls.sql. Todas las referencias son compuestas
// con la organización: una cita no puede apuntar a una sede, un paciente, un
// tipo ni un proveedor de otra organización. Las notas y el motivo de
// cancelación son texto libre y van cifrados en la aplicación (FieldCipher).
// Los estados son los de @clinic/shared (appointments.ts); una prueba los compara.

export const APPOINTMENT_STATUS_VALUES = ['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'CANCELLED', 'NO_SHOW'] as const;

/** Código por sede: `NOR1-A-000045` (ADR 0019), con su contador en code_counters. */
export const APPOINTMENT_CODE_PATTERN = '^[A-Z][A-Z0-9]{1,7}-A-[0-9]{6,}$';

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export const appointments = appSchema.table(
  'appointments',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    locationId: uuid('location_id').notNull(),
    patientId: uuid('patient_id').notNull(),
    appointmentTypeId: uuid('appointment_type_id').notNull(),
    /** Membresía del proveedor asignado; nula = «Sin asignar». */
    providerMembershipId: uuid('provider_membership_id'),
    code: text('code').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    status: text('status').notNull().default('SCHEDULED'),
    /** Notas, cifradas (FieldCipher). */
    notesEnc: text('notes_enc'),
    /** Motivo de cancelación, cifrado (FieldCipher). Solo en citas canceladas. */
    cancelReasonEnc: text('cancel_reason_enc'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    unique('appointments_organization_id_id_key').on(t.organizationId, t.id),
    unique('appointments_organization_id_code_key').on(t.organizationId, t.code),
    foreignKey({
      name: 'appointments_location_fk',
      columns: [t.organizationId, t.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }),
    foreignKey({
      name: 'appointments_patient_fk',
      columns: [t.organizationId, t.patientId],
      foreignColumns: [patients.organizationId, patients.id],
    }),
    foreignKey({
      name: 'appointments_type_fk',
      columns: [t.organizationId, t.appointmentTypeId],
      foreignColumns: [appointmentTypes.organizationId, appointmentTypes.id],
    }),
    foreignKey({
      name: 'appointments_provider_fk',
      columns: [t.organizationId, t.providerMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    check('appointments_code_format', sql`${t.code} ~ ${sql.raw(`'${APPOINTMENT_CODE_PATTERN}'`)}`),
    check('appointments_duration_range', sql`${t.durationMinutes} between 5 and 480`),
    check('appointments_status_check', sql`${t.status} in (${inList(APPOINTMENT_STATUS_VALUES)})`),
    check('appointments_cancel_reason_check', sql`${t.cancelReasonEnc} is null or ${t.status} = 'CANCELLED'`),
    check('appointments_version_check', sql`${t.version} >= 1`),
    // La agenda: un día de una sede, por hora de inicio.
    index('appointments_location_starts_idx').on(t.organizationId, t.locationId, t.startsAt),
    // La pestaña Citas del perfil y la próxima cita.
    index('appointments_patient_starts_idx').on(t.organizationId, t.patientId, t.startsAt),
  ],
);
