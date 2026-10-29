import { describe, expect, it } from 'vitest';
import { createLocationSchema, isIanaTimeZone, updateLocationSchema } from '../src/schemas.ts';

describe('sedes (S-ADM-11)', () => {
  it('código: de 2 a 8 caracteres, empieza por letra, solo A–Z y dígitos', () => {
    const base = { name: 'Sede', timezone: 'America/Chicago', address: null, phone: null };
    for (const code of ['LAN', 'NOR1', 'AB', 'ABCDEFG8']) expect(createLocationSchema.safeParse({ ...base, code }).success, code).toBe(true);
    for (const code of ['A', 'lan', '1AB', 'ABCDEFGHI', 'AB-1', 'ÑOR']) expect(createLocationSchema.safeParse({ ...base, code }).success, code).toBe(false);
  });

  it('zona horaria: solo nombres IANA', () => {
    for (const tz of ['America/Chicago', 'America/Argentina/Buenos_Aires', 'UTC', 'Europe/Madrid']) expect(isIanaTimeZone(tz), tz).toBe(true);
    for (const tz of ['Central', '+05:00', 'America/Nowhere', '', 'America/']) expect(isIanaTimeZone(tz), tz).toBe(false);
  });

  it('dirección y teléfono opcionales: en blanco se guardan como nulos; el código no se edita', () => {
    const parsed = updateLocationSchema.parse({ name: ' Sede ', timezone: 'America/Chicago', address: '  ', phone: '', expectedVersion: 1, code: 'X' });
    expect(parsed).toEqual({ name: 'Sede', timezone: 'America/Chicago', address: null, phone: null, expectedVersion: 1 });
    expect(updateLocationSchema.safeParse({ name: 'S', timezone: 'America/Chicago', address: 'x'.repeat(251), phone: null, expectedVersion: 1 }).success).toBe(false);
    expect(updateLocationSchema.safeParse({ name: 'S', timezone: 'America/Chicago', address: null, phone: '1'.repeat(31), expectedVersion: 1 }).success).toBe(false);
  });
});
