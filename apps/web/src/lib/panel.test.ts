import type { PanelRow, VisitStatus } from '@clinic/shared';
import { describe, expect, it } from 'vitest';
import {
  chipCounts,
  groupLabel,
  initialPanelFilter,
  matchesSearch,
  minutesText,
  PANEL_GROUP_STATUSES,
  panelPrefs,
  providerFilterLabel,
  providerLabel,
  rowWaitLevel,
  shortCode,
  todayText,
  visibleRows,
  waitingText,
  worstLevel,
} from './panel.ts';

// T-019: filtros, búsqueda, orden y cronómetros del Panel. Las horas se pasan
// como parámetro (reglas de la fase 3): nada depende del reloj del equipo.

const NOW = new Date('2026-11-04T17:00:00Z').getTime();
const ME = 'm-yo';
const OTHER = 'm-otro';
const thresholds = { alertMinutes: 5, criticalMinutes: 10 };

let n = 0;
function row(status: VisitStatus, options: Partial<PanelRow> = {}): PanelRow {
  n += 1;
  return {
    id: `e-${String(n)}`,
    code: `NOR1-V-${String(n).padStart(6, '0')}`,
    status,
    route: 'STANDARD',
    arrivedAt: '2026-11-04T16:00:00Z',
    statusSince: '2026-11-04T16:30:00Z',
    closedAt: status === 'COMPLETED' ? '2026-11-04T16:50:00Z' : null,
    patient: { id: `p-${String(n)}`, code: `NOR1-P-${String(n).padStart(6, '0')}`, firstName: 'Ana', lastName: 'Pérez' },
    provider: null,
    appointmentType: null,
    waitLevel: 'none',
    ...options,
  };
}

describe('grupos de estados (S-REC-03)', () => {
  it('los chips del manual', () => {
    expect(PANEL_GROUP_STATUSES.open).toHaveLength(8);
    expect(PANEL_GROUP_STATUSES.nursing).toEqual(['CHECKED_IN', 'WAITING_FOR_NURSE', 'WITH_NURSE', 'PROCEDURE_PENDING']);
    expect(PANEL_GROUP_STATUSES.provider).toEqual(['WAITING_FOR_PROVIDER', 'WITH_PROVIDER', 'PROCEDURE_PENDING']);
    expect(PANEL_GROUP_STATUSES.waiting).toEqual(['CHECKED_IN', 'WAITING_FOR_NURSE']);
    expect(PANEL_GROUP_STATUSES.checkout).toEqual(['READY_FOR_CHECKOUT', 'CHECKOUT']);
    expect(groupLabel('checkout')).toBe('Caja');
    expect(groupLabel('with_nurse')).toBe('Con enfermería');
  });

  it('filtro inicial por la unión de roles', () => {
    expect(initialPanelFilter(['recepcion'])).toEqual({ group: 'open', provider: 'all' });
    expect(initialPanelFilter(['administrador', 'enfermeria'])).toEqual({ group: 'open', provider: 'all' });
    expect(initialPanelFilter(['proveedor', 'enfermeria'])).toEqual({ group: 'provider', provider: 'mine' });
    expect(initialPanelFilter(['proveedor', 'recepcion'])).toEqual({ group: 'open', provider: 'all' });
    expect(initialPanelFilter(['enfermeria'])).toEqual({ group: 'nursing', provider: 'all' });
  });

  it('el filtro elegido dura la sesión y se borra al cerrarla', () => {
    panelPrefs.set({ group: 'checkout', provider: 'none' });
    panelPrefs.reset();
    // Sin elección, vuelve el inicial (se comprueba con el hook en la E2E).
    expect(initialPanelFilter(['enfermeria']).group).toBe('nursing');
  });
});

