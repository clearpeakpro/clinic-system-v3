import { sql } from 'drizzle-orm';
import { check, date, foreignKey, index, integer, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { labProviders, labTests, procedures } from './catalog-schema.ts';
import { encounters } from './encounters-schema.ts';
import { memberships } from './identity-schema.ts';
import { appSchema, locations, organizations } from './schema.ts';

// Órdenes con su cargo (T-025; S-CLI-17, 18 y 21). RLS, FORCE y GRANT en
// migrations/0037_orders_rls.sql. Referencias compuestas con la organización.
//  - orders: la orden de la visita, con su código por sede (NOR1-O-000123,
//    ADR 0019), su estado y, en Laboratorio, el laboratorio asignado (solo el
//    id: los costos viven en lab_test_costs y nunca salen al personal
//    clínico). Notas y motivo de cancelación cifrados (FieldCipher). Nunca se
//    borra: se cancela con motivo.
//  - order_items: las líneas (un ítem en Procedimiento e Inyección; una o
//    varias pruebas en Laboratorio), con una copia del código y el nombre.
//    Append-only.
//  - charges: la parte mínima de facturación (T-027 la amplía): un cargo por
//    línea, de origen «Orden», al precio vigente de la sede el día de la
//    orden, que calcula el servidor. Centavos (CLAUDE.md, regla 4). Nada se
//    borra en finanzas (regla 5): se anula con motivo cifrado, y clinic_app
//    solo puede cambiar las columnas de la anulación (GRANT por columnas).
// Los estados son los de @clinic/shared (orders.ts); una prueba los compara.

export const ORDER_TYPE_VALUES = ['procedure', 'injection', 'lab'] as const;
export const ORDER_STATUS_VALUES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export const CHARGE_SOURCE_VALUES = ['order'] as const;
export const CHARGE_STATUS_VALUES = ['active', 'voided'] as const;

/** Código de la orden por sede: `NOR1-O-000045` (ADR 0019). */
export const ORDER_CODE_PATTERN = '^[A-Z][A-Z0-9]{1,7}-O-[0-9]{6,}$';

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export const orders = appSchema.table(
  'orders',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    locationId: uuid('location_id').notNull(),
    encounterId: uuid('encounter_id').notNull(),
    code: text('code').notNull(),
    type: text('type').notNull(),
    status: text('status').notNull().default('PENDING'),
    orderedByMembershipId: uuid('ordered_by_membership_id').notNull(),
    orderedAt: timestamp('ordered_at', { withTimezone: true }).notNull(),
    /** Quién la ejecuta (T-026); nula = «Sin asignar». */
    assignedToMembershipId: uuid('assigned_to_membership_id'),
    /** Laboratorio asignado (solo Laboratorio); nulo = «Sin laboratorio asignado». */
    labProviderId: uuid('lab_provider_id'),
    /** El que sugirió el sistema al crearla (ADR 0028); nulo con seguro o sin laboratorio. */
    suggestedLabProviderId: uuid('suggested_lab_provider_id'),
    notesEnc: text('notes_enc'),
    cancelReasonEnc: text('cancel_reason_enc'),
    cancelledByMembershipId: uuid('cancelled_by_membership_id'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    unique('orders_organization_id_id_key').on(t.organizationId, t.id),
    unique('orders_organization_id_code_key').on(t.organizationId, t.code),
    foreignKey({ name: 'orders_location_fk', columns: [t.organizationId, t.locationId], foreignColumns: [locations.organizationId, locations.id] }),
    foreignKey({ name: 'orders_encounter_fk', columns: [t.organizationId, t.encounterId], foreignColumns: [encounters.organizationId, encounters.id] }),
    foreignKey({
      name: 'orders_ordered_by_fk',
      columns: [t.organizationId, t.orderedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    foreignKey({
      name: 'orders_assigned_to_fk',
      columns: [t.organizationId, t.assignedToMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    foreignKey({
      name: 'orders_cancelled_by_fk',
      columns: [t.organizationId, t.cancelledByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    foreignKey({ name: 'orders_lab_provider_fk', columns: [t.organizationId, t.labProviderId], foreignColumns: [labProviders.organizationId, labProviders.id] }),
    foreignKey({
      name: 'orders_suggested_lab_provider_fk',
      columns: [t.organizationId, t.suggestedLabProviderId],
      foreignColumns: [labProviders.organizationId, labProviders.id],
    }),
    check('orders_code_format', sql`${t.code} ~ ${sql.raw(`'${ORDER_CODE_PATTERN}'`)}`),
    check('orders_type_check', sql`${t.type} in (${inList(ORDER_TYPE_VALUES)})`),
    check('orders_status_check', sql`${t.status} in (${inList(ORDER_STATUS_VALUES)})`),
    // El laboratorio, solo en las órdenes de laboratorio.
    check('orders_lab_check', sql`${t.type} = 'lab' or (${t.labProviderId} is null and ${t.suggestedLabProviderId} is null)`),
    // Cancelada ⇔ motivo, quién y cuándo.
    check(
      'orders_cancelled_check',
      sql`(${t.status} = 'CANCELLED') = (${t.cancelReasonEnc} is not null and ${t.cancelledByMembershipId} is not null and ${t.cancelledAt} is not null)`,
    ),
    check('orders_version_check', sql`${t.version} >= 1`),
    index('orders_encounter_idx').on(t.organizationId, t.encounterId, t.orderedAt),
    // Cola de órdenes (T-026): por sede y estado.
    index('orders_location_status_idx').on(t.organizationId, t.locationId, t.status, t.orderedAt),
  ],
);

export const orderItems = appSchema.table(
  'order_items',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    orderId: uuid('order_id').notNull(),
    procedureId: uuid('procedure_id'),
    labTestId: uuid('lab_test_id'),
    quantity: integer('quantity').notNull(),
    /** Copia del catálogo al ordenar: las órdenes históricas muestran ítems ya inactivos o renombrados. */
    itemCode: text('item_code').notNull(),
    itemName: text('item_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    unique('order_items_organization_id_id_key').on(t.organizationId, t.id),
    foreignKey({ name: 'order_items_order_fk', columns: [t.organizationId, t.orderId], foreignColumns: [orders.organizationId, orders.id] }),
    foreignKey({ name: 'order_items_procedure_fk', columns: [t.organizationId, t.procedureId], foreignColumns: [procedures.organizationId, procedures.id] }),
    foreignKey({ name: 'order_items_lab_test_fk', columns: [t.organizationId, t.labTestId], foreignColumns: [labTests.organizationId, labTests.id] }),
    check('order_items_one_item_check', sql`num_nonnulls(${t.procedureId}, ${t.labTestId}) = 1`),
    check('order_items_quantity_range', sql`${t.quantity} between 1 and 1000`),
    index('order_items_order_idx').on(t.organizationId, t.orderId),
  ],
);

export const charges = appSchema.table(
  'charges',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    locationId: uuid('location_id').notNull(),
    encounterId: uuid('encounter_id').notNull(),
    source: text('source').notNull().default('order'),
    orderId: uuid('order_id').notNull(),
    orderItemId: uuid('order_item_id').notNull(),
    /** Centavos de USD (regla 4). */
    unitPriceCents: integer('unit_price_cents').notNull(),
    quantity: integer('quantity').notNull(),
    amountCents: integer('amount_cents').notNull(),
    /** Día de la sede cuyo precio rige (AAAA-MM-DD). */
    priceDate: date('price_date').notNull(),
    status: text('status').notNull().default('active'),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    voidReasonEnc: text('void_reason_enc'),
    voidedByMembershipId: uuid('voided_by_membership_id'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
  },
  (t) => [
    unique('charges_organization_id_id_key').on(t.organizationId, t.id),
    // Un cargo por línea («Ya existe un cargo para esta orden»).
    unique('charges_organization_id_order_item_id_key').on(t.organizationId, t.orderItemId),
    foreignKey({ name: 'charges_location_fk', columns: [t.organizationId, t.locationId], foreignColumns: [locations.organizationId, locations.id] }),
    foreignKey({ name: 'charges_encounter_fk', columns: [t.organizationId, t.encounterId], foreignColumns: [encounters.organizationId, encounters.id] }),
    foreignKey({ name: 'charges_order_fk', columns: [t.organizationId, t.orderId], foreignColumns: [orders.organizationId, orders.id] }),
    foreignKey({ name: 'charges_order_item_fk', columns: [t.organizationId, t.orderItemId], foreignColumns: [orderItems.organizationId, orderItems.id] }),
    foreignKey({
      name: 'charges_created_by_fk',
      columns: [t.organizationId, t.createdByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    foreignKey({
      name: 'charges_voided_by_fk',
      columns: [t.organizationId, t.voidedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    check('charges_source_check', sql`${t.source} in (${inList(CHARGE_SOURCE_VALUES)})`),
    check('charges_status_check', sql`${t.status} in (${inList(CHARGE_STATUS_VALUES)})`),
    check('charges_unit_price_check', sql`${t.unitPriceCents} >= 0`),
    check('charges_quantity_range', sql`${t.quantity} between 1 and 1000`),
    check('charges_amount_check', sql`${t.amountCents} >= 0 and ${t.amountCents}::bigint = ${t.unitPriceCents}::bigint * ${t.quantity}`),
    // Anulado ⇔ motivo, quién y cuándo.
    check(
      'charges_voided_check',
      sql`(${t.status} = 'voided') = (${t.voidReasonEnc} is not null and ${t.voidedByMembershipId} is not null and ${t.voidedAt} is not null)`,
    ),
    check('charges_version_check', sql`${t.version} >= 1`),
    index('charges_encounter_idx').on(t.organizationId, t.encounterId),
    index('charges_order_idx').on(t.organizationId, t.orderId),
  ],
);
