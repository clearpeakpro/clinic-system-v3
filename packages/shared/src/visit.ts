import type { Role } from './permissions.ts';

// Estados, rutas y máquina de estados de la visita (manual, «Estados de la
// visita», docs/manual/README.md; T-017). La misma para la web y la API:
// ningún endpoint cambia encounters.status sin pasar por aquí, y cada
// transición deja su fila en encounter_events (CLAUDE.md, regla 3). Los
// valores son los mismos que exige la base de datos (packages/db,
// encounters-schema.ts); una prueba lo comprueba. Los colores e iconos de
// cada estado viven en packages/ui.

export const VISIT_STATUSES = [
  'CHECKED_IN',
  'WAITING_FOR_NURSE',
  'WITH_NURSE',
  'WAITING_FOR_PROVIDER',
  'WITH_PROVIDER',
  'PROCEDURE_PENDING',
  'READY_FOR_CHECKOUT',
  'CHECKOUT',
  'COMPLETED',
  'LEFT_EARLY',
  'CANCELLED',
] as const;

export type VisitStatus = (typeof VISIT_STATUSES)[number];

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  CHECKED_IN: 'Registrado',
  WAITING_FOR_NURSE: 'Esperando enfermería',
  WITH_NURSE: 'Con enfermería',
  WAITING_FOR_PROVIDER: 'Esperando proveedor',
  WITH_PROVIDER: 'Con proveedor',
  PROCEDURE_PENDING: 'Procedimiento pendiente',
  READY_FOR_CHECKOUT: 'Listo para caja',
  CHECKOUT: 'En caja',
  COMPLETED: 'Completada',
  LEFT_EARLY: 'Se retiró',
  CANCELLED: 'Cancelada',
};

/** Completada, Se retiró y Cancelada: la visita está cerrada. */
export const CLOSED_VISIT_STATUSES: readonly VisitStatus[] = ['COMPLETED', 'LEFT_EARLY', 'CANCELLED'];

/** Los ocho estados anteriores a «Completada» («Cualquier estado abierto»). */
export function isOpenVisitStatus(status: VisitStatus): boolean {
  return !CLOSED_VISIT_STATUSES.includes(status);
}

/** Rutas de la visita: Estándar o directas a procedimiento (ADR 0005). */
export const VISIT_ROUTES = ['STANDARD', 'INJECTION_ONLY', 'LAB_ONLY', 'PROCEDURE_ONLY'] as const;

export type VisitRoute = (typeof VISIT_ROUTES)[number];

export const VISIT_ROUTE_LABELS: Record<VisitRoute, string> = {
  STANDARD: 'Estándar',
  INJECTION_ONLY: 'Solo inyección',
  LAB_ONLY: 'Solo laboratorio',
  PROCEDURE_ONLY: 'Solo procedimiento',
};

/** Ayuda de cada ruta en el paso «Ruta» (S-REC-23): define a qué cola va el paciente. */
export const VISIT_ROUTE_HELP: Record<VisitRoute, string> = {
  STANDARD: 'Admisión de enfermería y luego proveedor.',
  INJECTION_ONLY: 'Directo a la cola de procedimientos para una inyección.',
  LAB_ONLY: 'Toma de laboratorio sin consulta con el proveedor.',
  PROCEDURE_ONLY: 'Directo a la cola de procedimientos.',
};

/** Las rutas directas van de «Registrado» a «Procedimiento pendiente», sin enfermería ni proveedor. */
export function isDirectRoute(route: VisitRoute): boolean {
  return route !== 'STANDARD';
}

// --- Máquina de estados -----------------------------------------------------

export const VISIT_ACTIONS = [
  'check_in',
  'send_to_nurse',
  'send_to_procedure',
  'start_nursing',
  'send_to_provider',
  'start_consult',
  'ready_for_checkout',
  'start_checkout',
  'complete',
  'close_left_early',
  'close_cancelled',
] as const;

export type VisitAction = (typeof VISIT_ACTIONS)[number];

/** Roles clínicos que pueden dar un paso. Propietario y Administrador, solo con uno de ellos (ADR 0027). */
type ClinicalRole = Extract<Role, 'recepcion' | 'enfermeria' | 'proveedor'>;

export interface VisitTransition {
  action: VisitAction;
  /** Nulo: la apertura de la visita. */
  from: VisitStatus | null;
  to: VisitStatus;
  /** Rol dueño del paso. */
  roles: readonly ClinicalRole[];
  /** Solo en esta clase de ruta. */
  route?: 'standard' | 'direct';
  /** Se bloquea con órdenes pendientes o en curso (S-CLI-08, S-CAJ-06). */
  blockedByOpenOrders?: boolean;
  /** Motivo obligatorio (máx. 500). */
  requiresReason?: boolean;
}

const OPEN_STATUSES = VISIT_STATUSES.filter(isOpenVisitStatus);

