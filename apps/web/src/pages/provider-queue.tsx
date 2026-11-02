import { PROVIDER_QUEUE_FILTERS, VISIT_STATUS_LABELS, waitLevel, type ProviderQueue, type ProviderQueueFilter, type ProviderQueueRow } from '@clinic/shared';
import { Button, cn, DateTimeText, EmptyState, ErrorState, Field, RefreshBar, RouteBadge, Spinner, StaleDataBanner, useSnackbar, VisitStatusChip } from '@clinic/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, BadgeCheck, Clock, HeartPulse, Play, RotateCw, Search, Stethoscope, StickyNote, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AllergyChip } from '../components/nursing/allergy-banner.tsx';
import { PanelLiveChip } from '../components/panel/live-chip.tsx';
import { WaitBadge } from '../components/panel/wait-badge.tsx';
import { api, type ApiError } from '../lib/api.ts';
import { encounterMessage, isVersionConflict, VERSION_CONFLICT_TEXT } from '../lib/encounters.ts';
import { inStatusText, minutesText, shortCode } from '../lib/panel.ts';
import {
  providerCardAction,
  providerQueueCounts,
  providerQueueLabel,
  providerQueueRows,
  providerQueueSubtitle,
  rememberedProviderFilter,
  rememberProviderFilter,
  showsProviderWait,
} from '../lib/provider.ts';
import { useActiveLocation } from '../lib/session.ts';

// S-CLI-02 Cola de proveedor (T-023; Stitch: design/stitch/clinicas/S-CLI-02_cola_de_proveedor).
//  - «Esperando proveedor», «Con proveedor» y «Procedimiento pendiente» de
//    cualquier ruta; por grupo y la mayor espera primero (lo ordena el servidor).
//  - Filtros «Mis pacientes» (inicial), «Sin asignar» y «Todos», con contador;
//    el elegido se recuerda en memoria durante la sesión. Búsqueda (ADR 0012).
//  - «Iniciar consulta» (rol Proveedor, sin asignar o suya) se autoasigna en el
//    servidor, con la versión de la fila; tras iniciar, abre la visita.
//    «Continuar visita» en las suyas con proveedor (Stitch).
//  - «Enfermería lista {hora}»; espera desde que terminó enfermería (o desde la
//    llegada), oculta en «Procedimiento pendiente».
//  - «Alerta» / «Crítico» solo en «Esperando proveedor» (ADR 0039) y aviso de
//    alergias en cada tarjeta (ADR 0040; decisión del 2026-11-02).
//  - En vivo con `encounter.changed`; sin conexión, cada 30 s. Cronómetro con
//    la hora del servidor, redibujado cada 15 s.

const TICK_MS = 15_000;

function useServerNow(serverNow: string | undefined, receivedAt: number): number {
  const [deviceNow, setDeviceNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => { setDeviceNow(Date.now()); }, TICK_MS);
    return () => { clearInterval(timer); };
  }, []);
  if (!serverNow) return deviceNow;
  return Math.max(deviceNow, receivedAt) + (new Date(serverNow).getTime() - receivedAt);
}

const BORDER: Record<ProviderQueueRow['status'], string> = {
  WAITING_FOR_PROVIDER: 'border-l-status-waiting',
  WITH_PROVIDER: 'border-l-status-in-care',
  PROCEDURE_PENDING: 'border-l-primary',
};

