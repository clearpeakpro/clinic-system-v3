import { z } from 'zod';
import type { CoverageType, InsuranceTerm } from './encounters.ts';
import { percentOfCents } from './patient-memberships.ts';
import { expectedVersionSchema } from './schemas.ts';
import type { VisitRoute, VisitStatus } from './visit.ts';

// Caja: estado de cuenta de la visita (T-027; S-CAJ-01 a 08, S-CAJ-16,
// S-CLI-23). Todo lo calcula el servidor, en centavos enteros (CLAUDE.md,
// regla 4). La web solo da formato: nunca suma, resta ni multiplica importes.
//
// Reglas del estado de cuenta:
//  - Subtotal: la suma de los importes de los cargos activos (precio × cantidad).
//  - Descuento total: solo los beneficios de membresía, ya calculados en cada
//    cargo (ADR 0034). No hay descuentos manuales (ADR 0041).
//  - A cargo del seguro (ADR 0035), sobre Subtotal − Descuento total (con
//    seguro no hay membresía, así que es el subtotal):
//      · copago: el paciente paga el copago una vez por visita y como máximo
//        el total; el seguro, el resto;
//      · coaseguro: el paciente paga el porcentaje del total, redondeado al
//        centavo más cercano con la mitad hacia arriba (percentOfCents); el
//        seguro cubre el resto exacto, así que las dos partes siempre suman
//        el total (decisión del dueño del 2026-11-04);
//      · deducible: el paciente paga el monto completo.
//    No cuenta como descuento.
//  - Total a pagar = Subtotal − Descuento total − A cargo del seguro.
//  - Pagado: la suma de los pagos de la visita y de sus anulaciones (filas
//    inversas, en negativo; T-028).
//  - Saldo = Total a pagar − Pagado. Negativo: «Crédito a favor» (no hay
//    reembolsos en V1); el servidor manda también su valor en positivo.
//  - Estado: «Pagado» si el saldo es $0.00 o menos (también con un total a
//    pagar de $0.00, decisión del 2026-11-04); «Pago parcial» con algo
//    pagado y saldo; «Abierto» sin pagos y con saldo.
//  - Visita «Cancelada» (decisión del dueño del 2026-11-05, ADR 0042): el
//    estado de cuenta queda «Anulado», con Total a pagar $0.00 y lo pagado
//    como «Crédito a favor». «Se retiró» se sigue debiendo.

/** Origen del cargo: «Orden» (T-025) o «Caja» (S-CAJ-08). */
export const CHARGE_SOURCES = ['order', 'cashier'] as const;
export type ChargeSource = (typeof CHARGE_SOURCES)[number];
export const CHARGE_SOURCE_LABELS: Record<ChargeSource, string> = { order: 'Orden', cashier: 'Caja' };

/** Servicios del catálogo que se cobran: consulta, procedimiento (o inyección) y prueba. */
export const BILLING_ITEM_KINDS = ['consultation', 'procedure', 'lab_test'] as const;
export type BillingItemKind = (typeof BILLING_ITEM_KINDS)[number];

/** Grupos del diálogo «Agregar cargo» (S-CAJ-08). */
export const CHARGE_ITEM_GROUPS = ['consultation', 'procedure', 'injection', 'lab_test'] as const;
export type ChargeItemGroup = (typeof CHARGE_ITEM_GROUPS)[number];
export const CHARGE_ITEM_GROUP_LABELS: Record<ChargeItemGroup, string> = {
  consultation: 'Consultas',
  procedure: 'Procedimientos',
  injection: 'Inyecciones',
  lab_test: 'Pruebas',
};

export const STATEMENT_STATUSES = ['open', 'partial', 'paid', 'voided'] as const;
export type StatementStatus = (typeof STATEMENT_STATUSES)[number];
export const STATEMENT_STATUS_LABELS: Record<StatementStatus, string> = { open: 'Abierto', partial: 'Pago parcial', paid: 'Pagado', voided: 'Anulado' };

