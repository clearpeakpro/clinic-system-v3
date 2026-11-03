import { ORDER_QUEUE_TAB_LABELS, ORDER_QUEUE_TABS, ORDER_TYPE_LABELS, VISIT_STATUS_LABELS, type OrderQueue, type OrderQueueRow, type OrderQueueTab } from '@clinic/shared';
import { Button, cn, CodeText, EmptyState, ErrorState, FilterChip, formatTime, OrderStatusChip, RefreshBar, SemanticChip, Spinner, StaleDataBanner } from '@clinic/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Activity, ClipboardList, ExternalLink, FlaskConical, ListChecks, RotateCw, Stethoscope, Syringe, UserCheck, UserX } from 'lucide-react';
import { OrderActions } from '../components/orders/order-actions.tsx';
import { PanelLiveChip } from '../components/panel/live-chip.tsx';
import { api, type ApiError } from '../lib/api.ts';
import { NO_LAB_TEXT, orderQueueSubtitle, orderQueueTabSlug, personText } from '../lib/orders.ts';
import { RESYNC_MS } from '../lib/realtime.ts';
import { useActiveLocation, useLiveState } from '../lib/session.ts';

// S-CLI-03 Cola de órdenes (T-026; Stitch: design/stitch/clinicas/S-CLI-03_cola_de_ordenes).
//  - Enfermería y Proveedor (orders_queue.access y orders.execute) de la sede
//    activa. Pestañas Pendientes, En curso, «Completadas hoy» (día de la sede,
//    lo filtra el servidor) y Canceladas, con su número, y «Asignadas a mí».
//    La pestaña y el conmutador van en la URL (sin PHI).
//  - Mínimo necesario (decisión del 2026-11-02): servicio, códigos del
//    paciente, de la visita y de la orden, cantidad, tipo, estado, personal y
//    estado de la visita. Nunca nombres de pacientes ni notas: la API no los
//    envía. Del diseño de Stitch se quitan la nota clínica y el nombre del box.
//  - Barra de acciones de la orden (S-CLI-19) y «Abrir visita» (S-CLI-04 en la
//    sección Órdenes).
//  - En vivo con `order.created`, `order.changed` y `encounter.changed`; sin
//    conexión, cada 30 s.

const TYPE_ICONS = { procedure: Stethoscope, lab: FlaskConical, injection: Syringe } as const;

