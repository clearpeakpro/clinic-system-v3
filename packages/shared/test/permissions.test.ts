import { describe, expect, it } from 'vitest';
import {
  assignableRoles,
  assignmentsFor,
  canAssignRole,
  canChangeRoles,
  canManageMember,
  needsLocation,
  permissionsFor,
  ROLES,
  type Role,
} from '../src/permissions.ts';

const CLINICAL: Role[] = ['recepcion', 'enfermeria', 'proveedor'];

describe('regla escalonada de roles', () => {
  it('nadie asigna Propietario', () => {
    for (const actor of ROLES) expect(canAssignRole([actor], 'propietario'), actor).toBe(false);
  });

  it('el Propietario asigna Administrador y roles clínicos', () => {
    for (const role of ['administrador', ...CLINICAL] as Role[]) {
      expect(canAssignRole(['propietario'], role), role).toBe(true);
    }
  });

  it('el Administrador asigna solo roles clínicos', () => {
    expect(canAssignRole(['administrador'], 'administrador')).toBe(false);
    for (const role of CLINICAL) expect(canAssignRole(['administrador'], role), role).toBe(true);
  });

  it('un rol clínico no asigna nada', () => {
    for (const actor of CLINICAL) {
      for (const role of ROLES) expect(canAssignRole([actor], role), `${actor}→${role}`).toBe(false);
    }
  });

  it('cuenta el mayor rol de quien actúa', () => {
    expect(canAssignRole(['recepcion', 'administrador'], 'enfermeria')).toBe(true);
  });

  it('un Administrador no gestiona a un Propietario ni a otro Administrador', () => {
    expect(canManageMember(['administrador'], ['propietario'])).toBe(false);
    expect(canManageMember(['administrador'], ['administrador'])).toBe(false);
    // Tampoco si además tiene un rol clínico.
    expect(canManageMember(['administrador'], ['recepcion', 'administrador'])).toBe(false);
    expect(canManageMember(['administrador'], ['recepcion'])).toBe(true);
  });

  it('un Propietario gestiona Administradores, pero no a otro Propietario', () => {
    expect(canManageMember(['propietario'], ['administrador'])).toBe(true);
    expect(canManageMember(['propietario'], ['propietario'])).toBe(false);
  });

  it('cambiar roles: no se puede subir a alguien a un rol igual o superior al propio', () => {
    expect(canChangeRoles(['administrador'], ['recepcion'], ['enfermeria'])).toBe(true);
    expect(canChangeRoles(['administrador'], ['recepcion'], ['administrador'])).toBe(false);
    expect(canChangeRoles(['propietario'], ['recepcion'], ['administrador'])).toBe(true);
    expect(canChangeRoles(['propietario'], ['administrador'], ['propietario'])).toBe(false);
    // Ni bajar a quien está por encima o al mismo nivel.
    expect(canChangeRoles(['administrador'], ['administrador'], ['recepcion'])).toBe(false);
  });
});

describe('permisos', () => {
  it('Propietario y Administrador solo tienen permisos administrativos (ninguno clínico)', () => {
    for (const role of ['propietario', 'administrador'] as Role[]) {
      // Fecha de nacimiento, inactivar (ADR 0009) y forzar el estado de una
      // visita (ADR 0033) solo sirven junto a patients.access, que exige un rol clínico (ADR 0027).
      expect([...permissionsFor([role])].sort(), role).toEqual([
        'admin.access',
        'catalog.manage',
        'locations.manage',
        'members.invite',
        'members.manage',
        'patients.deactivate',
        'patients.edit_birth_date',
        'visits.force_state',
      ]);
      expect(permissionsFor([role]).has('patients.access'), role).toBe(false);
    }
  });

  it('los roles clínicos no gestionan miembros ni entran a Administración', () => {
    const clinical = permissionsFor(CLINICAL);
    for (const p of ['members.invite', 'members.manage', 'locations.manage', 'catalog.manage', 'admin.access'] as const) expect(clinical.has(p), p).toBe(false);
  });

  it('destinos del menú según el manual', () => {
    expect([...permissionsFor(['recepcion'])].sort()).toEqual(
      ['appointments.access', 'appointments.check_in', 'appointments.manage', 'checkout.access', 'panel.view', 'patients.access', 'patients.create', 'patients.edit', 'reports.location', 'visits.manage'],
    );
    expect([...permissionsFor(['enfermeria'])].sort()).toEqual(
      ['nursing_queue.access', 'orders_queue.access', 'panel.view', 'patients.access'],
    );
    expect([...permissionsFor(['proveedor'])].sort()).toEqual(
      ['appointments.access', 'appointments.manage', 'nursing_queue.access', 'orders_queue.access', 'panel.view', 'patients.access', 'patients.edit_phone', 'provider_queue.access'],
    );
  });
});

describe('roles y sedes de S-ADM-03 / S-ADM-06 (T-006a)', () => {
  it('chips que ve cada uno', () => {
    expect(assignableRoles(['propietario'])).toEqual(['administrador', 'recepcion', 'enfermeria', 'proveedor']);
    expect(assignableRoles(['administrador'])).toEqual(['recepcion', 'enfermeria', 'proveedor']);
    expect(assignableRoles(['administrador', 'proveedor'])).toEqual(['recepcion', 'enfermeria', 'proveedor']);
    expect(assignableRoles(['recepcion'])).toEqual([]);
  });

  it('administrativos en toda la organización; clínicos en cada sede', () => {
    expect(assignmentsFor(['proveedor', 'administrador', 'recepcion'], ['a', 'b', 'a'])).toEqual([
      { role: 'administrador', locationId: null },
      { role: 'recepcion', locationId: 'a' },
      { role: 'recepcion', locationId: 'b' },
      { role: 'proveedor', locationId: 'a' },
      { role: 'proveedor', locationId: 'b' },
    ]);
    expect(assignmentsFor(['administrador'], [])).toEqual([{ role: 'administrador', locationId: null }]);
    expect(needsLocation(['administrador'])).toBe(false);
    expect(needsLocation(['administrador', 'enfermeria'])).toBe(true);
  });
});
