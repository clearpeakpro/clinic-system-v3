import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, integer, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { appointments } from './appointments-schema.ts';
import { appointmentTypes, VISIT_ROUTE_VALUES } from './catalog-schema.ts';
import { memberships } from './identity-schema.ts';
import { patients } from './patients-schema.ts';
import { appSchema, locations, organizations } from './schema.ts';

// Visitas, su historial y su cobertura (T-017; S-REC-18 a 27). RLS, FORCE y
// GRANT en migrations/0028_encounters_rls.sql. Todas las referencias son
// compuestas con la organización. Los estados son los de @clinic/shared
// (visit.ts); una prueba los compara. Los cambios de estado pasan siempre por
// la máquina de estados compartida y cada uno deja su fila en
// encounter_events (CLAUDE.md, regla 3).

export const VISIT_STATUS_VALUES = [
  'CHECKED_IN',
  'WAITING_FOR_NURSE',
  'WITH_NURSE',
  'WAITING_FOR_PROVIDER',
  'WITH_PROVIDER',
  'PROCEDURE_PENDING',
  'READY_FOR_CHECKOUT',
  'CHECKOUT',
  'COMPLETED',
  'LEFT_EARLY',
  'CANCELLED',
] as const;

/** Estados cerrados: fuera de los índices de «una visita abierta». */
export const CLOSED_VISIT_STATUS_VALUES = ['COMPLETED', 'LEFT_EARLY', 'CANCELLED'] as const;

/** Cómo se abrió la visita. `kiosk` llega con T-020/T-021. */
export const ENCOUNTER_SOURCE_VALUES = ['appointment', 'walk_in', 'kiosk'] as const;

/** Tipo de cobertura. `membership` existe desde T-017 pero se usa desde T-026b (ADR 0034). */
export const COVERAGE_TYPE_VALUES = ['self_pay', 'insurance', 'membership'] as const;
/** Un solo término económico del seguro (S-REC-25). */
export const INSURANCE_TERM_VALUES = ['copay', 'coinsurance', 'deductible'] as const;

/** Código de la visita por sede: `NOR1-V-000123` (ADR 0019). */
export const ENCOUNTER_CODE_PATTERN = '^[A-Z][A-Z0-9]{1,7}-V-[0-9]{6,}$';

/** Quién hizo una transición: una persona, el kiosco (T-020) o el sistema (p. ej. la última orden resuelta). */
export const ENCOUNTER_ACTOR_TYPE_VALUES = ['user', 'kiosk', 'system'] as const;

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));
const openOnly = (status: unknown) => sql`${status} not in (${inList(CLOSED_VISIT_STATUS_VALUES)})`;

