import { describe, expect, it } from 'vitest';
import { formatKioskCode, kioskBirthDateError, kioskCheckinSchema, normalizeKioskCode } from '../src/kiosk.ts';

// T-020: el registro del kiosco y el código de vinculación. Datos ficticios.

const valid = {
  firstName: 'Mariana',
  lastName: 'Sotomayor Reyes',
  birthDate: '1988-05-14',
  phone: '(214) 555-0101',
  firstVisit: true,
  reason: 'sick',
  symptoms: '  Fiebre ficticia  ',
};

describe('kiosco (T-020)', () => {
  it('acepta el registro y normaliza teléfono y síntomas', () => {
    expect(kioskCheckinSchema.parse(valid)).toEqual({ ...valid, phone: '2145550101', symptoms: 'Fiebre ficticia' });
    expect(kioskCheckinSchema.parse({ ...valid, symptoms: undefined }).symptoms).toBe('');
  });

  it('rechaza lo obligatorio vacío, teléfonos que no son de EE. UU., fechas imposibles y motivos desconocidos', () => {
    for (const bad of [
      { firstName: '  ' },
      { lastName: '123' },
      { phone: '555-01' },
      { phone: '1145550101' },
      { birthDate: '1988-02-30' },
      { birthDate: '05/14/1988' },
      { birthDate: '1899-12-31' },
      { reason: 'surgery' },
      { firstVisit: 'yes' },
      { symptoms: 'x'.repeat(501) },
    ]) {
      expect(kioskCheckinSchema.safeParse({ ...valid, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('la fecha de nacimiento no puede ser posterior al día de la sede', () => {
    expect(kioskBirthDateError('2026-11-05', '2026-11-05')).toBeNull();
    expect(kioskBirthDateError('2026-11-06', '2026-11-05')).toBe('future');
    expect(kioskBirthDateError('2024-02-29', '2026-11-05')).toBeNull();
    expect(kioskBirthDateError('2023-02-29', '2026-11-05')).toBe('invalid');
  });

  it('el código de vinculación se normaliza sin caracteres que se confunden', () => {
    expect(normalizeKioskCode('k7q-4m2')).toBe('K7Q4M2');
    expect(normalizeKioskCode(' K7Q 4M2 ')).toBe('K7Q4M2');
    expect(normalizeKioskCode('K7Q4M')).toBeNull();
    expect(normalizeKioskCode('K0Q4M2')).toBeNull();
    expect(normalizeKioskCode('K1Q4M2')).toBeNull();
    expect(formatKioskCode('K7Q4M2')).toBe('K7Q-4M2');
  });
});
