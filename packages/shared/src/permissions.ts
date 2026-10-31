// Única fuente de roles y permisos (CLAUDE.md, regla 2). El frontend oculta;
// el backend autoriza siempre. Este catálogo crece con cada fase: en la fase 1
// solo existen los permisos de identidad.

/** Roles por sede (membership_roles). Contabilidad no entra en V1 (ADR 0025, P-04). */
export const ROLES = ['propietario', 'administrador', 'recepcion', 'enfermeria', 'proveedor'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'members.invite',
  'members.manage',
  // Administración › Sedes (S-ADM-10 a 12, T-007).
  'locations.manage',
  // Administración › Catálogos y precios (S-ADM-13 a 20, T-011). Leer lo
  // activo no necesita permiso: lo usan las citas y las órdenes.
  'catalog.manage',
  // Acceso a cada destino del menú (T-004). Salen de la tabla «Destinos del
  // menú» del manual (docs/manual/README.md, «Los cuatro roles»). Cada fase
  // los afinará en permisos de acción.
  'panel.view',
  'patients.access',
  // S-PAC-02 «Crear paciente» (T-012): Recepción. Buscar y ver: patients.access.
  'patients.create',
  'appointments.access',
  'nursing_queue.access',
  'provider_queue.access',
  'orders_queue.access',
  'checkout.access',
  'reports.location',
  'admin.access',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Roles que exigen MFA (ADR 0021). La regla la aplica el guard de la API. */
export const MFA_REQUIRED_ROLES: readonly Role[] = ['propietario', 'administrador'];

/** Roles que se pueden asignar a toda la organización (location_id nulo). */
export const ORG_WIDE_ROLES: readonly Role[] = ['propietario', 'administrador'];

// Propietario y Administrador son roles administrativos: ningún permiso
// clínico implícito (docs/architecture.md, «Permisos»). Para ver la parte
// clínica necesitan además un rol clínico en la sede. Por eso, a diferencia del
// manual, su menú es solo «Administración».
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  propietario: ['members.invite', 'members.manage', 'locations.manage', 'catalog.manage', 'admin.access'],
  administrador: ['members.invite', 'members.manage', 'locations.manage', 'catalog.manage', 'admin.access'],
  recepcion: ['panel.view', 'patients.access', 'patients.create', 'appointments.access', 'checkout.access', 'reports.location'],
  enfermeria: ['panel.view', 'patients.access', 'nursing_queue.access', 'orders_queue.access'],
  proveedor: [
    'panel.view',
    'patients.access',
    'appointments.access',
    'nursing_queue.access',
    'provider_queue.access',
    'orders_queue.access',
  ],
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

/** Roles que la persona puede asignar, en el orden del catálogo (chips de S-ADM-03 y S-ADM-06). */
export function assignableRoles(actorRoles: Iterable<Role>): Role[] {
  const actor = [...actorRoles];
  return ROLES.filter((role) => canAssignRole(actor, role));
}

/**
 * Roles y sedes de S-ADM-03 / S-ADM-06 → asignaciones por sede: los roles
 * administrativos van a toda la organización (sede nula) y los clínicos, a
 * cada sede elegida. Sin un rol clínico no hacen falta sedes.
 */
export function assignmentsFor(
  roles: Iterable<Role>,
  locationIds: Iterable<string>,
): { role: Role; locationId: string | null }[] {
  const unique = [...new Set(roles)];
  const locations = [...new Set(locationIds)];
  return ROLES.filter((role) => unique.includes(role)).flatMap((role): { role: Role; locationId: string | null }[] =>
    ORG_WIDE_ROLES.includes(role) ? [{ role, locationId: null }] : locations.map((locationId) => ({ role, locationId })),
  );
}

/** ¿Hay algún rol clínico (que necesita sede)? */
export function needsLocation(roles: Iterable<Role>): boolean {
  return [...roles].some((role) => !ORG_WIDE_ROLES.includes(role));
}