export function ProviderQueuePage({ sede }: { sede: string }) {
  const active = useActiveLocation();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const ready = active?.code === sede;
  const [filter, setFilterState] = useState<ProviderQueueFilter>(rememberedProviderFilter);
  const [search, setSearch] = useState('');
  const [starting, setStarting] = useState<string | null>(null);
  const queue = useQuery<ProviderQueue, ApiError>({ queryKey: ['provider-queue', active?.id], queryFn: api.providerQueue, enabled: ready });
  const data = queue.data;
  const now = useServerNow(data?.serverNow, queue.dataUpdatedAt);
  const me = data?.myMembershipId ?? '';
  const rows = data ? providerQueueRows(data.rows, filter, search, me) : [];
  const counts = data ? providerQueueCounts(data.rows, me) : null;

  const setFilter = (next: ProviderQueueFilter) => {
    rememberProviderFilter(next);
    setFilterState(next);
  };
  const open = (row: ProviderQueueRow) => {
    void navigate({ to: '/app/$sede/visitas/$id', params: { sede, id: row.id } });
  };
  const start = async (row: ProviderQueueRow) => {
    if (starting) return;
    setStarting(row.id);
    try {
      await api.startConsult(row.id, { expectedVersion: row.version });
      snackbar({ message: 'Consulta iniciada.' });
      void queryClient.invalidateQueries({ queryKey: ['provider-queue'] });
      open(row);
    } catch (error) {
      snackbar({ message: isVersionConflict(error) ? VERSION_CONFLICT_TEXT : encounterMessage(error) });
      await queryClient.invalidateQueries({ queryKey: ['provider-queue'] });
    } finally {
      setStarting(null);
    }
  };

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-space-lg">
      <header className="flex flex-wrap items-start justify-between gap-space-md">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 id="page-title" className="text-headline-lg text-on-surface">
            Cola de proveedor
          </h1>
          {data ? (
            <p className="text-body-lg text-on-surface-variant" data-testid="provider-queue-subtitle">
              {providerQueueSubtitle(rows.length)}
            </p>
          ) : null}
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-space-sm">
          <PanelLiveChip />
          <Button variant="outline" onClick={() => void queue.refetch()} aria-label="Actualizar" title="Actualizar">
            <RotateCw aria-hidden className="size-5" />
            <span className="hidden tab:inline">Actualizar</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-space-sm tab:flex-row tab:items-end tab:justify-between">
        <div role="group" aria-label="Pacientes" className="relative -mx-4 flex gap-space-sm overflow-x-auto px-4 pb-1 tab:mx-0 tab:flex-wrap tab:overflow-visible tab:px-0">
          {PROVIDER_QUEUE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => { setFilter(f.key); }}
              className={cn(
                'inline-flex min-h-touch shrink-0 items-center gap-space-xs rounded-full border px-space-md text-body-md-medium whitespace-nowrap',
                filter === f.key ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low dark:bg-surface-container-low',
              )}
            >
              {f.label}
              {counts ? <span className="min-w-6 rounded-full bg-surface-container-high px-1.5 text-center text-caption text-on-surface-variant tabular-nums dark:bg-surface-container-highest">{counts[f.key]}</span> : null}
            </button>
          ))}
        </div>
        <div className="tab:w-80">
          <Field
            label="Buscar en la cola"
            hideLabel
            type="search"
            placeholder="Buscar por nombre o código"
            icon={<Search className="size-5" />}
            value={search}
            onChange={(e) => { setSearch(e.target.value); }}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      {!data ? (
        queue.error ? (
          <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />
        ) : (
          <Spinner />
        )
      ) : (
        <div className="flex flex-col gap-space-sm">
          {queue.error ? <StaleDataBanner error={queue.error} onRetry={() => void queue.refetch()} /> : queue.isFetching ? <RefreshBar /> : <div aria-hidden className="h-0.5" />}
          {rows.length === 0 ? (
            <EmptyState
              icon={Stethoscope}
              title="No hay pacientes esperando a un proveedor."
              description={data.rows.length === 0 ? 'Aparecerán aquí cuando Enfermería los envíe al proveedor.' : 'Nada coincide con los filtros actuales.'}
            />
          ) : (
            <ul aria-label="Pacientes de la cola de proveedor" className="grid gap-space-md desk:grid-cols-2">
              {rows.map((r) => {
                // ADR 0039: en la cola, solo en «Esperando proveedor».
                const level = r.status === 'WAITING_FOR_PROVIDER' ? waitLevel(r, now, data.waitThresholds) : 'none';
                const provider = providerQueueLabel(r, me);
                const action = providerCardAction(r, me, data.canStart);
                const name = `${r.patient.firstName} ${r.patient.lastName}`;
                return (
                  <li
                    key={r.id}
                    data-testid="provider-queue-card"
                    className={cn('flex flex-col gap-space-md rounded-lg border-l-4 bg-surface-container-lowest p-space-md shadow-level-1 dark:bg-surface-container-low', BORDER[r.status])}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-space-sm">
                      <div className="flex min-w-0 flex-col">
                        <span className="text-body-lg-medium text-on-surface">{name}</span>
                        <span className="font-mono text-code-sm text-on-surface-variant tabular-nums" title={r.patient.code}>
                          {shortCode(r.patient.code)}
                        </span>
                      </div>
                      <VisitStatusChip status={r.status} />
                    </div>
                    {r.allergies ? (
                      <div className="flex min-w-0">
                        <AllergyChip notice={r.allergies} />
                      </div>
                    ) : null}
                    <dl className="grid grid-cols-2 gap-space-sm rounded-md bg-surface-container-low p-space-sm tab:grid-cols-3 dark:bg-surface-container">
                      <Meta icon={Clock} label="Llegada">
                        <DateTimeText value={r.arrivedAt} timeZone={data.timeZone} format="time" />
                      </Meta>
                      {r.nurseReadyAt ? (
                        <Meta icon={BadgeCheck} label="Enfermería lista">
                          <DateTimeText value={r.nurseReadyAt} timeZone={data.timeZone} format="time" />
                        </Meta>
                      ) : null}
                      {showsProviderWait(r) ? (
                        <Meta icon={Timer} label="Espera">
                          <span className="flex flex-wrap items-center gap-space-xs">
                            <span data-testid="provider-queue-waiting">{minutesText(now - new Date(r.waitingSince).getTime())}</span>
                            <WaitBadge level={level} detail={`${inStatusText(r, now)} en ${VISIT_STATUS_LABELS[r.status]}`} />
                          </span>
                        </Meta>
                      ) : null}
                      <Meta icon={StickyNote} label="Tipo de cita">
                        {r.appointmentType ?? 'Sin cita'}
                      </Meta>
                      <Meta icon={HeartPulse} label="Ruta">
                        <RouteBadge route={r.route} />
                      </Meta>
                      <Meta icon={Stethoscope} label="Proveedor">
                        <span className={cn(provider.unassigned && 'text-on-surface-variant italic')}>{provider.text}</span>
                      </Meta>
                    </dl>
                    <div className="flex flex-wrap justify-end gap-space-sm">
                      {action === 'start' ? (
                        <>
                          <Button variant="text" onClick={() => { open(r); }} aria-label={`Abrir la visita de ${name}`}>
                            Abrir
                          </Button>
                          <Button
                            loading={starting === r.id}
                            loadingText="Iniciando…"
                            disabled={starting !== null}
                            onClick={() => void start(r)}
                            aria-label={`Iniciar consulta de ${name}`}
                          >
                            <Play aria-hidden className="size-5" /> Iniciar consulta
                          </Button>
                        </>
                      ) : action === 'continue' ? (
                        <Button onClick={() => { open(r); }} aria-label={`Continuar visita de ${name}`}>
                          Continuar visita <ArrowRight aria-hidden className="size-5" />
                        </Button>
                      ) : (
                        <Button variant="text" onClick={() => { open(r); }} aria-label={`Abrir la visita de ${name}`}>
                          Abrir
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Meta({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="flex items-center gap-space-xs text-caption text-on-surface-variant">
        <Icon aria-hidden className="size-4 shrink-0" />
        {label}
      </dt>
      <dd className="text-body-md text-on-surface">{children}</dd>
    </div>
  );
}
