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
