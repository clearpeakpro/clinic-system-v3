import { describe, expect, it } from 'vitest';
import { ApiError } from './api.ts';
import { catalogMessage, formatDay, nextPriceText } from './catalog.ts';

// T-011: formatos y mensajes de Catálogos y precios.

describe('catálogo', () => {
  it('una fecha de vigencia no se corre de día por la zona horaria', () => {
    expect(formatDay('2026-01-01')).toBe('1 ene 2026');
    expect(formatDay('2026-10-31')).toBe('31 oct 2026');
  });

  it('el precio programado: «Desde 31 oct: $40.00»', () => {
    expect(nextPriceText({ amountCents: 4000, effectiveFrom: '2026-10-31' })).toBe('Desde 31 oct: $40.00');
    expect(nextPriceText({ amountCents: null, effectiveFrom: '2026-10-31' })).toBe('Desde 31 oct: usa el precio general');
  });

  it('mensajes de los errores del catálogo', () => {
    expect(catalogMessage(new ApiError(409, 'catalog_code_taken'))).toBe('Este registro ya existe.');
    expect(catalogMessage(new ApiError(400, 'effective_from_past'))).toBe('La fecha de vigencia no puede ser anterior a hoy en la sede.');
  });
});
