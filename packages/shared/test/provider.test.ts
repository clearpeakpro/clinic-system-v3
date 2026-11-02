import { describe, expect, it } from 'vitest';
import { compareProviderQueue, inProviderFilter, PROVIDER_QUEUE_FILTERS, type ProviderQueueRow } from '../src/provider.ts';

type Row = Pick<ProviderQueueRow, 'status' | 'waitingSince' | 'code'>;
const row = (code: string, status: Row['status'], waitingSince: string): Row => ({ code, status, waitingSince });

describe('Cola de proveedor (T-023, S-CLI-02)', () => {
  it('ordena por grupo (Esperando, Con proveedor, Procedimiento pendiente) y, dentro, la mayor espera primero', () => {
    const rows = [
      row('NOR1-V-000005', 'PROCEDURE_PENDING', '2026-11-02T14:00:00Z'),
      row('NOR1-V-000004', 'WITH_PROVIDER', '2026-11-02T13:00:00Z'),
      row('NOR1-V-000003', 'WAITING_FOR_PROVIDER', '2026-11-02T15:10:00Z'),
      row('NOR1-V-000002', 'WAITING_FOR_PROVIDER', '2026-11-02T15:00:00Z'),
      row('NOR1-V-000001', 'WAITING_FOR_PROVIDER', '2026-11-02T15:00:00Z'),
    ];
    expect([...rows].sort(compareProviderQueue).map((r) => r.code)).toEqual(['NOR1-V-000001', 'NOR1-V-000002', 'NOR1-V-000003', 'NOR1-V-000004', 'NOR1-V-000005']);
  });

  it('filtros «Mis pacientes», «Sin asignar» y «Todos»; el inicial es «Mis pacientes»', () => {
    expect(PROVIDER_QUEUE_FILTERS.map((f) => f.label)).toEqual(['Mis pacientes', 'Sin asignar', 'Todos']);
    const mine = { provider: { membershipId: 'm-1', name: 'Diana' } };
    const other = { provider: { membershipId: 'm-2', name: 'Pablo' } };
    const none = { provider: null };
    expect([mine, other, none].map((r) => inProviderFilter(r, 'mine', 'm-1'))).toEqual([true, false, false]);
    expect([mine, other, none].map((r) => inProviderFilter(r, 'unassigned', 'm-1'))).toEqual([false, false, true]);
    expect([mine, other, none].map((r) => inProviderFilter(r, 'all', 'm-1'))).toEqual([true, true, true]);
  });
});
