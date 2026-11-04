import { sql } from 'drizzle-orm';
import { boolean, check, date, foreignKey, index, integer, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { CATALOG_CODE_PATTERN, consultations, labTests, MEMBERSHIP_CATEGORY_VALUES, procedures } from './catalog-schema.ts';
import { appSchema, organizations } from './schema.ts';

// Planes de membresía y sus beneficios (T-026b parte A; S-ADM-21 y 22;
// ADR 0034). Por organización: el precio de un plan es el mismo en todas las
// sedes (decisión 9 del dueño). RLS, FORCE y GRANT en
// migrations/0040_membership_plans_rls.sql. Referencias compuestas con la
// organización.
//  - membership_plans: el plan (nombre en español e inglés, máximo de
//    personas). Se desactiva, nunca se borra.
//  - membership_plan_fees: cuota inicial y mensualidad desde una fecha. Como
//    los precios (ADR 0029), nunca se modifican ni se borran: un cambio es
//    una fila nueva con su vigencia.
//  - membership_benefits: «Incluido» (servicios del catálogo gratis, una
//    cantidad por persona y año de la membresía) o «Descuento» (porcentaje
//    sobre una categoría). Se edita con `version` y se audita con el antes y
//    el después; se desactiva, nunca se borra.
//  - membership_benefit_items: los servicios del catálogo que cuentan para un
//    beneficio incluido (el Administrador define, p. ej., el chequeo). Es
//    configuración, no finanzas: al editar el beneficio se reemplazan.
// Los valores permitidos son los de @clinic/shared (membership-plans.ts); una prueba los compara.

export const MEMBERSHIP_BENEFIT_TYPE_VALUES = ['included', 'discount'] as const;
/**
 * Cómo se cuenta la cantidad por año de un incluido (decisión del 2026-11-04):
 * «Paquete», cada servicio hasta la cantidad (el chequeo: 1 A1c y 1 TSH);
 * «Cupo compartido», la cantidad es el total entre sus servicios (3 consultas
 * de seguimiento o enfermedad).
 */
export const BENEFIT_QUOTA_MODE_VALUES = ['package', 'shared'] as const;
/** Tope de una cuota: 100 000 USD, en centavos. */
export const MEMBERSHIP_FEE_MAX_CENTS = 10_000_000;

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export const membershipPlans = appSchema.table(
  'membership_plans',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    code: text('code').notNull(),
    nameEs: text('name_es').notNull(),
    nameEn: text('name_en').notNull(),
    descriptionEs: text('description_es'),
    descriptionEn: text('description_en'),
    /** Personas que cubre el plan, titular incluido (Familiar: 4). */
    maxMembers: integer('max_members').notNull(),
    sortOrder: integer('sort_order'),
    active: boolean('active').notNull().default(true),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    unique('membership_plans_organization_id_id_key').on(t.organizationId, t.id),
    unique('membership_plans_organization_id_code_key').on(t.organizationId, t.code),
    check('membership_plans_code_format', sql`${t.code} ~ ${sql.raw(`'${CATALOG_CODE_PATTERN}'`)}`),
    check('membership_plans_name_es_length', sql`char_length(${t.nameEs}) between 1 and 120`),
    check('membership_plans_name_en_length', sql`char_length(${t.nameEn}) between 1 and 120`),
    check('membership_plans_description_es_length', sql`char_length(${t.descriptionEs}) between 1 and 500`),
    check('membership_plans_description_en_length', sql`char_length(${t.descriptionEn}) between 1 and 500`),
    check('membership_plans_max_members_range', sql`${t.maxMembers} between 1 and 1000`),
    check('membership_plans_sort_order_range', sql`${t.sortOrder} between 0 and 100000`),
    check('membership_plans_version_check', sql`${t.version} >= 1`),
  ],
);

/**
 * Cuotas del plan desde una fecha (la del día más adelantado de las sedes
 * activas, como el precio general). Rige la última fila vigente ese día
 * (con la misma fecha, la última creada). La cuota inicial incluye el primer
 * mes (decisión 2).
 */
export const membershipPlanFees = appSchema.table(
  'membership_plan_fees',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    planId: uuid('plan_id').notNull(),
    /** Centavos de USD (regla 4). */
    initialFeeCents: integer('initial_fee_cents').notNull(),
    monthlyFeeCents: integer('monthly_fee_cents').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    unique('membership_plan_fees_organization_id_id_key').on(t.organizationId, t.id),
    foreignKey({
      name: 'membership_plan_fees_plan_fk',
      columns: [t.organizationId, t.planId],
      foreignColumns: [membershipPlans.organizationId, membershipPlans.id],
    }),
    check('membership_plan_fees_initial_range', sql`${t.initialFeeCents} between 0 and ${sql.raw(String(MEMBERSHIP_FEE_MAX_CENTS))}`),
    check('membership_plan_fees_monthly_range', sql`${t.monthlyFeeCents} between 0 and ${sql.raw(String(MEMBERSHIP_FEE_MAX_CENTS))}`),
    index('membership_plan_fees_plan_idx').on(t.organizationId, t.planId, t.effectiveFrom),
  ],
);

