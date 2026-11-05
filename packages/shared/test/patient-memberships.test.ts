import { describe, expect, it } from 'vitest';
import { addDays } from '../src/appointments.ts';
import {
  addMonthsClamped,
  applyMembershipBenefits,
  benefitYear,
  cancellationNotice,
  daysBetween,
  enrollMembershipSchema,
  firstDueDate,
  hasBenefitsOn,
  initialFeePeriod,
  membershipStanding,
  monthlyFeesDue,
  nextDueDate,
  percentOfCents,
  type BenefitLine,
  type BenefitRules,
  type MembershipStandingInput,
} from '../src/patient-memberships.ts';

// T-026b parte B: fechas de cobro, estado y beneficios, con las reglas del
// dueño del 2026-11-03 y 2026-11-04 (ADR 0034).

describe('fechas de cobro', () => {
  it('suma meses con el último día de los meses cortos', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsClamped('2026-12-15', 1)).toBe('2027-01-15');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-11-01', '2026-12-01')).toBe(30);
  });

  it('primera mensualidad: el primer día de cobro al cumplirse un mes, o después (decisión 5)', () => {
    // Ejemplo del dueño: inicio 3 nov, día 15 → 15 dic.
    expect(firstDueDate('2026-11-03', 15)).toBe('2026-12-15');
    // El día de cobro coincide con el mes cumplido.
    expect(firstDueDate('2026-11-15', 15)).toBe('2026-12-15');
    // El día de cobro cae antes del mes cumplido: el mes siguiente.
    expect(firstDueDate('2026-11-20', 15)).toBe('2027-01-15');
    // Día 31: último día de los meses cortos.
    expect(firstDueDate('2027-01-10', 31)).toBe('2027-02-28');
    expect(firstDueDate('2026-12-31', 31)).toBe('2027-01-31');
    expect(firstDueDate('2027-01-31', 30)).toBe('2027-02-28');
  });

  it('las mensualidades siguientes vuelven al día de cobro después de un mes corto', () => {
    expect(nextDueDate('2027-02-28', 31)).toBe('2027-03-31');
    expect(nextDueDate('2027-03-31', 31)).toBe('2027-04-30');
    expect(nextDueDate('2026-12-15', 15)).toBe('2027-01-15');
    expect(nextDueDate('2028-01-29', 29)).toBe('2028-02-29');
  });

  it('la cuota inicial cubre del inicio al día antes de la primera mensualidad', () => {
    expect(initialFeePeriod('2026-11-03', 15)).toEqual({ periodStart: '2026-11-03', periodEnd: '2026-12-14', dueDate: '2026-11-03' });
  });

  it('cada mensualidad se crea 14 días antes de vencer, una sola vez', () => {
    const m = { startDate: '2026-11-03', billingDay: 15, benefitsEndDate: null, existingDueDates: [] as string[] };
    expect(monthlyFeesDue(m, '2026-11-30')).toEqual([]);
    expect(monthlyFeesDue(m, '2026-12-01')).toEqual([{ dueDate: '2026-12-15', periodStart: '2026-12-15', periodEnd: '2027-01-14' }]);
    expect(monthlyFeesDue({ ...m, existingDueDates: ['2026-12-15'] }, '2026-12-01')).toEqual([]);
    // Si el worker estuvo parado, crea las que falten.
    expect(monthlyFeesDue(m, '2027-01-02').map((f) => f.dueDate)).toEqual(['2026-12-15', '2027-01-15']);
    // Ninguna después del fin de beneficios de un aviso.
    expect(monthlyFeesDue({ ...m, benefitsEndDate: '2026-12-14' }, '2027-01-02')).toEqual([]);
  });

  it('año de beneficios: de aniversario en aniversario (decisión 1)', () => {
    expect(benefitYear('2026-11-03', '2026-11-03')).toEqual({ start: '2026-11-03', end: '2027-11-02' });
    expect(benefitYear('2026-11-03', '2027-11-02')).toEqual({ start: '2026-11-03', end: '2027-11-02' });
    expect(benefitYear('2026-11-03', '2027-11-03')).toEqual({ start: '2027-11-03', end: '2028-11-02' });
    expect(benefitYear('2028-02-29', '2029-02-28')).toEqual({ start: '2029-02-28', end: '2030-02-27' });
    expect(benefitYear('2026-11-03', '2031-06-01').start).toBe('2030-11-03');
  });
});

