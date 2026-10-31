import { PATIENT_QUERY_ERRORS, type PatientQueryError } from '@clinic/shared';
import { useSyncExternalStore } from 'react';
import { ApiError } from './api.ts';
import { userActionMessage } from './users.ts';

// Pacientes (S-PAC-01 a 05 y 11, T-012 y T-013). La búsqueda enviada vive
// solo en memoria (nunca en la URL ni en el almacenamiento del navegador, ADR
// 0014): la comparten la página Pacientes y «Buscar pacientes» de la
// cabecera, y se conserva al volver del perfil. Al cerrar sesión se borra con
// todo lo demás. «Incluir inactivos» se aplica con la búsqueda, no al marcarlo.

let submitted: string | null = null;
let includeInactive = false;
let version = 0;
const listeners = new Set<() => void>();

/** Lo último que se buscó, o nulo (estado inicial). */
const get = () => submitted;
/** Cambia con cada envío, aunque el texto sea el mismo (repetir la búsqueda). */
const getVersion = () => version;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const patientSearch = {
  get,
  submit(text: string | null, withInactive = false) {
    submitted = text;
    includeInactive = text !== null && withInactive;
    version += 1;
    for (const listener of listeners) listener();
  },
};

export function useSubmittedSearch(): { text: string | null; includeInactive: boolean; version: number } {
  const v = useSyncExternalStore(subscribe, getVersion);
  return { text: get(), includeInactive, version: v };
}

/** Mensaje bajo el campo de búsqueda; nulo para «vacío» (vuelve al estado inicial). */
export function queryErrorText(error: PatientQueryError): string | null {
  return error === 'empty' ? null : PATIENT_QUERY_ERRORS[error];
}

const MESSAGES: Record<string, string> = {
  invalid_birth_date: 'La fecha de nacimiento no puede ser futura.',
  identity_fields_locked: 'Su rol solo puede actualizar el teléfono.',
  birth_date_locked: 'Solo un Administrador o el Propietario puede cambiar la fecha de nacimiento.',
  patient_merged: 'Esta acción no está permitida en el estado actual.',
  patient_already_active: 'El paciente ya está activo.',
  patient_already_inactive: 'El paciente ya está inactivo.',
  invalid_referral_source: 'Esa fuente de referido ya no está activa. Elija otra.',
  patient_not_found: 'No se encontró el paciente.',
  invalid_request: 'Algunos campos no son válidos. Revíselos.',
};

export function patientMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (MESSAGES[error.code]) return MESSAGES[error.code] ?? '';
    const known = PATIENT_QUERY_ERRORS[error.code as PatientQueryError] as string | undefined;
    if (known) return known;
  }
  return userActionMessage(error);
}

/** «ML» para «María López García». */
export function patientInitials(firstName: string, lastName: string): string {
  return `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toLocaleUpperCase('es');
}
