import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { payments } from './billing-schema.ts';
import { encounters } from './encounters-schema.ts';
import { memberships } from './identity-schema.ts';
import { membershipFees } from './patient-memberships-schema.ts';
import { patients } from './patients-schema.ts';
import { appSchema, locations, organizations } from './schema.ts';

// Recibos (T-029; S-CAJ-14, 15 y 24; ADR 0037). RLS, FORCE y GRANT en
// migrations/0048_receipts_rls.sql.
//  - receipts: la instantánea inmutable de cada recibo, cifrada (lleva el
//    nombre del paciente y el de la aseguradora). Código `NOR1-R-2026-000045`
//    por sede y año de la sede, sin huecos (code_counters en la misma
//    transacción). Un destino: la visita o la cuota de membresía. Solo SELECT
//    e INSERT: los recibos no se cambian ni se anulan.
//  - receipt_prints: cada impresión, ya auditada. Sirve para el límite de 30
//    impresiones por persona y minuto (S-CAJ-24). También solo SELECT e INSERT.

export const receipts = appSchema.table(
  'receipts',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    /** Sede que emite el recibo: la de la visita, o la de la terminal en una cuota. */
    locationId: uuid('location_id').notNull(),
    patientId: uuid('patient_id').notNull(),
    encounterId: uuid('encounter_id'),
    membershipFeeId: uuid('membership_fee_id'),
    /** El pago vinculado (opcional en una visita; siempre en una cuota). */
    paymentId: uuid('payment_id'),
    code: text('code').notNull(),
    /** Año del recibo en la zona de la sede (el del código). */
    year: integer('year').notNull(),
    /** La instantánea (receiptSnapshotSchema de @clinic/shared), cifrada con FieldCipher. */
    snapshotEnc: text('snapshot_enc').notNull(),
    issuedByMembershipId: uuid('issued_by_membership_id').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    unique('receipts_organization_id_id_key').on(t.organizationId, t.id),
    unique('receipts_organization_id_code_key').on(t.organizationId, t.code),
    foreignKey({ name: 'receipts_location_fk', columns: [t.organizationId, t.locationId], foreignColumns: [locations.organizationId, locations.id] }),
    foreignKey({ name: 'receipts_patient_fk', columns: [t.organizationId, t.patientId], foreignColumns: [patients.organizationId, patients.id] }),
    foreignKey({ name: 'receipts_encounter_fk', columns: [t.organizationId, t.encounterId], foreignColumns: [encounters.organizationId, encounters.id] }),
    foreignKey({ name: 'receipts_membership_fee_fk', columns: [t.organizationId, t.membershipFeeId], foreignColumns: [membershipFees.organizationId, membershipFees.id] }),
    foreignKey({ name: 'receipts_payment_fk', columns: [t.organizationId, t.paymentId], foreignColumns: [payments.organizationId, payments.id] }),
    foreignKey({ name: 'receipts_issued_by_fk', columns: [t.organizationId, t.issuedByMembershipId], foreignColumns: [memberships.organizationId, memberships.id] }),
    check('receipts_target_check', sql`(${t.encounterId} is null) <> (${t.membershipFeeId} is null)`),
    check('receipts_fee_payment_check', sql`${t.membershipFeeId} is null or ${t.paymentId} is not null`),
    check('receipts_code_format', sql`${t.code} ~ '^[A-Z][A-Z0-9]{1,7}-R-[0-9]{4}-[0-9]{6,}$'`),
    check('receipts_year_range', sql`${t.year} between 2000 and 9999`),
    index('receipts_encounter_idx').on(t.organizationId, t.encounterId),
    index('receipts_membership_fee_idx').on(t.organizationId, t.membershipFeeId),
  ],
);

export const receiptPrints = appSchema.table(
  'receipt_prints',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    locationId: uuid('location_id').notNull(),
    receiptId: uuid('receipt_id').notNull(),
    language: text('language').notNull(),
    printedByMembershipId: uuid('printed_by_membership_id').notNull(),
    printedAt: timestamp('printed_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    unique('receipt_prints_organization_id_id_key').on(t.organizationId, t.id),
    foreignKey({ name: 'receipt_prints_location_fk', columns: [t.organizationId, t.locationId], foreignColumns: [locations.organizationId, locations.id] }),
    foreignKey({ name: 'receipt_prints_receipt_fk', columns: [t.organizationId, t.receiptId], foreignColumns: [receipts.organizationId, receipts.id] }),
    foreignKey({ name: 'receipt_prints_printed_by_fk', columns: [t.organizationId, t.printedByMembershipId], foreignColumns: [memberships.organizationId, memberships.id] }),
    check('receipt_prints_language_check', sql`${t.language} in ('es', 'en')`),
    index('receipt_prints_member_time_idx').on(t.organizationId, t.printedByMembershipId, t.printedAt),
  ],
);
