import { describe, expect, it } from 'vitest';
import { APP_VERSION, initials, notificationAge, rolesText, timezoneLabel } from './format.ts';

describe('format', () => {
  it('versión del pie con mayor.menor', () => {
    expect(APP_VERSION).toMatch(/^v\d+\.\d+$/);
  });

  it('zona horaria legible; una desconocida se muestra tal cual', () => {
    expect(timezoneLabel('America/Chicago')).toBe('Central');
    expect(timezoneLabel('Europe/Madrid')).toBe('Europe/Madrid');
  });

  it('iniciales de las dos primeras palabras', () => {
    expect(initials('Persona Recepción Norte')).toBe('PR');
    expect(initials('  ana  ')).toBe('A');
    expect(initials('')).toBe('');
  });

  it('roles en el orden del catálogo', () => {
    expect(rolesText(['enfermeria', 'recepcion'])).toBe('Recepción · Enfermería');
    expect(rolesText([])).toBe('');
  });
});

describe('antigüedad de un aviso (S-GEN-15)', () => {
  const now = Date.parse('2026-10-29T15:00:00Z');
  it('ahora, minutos, horas y días', () => {
    expect(notificationAge('2026-10-29T14:59:30Z', now)).toBe('Ahora mismo');
    expect(notificationAge('2026-10-29T15:00:05Z', now)).toBe('Ahora mismo');
    expect(notificationAge('2026-10-29T14:55:00Z', now)).toBe('hace 5 min');
    expect(notificationAge('2026-10-29T14:00:30Z', now)).toBe('hace 59 min');
    expect(notificationAge('2026-10-29T12:00:00Z', now)).toBe('hace 3 h');
    expect(notificationAge('2026-10-27T14:00:00Z', now)).toBe('hace 2 d');
  });
});
