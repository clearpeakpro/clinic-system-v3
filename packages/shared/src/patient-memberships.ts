import { z } from 'zod';
import { addDays } from './appointments.ts';
import type { PaymentView } from './billing.ts';
import type { MembershipCategory } from './catalog.ts';
import type { BenefitQuotaMode } from './membership-plans.ts';

// Membresía del paciente (T-026b parte B; S-PAC-22 y S-PAC-23; ADR 0034).
// Reglas del dueño (2026-11-03 y 2026-11-04), sin reinterpretar:
//  - La cuota inicial incluye el primer mes. La primera mensualidad vence el
//    primer día de cobro que cae al cumplirse un mes desde el inicio, o
//    después; los días 29 a 31 pasan al último día de los meses cortos.
//  - Cada membresía guarda la cuota inicial y la mensualidad vigentes el día
//    de su inscripción («Monto fijo»): un cambio de cuota del plan aplica solo
//    a las inscripciones nuevas.
//  - «Pendiente de pago», sin beneficios, hasta pagar la cuota inicial (T-028
//    la activa); si no se paga, se cancela sola a los 30 días de la inscripción.
//  - Si una mensualidad vence el día D sin pagarse, se suspende a las 12:00
//    a. m. de D+1 (hora de la sede) y se cancela a las 12:00 a. m. de D+30;
//    al cancelarse sola se anulan las cuotas pendientes, sin dejar deuda.
//  - Aviso de cancelación: con 15 días o más antes del próximo cobro, los
//    beneficios valen hasta el final del mes pagado; con menos, esa
//    mensualidad se debe igual y los beneficios duran un mes más.
//  - Año de beneficios: desde la fecha de inicio (aniversario), también para
//    los afiliados. Beneficios por persona.
// Las fechas son días AAAA-MM-DD de la sede de inscripción; el estado se
// calcula con el reloj inyectable (el worker lo deja guardado cada hora).

export const PATIENT_MEMBERSHIP_STATUSES = ['pending_payment', 'active', 'suspended', 'cancelled'] as const;
export type PatientMembershipStatus = (typeof PATIENT_MEMBERSHIP_STATUSES)[number];
export const PATIENT_MEMBERSHIP_STATUS_LABELS: Record<PatientMembershipStatus, string> = {
  pending_payment: 'Pendiente de pago',
  active: 'Activa',
  suspended: 'Suspendida',
  cancelled: 'Cancelada',
};

/** Por qué se canceló: aviso del paciente, mensualidad sin pagar a los 30 días o cuota inicial sin pagar a los 30 días. */
export const MEMBERSHIP_CANCELLATIONS = ['notice', 'non_payment', 'initial_unpaid'] as const;
export type MembershipCancellation = (typeof MEMBERSHIP_CANCELLATIONS)[number];
export const MEMBERSHIP_CANCELLATION_LABELS: Record<MembershipCancellation, string> = {
  notice: 'Aviso del paciente',
  non_payment: 'Mensualidad sin pagar 30 días',
  initial_unpaid: 'Cuota inicial sin pagar 30 días',
};

export const MEMBERSHIP_MEMBER_ROLES = ['holder', 'affiliate'] as const;
export type MembershipMemberRole = (typeof MEMBERSHIP_MEMBER_ROLES)[number];
export const MEMBERSHIP_MEMBER_ROLE_LABELS: Record<MembershipMemberRole, string> = { holder: 'Titular', affiliate: 'Afiliado' };

export const MEMBERSHIP_FEE_KINDS = ['initial', 'monthly'] as const;
export type MembershipFeeKind = (typeof MEMBERSHIP_FEE_KINDS)[number];
export const MEMBERSHIP_FEE_KIND_LABELS: Record<MembershipFeeKind, string> = { initial: 'Cuota inicial', monthly: 'Mensualidad' };

export const MEMBERSHIP_FEE_STATUSES = ['pending', 'paid', 'voided'] as const;
export type MembershipFeeStatus = (typeof MEMBERSHIP_FEE_STATUSES)[number];
export const MEMBERSHIP_FEE_STATUS_LABELS: Record<MembershipFeeStatus, string> = { pending: 'Pendiente', paid: 'Pagada', voided: 'Anulada' };

