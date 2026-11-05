import { COVERAGE_TYPE_LABELS, type CheckoutQueue, type CheckoutQueueRow } from '@clinic/shared';
import { Button, CodeText, EmptyState, ErrorState, Field, formatTime, MoneyText, RefreshBar, Spinner, StaleDataBanner, useSnackbar, VisitStatusChip } from '@clinic/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Clock, Play, ReceiptText, RotateCw, Search, ShieldCheck, Stethoscope } from 'lucide-react';
import { useEffect, useState } from 'react';
import { OpenOrdersDialog } from '../components/encounters/open-orders-dialog.tsx';
import { PanelLiveChip } from '../components/panel/live-chip.tsx';
import { api, type ApiError } from '../lib/api.ts';
import { billingMessage, checkoutQueueSubtitle } from '../lib/billing.ts';
import { durationText, isOpenOrders, isVersionConflict, VERSION_CONFLICT_TEXT } from '../lib/encounters.ts';
import { RESYNC_MS } from '../lib/realtime.ts';
import { useActiveLocation, useLiveState } from '../lib/session.ts';

// S-CAJ-01 Caja y S-CAJ-02 tarjeta de la cola (Stitch: design/stitch/caja/S-CAJ-01_caja), T-027.
// De Stitch: el título con el número de visitas, «Actualizar», el buscador,
// los dos grupos («En caja» primero, después «Listo para caja») y las
// tarjetas con nombre, códigos, «Lista desde», proveedor, cobertura, el saldo
// y «Iniciar caja» / «Continuar». No se construye lo que el sistema no tiene
// (cobrado hoy, terminal, cierre de lote, firma): llega con T-028 y T-031 o
// no está en V1.
//  - Recepción (checkout.access). El orden y el saldo los da el servidor; la
//    búsqueda (nombre, código del paciente o de la visita; ADR 0012) también.
//  - «Iniciar caja» (el manual decía «Iniciar checkout») pasa la visita a
//    «En caja» por la máquina de estados; con órdenes abiertas, el diálogo
//    S-CAJ-06 (en el manual era un aviso suelto). Abrir no cambia el estado.
//  - En vivo con `encounter.changed` y `billing.changed`; sin conexión, cada
//    30 s. Cronómetro con la hora del servidor.

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

export function CheckoutQueuePage({ sede }: { sede: string }) {
  const active = useActiveLocation();
  const live = useLiveState();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [openOrders, setOpenOrders] = useState<string | null>(null);
  const ready = active?.code === sede;
  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search.trim()); }, 300);
    return () => { clearTimeout(timer); };
  }, [search]);
  const queue = useQuery<CheckoutQueue, ApiError>({
    queryKey: ['checkout-queue', active?.id, query],
    queryFn: () => api.checkoutQueue(query),
    enabled: ready,
    refetchInterval: live.status === 'connected' ? false : RESYNC_MS,
  });
  const data = queue.data;
  const now = useServerNow(data?.serverNow, queue.dataUpdatedAt);
  const timeZone = active?.timezone ?? 'UTC';

  const open = (row: CheckoutQueueRow) => {
    void navigate({ to: '/app/$sede/caja/$id', params: { sede, id: row.encounterId } });
  };
  const start = async (row: CheckoutQueueRow) => {
    setBusy(row.encounterId);
    try {
      await api.encounterTransition(row.encounterId, { action: 'start_checkout', expectedVersion: row.version });
      snackbar({ message: 'Caja iniciada.' });
      open(row);
    } catch (error) {
      if (isOpenOrders(error)) setOpenOrders(row.encounterId);
      else snackbar({ message: isVersionConflict(error) ? VERSION_CONFLICT_TEXT : billingMessage(error) });
    } finally {
      setBusy(null);
      await queryClient.invalidateQueries({ queryKey: ['checkout-queue'] });
    }
  };

  const inCheckout = data?.rows.filter((r) => r.status === 'CHECKOUT') ?? [];
  const waiting = data?.rows.filter((r) => r.status === 'READY_FOR_CHECKOUT') ?? [];

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-space-lg">
      <header className="flex flex-wrap items-start justify-between gap-space-md">
        <div className="flex min-w-0 items-center gap-space-md">
          <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-status-checkout-container text-status-checkout">
            <ReceiptText className="size-7" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 id="page-title" className="text-headline-lg text-on-surface">
              Caja
            </h1>
            {data ? (
              <p className="text-body-lg text-on-surface-variant" data-testid="checkout-queue-subtitle">
                {checkoutQueueSubtitle(data.rows.length)}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-space-sm">
          <PanelLiveChip />
          <Button variant="outline" onClick={() => void queue.refetch()} aria-label="Actualizar" title="Actualizar">
            <RotateCw aria-hidden className="size-5" />
            <span className="hidden tab:inline">Actualizar</span>
          </Button>
        </div>
      </header>

      <Field
        label="Buscar por nombre, código de visita o del paciente"
        hideLabel
        placeholder="Buscar por nombre, código de visita o del paciente"
        icon={<Search className="size-5" />}
        value={search}
        maxLength={120}
        onChange={(e) => { setSearch(e.target.value); }}
      />

      {!data ? (
        queue.error ? (
          <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />
        ) : (
          <Spinner />
        )
      ) : (
        <div className="flex flex-col gap-space-lg">
          {queue.error ? <StaleDataBanner error={queue.error} onRetry={() => void queue.refetch()} /> : queue.isFetching ? <RefreshBar /> : <div aria-hidden className="h-0.5" />}
          {data.rows.length === 0 ? (
            <EmptyState icon={ReceiptText} title={query ? 'Ninguna visita coincide con la búsqueda.' : 'No hay visitas listas para Caja.'} />
          ) : (
            <>
              <Group title="En caja" rows={inCheckout} now={now} timeZone={timeZone} busy={busy} onOpen={open} onStart={start} />
              <Group title="Listo para caja" rows={waiting} now={now} timeZone={timeZone} busy={busy} onOpen={open} onStart={start} />
            </>
          )}
        </div>
      )}
      <OpenOrdersDialog
        open={openOrders !== null}
        onClose={() => { setOpenOrders(null); }}
        onGoToOrders={() => {
          if (openOrders) void navigate({ to: '/app/$sede/visitas/$id', params: { sede, id: openOrders }, search: { section: 'orders' } });
        }}
      />
    </section>
  );
}

