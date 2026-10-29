import type { Role } from '@clinic/shared';
import pkg from '../../package.json' with { type: 'json' };

// Textos de presentación del marco y de las pantallas de acceso.

/** Versión visible en el pie («v0.1»): mayor.menor de apps/web/package.json. */
export const APP_VERSION = `v${pkg.version.split('.').slice(0, 2).join('.')}`;

export const ROLE_LABELS: Record<Role, string> = {
  propietario: 'Propietario',
  administrador: 'Administrador',
  recepcion: 'Recepción',
  enfermeria: 'Enfermería',
  proveedor: 'Proveedor',
};

/** Roles activos en la sede, en el orden del catálogo: «Recepción · Enfermería». */
export function rolesText(roles: readonly Role[]): string {
  return (Object.keys(ROLE_LABELS) as Role[])
    .filter((r) => roles.includes(r))
    .map((r) => ROLE_LABELS[r])
    .join(' · ');
}

// Zonas horarias de EE. UU. con su nombre corriente; otra zona se muestra tal cual.
const TIMEZONE_LABELS: Record<string, string> = {
  'America/Chicago': 'Central',
  'America/New_York': 'Este',
  'America/Denver': 'Montaña',
  'America/Phoenix': 'Montaña (Arizona)',
  'America/Los_Angeles': 'Pacífico',
  'America/Anchorage': 'Alaska',
  'Pacific/Honolulu': 'Hawái',
};

export function timezoneLabel(timezone: string): string {
  return TIMEZONE_LABELS[timezone] ?? timezone;
}

/** Iniciales para el avatar (sin foto): primera letra de las dos primeras palabras. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w.charAt(0).toLocaleUpperCase('es'))
    .join('');
}

/**
 * Antigüedad de un aviso (S-GEN-15): «Ahora mismo», «hace {N} min»,
 * «hace {N} h» y, con el historial de 30 días, «hace {N} d».
 */
export function notificationAge(createdAt: string, now: number): string {
  const minutes = Math.floor(Math.max(0, now - new Date(createdAt).getTime()) / 60_000);
  if (minutes < 1) return 'Ahora mismo';
  if (minutes < 60) return `hace ${String(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${String(hours)} h`;
  return `hace ${String(Math.floor(hours / 24))} d`;
}