/** Entradas del historial de la membresía. */
export const MEMBERSHIP_EVENT_ACTIONS = [
  'enrolled',
  'activated',
  'suspended',
  'reactivated',
  'cancel_notice',
  'cancelled',
  'member_added',
  'member_removed',
] as const;
export type MembershipEventAction = (typeof MEMBERSHIP_EVENT_ACTIONS)[number];
export const MEMBERSHIP_EVENT_LABELS: Record<MembershipEventAction, string> = {
  enrolled: 'Inscripción',
  activated: 'Activada',
  suspended: 'Suspendida',
  reactivated: 'Reactivada',
  cancel_notice: 'Aviso de cancelación',
  cancelled: 'Cancelada',
  member_added: 'Afiliado añadido',
  member_removed: 'Afiliado quitado',
};

/** Días tras el vencimiento (o la inscripción sin pagar) en que la membresía se cancela sola. */
export const MEMBERSHIP_AUTO_CANCEL_DAYS = 30;
/** Aviso mínimo para no deber la próxima mensualidad. */
export const MEMBERSHIP_NOTICE_DAYS = 15;
/**
 * Una mensualidad se crea cuando faltan menos de 15 días para su vencimiento
 * (14 días antes): desde ese momento un aviso ya no la evita (decisión 7).
 */
export const MEMBERSHIP_FEE_LEAD_DAYS = MEMBERSHIP_NOTICE_DAYS - 1;
/** La fecha de inicio puede ser hoy o hasta 30 días después. */
export const MEMBERSHIP_START_MAX_DAYS_AHEAD = 30;

