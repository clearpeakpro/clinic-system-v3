import { describe, expect, it } from 'vitest';
import { APP_VERSION, initials, rolesText, timezoneLabel } from './format.ts';

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
