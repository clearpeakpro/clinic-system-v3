import { z } from 'zod';
import { PAYMENT_METHODS, STATEMENT_STATUSES, type PaymentMethod } from './billing.ts';
import { INSURANCE_TERMS, type InsuranceTerm } from './encounters.ts';
import { MEMBERSHIP_FEE_KINDS, type MembershipFeeKind } from './patient-memberships.ts';

// Recibos (T-029; S-CAJ-14, S-CAJ-15 y S-CAJ-24; ADR 0037).
//  - Rollo de 80 mm para la impresora de tickets: texto monoespaciado de 42
//    columnas que arma el servidor con renderReceipt(). La web solo lo
//    muestra y lo imprime con el diálogo del navegador; nunca lo construye.
//  - Instantánea inmutable: al generar el recibo se guardan sus datos (no el
//    texto), así el mismo recibo sale en español o en inglés, a elección al
//    verlo o imprimirlo, sin cambiar nada de lo guardado. Pagos o anulaciones
//    posteriores no lo cambian. Los recibos no se anulan.
//  - Código `NOR1-R-2026-000045`: por sede y por año de la sede, sin huecos.
//  - Contenido (decisiones del dueño del 2026-11-05, ADR 0037):
//      · encabezado: nombre de la clínica, código y nombre de la sede y, si
//        los tiene, su dirección y su teléfono. Sin EIN ni nota legal;
//      · el código del recibo, la fecha y hora en la zona de la sede, la
//        visita (o la cuota) y quién lo generó;
//      · el nombre completo y el código del paciente (o del titular de la
//        membresía), sin fecha de nacimiento ni teléfono;
//      · cada línea con su precio; con beneficio, debajo «Membresía −$X» o
//        «Incluido en la membresía» si sale a $0.00; en los totales
//        «Descuento de membresía» y arriba el nombre del plan;
//      · «A cargo del seguro», aparte de los descuentos, con el tipo y el
//        nombre de la aseguradora; nunca el número de miembro;
//      · total a pagar, pagado y una sola de «Saldo» o «Crédito a favor»,
//        nunca un saldo negativo;
//      · los pagos vigentes al generarlo (método, ••••últimos 4, fecha y
//        monto) y, si se vinculó, el pago del recibo;
//      · las cuotas de membresía llevan su recibo, con la misma serie.

export const RECEIPT_LANGUAGES = ['es', 'en'] as const;
export type ReceiptLanguage = (typeof RECEIPT_LANGUAGES)[number];
export const RECEIPT_LANGUAGE_LABELS: Record<ReceiptLanguage, string> = { es: 'Español', en: 'English' };

/** Ancho del rollo de 80 mm, en columnas de texto monoespaciado. */
export const RECEIPT_COLUMNS = 42;

/** Límite de impresiones por persona y minuto (S-CAJ-24). */
export const RECEIPT_PRINTS_PER_MINUTE = 30;

/** El código del recibo: `NOR1-R-2026-000045`. */
export const RECEIPT_CODE_PATTERN = /^[A-Z][A-Z0-9]{1,7}-R-\d{4}-\d{6,}$/;

// --- Instantánea ------------------------------------------------------------------

const cents = z.number().int();
const text = z.string();

const paymentSnapshot = z.object({
  id: z.string(),
  method: z.enum(PAYMENT_METHODS),
  amountCents: cents,
  referenceLast4: text.nullable(),
  recordedAt: text,
});

const lineSnapshot = z.object({
  itemCode: text,
  itemName: text,
  quantity: z.number().int(),
  unitPriceCents: cents,
  amountCents: cents,
  discountCents: cents,
  includedQuantity: z.number().int(),
  lineTotalCents: cents,
});

const coverageSnapshot = z.discriminatedUnion('type', [
  z.object({ type: z.literal('self_pay') }),
  z.object({ type: z.literal('membership'), planNameEs: text.nullable(), planNameEn: text.nullable() }),
  z.object({ type: z.literal('insurance'), term: z.enum(INSURANCE_TERMS).nullable(), coinsuranceBp: z.number().int().nullable(), insurerName: text.nullable() }),
]);

