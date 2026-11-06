import { describe, expect, it } from 'vitest';
import {
  generateVisitReceiptSchema,
  pairLine,
  printReceiptSchema,
  RECEIPT_CODE_PATTERN,
  RECEIPT_COLUMNS,
  receiptDateTime,
  receiptMoney,
  receiptSnapshotSchema,
  renderReceipt,
  wrapText,
  type ReceiptSnapshot,
} from '../src/index.ts';

// T-029: texto del recibo de 80 mm (42 columnas) en español y en inglés
// (ADR 0037). Datos ficticios.

const PAYMENT_ID = '01900000-0000-7000-8000-000000000001';

const visit = (over: Partial<ReceiptSnapshot> = {}): ReceiptSnapshot => ({
  v: 1,
  code: 'NOR1-R-2026-000045',
  issuedAt: '2026-11-05T16:00:00Z',
  timeZone: 'America/Chicago',
  clinic: { name: 'Clínica Demo Norte' },
  location: { code: 'NOR1', name: 'Norte Centro', address: '100 Calle Ficticia, Springfield', phone: '(555) 010-0100' },
  issuedBy: 'Persona Recepción',
  patient: { code: 'P-000123', firstName: 'Ana', lastName: 'Prueba Ficticia' },
  target: {
    kind: 'visit',
    encounterCode: 'NOR1-V-000210',
    coverage: { type: 'insurance', term: 'copay', coinsuranceBp: null, insurerName: 'Aseguradora Ficticia' },
    lines: [
      { itemCode: 'CONS_GEN', itemName: 'Consulta médica general', quantity: 1, unitPriceCents: 6000, amountCents: 6000, discountCents: 0, includedQuantity: 0, lineTotalCents: 6000 },
      { itemCode: 'INJ_B12', itemName: 'Inyección de vitamina B12', quantity: 2, unitPriceCents: 3500, amountCents: 7000, discountCents: 0, includedQuantity: 0, lineTotalCents: 7000 },
    ],
    totals: { subtotalCents: 13000, discountCents: 0, insuranceCents: 8500, totalDueCents: 4500, paidCents: 4500, balanceCents: 0, creditCents: 0, status: 'paid' },
  },
  payments: [{ id: PAYMENT_ID, method: 'credit_card', amountCents: 4500, referenceLast4: '1234', recordedAt: '2026-11-05T15:55:00Z' }],
  linkedPaymentId: PAYMENT_ID,
  ...over,
});