export function OrdersQueuePage({ sede, tab, mine }: { sede: string; tab: OrderQueueTab; mine: boolean }) {
  const active = useActiveLocation();
  const live = useLiveState();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ready = active?.code === sede;
  const queue = useQuery<OrderQueue, ApiError>({
    queryKey: ['orders-queue', active?.id, tab, mine],
    queryFn: () => api.orderQueue(tab, mine),
    enabled: ready,
    refetchInterval: live.status === 'connected' ? false : RESYNC_MS,
  });
  const data = queue.data;

  const go = (next: { tab?: OrderQueueTab; mine?: boolean }) => {
    const t = next.tab ?? tab;
    const m = next.mine ?? mine;
    void navigate({ to: '/app/$sede/cola-ordenes', params: { sede }, search: { ...(t === 'pending' ? {} : { pestana: orderQueueTabSlug(t) }), ...(m ? { mias: true as const } : {}) } });
  };
  const reload = async () => {
    await queryClient.invalidateQueries({ queryKey: ['orders-queue'] });
  };

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-space-lg">
      <header className="flex flex-wrap items-start justify-between gap-space-md">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 id="page-title" className="text-headline-lg text-on-surface">
            Cola de órdenes
          </h1>
          {data ? (
            <p className="text-body-lg text-on-surface-variant" data-testid="orders-queue-subtitle">
              {orderQueueSubtitle(data.rows.length)}
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

      <div className="flex flex-col gap-space-sm tab:flex-row tab:items-center tab:justify-between">
        <div role="group" aria-label="Estado de las órdenes" className="relative -mx-4 flex gap-space-sm overflow-x-auto px-4 pb-1 tab:mx-0 tab:flex-wrap tab:overflow-visible tab:px-0">
          {ORDER_QUEUE_TABS.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tab === t}
              onClick={() => { go({ tab: t }); }}
              className={cn(
                'inline-flex min-h-touch shrink-0 items-center gap-space-xs rounded-full border px-space-md text-body-md-medium whitespace-nowrap',
                tab === t ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low dark:bg-surface-container-low',
              )}
            >
              {ORDER_QUEUE_TAB_LABELS[t]}
              {data ? (
                <span className="min-w-6 rounded-full bg-surface-container-high px-1.5 text-center text-caption text-on-surface-variant tabular-nums dark:bg-surface-container-highest">
                  {data.counts[t]}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <FilterChip label="Asignadas a mí" selected={mine} onToggle={(selected) => { go({ mine: selected }); }} />
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
          {data.rows.length === 0 ? (
            <EmptyState icon={ListChecks} title="No hay órdenes en esta vista." />
          ) : (
            <ul aria-label="Órdenes de la cola" className="grid gap-space-md desk:grid-cols-2">
              {data.rows.map((row) => (
                <OrderCard
                  key={row.id}
                  row={row}
                  timeZone={data.timeZone}
                  onOpen={() => {
                    void navigate({ to: '/app/$sede/visitas/$id', params: { sede, id: row.encounter.id }, search: { section: 'orders' } });
                  }}
                  onChanged={reload}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function OrderCard({ row, timeZone, onOpen, onChanged }: { row: OrderQueueRow; timeZone: string; onOpen: () => void; onChanged: () => Promise<void> }) {
  const Icon = TYPE_ICONS[row.type];
  const title = row.items.map((i) => i.name).join(' · ');
  return (
    <li
      data-testid="orders-queue-card"
      data-code={row.code}
      className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-md shadow-level-1 dark:bg-surface-container-low"
    >
      <div className="flex items-start gap-space-sm">
        <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-md bg-surface-container text-primary">
          <Icon className="size-6" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-space-xs">
          <div className="flex flex-wrap items-center gap-space-xs">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-outline-variant px-3 text-caption font-semibold text-on-surface">
              <Icon aria-hidden className="size-4" /> {ORDER_TYPE_LABELS[row.type]}
            </span>
            <OrderStatusChip status={row.status} />
          </div>
          <h2 className="text-title-md text-on-surface">{title}</h2>
        </div>
        <CodeText code={row.code} />
      </div>

      <div className="flex flex-col gap-space-xs rounded-md bg-surface-container-low p-space-sm dark:bg-surface-container">
        <p className="flex flex-wrap items-center gap-x-space-sm gap-y-1 font-mono text-code-sm text-on-surface tabular-nums">
          <span title="Código del paciente">{row.patientCode}</span>
          <span aria-hidden>·</span>
          <span title="Código de la visita">{row.encounter.code}</span>
          {row.items.map((i) => (
            <span key={i.code}>
              <span aria-hidden>· </span>
              {i.code} · Cant. {i.quantity}
            </span>
          ))}
        </p>
        <p className="flex items-center gap-space-xs text-body-md text-on-surface">
          <ClipboardList aria-hidden className="size-4 shrink-0 text-on-surface-variant" />
          Ordenada {formatTime(row.orderedAt, timeZone)} por {personText(row.orderedBy)}
          {row.completedAt ? ` · Completada ${formatTime(row.completedAt, timeZone)}` : ''}
          {row.cancelledAt ? ` · Cancelada ${formatTime(row.cancelledAt, timeZone)}` : ''}
        </p>
        <p className={cn('flex items-center gap-space-xs text-body-md', row.assignedTo ? 'text-on-surface' : 'text-on-surface-variant italic')}>
          {row.assignedTo ? <UserCheck aria-hidden className="size-4 shrink-0" /> : <UserX aria-hidden className="size-4 shrink-0" />}
          {row.assignedTo ? `Asignada a ${personText(row.assignedTo)}` : 'Sin asignar'}
        </p>
        {row.type === 'lab' ? (
          row.lab ? (
            <p className="flex items-center gap-space-xs text-body-md text-on-surface">
              <FlaskConical aria-hidden className="size-4 shrink-0 text-on-surface-variant" /> Laboratorio: {row.lab.name}
            </p>
          ) : (
            <div className="flex">
              <SemanticChip tone="warning" label={NO_LAB_TEXT} />
            </div>
          )
        ) : null}
        <p className="flex items-center gap-space-xs text-body-md text-on-surface-variant">
          <Activity aria-hidden className="size-4 shrink-0" /> Visita: {VISIT_STATUS_LABELS[row.encounter.status]}
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-space-sm">
        <Button variant="tonal" className="text-on-surface" onClick={onOpen} aria-label={`Abrir la visita ${row.encounter.code}`}>
          <ExternalLink aria-hidden className="size-5" /> Abrir visita
        </Button>
        <OrderActions order={row} visitStatus={row.encounter.status} onChanged={onChanged} />
      </div>
    </li>
  );
}
