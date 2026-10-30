import { sql } from 'drizzle-orm';
import { boolean, check, date, foreignKey, index, integer, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { appSchema, locations, organizations } from './schema.ts';

// Catálogo mínimo y precios por sede (T-011; S-ADM-13 a 20). Se desactiva,
// nunca se borra; los precios no se modifican: cada cambio es una fila nueva
// con su fecha de vigencia. RLS, FORCE y GRANT en
// migrations/0018_catalog_rls.sql. Los valores permitidos (rutas, tipos,
// colores) son los de @clinic/shared (catalog.ts); una prueba los compara.

/** Código de un ítem: empieza por letra; A–Z, dígitos, `_` y `-`; de 2 a 41 caracteres. */
export const CATALOG_CODE_PATTERN = '^[A-Z][A-Z0-9_-]{1,40}$';

export const VISIT_ROUTE_VALUES = ['STANDARD', 'INJECTION_ONLY', 'LAB_ONLY', 'PROCEDURE_ONLY'] as const;
export const PROCEDURE_KIND_VALUES = ['procedure', 'injection'] as const;
export const AGENDA_COLOR_VALUES = ['teal', 'cyan', 'blue', 'indigo', 'violet', 'fuchsia', 'slate', 'stone'] as const;

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

/** Columnas comunes a los cuatro catálogos. */
const common = () => ({
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  code: text('code').notNull(),
  name: text('name').notNull(),
  /** «Orden (opcional)»: 0 a 100000; las listas se ordenan por él y por código. */
  sortOrder: integer('sort_order'),
  active: boolean('active').notNull().default(true),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
});

export const appointmentTypes = appSchema.table(
  'appointment_types',
  {
    ...common(),
    /** Duración por defecto de la cita: de 5 a 480 minutos, como una cita. */
    defaultDurationMinutes: integer('default_duration_minutes'),
    /** Ruta sugerida de la visita (orienta el registro de llegada, fase 3). */
    suggestedRoute: text('suggested_route'),
    /** Color de la agenda: solo franja lateral de la tarjeta (T-014). */
    color: text('color').notNull().default('teal'),
  },
  (t) => [
    unique('appointment_types_organization_id_id_key').on(t.organizationId, t.id),
    unique('appointment_types_organization_id_code_key').on(t.organizationId, t.code),
    check('appointment_types_code_format', sql`${t.code} ~ ${sql.raw(`'${CATALOG_CODE_PATTERN}'`)}`),
    check('appointment_types_name_length', sql`char_length(${t.name}) between 1 and 120`),
    check('appointment_types_sort_order_range', sql`${t.sortOrder} between 0 and 100000`),
    check('appointment_types_duration_range', sql`${t.defaultDurationMinutes} between 5 and 480`),
    check('appointment_types_route_check', sql`${t.suggestedRoute} in (${inList(VISIT_ROUTE_VALUES)})`),
    check('appointment_types_color_check', sql`${t.color} in (${inList(AGENDA_COLOR_VALUES)})`),
  ],
);

export const procedures = appSchema.table(
  'procedures',
  {
    ...common(),
    /** Procedimiento o Inyección. */
    kind: text('kind').notNull(),
  },
  (t) => [
    unique('procedures_organization_id_id_key').on(t.organizationId, t.id),
    unique('procedures_organization_id_code_key').on(t.organizationId, t.code),
    check('procedures_code_format', sql`${t.code} ~ ${sql.raw(`'${CATALOG_CODE_PATTERN}'`)}`),
    check('procedures_name_length', sql`char_length(${t.name}) between 1 and 120`),
    check('procedures_sort_order_range', sql`${t.sortOrder} between 0 and 100000`),
    check('procedures_kind_check', sql`${t.kind} in (${inList(PROCEDURE_KIND_VALUES)})`),
  ],
);

export const labTests = appSchema.table(
  'lab_tests',
  { ...common() },
  (t) => [
    unique('lab_tests_organization_id_id_key').on(t.organizationId, t.id),
    unique('lab_tests_organization_id_code_key').on(t.organizationId, t.code),
    check('lab_tests_code_format', sql`${t.code} ~ ${sql.raw(`'${CATALOG_CODE_PATTERN}'`)}`),
    check('lab_tests_name_length', sql`char_length(${t.name}) between 1 and 120`),
    check('lab_tests_sort_order_range', sql`${t.sortOrder} between 0 and 100000`),
  ],
);

export const referralSources = appSchema.table(
  'referral_sources',
  { ...common() },
  (t) => [
    unique('referral_sources_organization_id_id_key').on(t.organizationId, t.id),
    unique('referral_sources_organization_id_code_key').on(t.organizationId, t.code),
    check('referral_sources_code_format', sql`${t.code} ~ ${sql.raw(`'${CATALOG_CODE_PATTERN}'`)}`),
    check('referral_sources_name_length', sql`char_length(${t.name}) between 1 and 120`),
    check('referral_sources_sort_order_range', sql`${t.sortOrder} between 0 and 100000`),
  ],
);

/**
 * Precio de un procedimiento o de una prueba en una sede, desde una fecha (en
 * la zona horaria de la sede). Nunca se modifica ni se borra: un cambio es una
 * fila nueva. El vigente es el de fecha más reciente que no sea posterior a
 * hoy en la sede; con la misma fecha, el último creado.
 */
export const prices = appSchema.table(
  'prices',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    locationId: uuid('location_id').notNull(),
    procedureId: uuid('procedure_id'),
    labTestId: uuid('lab_test_id'),
    /** Centavos de USD (regla 4). */
    amountCents: integer('amount_cents').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    unique('prices_organization_id_id_key').on(t.organizationId, t.id),
    check('prices_amount_check', sql`${t.amountCents} >= 0`),
    check('prices_one_item_check', sql`num_nonnulls(${t.procedureId}, ${t.labTestId}) = 1`),
    foreignKey({ name: 'prices_location_fk', columns: [t.organizationId, t.locationId], foreignColumns: [locations.organizationId, locations.id] }),
    foreignKey({ name: 'prices_procedure_fk', columns: [t.organizationId, t.procedureId], foreignColumns: [procedures.organizationId, procedures.id] }),
    foreignKey({ name: 'prices_lab_test_fk', columns: [t.organizationId, t.labTestId], foreignColumns: [labTests.organizationId, labTests.id] }),
    index('prices_procedure_idx').on(t.organizationId, t.locationId, t.procedureId, t.effectiveFrom),
    index('prices_lab_test_idx').on(t.organizationId, t.locationId, t.labTestId, t.effectiveFrom),
  ],
);