describe('estado de la membresía', () => {
  const base: MembershipStandingInput = {
    status: 'active',
    enrolledOn: '2026-11-03',
    benefitsEndDate: null,
    fees: [
      { kind: 'initial', dueDate: '2026-11-03', status: 'paid' },
      { kind: 'monthly', dueDate: '2026-12-15', status: 'pending' },
    ],
  };

  it('«Pendiente de pago» hasta pagar la cuota inicial y cancelada a los 30 días de la inscripción', () => {
    const pending: MembershipStandingInput = { ...base, status: 'pending_payment', fees: [{ kind: 'initial', dueDate: '2026-11-03', status: 'pending' }] };
    expect(membershipStanding(pending, '2026-12-02')).toEqual({ status: 'pending_payment' });
    expect(membershipStanding(pending, '2026-12-03')).toEqual({ status: 'cancelled', on: '2026-12-03', cancellation: 'initial_unpaid' });
  });

  it('suspendida desde D+1 y cancelada en D+30 si la mensualidad del día D no se paga (decisión 6)', () => {
    expect(membershipStanding(base, '2026-12-15')).toEqual({ status: 'active' });
    expect(membershipStanding(base, '2026-12-16')).toEqual({ status: 'suspended', since: '2026-12-16', overdueDueDate: '2026-12-15' });
    expect(membershipStanding(base, '2027-01-13').status).toBe('suspended');
    expect(membershipStanding(base, '2027-01-14')).toEqual({ status: 'cancelled', on: '2027-01-14', cancellation: 'non_payment' });
  });

  it('pagada la mensualidad vuelve a estar activa', () => {
    const paid = { ...base, status: 'suspended' as const, fees: base.fees.map((f) => ({ ...f, status: 'paid' as const })) };
    expect(membershipStanding(paid, '2026-12-20')).toEqual({ status: 'active' });
  });

  it('con aviso, los beneficios valen hasta el último día y al día siguiente se cancela', () => {
    const notice = { ...base, benefitsEndDate: '2026-12-14', fees: base.fees.slice(0, 1) };
    expect(membershipStanding(notice, '2026-12-14')).toEqual({ status: 'active' });
    expect(membershipStanding(notice, '2026-12-15')).toEqual({ status: 'cancelled', on: '2026-12-15', cancellation: 'notice' });
  });

  it('da beneficios solo activa y desde la fecha de inicio', () => {
    expect(hasBenefitsOn({ status: 'active' }, '2026-11-10', '2026-11-09')).toBe(false);
    expect(hasBenefitsOn({ status: 'active' }, '2026-11-10', '2026-11-10')).toBe(true);
    expect(hasBenefitsOn({ status: 'pending_payment' }, '2026-11-10', '2026-11-10')).toBe(false);
  });
});

describe('aviso de cancelación (decisión 7)', () => {
  it('con 15 días o más: valen hasta el día antes del próximo cobro, sin deber nada', () => {
    expect(cancellationNotice('2026-11-03', 15, '2026-11-30')).toEqual({ benefitsEndDate: '2026-12-14', owedDueDate: null });
  });
  it('con menos de 15 días: esa mensualidad se debe y los beneficios duran un mes más', () => {
    expect(cancellationNotice('2026-11-03', 15, '2026-12-01')).toEqual({ benefitsEndDate: '2027-01-14', owedDueDate: '2026-12-15' });
    expect(cancellationNotice('2026-11-03', 15, '2026-12-15')).toEqual({ benefitsEndDate: '2027-01-14', owedDueDate: '2026-12-15' });
  });
  it('coincide con la creación de la mensualidad: existe justo cuando ya se debe', () => {
    const m = { startDate: '2026-11-03', billingDay: 15, benefitsEndDate: null, existingDueDates: [] as string[] };
    expect(monthlyFeesDue(m, '2026-11-30')).toHaveLength(0);
    expect(cancellationNotice('2026-11-03', 15, '2026-11-30').owedDueDate).toBeNull();
    expect(monthlyFeesDue(m, '2026-12-01')).toHaveLength(1);
    expect(cancellationNotice('2026-11-03', 15, '2026-12-01').owedDueDate).toBe('2026-12-15');
  });
});

