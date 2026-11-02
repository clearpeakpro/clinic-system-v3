import { EMPTY_VITALS, type NursingQueueRow, type PatientHistoryView, type VisitAssessmentView } from '@clinic/shared';
import { describe, expect, it } from 'vitest';
import {
  assessmentDirty,
  assessmentDraft,
  assessmentErrors,
  assessmentInput,
  bmiPreview,
  heightText,
  parseVital,
  queueCounts,
  queueRows,
  queueSubtitle,
  readVitalsDraft,
  vitalsChanges,
  vitalsDraft,
  withHeightMode,
} from './nursing.ts';

// T-022: borradores de los formularios de enfermería y filtros de la cola.

describe('signos vitales', () => {
  it('texto → número con los mensajes del manual', () => {
    expect(parseVital('weightLb', '')).toEqual({ value: null, error: null });
    expect(parseVital('weightLb', '152,5')).toEqual({ value: 152.5, error: null });
    expect(parseVital('weightLb', 'abc').error).toBe('Ingrese un número (hasta 2 decimales).');
    expect(parseVital('pulse', '72.5').error).toBe('Ingrese un número entero.');
    expect(parseVital('spo2', '101').error).toBe('Debe estar entre 50 y 100.');
  });

  it('estatura en ft / in: pulgadas menores que 12 con pies; total entre 10 y 108; convertir al cambiar de modo', () => {
    const draft = vitalsDraft(null);
    expect(readVitalsDraft({ ...draft, feet: '5', inches: '6' }).values.heightIn).toBe(66);
    expect(readVitalsDraft({ ...draft, feet: '5', inches: '12' }).errors.inches).toBe('Las pulgadas deben ser menores que 12 cuando se indican pies.');
    expect(readVitalsDraft({ ...draft, feet: '10', inches: '' }).errors.feet).toBe('Debe estar entre 0 y 9.');
    expect(readVitalsDraft({ ...draft, feet: '0', inches: '9' }).errors.heightIn).toBe('Debe estar entre 10 y 108.');
    const inches = withHeightMode({ ...draft, feet: '5', inches: '6.5' }, 'in');
    expect(inches.heightTotal).toBe('66.5');
    expect(withHeightMode(inches, 'ftin')).toMatchObject({ feet: '5', inches: '6.5' });
    expect(vitalsDraft({ ...EMPTY_VITALS, heightIn: 66 })).toMatchObject({ feet: '5', inches: '6', heightTotal: '66' });
  });

  it('presión, IMC de vista previa y solo los cambios (vaciar borra)', () => {
    const draft = vitalsDraft({ ...EMPTY_VITALS, weightLb: 152, heightIn: 66, pain: 3 });
    expect(draft).toMatchObject({ painOn: true, pain: 3 });
    const read = readVitalsDraft({ ...draft, text: { ...draft.text, systolic: '120', diastolic: '135' } });
    expect(read.errors.diastolic).toBe('La diastólica debe ser menor que la sistólica.');
    expect(bmiPreview(read.values)).toBe(24.5);
    const cleared = readVitalsDraft({ ...draft, text: { ...draft.text, weightLb: '' }, painOn: false });
    expect(vitalsChanges({ ...EMPTY_VITALS, weightLb: 152, heightIn: 66, pain: 3 }, cleared.values)).toEqual({ weightLb: null, pain: null });
    expect(heightText(66)).toBe('5\' 6" (66 in)');
  });
});

describe('valoración', () => {
  const history: PatientHistoryView = {
    allergyStatus: 'recorded',
    fields: { allergies: 'Penicilina ficticia', personalHistory: null, familyHistory: null, surgeries: null, lifestyle: null, reproductiveHistory: null },
    version: 2,
    recordedAt: '2026-11-05T16:00:00Z',
  };
  const visit: VisitAssessmentView = { fields: { symptoms: null, nursingNotes: null }, version: 0, updatedAt: null };

  it('solo los apartados cambiados, recortados, con las dos versiones', () => {
    const draft = assessmentDraft(history, visit);
    expect(assessmentDirty(draft, history, visit)).toBe(false);
    const next = { ...draft, text: { ...draft.text, symptoms: '  Tos ficticia  ', surgeries: ' ' } };
    expect(assessmentInput(next, history, visit)).toEqual({ allergyStatus: 'recorded', history: {}, visit: { symptoms: 'Tos ficticia' }, historyVersion: 2, assessmentVersion: 0 });
  });

  it('«Sin alergias conocidas» es un estado distinto de «no registradas» (ADR 0040)', () => {
    const draft = assessmentDraft(history, visit);
    const none = { text: { ...draft.text, allergies: '' }, noneKnown: true };
    expect(assessmentInput(none, history, visit)).toMatchObject({ allergyStatus: 'none_known', history: { allergies: null } });
    const unknown = { text: { ...draft.text, allergies: '' }, noneKnown: false };
    expect(assessmentInput(unknown, history, visit).allergyStatus).toBe('not_recorded');
    const empty = assessmentDraft(null, null);
    expect(empty.noneKnown).toBe(false);
    expect(assessmentDirty({ ...empty, noneKnown: true }, null, null)).toBe(true);
  });

  it('máximo 4000 caracteres', () => {
    const draft = assessmentDraft(null, null);
    expect(assessmentErrors({ ...draft, text: { ...draft.text, nursingNotes: 'x'.repeat(4001) } })).toEqual({ nursingNotes: 'Máximo 4000 caracteres.' });
  });
});

describe('cola de enfermería', () => {
  const row = (id: string, status: NursingQueueRow['status'], firstName: string): NursingQueueRow => ({
    id,
    code: `NOR1-V-00000${id}`,
    status,
    route: status === 'PROCEDURE_PENDING' ? 'INJECTION_ONLY' : 'STANDARD',
    version: 2,
    arrivedAt: '2026-11-05T16:00:00Z',
    statusSince: '2026-11-05T16:00:00Z',
    patient: { id: `p${id}`, code: `NOR1-P-00000${id}`, firstName, lastName: 'Ficticia' },
    provider: null,
    appointmentType: null,
    waitLevel: 'none',
  });
  const rows = [row('1', 'WAITING_FOR_NURSE', 'Ana'), row('2', 'WITH_NURSE', 'José'), row('3', 'PROCEDURE_PENDING', 'Rosa')];

  it('chips, búsqueda y subtítulo', () => {
    expect(queueCounts(rows)).toEqual({ all: 3, waiting: 1, with_nurse: 1, procedure: 1 });
    expect(queueRows(rows, 'with_nurse', '').map((r) => r.id)).toEqual(['2']);
    expect(queueRows(rows, 'all', 'jose').map((r) => r.id)).toEqual(['2']);
    expect(queueSubtitle(0)).toBe('Sin pacientes en espera');
    expect(queueSubtitle(1)).toBe('1 paciente en espera');
    expect(queueSubtitle(5)).toBe('5 pacientes en espera');
  });
});