// --- Fechas (días AAAA-MM-DD, sin horas) ------------------------------------

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(date: string): [number, number, number] {
  const match = ISO.exec(date);
  if (!match) throw new Error('Fecha no válida');
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function iso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Días de `from` a `to` (positivo si `to` es posterior). */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** `n` meses después con el mismo día, o el último del mes si es más corto (31 ene + 1 → 28 feb). */
export function addMonthsClamped(date: string, n: number): string {
  const [y, m, d] = parts(date);
  const index = y * 12 + (m - 1) + n;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return iso(year, month, Math.min(d, daysInMonth(year, month)));
}

/** El día de cobro en un mes: 29, 30 y 31 pasan al último día de los meses más cortos. */
function billingDayIn(year: number, month: number, billingDay: number): string {
  return iso(year, month, Math.min(billingDay, daysInMonth(year, month)));
}

/**
 * Primera mensualidad (decisión 5): el primer día de cobro que cae al cumplirse
 * un mes desde el inicio, o después. Inicio 3 nov y día 15 → 15 dic.
 */
export function firstDueDate(startDate: string, billingDay: number): string {
  const anchor = addMonthsClamped(startDate, 1);
  const [y, m] = parts(anchor);
  const candidate = billingDayIn(y, m, billingDay);
  if (candidate >= anchor) return candidate;
  const [ny, nm] = parts(addMonthsClamped(iso(y, m, 1), 1));
  return billingDayIn(ny, nm, billingDay);
}

/** La mensualidad siguiente: el mes siguiente, en el día de cobro (con el mismo ajuste de fin de mes). */
export function nextDueDate(dueDate: string, billingDay: number): string {
  const [y, m] = parts(dueDate);
  const [ny, nm] = parts(addMonthsClamped(iso(y, m, 1), 1));
  return billingDayIn(ny, nm, billingDay);
}

/** El primer vencimiento en `date` o después. */
export function dueDateOnOrAfter(startDate: string, billingDay: number, date: string): string {
  let due = firstDueDate(startDate, billingDay);
  while (due < date) due = nextDueDate(due, billingDay);
  return due;
}

/**
 * Año de beneficios que contiene `date` (decisión 1): desde la fecha de inicio,
 * de aniversario en aniversario. Un inicio el 29 feb cumple el 28 feb en los
 * años no bisiestos.
 */
export function benefitYear(startDate: string, date: string): { start: string; end: string } {
  const [sy] = parts(startDate);
  const [dy] = parts(date);
  let k = Math.max(0, dy - sy - 1);
  while (addMonthsClamped(startDate, 12 * (k + 1)) <= date) k += 1;
  const start = addMonthsClamped(startDate, 12 * k);
  return { start, end: addDays(addMonthsClamped(startDate, 12 * (k + 1)), -1) };
}

// --- Estado ------------------------------------------------------------------

export interface MembershipFeeState {
  kind: MembershipFeeKind;
  dueDate: string;
  status: MembershipFeeStatus;
}

export interface MembershipStandingInput {
  /** El estado guardado (lo deja el worker o T-028). */
  status: PatientMembershipStatus;
  enrolledOn: string;
  /** Fin de los beneficios por un aviso de cancelación (último día con beneficios). */
  benefitsEndDate: string | null;
  fees: readonly MembershipFeeState[];
}

export type MembershipStanding =
  | { status: 'pending_payment' }
  | { status: 'active' }
  | { status: 'suspended'; since: string; overdueDueDate: string }
  | { status: 'cancelled'; on: string | null; cancellation: MembershipCancellation | null };

/**
 * El estado de la membresía hoy, calculado con las reglas del dueño (no
 * depende de cuándo corrió el worker): la suspensión empieza a las 12:00 a. m.
 * de D+1 y la cancelación a las 12:00 a. m. de D+30 aunque el trabajo
 * todavía no lo haya guardado.
 */
export function membershipStanding(m: MembershipStandingInput, today: string): MembershipStanding {
  if (m.status === 'cancelled') return { status: 'cancelled', on: null, cancellation: null };
  const initialPending = m.fees.some((f) => f.kind === 'initial' && f.status === 'pending');
  const overdue = m.fees
    .filter((f) => f.kind === 'monthly' && f.status === 'pending' && f.dueDate < today)
    .map((f) => f.dueDate)
    .sort();
  const oldest = overdue[0];
  const candidates: { on: string; cancellation: MembershipCancellation }[] = [];
  if (initialPending) candidates.push({ on: addDays(m.enrolledOn, MEMBERSHIP_AUTO_CANCEL_DAYS), cancellation: 'initial_unpaid' });
  if (m.benefitsEndDate) candidates.push({ on: addDays(m.benefitsEndDate, 1), cancellation: 'notice' });
  if (oldest) candidates.push({ on: addDays(oldest, MEMBERSHIP_AUTO_CANCEL_DAYS), cancellation: 'non_payment' });
  const due = candidates.filter((c) => c.on <= today).sort((a, b) => a.on.localeCompare(b.on))[0];
  if (due) return { status: 'cancelled', on: due.on, cancellation: due.cancellation };
  if (initialPending) return { status: 'pending_payment' };
  if (oldest) return { status: 'suspended', since: addDays(oldest, 1), overdueDueDate: oldest };
  return { status: 'active' };
}

/**
 * ¿Anular el pago de la cuota `index` cancelaría la membresía? (T-028,
 * decisión del 2026-11-05.) La cuota vuelve a pendiente y se recalcula el
 * estado: por ejemplo, la cuota inicial pasados los 30 días de la
 * inscripción. Una membresía ya cancelada no cambia (la cuota queda anulada,
 * sin deuda). El diálogo de anular lo avisa antes.
 */
export function voidCancelsMembership(m: MembershipStandingInput, index: number, today: string): boolean {
  if (m.status === 'cancelled' || m.fees[index]?.status !== 'paid') return false;
  const fees = m.fees.map((f, i) => (i === index ? { ...f, status: 'pending' as const } : f));
  return membershipStanding({ ...m, fees }, today).status === 'cancelled';
}

/** ¿Da beneficios hoy? Activa y ya empezada. */
export function hasBenefitsOn(standing: MembershipStanding, startDate: string, today: string): boolean {
  return standing.status === 'active' && today >= startDate;
}

/** Periodo que cubre la cuota inicial: del inicio al día antes de la primera mensualidad. */
export function initialFeePeriod(startDate: string, billingDay: number): { periodStart: string; periodEnd: string; dueDate: string } {
  return { periodStart: startDate, periodEnd: addDays(firstDueDate(startDate, billingDay), -1), dueDate: startDate };
}

export interface MonthlyFeeToCreate {
  dueDate: string;
  periodStart: string;
  periodEnd: string;
}

/**
 * Mensualidades que ya deben existir hoy: cada una se crea 14 días antes de
 * vencer, y ninguna después del fin de beneficios de un aviso. No crea las
 * que ya existen (por fecha de vencimiento).
 */
export function monthlyFeesDue(
  m: { startDate: string; billingDay: number; benefitsEndDate: string | null; existingDueDates: readonly string[] },
  today: string,
): MonthlyFeeToCreate[] {
  const existing = new Set(m.existingDueDates);
  const result: MonthlyFeeToCreate[] = [];
  for (let due = firstDueDate(m.startDate, m.billingDay); addDays(due, -MEMBERSHIP_FEE_LEAD_DAYS) <= today; due = nextDueDate(due, m.billingDay)) {
    if (m.benefitsEndDate && due > m.benefitsEndDate) break;
    if (!existing.has(due)) result.push({ dueDate: due, periodStart: due, periodEnd: addDays(nextDueDate(due, m.billingDay), -1) });
  }
  return result;
}

/**
 * «Registrar aviso de cancelación» (decisión 7 del 2026-11-03 y 7 del
 * 2026-11-04): con 15 días o más antes del próximo cobro, los beneficios
 * valen hasta el día antes; con menos, esa mensualidad se debe igual y los
 * beneficios duran hasta el día antes del cobro siguiente.
 */
export function cancellationNotice(startDate: string, billingDay: number, noticeOn: string): { benefitsEndDate: string; owedDueDate: string | null } {
  const next = dueDateOnOrAfter(startDate, billingDay, noticeOn);
  if (daysBetween(noticeOn, next) >= MEMBERSHIP_NOTICE_DAYS) return { benefitsEndDate: addDays(next, -1), owedDueDate: null };
  return { benefitsEndDate: addDays(nextDueDate(next, billingDay), -1), owedDueDate: next };
}

// --- Beneficios ----------------------------------------------------------------

export type BenefitLineKind = 'consultation' | 'procedure' | 'lab_test';

export interface BenefitRules {
  included: readonly {
    id: string;
    sortOrder: number | null;
    quantityPerYear: number;
    /** «Paquete»: cada servicio hasta la cantidad; «Cupo compartido»: la cantidad entre todos. */
    quotaMode: BenefitQuotaMode;
    includesSameVisitLabs: boolean;
    items: readonly { kind: BenefitLineKind; id: string }[];
  }[];
  discounts: readonly { id: string; category: MembershipCategory; discountBp: number }[];
}

/** Un cargo activo de la visita, en el orden en que se creó. */
export interface BenefitLine {
  chargeId: string;
  kind: BenefitLineKind;
  itemId: string;
  /** Categoría del servicio; una consulta es siempre «Consulta» (ADR 0041). */
  category: MembershipCategory | null;
  unitPriceCents: number;
  quantity: number;
  /** Día de la sede del cargo (AAAA-MM-DD). */
  date: string;
}

/** El beneficio que se guarda en el cargo. */
export interface LineBenefit {
  chargeId: string;
  /** El incluido usado y cuántas unidades salieron sin costo por él (cuentan para su cupo). */
  includedBenefitId: string | null;
  includedQuantity: number;
  /** Plan Total: laboratorio sin costo por una de las 3 consultas de la misma visita (después del incluido; no gasta cupo). */
  sameVisitLabsBenefitId: string | null;
  /** El descuento de la categoría sobre las unidades restantes. */
  discountBenefitId: string | null;
  discountBp: number | null;
  /** Lo que la membresía resta del cargo, en centavos: unidades incluidas + laboratorio de la misma visita + descuento. */
  discountCents: number;
  /** Año de beneficios del cargo (para contar el cupo). */
  benefitYearStart: string;
}

/** `cents × bp / 10000`, redondeado al centavo más cercano (la mitad hacia arriba), sin coma flotante. */
export function percentOfCents(cents: number, bp: number): number {
  const value = BigInt(cents) * BigInt(bp);
  return Number((value + 5000n) / 10000n);
}

/**
 * Beneficios de los cargos activos de una visita (T-026b), calculados en el
 * servidor, en centavos, sobre el precio de cada cargo:
 *  1. los incluidos, por persona y año de beneficios, contando lo ya usado en
 *     otras visitas (`usedElsewhere`) y en los cargos anteriores de esta, en el
 *     orden en que se crearon; se reparte por unidad (de una cantidad 2 con
 *     1 incluido restante, 1 sale sin costo y la otra va al descuento). En un
 *     «Paquete» el cupo es de cada servicio; en un «Cupo compartido», de
 *     todos sus servicios juntos;
 *  2. en el plan Total, lo que quede de los laboratorios de una visita donde
 *     se usó una de las 3 consultas de seguimiento sale sin costo (el
 *     chequeo o el PSA gastan antes su cupo, decisión del 2026-11-04);
 *  3. el descuento de la categoría sobre las unidades restantes.
 * `usedElsewhere(beneficio, año, servicio)`: lo usado en otras visitas; el
 * servicio (`kind:id`) solo en un «Paquete», nulo en un «Cupo compartido».
 */
export function applyMembershipBenefits(input: {
  rules: BenefitRules;
  startDate: string;
  lines: readonly BenefitLine[];
  usedElsewhere: (benefitId: string, benefitYearStart: string, item: string | null) => number;
}): LineBenefit[] {
  const used = new Map<string, number>();
  const usedOf = (benefitId: string, year: string, item: string | null) => {
    const key = `${benefitId}|${year}|${item ?? ''}`;
    if (!used.has(key)) used.set(key, input.usedElsewhere(benefitId, year, item));
    return { key, value: used.get(key) ?? 0 };
  };
  const included = [...input.rules.included].sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id));
  const results = new Map<string, LineBenefit>();
  let sameVisitLabsBy: string | null = null;

  const apply = (line: BenefitLine, sameVisitLabs: string | null): LineBenefit => {
    const year = benefitYear(input.startDate, line.date).start;
    let remaining = line.quantity;
    let discountCents = 0;
    const result: LineBenefit = {
      chargeId: line.chargeId,
      includedBenefitId: null,
      includedQuantity: 0,
      sameVisitLabsBenefitId: null,
      discountBenefitId: null,
      discountBp: null,
      discountCents: 0,
      benefitYearStart: year,
    };
    for (const benefit of included) {
      if (!benefit.items.some((i) => i.kind === line.kind && i.id === line.itemId)) continue;
      const { key, value } = usedOf(benefit.id, year, benefit.quotaMode === 'package' ? `${line.kind}:${line.itemId}` : null);
      const left = benefit.quantityPerYear - value;
      if (left <= 0) continue;
      const take = Math.min(left, remaining);
      used.set(key, value + take);
      result.includedBenefitId = benefit.id;
      result.includedQuantity = take;
      remaining -= take;
      discountCents += take * line.unitPriceCents;
      break;
    }
    if (sameVisitLabs && line.kind === 'lab_test' && remaining > 0) {
      result.sameVisitLabsBenefitId = sameVisitLabs;
      result.discountCents = discountCents + remaining * line.unitPriceCents;
      return result;
    }
    const category = line.kind === 'consultation' ? 'consultation' : line.category;
    const discount = category ? input.rules.discounts.find((d) => d.category === category) : undefined;
    if (discount && remaining > 0 && discount.discountBp > 0) {
      result.discountBenefitId = discount.id;
      result.discountBp = discount.discountBp;
      discountCents += percentOfCents(line.unitPriceCents * remaining, discount.discountBp);
    }
    result.discountCents = discountCents;
    return result;
  };

  // Primero las consultas (deciden si los laboratorios de la visita salen sin costo)...
  for (const line of input.lines.filter((l) => l.kind === 'consultation')) {
    const result = apply(line, null);
    const benefit = included.find((b) => b.id === result.includedBenefitId);
    if (benefit?.includesSameVisitLabs && result.includedQuantity > 0) sameVisitLabsBy ??= benefit.id;
    results.set(line.chargeId, result);
  }
  // ...y después el resto, en el orden en que se crearon.
  for (const line of input.lines.filter((l) => l.kind !== 'consultation')) results.set(line.chargeId, apply(line, sameVisitLabsBy));
  return input.lines.map((l) => results.get(l.chargeId) as LineBenefit);
}

