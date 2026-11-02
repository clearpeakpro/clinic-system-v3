import type { KioskMatch } from '@clinic/shared';
import { ApiError } from './api.ts';
import { userActionMessage } from './users.ts';

// Llegadas del kiosco en Recepción (T-021; S-REC-28): reglas de la bandeja y
// del paso previo del asistente, sin React, para probarlas aparte.

/** «(***) ***-0142»: en la bandeja, solo los 4 últimos dígitos (completo al confirmar). */
export function maskedPhone(digits: string): string {
  return `(***) ***-${digits.slice(-4)}`;
}

/** Ids nuevos respecto a la lectura anterior. En la primera lectura no hay «nuevos» (no suena al abrir el Panel). */
export function newArrivalIds(known: ReadonlySet<string> | null, ids: readonly string[]): string[] {
  if (known === null) return [];
  return ids.filter((id) => !known.has(id));
}

/** Qué coincide de una candidata, en palabras: «Nombre, fecha de nacimiento y teléfono». */
export function matchText(m: KioskMatch['matches']): string {
  const parts = [m.name ? 'nombre' : null, m.birthDate ? 'fecha de nacimiento' : null, m.phone ? 'teléfono' : null].filter((p): p is string => p !== null);
  if (parts.length === 0) return '';
  const text = parts.length === 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} y ${parts.at(-1) ?? ''}`;
  return `Coincide: ${text}`;
}

const MESSAGES: Record<string, string> = {
  kiosk_checkin_resolved: 'Este registro del kiosco ya se confirmó o se descartó.',
  kiosk_checkin_expired: 'Este registro del kiosco venció al cierre del día. Registre la llegada sin cita.',
  kiosk_checkin_not_found: 'No se encontró el registro del kiosco en esta sede.',
};

export function kioskArrivalMessage(error: unknown): string {
  if (error instanceof ApiError && MESSAGES[error.code]) return MESSAGES[error.code] ?? '';
  return userActionMessage(error);
}
