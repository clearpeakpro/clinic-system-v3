import { z } from 'zod';
import { ROLES, type Role } from './permissions.ts';
import { reasonSchema } from './schemas.ts';

// Pacientes (T-012; S-PAC-01 a 04). La búsqueda usa un solo campo que
// interpreta lo que se escribe (ADR 0030): fecha de nacimiento, teléfono,
// código o palabras del nombre. La misma función la usan la web (para
// avisar antes de buscar) y la API (que valida otra vez).

export const PATIENT_NAME_MAX = 100;
export const REFERRAL_DETAILS_MAX = 500;
/** Resultados por página («Cargar más pacientes»). */
export const PATIENT_PAGE_SIZE = 20;
/** Una búsqueda solo por nombre exige al menos estas letras en total (sin espacios). */
export const PATIENT_NAME_MIN_LETTERS = 3;

export const PATIENT_QUERY_ERRORS = {
  empty: 'Escriba lo que quiere buscar.',
  invalid_date: 'Fecha no válida (use MMDDAAAA)',
  invalid_number: 'Escriba la fecha como MMDDAAAA o el teléfono con 10 dígitos.',
  repeated: 'Use una sola fecha de nacimiento y un solo teléfono.',
  name_too_short: 'Escriba al menos 3 letras del nombre o use la fecha de nacimiento, el teléfono o el código.',
} as const;
export type PatientQueryError = keyof typeof PATIENT_QUERY_ERRORS;

/** Lo que se busca, ya interpretado. Todo se combina con «Y». */
export interface PatientQuery {
  /** `P-000123`: búsqueda directa; si está, se ignora lo demás. */
  code?: string;
  /** `AAAA-MM-DD`. */
  birthDate?: string;
  /** 10 dígitos. */
  phone?: string;
  /** Palabras del nombre completo, en cualquier orden, parciales. */
  words: string[];
}

export type ParsedPatientQuery = { ok: true; query: PatientQuery } | { ok: false; error: PatientQueryError };

