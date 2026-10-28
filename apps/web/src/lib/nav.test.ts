import { permissionsFor, type Role } from '@clinic/shared';
import { describe, expect, it } from 'vitest';
import { landingPath, menuFor, pathFor } from './nav.ts';

// El menú se arma con los permisos de packages/shared/src/permissions.ts
// (destinos del manual; Propietario y Administrador sin acceso clínico).

const labels = (roles: Role[]) => menuFor([...permissionsFor(roles)]).map((i) => i.label);

describe('menú por rol', () => {
  it('Recepción', () => {
    expect(labels(['recepcion'])).toEqual(['Panel', 'Pacientes', 'Citas', 'Caja', 'Reportes']);
  });

  it('Enfermería', () => {
    expect(labels(['enfermeria'])).toEqual(['Panel', 'Pacientes', 'Cola de enfermería', 'Cola de órdenes']);
  });

  it('Proveedor', () => {
    expect(labels(['proveedor'])).toEqual([
      'Panel',
      'Pacientes',
      'Citas',
      'Cola de enfermería',
      'Cola de proveedor',
      'Cola de órdenes',
    ]);
  });

  it('Propietario y Administrador: solo «Administración»', () => {
    for (const role of ['propietario', 'administrador'] as Role[]) {
      const items = menuFor([...permissionsFor([role])]);
      expect(items.every((i) => i.section === 'admin'), role).toBe(true);
      expect(items.map((i) => i.label)[0]).toBe('Usuarios');
    }
  });

  it('Administrador con un rol clínico en la sede ve ambas secciones (unión de roles)', () => {
    const items = menuFor([...permissionsFor(['administrador', 'recepcion'])]);
    expect(items.some((i) => i.section === 'clinic')).toBe(true);
    expect(items.some((i) => i.section === 'admin')).toBe(true);
  });

  it('sin permisos, sin menú', () => {
    expect(menuFor([])).toEqual([]);
    expect(landingPath([], 'NOR1')).toBe('/sin-acceso');
  });
});

describe('rutas', () => {
  it('destinos clínicos bajo /app/<SEDE>, administración bajo /admin', () => {
    const [panel] = menuFor(['panel.view']);
    const [usuarios] = menuFor(['admin.access']);
    if (!panel || !usuarios) throw new Error('faltan destinos');
    expect(pathFor(panel, 'NOR1')).toBe('/app/NOR1/panel');
    expect(pathFor(usuarios, 'NOR1')).toBe('/admin/usuarios');
  });

  it('el personal clínico aterriza en el Panel; la administración, en Usuarios', () => {
    expect(landingPath([...permissionsFor(['enfermeria'])], 'SUR2')).toBe('/app/SUR2/panel');
    expect(landingPath([...permissionsFor(['propietario'])], 'NOR1')).toBe('/admin/usuarios');
  });
});