/** La regla que explica lo que debe el paciente (S-CAJ-07, fila de regla). */
export const STATEMENT_RULES = ['self_pay', 'membership_applied', 'membership_none', 'insurance_copay', 'insurance_coinsurance', 'insurance_deductible'] as const;
export type StatementRule = (typeof STATEMENT_RULES)[number];
export const STATEMENT_RULE_TEXT: Record<StatementRule, string> = {
  self_pay: 'Pago directo: el paciente debe el monto completo.',
  membership_applied: 'Los beneficios de la membresía descontaron una o más líneas.',
  membership_none: 'Membresía sin beneficio aplicado: el paciente debe el monto completo.',
  insurance_copay: 'Seguro: el paciente debe el copago, una vez por visita y como máximo el total.',
  insurance_coinsurance: 'Seguro: el paciente debe el coaseguro.',
  insurance_deductible: 'Seguro con deducible: el paciente debe el monto completo.',
};

/** La cobertura de la visita que interviene en el reparto (ADR 0035). */
export interface StatementCoverage {
  type: CoverageType;
  term: InsuranceTerm | null;
  /** Copago o deducible, en centavos. */
  amountCents: number | null;
  /** Coaseguro, en centésimas de punto (20 % → 2000). */
  coinsuranceBp: number | null;
}

export interface StatementTotals {
  subtotalCents: number;
  /** «Descuento total»: solo los beneficios de membresía. */
  discountCents: number;
  /** «A cargo del seguro». No es un descuento. */
  insuranceCents: number;
  /** «Total a pagar»: lo que debe el paciente. */
  totalDueCents: number;
  paidCents: number;
  /** «Saldo». Negativo: crédito a favor. */
  balanceCents: number;
  /** «Crédito a favor»: el saldo negativo, en positivo (0 sin crédito). */
  creditCents: number;
  status: StatementStatus;
  rule: StatementRule;
}

/** Cada cargo activo, como entra en el cálculo: su importe y lo que resta la membresía. */
export interface StatementInputLine {
  amountCents: number;
  membershipDiscountCents: number;
}

/** Lo que paga el paciente de `baseCents` según su cobertura (ADR 0035). */
export function patientShareCents(baseCents: number, coverage: StatementCoverage | null): number {
  if (coverage?.type !== 'insurance') return baseCents;
  switch (coverage.term) {
    case 'copay':
      return Math.min(coverage.amountCents ?? 0, baseCents);
    case 'coinsurance':
      return percentOfCents(baseCents, coverage.coinsuranceBp ?? 0);
    default:
      return baseCents;
  }
}

/** El estado de cuenta: totales, estado y regla. Pura: sin hora ni base de datos. */
export function computeStatement(input: { lines: readonly StatementInputLine[]; coverage: StatementCoverage | null; paidCents: number; voided?: boolean }): StatementTotals {
  let subtotalCents = 0;
  let discountCents = 0;
  for (const line of input.lines) {
    subtotalCents += line.amountCents;
    discountCents += line.membershipDiscountCents;
  }
  const baseCents = subtotalCents - discountCents;
  const patientCents = patientShareCents(baseCents, input.coverage);
  const insuranceCents = baseCents - patientCents;
  // Anulado: no se debe nada; lo pagado queda como crédito a favor.
  const totalDueCents = input.voided === true ? 0 : patientCents;
  const balanceCents = totalDueCents - input.paidCents;
  return {
    subtotalCents,
    discountCents,
    insuranceCents,
    totalDueCents,
    paidCents: input.paidCents,
    balanceCents,
    creditCents: balanceCents < 0 ? -balanceCents : 0,
    status: input.voided === true ? 'voided' : statementStatus(totalDueCents, input.paidCents, balanceCents),
    rule: statementRule(input.coverage, discountCents),
  };
}

function statementStatus(totalDueCents: number, paidCents: number, balanceCents: number): StatementStatus {
  if (totalDueCents === 0 || balanceCents <= 0) return 'paid';
  return paidCents > 0 ? 'partial' : 'open';
}

function statementRule(coverage: StatementCoverage | null, discountCents: number): StatementRule {
  if (coverage?.type === 'membership') return discountCents > 0 ? 'membership_applied' : 'membership_none';
  if (coverage?.type === 'insurance') {
    if (coverage.term === 'copay') return 'insurance_copay';
    if (coverage.term === 'coinsurance') return 'insurance_coinsurance';
    return 'insurance_deductible';
  }
  return 'self_pay';
}

// --- Esquemas de la API ---------------------------------------------------------

/** Tope de la cantidad de un cargo (el mismo de las órdenes y de la base de datos). */
export const CHARGE_QUANTITY_MAX = 1000;

