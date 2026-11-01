import { describe, expect, it } from 'vitest';
import {
  arrivalSchema,
  basisPointsToPercent,
  centsToDecimal,
  COVERAGE_MESSAGES,
  parseMoneyToCents,
  parsePercentToBasisPoints,
  suggestedRoute,
} from '../src/encounters.ts';

// T-017: esquemas de la llegada. Importes como texto decimal → centavos, sin
// coma flotante; un solo término del seguro; sin membresía en 3A.

const APPOINTMENT = '019a2000-0000-7000-8000-000000000501';
const PATIENT = '019a2000-0000-7000-8000-000000000101';

describe('importes de la cobertura', () => {
  it('monto: hasta 7 enteros y 2 decimales, solo dígitos y punto', () => {
    expect(parseMoneyToCents('25')).toBe(2500);
    expect(parseMoneyToCents('25.5')).toBe(2550);
    expect(parseMoneyToCents('25.05')).toBe(2505);
    expect(parseMoneyToCents(' 0.10 ')).toBe(10);
    // 0.1 + 0.2 en coma flotante no es 0.3: aquí no hay floats.
    expect(parseMoneyToCents('1234567.89')).toBe(123456789);
    expect(parseMoneyToCents('9999999.99')).toBe(999_999_999);
    for (const bad of ['', '25,00', '25.001', '-1', '1e3', '$25', '.5', '25.', '12345678']) expect(parseMoneyToCents(bad), bad).toBeNull();
  });

  it('porcentaje: 0 a 100 con hasta dos decimales, en centésimas de punto', () => {
    expect(parsePercentToBasisPoints('20')).toBe(2000);
    expect(parsePercentToBasisPoints('20.5')).toBe(2050);
    expect(parsePercentToBasisPoints('0')).toBe(0);
    expect(parsePercentToBasisPoints('100')).toBe(10_000);
    for (const bad of ['100.01', '101', '-5', '20%', '20.555', '']) expect(parsePercentToBasisPoints(bad), bad).toBeNull();
  });

  it('formato para mostrar', () => {
    expect(centsToDecimal(2550)).toBe('25.50');
    expect(centsToDecimal(5)).toBe('0.05');
    expect(basisPointsToPercent(2000)).toBe('20');
    expect(basisPointsToPercent(2050)).toBe('20.5');
    expect(basisPointsToPercent(2055)).toBe('20.55');
  });
});

describe('esquema de la llegada', () => {
  const withCoverage = (coverage: unknown) => arrivalSchema.safeParse({ source: 'appointment', appointmentId: APPOINTMENT, expectedVersion: 2, route: 'STANDARD', coverage });

  it('con cita y pago directo; sin cita con tipo opcional', () => {
    expect(withCoverage({ type: 'self_pay' }).success).toBe(true);
    const walkIn = arrivalSchema.parse({ source: 'walk_in', patientId: PATIENT, appointmentTypeId: null, route: 'LAB_ONLY', coverage: { type: 'self_pay' } });
    expect(walkIn).toMatchObject({ source: 'walk_in', route: 'LAB_ONLY' });
  });

  it('seguro: el servidor convierte el valor según el término', () => {
    const copay = withCoverage({ type: 'insurance', insurerName: ' Seguro Ficticio ', memberId: '', term: 'copay', value: '25.00' });
    expect(copay.success && copay.data.coverage).toEqual({
      type: 'insurance',
      insurerName: 'Seguro Ficticio',
      memberId: null,
      term: 'copay',
      amountCents: 2500,
      coinsuranceBp: null,
    });
    const coinsurance = withCoverage({ type: 'insurance', insurerName: 'Seguro Ficticio', memberId: 'ABC123', term: 'coinsurance', value: '20' });
    expect(coinsurance.success && coinsurance.data.coverage).toMatchObject({ term: 'coinsurance', amountCents: null, coinsuranceBp: 2000, memberId: 'ABC123' });
  });

  it('seguro sin nombre o con un valor inválido para su término: con su mensaje', () => {
    const noName = withCoverage({ type: 'insurance', insurerName: '  ', term: 'copay', value: '25' });
    expect(noName.success).toBe(false);
    expect(JSON.stringify(noName.error)).toContain(COVERAGE_MESSAGES.insurerName);
    const badPercent = withCoverage({ type: 'insurance', insurerName: 'S', term: 'coinsurance', value: '120' });
    expect(JSON.stringify(badPercent.error)).toContain(COVERAGE_MESSAGES.percent);
    const badMoney = withCoverage({ type: 'insurance', insurerName: 'S', term: 'deductible', value: '25,00' });
    expect(JSON.stringify(badMoney.error)).toContain(COVERAGE_MESSAGES.money);
  });

  it('en 3A no hay membresía (ADR 0034) ni rutas desconocidas', () => {
    expect(withCoverage({ type: 'membership' }).success).toBe(false);
    expect(arrivalSchema.safeParse({ source: 'appointment', appointmentId: APPOINTMENT, expectedVersion: 1, route: 'EXPRESS', coverage: { type: 'self_pay' } }).success).toBe(false);
    expect(arrivalSchema.safeParse({ source: 'kiosk', patientId: PATIENT, route: 'STANDARD', coverage: { type: 'self_pay' } }).success).toBe(false);
  });

  it('ruta inicial: la del tipo, o Estándar', () => {
    expect(suggestedRoute({ suggestedRoute: 'INJECTION_ONLY' })).toBe('INJECTION_ONLY');
    expect(suggestedRoute({ suggestedRoute: null })).toBe('STANDARD');
    expect(suggestedRoute(null)).toBe('STANDARD');
  });
});