// --- Esquemas y tipos de la API ------------------------------------------------

const isoDate = z.string().regex(ISO);
const expectedVersion = z.number().int().positive();

/** S-PAC-23 «Inscribir en un plan». «Identidad verificada» es obligatoria; nunca se guarda un número de ID. */
export const enrollMembershipSchema = z.object({
  planId: z.uuid(),
  startDate: isoDate,
  billingDay: z.number().int().min(1).max(31),
  affiliatePatientIds: z
    .array(z.uuid())
    .max(999)
    .refine((ids) => new Set(ids).size === ids.length, 'duplicated'),
  identityVerified: z.literal(true),
});
export type EnrollMembershipInput = z.infer<typeof enrollMembershipSchema>;

export const addMembershipMemberSchema = z.object({ patientId: z.uuid(), expectedVersion });
export type AddMembershipMemberInput = z.infer<typeof addMembershipMemberSchema>;
export const membershipVersionSchema = z.object({ expectedVersion });
export type MembershipVersionInput = z.infer<typeof membershipVersionSchema>;

/** Un plan que se puede elegir al inscribir: activo y con cuotas vigentes hoy. */
export interface EnrollablePlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  maxMembers: number;
  initialFeeCents: number;
  monthlyFeeCents: number;
}

export interface EnrollmentOptions {
  plans: EnrollablePlan[];
  /** Hoy en la sede activa: la fecha de inicio va de hoy a 30 días después. */
  today: string;
  maxStartDate: string;
}

