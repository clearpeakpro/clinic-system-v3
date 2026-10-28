// Formatos de presentación (S-GEN-30, ADR 0015). El dinero llega del servidor
// en centavos enteros; aquí solo se muestra o se convierte lo escrito a
// centavos. El navegador nunca suma importes (CLAUDE.md, regla 4).

const money = new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD' });

/** `123450` → «$1,234.50»; `-6000` → «-$60.00». */
export function formatMoney(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError('El importe debe ser un entero en centavos');
  return money.format(cents / 100);
}

/** Importe sin símbolo, para el campo de dinero: `123450` → «1,234.50». */
export function formatMoneyInput(cents: number): string {
  const digits = formatMoney(Math.abs(cents)).replace('$', '');
  return cents < 0 ? `-${digits}` : digits;
}

/**
 * Lo escrito en el campo de dinero → centavos, o `null` si no es un importe
 * válido. Acepta «1234.5», «1,234.50» y «$1,234.50»; como máximo 2 decimales y
 * comas de miles bien puestas.
 */
export function parseMoney(input: string, { allowNegative = false }: { allowNegative?: boolean } = {}): number | null {
  const text = input.trim().replace(/^\$/, '').trim();
  const match = /^(-)?\$?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const [, minus, whole = '', fraction = ''] = match;
  if (minus && !allowNegative) return null;
  const cents = Number(whole.replaceAll(',', '')) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return minus && cents !== 0 ? -cents : cents;
}

// Fechas y horas: siempre en la zona horaria de la sede (CLAUDE.md, regla 10).
// Se arman con los números que da Intl para esa zona y textos propios, para
// que el resultado no dependa de la versión de ICU del navegador.

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'] as const;

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const partFormats = new Map<string, Intl.DateTimeFormat>();

function partsIn(value: Date | string, timeZone: string): Parts {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) throw new RangeError('Fecha no válida');
  let format = partFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    });
    partFormats.set(timeZone, format);
  }
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(format.formatToParts(date).find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

/** «25 oct 2026» */
export function formatDate(value: Date | string, timeZone: string): string {
  const p = partsIn(value, timeZone);
  return `${String(p.day)} ${MONTHS[p.month - 1] ?? ''} ${String(p.year)}`;
}

/** «3:15 p. m.» (como en el manual y en Stitch). */
export function formatTime(value: Date | string, timeZone: string): string {
  const p = partsIn(value, timeZone);
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${String(hour12)}:${String(p.minute).padStart(2, '0')} ${p.hour < 12 ? 'a. m.' : 'p. m.'}`;
}

/** «25 oct 2026, 3:15 p. m.» */
export function formatDateTime(value: Date | string, timeZone: string): string {
  return `${formatDate(value, timeZone)}, ${formatTime(value, timeZone)}`;
}

/** ¿Cae `value` en el mismo día calendario que `now` en la zona de la sede? */
export function isTodayIn(value: Date | string, timeZone: string, now: Date = new Date()): boolean {
  const a = partsIn(value, timeZone);
  const b = partsIn(now, timeZone);
  return a.year === b.year && a.month === b.month && a.day === b.day;
}