describe('beneficios', () => {
  const INICIAL = 'c-inicial';
  const SEGUIMIENTO = 'c-seguimiento';
  const A1C = 'l-a1c';
  const TSH = 'l-tsh';
  const PSA = 'l-psa';
  const ENFERMEDAD = 'c-enfermedad';
  const rules = (sameVisitLabs: boolean, consultationBp = 3500): BenefitRules => ({
    included: [
      { id: 'b-inicial', sortOrder: 10, quantityPerYear: 1, quotaMode: 'shared', includesSameVisitLabs: false, items: [{ kind: 'consultation', id: INICIAL }] },
      // «Paquete»: 1 A1c y 1 TSH al año.
      {
        id: 'b-chequeo',
        sortOrder: 20,
        quantityPerYear: 1,
        quotaMode: 'package',
        includesSameVisitLabs: false,
        items: [
          { kind: 'lab_test', id: A1C },
          { kind: 'lab_test', id: TSH },
        ],
      },
      // «Cupo compartido»: 3 entre la consulta de seguimiento y la de enfermedad.
      {
        id: 'b-seguimiento',
        sortOrder: 40,
        quantityPerYear: 3,
        quotaMode: 'shared',
        includesSameVisitLabs: sameVisitLabs,
        items: [
          { kind: 'consultation', id: SEGUIMIENTO },
          { kind: 'consultation', id: ENFERMEDAD },
        ],
      },
    ],
    discounts: [
      { id: 'd-cons', category: 'consultation', discountBp: consultationBp },
      { id: 'd-lab', category: 'lab', discountBp: 2500 },
      { id: 'd-trat', category: 'treatment', discountBp: 0 },
    ],
  });
  let n = 0;
  const line = (kind: BenefitLine['kind'], itemId: string, unitPriceCents: number, quantity = 1, date = '2026-11-10', category: BenefitLine['category'] = kind === 'lab_test' ? 'lab' : null): BenefitLine => {
    n += 1;
    return { chargeId: `ch-${String(n)}`, kind, itemId, category, unitPriceCents, quantity, date };
  };
  const none = () => 0;

  it('redondea al centavo, la mitad hacia arriba, sin coma flotante', () => {
    expect(percentOfCents(1999, 3500)).toBe(700); // 699.65
    expect(percentOfCents(1, 5000)).toBe(1); // 0.5
    expect(percentOfCents(2_147_483_647 * 1000, 10000)).toBe(2_147_483_647_000);
  });

  it('primero el incluido (sin costo) y después el descuento de la categoría', () => {
    const lines = [line('lab_test', A1C, 3000), line('lab_test', A1C, 3000), line('lab_test', PSA, 4000)];
    const result = applyMembershipBenefits({ rules: rules(false), startDate: '2026-11-03', lines, usedElsewhere: none });
    expect(result.map((r) => [r.includedQuantity, r.discountCents])).toEqual([
      [1, 3000],
      [0, 750],
      [0, 1000],
    ]);
    expect(result[0]).toMatchObject({ includedBenefitId: 'b-chequeo', discountBenefitId: null, benefitYearStart: '2026-11-03' });
    expect(result[1]).toMatchObject({ includedBenefitId: null, discountBenefitId: 'd-lab', discountBp: 2500 });
  });

  it('se reparte por unidad: de 2 con 1 incluido restante, 1 sin costo y la otra con descuento', () => {
    const [r] = applyMembershipBenefits({ rules: rules(false), startDate: '2026-11-03', lines: [line('lab_test', A1C, 3000, 2)], usedElsewhere: none });
    expect(r).toMatchObject({ includedQuantity: 1, discountBenefitId: 'd-lab', discountCents: 3000 + 750 });
  });

  it('cuenta lo usado en otras visitas del mismo año de beneficios', () => {
    const used = (id: string, year: string, item: string | null) => (id === 'b-chequeo' && year === '2026-11-03' && item === `lab_test:${A1C}` ? 1 : 0);
    const [r] = applyMembershipBenefits({ rules: rules(false), startDate: '2026-11-03', lines: [line('lab_test', A1C, 3000)], usedElsewhere: used });
    expect(r).toMatchObject({ includedQuantity: 0, discountCents: 750 });
  });

  it('el último día del año aún cuenta lo usado; el primero del siguiente vuelve a tener el cupo', () => {
    const used = (id: string, year: string, item: string | null) => (id === 'b-chequeo' && year === '2026-11-03' && item === `lab_test:${A1C}` ? 1 : 0);
    const last = applyMembershipBenefits({ rules: rules(false), startDate: '2026-11-03', lines: [line('lab_test', A1C, 3000, 1, '2027-11-02')], usedElsewhere: used });
    const first = applyMembershipBenefits({ rules: rules(false), startDate: '2026-11-03', lines: [line('lab_test', A1C, 3000, 1, '2027-11-03')], usedElsewhere: used });
    expect(last[0]).toMatchObject({ includedQuantity: 0, benefitYearStart: '2026-11-03' });
    expect(first[0]).toMatchObject({ includedQuantity: 1, benefitYearStart: '2027-11-03' });
  });

  it('«Paquete»: cada servicio del chequeo hasta su cantidad (1 A1c y 1 TSH)', () => {
    const lines = [line('lab_test', A1C, 3000), line('lab_test', TSH, 4000), line('lab_test', TSH, 4000)];
    const result = applyMembershipBenefits({ rules: rules(false), startDate: '2026-11-03', lines, usedElsewhere: none });
    expect(result.map((r) => [r.includedBenefitId, r.includedQuantity, r.discountCents])).toEqual([
      ['b-chequeo', 1, 3000],
      ['b-chequeo', 1, 4000],
      [null, 0, 1000],
    ]);
  });

  it('«Cupo compartido»: dos consultas distintas gastan el mismo cupo de 3', () => {
    const lines = [line('consultation', SEGUIMIENTO, 4500, 2), line('consultation', ENFERMEDAD, 5000, 2)];
    const [seguimiento, enfermedad] = applyMembershipBenefits({ rules: rules(false), startDate: '2026-11-03', lines, usedElsewhere: none });
    expect(seguimiento).toMatchObject({ includedBenefitId: 'b-seguimiento', includedQuantity: 2, discountCents: 9000 });
    // Queda 1 del cupo: la otra consulta de enfermedad va con el 35 %.
    expect(enfermedad).toMatchObject({ includedBenefitId: 'b-seguimiento', includedQuantity: 1, discountCents: 5000 + 1750 });
    // Lo usado en otra visita cuenta para todo el cupo, sin importar la consulta.
    const used = (id: string, _year: string, item: string | null) => (id === 'b-seguimiento' && item === null ? 3 : 0);
    const [other] = applyMembershipBenefits({ rules: rules(false), startDate: '2026-11-03', lines: [line('consultation', ENFERMEDAD, 5000)], usedElsewhere: used });
    expect(other).toMatchObject({ includedQuantity: 0, discountCents: 1750 });
  });

  it('consulta inicial aparte de las 3 de seguimiento; el descuento después de las 3 (decisión 2 del 2026-11-04)', () => {
    const lines = [line('consultation', INICIAL, 6000), line('consultation', SEGUIMIENTO, 4500, 4)];
    const [inicial, seguimiento] = applyMembershipBenefits({ rules: rules(false), startDate: '2026-11-03', lines, usedElsewhere: none });
    expect(inicial).toMatchObject({ includedBenefitId: 'b-inicial', includedQuantity: 1, discountCents: 6000 });
    // 3 sin costo y la 4.ª con el 35 %: 3 × 4500 + 1575.
    expect(seguimiento).toMatchObject({ includedBenefitId: 'b-seguimiento', includedQuantity: 3, discountBenefitId: 'd-cons', discountCents: 13500 + 1575 });
    // Una segunda consulta inicial en el año va con el descuento de consultas.
    const [again] = applyMembershipBenefits({ rules: rules(false), startDate: '2026-11-03', lines: [line('consultation', INICIAL, 6000)], usedElsewhere: (id: string) => (id === 'b-inicial' ? 1 : 0) });
    expect(again).toMatchObject({ includedQuantity: 0, discountCents: 2100 });
  });

  it('plan Total: los laboratorios de la visita de una de las 3 consultas salen sin costo, aunque se ordenaran antes', () => {
    const lab = line('lab_test', PSA, 4000, 2);
    const checkup = line('lab_test', A1C, 3000, 2);
    const consult = line('consultation', SEGUIMIENTO, 4500);
    const result = applyMembershipBenefits({ rules: rules(true, 10000), startDate: '2026-11-03', lines: [lab, checkup, consult], usedElsewhere: none });
    expect(result[0]).toMatchObject({ sameVisitLabsBenefitId: 'b-seguimiento', includedQuantity: 0, discountCents: 8000 });
    // El chequeo gasta antes su cupo (1 A1c) y la otra A1c sale sin costo por la consulta (decisión del 2026-11-04).
    expect(result[1]).toMatchObject({ includedBenefitId: 'b-chequeo', includedQuantity: 1, sameVisitLabsBenefitId: 'b-seguimiento', discountBenefitId: null, discountCents: 6000 });
    expect(result[2]).toMatchObject({ includedBenefitId: 'b-seguimiento', includedQuantity: 1, discountCents: 4500 });
  });

  it('plan Total: después de las 3 consultas, la consulta es gratis por el 100 %, pero sus laboratorios no', () => {
    const used = (id: string) => (id === 'b-seguimiento' ? 3 : 0);
    const result = applyMembershipBenefits({ rules: rules(true, 10000), startDate: '2026-11-03', lines: [line('lab_test', PSA, 4000), line('consultation', SEGUIMIENTO, 4500)], usedElsewhere: used });
    expect(result[0]).toMatchObject({ sameVisitLabsBenefitId: null, discountCents: 1000 });
    expect(result[1]).toMatchObject({ includedQuantity: 0, discountBenefitId: 'd-cons', discountCents: 4500 });
  });

  it('sin categoría o con 0 %, no hay descuento', () => {
    const result = applyMembershipBenefits({
      rules: rules(false),
      startDate: '2026-11-03',
      lines: [line('procedure', 'p-1', 5000, 1, '2026-11-10', null), line('procedure', 'p-2', 5000, 1, '2026-11-10', 'treatment')],
      usedElsewhere: none,
    });
    expect(result.map((r) => r.discountCents)).toEqual([0, 0]);
    expect(result[1]?.discountBenefitId).toBeNull();
  });
});

describe('inscripción', () => {
  const valid = { planId: '019a2000-0000-7000-8000-000000000001', startDate: '2026-11-04', billingDay: 15, affiliatePatientIds: [], identityVerified: true };
  it('exige «Identidad verificada» y un día de cobro de 1 a 31', () => {
    expect(enrollMembershipSchema.safeParse(valid).success).toBe(true);
    expect(enrollMembershipSchema.safeParse({ ...valid, identityVerified: false }).success).toBe(false);
    expect(enrollMembershipSchema.safeParse({ ...valid, billingDay: 32 }).success).toBe(false);
    expect(enrollMembershipSchema.safeParse({ ...valid, affiliatePatientIds: [valid.planId, valid.planId] }).success).toBe(false);
  });
});