/**
 * S-CAJ-08 «Agregar cargo»: el servicio del catálogo y la cantidad. Estricto:
 * un precio, un descuento o cualquier otro campo enviado por la web se
 * rechaza (400). El precio lo pone el servidor (ADR 0029 y 0041).
 */
export const addChargeSchema = z
  .object({
    item: z.object({ kind: z.enum(BILLING_ITEM_KINDS), id: z.uuid() }).strict(),
    quantity: z.number().int().min(1).max(CHARGE_QUANTITY_MAX),
    /** La versión del estado de cuenta que se leyó (409 si cambió). */
    expectedVersion: expectedVersionSchema,
  })
  .strict();
export type AddChargeInput = z.input<typeof addChargeSchema>;

// --- Pagos (T-028; S-CAJ-11 a 13) ---------------------------------------------

/** Métodos de pago (S-CAJ-11). El sistema solo registra el pago: no hay procesador. */
export const PAYMENT_METHODS = ['cash', 'credit_card', 'debit_card', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  credit_card: 'Tarjeta de crédito',
  debit_card: 'Tarjeta de débito',
  other: 'Otro',
};

/** Tope de un pago: $1,000,000.00 (el CHECK de la tabla). */
export const PAYMENT_MAX_CENTS = 100_000_000;
export const PAYMENT_REFERENCE_MAX = 64;
/** De la referencia solo se guardan los últimos 4 caracteres (decisión del 2026-11-05). */
export const PAYMENT_REFERENCE_KEPT = 4;
export const VOID_REASON_MAX = 200;

const referenceSchema = z.string().trim().max(PAYMENT_REFERENCE_MAX).optional();

/** S-CAJ-11 «Registrar pago»: método, monto en centavos, referencia opcional y la versión del estado de cuenta. */
export const recordPaymentSchema = z
  .object({
    method: z.enum(PAYMENT_METHODS),
    amountCents: z.number().int().min(1).max(PAYMENT_MAX_CENTS),
    reference: referenceSchema,
    expectedVersion: expectedVersionSchema,
  })
  .strict();
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;

/** Cobro de una cuota de membresía: siempre completa, un pago por cuota (decisión del 2026-11-05), así que no lleva monto. */
export const payMembershipFeeSchema = z
  .object({
    method: z.enum(PAYMENT_METHODS),
    reference: referenceSchema,
    /** La versión de la cuota que se leyó. */
    expectedVersion: expectedVersionSchema,
  })
  .strict();
export type PayMembershipFeeInput = z.input<typeof payMembershipFeeSchema>;

/**
 * S-CAJ-10 y S-CAJ-13: anular un cargo de Caja o un pago, con motivo. La
 * versión es la del estado de cuenta (cargo o pago de una visita) o la de la
 * cuota (pago de una cuota de membresía).
 */
export const voidSchema = z
  .object({
    reason: z.string().trim().min(1).max(VOID_REASON_MAX),
    expectedVersion: expectedVersionSchema,
  })
  .strict();
export type VoidInput = z.input<typeof voidSchema>;

/** Los últimos 4 caracteres de la referencia (nulo si no hay). El resto nunca se guarda. */
export function referenceLast4(reference: string | undefined): string | null {
  const trimmed = reference?.trim() ?? '';
  return trimmed === '' ? null : trimmed.slice(-PAYMENT_REFERENCE_KEPT);
}

/** Un pago de la visita o de una cuota (S-CAJ-12), con su anulación si la tiene. */
export interface PaymentView {
  id: string;
  method: PaymentMethod;
  amountCents: number;
  /** «Ref. ••••1234»: solo los últimos 4 (nulo sin referencia). */
  referenceLast4: string | null;
  recordedAt: string;
  /** «Usted» o el nombre de quien lo recibió (nulo si no se conoce). */
  recordedBy: string | null;
  voided: { reason: string | null; at: string; by: string | null } | null;
}

/** Respuesta de «Registrar pago» y de cada repetición con la misma Idempotency-Key. */
export interface PaymentRecorded {
  paymentId: string;
  /** La versión del estado de cuenta (o de la cuota) después del pago. */
  version: number;
}

/** Respuesta de una anulación (cargo o pago). */
export interface VoidResult {
  id: string;
  version: number;
}

// --- Saldos del paciente (S-CAJ-17 / S-PAC-10) -----------------------------------

