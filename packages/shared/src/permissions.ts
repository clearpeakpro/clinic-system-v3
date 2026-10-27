// SOLO PARA LA PRUEBA T-002. El catálogo real de roles y permisos se define en
// la fase 1 (ver PENDIENTES P-04); no tomar esta lista como decisión.

export const ROLES = ['propietario', 'administrador', 'recepcion', 'enfermeria'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'patients.read',
  'members.invite',
  'members.manage',
  'kiosk.submit',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Roles que exigen MFA (ADR 0021, criterio 3). */
export const MFA_REQUIRED_ROLES: readonly Role[] = ['propietario', 'administrador'];

/** Roles que se pueden asignar a toda la organización (location_id nulo). */
export const ORG_WIDE_ROLES: readonly Role[] = ['propietario', 'administrador'];

// Propietario y Administrador no tienen acceso clínico implícito.
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  propietario: ['members.invite', 'members.manage'],
  administrador: ['members.invite', 'members.manage'],
  recepcion: ['patients.read'],
  enfermeria: ['patients.read'],
};

/** El token de kiosco solo tiene este permiso; ningún rol de persona lo tiene. */
export const KIOSK_PERMISSIONS: readonly Permission[] = ['kiosk.submit'];

export function permissionsFor(roles: Iterable<Role>): Set<Permission> {
  const result = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) result.add(permission);
  }
  return result;
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
