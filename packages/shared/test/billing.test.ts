import { describe, expect, it } from 'vitest';
import {
  addChargeSchema,
  applyMembershipBenefits,
  computeStatement,
  patientShareCents,
  type BenefitLine,
  type BenefitRules,
  type StatementCoverage,
  type StatementInputLine,
} from '../src/index.ts';

// T-027: estado de cuenta de la visita, con casos calculados a mano (ADR 0034,
// 0035 y 0041). Todos los importes en centavos.

const SELF_PAY: StatementCoverage = { type: 'self_pay', term: null, amountCents: null, coinsuranceBp: null };
const copay = (cents: number): StatementCoverage => ({ type: 'insurance', term: 'copay', amountCents: cents, coinsuranceBp: null });
const coinsurance = (bp: number): StatementCoverage => ({ type: 'insurance', term: 'coinsurance', amountCents: null, coinsuranceBp: bp });
const DEDUCTIBLE: StatementCoverage = { type: 'insurance', term: 'deductible', amountCents: 50000, coinsuranceBp: null };
const MEMBERSHIP: StatementCoverage = { type: 'membership', term: null, amountCents: null, coinsuranceBp: null };

const line = (amountCents: number, membershipDiscountCents = 0): StatementInputLine => ({ amountCents, membershipDiscountCents });
/** Consulta $60.00 + inyección $35.00 × 2 = $130.00. */
const VISIT = [line(6000), line(7000)];

describe('estado de cuenta', () => {
  it('pago directo: el paciente debe el monto completo', () => {
    expect(computeStatement({ lines: VISIT, coverage: SELF_PAY, paidCents: 0 })).toEqual({
      subtotalCents: 13000,
      discountCents: 0,
      insuranceCents: 0,
      totalDueCents: 13000,
      paidCents: 0,
      balanceCents: 13000,
      status: 'open',
      rule: 'self_pay',
    });
  });

  it('seguro con copago: $25.00 el paciente y $105.00 «A cargo del seguro», que no es un descuento', () => {
    expect(computeStatement({ lines: VISIT, coverage: copay(2500), paidCents: 0 })).toMatchObject({
      subtotalCents: 13000,
      discountCents: 0,
      insuranceCents: 10500,
      totalDueCents: 2500,
      balanceCents: 2500,
      rule: 'insurance_copay',
    });
  });

  it('el copago se cobra una vez por visita, aunque haya varios cargos', () => {
    const many = [line(1000), line(2000), line(3000), line(4000)];
    expect(computeStatement({ lines: many, coverage: copay(2500), paidCents: 0 })).toMatchObject({ subtotalCents: 10000, totalDueCents: 2500, insuranceCents: 7500 });
  });

  it('un copago mayor que el total deja «Total a pagar» igual al total y nada a cargo del seguro', () => {
    expect(computeStatement({ lines: VISIT, coverage: copay(20000), paidCents: 0 })).toMatchObject({ totalDueCents: 13000, insuranceCents: 0 });
    expect(computeStatement({ lines: VISIT, coverage: copay(13000), paidCents: 0 })).toMatchObject({ totalDueCents: 13000, insuranceCents: 0 });
  });

  it('seguro con coaseguro: 20 % de $130.00 = $26.00 el paciente y $104.00 el seguro', () => {
    expect(computeStatement({ lines: VISIT, coverage: coinsurance(2000), paidCents: 0 })).toMatchObject({
      totalDueCents: 2600,
      insuranceCents: 10400,
      rule: 'insurance_coinsurance',
    });
  });

  it('redondeo del coaseguro: la parte del paciente al centavo más cercano, la mitad hacia arriba; el seguro, el resto exacto', () => {
    // 12.5 % de $1.00 = 12.5 ¢ → 13 ¢; el seguro, 87 ¢.
    expect(computeStatement({ lines: [line(100)], coverage: coinsurance(1250), paidCents: 0 })).toMatchObject({ totalDueCents: 13, insuranceCents: 87 });
    // 33.33 % de $10.00 = 333.3 ¢ → 333 ¢; el seguro, 667 ¢.
    expect(computeStatement({ lines: [line(1000)], coverage: coinsurance(3333), paidCents: 0 })).toMatchObject({ totalDueCents: 333, insuranceCents: 667 });
    // 20.5 % de $0.10 = 2.05 ¢ → 2 ¢.
    expect(patientShareCents(10, coinsurance(2050))).toBe(2);
    // 15 % de $0.30 = 4.5 ¢ → 5 ¢ (la mitad, hacia arriba).
    expect(patientShareCents(30, coinsurance(1500))).toBe(5);
    // Las dos partes suman siempre el total.
    for (const [cents, bp] of [[1, 5000], [3, 3333], [99999, 1], [123457, 9999], [0, 2000], [5000, 0], [5000, 10000]] as const) {
      const totals = computeStatement({ lines: [line(cents)], coverage: coinsurance(bp), paidCents: 0 });
      expect(totals.totalDueCents + totals.insuranceCents).toBe(cents);
    }
  });

  it('seguro con deducible: el paciente debe el monto completo y nada queda a cargo del seguro', () => {
    expect(computeStatement({ lines: VISIT, coverage: DEDUCTIBLE, paidCents: 0 })).toMatchObject({ totalDueCents: 13000, insuranceCents: 0, rule: 'insurance_deductible' });
  });

  it('membresía: «Descuento total» es lo que restan los beneficios; sin beneficio, el monto completo', () => {
    // Consulta $60.00 sin costo (incluida) + laboratorio $40.00 con 25 % ($10.00).
    expect(computeStatement({ lines: [line(6000, 6000), line(4000, 1000)], coverage: MEMBERSHIP, paidCents: 0 })).toMatchObject({
      subtotalCents: 10000,
      discountCents: 7000,
      insuranceCents: 0,
      totalDueCents: 3000,
      rule: 'membership_applied',
    });
    expect(computeStatement({ lines: VISIT, coverage: MEMBERSHIP, paidCents: 0 })).toMatchObject({ discountCents: 0, totalDueCents: 13000, rule: 'membership_none' });
  });

  it('estado: «Abierto» sin pagos, «Pago parcial» con algo pagado, «Pagado» sin saldo o con un total a pagar de $0.00', () => {
    expect(computeStatement({ lines: VISIT, coverage: SELF_PAY, paidCents: 0 }).status).toBe('open');
    expect(computeStatement({ lines: VISIT, coverage: SELF_PAY, paidCents: 5000 })).toMatchObject({ status: 'partial', balanceCents: 8000 });
    expect(computeStatement({ lines: VISIT, coverage: SELF_PAY, paidCents: 13000 })).toMatchObject({ status: 'paid', balanceCents: 0 });
    expect(computeStatement({ lines: [line(6000, 6000)], coverage: MEMBERSHIP, paidCents: 0 })).toMatchObject({ totalDueCents: 0, status: 'paid' });
    expect(computeStatement({ lines: [], coverage: SELF_PAY, paidCents: 0 })).toMatchObject({ subtotalCents: 0, totalDueCents: 0, status: 'paid' });
  });

  it('sin cobertura guardada, como pago directo', () => {
    expect(computeStatement({ lines: VISIT, coverage: null, paidCents: 0 })).toMatchObject({ totalDueCents: 13000, rule: 'self_pay' });
  });
});

