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
import {
  appointmentActions,
  appointmentScope,
  appointmentWhenLabel,
  cancelAppointmentSchema,
  createAppointmentSchema,
  intervalsOverlap,
  isBookableDay,
  isClockTime,
  occupiesProvider,
  updateAppointmentSchema,
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

describe('gestión de citas (T-015)', () => {
  const base = {
    status: 'SCHEDULED' as const,
    scope: 'all' as const,
    isOwn: false,
    canCheckIn: true,
    startsAt: '2026-11-03T15:00:00Z',
    now: new Date('2026-11-03T14:00:00Z'),
    isToday: true,
  };

  it('appointments.manage: Recepción y Proveedor; check_in, solo Recepción', () => {
    expect(permissionsFor(['recepcion']).has('appointments.manage')).toBe(true);
    expect(permissionsFor(['proveedor']).has('appointments.manage')).toBe(true);
    expect(permissionsFor(['enfermeria']).has('appointments.manage')).toBe(false);
    expect(permissionsFor(['administrador']).has('appointments.manage')).toBe(false);
    expect(permissionsFor(['propietario']).has('appointments.manage')).toBe(false);
    expect(permissionsFor(['recepcion']).has('appointments.check_in')).toBe(true);
    expect(permissionsFor(['proveedor']).has('appointments.check_in')).toBe(false);
  });

  it('alcance: Recepción todas; Proveedor solo las suyas; el resto ninguna', () => {
    expect(appointmentScope(['recepcion'])).toBe('all');
    expect(appointmentScope(['proveedor', 'recepcion'])).toBe('all');
    expect(appointmentScope(['proveedor'])).toBe('own');
    expect(appointmentScope(['administrador'])).toBe('none');
    expect(appointmentScope(['enfermeria'])).toBe('none');
  });

  it('matriz estado × rol (S-REC-09)', () => {
    expect(appointmentActions(base)).toEqual(['edit', 'reschedule', 'confirm', 'cancel', 'check_in']);
    expect(appointmentActions({ ...base, status: 'CONFIRMED' })).toEqual(['edit', 'reschedule', 'cancel', 'check_in']);
    for (const status of ['ARRIVED', 'CANCELLED', 'NO_SHOW'] as const) expect(appointmentActions({ ...base, status })).toEqual([]);
    expect(appointmentActions({ ...base, scope: 'own', isOwn: false })).toEqual([]);
    expect(appointmentActions({ ...base, scope: 'own', isOwn: true, canCheckIn: false })).toEqual(['edit', 'reschedule', 'confirm', 'cancel']);
    expect(appointmentActions({ ...base, scope: 'none' })).toEqual([]);
  });

  it('no presentado, solo desde la hora de inicio; llegada, solo hoy', () => {
    expect(appointmentActions({ ...base, now: new Date('2026-11-03T15:00:00Z') })).toContain('no_show');
    expect(appointmentActions({ ...base, now: new Date('2026-11-03T14:59:59Z') })).not.toContain('no_show');
    expect(appointmentActions({ ...base, isToday: false })).not.toContain('check_in');
  });

  it('solapamiento: intervalos semiabiertos; Canceladas y No se presentó no ocupan', () => {
    const t = Date.parse('2026-11-03T15:00:00Z');
    expect(intervalsOverlap(t, 20, t + 10 * 60_000, 20)).toBe(true);
    expect(intervalsOverlap(t, 20, t + 20 * 60_000, 20)).toBe(false);
    expect(intervalsOverlap(t + 20 * 60_000, 20, t, 20)).toBe(false);
    expect(intervalsOverlap(t, 60, t + 10 * 60_000, 5)).toBe(true);
    expect(occupiesProvider('CANCELLED')).toBe(false);
    expect(occupiesProvider('NO_SHOW')).toBe(false);
    expect(occupiesProvider('ARRIVED')).toBe(true);
  });

  it('solo desde hoy en la sede', () => {
    expect(isBookableDay('2026-11-03', '2026-11-03')).toBe(true);
    expect(isBookableDay('2026-11-04', '2026-11-03')).toBe(true);
    expect(isBookableDay('2026-11-02', '2026-11-03')).toBe(false);
  });

  it('esquemas: hora HH:MM, duración 5–480, notas vacías = nulas y motivo obligatorio', () => {
    expect(isClockTime('09:00')).toBe(true);
    expect(isClockTime('9:00')).toBe(false);
    expect(isClockTime('24:00')).toBe(false);
    const ok = {
      patientId: '018f0000-0000-7000-8000-000000000001',
      appointmentTypeId: '018f0000-0000-7000-8000-000000000002',
      date: '2026-11-03',
      time: '09:00',
      durationMinutes: 20,
      providerMembershipId: null,
      notes: '   ',
    };
    expect(createAppointmentSchema.parse(ok).notes).toBeNull();
    expect(createAppointmentSchema.safeParse({ ...ok, durationMinutes: 4 }).success).toBe(false);
    expect(createAppointmentSchema.safeParse({ ...ok, durationMinutes: 481 }).success).toBe(false);
    expect(createAppointmentSchema.safeParse({ ...ok, date: '2026-02-30' }).success).toBe(false);
    expect(updateAppointmentSchema.safeParse({ expectedVersion: 1, date: '2026-11-04' }).data).toEqual({ expectedVersion: 1 });
    expect(cancelAppointmentSchema.safeParse({ expectedVersion: 1, reason: '  ' }).success).toBe(false);
  });

  it('fecha y hora del aviso en la zona de la sede', () => {
    expect(appointmentWhenLabel('2026-11-03T15:00:00Z', 'America/Chicago')).toBe('3 nov, 9:00 a. m.');
    expect(appointmentWhenLabel('2026-10-31T19:30:00Z', 'America/Chicago')).toBe('31 oct, 2:30 p. m.');
    expect(appointmentWhenLabel('2026-11-01T05:00:00Z', 'America/Chicago')).toBe('1 nov, 12:00 a. m.');
  });
});
