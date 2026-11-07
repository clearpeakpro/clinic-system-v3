import { describe, expect, it } from 'vitest';
import {
  combineHistories,
  HISTORY_FIELDS,
  isMergeConfirmation,
  mergePatientsSchema,
  permissionsFor,
  type HistoryField,
  type HistorySnapshot,
} from '../src/index.ts';

// T-030: fusionar pacientes (ADR 0032). La historia combinada y la
// confirmación. Datos ficticios.

const empty = (): Record<HistoryField, string | null> => Object.fromEntries(HISTORY_FIELDS.map((f) => [f, null])) as Record<HistoryField, string | null>;
const history = (allergyStatus: HistorySnapshot['allergyStatus'], fields: Partial<Record<HistoryField, string>> = {}): HistorySnapshot => ({
  allergyStatus,
  fields: { ...empty(), ...fields },
});

describe('historia combinada', () => {
  it('sin historia del duplicado no hace falta una versión nueva', () => {
    expect(combineHistories(history('recorded', { allergies: 'Penicilina' }), null, 'P-000123')).toBeNull();
    expect(combineHistories(null, null, 'P-000123')).toBeNull();
    // Un duplicado vacío tampoco añade nada.
    expect(combineHistories(null, history('not_recorded'), 'P-000123')).toBeNull();
    expect(combineHistories(history('none_known'), history('not_recorded'), 'P-000123')).toBeNull();
  });

  it('cada apartado: el que tiene texto, o los dos con la marca del registro fusionado', () => {
    const combined = combineHistories(
      history('not_recorded', { personalHistory: 'Hipertensión ficticia', surgeries: 'Apendicectomía ficticia' }),
      history('not_recorded', { personalHistory: 'Asma ficticia', familyHistory: 'Diabetes ficticia', surgeries: 'Apendicectomía ficticia' }),
      'P-000123',
    );
    expect(combined?.fields).toEqual({
      ...empty(),
      personalHistory: 'Hipertensión ficticia\n\nDel registro fusionado P-000123:\nAsma ficticia',
      familyHistory: 'Diabetes ficticia',
      // Iguales: una sola vez.
      surgeries: 'Apendicectomía ficticia',
    });
  });

  it('«Sin alergias conocidas» nunca tapa una alergia registrada', () => {
    const a = combineHistories(history('none_known'), history('recorded', { allergies: 'Penicilina' }), 'P-000123');
    expect(a).toEqual(history('recorded', { allergies: 'Penicilina' }));
    const b = combineHistories(history('recorded', { allergies: 'Sulfas' }), history('none_known'), 'P-000123');
    expect(b).toBeNull();
    const both = combineHistories(history('recorded', { allergies: 'Sulfas' }), history('recorded', { allergies: 'Penicilina' }), 'P-000123');
    expect(both?.allergyStatus).toBe('recorded');
    expect(both?.fields.allergies).toBe('Sulfas\n\nDel registro fusionado P-000123:\nPenicilina');
  });

  it('«Sin alergias conocidas» gana a «no registradas»', () => {
    expect(combineHistories(history('not_recorded'), history('none_known'), 'P-000123')).toEqual(history('none_known'));
    expect(combineHistories(null, history('none_known', { lifestyle: 'Camina a diario' }), 'P-000123')).toEqual(history('none_known', { lifestyle: 'Camina a diario' }));
  });
});

describe('confirmación y permiso', () => {
  it('«FUSIONAR» sin distinguir mayúsculas; «MERGE» ya no vale', () => {
    expect(isMergeConfirmation('FUSIONAR')).toBe(true);
    expect(isMergeConfirmation(' fusionar ')).toBe(true);
    expect(isMergeConfirmation('MERGE')).toBe(false);
    const base = { principalId: '01900000-0000-7000-8000-000000000001', principalVersion: 1, duplicateVersion: 2, reason: 'Mismo paciente ficticio' };
    expect(mergePatientsSchema.parse({ ...base, confirm: 'Fusionar' }).principalId).toBe(base.principalId);
    expect(() => mergePatientsSchema.parse({ ...base, confirm: 'MERGE' })).toThrow();
    expect(() => mergePatientsSchema.parse({ ...base, confirm: 'FUSIONAR', reason: '  ' })).toThrow();
  });

  it('solo el Propietario y el Administrador, y solo sirve con un rol clínico', () => {
    for (const role of ['recepcion', 'enfermeria', 'proveedor'] as const) expect(permissionsFor([role]).has('patients.merge'), role).toBe(false);
    for (const role of ['propietario', 'administrador'] as const) {
      expect(permissionsFor([role]).has('patients.merge'), role).toBe(true);
      expect(permissionsFor([role]).has('patients.access'), role).toBe(false);
    }
  });
});
