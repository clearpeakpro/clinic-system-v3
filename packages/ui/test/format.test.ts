// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatMoney, formatMoneyInput, formatTime, isTodayIn, parseMoney } from '../src/format.ts';

const TZ = 'America/Chicago';

describe('dinero', () => {
  it('formatea centavos como $1,234.50', () => {
    expect(formatMoney(123450)).toBe('$1,234.50');
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(5)).toBe('$0.05');
    expect(formatMoney(100000000)).toBe('$1,000,000.00');
  });

  it('negativos (saldo a favor) con signo menos', () => {
    expect(formatMoney(-6000)).toBe('-$60.00');
    expect(formatMoneyInput(-6000)).toBe('-60.00');
  });

  it('solo acepta enteros en centavos', () => {
    expect(() => formatMoney(12.5)).toThrow(RangeError);
  });

  it('el campo da formato sin símbolo', () => {
    expect(formatMoneyInput(123450)).toBe('1,234.50');
  });

  it('convierte lo escrito a centavos', () => {
    expect(parseMoney('1234.5')).toBe(123450);
    expect(parseMoney('1,234.50')).toBe(123450);
    expect(parseMoney('$1,234.50')).toBe(123450);
    expect(parseMoney(' 12 ')).toBe(1200);
    expect(parseMoney('0.05')).toBe(5);
    expect(parseMoney('0')).toBe(0);
  });

  it('rechaza importes mal escritos', () => {
    for (const bad of ['', 'abc', '1.234', '12,34', '1,2345.00', '1.2.3', '12.', '.5', '1e3', '12 34']) {
      expect(parseMoney(bad), bad).toBeNull();
    }
  });

  it('negativos solo si el campo los permite', () => {
    expect(parseMoney('-25.00')).toBeNull();
    expect(parseMoney('-25.00', { allowNegative: true })).toBe(-2500);
    expect(parseMoney('-0', { allowNegative: true })).toBe(0);
  });

  it('rechaza importes fuera del rango seguro', () => {
    expect(parseMoney('99999999999999999999')).toBeNull();
  });
});

describe('fecha y hora en la zona de la sede', () => {
  it('formato del manual: «25 oct 2026» y «3:15 p. m.»', () => {
    // 20:15 UTC = 3:15 p. m. en Chicago (horario de verano, UTC−5).
    expect(formatDate('2026-10-25T20:15:00Z', TZ)).toBe('25 oct 2026');
    expect(formatTime('2026-10-25T20:15:00Z', TZ)).toBe('3:15 p. m.');
    expect(formatDateTime('2026-10-25T15:35:00Z', TZ)).toBe('25 oct 2026, 10:35 a. m.');
  });

  it('medianoche y mediodía', () => {
    expect(formatTime('2026-10-25T05:00:00Z', TZ)).toBe('12:00 a. m.');
    expect(formatTime('2026-10-25T17:00:00Z', TZ)).toBe('12:00 p. m.');
  });

  it('cambio de horario: misma hora UTC, distinta hora local', () => {
    // Antes y después del 1 de noviembre de 2026 (fin del horario de verano).
    expect(formatTime('2026-10-31T15:00:00Z', TZ)).toBe('10:00 a. m.');
    expect(formatTime('2026-11-02T15:00:00Z', TZ)).toBe('9:00 a. m.');
    // Inicio: 8 de marzo de 2026.
    expect(formatTime('2026-03-07T15:00:00Z', TZ)).toBe('9:00 a. m.');
    expect(formatTime('2026-03-09T15:00:00Z', TZ)).toBe('10:00 a. m.');
  });

  it('la fecha es la de la sede, no la de UTC', () => {
    // 03:30 UTC del 26 = 10:30 p. m. del 25 en Chicago.
    expect(formatDate('2026-10-26T03:30:00Z', TZ)).toBe('25 oct 2026');
    expect(formatDate('2026-09-10T18:00:00Z', TZ)).toBe('10 sept 2026');
  });

  it('«hoy» cerca de la medianoche de la sede', () => {
    const now = new Date('2026-10-26T04:30:00Z'); // 11:30 p. m. del 25 en Chicago
    expect(isTodayIn('2026-10-25T06:00:00Z', TZ, now)).toBe(true); // 1:00 a. m. del 25
    expect(isTodayIn('2026-10-26T05:30:00Z', TZ, now)).toBe(false); // 12:30 a. m. del 26
    // El mismo instante en UTC ya es otro día.
    expect(isTodayIn('2026-10-26T04:30:00Z', 'UTC', new Date('2026-10-25T23:00:00Z'))).toBe(false);
  });

  it('rechaza fechas no válidas', () => {
    expect(() => formatDate('no-es-fecha', TZ)).toThrow(RangeError);
  });
});
