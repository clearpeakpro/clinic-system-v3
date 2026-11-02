import { KIOSK_IDLE_SECONDS, KIOSK_IDLE_WARNING_SECONDS, KIOSK_SYMPTOMS_MAX, kioskBirthDateError, kioskCheckinSchema, phoneDigits, type KioskCheckinInput, type KioskReason } from '@clinic/shared';
import type { KioskTexts } from './kiosk-texts.ts';

// Kiosco en la web (T-020; S-KIO-01 y S-KIO-02): el borrador del formulario,
// sus errores, lo que se envía y la inactividad. Sin React y sin la hora del
// dispositivo (reciben `now` y `today`), para probarlo aparte. El borrador
// vive solo en memoria (ADR 0014): nada en el almacenamiento del navegador.

export interface KioskDraft {
  firstName: string;
  lastName: string;
  /** Mes 1–12 como texto ('' sin elegir), día y año como se teclean. */
  month: string;
  day: string;
  year: string;
  phone: string;
  firstVisit: boolean | null;
  reason: KioskReason | null;
  symptoms: string;
}

export const EMPTY_KIOSK_DRAFT: KioskDraft = { firstName: '', lastName: '', month: '', day: '', year: '', phone: '', firstVisit: null, reason: null, symptoms: '' };

export type KioskField = 'firstName' | 'lastName' | 'birthDate' | 'phone' | 'firstVisit' | 'reason' | 'symptoms';

/** aaaa-mm-dd con lo tecleado, o nulo si falta algo. */
export function draftBirthDate(draft: Pick<KioskDraft, 'month' | 'day' | 'year'>): string | null {
  const { month, day, year } = draft;
  if (!/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day) || !/^\d{4}$/.test(year)) return null;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** El teléfono con formato de EE. UU. mientras se teclea: «(214) 555-0101». */
export function typedPhone(text: string): string {
  const d = phoneDigits(text).slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Errores visibles del borrador, con los textos del idioma elegido. `today` es el día del dispositivo (el servidor lo vuelve a comprobar con el de la sede). */
export function kioskErrors(draft: KioskDraft, today: string, t: KioskTexts): Partial<Record<KioskField, string>> {
  const errors: Partial<Record<KioskField, string>> = {};
  for (const field of ['firstName', 'lastName'] as const) {
    const value = draft[field].trim();
    if (!value) errors[field] = t.errors.required;
    else if (!/\p{L}/u.test(value)) errors[field] = t.errors.name;
    else if (value.length > 80) errors[field] = t.errors.tooLong;
  }
  const birth = draftBirthDate(draft);
  if (!draft.month && !draft.day && !draft.year) errors.birthDate = t.errors.required;
  else if (!birth) errors.birthDate = t.errors.birthDate;
  else {
    const problem = kioskBirthDateError(birth, today);
    if (problem === 'future') errors.birthDate = t.errors.birthDateFuture;
    else if (problem) errors.birthDate = t.errors.birthDate;
  }
  const phone = phoneDigits(draft.phone);
  if (!phone) errors.phone = t.errors.required;
  else if (!/^[2-9]\d{9}$/.test(phone)) errors.phone = t.errors.phone;
  if (draft.firstVisit === null) errors.firstVisit = t.errors.choose;
  if (draft.reason === null) errors.reason = t.errors.choose;
  if (draft.symptoms.length > KIOSK_SYMPTOMS_MAX) errors.symptoms = t.errors.tooLong;
  return errors;
}

/** Lo que se envía; nulo si el borrador no es válido para el esquema compartido. */
export function kioskInput(draft: KioskDraft): KioskCheckinInput | null {
  const candidate = {
    firstName: draft.firstName,
    lastName: draft.lastName,
    birthDate: draftBirthDate(draft) ?? '',
    phone: draft.phone,
    firstVisit: draft.firstVisit,
    reason: draft.reason,
    symptoms: draft.symptoms,
  };
  return kioskCheckinSchema.safeParse(candidate).success ? (candidate as KioskCheckinInput) : null;
}

export function isDraftEmpty(draft: KioskDraft): boolean {
  return JSON.stringify(draft) === JSON.stringify(EMPTY_KIOSK_DRAFT);
}

/**
 * Inactividad (ADR 0014): sin tocar nada durante 60 s el formulario se borra;
 * los últimos 10 s se avisa con la cuenta regresiva.
 */
export type IdleState = { kind: 'active' } | { kind: 'warning'; secondsLeft: number } | { kind: 'expired' };

export function idleState(lastActivity: number, now: number): IdleState {
  const elapsed = Math.max(0, now - lastActivity) / 1000;
  if (elapsed >= KIOSK_IDLE_SECONDS) return { kind: 'expired' };
  const left = Math.ceil(KIOSK_IDLE_SECONDS - elapsed);
  if (left <= KIOSK_IDLE_WARNING_SECONDS) return { kind: 'warning', secondsLeft: left };
  return { kind: 'active' };
}

/** Días del mes elegido (para limitar el campo «Día»); 31 sin mes o año. */
export function daysInMonth(month: string, year: string): number {
  const m = Number(month);
  if (!m) return 31;
  const y = /^\d{4}$/.test(year) ? Number(year) : 2000;
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
