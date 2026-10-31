import { sql } from 'drizzle-orm';
import { check, date, foreignKey, integer, text, timestamp, unique, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { referralSources } from './catalog-schema.ts';
import { appSchema, locations, organizations } from './schema.ts';

// Pacientes (T-001; ampliada en T-012, S-PAC-01 a 04) y contadores de códigos
// humanos (ADR 0019). RLS, FORCE y GRANT en migrations/0001_rls.sql y
// 0023_patients_search.sql. Nombre, apellidos, fecha de nacimiento y teléfono
// van sin cifrar para poder buscarlos (ADR 0026); los detalles del referido,
// texto libre, van cifrados en la aplicación (field-cipher.ts). La búsqueda
// parcial y sin tildes usa el índice GIN de trigramas sobre
// app.search_text(nombre completo), creado a mano en 0023.

/** Código humano del paciente: `P-000123`, por organización (ADR 0019). */
export const PATIENT_CODE_PATTERN = '^P-[0-9]{6,}$';
export const PATIENT_STATUS_VALUES = ['active', 'inactive'] as const;

/**
 * Siguiente número de cada tipo de código, por organización. Se incrementa en
 * la misma transacción que crea la entidad (`nextCode`).
 */
export const codeCounters = appSchema.table(
  'code_counters',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    kind: text('kind').notNull(),
    /** El último número entregado. */
    lastValue: integer('last_value').notNull(),
  },
  (t) => [
    unique('code_counters_organization_id_id_key').on(t.organizationId, t.id),
    unique('code_counters_organization_id_kind_key').on(t.organizationId, t.kind),
    check('code_counters_last_value_check', sql`${t.lastValue} >= 1`),
  ],
);

export const patients = appSchema.table(
  'patients',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    /** Sede donde se dio de alta. Los pacientes son de toda la organización. */
    registeredLocationId: uuid('registered_location_id').notNull(),
    code: text('code').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    birthDate: date('birth_date').notNull(),
    /** Solo dígitos, de 7 a 15. */
    phone: text('phone'),
    referralSourceId: uuid('referral_source_id'),
    /** Detalles del referido, cifrados (FieldCipher). Solo con fuente. */
    referralDetailsEnc: text('referral_details_enc'),
    status: text('status').notNull().default('active'),
    /** Preparado para la fusión de duplicados (sin pantalla todavía). */
    mergedInto: uuid('merged_into'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    unique('patients_organization_id_id_key').on(t.organizationId, t.id),
    unique('patients_organization_id_code_key').on(t.organizationId, t.code),
    // Compuesta: un paciente solo puede referenciar una sede de su organización.
    // Las comprobaciones de claves foráneas no pasan por RLS.
    foreignKey({
      name: 'patients_registered_location_fk',
      columns: [t.organizationId, t.registeredLocationId],
      foreignColumns: [locations.organizationId, locations.id],
    }),
    foreignKey({
      name: 'patients_referral_source_fk',
      columns: [t.organizationId, t.referralSourceId],
      foreignColumns: [referralSources.organizationId, referralSources.id],
    }),
    foreignKey({
      name: 'patients_merged_into_fk',
      columns: [t.organizationId, t.mergedInto],
      foreignColumns: [t.organizationId, t.id] as [AnyPgColumn, AnyPgColumn],
    }),
    check('patients_code_format', sql`${t.code} ~ ${sql.raw(`'${PATIENT_CODE_PATTERN}'`)}`),
    check('patients_first_name_length', sql`char_length(${t.firstName}) between 1 and 100`),
    check('patients_last_name_length', sql`char_length(${t.lastName}) between 1 and 100`),
    // «No futura» la comprueba la API con la fecha de la sede.
    check('patients_birth_date_range', sql`${t.birthDate} >= '1900-01-01'`),
    check('patients_phone_format', sql`${t.phone} ~ '^[0-9]{7,15}$'`),
    check('patients_referral_details_check', sql`${t.referralDetailsEnc} is null or ${t.referralSourceId} is not null`),
    check('patients_status_check', sql`${t.status} in ('active', 'inactive')`),
    check('patients_not_merged_into_self', sql`${t.mergedInto} is null or ${t.mergedInto} <> ${t.id}`),
  ],
);