const visitTarget = z.object({
  kind: z.literal('visit'),
  encounterCode: text,
  coverage: coverageSnapshot.nullable(),
  lines: z.array(lineSnapshot),
  totals: z.object({
    subtotalCents: cents,
    discountCents: cents,
    insuranceCents: cents,
    totalDueCents: cents,
    paidCents: cents,
    balanceCents: cents,
    creditCents: cents,
    status: z.enum(STATEMENT_STATUSES),
  }),
});

const feeTarget = z.object({
  kind: z.literal('membership_fee'),
  membershipCode: text,
  planNameEs: text,
  planNameEn: text,
  feeKind: z.enum(MEMBERSHIP_FEE_KINDS),
  dueDate: text,
  periodStart: text,
  periodEnd: text,
  amountCents: cents,
});

/** Lo que se guarda (cifrado) al generar el recibo. Versión 1. */
export const receiptSnapshotSchema = z.object({
  v: z.literal(1),
  code: text,
  issuedAt: text,
  timeZone: text,
  clinic: z.object({ name: text }),
  location: z.object({ code: text, name: text, address: text.nullable(), phone: text.nullable() }),
  issuedBy: text.nullable(),
  patient: z.object({ code: text, firstName: text, lastName: text }),
  target: z.discriminatedUnion('kind', [visitTarget, feeTarget]),
  /** Los pagos vigentes (no anulados) al generarlo. */
  payments: z.array(paymentSnapshot),
  /** El pago vinculado (S-CAJ-14 «Vincular al último pago»). */
  linkedPaymentId: text.nullable(),
});
export type ReceiptSnapshot = z.infer<typeof receiptSnapshotSchema>;
export type ReceiptCoverageSnapshot = z.infer<typeof coverageSnapshot>;

// --- Esquemas de la API -------------------------------------------------------------

/** «Generar recibo» de una visita: con el pago vinculado (el último registrado) o sin él. */
export const generateVisitReceiptSchema = z.object({ paymentId: z.uuid().nullable() }).strict();
export type GenerateVisitReceiptInput = z.input<typeof generateVisitReceiptSchema>;

/** «Generar recibo» de una cuota pagada: siempre vinculado a su pago. */
export const generateFeeReceiptSchema = z.object({}).strict();

/** «Imprimir» / «Reimprimir»: en el idioma elegido. */
export const printReceiptSchema = z.object({ language: z.enum(RECEIPT_LANGUAGES) }).strict();
export type PrintReceiptInput = z.input<typeof printReceiptSchema>;

export const receiptLanguageSchema = z.enum(RECEIPT_LANGUAGES);

// --- Respuestas ----------------------------------------------------------------------

/** Una fila de la lista de recibos (S-CAJ-14), sin datos del paciente. */
export interface ReceiptListItem {
  id: string;
  code: string;
  issuedAt: string;
  /** «Usted» o el nombre de quien lo generó (nulo si no se conoce). */
  issuedBy: string | null;
  /** El pago vinculado, si lo hay. */
  linkedPayment: { method: PaymentMethod; amountCents: number } | null;
}

/** Tarjeta «Recibos» de una visita o de una cuota. */
export interface ReceiptsPanel {
  /** Del más nuevo al más antiguo. */
  receipts: ReceiptListItem[];
  /** Puede generar uno nuevo ahora (receipts.generate y el destino lo admite). */
  canGenerate: boolean;
  /** Puede ver e imprimir (receipts.print con un rol clínico en la sede). */
  canPrint: boolean;
  /** Por qué no se puede generar, aunque se tenga el permiso. */
  blocked: 'statement_voided' | 'fee_not_paid' | null;
  /** El último pago registrado y vigente, para «Vincular al último pago ($X)». */
  latestPayment: { id: string; method: PaymentMethod; amountCents: number } | null;
}

export interface ReceiptGenerated {
  id: string;
  code: string;
}

/** El recibo tal como lo arma el servidor, en un idioma. */
export interface ReceiptDocument {
  id: string;
  code: string;
  language: ReceiptLanguage;
  text: string;
}

