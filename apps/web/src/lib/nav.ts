import type { Permission } from '@clinic/shared';
import {
  BadgePercent,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  Gift,
  HeartPulse,
  LayoutDashboard,
  LineChart,
  type LucideIcon,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldCheck,
  Stethoscope,
  Users,
  UsersRound,
} from 'lucide-react';

// Menú del marco (S-GEN-12). Cada destino exige un permiso de
// packages/shared/src/permissions.ts: el menú se arma solo con los permisos
// que el servidor devuelve en /api/me para el contexto activo.

export interface NavItem {
  id: string;
  label: string;
  /** Segmento bajo /app/<SEDE>/ (clínica) o /admin/ (administración). */
  segment: string;
  section: 'clinic' | 'admin';
  permission: Permission;
  icon: LucideIcon;
}

export const NAV: readonly NavItem[] = [
  { id: 'panel', label: 'Panel', segment: 'panel', section: 'clinic', permission: 'panel.view', icon: LayoutDashboard },
  { id: 'pacientes', label: 'Pacientes', segment: 'pacientes', section: 'clinic', permission: 'patients.access', icon: UsersRound },
  { id: 'citas', label: 'Citas', segment: 'citas', section: 'clinic', permission: 'appointments.access', icon: CalendarDays },
  { id: 'cola-enfermeria', label: 'Cola de enfermería', segment: 'cola-enfermeria', section: 'clinic', permission: 'nursing_queue.access', icon: HeartPulse },
  { id: 'cola-proveedor', label: 'Cola de proveedor', segment: 'cola-proveedor', section: 'clinic', permission: 'provider_queue.access', icon: Stethoscope },
  { id: 'cola-ordenes', label: 'Cola de órdenes', segment: 'cola-ordenes', section: 'clinic', permission: 'orders_queue.access', icon: ClipboardList },
  { id: 'caja', label: 'Caja', segment: 'caja', section: 'clinic', permission: 'checkout.access', icon: ReceiptText },
  { id: 'reportes', label: 'Reportes', segment: 'reportes', section: 'clinic', permission: 'reports.location', icon: BarChart3 },
  { id: 'usuarios', label: 'Usuarios', segment: 'usuarios', section: 'admin', permission: 'admin.access', icon: Users },
  { id: 'sedes', label: 'Sedes', segment: 'sedes', section: 'admin', permission: 'locations.manage', icon: Building2 },
  { id: 'catalogos', label: 'Catálogos', segment: 'catalogos', section: 'admin', permission: 'catalog.manage', icon: BookOpen },
  { id: 'planes', label: 'Planes de membresía', segment: 'planes', section: 'admin', permission: 'admin.access', icon: BadgePercent },
  { id: 'bonos', label: 'Reglas de bono', segment: 'bonos', section: 'admin', permission: 'admin.access', icon: Gift },
  { id: 'reportes-compania', label: 'Reportes de la compañía', segment: 'reportes', section: 'admin', permission: 'admin.access', icon: LineChart },
  { id: 'auditoria', label: 'Auditoría', segment: 'auditoria', section: 'admin', permission: 'admin.access', icon: ScrollText },
  { id: 'configuracion', label: 'Configuración', segment: 'configuracion', section: 'admin', permission: 'admin.access', icon: Settings },
  { id: 'seguridad', label: 'Seguridad', segment: 'seguridad', section: 'admin', permission: 'admin.access', icon: ShieldCheck },
];

export function menuFor(permissions: readonly Permission[]): NavItem[] {
  const allowed = new Set(permissions);
  return NAV.filter((item) => allowed.has(item.permission));
}

export function pathFor(item: NavItem, locationCode: string): string {
  return item.section === 'admin' ? `/admin/${item.segment}` : `/app/${locationCode}/${item.segment}`;
}

/** Destino al entrar: el primero del menú (Panel para el personal clínico, Usuarios para la administración). */
export function landingPath(permissions: readonly Permission[], locationCode: string): string {
  const first = menuFor(permissions)[0];
  return first ? pathFor(first, locationCode) : '/sin-acceso';
}
