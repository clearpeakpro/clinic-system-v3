// Catálogo de avisos del centro de notificaciones (S-GEN-15, T-009). Títulos y
// textos del manual, en «usted» (ADR 0015). Sin PHI: el cuerpo lleva como
// mucho el código humano de la entidad («LAN-V-000123»), nunca nombres.
// Quien genera cada aviso llega con su fase; aquí solo está su texto.

export const NOTIFICATION_KINDS = [
  'encounter.provider_assigned',
  'appointment.changed',
  // T-015: al proveedor nuevo de una cita y al anterior cuando sale de su agenda.
  'appointment.assigned',
  'appointment.reassigned',
  'order.created',
  'order.changed',
  'system.setup_incomplete',
  'system.client_outdated',
  'security.alert',
  // T-012 (ADR 0027): el Propietario se asignó o se quitó roles clínicos; a los Administradores.
  'membership.owner_clinical_roles',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

interface NotificationLabel {
  title: string;
  /** Cuerpo con el código de la entidad (y, en las citas, la fecha y la hora en la sede). */
  withCode?: (code: string, when: string | null) => string;
  /** Cuerpo sin código. */
  body: string;
}

/** «Cita NOR1-A-000045 · 3 nov, 9:00 a. m.» (T-015): sin nombres de pacientes. */
const appointmentBody = (code: string, when: string | null) => (when ? `Cita ${code} · ${when}` : `Cita ${code}`);

const LABELS: Record<NotificationKind, NotificationLabel> = {
  'encounter.provider_assigned': { title: 'Paciente asignado a usted', withCode: (c) => `Visita ${c}`, body: 'Se le asignó una visita' },
  'appointment.changed': { title: 'Cita actualizada', withCode: appointmentBody, body: 'Una de sus citas cambió' },
  'appointment.assigned': { title: 'Cita asignada a usted', withCode: appointmentBody, body: 'Se le asignó una cita' },
  'appointment.reassigned': { title: 'Cita reasignada', withCode: appointmentBody, body: 'Una de sus citas pasó a otro proveedor' },
  'order.created': { title: 'Orden asignada a usted', withCode: (c) => `Orden ${c}`, body: 'Una orden asignada a usted' },
  'order.changed': { title: 'Orden asignada actualizada', withCode: (c) => `Orden ${c}`, body: 'Una orden asignada a usted' },
  'system.setup_incomplete': { title: 'Configuración incompleta', body: 'Faltan ajustes. Abra Configuración para terminar.' },
  'system.client_outdated': { title: 'Actualización requerida', body: 'Esta versión de la aplicación ya no es compatible.' },
  'security.alert': { title: 'Alerta de seguridad', body: 'Revísela en Administración > Seguridad' },
  // El código son las sedes afectadas («NOR1, NOR2»); sin nombres (ADR 0030).
  'membership.owner_clinical_roles': {
    title: 'El Propietario cambió sus roles clínicos',
    withCode: (c) => `Sedes: ${c}. Puede revisarlo en Administración › Usuarios.`,
    body: 'Puede revisarlo en Administración › Usuarios.',
  },
};

export function isNotificationKind(value: string): value is NotificationKind {
  return (NOTIFICATION_KINDS as readonly string[]).includes(value);
}

/** Avisos de citas: al tocarlos se abre el detalle de la cita (T-015). */
export function isAppointmentNotification(kind: NotificationKind): boolean {
  return kind === 'appointment.changed' || kind === 'appointment.assigned' || kind === 'appointment.reassigned';
}

/** Título y cuerpo de un aviso. `when` es la fecha y la hora de la cita en su sede («3 nov, 9:00 a. m.»). */
export function notificationText(kind: NotificationKind, code: string | null, when: string | null = null): { title: string; body: string } {
  const label = LABELS[kind];
  return { title: label.title, body: code && label.withCode ? label.withCode(code, when) : label.body };
}
