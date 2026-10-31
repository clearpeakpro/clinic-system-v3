import type { AgendaAppointment } from '@clinic/shared';
import { describe, expect, it } from 'vitest';
import { todayText } from '../pages/panel.tsx';
import {
  countByStatus,
  dayBadge,
  filterAgenda,
  groupByHour,
  hourLabel,
  initialProviderFilter,
  localDay,
  longDay,
  providerLabel,
  relativeDay,
  timeRange,
  typeLabel,
} from './appointments.ts';

// T-014: agenda en la zona horaria de la sede (America/Chicago), filtros y textos. Datos ficticios.

const TZ = 'America/Chicago';

const appointment = (startsAt: string, extra: Partial<AgendaAppointment> = {}): AgendaAppointment => ({
  id: startsAt,
  code: 'NOR1-A-000001',
  startsAt,
  durationMinutes: 20,
  status: 'SCHEDULED',
  patient: { id: 'p', code: 'P-000001', firstName: 'Ficticia', lastName: 'Prueba' },
  type: { id: 't', code: 'CONSULTA', name: 'Consulta general', active: true, color: 'teal' },
  provider: null,
  ...extra,
});

describe('horas en la zona de la sede', () => {
  it('rango «inicio – fin» con a. m./p. m. una sola vez si no cambia', () => {
    expect(timeRange('2026-10-25T14:00:00Z', 20, TZ)).toBe('9:00 – 9:20 a. m.');
    expect(timeRange('2026-10-25T16:50:00Z', 20, TZ)).toBe('11:50 a. m. – 12:10 p. m.');
    expect(timeRange('2026-10-25T17:00:00Z', 30, TZ)).toBe('12:00 – 12:30 p. m.');
  });

  it('agrupa por hora local de inicio, solo las horas con citas', () => {
    const groups = groupByHour(
      [appointment('2026-10-25T14:00:00Z'), appointment('2026-10-25T14:40:00Z'), appointment('2026-10-25T15:00:00Z'), appointment('2026-10-25T17:00:00Z')],
      TZ,
    );
    expect(groups.map((g) => [hourLabel(g.hour), g.items.length])).toEqual([
      ['9:00 a. m.', 2],
      ['10:00 a. m.', 1],
      ['12:00 p. m.', 1],
    ]);
  });

  it('cambio de horario de otoño (1 nov 2026): la 1:00 a. m. repetida queda en una sección, en orden real', () => {
    const day = [
      appointment('2026-11-01T05:30:00Z'), // 0:30 a. m. CDT
      appointment('2026-11-01T06:30:00Z'), // 1:30 a. m. CDT
      appointment('2026-11-01T07:30:00Z'), // 1:30 a. m. CST
      appointment('2026-11-01T08:15:00Z'), // 2:15 a. m. CST
    ];
    expect(day.map((a) => localDay(a.startsAt, TZ))).toEqual(['2026-11-01', '2026-11-01', '2026-11-01', '2026-11-01']);
    expect(groupByHour(day, TZ).map((g) => [hourLabel(g.hour), g.items.map((a) => a.startsAt)])).toEqual([
      ['12:00 a. m.', ['2026-11-01T05:30:00Z']],
      ['1:00 a. m.', ['2026-11-01T06:30:00Z', '2026-11-01T07:30:00Z']],
      ['2:00 a. m.', ['2026-11-01T08:15:00Z']],
    ]);
    expect(timeRange('2026-11-01T07:30:00Z', 20, TZ)).toBe('1:30 – 1:50 a. m.');
  });

  it('cambio de horario de primavera (14 mar 2027): de la 1:30 a las 3:30 a. m.', () => {
    const groups = groupByHour([appointment('2027-03-14T07:30:00Z'), appointment('2027-03-14T08:30:00Z')], TZ);
    expect(groups.map((g) => hourLabel(g.hour))).toEqual(['1:00 a. m.', '3:00 a. m.']);
    // Una cita de 1:50 a 2:10 termina a las 3:10 (las 2:00 no existen).
    expect(timeRange('2027-03-14T07:50:00Z', 20, TZ)).toBe('1:50 – 3:10 a. m.');
  });

  it('el día de una cita es el de la sede, no el del dispositivo', () => {
    expect(localDay('2026-11-02T05:30:00Z', TZ)).toBe('2026-11-01');
    expect(localDay('2026-11-02T06:30:00Z', TZ)).toBe('2026-11-02');
  });
});