const CODE = /(?:^|[^A-Z0-9])P-?(\d{1,9})(?![0-9])/i;
const SEPARATED_DATE = /(?<![\d/-])(\d{1,2})[/-](\d{1,2})[/-](\d+)(?![\d/-])/;
const PHONE = /(?<!\d)(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/;

/** «p-123», «P000123» o un texto escaneado que lo contenga → `P-000123`. */
export function normalizePatientCode(text: string): string | null {
  const match = CODE.exec(text);
  return match?.[1] ? `P-${match[1].padStart(6, '0')}` : null;
}

/** Mes, día y año → `AAAA-MM-DD` si la fecha existe (año de 4 dígitos, desde 1900). */
function isoDate(month: string, day: string, year: string): string | null {
  if (year.length !== 4) return null;
  const m = Number(month);
  const d = Number(day);
  const y = Number(year);
  if (y < 1900 || m < 1 || m > 12 || d < 1) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/** Letras del texto sin contar espacios ni signos. */
function letterCount(words: readonly string[]): number {
  return words.join('').replace(/[^\p{L}]/gu, '').length;
}

/**
 * Interpreta el campo de búsqueda (ADR 0030):
 * - `P-000123` o un texto escaneado que lo contenga: código (búsqueda directa);
 * - 8 dígitos (MMDDAAAA) o una fecha con `/` o `-`: fecha de nacimiento;
 * - 10 dígitos o formato de teléfono: teléfono;
 * - el resto: palabras del nombre completo.
 * Solo con palabras, exige al menos 3 letras en total.
 */
export function parsePatientQuery(input: string): ParsedPatientQuery {
  let text = input.normalize('NFKC').trim();
  if (text === '') return { ok: false, error: 'empty' };
  const code = normalizePatientCode(text);
  if (code) return { ok: true, query: { code, words: [] } };

  const query: PatientQuery = { words: [] };
  const setDate = (value: string | null): PatientQueryError | null => {
    if (!value) return 'invalid_date';
    if (query.birthDate) return 'repeated';
    query.birthDate = value;
    return null;
  };

  for (let match = SEPARATED_DATE.exec(text); match; match = SEPARATED_DATE.exec(text)) {
    const error = setDate(isoDate(match[1] ?? '', match[2] ?? '', match[3] ?? ''));
    if (error) return { ok: false, error };
    text = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`;
  }
  for (let match = PHONE.exec(text); match; match = PHONE.exec(text)) {
    if (query.phone) return { ok: false, error: 'repeated' };
    query.phone = match[0].replace(/\D/g, '').slice(-10);
    text = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`;
  }
  for (const token of text.split(/\s+/).filter(Boolean)) {
    if (/^\d{8}$/.test(token)) {
      const error = setDate(isoDate(token.slice(0, 2), token.slice(2, 4), token.slice(4)));
      if (error) return { ok: false, error };
    } else if (/\d/.test(token)) {
      return { ok: false, error: 'invalid_number' };
    } else {
      const word = token.replace(/[^\p{L}'-]/gu, '');
      if (word !== '') query.words.push(word);
    }
  }
  if (!query.birthDate && !query.phone) {
    if (query.words.length === 0) return { ok: false, error: 'empty' };
    if (letterCount(query.words) < PATIENT_NAME_MIN_LETTERS) return { ok: false, error: 'name_too_short' };
  }
  return { ok: true, query };
}

/** Solo dígitos del teléfono. */
export function phoneDigits(text: string): string {
  return text.replace(/\D/g, '');
}

/** «(214) 555-0101»; con el 1 delante, «+1 (214) 555-0101»; si no, los dígitos. */
export function formatPhone(digits: string): string {
  const d = phoneDigits(digits);
  const us = (ten: string) => `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  if (d.length === 10) return us(d);
  if (d.length === 11 && d.startsWith('1')) return `+1 ${us(d.slice(1))}`;
  return d;
}

/** Edad en años cumplidos el día `today` (`AAAA-MM-DD`, en la zona de la sede). */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number];
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** «1 año» / «N años». */
export function ageLabel(years: number): string {
  return years === 1 ? '1 año' : `${String(years)} años`;
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
const personName = z
  .string()
  .transform((v) => v.normalize('NFKC').trim().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(1)
      .max(PATIENT_NAME_MAX)
      .refine((v) => !CONTROL.test(v)),
  );

export const searchPatientsSchema = z.object({
  q: z.string().max(200),
  offset: z.number().int().min(0).max(10_000).default(0),
});
export type SearchPatientsInput = z.input<typeof searchPatientsSchema>;

/**
 * S-PAC-02 «Nuevo paciente». `forceCreate`: «Crear de todos modos» en el aviso
 * fuerte (S-PAC-03); también acepta el teléfono compartido. `confirmSharedPhone`:
 * «Crear de todos modos» en el aviso del teléfono (ADR 0030).
 */
export const createPatientSchema = z
  .object({
    firstName: personName,
    lastName: personName,
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    phone: z
      .string()
      .transform(phoneDigits)
      .pipe(z.string().regex(/^\d{7,15}$/))
      .nullable(),
    referralSourceId: z.uuid().nullable(),
    referralDetails: z.string().trim().max(REFERRAL_DETAILS_MAX).nullable(),
    forceCreate: z.boolean().default(false),
    confirmSharedPhone: z.boolean().default(false),
  })
  .refine((v) => !v.referralDetails || v.referralSourceId !== null, { message: 'referral_details_without_source', path: ['referralDetails'] });
export type CreatePatientInput = z.input<typeof createPatientSchema>;
export type CreatePatientData = z.output<typeof createPatientSchema>;

export type PatientStatus = 'active' | 'inactive';

/** Una fila de la búsqueda (S-PAC-01) o el encabezado del perfil (S-PAC-05). */
export interface PatientSummary {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  phone: string | null;
  status: PatientStatus;
}

export interface PatientSearchResult {
  patients: PatientSummary[];
  total: number;
  /** Desplazamiento de la página siguiente; nulo si no hay más. */
  nextOffset: number | null;
  /** Hoy en la sede activa, para la edad. */
  today: string;
}

/** Candidato de «Posible paciente existente» (S-PAC-03). */
export interface DuplicateCandidate {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  birthDate: string;
}

/** Coincidencias que se muestran en el aviso del teléfono compartido (ADR 0030). */
export const PHONE_MATCHES_SHOWN = 3;

/** Respuesta del alta: el paciente nuevo. */
export interface CreatedPatient {
  id: string;
  code: string;
}

/** «Volver y corregir» en el aviso del teléfono: el teléfono solo va a la auditoría como HMAC. */
export const phoneSharedBackSchema = z.object({
  phone: z
    .string()
    .transform(phoneDigits)
    .pipe(z.string().regex(/^\d{7,15}$/)),
});
export type PhoneSharedBackInput = z.input<typeof phoneSharedBackSchema>;

// --- Excepción del ADR 0027: el Propietario se asigna roles clínicos -------

/** Roles clínicos que el Propietario puede asignarse a sí mismo. */
export const SELF_ASSIGNABLE_ROLES = ['recepcion', 'enfermeria', 'proveedor'] as const satisfies readonly Role[];

/** Sus roles clínicos completos (los que no vengan se quitan), con motivo. */
export const ownClinicalRolesSchema = z.object({
  roles: z
    .array(z.object({ role: z.enum(ROLES), locationId: z.uuid() }))
    .max(100),
  reason: reasonSchema,
  expectedVersion: z.number().int().positive(),
});
export type OwnClinicalRolesInput = z.infer<typeof ownClinicalRolesSchema>;
