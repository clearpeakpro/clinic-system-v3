// Catálogo de estados y rutas de la visita (manual, «Estados de la visita»).
// Solo nombres y etiquetas: las transiciones llegan con la máquina de estados
// de su tarea. Los colores e iconos viven en packages/ui.

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

/** Rutas de la visita: Estándar o directas a procedimiento (ADR 0005). */
export const VISIT_ROUTES = ['STANDARD', 'INJECTION_ONLY', 'LAB_ONLY', 'PROCEDURE_ONLY'] as const;

export type VisitRoute = (typeof VISIT_ROUTES)[number];

export const VISIT_ROUTE_LABELS: Record<VisitRoute, string> = {
  STANDARD: 'Estándar',
  INJECTION_ONLY: 'Solo inyección',
  LAB_ONLY: 'Solo laboratorio',
  PROCEDURE_ONLY: 'Solo procedimiento',
};
