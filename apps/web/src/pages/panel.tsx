import type { PanelRow, PanelSnapshot } from '@clinic/shared';
import { Button, EmptyState, ErrorState, RefreshBar, Spinner, StaleDataBanner } from '@clinic/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Armchair, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FilterBar } from '../components/panel/filter-bar.tsx';
import { KioskArrivalsTray } from '../components/panel/kiosk-arrivals.tsx';
import { PanelLiveChip } from '../components/panel/live-chip.tsx';
import { MetricCards } from '../components/panel/metric-cards.tsx';
import { QueueList } from '../components/panel/queue-list.tsx';
import { api, type ApiError } from '../lib/api.ts';
import { canFilterMine, chipCounts, panelPrefs, todayText, usePanelFilter, visibleRows } from '../lib/panel.ts';
import { useActiveLocation, useMe } from '../lib/session.ts';

// S-REC-01 Panel en vivo (T-019; Stitch: design/stitch/recepcion/S-REC-01_panel).
//  - Una sola foto del servidor (`GET /api/panel`): tarjetas, lista, «N citas
//    hoy», proveedores y minutos de «Alerta» / «Crítico» (ADR 0039).
//  - En vivo: los eventos de la sede la vuelven a pedir (agrupados cada
//    500 ms); sin conexión, cada 30 s y al reconectar (T-009). La recarga no
//    vacía la pantalla: barra fina arriba y se conserva el scroll.
//  - Los cronómetros parten de la hora del servidor y se redibujan cada 15 s
//    sin pedir datos.
//  - Filtro inicial según el rol; dura la sesión (lib/panel.ts).
//  - Desde T-021: arriba, «Llegadas del kiosco» (S-REC-28) para Recepción.

const TICK_MS = 15_000;

/**
 * Hora del servidor estimada: la del dispositivo más el desfase medido al
 * recibir la foto (`dataUpdatedAt` es la hora del dispositivo en ese momento).
 */
function useServerNow(serverNow: string | undefined, receivedAt: number): number {
  const [deviceNow, setDeviceNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => { setDeviceNow(Date.now()); }, TICK_MS);
    return () => { clearInterval(timer); };
  }, []);
  if (!serverNow) return deviceNow;
  return Math.max(deviceNow, receivedAt) + (new Date(serverNow).getTime() - receivedAt);
}

export function PanelPage({ sede }: { sede: string }) {
  const me = useMe();
  const active = useActiveLocation();
  const navigate = useNavigate();
  const ready = active?.code === sede;
  const roles = me.data?.roles ?? [];
  const filter = usePanelFilter(roles);
  const [search, setSearch] = useState('');
  const panel = useQuery<PanelSnapshot, ApiError>({ queryKey: ['panel', active?.id], queryFn: api.panel, enabled: ready });
  const data = panel.data;
  const now = useServerNow(data?.serverNow, panel.dataUpdatedAt);
  const rows = data ? visibleRows(data.rows, filter, search, data.myMembershipId) : [];
  const open = (row: PanelRow) => {
    void navigate({ to: '/app/$sede/visitas/$id', params: { sede, id: row.id } });
  };

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-space-lg">
      <header className="flex flex-wrap items-start justify-between gap-space-md">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 id="page-title" className="text-headline-lg text-on-surface">
            Panel
          </h1>
          {ready ? (
            <p className="text-body-lg text-on-surface-variant" data-testid="panel-subtitle">
              {active.name}
              {data ? ` · ${todayText(data.appointmentsToday)}` : ''}
            </p>
          ) : null}
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-space-sm">
          <PanelLiveChip />
          <Button variant="outline" onClick={() => void panel.refetch()} aria-label="Actualizar" title="Actualizar">
            <RotateCw aria-hidden className="size-5" />
            <span className="hidden tab:inline">Actualizar</span>
          </Button>
        </div>
      </header>

      {/* S-REC-28 (T-021): Llegadas del kiosco, para quien registra llegadas (Recepción). */}
      {ready && me.data?.permissions.includes('appointments.check_in') ? <KioskArrivalsTray sede={sede} locationId={active.id} /> : null}

      <MetricCards
        metrics={data?.metrics}
        rows={data?.rows ?? []}
        now={now}
        thresholds={data?.waitThresholds}
        selected={filter.group}
        onSelect={(group) => { panelPrefs.set({ ...filter, group }); }}
      />

      <FilterBar
        filter={filter}
        counts={data ? chipCounts(data.rows, filter.provider, data.myMembershipId) : null}
        providers={data?.providers ?? []}
        canMine={canFilterMine(roles)}
        search={search}
        onFilter={(next) => { panelPrefs.set(next); }}
        onSearch={setSearch}
      />

      <div className="flex flex-col gap-space-sm">
        {!data ? (
          panel.error ? (
            <ErrorState error={panel.error} onRetry={() => void panel.refetch()} />
          ) : (
            <Spinner />
          )
        ) : (
          <>
            {panel.error ? <StaleDataBanner error={panel.error} onRetry={() => void panel.refetch()} /> : panel.isFetching ? <RefreshBar /> : <div aria-hidden className="h-0.5" />}
            {rows.length === 0 ? (
              <EmptyState
                icon={Armchair}
                title="No hay pacientes en esta vista"
                description="Nada coincide con los filtros actuales."
                action={
                  <Button
                    variant="tonal"
                    onClick={() => {
                      panelPrefs.clear();
                      setSearch('');
                    }}
                  >
                    Restablecer filtros
                  </Button>
                }
              />
            ) : (
              <QueueList rows={rows} now={now} thresholds={data.waitThresholds} timeZone={data.timeZone} myMembershipId={data.myMembershipId} onOpen={open} />
            )}
          </>
        )}
      </div>
    </section>
  );
}
