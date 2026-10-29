import { ORG_WIDE_ROLES, ROLES, type Role } from '@clinic/shared';
import { errorMessage, formatDateTime, formatTime } from '@clinic/ui';
import { ApiError, type Assignment, type UserRow, type UsersList } from './api.ts';
import { ROLE_LABELS } from './format.ts';

// Textos y cálculos de Administración › Usuarios (S-ADM-02 a 09).

export type UserStatus = 'invited' | 'active' | 'disabled';

export function statusOf(row: UserRow): UserStatus {
  if (row.kind === 'invitation') return 'invited';
  return row.status === 'active' ? 'active' : 'disabled';
}

export const STATUS_LABELS: Record<UserStatus, string> = {
  invited: 'Invitado',
  active: 'Activo',
  disabled: 'Deshabilitado',
};

/** Una línea por rol: «Proveedor · NOR1, NOR2» o «Administrador · Organización completa». */
export function assignmentLines(assignments: Assignment[], locations: UsersList['locations']): { role: Role; label: string; where: string }[] {
  return ROLES.flatMap((role) => {
    const own = assignments.filter((a) => a.role === role);
    if (own.length === 0) return [];
    const where = own.some((a) => a.locationId === null)
      ? 'Organización completa'
      : own
          .map((a) => locations.find((l) => l.id === a.locationId)?.code ?? '—')
          .sort()
          .join(', ');
    return [{ role, label: ROLE_LABELS[role], where }];
  });
}

/** Texto secundario bajo el nombre: «Recepción · Enfermería». */
export function roleSummary(assignments: Assignment[]): string {
  return rolesOf(assignments)
    .map((role) => ROLE_LABELS[role])
    .join(' · ');
}

/** Tarjetas de totales (S-ADM-02): conteos de la lista completa, sin filtros. */
export function userCounts(rows: UserRow[]): { total: number; active: number; invited: number; disabled: number } {
  const counts = { total: rows.length, active: 0, invited: 0, disabled: 0 };
  for (const row of rows) counts[statusOf(row)] += 1;
  return counts;
}

const dayKeys = new Map<string, Intl.DateTimeFormat>();

/** Día calendario en la zona de la sede, como número de días (para comparar «hoy» y «ayer»). */
function dayNumber(value: Date, timeZone: string): number {
  let format = dayKeys.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    dayKeys.set(timeZone, format);
  }
  const [y, m, d] = format.format(value).split('-').map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) / 86_400_000;
}

/**
 * Columna «Último acceso»: «Hoy, 7:45 a. m.», «Ayer, 6:10 p. m.»,
 * «25 oct 2026, 3:15 p. m.» o «Nunca». `now` es la hora en que se cargó la lista.
 */
export function lastAccessLabel(lastSignInAt: string | null, now: number, timeZone: string): string {
  if (!lastSignInAt) return 'Nunca';
  const at = new Date(lastSignInAt);
  const days = dayNumber(new Date(now), timeZone) - dayNumber(at, timeZone);
  if (days === 0) return `Hoy, ${formatTime(at, timeZone)}`;
  if (days === 1) return `Ayer, ${formatTime(at, timeZone)}`;
  return formatDateTime(at, timeZone);
}

/** Solo roles administrativos: sin acceso a la parte clínica (architecture.md, «Permisos»). */
export function withoutClinicalAccess(assignments: Assignment[]): boolean {
  return assignments.length > 0 && assignments.every((a) => ORG_WIDE_ROLES.includes(a.role));
}

export function rolesOf(assignments: Assignment[]): Role[] {
  return ROLES.filter((role) => assignments.some((a) => a.role === role));
}

export function locationIdsOf(assignments: Assignment[]): string[] {
  return [...new Set(assignments.flatMap((a) => (a.locationId ? [a.locationId] : [])))];
}

/** Conflicto de versión (regla 7): el aviso lleva la acción «Actualizar». */
export function isVersionConflict(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'version_conflict';
}

const MESSAGES: Record<string, string> = {
  version_conflict: 'Este registro fue actualizado por otro usuario. Actualice para continuar.',
  email_taken: 'Este registro ya existe.',
  account_shared:
    'Esta persona también trabaja en otra organización con la misma cuenta, así que este cambio no se puede hacer desde aquí. Pídalo al soporte de Clinic System.',
  membership_not_inactive: 'Solo se pueden reactivar usuarios deshabilitados. Actualice la lista.',
  membership_not_active: 'Esta acción solo está disponible para usuarios activos. Actualice la lista.',
  invitation_not_pending: 'Esta invitación ya no está pendiente. Actualice la lista.',
  invitation_not_found: 'Esta invitación ya no está pendiente. Actualice la lista.',
  cannot_modify_self: 'Esta acción no está permitida en el estado actual.',
  member_not_manageable: 'Esta acción no está permitida en el estado actual.',
  role_change_not_allowed: 'Esta acción no está permitida en el estado actual.',
  role_not_assignable: 'Esta acción no está permitida en el estado actual.',
  location_required: 'Seleccione al menos una sede.',
  invalid_location: 'Algunos campos no son válidos. Revíselos.',
  location_inactive: 'Esa sede está inactiva: elija otra o actívela en Sedes.',
};

export function userActionMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const text = MESSAGES[error.code];
    if (text) return text;
  }
  return errorMessage(error);
}
