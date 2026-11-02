import { describe, expect, it } from 'vitest';
import { arrivalInput, emptyDraft, stepIssues } from './arrival.ts';
import { maskedPhone, matchText, newArrivalIds } from './kiosk-arrivals.ts';

// T-021: la bandeja del kiosco y la confirmación. Datos ficticios.

describe('llegadas del kiosco en la web (T-021)', () => {
  it('teléfono enmascarado en la bandeja y registros nuevos (no suena al abrir el Panel)', () => {
    expect(maskedPhone('2145550142')).toBe('(***) ***-0142');
    expect(newArrivalIds(null, ['a', 'b'])).toEqual([]);
    expect(newArrivalIds(new Set(['a']), ['a', 'b', 'c'])).toEqual(['b', 'c']);
    expect(newArrivalIds(new Set(['a', 'b']), ['b'])).toEqual([]);
  });

  it('qué coincide de cada candidata', () => {
    expect(matchText({ name: true, birthDate: true, phone: true })).toBe('Coincide: nombre, fecha de nacimiento y teléfono');
    expect(matchText({ name: false, birthDate: false, phone: true })).toBe('Coincide: teléfono');
    expect(matchText({ name: true, birthDate: false, phone: true })).toBe('Coincide: nombre y teléfono');
  });

  it('sin ruta preseleccionada, «Continuar» exige elegirla (ADR 0031); el registro va con la llegada', () => {
    const draft = { ...emptyDraft(null), identityVerified: true, siteConfirmed: true };
    expect(stepIssues('route', draft, true)).toEqual(['Elija una ruta de atención.']);
    expect(stepIssues('confirm', draft, true)).toContain('Elija una ruta de atención.');
    const chosen = { ...draft, route: 'LAB_ONLY' as const };
    expect(stepIssues('confirm', chosen, true)).toEqual([]);
    expect(arrivalInput(chosen, { kind: 'walk_in', patientId: 'p-1' }, 'k-1')).toMatchObject({ source: 'walk_in', route: 'LAB_ONLY', kioskCheckinId: 'k-1' });
    expect(arrivalInput(chosen, { kind: 'walk_in', patientId: 'p-1' })).not.toHaveProperty('kioskCheckinId');
  });
});
