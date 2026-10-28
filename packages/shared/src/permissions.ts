// Única fuente de roles y permisos (CLAUDE.md, regla 2). El frontend oculta;
// el backend autoriza siempre. Este catálogo crece con cada fase: en la fase 1
// solo existen los permisos de identidad.

/** Roles por sede (membership_roles). Contabilidad queda fuera hasta P-04. */
export const ROLES = ['propietario', 'administrador', 'recepcion', 'enfermeria', 'proveedor'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = ['members.invite', 'members.manage'] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Roles que exigen MFA (ADR 0021). La regla la aplica el guard de la API. */
export const MFA_REQUIRED_ROLES: readonly Role[] = ['propietario', 'administrador'];

/** Roles que se pueden asignar a toda la organización (location_id nulo). */
export const ORG_WIDE_ROLES: readonly Role[] = ['propietario', 'administrador'];

// Propietario y Administrador son roles administrativos: ningún permiso
// clínico implícito (docs/architecture.md, «Permisos»).
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  propietario: ['members.invite', 'members.manage'],
  administrador: ['members.invite', 'members.manage'],
  recepcion: [],
  enfermeria: [],
  proveedor: [],
};

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

// --- Regla escalonada de roles -------------------------------------------
//
// Propietario > Administrador > roles clínicos. Solo se asignan roles de rango
// ESTRICTAMENTE menor al propio, y solo se gestiona (quitar, desactivar,
// cambiar roles) a quien tiene rango estrictamente menor. Por eso:
//  - el Propietario asigna Administrador y roles clínicos;
//  - el Administrador asigna solo roles clínicos;
//  - nadie asigna Propietario por la API (el primero lo crea la semilla de
//    desarrollo; en producción, el operador con pnpm org:create, T-007);
//  - un Administrador no puede tocar a un Propietario ni a otro Administrador,
//    y un Propietario tampoco a otro Propietario.

const RANK: Record<Role, number> = {
  propietario: 3,
  administrador: 2,
  recepcion: 1,
  enfermeria: 1,
  proveedor: 1,
};

/** Rango de una persona en una organización: el mayor de sus roles (0 si ninguno). */
export function rankOf(roles: Iterable<Role>): number {
  let rank = 0;
  for (const role of roles) rank = Math.max(rank, RANK[role]);
  return rank;
}

/** ¿Puede quien tiene `actorRoles` asignar `role` a otra persona? */
export function canAssignRole(actorRoles: Iterable<Role>, role: Role): boolean {
  return RANK[role] < rankOf(actorRoles);
}

/** ¿Puede quien tiene `actorRoles` quitar, desactivar o cambiar los roles de quien tiene `targetRoles`? */
export function canManageMember(actorRoles: Iterable<Role>, targetRoles: Iterable<Role>): boolean {
  return rankOf(targetRoles) < rankOf(actorRoles);
}

/**
 * Cambio de roles completo: quien actúa debe poder gestionar a la persona con
 * sus roles actuales y asignar cada uno de los roles nuevos.
 */
export function canChangeRoles(
  actorRoles: Iterable<Role>,
  currentTargetRoles: Iterable<Role>,
  newTargetRoles: Iterable<Role>,
): boolean {
  const actor = [...actorRoles];
  return canManageMember(actor, currentTargetRoles) && [...newTargetRoles].every((role) => canAssignRole(actor, role));
}