describe('membresía de punta a punta: consulta inicial, 3 de seguimiento y la 4.ª con descuento (plan Esencial)', () => {
  const INICIAL = 'c-inicial';
  const SEGUIMIENTO = 'c-seguimiento';
  const ENFERMEDAD = 'c-enfermedad';
  const rules: BenefitRules = {
    included: [
      { id: 'b-inicial', sortOrder: 1, quantityPerYear: 1, quotaMode: 'shared', includesSameVisitLabs: false, items: [{ kind: 'consultation', id: INICIAL }] },
      {
        id: 'b-seguimiento',
        sortOrder: 2,
        quantityPerYear: 3,
        quotaMode: 'shared',
        includesSameVisitLabs: false,
        items: [
          { kind: 'consultation', id: SEGUIMIENTO },
          { kind: 'consultation', id: ENFERMEDAD },
        ],
      },
    ],
    discounts: [{ id: 'd-consulta', category: 'consultation', discountBp: 3500 }],
  };
  const consult = (chargeId: string, itemId: string, cents: number, date: string): BenefitLine => ({
    chargeId,
    kind: 'consultation',
    itemId,
    category: 'consultation',
    unitPriceCents: cents,
    quantity: 1,
    date,
  });

  /** Una visita: los beneficios de sus cargos con lo usado en las visitas anteriores, y su estado de cuenta. */
  function visit(lines: BenefitLine[], history: { benefitId: string | null; quantity: number }[]) {
    const benefits = applyMembershipBenefits({
      rules,
      startDate: '2026-11-03',
      lines,
      usedElsewhere: (benefitId) => history.filter((h) => h.benefitId === benefitId).reduce((sum, h) => sum + h.quantity, 0),
    });
    const totals = computeStatement({
      lines: lines.map((l, i) => ({ amountCents: l.unitPriceCents * l.quantity, membershipDiscountCents: benefits[i]?.discountCents ?? 0 })),
      coverage: MEMBERSHIP,
      paidCents: 0,
    });
    history.push(...benefits.map((b) => ({ benefitId: b.includedBenefitId, quantity: b.includedQuantity })));
    return { benefits, totals };
  }

  it('cuatro gratis y la 4.ª de seguimiento con el 35 %', () => {
    const history: { benefitId: string | null; quantity: number }[] = [];
    // 1. Consulta inicial $60.00: sin costo.
    const v1 = visit([consult('k1', INICIAL, 6000, '2026-11-04')], history);
    expect(v1.benefits[0]).toMatchObject({ includedBenefitId: 'b-inicial', includedQuantity: 1, discountCents: 6000 });
    expect(v1.totals).toMatchObject({ subtotalCents: 6000, discountCents: 6000, totalDueCents: 0, status: 'paid' });
    // 2. Seguimiento $45.00: sin costo (cupo 1 de 3).
    const v2 = visit([consult('k2', SEGUIMIENTO, 4500, '2026-12-01')], history);
    expect(v2.benefits[0]).toMatchObject({ includedBenefitId: 'b-seguimiento', includedQuantity: 1 });
    expect(v2.totals.totalDueCents).toBe(0);
    // 3. Otra consulta del catálogo, Enfermedad $50.00, en el mismo cupo: sin costo (2 de 3).
    const v3 = visit([consult('k3', ENFERMEDAD, 5000, '2027-01-10')], history);
    expect(v3.benefits[0]).toMatchObject({ includedBenefitId: 'b-seguimiento', includedQuantity: 1 });
    expect(v3.totals.totalDueCents).toBe(0);
    // 4. Seguimiento $45.00: sin costo (3 de 3).
    const v4 = visit([consult('k4', SEGUIMIENTO, 4500, '2027-02-15')], history);
    expect(v4.totals.totalDueCents).toBe(0);
    // 5. La 4.ª de seguimiento, $45.00: 35 % = $15.75 de descuento, paga $29.25.
    const v5 = visit([consult('k5', SEGUIMIENTO, 4500, '2027-03-20')], history);
    expect(v5.benefits[0]).toMatchObject({ includedBenefitId: null, includedQuantity: 0, discountBenefitId: 'd-consulta', discountCents: 1575 });
    expect(v5.totals).toMatchObject({ subtotalCents: 4500, discountCents: 1575, totalDueCents: 2925, balanceCents: 2925, status: 'open', rule: 'membership_applied' });
    // Otra consulta inicial en el mismo año: ya no es gratis; lleva el 35 % ($60.00 → $21.00).
    const v6 = visit([consult('k6', INICIAL, 6000, '2027-04-01')], history);
    expect(v6.totals).toMatchObject({ discountCents: 2100, totalDueCents: 3900 });
  });
});