export const encounters = appSchema.table(
  'encounters',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    locationId: uuid('location_id').notNull(),
    patientId: uuid('patient_id').notNull(),
    /** La cita de la que viene; nula en visitas sin cita y del kiosco. */
    appointmentId: uuid('appointment_id'),
    /** Tipo de cita (el de la cita, o el elegido en la visita sin cita); opcional. */
    appointmentTypeId: uuid('appointment_type_id'),
    /** Membresía del proveedor asignado; nula = «Sin asignar» (se asigna en T-018). */
    providerMembershipId: uuid('provider_membership_id'),
    code: text('code').notNull(),
    source: text('source').notNull(),
    /** Ruta elegida por Recepción (ADR 0005). */
    route: text('route').notNull(),
    status: text('status').notNull().default('CHECKED_IN'),
    arrivedAt: timestamp('arrived_at', { withTimezone: true }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    unique('encounters_organization_id_id_key').on(t.organizationId, t.id),
    unique('encounters_organization_id_code_key').on(t.organizationId, t.code),
    foreignKey({ name: 'encounters_location_fk', columns: [t.organizationId, t.locationId], foreignColumns: [locations.organizationId, locations.id] }),
    foreignKey({ name: 'encounters_patient_fk', columns: [t.organizationId, t.patientId], foreignColumns: [patients.organizationId, patients.id] }),
    foreignKey({
      name: 'encounters_appointment_fk',
      columns: [t.organizationId, t.appointmentId],
      foreignColumns: [appointments.organizationId, appointments.id],
    }),
    foreignKey({
      name: 'encounters_type_fk',
      columns: [t.organizationId, t.appointmentTypeId],
      foreignColumns: [appointmentTypes.organizationId, appointmentTypes.id],
    }),
    foreignKey({
      name: 'encounters_provider_fk',
      columns: [t.organizationId, t.providerMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    check('encounters_code_format', sql`${t.code} ~ ${sql.raw(`'${ENCOUNTER_CODE_PATTERN}'`)}`),
    check('encounters_status_check', sql`${t.status} in (${inList(VISIT_STATUS_VALUES)})`),
    check('encounters_route_check', sql`${t.route} in (${inList(VISIT_ROUTE_VALUES)})`),
    check('encounters_source_check', sql`${t.source} in (${inList(ENCOUNTER_SOURCE_VALUES)})`),
    check('encounters_source_appointment_check', sql`(${t.source} = 'appointment') = (${t.appointmentId} is not null)`),
    check('encounters_closed_at_check', sql`(${t.closedAt} is null) = (${openOnly(t.status)})`),
    check('encounters_version_check', sql`${t.version} >= 1`),
    // Una sola visita abierta por cita, y una por paciente y sede (ADR 0019).
    uniqueIndex('encounters_open_appointment_key').on(t.organizationId, t.appointmentId).where(openOnly(t.status)),
    uniqueIndex('encounters_open_patient_location_key').on(t.organizationId, t.patientId, t.locationId).where(openOnly(t.status)),
    // Colas y Panel de la sede (T-019): por estado y llegada.
    index('encounters_location_status_idx').on(t.organizationId, t.locationId, t.status, t.arrivedAt),
    // Pestaña Visitas del perfil (T-018).
    index('encounters_patient_arrived_idx').on(t.organizationId, t.patientId, t.arrivedAt),
  ],
);

/**
 * Historial de la visita (S-CLI-24): una fila por transición, también la
 * apertura (from_status nulo). Solo se insertan: nunca se cambian ni se borran.
 */
export const encounterEvents = appSchema.table(
  'encounter_events',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    encounterId: uuid('encounter_id').notNull(),
    locationId: uuid('location_id').notNull(),
    /** Acción de la máquina de estados (`check_in`, `send_to_nurse`, `close`…). */
    action: text('action').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    actorType: text('actor_type').notNull(),
    /** Membresía de quien actuó; nula si fue el kiosco o el sistema. */
    actorMembershipId: uuid('actor_membership_id'),
    /** Motivo (cerrar, forzar), cifrado (FieldCipher): es texto libre. */
    reasonEnc: text('reason_enc'),
    /** «Forzar estado…» (S-CLI-10, T-018): chip «Forzado» del historial. */
    forced: boolean('forced').notNull().default(false),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    unique('encounter_events_organization_id_id_key').on(t.organizationId, t.id),
    foreignKey({
      name: 'encounter_events_encounter_fk',
      columns: [t.organizationId, t.encounterId],
      foreignColumns: [encounters.organizationId, encounters.id],
    }),
    foreignKey({ name: 'encounter_events_location_fk', columns: [t.organizationId, t.locationId], foreignColumns: [locations.organizationId, locations.id] }),
    foreignKey({
      name: 'encounter_events_actor_fk',
      columns: [t.organizationId, t.actorMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    check('encounter_events_to_status_check', sql`${t.toStatus} in (${inList(VISIT_STATUS_VALUES)})`),
    check('encounter_events_from_status_check', sql`${t.fromStatus} is null or ${t.fromStatus} in (${inList(VISIT_STATUS_VALUES)})`),
    check('encounter_events_actor_type_check', sql`${t.actorType} in (${inList(ENCOUNTER_ACTOR_TYPE_VALUES)})`),
    check('encounter_events_actor_check', sql`(${t.actorType} = 'user') = (${t.actorMembershipId} is not null)`),
    index('encounter_events_encounter_idx').on(t.organizationId, t.encounterId, t.occurredAt),
  ],
);

/** Tope de un copago o deducible: 9 999 999,99 USD, en centavos (cabe en un entero). */
export const COVERAGE_AMOUNT_MAX_CENTS = 999_999_999;

/**
 * Cobertura de la visita (S-REC-24 y 25; S-CLI-11 y 12 en T-018): una por
 * visita, también con Pago directo. Nombre del seguro e ID de miembro, cifrados
 * (ADR 0026). Importes en centavos; el coaseguro en centésimas de punto
 * (2 000 = 20 %). Un solo término.
 */
export const coverages = appSchema.table(
  'coverages',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    encounterId: uuid('encounter_id').notNull(),
    type: text('type').notNull(),
    insurerNameEnc: text('insurer_name_enc'),
    memberIdEnc: text('member_id_enc'),
    term: text('term'),
    amountCents: integer('amount_cents'),
    coinsuranceBp: integer('coinsurance_bp'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    unique('coverages_organization_id_id_key').on(t.organizationId, t.id),
    unique('coverages_organization_id_encounter_id_key').on(t.organizationId, t.encounterId),
    foreignKey({
      name: 'coverages_encounter_fk',
      columns: [t.organizationId, t.encounterId],
      foreignColumns: [encounters.organizationId, encounters.id],
    }),
    check('coverages_type_check', sql`${t.type} in (${inList(COVERAGE_TYPE_VALUES)})`),
    check('coverages_term_check', sql`${t.term} is null or ${t.term} in (${inList(INSURANCE_TERM_VALUES)})`),
    check('coverages_amount_range', sql`${t.amountCents} between 0 and ${sql.raw(String(COVERAGE_AMOUNT_MAX_CENTS))}`),
    check('coverages_coinsurance_range', sql`${t.coinsuranceBp} between 0 and 10000`),
    // Con seguro: nombre y un solo término con su valor. Sin seguro: nada de eso.
    check(
      'coverages_insurance_check',
      sql`case when ${t.type} = 'insurance' then
            ${t.insurerNameEnc} is not null and ${t.term} is not null
            and ((${t.term} = 'coinsurance') = (${t.coinsuranceBp} is not null))
            and ((${t.term} = 'coinsurance') = (${t.amountCents} is null))
          else
            ${t.insurerNameEnc} is null and ${t.memberIdEnc} is null and ${t.term} is null
            and ${t.amountCents} is null and ${t.coinsuranceBp} is null
          end`,
    ),
    check('coverages_version_check', sql`${t.version} >= 1`),
  ],
);
