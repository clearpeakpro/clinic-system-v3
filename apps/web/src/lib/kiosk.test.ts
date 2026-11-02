import { describe, expect, it } from 'vitest';
import { KIOSK_TEXTS } from './kiosk-texts.ts';
import { daysInMonth, draftBirthDate, EMPTY_KIOSK_DRAFT, idleState, isDraftEmpty, kioskErrors, kioskInput, typedPhone, type KioskDraft } from './kiosk.ts';

// T-020: el formulario del kiosco sin React. Datos ficticios.

const TODAY = '2026-11-05';
const full: KioskDraft = {
  firstName: 'Mariana',
  lastName: 'Sotomayor Reyes',
  month: '5',
  day: '14',
  year: '1988',
  phone: '(214) 555-0101',
  firstVisit: true,
  reason: 'sick',
  symptoms: '',
};

describe('kiosco en la web (T-020)', () => {
  it('arma la fecha y el teléfono como se teclean', () => {
    expect(draftBirthDate(full)).toBe('1988-05-14');
    expect(draftBirthDate({ month: '5', day: '14', year: '88' })).toBeNull();
    expect(['2', '214', '2145', '214555', '2145550101', '21455501019'].map(typedPhone)).toEqual(['2', '214', '(214) 5', '(214) 555', '(214) 555-0101', '(214) 555-0101']);
    expect(daysInMonth('2', '2024')).toBe(29);
    expect(daysInMonth('2', '2023')).toBe(28);
    expect(daysInMonth('', '')).toBe(31);
  });

  it('errores en el idioma elegido; un borrador completo se envía', () => {
    const es = kioskErrors(EMPTY_KIOSK_DRAFT, TODAY, KIOSK_TEXTS.es);
    expect(Object.keys(es).sort()).toEqual(['birthDate', 'firstName', 'firstVisit', 'lastName', 'phone', 'reason']);
    expect(es.firstName).toBe('Este dato es obligatorio.');
    expect(kioskErrors(EMPTY_KIOSK_DRAFT, TODAY, KIOSK_TEXTS.en).firstVisit).toBe('Please choose an option.');
    expect(kioskErrors({ ...full, phone: '555-01' }, TODAY, KIOSK_TEXTS.es).phone).toBe('Ingrese un teléfono de 10 dígitos.');
    expect(kioskErrors({ ...full, month: '2', day: '30' }, TODAY, KIOSK_TEXTS.es).birthDate).toBe('Revise la fecha de nacimiento.');
    expect(kioskErrors({ ...full, month: '11', day: '6', year: '2026' }, TODAY, KIOSK_TEXTS.en).birthDate).toBe('The date of birth cannot be after today.');
    expect(kioskErrors(full, TODAY, KIOSK_TEXTS.es)).toEqual({});
    expect(kioskInput(full)).toEqual(expect.objectContaining({ birthDate: '1988-05-14', phone: '(214) 555-0101', reason: 'sick', firstVisit: true }));
    expect(kioskInput({ ...full, reason: null })).toBeNull();
    expect(isDraftEmpty(EMPTY_KIOSK_DRAFT)).toBe(true);
    expect(isDraftEmpty(full)).toBe(false);
  });

  it('inactividad: aviso los últimos 10 s y borrado a los 60 s', () => {
    expect(idleState(0, 49_000)).toEqual({ kind: 'active' });
    expect(idleState(0, 50_000)).toEqual({ kind: 'warning', secondsLeft: 10 });
    expect(idleState(0, 59_500)).toEqual({ kind: 'warning', secondsLeft: 1 });
    expect(idleState(0, 60_000)).toEqual({ kind: 'expired' });
  });

  it('los dos idiomas tienen los mismos textos', () => {
    expect(Object.keys(KIOSK_TEXTS.en).sort()).toEqual(Object.keys(KIOSK_TEXTS.es).sort());
    expect(KIOSK_TEXTS.en.months).toHaveLength(12);
  });
});