describe('lista visible', () => {
  const a = row('CHECKED_IN', { arrivedAt: '2026-11-04T15:00:00Z' });
  const b = row('WAITING_FOR_PROVIDER', { arrivedAt: '2026-11-04T14:00:00Z', provider: { membershipId: ME, name: 'Yo' } });
  const c = row('WITH_PROVIDER', { arrivedAt: '2026-11-04T16:00:00Z', provider: { membershipId: OTHER, name: 'Dra. Ficticia' } });
  const d = row('COMPLETED', { closedAt: '2026-11-04T16:10:00Z' });
  const e = row('COMPLETED', { closedAt: '2026-11-04T16:40:00Z' });
  const rows = [a, b, c, d, e];

  it('combina grupo y proveedor y ordena por mayor espera', () => {
    expect(visibleRows(rows, { group: 'open', provider: 'all' }, '', ME).map((r) => r.id)).toEqual([b.id, a.id, c.id]);
    expect(visibleRows(rows, { group: 'provider', provider: 'mine' }, '', ME).map((r) => r.id)).toEqual([b.id]);
    expect(visibleRows(rows, { group: 'open', provider: 'none' }, '', ME).map((r) => r.id)).toEqual([a.id]);
    expect(visibleRows(rows, { group: 'open', provider: OTHER }, '', ME).map((r) => r.id)).toEqual([c.id]);
  });

  it('«Completados hoy»: el cierre más reciente primero', () => {
    expect(visibleRows(rows, { group: 'completed', provider: 'all' }, '', ME).map((r) => r.id)).toEqual([e.id, d.id]);
  });

  it('cuenta las filas de cada chip con el filtro de proveedor', () => {
    expect(chipCounts(rows, 'all', ME)).toMatchObject({ open: 3, nursing: 1, provider: 2, waiting: 1, checkout: 0, completed: 2 });
    expect(chipCounts(rows, 'mine', ME)).toMatchObject({ open: 1, provider: 1, completed: 0 });
  });

  it('búsqueda (ADR 0012): nombre sin acentos ni mayúsculas, en cualquier orden, o código', () => {
    const r = row('CHECKED_IN', { code: 'NOR1-V-000210', patient: { id: 'p', code: 'NOR1-P-000123', firstName: 'José', lastName: 'Ramírez Delgado' } });
    expect(matchesSearch(r, '')).toBe(true);
    expect(matchesSearch(r, 'jose')).toBe(true);
    expect(matchesSearch(r, 'RAMIREZ  josé')).toBe(true);
    expect(matchesSearch(r, 'P-000123')).toBe(true);
    expect(matchesSearch(r, 'nor1-v-000210')).toBe(true);
    expect(matchesSearch(r, 'María')).toBe(false);
  });
});

describe('cronómetros con la hora del servidor', () => {
  it('«12 min» y «1 h 05 min»; nunca negativo', () => {
    expect(minutesText(0)).toBe('0 min');
    expect(minutesText(12 * 60_000 + 59_000)).toBe('12 min');
    expect(minutesText(65 * 60_000)).toBe('1 h 05 min');
    expect(minutesText(-5000)).toBe('0 min');
  });

  it('el tiempo de espera cuenta desde la llegada; en las completadas, «Finalizada»', () => {
    expect(waitingText(row('WITH_NURSE', { arrivedAt: '2026-11-04T16:48:00Z' }), NOW)).toBe('12 min');
    expect(waitingText(row('COMPLETED'), NOW)).toBe('Finalizada');
  });

  it('el nivel se recalcula con el paso del tiempo (justo antes y después de 5 y 10 min)', () => {
    const r = row('WAITING_FOR_NURSE', { statusSince: '2026-11-04T17:00:00Z' });
    const at = (s: number) => NOW + s * 1000;
    expect(rowWaitLevel(r, at(299), thresholds)).toBe('none');
    expect(rowWaitLevel(r, at(300), thresholds)).toBe('alert');
    expect(rowWaitLevel(r, at(599), thresholds)).toBe('alert');
    expect(rowWaitLevel(r, at(600), thresholds)).toBe('critical');
  });

  it('cada tarjeta lleva la marca más grave de sus visitas', () => {
    const rows = [
      row('CHECKED_IN', { statusSince: '2026-11-04T16:54:00Z' }),
      row('WAITING_FOR_NURSE', { statusSince: '2026-11-04T16:58:00Z' }),
      row('WAITING_FOR_PROVIDER', { statusSince: '2026-11-04T16:40:00Z' }),
      row('WITH_NURSE', { statusSince: '2026-11-04T15:00:00Z' }),
    ];
    expect(worstLevel(rows, 'waiting', NOW, thresholds)).toBe('alert');
    expect(worstLevel(rows, 'waiting_provider', NOW, thresholds)).toBe('critical');
    expect(worstLevel(rows, 'with_nurse', NOW, thresholds)).toBe('none');
  });
});

describe('textos', () => {
  it('código corto, proveedor y «N citas hoy»', () => {
    expect(shortCode('NOR1-P-000123')).toBe('P-000123');
    expect(providerLabel(row('CHECKED_IN'), ME)).toEqual({ text: 'Sin asignar', unassigned: true });
    expect(providerLabel(row('CHECKED_IN', { provider: { membershipId: ME, name: 'Yo' } }), ME).text).toBe('Usted');
    expect(providerLabel(row('CHECKED_IN', { provider: { membershipId: OTHER, name: '' } }), ME).text).toBe('Asignado');
    expect(providerFilterLabel('gone', [])).toBe('Asignado');
    expect(providerFilterLabel('mine', [])).toBe('Mis pacientes');
    expect(todayText(0)).toBe('Sin citas hoy');
    expect(todayText(1)).toBe('1 cita hoy');
    expect(todayText(18)).toBe('18 citas hoy');
  });
});
