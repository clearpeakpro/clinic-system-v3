import type { EncounterCoverage } from '@clinic/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from './api.ts';
import {
  actorText,
  clockOffset,
  coverageDirty,
  coverageDraft,
  coverageDraftInput,
  coverageIssues,
  coverageRows,
  durationText,
  encounterMessage,
  isVersionConflict,
  movedText,
  REOPEN_BLOCKED_TEXT,
  VERSION_CONFLICT_TEXT,
  waitingTimes,
  withCoverageTerm,
} from './encounters.ts';

// T-018: lógica de la pantalla de la visita. Sin hora real: cada función
// recibe `now`. Datos ficticios.

const T0 = new Date('2026-11-04T17:00:00Z').getTime();
const iso = (ms: number) => new Date(ms).toISOString();

describe('mensajes de la visita', () => {
  it('los errores del servidor en «usted»', () => {
    expect(encounterMessage(new ApiError(409, 'invalid_transition'))).toBe('Esta transición no está permitida en el estado actual.');
    expect(encounterMessage(new ApiError(403, 'transition_not_owned'))).toBe('Su rol no realiza este paso.');
    expect(encounterMessage(new ApiError(409, 'encounter_closed'))).toBe('La visita ya está cerrada.');
    expect(encounterMessage(new ApiError(409, 'encounter_already_open'))).toBe(REOPEN_BLOCKED_TEXT);
    expect(encounterMessage(new ApiError(409, 'version_conflict'))).toBe(VERSION_CONFLICT_TEXT);
    expect(isVersionConflict(new ApiError(409, 'version_conflict'))).toBe(true);
    expect(isVersionConflict(new ApiError(409, 'invalid_transition'))).toBe(false);
  });

  it('aviso tras un cambio, con frase propia para los cierres', () => {
    expect(movedText('WAITING_FOR_NURSE')).toBe('Visita movida a Esperando enfermería.');
    expect(movedText('LEFT_EARLY')).toBe('Visita cerrada: el paciente se retiró.');
    expect(movedText('CANCELLED')).toBe('Visita cancelada.');
  });

  it('quién hizo el cambio', () => {
    expect(actorText({ kind: 'me', name: null })).toBe('Usted');
    expect(actorText({ kind: 'user', name: 'Persona Ficticia' })).toBe('Persona Ficticia');
    expect(actorText({ kind: 'user', name: null })).toBe('Personal');
    expect(actorText({ kind: 'kiosk', name: null })).toBe('Kiosco');
    expect(actorText({ kind: 'system', name: null })).toBe('Sistema');
  });
});

describe('cronómetros (S-CLI-05)', () => {
  it('duración en mm:ss y, desde una hora, h:mm:ss; nunca negativa', () => {
    expect(durationText(0)).toBe('00:00');
    expect(durationText(65_000)).toBe('01:05');
    expect(durationText(3_725_000)).toBe('1:02:05');
    expect(durationText(-5000)).toBe('00:00');
  });

  it('desfase con el servidor: la hora de la tableta no cuenta', () => {
    expect(clockOffset(iso(T0), T0 - 90_000)).toBe(90_000);
  });

  it('abierta: total desde el registro y tiempo en el estado; cerrada: fija hasta el cierre y sin tiempo en el estado', () => {
    const open = { status: 'WITH_NURSE' as const, arrivedAt: iso(T0), closedAt: null, statusSince: iso(T0 + 10 * 60_000) };
    expect(waitingTimes(open, T0 + 25 * 60_000)).toEqual({ total: '25:00', inStatus: '15:00' });
    const closed = { status: 'COMPLETED' as const, arrivedAt: iso(T0), closedAt: iso(T0 + 40 * 60_000), statusSince: iso(T0 + 40 * 60_000) };
    expect(waitingTimes(closed, T0 + 3 * 3_600_000)).toEqual({ total: '40:00', inStatus: null });
  });
});

describe('cobertura (S-CLI-11/12)', () => {
  const insurance: EncounterCoverage = { type: 'insurance', insurerName: 'Seguro Ficticio', memberId: 'MBR-1', term: 'copay', amountCents: 2550, coinsuranceBp: null, version: 3 };

  it('la tarjeta solo muestra lo informado, con formato de moneda o porcentaje', () => {
    expect(coverageRows(insurance)).toEqual([
      { label: 'Aseguradora', value: 'Seguro Ficticio' },
      { label: 'ID de miembro', value: 'MBR-1' },
      { label: 'Copago', value: '$25.50' },
    ]);
    expect(coverageRows({ ...insurance, memberId: null, term: 'coinsurance', amountCents: null, coinsuranceBp: 2050 })).toEqual([
      { label: 'Aseguradora', value: 'Seguro Ficticio' },
      { label: 'Coaseguro', value: '20.5 %' },
    ]);
    expect(coverageRows({ type: 'self_pay', insurerName: null, memberId: null, term: null, amountCents: null, coinsuranceBp: null, version: 1 })).toEqual([]);
  });

  it('el borrador parte de lo guardado; sin cambios no está sucio', () => {
    const draft = coverageDraft(insurance);
    expect(draft).toEqual({ type: 'insurance', insurerName: 'Seguro Ficticio', memberId: 'MBR-1', term: 'copay', value: '25.50' });
    expect(coverageDirty(draft, insurance)).toBe(false);
    expect(coverageDirty({ ...draft, value: '30' }, insurance)).toBe(true);
    expect(coverageDraft(null).type).toBe('self_pay');
  });

  it('validación con los mensajes de la llegada; cambiar de término vacía el valor', () => {
    const draft = coverageDraft(insurance);
    expect(coverageIssues(draft)).toEqual({});
    expect(coverageIssues({ ...draft, insurerName: ' ', value: '10,5' })).toEqual({ insurerName: 'Ingrese el nombre del seguro.', value: 'Ingrese un monto válido (hasta dos decimales).' });
    const percent = withCoverageTerm(draft, 'coinsurance');
    expect(percent.value).toBe('');
    expect(coverageIssues({ ...percent, value: '101' })).toEqual({ value: 'Ingrese un porcentaje entre 0 y 100.' });
    expect(coverageIssues({ ...draft, type: 'self_pay', insurerName: '' })).toEqual({});
  });

  it('se envían solo los campos del tipo elegido, como texto (el servidor convierte a centavos)', () => {
    expect(coverageDraftInput({ ...coverageDraft(insurance), type: 'self_pay' })).toEqual({ type: 'self_pay' });
    expect(coverageDraftInput({ type: 'insurance', insurerName: ' Seguro ', memberId: ' ', term: 'deductible', value: ' 100 ' })).toEqual({
      type: 'insurance',
      insurerName: 'Seguro',
      memberId: null,
      term: 'deductible',
      value: '100',
    });
  });
});
