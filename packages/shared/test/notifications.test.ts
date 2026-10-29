import { describe, expect, it } from 'vitest';
import { isNotificationKind, NOTIFICATION_KINDS, notificationText } from '../src/notifications.ts';

// S-GEN-15 (T-009): textos del manual, en «usted».

describe('catálogo de avisos', () => {
  it('usa el código si lo hay y el texto general si no', () => {
    expect(notificationText('encounter.provider_assigned', 'NOR1-V-000123')).toEqual({ title: 'Paciente asignado a usted', body: 'Visita NOR1-V-000123' });
    expect(notificationText('encounter.provider_assigned', null)).toEqual({ title: 'Paciente asignado a usted', body: 'Se le asignó una visita' });
    expect(notificationText('appointment.changed', null).body).toBe('Una de sus citas cambió');
    expect(notificationText('order.changed', 'LAB-01')).toEqual({ title: 'Orden asignada actualizada', body: 'Orden LAB-01' });
    // Los avisos de sistema no llevan código.
    expect(notificationText('system.setup_incomplete', 'X').body).toBe('Faltan ajustes. Abra Configuración para terminar.');
  });

  it('ningún texto tutea', () => {
    for (const kind of NOTIFICATION_KINDS) {
      const { title, body } = notificationText(kind, null);
      expect(`${title} ${body}`).not.toMatch(/\bti\b|\bAbre\b|\bRevísala\b|\bEstás\b/);
    }
  });

  it('reconoce solo los tipos del catálogo', () => {
    expect(isNotificationKind('appointment.changed')).toBe(true);
    expect(isNotificationKind('otro')).toBe(false);
  });
});
