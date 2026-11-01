import { describe, expect, it } from 'vitest';
import type { Role } from '../src/permissions.ts';
import {
  closeAction,
  encounterAbilities,
  forceTargets,
  isCloseAction,
  isDirectRoute,
  reopens,
  visitForce,
  isOpenVisitStatus,
  VISIT_ACTIONS,
  VISIT_ROUTES,
  VISIT_STATUSES,
  VISIT_TRANSITIONS,
  visitActions,
  visitTransition,
  type VisitAction,
  type VisitRoute,
  type VisitStatus,
} from '../src/visit.ts';

// T-017: máquina de estados de la visita (manual, «Estados de la visita»).
// Se prueba la tabla completa: cada combinación estado × acción × ruta es
// permitida (con su destino y su rol dueño) o prohibida.

const OPEN: VisitStatus[] = [
  'CHECKED_IN',
  'WAITING_FOR_NURSE',
  'WITH_NURSE',
  'WAITING_FOR_PROVIDER',
  'WITH_PROVIDER',
  'PROCEDURE_PENDING',
  'READY_FOR_CHECKOUT',
  'CHECKOUT',
];

/** La tabla del manual, escrita a mano: [desde, acción, hacia, roles, rutas]. */
type Row = [VisitStatus | null, VisitAction, VisitStatus, Role[], 'standard' | 'direct' | 'any'];
const EXPECTED: Row[] = [
  [null, 'check_in', 'CHECKED_IN', ['recepcion'], 'any'],
  ['CHECKED_IN', 'send_to_nurse', 'WAITING_FOR_NURSE', ['recepcion'], 'standard'],
  ['CHECKED_IN', 'send_to_procedure', 'PROCEDURE_PENDING', ['recepcion'], 'direct'],
  ['WAITING_FOR_NURSE', 'start_nursing', 'WITH_NURSE', ['enfermeria'], 'any'],
  ['WITH_NURSE', 'send_to_provider', 'WAITING_FOR_PROVIDER', ['enfermeria'], 'any'],
  ['WAITING_FOR_PROVIDER', 'start_consult', 'WITH_PROVIDER', ['proveedor'], 'any'],
  ['WITH_PROVIDER', 'send_to_procedure', 'PROCEDURE_PENDING', ['proveedor'], 'any'],
  ['WITH_PROVIDER', 'ready_for_checkout', 'READY_FOR_CHECKOUT', ['proveedor'], 'any'],
  ['PROCEDURE_PENDING', 'ready_for_checkout', 'READY_FOR_CHECKOUT', ['enfermeria', 'proveedor'], 'any'],
  ['READY_FOR_CHECKOUT', 'start_checkout', 'CHECKOUT', ['recepcion'], 'any'],
  ['CHECKOUT', 'complete', 'COMPLETED', ['recepcion'], 'any'],
  ...OPEN.flatMap((from): Row[] => [
    [from, 'close_left_early', 'LEFT_EARLY', ['recepcion'], 'any'],
    [from, 'close_cancelled', 'CANCELLED', ['recepcion'], 'any'],
  ]),
];

const ALL_ROLES: Role[] = ['propietario', 'administrador', 'recepcion', 'enfermeria', 'proveedor'];
const routeOk = (kind: Row[4], route: VisitRoute) => kind === 'any' || (kind === 'direct') === isDirectRoute(route);

