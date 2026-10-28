import { describe, expect, it } from 'vitest';
import {
  canAssignRole,
  canChangeRoles,
  canManageMember,
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
      expect([...permissionsFor([role])].sort(), role).toEqual(['admin.access', 'members.invite', 'members.manage']);
    }
  });

  it('los roles clínicos no gestionan miembros ni entran a Administración', () => {
    const clinical = permissionsFor(CLINICAL);
    for (const p of ['members.invite', 'members.manage', 'admin.access'] as const) expect(clinical.has(p), p).toBe(false);
  });

  it('destinos del menú según el manual', () => {
    expect([...permissionsFor(['recepcion'])].sort()).toEqual(
      ['appointments.access', 'checkout.access', 'panel.view', 'patients.access', 'reports.location'],
    );
    expect([...permissionsFor(['enfermeria'])].sort()).toEqual(
      ['nursing_queue.access', 'orders_queue.access', 'panel.view', 'patients.access'],
    );
    expect([...permissionsFor(['proveedor'])].sort()).toEqual(
      ['appointments.access', 'nursing_queue.access', 'orders_queue.access', 'panel.view', 'patients.access', 'provider_queue.access'],
    );
  });
});