/** La tabla del manual («Estados de la visita»), fila por fila. */
export const VISIT_TRANSITIONS: readonly VisitTransition[] = [
  { action: 'check_in', from: null, to: 'CHECKED_IN', roles: ['recepcion'] },
  { action: 'send_to_nurse', from: 'CHECKED_IN', to: 'WAITING_FOR_NURSE', roles: ['recepcion'], route: 'standard' },
  { action: 'send_to_procedure', from: 'CHECKED_IN', to: 'PROCEDURE_PENDING', roles: ['recepcion'], route: 'direct' },
  { action: 'start_nursing', from: 'WAITING_FOR_NURSE', to: 'WITH_NURSE', roles: ['enfermeria'] },
  { action: 'send_to_provider', from: 'WITH_NURSE', to: 'WAITING_FOR_PROVIDER', roles: ['enfermeria'] },
  { action: 'start_consult', from: 'WAITING_FOR_PROVIDER', to: 'WITH_PROVIDER', roles: ['proveedor'] },
  { action: 'send_to_procedure', from: 'WITH_PROVIDER', to: 'PROCEDURE_PENDING', roles: ['proveedor'] },
  { action: 'ready_for_checkout', from: 'WITH_PROVIDER', to: 'READY_FOR_CHECKOUT', roles: ['proveedor'], blockedByOpenOrders: true },
  { action: 'ready_for_checkout', from: 'PROCEDURE_PENDING', to: 'READY_FOR_CHECKOUT', roles: ['enfermeria', 'proveedor'], blockedByOpenOrders: true },
  { action: 'start_checkout', from: 'READY_FOR_CHECKOUT', to: 'CHECKOUT', roles: ['recepcion'], blockedByOpenOrders: true },
  { action: 'complete', from: 'CHECKOUT', to: 'COMPLETED', roles: ['recepcion'] },
  ...OPEN_STATUSES.flatMap((from): VisitTransition[] => [
    { action: 'close_left_early', from, to: 'LEFT_EARLY', roles: ['recepcion'], requiresReason: true },
    { action: 'close_cancelled', from, to: 'CANCELLED', roles: ['recepcion'], requiresReason: true },
  ]),
];

export interface VisitTransitionContext {
  route: VisitRoute;
  /** Roles de quien actúa en la sede de la visita. */
  roles: readonly Role[];
  /** ¿Hay órdenes pendientes o en curso? (Desde T-025; antes, siempre false.) */
  hasOpenOrders?: boolean;
}

export type VisitTransitionResult =
  | { ok: true; to: VisitStatus; transition: VisitTransition }
  /**
   * - `invalid_transition`: la acción no existe desde ese estado o no vale para la ruta
   *   («Esta transición no está permitida en el estado actual.»);
   * - `forbidden`: el paso es de otro rol;
   * - `open_orders`: bloqueado por órdenes abiertas.
   */
  | { ok: false; reason: 'invalid_transition' | 'forbidden' | 'open_orders' };

const routeMatches = (transition: VisitTransition, route: VisitRoute) =>
  transition.route === undefined || (transition.route === 'direct') === isDirectRoute(route);

/** ¿Puede hacerse `action` desde `from` con esta ruta, estos roles y estas órdenes? Pura: sin hora ni base de datos. */
export function visitTransition(from: VisitStatus | null, action: VisitAction, ctx: VisitTransitionContext): VisitTransitionResult {
  const transition = VISIT_TRANSITIONS.find((t) => t.from === from && t.action === action && routeMatches(t, ctx.route));
  if (!transition) return { ok: false, reason: 'invalid_transition' };
  if (!transition.roles.some((role) => ctx.roles.includes(role))) return { ok: false, reason: 'forbidden' };
  if (transition.blockedByOpenOrders && ctx.hasOpenOrders) return { ok: false, reason: 'open_orders' };
  return { ok: true, to: transition.to, transition };
}

/**
 * Acciones de la barra (S-CLI-07, T-018) para el estado, la ruta y los roles.
 * Las bloqueadas por órdenes abiertas se incluyen: la barra las muestra
 * deshabilitadas con su explicación (S-CLI-08).
 */
export function visitActions(status: VisitStatus, ctx: Omit<VisitTransitionContext, 'hasOpenOrders'>): VisitAction[] {
  const actions: VisitAction[] = [];
  for (const action of VISIT_ACTIONS) {
    const result = visitTransition(status, action, { ...ctx, hasOpenOrders: false });
    if (result.ok && !actions.includes(action)) actions.push(action);
  }
  return actions;
}

/** Cierres: se hacen con «Cerrar visita…» (S-CLI-09), nunca con una transición normal ni forzando. */
export const CLOSE_ACTIONS = ['close_left_early', 'close_cancelled'] as const satisfies readonly VisitAction[];
export type CloseAction = (typeof CLOSE_ACTIONS)[number];

/** Resultado de «Cerrar visita» (S-CLI-09): «Se retiró antes» o «Cancelada». */
export const CLOSE_OUTCOMES = ['LEFT_EARLY', 'CANCELLED'] as const satisfies readonly VisitStatus[];
export type CloseOutcome = (typeof CLOSE_OUTCOMES)[number];

