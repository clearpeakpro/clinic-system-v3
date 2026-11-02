import { describe, expect, it } from 'vitest';
import {
  allergyStatusOf,
  bmiOf,
  EMPTY_VITALS,
  hasRequiredVitals,
  nursingLock,
  saveAssessmentSchema,
  saveVitalsSchema,
  sendToProviderSchema,
  vitalError,
  vitalsCrossErrors,
} from '../src/nursing.ts';
import { VISIT_STATUSES } from '../src/visit.ts';

// T-022: reglas de enfermería compartidas por la web y la API.

describe('signos vitales (S-CLI-14)', () => {
  it('rangos y decimales del manual', () => {
    expect(vitalError('weightLb', 152.25)).toBeNull();
    expect(vitalError('weightLb', 152.255)).toBe('Ingrese un número (hasta 2 decimales).');
    expect(vitalError('weightLb', 0.5)).toBe('Debe estar entre 1 y 1500.');
    expect(vitalError('weightLb', 1501)).toBe('Debe estar entre 1 y 1500.');
    expect(vitalError('heightIn', 9.99)).toBe('Debe estar entre 10 y 108.');
    expect(vitalError('systolic', 120.5)).toBe('Ingrese un número entero.');
    expect(vitalError('diastolic', 19)).toBe('Debe estar entre 20 y 200.');
    expect(vitalError('pulse', 301)).toBe('Debe estar entre 20 y 300.');
    expect(vitalError('respirations', 3)).toBe('Debe estar entre 4 y 80.');
    expect(vitalError('temperatureF', 98.6)).toBeNull();
    expect(vitalError('temperatureF', 98.65)).toBe('Ingrese un número (hasta 1 decimal).');
    expect(vitalError('temperatureF', 115.1)).toBe('Debe estar entre 80 y 115.');
    expect(vitalError('spo2', 49)).toBe('Debe estar entre 50 y 100.');
    expect(vitalError('glucose', 1001)).toBe('Debe estar entre 10 y 1000.');
    expect(vitalError('pain', 0)).toBeNull();
    expect(vitalError('pain', 11)).toBe('Debe estar entre 0 y 10.');
  });

  it('IMC = 703 × lb / in², con 1 decimal; inverosímil fuera de 5 a 200', () => {
    expect(bmiOf(152, 66)).toBe(24.5);
    expect(bmiOf(152, null)).toBeNull();
    expect(bmiOf(null, 66)).toBeNull();
    expect(vitalsCrossErrors({ ...EMPTY_VITALS, weightLb: 1500, heightIn: 10 })).toEqual({ bmi: 'El peso y la estatura dan un IMC inverosímil (debe estar entre 5 y 200).' });
    expect(vitalsCrossErrors({ ...EMPTY_VITALS, weightLb: 152, heightIn: 66 })).toEqual({});
  });

  it('la diastólica debe ser menor que la sistólica', () => {
    expect(vitalsCrossErrors({ ...EMPTY_VITALS, systolic: 120, diastolic: 135 })).toEqual({ diastolic: 'La diastólica debe ser menor que la sistólica.' });
    expect(vitalsCrossErrors({ ...EMPTY_VITALS, systolic: 120, diastolic: 120 }).diastolic).toBeDefined();
    expect(vitalsCrossErrors({ ...EMPTY_VITALS, systolic: 120, diastolic: 80 })).toEqual({});
  });

  it('«Enviar al proveedor» exige peso o presión completa (ADR 0003)', () => {
    expect(hasRequiredVitals(null)).toBe(false);
    expect(hasRequiredVitals({ weightLb: null, systolic: 120, diastolic: null })).toBe(false);
    expect(hasRequiredVitals({ weightLb: null, systolic: 120, diastolic: 80 })).toBe(true);
    expect(hasRequiredVitals({ weightLb: 152, systolic: null, diastolic: null })).toBe(true);
  });

  it('se envían solo los campos cambiados, con la versión del registro', () => {
    expect(saveVitalsSchema.parse({ changes: { weightLb: 152, pulse: null }, expectedVersion: 0 })).toEqual({ changes: { weightLb: 152, pulse: null }, expectedVersion: 0 });
    expect(() => saveVitalsSchema.parse({ changes: { otro: 1 }, expectedVersion: 0 })).toThrow();
  });
});

describe('valoración (S-CLI-15, ADR 0036 y 0040)', () => {
  it('alergias: registradas con texto, sin alergias conocidas o no registradas', () => {
    expect(allergyStatusOf('Penicilina', false)).toBe('recorded');
    expect(allergyStatusOf('Penicilina', true)).toBe('recorded');
    expect(allergyStatusOf('   ', true)).toBe('none_known');
    expect(allergyStatusOf(null, false)).toBe('not_recorded');
  });

  it('máximo 4000 caracteres por apartado', () => {
    const base = { allergyStatus: 'not_recorded', history: {}, visit: {}, historyVersion: 0, assessmentVersion: 0 } as const;
    expect(saveAssessmentSchema.safeParse({ ...base, visit: { symptoms: 'x'.repeat(4000) } }).success).toBe(true);
    const tooLong = saveAssessmentSchema.safeParse({ ...base, visit: { symptoms: 'x'.repeat(4001) } });
    expect(tooLong.success).toBe(false);
    expect(tooLong.error?.issues[0]?.message).toBe('Máximo 4000 caracteres.');
  });
});

describe('bloqueo y excepción', () => {
  it('se escribe hasta «Procedimiento pendiente»; en Caja, bloqueado; cerrada, cerrada', () => {
    expect(VISIT_STATUSES.map((s) => [s, nursingLock(s)])).toEqual([
      ['CHECKED_IN', null],
      ['WAITING_FOR_NURSE', null],
      ['WITH_NURSE', null],
      ['WAITING_FOR_PROVIDER', null],
      ['WITH_PROVIDER', null],
      ['PROCEDURE_PENDING', null],
      ['READY_FOR_CHECKOUT', 'checkout'],
      ['CHECKOUT', 'checkout'],
      ['COMPLETED', 'closed'],
      ['LEFT_EARLY', 'closed'],
      ['CANCELLED', 'closed'],
    ]);
  });

  it('la excepción lleva motivo (máx. 500)', () => {
    expect(sendToProviderSchema.safeParse({ expectedVersion: 3 }).success).toBe(true);
    expect(sendToProviderSchema.safeParse({ expectedVersion: 3, reason: '  ' }).success).toBe(false);
    expect(sendToProviderSchema.safeParse({ expectedVersion: 3, reason: 'x'.repeat(501) }).success).toBe(false);
  });
});
