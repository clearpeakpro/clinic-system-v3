import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { encounters } from './encounters-schema.ts';
import { memberships } from './identity-schema.ts';
import { membershipFees } from './patient-memberships-schema.ts';
import { patients } from './patients-schema.ts';
import { appSchema, locations, organizations } from './schema.ts';

// Estado de cuenta de la visita (T-027; S-CAJ-07). RLS, FORCE y GRANT en
// migrations/0044_billing_statements_rls.sql.
//  - Una fila por visita, con `version` (concurrencia optimista, regla 7) y
//    bloqueo FOR UPDATE para los cobros de T-028.
//  - No guarda importes: los totales los calcula siempre el servidor a partir
//    de los cargos activos y los pagos registrados (computeStatement() de
//    @clinic/shared). La versión sube con cada cambio de importes: un cargo
//    creado o anulado, un cambio de beneficios o de cobertura y, desde T-028,
//    cada pago.
//  - Se crea cuando la visita la necesita por primera vez (touchStatement /
//    ensureStatement). Nunca se borra.

export const billingStatements = appSchema.table(
  'billing_statements',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    locationId: uuid('location_id').notNull(),
    encounterId: uuid('encounter_id').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    unique('billing_statements_organization_id_id_key').on(t.organizationId, t.id),
    // Un estado de cuenta por visita.
    unique('billing_statements_organization_id_encounter_id_key').on(t.organizationId, t.encounterId),
    foreignKey({ name: 'billing_statements_location_fk', columns: [t.organizationId, t.locationId], foreignColumns: [locations.organizationId, locations.id] }),
    foreignKey({ name: 'billing_statements_encounter_fk', columns: [t.organizationId, t.encounterId], foreignColumns: [encounters.organizationId, encounters.id] }),
    check('billing_statements_version_check', sql`${t.version} >= 1`),
  ],
);

// Pagos (T-028; S-CAJ-11 a 13, S-CAJ-17, S-PAC-10). RLS, FORCE y GRANT en
// migrations/0046_payments_rls.sql.
//  - Un pago es de una visita (su estado de cuenta) o de una cuota de
//    membresía (ADR 0034), nunca de las dos.
//  - Append-only: clinic_app solo tiene SELECT e INSERT. Anular un pago es
//    insertar su fila inversa (`kind = 'void'`): el mismo destino y método,
//    el monto en negativo, el pago que anula (uno solo por pago, índice
//    único) y el motivo cifrado. Lo pagado es la suma de las filas.
//  - Nunca se guardan datos de tarjeta: solo el método y, si se escribió una
//    referencia, sus últimos 4 caracteres, cifrados (decisión del 2026-11-05).
//    El resto de la referencia se descarta en el servidor.

export const PAYMENT_METHOD_VALUES = ['cash', 'credit_card', 'debit_card', 'other'] as const;
export const PAYMENT_KIND_VALUES = ['payment', 'void'] as const;

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export const payments = appSchema.table(
  'payments',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    /** Sede donde se cobró (la de la terminal). */
    locationId: uuid('location_id').notNull(),
    patientId: uuid('patient_id').notNull(),
    encounterId: uuid('encounter_id'),
    membershipFeeId: uuid('membership_fee_id'),
    kind: text('kind').notNull(),
    method: text('method').notNull(),
    /** Positivo en un pago; negativo (el mismo monto) en su anulación. */
    amountCents: integer('amount_cents').notNull(),
    /** Últimos 4 caracteres de la referencia, cifrados (FieldCipher). */
    referenceLast4Enc: text('reference_last4_enc'),
    /** En la anulación: el pago que anula. */
    reversesPaymentId: uuid('reverses_payment_id'),
    /** En la anulación: el motivo, cifrado. */
    reasonEnc: text('reason_enc'),
    recordedByMembershipId: uuid('recorded_by_membership_id').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    unique('payments_organization_id_id_key').on(t.organizationId, t.id),
    foreignKey({ name: 'payments_location_fk', columns: [t.organizationId, t.locationId], foreignColumns: [locations.organizationId, locations.id] }),
    foreignKey({ name: 'payments_patient_fk', columns: [t.organizationId, t.patientId], foreignColumns: [patients.organizationId, patients.id] }),
    foreignKey({ name: 'payments_encounter_fk', columns: [t.organizationId, t.encounterId], foreignColumns: [encounters.organizationId, encounters.id] }),
    foreignKey({ name: 'payments_membership_fee_fk', columns: [t.organizationId, t.membershipFeeId], foreignColumns: [membershipFees.organizationId, membershipFees.id] }),
    foreignKey({ name: 'payments_reverses_fk', columns: [t.organizationId, t.reversesPaymentId], foreignColumns: [t.organizationId, t.id] }),
    foreignKey({ name: 'payments_recorded_by_fk', columns: [t.organizationId, t.recordedByMembershipId], foreignColumns: [memberships.organizationId, memberships.id] }),
    check('payments_kind_check', sql`${t.kind} in (${inList(PAYMENT_KIND_VALUES)})`),
    check('payments_method_check', sql`${t.method} in (${inList(PAYMENT_METHOD_VALUES)})`),
    check('payments_target_check', sql`(${t.encounterId} is null) <> (${t.membershipFeeId} is null)`),
    check(
      'payments_kind_fields_check',
      sql`(${t.kind} = 'payment' and ${t.amountCents} > 0 and ${t.reversesPaymentId} is null and ${t.reasonEnc} is null)
        or (${t.kind} = 'void' and ${t.amountCents} < 0 and ${t.reversesPaymentId} is not null and ${t.reasonEnc} is not null)`,
    ),
    check('payments_amount_range', sql`${t.amountCents} between -100000000 and 100000000`),
    // Un pago se anula una sola vez.
    uniqueIndex('payments_reverses_key').on(t.organizationId, t.reversesPaymentId).where(sql`${t.reversesPaymentId} is not null`),
    index('payments_encounter_idx').on(t.organizationId, t.encounterId),
    index('payments_membership_fee_idx').on(t.organizationId, t.membershipFeeId),
    index('payments_patient_idx').on(t.organizationId, t.patientId),
  ],
);