/**
 * Beneficio de un plan. «Incluido»: nombre, cantidad por persona y año de la
 * membresía (decisión 1: desde el aniversario) y, en el plan Total, si
 * incluye sin costo los laboratorios de la misma visita (decisión 3).
 * «Descuento»: categoría y porcentaje en centésimas de punto (2 500 = 25 %).
 * Primero se usan los incluidos; después, el descuento (se aplica en la parte B).
 */
export const membershipBenefits = appSchema.table(
  'membership_benefits',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    planId: uuid('plan_id').notNull(),
    type: text('type').notNull(),
    nameEs: text('name_es'),
    nameEn: text('name_en'),
    quantityPerYear: integer('quantity_per_year'),
    includesSameVisitLabs: boolean('includes_same_visit_labs').notNull().default(false),
    /** Solo «Incluido» (T-026b parte B): «package» o «shared». */
    quotaMode: text('quota_mode'),
    category: text('category'),
    discountBp: integer('discount_bp'),
    sortOrder: integer('sort_order'),
    active: boolean('active').notNull().default(true),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    unique('membership_benefits_organization_id_id_key').on(t.organizationId, t.id),
    foreignKey({
      name: 'membership_benefits_plan_fk',
      columns: [t.organizationId, t.planId],
      foreignColumns: [membershipPlans.organizationId, membershipPlans.id],
    }),
    check('membership_benefits_type_check', sql`${t.type} in (${inList(MEMBERSHIP_BENEFIT_TYPE_VALUES)})`),
    check('membership_benefits_category_check', sql`${t.category} in (${inList(MEMBERSHIP_CATEGORY_VALUES)})`),
    check('membership_benefits_name_es_length', sql`char_length(${t.nameEs}) between 1 and 120`),
    check('membership_benefits_name_en_length', sql`char_length(${t.nameEn}) between 1 and 120`),
    check('membership_benefits_quantity_range', sql`${t.quantityPerYear} between 1 and 100000`),
    check('membership_benefits_discount_range', sql`${t.discountBp} between 0 and 10000`),
    check('membership_benefits_sort_order_range', sql`${t.sortOrder} between 0 and 100000`),
    check('membership_benefits_version_check', sql`${t.version} >= 1`),
    // Cada tipo, solo con sus campos.
    check(
      'membership_benefits_shape_check',
      sql`case when ${t.type} = 'included' then
            ${t.nameEs} is not null and ${t.nameEn} is not null and ${t.quantityPerYear} is not null
            and ${t.category} is null and ${t.discountBp} is null
          else
            ${t.category} is not null and ${t.discountBp} is not null
            and ${t.nameEs} is null and ${t.nameEn} is null and ${t.quantityPerYear} is null
            and not ${t.includesSameVisitLabs}
          end`,
    ),
    check('membership_benefits_quota_mode_check', sql`(${t.type} = 'included') = (${t.quotaMode} is not null) and ${t.quotaMode} in (${inList(BENEFIT_QUOTA_MODE_VALUES)})`),
    // Un solo descuento activo por categoría en cada plan.
    uniqueIndex('membership_benefits_active_discount_key')
      .on(t.organizationId, t.planId, t.category)
      .where(sql`${t.type} = 'discount' and ${t.active}`),
    index('membership_benefits_plan_idx').on(t.organizationId, t.planId),
  ],
);

/** Un servicio del catálogo que cuenta para un beneficio incluido (consulta, procedimiento o prueba). */
export const membershipBenefitItems = appSchema.table(
  'membership_benefit_items',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    benefitId: uuid('benefit_id').notNull(),
    consultationId: uuid('consultation_id'),
    procedureId: uuid('procedure_id'),
    labTestId: uuid('lab_test_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [
    unique('membership_benefit_items_organization_id_id_key').on(t.organizationId, t.id),
    foreignKey({
      name: 'membership_benefit_items_benefit_fk',
      columns: [t.organizationId, t.benefitId],
      foreignColumns: [membershipBenefits.organizationId, membershipBenefits.id],
    }),
    foreignKey({
      name: 'membership_benefit_items_consultation_fk',
      columns: [t.organizationId, t.consultationId],
      foreignColumns: [consultations.organizationId, consultations.id],
    }),
    foreignKey({
      name: 'membership_benefit_items_procedure_fk',
      columns: [t.organizationId, t.procedureId],
      foreignColumns: [procedures.organizationId, procedures.id],
    }),
    foreignKey({
      name: 'membership_benefit_items_lab_test_fk',
      columns: [t.organizationId, t.labTestId],
      foreignColumns: [labTests.organizationId, labTests.id],
    }),
    check('membership_benefit_items_one_item_check', sql`num_nonnulls(${t.consultationId}, ${t.procedureId}, ${t.labTestId}) = 1`),
    // Cada servicio, una sola vez por beneficio.
    uniqueIndex('membership_benefit_items_item_key').on(
      t.organizationId,
      t.benefitId,
      sql`coalesce(${t.consultationId}, ${t.procedureId}, ${t.labTestId})`,
    ),
  ],
);