export const CLOSE_OUTCOME_LABELS: Record<CloseOutcome, string> = {
  LEFT_EARLY: 'Se retiró antes',
  CANCELLED: 'Cancelada',
};

export function closeAction(outcome: CloseOutcome): CloseAction {
  return outcome === 'LEFT_EARLY' ? 'close_left_early' : 'close_cancelled';
}

export function isCloseAction(action: VisitAction): action is CloseAction {
  return (CLOSE_ACTIONS as readonly VisitAction[]).includes(action);
}

/** Acción del historial (`encounter_events.action`) de un cambio forzado (S-CLI-10). */
export const FORCE_ACTION = 'force';

/** Lo que guarda el historial: un paso de la máquina o un cambio forzado. */
export type EncounterEventAction = VisitAction | typeof FORCE_ACTION;

/**
 * Destinos de «Forzar estado…» (S-CLI-10, T-018; decisión del 2026-11-01:
 * se sigue el manual). Todos los estados menos:
 *  - el actual;
 *  - «Se retiró» y «Cancelada» (se cierran con «Cerrar visita…»);
 *  - los destinos a los que ya lleva una acción regular desde ese estado y con
 *    esa ruta, sea del rol que sea.
 * Desde una visita cerrada no hay acciones regulares: forzar la reabre.
 * Quién puede forzar lo decide el ADR 0033 (visits.force_state).
 */
export function forceTargets(from: VisitStatus, route: VisitRoute): VisitStatus[] {
  const regular = new Set(
    VISIT_TRANSITIONS.filter((t) => t.from === from && !isCloseAction(t.action) && routeMatches(t, route)).map((t) => t.to),
  );
  return VISIT_STATUSES.filter((status) => status !== from && status !== 'LEFT_EARLY' && status !== 'CANCELLED' && !regular.has(status));
}

/** ¿Se puede forzar de `from` a `to` con esta ruta? Solo el destino: el permiso lo comprueba la API. */
export function visitForce(from: VisitStatus, to: VisitStatus, route: VisitRoute): { ok: true; to: VisitStatus } | { ok: false; reason: 'invalid_transition' } {
  return forceTargets(from, route).includes(to) ? { ok: true, to } : { ok: false, reason: 'invalid_transition' };
}

/** ¿Forzar a `to` desde `from` reabre una visita cerrada? */
export function reopens(from: VisitStatus, to: VisitStatus): boolean {
  return !isOpenVisitStatus(from) && isOpenVisitStatus(to);
}

/** Lo que puede hacer una persona en la pantalla de la visita (S-CLI-04 a 12). Lo calcula la API; la web solo lo muestra. */
export interface EncounterAbilities {
  /** Acciones regulares de la barra (S-CLI-07), sin los cierres. */
  actions: VisitAction[];
  /** «Cerrar visita…» (S-CLI-09). */
  close: boolean;
  /** Destinos de «Forzar estado…» (S-CLI-10); vacío si no puede forzar. */
  forceTargets: VisitStatus[];
  /** «Asignar proveedor» / «Cambiar proveedor» (S-CLI-05/06). */
  assignProvider: boolean;
  /** «Asignarme»: tiene el rol Proveedor y la visita no es suya. */
  assignSelf: boolean;
  /** Lápiz «Editar cobertura» (S-CLI-11/12). */
  editCoverage: boolean;
}

/**
 * Capacidades según estado × ruta × roles × permisos (S-CLI-07). La API
 * vuelve a comprobar cada operación.
 *  - `canManage`: visits.manage (Recepción): asignar proveedor y editar la cobertura.
 *  - `canForce`: visits.force_state junto con patients.access (ADR 0033).
 */
export function encounterAbilities(input: {
  status: VisitStatus;
  route: VisitRoute;
  roles: readonly Role[];
  canManage: boolean;
  canForce: boolean;
  isMine: boolean;
}): EncounterAbilities {
  const open = isOpenVisitStatus(input.status);
  const all = visitActions(input.status, { route: input.route, roles: input.roles });
  return {
    actions: all.filter((a) => !isCloseAction(a)),
    close: all.some(isCloseAction),
    forceTargets: input.canForce ? forceTargets(input.status, input.route) : [],
    assignProvider: open && input.canManage,
    assignSelf: open && input.roles.includes('proveedor') && !input.isMine,
    editCoverage: open && input.canManage,
  };
}

/** Texto de cada acción regular en la barra (S-CLI-07). */
export const VISIT_ACTION_LABELS: Record<VisitAction, string> = {
  check_in: 'Registrar llegada',
  send_to_nurse: 'Enviar a enfermería',
  send_to_procedure: 'Enviar a procedimiento',
  start_nursing: 'Iniciar enfermería',
  send_to_provider: 'Enviar al proveedor',
  start_consult: 'Iniciar consulta',
  ready_for_checkout: 'Listo para caja',
  start_checkout: 'Iniciar pago',
  complete: 'Completar visita',
  close_left_early: 'Se retiró antes',
  close_cancelled: 'Cancelada',
};