describe('fechas en texto', () => {
  it('fecha larga del subtítulo, insignia y día relativo', () => {
    expect(longDay('2026-10-25')).toBe('Domingo, 25 de octubre de 2026');
    expect(longDay('2026-10-31')).toBe('Sábado, 31 de octubre de 2026');
    expect(dayBadge('2026-11-03')).toEqual({ month: 'NOV', day: '3' });
    expect(relativeDay('2026-10-31', '2026-10-31', '2026-11-01')).toBe('Hoy');
    expect(relativeDay('2026-11-01', '2026-10-31', '2026-11-01')).toBe('Mañana');
    expect(relativeDay('2026-11-03', '2026-10-31', '2026-11-01')).toBe('Martes 3 de noviembre');
  });

  it('«N citas hoy» del Panel', () => {
    expect(todayText(0)).toBe('Sin citas hoy');
    expect(todayText(1)).toBe('1 cita hoy');
    expect(todayText(18)).toBe('18 citas hoy');
  });
});

describe('filtros de la agenda', () => {
  const mine = { membershipId: 'm-yo', name: 'Proveedora Ficticia' };
  const other = { membershipId: 'm-otro', name: 'Otro Ficticio' };
  const rows = [
    appointment('2026-10-25T14:00:00Z', { status: 'SCHEDULED', provider: mine }),
    appointment('2026-10-25T15:00:00Z', { status: 'CONFIRMED', provider: other }),
    appointment('2026-10-25T16:00:00Z', { status: 'CANCELLED', provider: null }),
  ];

  it('filtro inicial: «Mis citas» solo para el rol Proveedor sin Administrador ni Recepción', () => {
    expect(initialProviderFilter(['proveedor'])).toBe('mine');
    expect(initialProviderFilter(['proveedor', 'recepcion'])).toBe('all');
    expect(initialProviderFilter(['proveedor', 'administrador'])).toBe('all');
    expect(initialProviderFilter(['recepcion'])).toBe('all');
  });

  it('proveedor y estados se combinan; sin estados elegidos, todos', () => {
    expect(filterAgenda(rows, 'all', [], 'm-yo')).toHaveLength(3);
    expect(filterAgenda(rows, 'mine', [], 'm-yo').map((a) => a.status)).toEqual(['SCHEDULED']);
    expect(filterAgenda(rows, 'none', [], 'm-yo').map((a) => a.status)).toEqual(['CANCELLED']);
    expect(filterAgenda(rows, 'member:m-otro', [], 'm-yo').map((a) => a.status)).toEqual(['CONFIRMED']);
    expect(filterAgenda(rows, 'all', ['SCHEDULED', 'CANCELLED'], 'm-yo').map((a) => a.status)).toEqual(['SCHEDULED', 'CANCELLED']);
    expect(filterAgenda(rows, 'mine', ['CANCELLED'], 'm-yo')).toEqual([]);
  });

  it('cuenta por estado', () => {
    expect(countByStatus(rows)).toEqual({ SCHEDULED: 1, CONFIRMED: 1, ARRIVED: 0, CANCELLED: 1, NO_SHOW: 0 });
  });

  it('etiquetas de proveedor y tipo', () => {
    expect(providerLabel(null)).toEqual({ text: 'Sin proveedor', unassigned: true });
    expect(providerLabel(mine, 'm-yo').text).toBe('Yo · Proveedora Ficticia');
    expect(providerLabel(other, 'm-yo').text).toBe('Otro Ficticio');
    expect(providerLabel({ membershipId: 'x', name: '' }).text).toBe('Proveedor asignado');
    expect(typeLabel({ code: 'CONSULTA', name: 'Consulta general', active: true })).toBe('Consulta general');
    expect(typeLabel({ code: 'VIEJO', name: 'Tipo inactivo', active: false })).toBe('VIEJO');
  });
});
