import { describe, expect, it } from 'vitest';
import {
  addDays,
  agendaDate,
  agendaDateRange,
  APPOINTMENT_STATUSES,
  canTransitionAppointment,
  countsTowardToday,
  isCalendarDate,
  isFinalAppointmentStatus,
  shortAppointmentCode,
} from '../src/appointments.ts';
import { permissionsFor } from '../src/permissions.ts';

// T-014: estados de la cita, fechas de la agenda y acceso (ADR 0027).

describe('máquina de estados de la cita', () => {
  it('Programada → Confirmada → Llegó; Programada o Confirmada → Cancelada o No se presentó', () => {
    expect(canTransitionAppointment('SCHEDULED', 'CONFIRMED')).toBe(true);
    expect(canTransitionAppointment('CONFIRMED', 'ARRIVED')).toBe(true);
    expect(canTransitionAppointment('SCHEDULED', 'ARRIVED')).toBe(true);
    for (const from of ['SCHEDULED', 'CONFIRMED'] as const) {
      expect(canTransitionAppointment(from, 'CANCELLED')).toBe(true);
      expect(canTransitionAppointment(from, 'NO_SHOW')).toBe(true);
    }
    expect(canTransitionAppointment('CONFIRMED', 'SCHEDULED')).toBe(false);
    expect(canTransitionAppointment('CONFIRMED', 'CONFIRMED')).toBe(false);
  });

  it('Llegó, Cancelada y No se presentó son finales', () => {
    expect(APPOINTMENT_STATUSES.filter(isFinalAppointmentStatus)).toEqual(['ARRIVED', 'CANCELLED', 'NO_SHOW']);
    for (const to of APPOINTMENT_STATUSES) expect(canTransitionAppointment('CANCELLED', to)).toBe(false);
  });

  it('«N citas hoy» no cuenta Canceladas ni No se presentó', () => {
    expect(APPOINTMENT_STATUSES.filter(countsTowardToday)).toEqual(['SCHEDULED', 'CONFIRMED', 'ARRIVED']);
  });

  it('código corto de la cita', () => {
    expect(shortAppointmentCode('NOR1-A-000045')).toBe('A-000045');
    expect(shortAppointmentCode('A-000045')).toBe('A-000045');
  });
});

describe('fechas de la agenda', () => {
  it('días calendario reales', () => {
    expect(isCalendarDate('2026-11-01')).toBe(true);
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('2026-13-01')).toBe(false);
    expect(isCalendarDate('2026-1-01')).toBe(false);
    expect(isCalendarDate('hoy')).toBe(false);
  });

  it('sumar días cruza meses, años y cambios de horario sin perder ni repetir días', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(addDays('2027-03-14', -1)).toBe('2027-03-13');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('sin fecha, con una fecha inválida o fuera de ±2 años se muestra hoy', () => {
    const today = '2026-10-31';
    expect(agendaDateRange(today)).toEqual({ min: '2024-01-01', max: '2028-12-31' });
    expect(agendaDate(undefined, today)).toBe(today);
    expect(agendaDate('2026-02-30', today)).toBe(today);
    expect(agendaDate('2023-12-31', today)).toBe(today);
    expect(agendaDate('2029-01-01', today)).toBe(today);
    expect(agendaDate('2024-01-01', today)).toBe('2024-01-01');
    expect(agendaDate('2027-03-14', today)).toBe('2027-03-14');
  });
});

describe('acceso a Citas (ADR 0027)', () => {
  it('solo Recepción y Proveedor; ni Enfermería ni los roles administrativos por sí solos', () => {
    expect(permissionsFor(['recepcion']).has('appointments.access')).toBe(true);
    expect(permissionsFor(['proveedor']).has('appointments.access')).toBe(true);
    expect(permissionsFor(['enfermeria']).has('appointments.access')).toBe(false);
    expect(permissionsFor(['propietario']).has('appointments.access')).toBe(false);
    expect(permissionsFor(['administrador']).has('appointments.access')).toBe(false);
    expect(permissionsFor(['administrador', 'recepcion']).has('appointments.access')).toBe(true);
  });
});
