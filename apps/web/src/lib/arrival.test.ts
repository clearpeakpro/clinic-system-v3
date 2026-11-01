import { describe, expect, it } from 'vitest';
import { ApiError } from './api.ts';
import {
  arrivalFailure,
  arrivalInput,
  arrivalSteps,
  canArrive,
  capitalizeWords,
  emptyDraft,
  INACTIVE_PATIENT_TEXT,
  notArrivableText,
  stepIssues,
  withTerm,
  type ArrivalDraft,
} from './arrival.ts';

// T-017: lógica del asistente de llegada (S-REC-20 a 26). Datos ficticios.

const ID = '019a3000-0000-7000-8000-00000000000a';
const ready = (over: Partial<ArrivalDraft> = {}): ArrivalDraft => ({ ...emptyDraft('STANDARD'), identityVerified: true, siteConfirmed: true, ...over });

describe('asistente de llegada', () => {
  it('5 pasos con Pago directo y 6 con Seguro', () => {
    expect(arrivalSteps({ coverage: 'self_pay' })).toEqual(['patient', 'site', 'route', 'coverage', 'confirm']);
    expect(arrivalSteps({ coverage: 'insurance' })).toEqual(['patient', 'site', 'route', 'coverage', 'payer', 'confirm']);
  });

  it('cada paso exige lo suyo; con la sede inactiva no se avanza', () => {
    expect(stepIssues('patient', emptyDraft('STANDARD'), true)).toEqual(['Verifique la identidad del paciente antes de continuar.']);
    expect(stepIssues('site', ready({ siteConfirmed: false }), true)).toEqual(['Confirme la sede antes de continuar.']);
    expect(stepIssues('site', ready(), false)).toEqual(['Esta sede está inactiva. No es posible registrar llegadas aquí.']);
    expect(stepIssues('route', ready(), true)).toEqual([]);
    expect(stepIssues('coverage', ready(), true)).toEqual([]);
  });

  it('datos del seguro: nombre y un valor válido para el término, como texto decimal', () => {
    const insurance = ready({ coverage: 'insurance' });
    expect(stepIssues('payer', insurance, true)).toEqual(['Ingrese el nombre del seguro.', 'Ingrese un monto válido (hasta dos decimales).']);
    expect(stepIssues('payer', { ...insurance, insurerName: 'Seguro', value: '25.00' }, true)).toEqual([]);
    expect(stepIssues('payer', { ...insurance, insurerName: 'Seguro', value: '25,00' }, true)).toEqual(['Ingrese un monto válido (hasta dos decimales).']);
    expect(stepIssues('payer', { ...insurance, insurerName: 'Seguro', term: 'coinsurance', value: '120' }, true)).toEqual(['Ingrese un porcentaje entre 0 y 100.']);
    expect(stepIssues('payer', { ...insurance, insurerName: 'Seguro', term: 'coinsurance', value: '20.5' }, true)).toEqual([]);
  });

  it('confirmar revalida todo: lo pendiente de cualquier paso impide enviar', () => {
    expect(stepIssues('confirm', ready(), true)).toEqual([]);
    expect(stepIssues('confirm', ready({ identityVerified: false, coverage: 'insurance', insurerName: 'S', value: 'x' }), true)).toEqual([
      'Verifique la identidad del paciente antes de continuar.',
      'Ingrese un monto válido (hasta dos decimales).',
    ]);
    // Con Pago directo, los datos del seguro que quedaran escritos no cuentan.
    expect(stepIssues('confirm', ready({ coverage: 'self_pay', value: 'x' }), true)).toEqual([]);
  });

  it('cambiar de término vacía el valor (20 de copago no pasa a ser 20 %)', () => {
    const draft = ready({ coverage: 'insurance', term: 'copay', value: '20' });
    expect(withTerm(draft, 'coinsurance')).toMatchObject({ term: 'coinsurance', value: '' });
    expect(withTerm(draft, 'copay')).toBe(draft);
  });

  it('nombre del seguro con mayúscula inicial por palabra', () => {
    expect(capitalizeWords('aseguradora ficticia uno')).toBe('Aseguradora Ficticia Uno');
    expect(capitalizeWords('ñandú ÉXITO de salud')).toBe('Ñandú ÉXITO De Salud');
  });

  it('lo que se envía: ruta elegida con cita (ADR 0005), tipo opcional sin cita y el valor tal como se escribió', () => {
    expect(arrivalInput(ready({ route: 'LAB_ONLY' }), { kind: 'appointment', appointmentId: ID, version: 3 })).toEqual({
      source: 'appointment',
      appointmentId: ID,
      expectedVersion: 3,
      route: 'LAB_ONLY',
      coverage: { type: 'self_pay' },
    });
    const walkIn = arrivalInput(ready({ coverage: 'insurance', insurerName: ' Seguro ', memberId: '  ', term: 'deductible', value: ' 100.5 ' }), {
      kind: 'walk_in',
      patientId: ID,
    });
    expect(walkIn).toEqual({
      source: 'walk_in',
      patientId: ID,
      appointmentTypeId: null,
      route: 'STANDARD',
      coverage: { type: 'insurance', insurerName: 'Seguro', memberId: null, term: 'deductible', value: '100.5' },
    });
  });

  it('solo Programada o Confirmada admiten la llegada, con frases correctas para el resto', () => {
    expect(canArrive('SCHEDULED') && canArrive('CONFIRMED')).toBe(true);
    expect(canArrive('ARRIVED') || canArrive('CANCELLED') || canArrive('NO_SHOW')).toBe(false);
    expect(notArrivableText('ARRIVED')).toBe('Ya se registró la llegada de esta cita.');
    expect(notArrivableText('CANCELLED')).toBe('Esta cita está cancelada y no admite registro de llegada.');
    expect(notArrivableText('NO_SHOW')).not.toContain('está No se presentó');
  });

  it('errores del servidor: mensaje y el enlace que da contexto', () => {
    expect(arrivalFailure(new ApiError(409, 'encounter_already_open', undefined, { encounterId: ID }))).toEqual({
      message: 'Esta acción no está permitida en el estado actual.',
      link: { kind: 'encounter', id: ID },
    });
    expect(arrivalFailure(new ApiError(409, 'patient_inactive', undefined, { patientId: ID }))).toEqual({
      message: INACTIVE_PATIENT_TEXT,
      link: { kind: 'patient', id: ID, label: 'Abrir perfil del paciente' },
    });
    expect(arrivalFailure(new ApiError(409, 'patient_merged', undefined, { principalId: ID })).link).toEqual({ kind: 'patient', id: ID, label: 'Abrir registro principal' });
    expect(arrivalFailure(new ApiError(409, 'version_conflict')).message).toBe('Este registro fue actualizado por otro usuario. Actualice para continuar.');
    expect(arrivalFailure(new ApiError(409, 'appointment_already_checked_in'))).toEqual({ message: 'Esta acción no está permitida en el estado actual.', link: null });
  });
});
