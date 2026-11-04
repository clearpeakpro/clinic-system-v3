import { z } from 'zod';
import { CATALOG_CODE_REGEX, MEMBERSHIP_CATEGORIES, type MembershipCategory } from './catalog.ts';

// Planes de membresía y sus beneficios (T-026b parte A; S-ADM-21 y 22;
// ADR 0034). Los valores permitidos son los mismos que exige la base de datos
// (packages/db, membership-plans-schema.ts); una prueba lo comprueba.
//  - El precio del plan (cuota inicial y mensualidad) es el mismo en todas las
//    sedes (decisión 9) y tiene vigencia: un cambio es un registro nuevo,
//    como los precios del catálogo (ADR 0029).
//  - «Incluido»: servicios del catálogo gratis, una cantidad por persona y
//    año de la membresía, contado desde el aniversario (decisiones 1 y 4).
//  - «Descuento»: porcentaje sobre una categoría de membresía. Primero se
//    usan los incluidos y después el descuento (se aplica en la parte B).

export const MEMBERSHIP_BENEFIT_TYPES = ['included', 'discount'] as const;
export type MembershipBenefitType = (typeof MEMBERSHIP_BENEFIT_TYPES)[number];
export const MEMBERSHIP_BENEFIT_TYPE_LABELS: Record<MembershipBenefitType, string> = { included: 'Incluido', discount: 'Descuento' };

/**
 * Cómo se cuenta la cantidad por año de un incluido (decisión del dueño del
 * 2026-11-04, ADR 0034). La elige el Administrador:
 *  - «Paquete»: cada servicio del incluido hasta la cantidad (el chequeo
 *    general, 1 al año: 1 A1c y 1 TSH);
 *  - «Cupo compartido»: la cantidad es el total entre todos sus servicios
 *    (las 3 consultas de seguimiento o enfermedad).
 */
export const BENEFIT_QUOTA_MODES = ['package', 'shared'] as const;
export type BenefitQuotaMode = (typeof BENEFIT_QUOTA_MODES)[number];
export const BENEFIT_QUOTA_MODE_LABELS: Record<BenefitQuotaMode, string> = { package: 'Paquete', shared: 'Cupo compartido' };
export const BENEFIT_QUOTA_MODE_HELP: Record<BenefitQuotaMode, string> = {
  package: 'Cada servicio, hasta la cantidad por año.',
  shared: 'La cantidad por año es el total entre todos los servicios.',
};

/** Catálogos de los que sale un servicio incluido. */
export const BENEFIT_ITEM_KINDS = ['consultations', 'procedures', 'lab-tests'] as const;
export type BenefitItemKind = (typeof BENEFIT_ITEM_KINDS)[number];

export const MEMBERSHIP_MAX_MEMBERS = 1000;
export const BENEFIT_QUANTITY_MAX = 100_000;
/** Tope de una cuota: 100 000 USD, en centavos. */
export const MEMBERSHIP_FEE_MAX_CENTS = 10_000_000;
/** Servicios de un beneficio incluido. */
export const BENEFIT_ITEMS_MAX = 50;

const SORT_ORDER_MAX = 100_000;
const name = z.string().trim().min(1).max(120);
const description = z.string().trim().min(1).max(500).nullable();
const sortOrder = z.number().int().min(0).max(SORT_ORDER_MAX).nullable();
const expectedVersion = z.number().int().positive();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const feeCents = z.number().int().min(0).max(MEMBERSHIP_FEE_MAX_CENTS);

/** Cuotas nuevas del plan, desde una fecha (hoy o después en la sede más adelantada). */
export const membershipPlanFeeSchema = z.object({ initialFeeCents: feeCents, monthlyFeeCents: feeCents, effectiveFrom: isoDate });
export type MembershipPlanFeeInput = z.infer<typeof membershipPlanFeeSchema>;

const planFields = {
  nameEs: name,
  nameEn: name,
  descriptionEs: description,
  descriptionEn: description,
  maxMembers: z.number().int().min(1).max(MEMBERSHIP_MAX_MEMBERS),
  sortOrder,
};