describe('«Agregar cargo» (S-CAJ-08)', () => {
  const item = { kind: 'consultation', id: '0195f3b2-7c1e-7000-8000-000000000001' } as const;

  it('solo el servicio del catálogo y la cantidad (1 a 1000)', () => {
    expect(addChargeSchema.parse({ item, quantity: 1, expectedVersion: 1 })).toEqual({ item, quantity: 1, expectedVersion: 1 });
    expect(addChargeSchema.safeParse({ item, quantity: 1000, expectedVersion: 3 }).success).toBe(true);
    for (const quantity of [0, 1001, 1.5]) expect(addChargeSchema.safeParse({ item, quantity, expectedVersion: 1 }).success).toBe(false);
  });

  it('rechaza un precio, un descuento o cualquier otro campo enviado por la web', () => {
    for (const extra of [{ unitPriceCents: 100 }, { discountCents: 500 }, { amountCents: 0 }, { description: 'CONSULTA' }]) {
      expect(addChargeSchema.safeParse({ item, quantity: 1, expectedVersion: 1, ...extra }).success).toBe(false);
    }
    expect(addChargeSchema.safeParse({ item: { ...item, unitPriceCents: 0 }, quantity: 1, expectedVersion: 1 }).success).toBe(false);
    expect(addChargeSchema.safeParse({ item: { kind: 'manual', id: item.id }, quantity: 1, expectedVersion: 1 }).success).toBe(false);
  });
});