export interface MembershipMemberView {
  patientId: string;
  code: string;
  firstName: string;
  lastName: string;
  role: MembershipMemberRole;
  addedAt: string;
}

export interface MembershipFeeView {
  id: string;
  kind: MembershipFeeKind;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  amountCents: number;
  status: MembershipFeeStatus;
  version: number;
  /** El pago vigente de la cuota pagada (T-028); nulo si no está pagada. */
  payment: PaymentView | null;
  /** Anular ese pago cancelaría la membresía (decisión del 2026-11-05): el diálogo lo avisa antes. */
  voidCancelsMembership: boolean;
}

export interface MembershipHistoryEntry {
  id: string;
  action: MembershipEventAction;
  fromStatus: PatientMembershipStatus | null;
  toStatus: PatientMembershipStatus;
  occurredAt: string;
  /** «Usted», el nombre de la persona o «Sistema». */
  actor: { kind: 'me' | 'user' | 'system'; name: string | null };
  /** Afiliado añadido o quitado: su código. */
  patientCode: string | null;
}

/** S-PAC-22: la membresía del paciente, con su estado calculado hoy. */
export interface PatientMembershipView {
  id: string;
  code: string;
  status: PatientMembershipStatus;
  /** Suspendida: desde qué día y qué mensualidad lo causó. */
  suspendedSince: string | null;
  overdueDueDate: string | null;
  plan: { id: string; code: string; name: string; maxMembers: number };
  location: { code: string; name: string };
  enrolledOn: string;
  startDate: string;
  billingDay: number;
  /** Cuotas con las que se inscribió («Monto fijo»). */
  initialFeeCents: number;
  monthlyFeeCents: number;
  cancelNoticeOn: string | null;
  benefitsEndDate: string | null;
  cancelledOn: string | null;
  cancellation: MembershipCancellation | null;
  identityVerified: { by: string | null; at: string };
  members: MembershipMemberView[];
  fees: MembershipFeeView[];
  history: MembershipHistoryEntry[];
  /** ¿Da beneficios hoy a este paciente? */
  hasBenefitsToday: boolean;
  benefitYear: { start: string; end: string };
  version: number;
  abilities: {
    addMember: boolean;
    removeMember: boolean;
    cancel: boolean;
    /** Cobrar sus cuotas pendientes (Recepción, checkout.access). */
    payFee: boolean;
    /** Anular el pago de una cuota (billing.void con un rol clínico, ADR 0033). */
    voidFeePayment: boolean;
  };
}

export interface PatientMembershipCard {
  /** La membresía en curso del paciente (no cancelada), o la última cancelada. */
  membership: PatientMembershipView | null;
  canEnroll: boolean;
  today: string;
}

/** «Membresía activa: {plan} (desde {fecha})» de la llegada (S-REC-24) y del diálogo Cobertura (S-CLI-12). */
export interface CoverageMembership {
  id: string;
  code: string;
  planName: string;
  startDate: string;
}

export interface MembershipSaved {
  id: string;
  status: PatientMembershipStatus;
  version: number;
}

/** Respuesta del aviso de cancelación. */
export interface MembershipCancelResult extends MembershipSaved {
  benefitsEndDate: string | null;
  owedDueDate: string | null;
}

/** Días de cobro del mes que se pueden elegir. */
export const BILLING_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