/** S-ADM-21 «Crear»: el código solo se escribe aquí; las cuotas son obligatorias. */
export const createMembershipPlanSchema = z.object({ code: z.string().regex(CATALOG_CODE_REGEX), ...planFields, fee: membershipPlanFeeSchema });
/** S-ADM-21 «Guardar»: sin código; las cuotas, solo si cambian (registro nuevo). */
export const updateMembershipPlanSchema = z.object({ ...planFields, fee: membershipPlanFeeSchema.optional(), expectedVersion });
export type CreateMembershipPlanInput = z.infer<typeof createMembershipPlanSchema>;
export type UpdateMembershipPlanInput = z.infer<typeof updateMembershipPlanSchema>;

export const benefitItemRefSchema = z.object({ kind: z.enum(BENEFIT_ITEM_KINDS), id: z.uuid() });
export type BenefitItemRef = z.infer<typeof benefitItemRefSchema>;

const includedFields = {
  type: z.literal('included'),
  nameEs: name,
  nameEn: name,
  quantityPerYear: z.number().int().min(1).max(BENEFIT_QUANTITY_MAX),
  quotaMode: z.enum(BENEFIT_QUOTA_MODES),
  /** Plan Total: sin costo los laboratorios de la misma visita (decisión 3). */
  includesSameVisitLabs: z.boolean(),
  items: z
    .array(benefitItemRefSchema)
    .min(1)
    .max(BENEFIT_ITEMS_MAX)
    .refine((items) => new Set(items.map((i) => `${i.kind}:${i.id}`)).size === items.length, { message: 'duplicated_item' }),
  sortOrder,
};
const discountFields = {
  type: z.literal('discount'),
  category: z.enum(MEMBERSHIP_CATEGORIES),
  /** Centésimas de punto: 2 500 = 25 %. */
  discountBp: z.number().int().min(0).max(10_000),
  sortOrder,
};

/** S-ADM-22 «Crear». */
export const createMembershipBenefitSchema = z.discriminatedUnion('type', [z.object(includedFields), z.object(discountFields)]);
/** S-ADM-22 «Guardar»: el tipo no cambia (el servidor lo comprueba). */
export const updateMembershipBenefitSchema = z.discriminatedUnion('type', [
  z.object({ ...includedFields, expectedVersion }),
  z.object({ ...discountFields, expectedVersion }),
]);
export type CreateMembershipBenefitInput = z.infer<typeof createMembershipBenefitSchema>;
export type UpdateMembershipBenefitInput = z.infer<typeof updateMembershipBenefitSchema>;

export interface MembershipPlanFee {
  initialFeeCents: number;
  monthlyFeeCents: number;
  /** `AAAA-MM-DD`. */
  effectiveFrom: string;
}

export interface MembershipPlan {
  id: string;
  code: string;
  nameEs: string;
  nameEn: string;
  descriptionEs: string | null;
  descriptionEn: string | null;
  maxMembers: number;
  sortOrder: number | null;
  active: boolean;
  version: number;
  /** Las cuotas que rigen hoy y las próximas programadas. */
  fee: { current: MembershipPlanFee | null; next: MembershipPlanFee | null };
  /** Beneficios activos (la columna «Beneficios»). */
  activeBenefits: number;
}

export interface MembershipPlanList {
  /** El día más adelantado entre las sedes activas: la vigencia mínima de unas cuotas nuevas. */
  generalToday: string;
  plans: MembershipPlan[];
}

/** Un servicio incluido, con el código y el nombre del catálogo. */
export interface BenefitItem {
  kind: BenefitItemKind;
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface MembershipBenefit {
  id: string;
  type: MembershipBenefitType;
  nameEs: string | null;
  nameEn: string | null;
  quantityPerYear: number | null;
  /** Solo «Incluido». */
  quotaMode: BenefitQuotaMode | null;
  includesSameVisitLabs: boolean;
  category: MembershipCategory | null;
  discountBp: number | null;
  sortOrder: number | null;
  active: boolean;
  version: number;
  items: BenefitItem[];
}

export interface MembershipPlanDetail {
  plan: MembershipPlan;
  benefits: MembershipBenefit[];
}

/** «25.00 %» a partir de centésimas de punto (2 500). */
export function formatPercentBp(bp: number): string {
  return `${String(Math.trunc(bp / 100))}.${String(bp % 100).padStart(2, '0')} %`;
}

/**
 * Un porcentaje escrito («25», «12.5», «15.00») en centésimas de punto, sin
 * números de coma flotante. Nulo si no es un número de 0 a 100 con hasta dos
 * decimales.
 */
export function parsePercentBp(text: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const bp = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return bp <= 10_000 ? bp : null;
}
