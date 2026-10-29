// Catálogo de avisos del centro de notificaciones (S-GEN-15, T-009). Títulos y
// textos del manual, en «usted» (ADR 0015). Sin PHI: el cuerpo lleva como
// mucho el código humano de la entidad («LAN-V-000123»), nunca nombres.
// Quien genera cada aviso llega con su fase; aquí solo está su texto.

export const NOTIFICATION_KINDS = [
  'encounter.provider_assigned',
  'appointment.changed',
  'order.created',
  'order.changed',
  'system.setup_incomplete',
  'system.client_outdated',
  'security.alert',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

interface NotificationLabel {
  title: string;
  /** Cuerpo con el código de la entidad. */
  withCode?: (code: string) => string;
  /** Cuerpo sin código. */
  body: string;
}

const LABELS: Record<NotificationKind, NotificationLabel> = {
  'encounter.provider_assigned': { title: 'Paciente asignado a usted', withCode: (c) => `Visita ${c}`, body: 'Se le asignó una visita' },
  'appointment.changed': { title: 'Cita actualizada', withCode: (c) => `Cita ${c}`, body: 'Una de sus citas cambió' },
  'order.created': { title: 'Orden asignada a usted', withCode: (c) => `Orden ${c}`, body: 'Una orden asignada a usted' },
  'order.changed': { title: 'Orden asignada actualizada', withCode: (c) => `Orden ${c}`, body: 'Una orden asignada a usted' },
  'system.setup_incomplete': { title: 'Configuración incompleta', body: 'Faltan ajustes. Abra Configuración para terminar.' },
  'system.client_outdated': { title: 'Actualización requerida', body: 'Esta versión de la aplicación ya no es compatible.' },
  'security.alert': { title: 'Alerta de seguridad', body: 'Revísela en Administración > Seguridad' },
};

export function isNotificationKind(value: string): value is NotificationKind {
  return (NOTIFICATION_KINDS as readonly string[]).includes(value);
}

/** Título y cuerpo de un aviso. */
export function notificationText(kind: NotificationKind, code: string | null): { title: string; body: string } {
  const label = LABELS[kind];
  return { title: label.title, body: code && label.withCode ? label.withCode(code) : label.body };
}