describe('recibo de 80 mm', () => {
  it('ningún renglón pasa de 42 columnas, en los dos idiomas', () => {
    const long = visit({
      clinic: { name: 'Clínica Demo Norte con un nombre larguísimo para probar el corte de renglones' },
      patient: { code: 'P-000123', firstName: 'María Guadalupe Fernanda', lastName: 'De la Concepción Ficticia Larga' },
    });
    for (const language of ['es', 'en'] as const) {
      const lines = renderReceipt(long, language).split('\n');
      for (const l of lines) expect(l.length, l).toBeLessThanOrEqual(RECEIPT_COLUMNS);
    }
  });

  it('en español: encabezado, paciente, cobertura, líneas, totales y pagos', () => {
    const text = renderReceipt(visit(), 'es');
    expect(text).toContain('Clínica Demo Norte');
    expect(text).toContain('NOR1 · Norte Centro');
    expect(text).toContain('100 Calle Ficticia, Springfield');
    expect(text).toContain('Tel. (555) 010-0100');
    expect(text).toMatch(/^RECIBO +NOR1-R-2026-000045$/m);
    expect(text).toMatch(/^Fecha +5 nov 2026, 10:00 a\. m\.$/m);
    expect(text).toMatch(/^Visita +NOR1-V-000210$/m);
    expect(text).toContain('Ana Prueba Ficticia (P-000123)');
    expect(text).toContain('Cobertura: Seguro · copago');
    expect(text).toContain('Aseguradora: Aseguradora Ficticia');
    expect(text).toMatch(/^ {2}2 x \$35\.00 +\$70\.00$/m);
    expect(text).toMatch(/^A cargo del seguro +-\$85\.00$/m);
    expect(text).toMatch(/^Total a pagar +\$45\.00$/m);
    expect(text).toMatch(/^Saldo +\$0\.00$/m);
    expect(text).toMatch(/^Tarjeta de crédito ••••1234 +\$45\.00$/m);
    expect(text).toMatch(/^Recibo del pago:\n {2}Tarjeta de crédito +\$45\.00$/m);
    expect(text).toContain('Gracias por su visita');
    // Sin fecha de nacimiento ni número de miembro (no están en la instantánea).
    expect(text).not.toMatch(/miembro|nacimiento/i);
  });

  it('en inglés, con la misma instantánea', () => {
    const text = renderReceipt(visit(), 'en');
    expect(text).toMatch(/^RECEIPT +NOR1-R-2026-000045$/m);
    expect(text).toMatch(/^Date +Nov 5, 2026, 10:00 AM$/m);
    expect(text).toContain('Coverage: Insurance · copay');
    expect(text).toMatch(/^Covered by insurance +-\$85\.00$/m);
    expect(text).toMatch(/^Amount due +\$45\.00$/m);
    expect(text).toMatch(/^Credit card ••••1234 +\$45\.00$/m);
    expect(text).toContain('Thank you for your visit');
  });

  it('membresía: el plan, «Membresía −$X» o «Incluido en la membresía» y el descuento total', () => {
    const base = visit();
    if (base.target.kind !== 'visit') throw new Error('visita');
    const text = renderReceipt(
      visit({
        target: {
          ...base.target,
          coverage: { type: 'membership', planNameEs: 'Plan Familiar', planNameEn: 'Family Plan' },
          lines: [
            { itemCode: 'CONS_GEN', itemName: 'Consulta médica general', quantity: 1, unitPriceCents: 6000, amountCents: 6000, discountCents: 6000, includedQuantity: 1, lineTotalCents: 0 },
            { itemCode: 'LAB_CBC', itemName: 'Biometría hemática', quantity: 1, unitPriceCents: 2000, amountCents: 2000, discountCents: 400, includedQuantity: 0, lineTotalCents: 1600 },
          ],
          totals: { subtotalCents: 8000, discountCents: 6400, insuranceCents: 0, totalDueCents: 1600, paidCents: 0, balanceCents: 1600, creditCents: 0, status: 'open' },
        },
        payments: [],
        linkedPaymentId: null,
      }),
      'es',
    );
    expect(text).toContain('Cobertura: Membresía');
    expect(text).toContain('Plan: Plan Familiar');
    expect(text).toContain('  Incluido en la membresía');
    expect(text).toMatch(/^ {2}Membresía +-\$4\.00$/m);
    expect(text).toMatch(/^Descuento de membresía +-\$64\.00$/m);
    expect(text).not.toContain('A cargo del seguro');
    expect(text).toMatch(/^Saldo +\$16\.00$/m);
    expect(text).toContain('Sin pagos');
    expect(text).not.toContain('Recibo del pago');
  });

  it('crédito a favor en lugar de un saldo negativo', () => {
    const base = visit();
    if (base.target.kind !== 'visit') throw new Error('visita');
    const target = { ...base.target, totals: { ...base.target.totals, totalDueCents: 2000, paidCents: 4500, balanceCents: -2500, creditCents: 2500 } };
    const es = renderReceipt(visit({ target }), 'es');
    expect(es).toMatch(/^Crédito a favor +\$25\.00$/m);
    expect(es).not.toMatch(/^Saldo/m);
    expect(es).not.toContain('-$25.00');
    expect(renderReceipt(visit({ target }), 'en')).toMatch(/^Credit +\$25\.00$/m);
  });

  it('cuota de membresía: titular, plan, tipo de cuota, periodo y pago', () => {
    const text = renderReceipt(
      visit({
        target: { kind: 'membership_fee', membershipCode: 'NOR1-M-000012', planNameEs: 'Plan Familiar', planNameEn: 'Family Plan', feeKind: 'monthly', dueDate: '2026-11-05', periodStart: '2026-11-05', periodEnd: '2026-12-04', amountCents: 4900 },
        payments: [{ id: PAYMENT_ID, method: 'cash', amountCents: 4900, referenceLast4: null, recordedAt: '2026-11-05T15:55:00Z' }],
      }),
      'en',
    );
    expect(text).toMatch(/^Membership +NOR1-M-000012$/m);
    expect(text).toContain('Holder:');
    expect(text).toMatch(/^Plan +Family Plan$/m);
    expect(text).toMatch(/^Monthly fee +\$49\.00$/m);
    expect(text).toMatch(/^Period +Nov 5, 2026 - Dec 4, 2026$/m);
    expect(text).toMatch(/^Balance +\$0\.00$/m);
    expect(text).toContain('Thank you for your payment');
  });

  it('la fecha sale en la zona de la sede, también al cambiar de año', () => {
    expect(receiptDateTime('2027-01-01T05:59:00Z', 'America/Chicago', 'es')).toBe('31 dic 2026, 11:59 p. m.');
    expect(receiptDateTime('2027-01-01T06:01:00Z', 'America/Chicago', 'es')).toBe('1 ene 2027, 12:01 a. m.');
    expect(receiptDateTime('2027-01-01T06:01:00Z', 'America/Chicago', 'en')).toBe('Jan 1, 2027, 12:01 AM');
  });

  it('importes, renglones y esquemas', () => {
    expect(receiptMoney(123450)).toBe('$1,234.50');
    expect(receiptMoney(-1000)).toBe('-$10.00');
    expect(receiptMoney(5)).toBe('$0.05');
    expect(wrapText('a'.repeat(50), 42)).toEqual(['a'.repeat(42), 'a'.repeat(8)]);
    expect(pairLine('Total', '$1.00', 20)).toEqual(['Total          $1.00']);
    expect(RECEIPT_CODE_PATTERN.test('NOR1-R-2026-000045')).toBe(true);
    expect(RECEIPT_CODE_PATTERN.test('NOR1-R-000045')).toBe(false);
    expect(receiptSnapshotSchema.parse(visit())).toEqual(visit());
    expect(() => printReceiptSchema.parse({ language: 'fr' })).toThrow();
    expect(() => generateVisitReceiptSchema.parse({ paymentId: null, amountCents: 1 })).toThrow();
  });
});