// --- Texto del recibo -------------------------------------------------------------------

const MONTHS: Record<ReceiptLanguage, readonly string[]> = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

const METHODS: Record<ReceiptLanguage, Record<PaymentMethod, string>> = {
  es: { cash: 'Efectivo', credit_card: 'Tarjeta de crédito', debit_card: 'Tarjeta de débito', other: 'Otro' },
  en: { cash: 'Cash', credit_card: 'Credit card', debit_card: 'Debit card', other: 'Other' },
};

const FEE_KINDS: Record<ReceiptLanguage, Record<MembershipFeeKind, string>> = {
  es: { initial: 'Cuota inicial', monthly: 'Mensualidad' },
  en: { initial: 'Initial fee', monthly: 'Monthly fee' },
};

const TERMS: Record<ReceiptLanguage, Record<InsuranceTerm, string>> = {
  es: { copay: 'copago', coinsurance: 'coaseguro', deductible: 'deducible' },
  en: { copay: 'copay', coinsurance: 'coinsurance', deductible: 'deductible' },
};

const T = {
  es: {
    title: 'RECIBO',
    phone: 'Tel.',
    date: 'Fecha',
    visit: 'Visita',
    membership: 'Membresía',
    issuedBy: 'Generado por',
    patient: 'Paciente',
    holder: 'Titular',
    coverage: 'Cobertura',
    selfPay: 'Pago directo',
    insurance: 'Seguro',
    insurer: 'Aseguradora',
    plan: 'Plan',
    memberDiscount: 'Membresía',
    included: 'Incluido en la membresía',
    noCharges: 'Sin cargos',
    subtotal: 'Subtotal',
    discount: 'Descuento de membresía',
    byInsurance: 'A cargo del seguro',
    totalDue: 'Total a pagar',
    paid: 'Pagado',
    balance: 'Saldo',
    credit: 'Crédito a favor',
    payments: 'PAGOS',
    noPayments: 'Sin pagos',
    linked: 'Recibo del pago',
    period: 'Periodo',
    due: 'Vence',
    total: 'Total',
    thanksVisit: 'Gracias por su visita',
    thanksFee: 'Gracias por su pago',
  },
  en: {
    title: 'RECEIPT',
    phone: 'Tel.',
    date: 'Date',
    visit: 'Visit',
    membership: 'Membership',
    issuedBy: 'Issued by',
    patient: 'Patient',
    holder: 'Holder',
    coverage: 'Coverage',
    selfPay: 'Self-pay',
    insurance: 'Insurance',
    insurer: 'Insurer',
    plan: 'Plan',
    memberDiscount: 'Membership',
    included: 'Included in membership',
    noCharges: 'No charges',
    subtotal: 'Subtotal',
    discount: 'Membership discount',
    byInsurance: 'Covered by insurance',
    totalDue: 'Amount due',
    paid: 'Paid',
    balance: 'Balance',
    credit: 'Credit',
    payments: 'PAYMENTS',
    noPayments: 'No payments',
    linked: 'Receipt for payment',
    period: 'Period',
    due: 'Due',
    total: 'Total',
    thanksVisit: 'Thank you for your visit',
    thanksFee: 'Thank you for your payment',
  },
} as const;

/** `$1,234.50` y `-$10.00`, igual en los dos idiomas (dólares de EE. UU.). */
export function receiptMoney(amountCents: number): string {
  const abs = Math.abs(amountCents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const rest = String(abs % 100).padStart(2, '0');
  return `${amountCents < 0 ? '-' : ''}$${dollars}.${rest}`;
}

/** Fecha y hora en la zona de la sede: «5 nov 2026, 10:00 a. m.» / «Nov 5, 2026, 10:00 AM». */
export function receiptDateTime(iso: string, timeZone: string, language: ReceiptLanguage): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  const month = Number(parts.month) - 1;
  const day = Number(parts.day);
  const hour24 = Number(parts.hour) % 24;
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const time = `${String(hour)}:${parts.minute ?? '00'}`;
  if (language === 'es') return `${String(day)} ${MONTHS.es[month] ?? ''} ${parts.year ?? ''}, ${time} ${hour24 < 12 ? 'a. m.' : 'p. m.'}`;
  return `${MONTHS.en[month] ?? ''} ${String(day)}, ${parts.year ?? ''}, ${time} ${hour24 < 12 ? 'AM' : 'PM'}`;
}