describe('máquina de estados de la visita', () => {
  it('abiertos: los ocho anteriores a Completada; rutas directas: todas menos Estándar', () => {
    expect(VISIT_STATUSES.filter(isOpenVisitStatus)).toEqual(OPEN);
    expect(VISIT_ROUTES.filter(isDirectRoute)).toEqual(['INJECTION_ONLY', 'LAB_ONLY', 'PROCEDURE_ONLY']);
  });

  it('la tabla coincide fila por fila con la del manual', () => {
    expect(VISIT_TRANSITIONS).toHaveLength(EXPECTED.length);
  });

  // Cada estado (y la apertura) × cada acción × cada ruta × cada rol.
  for (const from of [null, ...VISIT_STATUSES]) {
    for (const action of VISIT_ACTIONS) {
      for (const route of VISIT_ROUTES) {
        const row = EXPECTED.find(([f, a, , , kind]) => f === from && a === action && routeOk(kind, route));
        const label = `${from ?? '(apertura)'} · ${action} · ${route}`;
        if (!row) {
          it(`prohibida: ${label}`, () => {
            for (const role of ALL_ROLES) expect(visitTransition(from, action, { route, roles: [role] })).toEqual({ ok: false, reason: 'invalid_transition' });
          });
          continue;
        }
        const [, , to, owners] = row;
        it(`permitida: ${label} → ${to}, solo para ${owners.join(' o ')}`, () => {
          for (const role of ALL_ROLES) {
            const result = visitTransition(from, action, { route, roles: [role] });
            if (owners.includes(role)) expect(result).toMatchObject({ ok: true, to });
            else expect(result).toEqual({ ok: false, reason: 'forbidden' });
          }
        });
      }
    }
  }

  it('Propietario y Administrador solo actúan con un rol clínico (ADR 0027)', () => {
    expect(visitTransition(null, 'check_in', { route: 'STANDARD', roles: ['administrador'] })).toEqual({ ok: false, reason: 'forbidden' });
    expect(visitTransition(null, 'check_in', { route: 'STANDARD', roles: ['administrador', 'recepcion'] })).toMatchObject({ ok: true });
    expect(visitTransition(null, 'check_in', { route: 'STANDARD', roles: ['propietario', 'enfermeria'] })).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('las órdenes abiertas bloquean «Listo para pago» e «Iniciar pago», no el resto', () => {
    const ctx = { route: 'STANDARD' as const, roles: ['recepcion', 'enfermeria', 'proveedor'] as Role[], hasOpenOrders: true };
    expect(visitTransition('WITH_PROVIDER', 'ready_for_checkout', ctx)).toEqual({ ok: false, reason: 'open_orders' });
    expect(visitTransition('PROCEDURE_PENDING', 'ready_for_checkout', ctx)).toEqual({ ok: false, reason: 'open_orders' });
    expect(visitTransition('READY_FOR_CHECKOUT', 'start_checkout', ctx)).toEqual({ ok: false, reason: 'open_orders' });
    expect(visitTransition('WITH_PROVIDER', 'send_to_procedure', ctx)).toMatchObject({ ok: true });
    expect(visitTransition('CHECKOUT', 'complete', ctx)).toMatchObject({ ok: true });
  });

  it('cerrar exige motivo; el resto no', () => {
    for (const t of VISIT_TRANSITIONS) expect(t.requiresReason === true).toBe(t.action === 'close_left_early' || t.action === 'close_cancelled');
  });

  it('acciones de la barra por estado, ruta y rol', () => {
    expect(visitActions('CHECKED_IN', { route: 'STANDARD', roles: ['recepcion'] })).toEqual(['send_to_nurse', 'close_left_early', 'close_cancelled']);
    expect(visitActions('CHECKED_IN', { route: 'LAB_ONLY', roles: ['recepcion'] })).toEqual(['send_to_procedure', 'close_left_early', 'close_cancelled']);
    expect(visitActions('CHECKED_IN', { route: 'STANDARD', roles: ['enfermeria'] })).toEqual([]);
    expect(visitActions('PROCEDURE_PENDING', { route: 'INJECTION_ONLY', roles: ['enfermeria'] })).toEqual(['ready_for_checkout']);
    for (const closed of ['COMPLETED', 'LEFT_EARLY', 'CANCELLED'] as const) {
      expect(visitActions(closed, { route: 'STANDARD', roles: ALL_ROLES })).toEqual([]);
    }
  });

  it('forzar (S-CLI-10): sin el actual, sin los cierres y sin los destinos regulares de ese estado y esa ruta', () => {
    // Estándar desde «Registrado»: la acción regular lleva a «Esperando enfermería».
    expect(forceTargets('CHECKED_IN', 'STANDARD')).toEqual([
      'WITH_NURSE',
      'WAITING_FOR_PROVIDER',
      'WITH_PROVIDER',
      'PROCEDURE_PENDING',
      'READY_FOR_CHECKOUT',
      'CHECKOUT',
      'COMPLETED',
    ]);
    // Ruta directa: la regular lleva a «Procedimiento pendiente».
    expect(forceTargets('CHECKED_IN', 'INJECTION_ONLY')).toContain('WAITING_FOR_NURSE');
    expect(forceTargets('CHECKED_IN', 'INJECTION_ONLY')).not.toContain('PROCEDURE_PENDING');
    // «Con proveedor» tiene dos salidas regulares.
    const withProvider = forceTargets('WITH_PROVIDER', 'STANDARD');
    expect(withProvider).not.toContain('PROCEDURE_PENDING');
    expect(withProvider).not.toContain('READY_FOR_CHECKOUT');
    for (const from of VISIT_STATUSES) {
      for (const route of VISIT_ROUTES) {
        const targets = forceTargets(from, route);
        expect(targets).not.toContain(from);
        expect(targets).not.toContain('LEFT_EARLY');
        expect(targets).not.toContain('CANCELLED');
        for (const t of VISIT_TRANSITIONS.filter((x) => x.from === from && !isCloseAction(x.action))) {
          if (visitTransition(from, t.action, { route, roles: ALL_ROLES }).ok) expect(targets).not.toContain(t.to);
        }
      }
    }
    // Desde una cerrada no hay acciones regulares: reabre a cualquier estado abierto o la completa.
    expect(forceTargets('CANCELLED', 'STANDARD')).toHaveLength(9);
    expect(forceTargets('COMPLETED', 'STANDARD')).toHaveLength(8);
    expect(reopens('CANCELLED', 'CHECKED_IN')).toBe(true);
    expect(reopens('CANCELLED', 'COMPLETED')).toBe(false);
    expect(reopens('CHECKED_IN', 'WITH_NURSE')).toBe(false);
    expect(visitForce('CHECKED_IN', 'WAITING_FOR_NURSE', 'STANDARD')).toEqual({ ok: false, reason: 'invalid_transition' });
    expect(visitForce('CHECKED_IN', 'WITH_NURSE', 'STANDARD')).toEqual({ ok: true, to: 'WITH_NURSE' });
    expect(visitForce('CHECKED_IN', 'LEFT_EARLY', 'STANDARD')).toMatchObject({ ok: false });
  });

  it('cierres: «Se retiró antes» y «Cancelada» con su acción', () => {
    expect(closeAction('LEFT_EARLY')).toBe('close_left_early');
    expect(closeAction('CANCELLED')).toBe('close_cancelled');
    expect(VISIT_ACTIONS.filter(isCloseAction)).toEqual(['close_left_early', 'close_cancelled']);
  });

  it('capacidades de la pantalla por estado, ruta, roles y permisos', () => {
    const base = { route: 'STANDARD' as const, canManage: false, canForce: false, isMine: false };
    expect(encounterAbilities({ ...base, status: 'CHECKED_IN', roles: ['recepcion'], canManage: true })).toEqual({
      actions: ['send_to_nurse'],
      close: true,
      forceTargets: [],
      assignProvider: true,
      assignSelf: false,
      editCoverage: true,
    });
    // Enfermería: solo lectura en «Registrado».
    expect(encounterAbilities({ ...base, status: 'CHECKED_IN', roles: ['enfermeria'] })).toEqual({
      actions: [],
      close: false,
      forceTargets: [],
      assignProvider: false,
      assignSelf: false,
      editCoverage: false,
    });
    // Proveedor: «Asignarme» si no es suya; no si ya lo es.
    expect(encounterAbilities({ ...base, status: 'WAITING_FOR_PROVIDER', roles: ['proveedor'] })).toMatchObject({ actions: ['start_consult'], assignSelf: true });
    expect(encounterAbilities({ ...base, status: 'WAITING_FOR_PROVIDER', roles: ['proveedor'], isMine: true }).assignSelf).toBe(false);
    // Cerrada: sin acciones; quien puede forzar la reabre.
    const closed = encounterAbilities({ ...base, status: 'CANCELLED', roles: ['recepcion', 'administrador'], canManage: true, canForce: true });
    expect(closed).toMatchObject({ actions: [], close: false, assignProvider: false, assignSelf: false, editCoverage: false });
    expect(closed.forceTargets).toContain('CHECKED_IN');
  });
});
