import { sql } from 'drizzle-orm';
import { check, date, foreignKey, index, integer, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { memberships } from './identity-schema.ts';
import { MEMBERSHIP_FEE_MAX_CENTS, membershipPlans } from './membership-plans-schema.ts';
import { patients } from './patients-schema.ts';
import { appSchema, locations, organizations } from './schema.ts';

// Membresía del paciente (T-026b parte B; S-PAC-22 y 23; ADR 0034). RLS,
// FORCE y GRANT en migrations/0042_patient_memberships_rls.sql. Referencias
// compuestas con la organización. Los valores permitidos son los de
// @clinic/shared (patient-memberships.ts); una prueba los compara.
//  - patient_memberships: plan, titular, sede de inscripción, fecha de
//    inicio, día de cobro y las cuotas con las que se inscribió («Monto
//    fijo»: un cambio de cuota del plan no las toca). «Identidad verificada»
//    guarda quién y cuándo, nunca un número de ID ni datos de tarjeta. Nunca
//    se borra: se cancela.
//  - patient_membership_members: titular y afiliados, con su alta y su baja.
//    Un paciente solo está en una membresía no cancelada (índice único
//    parcial sobre los que no se fueron; al cancelarse, todos se van).
//  - patient_membership_events: historial de estados y afiliados; solo se
//    insertan (actor: una persona o «Sistema»).
//  - membership_fees: cuota inicial y mensualidades como cuotas pendientes,
//    con su importe en centavos; T-028 las cobra. Nunca se borran: se pagan o
//    se anulan.

export const PATIENT_MEMBERSHIP_STATUS_VALUES = ['pending_payment', 'active', 'suspended', 'cancelled'] as const;
export const MEMBERSHIP_CANCELLATION_VALUES = ['notice', 'non_payment', 'initial_unpaid'] as const;
export const MEMBERSHIP_MEMBER_ROLE_VALUES = ['holder', 'affiliate'] as const;
export const MEMBERSHIP_FEE_KIND_VALUES = ['initial', 'monthly'] as const;
export const MEMBERSHIP_FEE_STATUS_VALUES = ['pending', 'paid', 'voided'] as const;
export const MEMBERSHIP_EVENT_ACTION_VALUES = [
  'enrolled',
  'activated',
  'suspended',
  'reactivated',
  'cancel_notice',
  'cancelled',
  'member_added',
  'member_removed',
] as const;
export const MEMBERSHIP_ACTOR_TYPE_VALUES = ['user', 'system'] as const;

/** Código de la membresía por sede de inscripción: `NOR1-M-000012`. */
export const PATIENT_MEMBERSHIP_CODE_PATTERN = '^[A-Z][A-Z0-9]{1,7}-M-[0-9]{6,}$';

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export const patientMemberships = appSchema.table(
  'patient_memberships',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    code: text('code').notNull(),
    planId: uuid('plan_id').notNull(),
    holderPatientId: uuid('holder_patient_id').notNull(),
    /** Sede de inscripción: su zona horaria da el «hoy» de los vencimientos. */
    locationId: uuid('location_id').notNull(),
    status: text('status').notNull().default('pending_payment'),
    /** Día de la sede en que se inscribió (cuenta para los 30 días sin pagar la cuota inicial). */
    enrolledOn: date('enrolled_on').notNull(),
    startDate: date('start_date').notNull(),
    billingDay: integer('billing_day').notNull(),
    /** Las cuotas vigentes del plan el día de la inscripción («Monto fijo»). */
    initialFeeCents: integer('initial_fee_cents').notNull(),
    monthlyFeeCents: integer('monthly_fee_cents').notNull(),
    enrolledByMembershipId: uuid('enrolled_by_membership_id').notNull(),
    /** «Identidad verificada»: quién y cuándo (nunca un número de ID). */
    identityVerifiedByMembershipId: uuid('identity_verified_by_membership_id').notNull(),
    identityVerifiedAt: timestamp('identity_verified_at', { withTimezone: true }).notNull(),
    /** Aviso de cancelación del paciente: el día, quién lo registró y el último día con beneficios. */
    cancelNoticeOn: date('cancel_notice_on'),
    cancelNoticeByMembershipId: uuid('cancel_notice_by_membership_id'),
    benefitsEndDate: date('benefits_end_date'),
    cancelledOn: date('cancelled_on'),
    cancellation: text('cancellation'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    unique('patient_memberships_organization_id_id_key').on(t.organizationId, t.id),
    unique('patient_memberships_organization_id_code_key').on(t.organizationId, t.code),
    foreignKey({ name: 'patient_memberships_plan_fk', columns: [t.organizationId, t.planId], foreignColumns: [membershipPlans.organizationId, membershipPlans.id] }),
    foreignKey({ name: 'patient_memberships_holder_fk', columns: [t.organizationId, t.holderPatientId], foreignColumns: [patients.organizationId, patients.id] }),
    foreignKey({ name: 'patient_memberships_location_fk', columns: [t.organizationId, t.locationId], foreignColumns: [locations.organizationId, locations.id] }),
    foreignKey({
      name: 'patient_memberships_enrolled_by_fk',
      columns: [t.organizationId, t.enrolledByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    foreignKey({
      name: 'patient_memberships_identity_by_fk',
      columns: [t.organizationId, t.identityVerifiedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    foreignKey({
      name: 'patient_memberships_notice_by_fk',
      columns: [t.organizationId, t.cancelNoticeByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    check('patient_memberships_code_format', sql`${t.code} ~ ${sql.raw(`'${PATIENT_MEMBERSHIP_CODE_PATTERN}'`)}`),
    check('patient_memberships_status_check', sql`${t.status} in (${inList(PATIENT_MEMBERSHIP_STATUS_VALUES)})`),
    check('patient_memberships_cancellation_check', sql`${t.cancellation} in (${inList(MEMBERSHIP_CANCELLATION_VALUES)})`),
    check('patient_memberships_billing_day_range', sql`${t.billingDay} between 1 and 31`),
    check('patient_memberships_fees_range', sql`${t.initialFeeCents} between 0 and ${sql.raw(String(MEMBERSHIP_FEE_MAX_CENTS))} and ${t.monthlyFeeCents} between 0 and ${sql.raw(String(MEMBERSHIP_FEE_MAX_CENTS))}`),
    check('patient_memberships_start_check', sql`${t.startDate} >= ${t.enrolledOn}`),
    // Cancelada ⇔ día y motivo de la cancelación.
    check('patient_memberships_cancelled_check', sql`(${t.status} = 'cancelled') = (${t.cancelledOn} is not null and ${t.cancellation} is not null)`),
    // El aviso: el día, quién y el fin de beneficios, juntos.
    check(
      'patient_memberships_notice_check',
      sql`(${t.cancelNoticeOn} is null) = (${t.cancelNoticeByMembershipId} is null) and (${t.cancelNoticeOn} is null) = (${t.benefitsEndDate} is null)`,
    ),
    check('patient_memberships_version_check', sql`${t.version} >= 1`),
    index('patient_memberships_holder_idx').on(t.organizationId, t.holderPatientId),
    // El trabajo del worker recorre las no canceladas.
    index('patient_memberships_status_idx').on(t.organizationId, t.status),
  ],
);

export const patientMembershipMembers = appSchema.table(
  'patient_membership_members',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    membershipId: uuid('membership_id').notNull(),
    patientId: uuid('patient_id').notNull(),
    role: text('role').notNull(),
    addedByMembershipId: uuid('added_by_membership_id').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull(),
    /** Baja: quitado como afiliado o fin de la membresía (nulo = sigue). */
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedByMembershipId: uuid('removed_by_membership_id'),
  },
  (t) => [
    unique('patient_membership_members_organization_id_id_key').on(t.organizationId, t.id),
    foreignKey({
      name: 'patient_membership_members_membership_fk',
      columns: [t.organizationId, t.membershipId],
      foreignColumns: [patientMemberships.organizationId, patientMemberships.id],
    }),
    foreignKey({ name: 'patient_membership_members_patient_fk', columns: [t.organizationId, t.patientId], foreignColumns: [patients.organizationId, patients.id] }),
    foreignKey({
      name: 'patient_membership_members_added_by_fk',
      columns: [t.organizationId, t.addedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    foreignKey({
      name: 'patient_membership_members_removed_by_fk',
      columns: [t.organizationId, t.removedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    check('patient_membership_members_role_check', sql`${t.role} in (${inList(MEMBERSHIP_MEMBER_ROLE_VALUES)})`),
    // Un paciente, en una sola membresía en curso (decisión 8 del 2026-11-04).
    uniqueIndex('patient_membership_members_current_key').on(t.organizationId, t.patientId).where(sql`${t.removedAt} is null`),
    // Un solo titular por membresía.
    uniqueIndex('patient_membership_members_holder_key').on(t.organizationId, t.membershipId).where(sql`${t.role} = 'holder'`),
    index('patient_membership_members_membership_idx').on(t.organizationId, t.membershipId),
  ],
);

export const patientMembershipEvents = appSchema.table(
  'patient_membership_events',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    membershipId: uuid('membership_id').notNull(),
    action: text('action').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    actorType: text('actor_type').notNull(),
    actorMembershipId: uuid('actor_membership_id'),
    /** Afiliado añadido o quitado. */
    patientId: uuid('patient_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    unique('patient_membership_events_organization_id_id_key').on(t.organizationId, t.id),
    foreignKey({
      name: 'patient_membership_events_membership_fk',
      columns: [t.organizationId, t.membershipId],
      foreignColumns: [patientMemberships.organizationId, patientMemberships.id],
    }),
    foreignKey({ name: 'patient_membership_events_patient_fk', columns: [t.organizationId, t.patientId], foreignColumns: [patients.organizationId, patients.id] }),
    foreignKey({
      name: 'patient_membership_events_actor_fk',
      columns: [t.organizationId, t.actorMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    check('patient_membership_events_action_check', sql`${t.action} in (${inList(MEMBERSHIP_EVENT_ACTION_VALUES)})`),
    check('patient_membership_events_from_check', sql`${t.fromStatus} in (${inList(PATIENT_MEMBERSHIP_STATUS_VALUES)})`),
    check('patient_membership_events_to_check', sql`${t.toStatus} in (${inList(PATIENT_MEMBERSHIP_STATUS_VALUES)})`),
    check('patient_membership_events_actor_type_check', sql`${t.actorType} in (${inList(MEMBERSHIP_ACTOR_TYPE_VALUES)})`),
    check('patient_membership_events_actor_check', sql`(${t.actorType} = 'user') = (${t.actorMembershipId} is not null)`),
    index('patient_membership_events_membership_idx').on(t.organizationId, t.membershipId, t.occurredAt),
  ],
);

export const membershipFees = appSchema.table(
  'membership_fees',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    membershipId: uuid('membership_id').notNull(),
    kind: text('kind').notNull(),
    /** La cuota inicial vence el día de inicio; cada mensualidad, en su día de cobro. */
    dueDate: date('due_date').notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    amountCents: integer('amount_cents').notNull(),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    /** T-028 la marca como pagada con su pago. */
    paidAt: timestamp('paid_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
  },
  (t) => [
    unique('membership_fees_organization_id_id_key').on(t.organizationId, t.id),
    // Una cuota por vencimiento: el worker puede correr varias veces sin repetirla.
    unique('membership_fees_membership_due_key').on(t.organizationId, t.membershipId, t.kind, t.dueDate),
    foreignKey({
      name: 'membership_fees_membership_fk',
      columns: [t.organizationId, t.membershipId],
      foreignColumns: [patientMemberships.organizationId, patientMemberships.id],
    }),
    check('membership_fees_kind_check', sql`${t.kind} in (${inList(MEMBERSHIP_FEE_KIND_VALUES)})`),
    check('membership_fees_status_check', sql`${t.status} in (${inList(MEMBERSHIP_FEE_STATUS_VALUES)})`),
    check('membership_fees_amount_range', sql`${t.amountCents} between 0 and ${sql.raw(String(MEMBERSHIP_FEE_MAX_CENTS))}`),
    check('membership_fees_period_check', sql`${t.periodEnd} >= ${t.periodStart}`),
    check('membership_fees_paid_check', sql`(${t.status} = 'paid') = (${t.paidAt} is not null)`),
    check('membership_fees_voided_check', sql`(${t.status} = 'voided') = (${t.voidedAt} is not null)`),
    check('membership_fees_version_check', sql`${t.version} >= 1`),
    uniqueIndex('membership_fees_initial_key').on(t.organizationId, t.membershipId).where(sql`${t.kind} = 'initial'`),
  ],
);