function Group({
  title,
  rows,
  now,
  timeZone,
  busy,
  onOpen,
  onStart,
}: {
  title: string;
  rows: CheckoutQueueRow[];
  now: number;
  timeZone: string;
  busy: string | null;
  onOpen: (row: CheckoutQueueRow) => void;
  onStart: (row: CheckoutQueueRow) => Promise<void>;
}) {
  if (rows.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-space-sm">
      <h2 className="text-title-md tracking-wide text-on-surface uppercase">{`${title} (${String(rows.length)})`}</h2>
      <ul className="grid gap-space-md desk:grid-cols-2">
        {rows.map((row) => (
          <li
            key={row.encounterId}
            data-testid="checkout-card"
            data-code={row.code}
            className="flex flex-col gap-space-md rounded-lg border-l-4 border-l-status-checkout bg-surface-container-lowest p-space-md shadow-level-1 dark:bg-surface-container-low"
          >
            <div className="flex flex-wrap items-start justify-between gap-space-sm">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-headline-sm text-on-surface">{`${row.patient.firstName} ${row.patient.lastName}`}</span>
                <span className="flex flex-wrap items-center gap-space-xs">
                  <CodeText code={row.patient.code} />
                  <CodeText code={row.code} />
                </span>
              </div>
              <VisitStatusChip status={row.status} />
            </div>
            <div className="flex flex-wrap gap-x-space-md gap-y-space-xs text-body-md text-on-surface-variant">
              <span className="inline-flex items-center gap-1">
                <Clock aria-hidden className="size-4" /> {`Lista desde ${formatTime(row.readySince, timeZone)} · ${durationText(now - new Date(row.readySince).getTime())}`}
              </span>
              <span className="inline-flex items-center gap-1">
                <Stethoscope aria-hidden className="size-4" /> {row.provider ?? 'Sin asignar'}
              </span>
              <span className="inline-flex items-center gap-1">
                <ShieldCheck aria-hidden className="size-4" /> {row.coverageType ? COVERAGE_TYPE_LABELS[row.coverageType] : 'Sin cobertura'}
              </span>
              <span>{row.appointmentType ?? 'Sin cita'}</span>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-space-sm">
              <div className="flex flex-col">
                <span className="text-caption tracking-wide text-on-surface-variant uppercase">Saldo</span>
                <MoneyText cents={row.balanceCents} className="text-headline-md font-bold text-on-surface" />
              </div>
              <div className="flex flex-wrap gap-space-sm">
                <Button variant="tonal" onClick={() => { onOpen(row); }}>
                  {row.status === 'CHECKOUT' ? 'Continuar' : 'Abrir'}
                </Button>
                {row.status === 'READY_FOR_CHECKOUT' ? (
                  <Button loading={busy === row.encounterId} disabled={busy !== null} onClick={() => void onStart(row)}>
                    <Play aria-hidden className="size-5" /> Iniciar caja
                  </Button>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