/** Un día AAAA-MM-DD: «5 nov 2026» / «Nov 5, 2026». */
export function receiptDay(day: string, language: ReceiptLanguage): string {
  const [y, m, d] = day.split('-').map(Number);
  const month = MONTHS[language][(m ?? 1) - 1] ?? '';
  return language === 'es' ? `${String(d)} ${month} ${String(y)}` : `${month} ${String(d)}, ${String(y)}`;
}

/** Corta un texto en renglones de `width` columnas, por palabras (las muy largas se parten). */
export function wrapText(value: string, width = RECEIPT_COLUMNS): string[] {
  const words = value.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (let word of words) {
    while (word.length > width) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!current) current = word;
    else if (current.length + 1 + word.length <= width) current = `${current} ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

/** Texto a la izquierda y valor a la derecha; si no caben, el texto ocupa varios renglones y el valor va en el último. */
export function pairLine(left: string, right: string, width = RECEIPT_COLUMNS, indent = 0): string[] {
  const pad = ' '.repeat(indent);
  const room = width - indent - right.length - 1;
  const lines = wrapText(left, Math.max(room, 8));
  const last = lines.pop() ?? '';
  const out = lines.map((l) => pad + l);
  if (last.length <= room) out.push(pad + last + ' '.repeat(width - indent - last.length - right.length) + right);
  else out.push(pad + last, ' '.repeat(Math.max(width - right.length, 0)) + right);
  return out;
}

function center(value: string, width = RECEIPT_COLUMNS): string[] {
  return wrapText(value, width).map((l) => ' '.repeat(Math.floor((width - l.length) / 2)) + l);
}

const RULE = '-'.repeat(RECEIPT_COLUMNS);

function coverageText(coverage: ReceiptCoverageSnapshot | null, language: ReceiptLanguage): string[] {
  const t = T[language];
  if (!coverage || coverage.type === 'self_pay') return [`${t.coverage}: ${t.selfPay}`];
  if (coverage.type === 'membership') {
    const plan = language === 'es' ? coverage.planNameEs : coverage.planNameEn;
    return [`${t.coverage}: ${t.membership}`, ...(plan ? [`${t.plan}: ${plan}`] : [])];
  }
  const term = coverage.term ? TERMS[language][coverage.term] : null;
  const pct = coverage.term === 'coinsurance' && coverage.coinsuranceBp !== null ? ` ${percent(coverage.coinsuranceBp, language)}` : '';
  return [`${t.coverage}: ${t.insurance}${term ? ` · ${term}${pct}` : ''}`, ...(coverage.insurerName ? [`${t.insurer}: ${coverage.insurerName}`] : [])];
}

/** Centésimas de punto → «20 %» (es) o «20%» (en). */
function percent(bp: number, language: ReceiptLanguage): string {
  const whole = Math.floor(bp / 100);
  const rest = bp % 100;
  const value = rest === 0 ? String(whole) : `${String(whole)}.${String(rest).padStart(2, '0').replace(/0$/, '')}`;
  return language === 'es' ? `${value} %` : `${value}%`;
}

/**
 * El texto del recibo (42 columnas) en el idioma pedido. Pura: los mismos
 * datos dan siempre el mismo texto. Los nombres del catálogo salen como se
 * guardaron (el catálogo tiene un solo nombre); el del plan, en su idioma.
 */
export function renderReceipt(snapshot: ReceiptSnapshot, language: ReceiptLanguage): string {
  const t = T[language];
  const out: string[] = [];
  const push = (...lines: string[]) => out.push(...lines);
  const s = snapshot;

  push(...center(s.clinic.name));
  push(...center(`${s.location.code} · ${s.location.name}`));
  if (s.location.address) push(...center(s.location.address));
  if (s.location.phone) push(...center(`${t.phone} ${s.location.phone}`));
  push(RULE);
  push(...pairLine(t.title, s.code));
  push(...pairLine(t.date, receiptDateTime(s.issuedAt, s.timeZone, language)));
  if (s.target.kind === 'visit') push(...pairLine(t.visit, s.target.encounterCode));
  else push(...pairLine(t.membership, s.target.membershipCode));
  if (s.issuedBy) push(...pairLine(t.issuedBy, s.issuedBy));
  push(RULE);
  push(`${s.target.kind === 'visit' ? t.patient : t.holder}:`);
  push(...wrapText(`${s.patient.firstName} ${s.patient.lastName} (${s.patient.code})`));
  push(RULE);

  if (s.target.kind === 'visit') {
    const v = s.target;
    for (const line of coverageText(v.coverage, language)) push(...wrapText(line));
    push(RULE);
    if (v.lines.length === 0) push(t.noCharges);
    for (const line of v.lines) {
      push(...wrapText(line.itemName));
      push(...pairLine(`${String(line.quantity)} x ${receiptMoney(line.unitPriceCents)}`, receiptMoney(line.amountCents), RECEIPT_COLUMNS, 2));
      if (line.discountCents > 0) {
        if (line.lineTotalCents === 0) push(`  ${t.included}`);
        else push(...pairLine(t.memberDiscount, receiptMoney(-line.discountCents), RECEIPT_COLUMNS, 2));
      }
    }
    push(RULE);
    push(...pairLine(t.subtotal, receiptMoney(v.totals.subtotalCents)));
    if (v.totals.discountCents > 0) push(...pairLine(t.discount, receiptMoney(-v.totals.discountCents)));
    if (v.totals.insuranceCents > 0) push(...pairLine(t.byInsurance, receiptMoney(-v.totals.insuranceCents)));
    push(...pairLine(t.totalDue, receiptMoney(v.totals.totalDueCents)));
    push(...pairLine(t.paid, receiptMoney(v.totals.paidCents)));
    // Nunca un saldo negativo: «Crédito a favor» en su lugar.
    if (v.totals.creditCents > 0) push(...pairLine(t.credit, receiptMoney(v.totals.creditCents)));
    else push(...pairLine(t.balance, receiptMoney(Math.max(v.totals.balanceCents, 0))));
  } else {
    const f = s.target;
    push(...pairLine(t.plan, language === 'es' ? f.planNameEs : f.planNameEn));
    push(...pairLine(FEE_KINDS[language][f.feeKind], receiptMoney(f.amountCents)));
    push(...pairLine(t.period, `${receiptDay(f.periodStart, language)} - ${receiptDay(f.periodEnd, language)}`));
    push(...pairLine(t.due, receiptDay(f.dueDate, language)));
    push(RULE);
    const paid = s.payments.reduce((sum, p) => sum + p.amountCents, 0);
    push(...pairLine(t.total, receiptMoney(f.amountCents)));
    push(...pairLine(t.paid, receiptMoney(paid)));
    push(...pairLine(t.balance, receiptMoney(Math.max(f.amountCents - paid, 0))));
  }

  push(RULE);
  push(t.payments);
  if (s.payments.length === 0) push(t.noPayments);
  for (const p of s.payments) {
    push(...pairLine(`${METHODS[language][p.method]}${p.referenceLast4 ? ` ••••${p.referenceLast4}` : ''}`, receiptMoney(p.amountCents)));
    push(`  ${receiptDateTime(p.recordedAt, s.timeZone, language)}`);
  }
  const linked = s.payments.find((p) => p.id === s.linkedPaymentId);
  if (linked) {
    push(RULE);
    push(`${t.linked}:`);
    push(...pairLine(METHODS[language][linked.method], receiptMoney(linked.amountCents), RECEIPT_COLUMNS, 2));
  }
  push(RULE);
  push(...center(s.target.kind === 'visit' ? t.thanksVisit : t.thanksFee));
  return out.join('\n');
}