/** Una visita con saldo en una de las sedes de quien mira. */
export interface PatientBalanceVisit {
  encounterId: string;
  code: string;
  status: VisitStatus;
  location: { id: string; code: string; name: string };
  arrivedAt: string;
  totalDueCents: number;
  paidCents: number;
  balanceCents: number;
  statementStatus: StatementStatus;
}

/** Una cuota de membresía pendiente del titular (ADR 0034). */
export interface PatientBalanceFee {
  feeId: string;
  membershipId: string;
  membershipCode: string;
  planName: string;
  kind: 'initial' | 'monthly';
  dueDate: string;
  amountCents: number;
  version: number;
}

export interface PatientBalances {
  visits: PatientBalanceVisit[];
  fees: PatientBalanceFee[];
  /** Recepción cobra (checkout.access); el Proveedor solo mira. */
  canCollect: boolean;
}

// --- Tipos de las respuestas ------------------------------------------------------

/** Una línea del estado de cuenta (S-CAJ-07). Todos los importes, del servidor. */
export interface StatementLine {
  id: string;
  source: ChargeSource;
  kind: BillingItemKind;
  itemCode: string;
  itemName: string;
  /** Código de la orden (`NOR1-O-000045`) si el cargo es de una orden. */
  orderCode: string | null;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  /** Lo que resta la membresía (0 sin beneficio). */
  discountCents: number;
  /** Unidades sin costo por un servicio incluido del plan. */
  includedQuantity: number;
  /** «Total línea» = importe − descuento, calculado por el servidor. */
  lineTotalCents: number;
  createdAt: string;
}

/** Un cargo anulado: se conserva con su motivo (cifrado en reposo). */
export interface StatementVoidedLine {
  id: string;
  quantity: number;
  source: ChargeSource;
  itemCode: string;
  itemName: string;
  amountCents: number;
  reason: string | null;
}

/**
 * El estado de cuenta de una visita. Recepción recibe las líneas
 * (`view: 'full'`); Enfermería y el Proveedor, solo los totales
 * (`view: 'totals'`, sin líneas ni nombres de servicios).
 */
export interface BillingStatement {
  encounter: { id: string; code: string; status: VisitStatus; route: VisitRoute; version: number; hasOpenOrders: boolean };
  patient: { id: string; code: string; firstName: string; lastName: string } | null;
  coverage: { type: CoverageType; term: InsuranceTerm | null } | null;
  statementVersion: number;
  totals: StatementTotals;
  view: 'full' | 'totals';
  lines: StatementLine[] | null;
  voided: StatementVoidedLine[] | null;
  /** Visita abierta y quien mira cobra en Caja: puede agregar cargos. */
  editable: boolean;
  /** Los pagos de la visita (S-CAJ-12), con los anulados; nulo en la vista de totales. */
  payments: PaymentView[] | null;
  /** Puede registrar pagos: cobra en Caja y el estado de cuenta no está anulado (visita abierta, completada o «Se retiró»). */
  canPay: boolean;
  /** Puede anular cargos de Caja y pagos (ADR 0033: Propietario o Administrador con rol clínico en la sede). */
  canVoid: boolean;
}

/** Un servicio del catálogo para «Agregar cargo», con su precio vigente en la sede hoy (nulo: sin precio). */
export interface ChargeOption {
  kind: BillingItemKind;
  group: ChargeItemGroup;
  id: string;
  code: string;
  name: string;
  unitPriceCents: number | null;
}

export interface ChargeOptions {
  /** Día de la sede cuyo precio rige (AAAA-MM-DD). */
  date: string;
  items: ChargeOption[];
}

/** Respuesta de «Agregar cargo» (y de cada repetición con la misma Idempotency-Key). */
export interface ChargeAdded {
  chargeId: string;
  statementVersion: number;
}

/** Una tarjeta de la cola de Caja (S-CAJ-02). */
export interface CheckoutQueueRow {
  encounterId: string;
  code: string;
  status: Extract<VisitStatus, 'READY_FOR_CHECKOUT' | 'CHECKOUT'>;
  version: number;
  /** Cuándo quedó «Listo para caja» (la llegada si no consta). */
  readySince: string;
  patient: { id: string; code: string; firstName: string; lastName: string };
  appointmentType: string | null;
  provider: string | null;
  coverageType: CoverageType | null;
  balanceCents: number;
}

export interface CheckoutQueue {
  serverNow: string;
  rows: CheckoutQueueRow[];
}
