import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api.ts';
import { appointmentMessage, isVersionConflict, localClock, overlapText } from './appointments.ts';
import { RealtimeClient, type LiveSocket } from './realtime.ts';
import { createEventBatcher } from './session.ts';

// T-015: agenda en vivo (eventos agrupados cada 500 ms), hora local del
// formulario, textos del aviso de solapamiento y mensajes de error. Datos ficticios.

const ID_A = '019a3000-0000-7000-8000-00000000000a';
const ID_B = '019a3000-0000-7000-8000-00000000000b';

describe('agenda en vivo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('una ráfaga de appointment.changed se relee una sola vez a los 500 ms: agenda, Panel, perfil y cada detalle', () => {
    const invalidate = vi.fn<(queryKey: readonly unknown[]) => void>();
    const onEvent = createEventBatcher(invalidate);
    onEvent({ name: 'appointment.changed', ids: { appointment: ID_A }, status: 'SCHEDULED' });
    onEvent({ name: 'appointment.changed', ids: { appointment: ID_B }, status: 'CANCELLED' });
    onEvent({ name: 'appointment.changed', ids: { appointment: ID_A }, status: 'CONFIRMED' });
    expect(invalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(invalidate.mock.calls.map((c) => c[0])).toEqual([
      ['agenda'],
      ['today-count'],
      ['patient-appointments'],
      ['appointment', ID_A],
      ['arrival', 'appointment', ID_A],
      ['appointment', ID_B],
      ['arrival', 'appointment', ID_B],
    ]);
    // Otra ráfaga, otra relectura.
    onEvent({ name: 'appointment.changed', ids: { appointment: ID_B } });
    vi.advanceTimersByTime(500);
    expect(invalidate).toHaveBeenCalledTimes(12);
  });

  it('encounter.changed (T-017) relee solo esa visita, en la misma ráfaga', () => {
    const invalidate = vi.fn<(queryKey: readonly unknown[]) => void>();
    const onEvent = createEventBatcher(invalidate);
    onEvent({ name: 'appointment.changed', ids: { appointment: ID_A }, status: 'ARRIVED' });
    onEvent({ name: 'encounter.changed', ids: { encounter: ID_B }, status: 'CHECKED_IN' });
    vi.advanceTimersByTime(500);
    expect(invalidate.mock.calls.map((c) => c[0])).toEqual([
      ['agenda'],
      ['today-count'],
      ['patient-appointments'],
      ['appointment', ID_A],
      ['arrival', 'appointment', ID_A],
      ['encounter', ID_B],
    ]);
    invalidate.mockClear();
    onEvent({ name: 'encounter.changed', ids: { encounter: ID_B } });
    vi.advanceTimersByTime(500);
    expect(invalidate.mock.calls.map((c) => c[0])).toEqual([['encounter', ID_B]]);
  });

  it('otros eventos no releen la agenda', () => {
    const invalidate = vi.fn<(queryKey: readonly unknown[]) => void>();
    createEventBatcher(invalidate)({ name: 'otro.evento', ids: {} });
    vi.advanceTimersByTime(1000);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('el cliente en vivo reenvía los eventos de pantalla', () => {
    const handlers = new Map<string, (...args: never[]) => void>();
    const socket: LiveSocket = {
      on: (event: string, listener: (...args: never[]) => void) => {
        handlers.set(event, listener);
      },
      removeAllListeners: () => undefined,
      disconnect: () => undefined,
    };
    const event = vi.fn();
    const client = new RealtimeClient({ resync: vi.fn(), sessionChanged: vi.fn(), notifications: vi.fn(), event }, () => socket);
    client.start('org:loc');
    (handlers.get('event') as ((p: unknown) => void) | undefined)?.({ name: 'appointment.changed', ids: { appointment: ID_A }, status: 'NO_SHOW' });
    expect(event).toHaveBeenCalledWith({ name: 'appointment.changed', ids: { appointment: ID_A }, status: 'NO_SHOW' });
    client.stop();
  });
});

describe('formulario y mensajes de citas', () => {
  it('hora local HH:MM en la zona de la sede, también con el cambio de horario', () => {
    expect(localClock('2026-11-03T15:00:00Z', 'America/Chicago')).toBe('09:00');
    expect(localClock('2026-11-01T06:30:00Z', 'America/Chicago')).toBe('01:30');
    expect(localClock('2026-11-01T07:30:00Z', 'America/Chicago')).toBe('01:30');
    expect(localClock('2026-10-31T05:00:00Z', 'America/Chicago')).toBe('00:00');
  });

  it('aviso de solapamiento como en Stitch', () => {
    expect(overlapText('Dra. Ficticia Norte', '2026-11-03T15:00:00Z', 'America/Chicago')).toBe('Dra. Ficticia Norte ya tiene una cita que se solapa a las 9:00 a. m.');
    expect(overlapText('', '2026-11-03T15:00:00Z', 'America/Chicago')).toBe('El proveedor ya tiene una cita que se solapa a las 9:00 a. m.');
  });

  it('mensajes claros para los errores del servidor', () => {
    expect(appointmentMessage(new ApiError(400, 'appointment_in_past'))).toBe('No se pueden agendar citas en días anteriores a hoy.');
    expect(appointmentMessage(new ApiError(403, 'provider_scope'))).toBe('Solo puede gestionar las citas asignadas a usted.');
    expect(appointmentMessage(new ApiError(409, 'no_show_before_start'))).toBe('Solo se puede marcar como no presentado desde la hora de la cita.');
    expect(appointmentMessage(new ApiError(409, 'patient_inactive'))).toBe('No se pueden agendar citas a un paciente inactivo.');
    expect(isVersionConflict(new ApiError(409, 'version_conflict'))).toBe(true);
    expect(isVersionConflict(new ApiError(409, 'otro'))).toBe(false);
  });
});
