import type { ProviderQueueRow } from '@clinic/shared';
import { describe, expect, it } from 'vitest';
import {
  providerCardAction,
  providerQueueCounts,
  providerQueueLabel,
  providerQueueRows,
  providerQueueSubtitle,
  rememberedProviderFilter,
  rememberProviderFilter,
  showsProviderWait,
} from './provider.ts';

const ME = 'm-me';
const row = (overrides: Partial<ProviderQueueRow>): ProviderQueueRow => ({
  id: 'e-1',
  code: 'NOR1-V-000001',
  status: 'WAITING_FOR_PROVIDER',
  route: 'STANDARD',
  version: 4,
  arrivedAt: '2026-11-02T15:00:00Z',
  statusSince: '2026-11-02T15:20:00Z',
  nurseReadyAt: '2026-11-02T15:20:00Z',
  waitingSince: '2026-11-02T15:20:00Z',
  patient: { id: 'p-1', code: 'NOR1-P-000001', firstName: 'María', lastName: 'López García' },
  provider: null,
  appointmentType: null,
  allergies: null,
  waitLevel: 'none',
  ...overrides,
});

describe('Cola de proveedor en la web (T-023)', () => {
  const mine = row({ id: 'a', code: 'NOR1-V-000002', provider: { membershipId: ME, name: 'Diana Doctora' } });
  const other = row({ id: 'b', code: 'NOR1-V-000003', provider: { membershipId: 'm-2', name: 'Pablo Proveedor' }, patient: { id: 'p-2', code: 'NOR1-P-000002', firstName: 'Juan', lastName: 'Pérez Gómez' } });
  const free = row({ id: 'c' });

  it('filtra por «Mis pacientes», «Sin asignar» y «Todos», con búsqueda por nombre o código', () => {
    const rows = [mine, other, free];
    expect(providerQueueRows(rows, 'mine', '', ME).map((r) => r.id)).toEqual(['a']);
    expect(providerQueueRows(rows, 'unassigned', '', ME).map((r) => r.id)).toEqual(['c']);
    expect(providerQueueRows(rows, 'all', '', ME).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(providerQueueRows(rows, 'all', 'perez', ME).map((r) => r.id)).toEqual(['b']);
    expect(providerQueueRows(rows, 'all', 'V-000002', ME).map((r) => r.id)).toEqual(['a']);
    expect(providerQueueCounts(rows, ME)).toEqual({ mine: 1, unassigned: 1, all: 3 });
  });

  it('subtítulo y proveedor como en el manual', () => {
    expect([0, 1, 4].map(providerQueueSubtitle)).toEqual(['Sin pacientes', '1 paciente', '4 pacientes']);
    expect(providerQueueLabel(free, ME)).toEqual({ text: 'Sin asignar', unassigned: true });
    expect(providerQueueLabel(mine, ME).text).toBe('Asignado a mí');
    expect(providerQueueLabel(other, ME).text).toBe('Pablo Proveedor');
  });

  it('«Iniciar consulta» sin asignar o propia; nunca en la de otro; «Continuar visita» en la suya con proveedor', () => {
    expect(providerCardAction(free, ME, true)).toBe('start');
    expect(providerCardAction(mine, ME, true)).toBe('start');
    expect(providerCardAction(other, ME, true)).toBe('open');
    expect(providerCardAction(free, ME, false)).toBe('open');
    expect(providerCardAction({ ...mine, status: 'WITH_PROVIDER' }, ME, true)).toBe('continue');
    expect(providerCardAction({ ...other, status: 'WITH_PROVIDER' }, ME, true)).toBe('open');
    expect(providerCardAction({ ...mine, status: 'PROCEDURE_PENDING' }, ME, true)).toBe('open');
    expect(showsProviderWait({ status: 'PROCEDURE_PENDING' })).toBe(false);
    expect(showsProviderWait({ status: 'WITH_PROVIDER' })).toBe(true);
  });

  it('recuerda el filtro durante la sesión; empieza en «Mis pacientes»', () => {
    expect(rememberedProviderFilter()).toBe('mine');
    rememberProviderFilter('all');
    expect(rememberedProviderFilter()).toBe('all');
    rememberProviderFilter('mine');
  });
});
