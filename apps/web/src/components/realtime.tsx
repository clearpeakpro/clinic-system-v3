import { notificationText, type NotificationKind } from '@clinic/shared';
import { Button, cn, EmptyState, ErrorState, FloatingPanel, Spinner, useSnackbar } from '@clinic/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing, CalendarClock, CircleArrowUp, ClipboardList, CloudOff, RefreshCw, RefreshCwOff, Settings, ShieldAlert, Trash2, UserCog, UserRoundCheck, X, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ComponentProps } from 'react';
import { api, type NotificationItem } from '../lib/api.ts';
import { failureMessage } from '../lib/errors.ts';
import { notificationAge } from '../lib/format.ts';
import type { LiveStatus } from '../lib/realtime.ts';
import { keys, realtime, useLiveState, useNotifications } from '../lib/session.ts';

// Cabecera del marco en tiempo real (T-009): indicador «En vivo» (S-GEN-14),
// banner de modo degradado (S-GEN-19) y campana con el centro de
// notificaciones (S-GEN-15). Aspecto de Stitch (S-GEN-12); lo que Stitch no
// dibuja (otros estados del indicador, el panel) sale de la ficha del manual.

const LIVE_LABELS: Record<LiveStatus, string> = {
  connected: 'En vivo',
  connecting: 'Reconectando…',
  disconnected: 'Sin conexión',
};

/** S-GEN-14. Icono + texto (solo icono con tooltip por debajo de 600 px). */
export function LiveIndicatorView({ status }: { status: LiveStatus }) {
  const label = LIVE_LABELS[status];
  return (
    <div
      role="status"
      title={label}
      data-status={status}
      className="flex shrink-0 items-center gap-space-xs rounded-full bg-surface-container px-space-sm py-1 dark:bg-surface-container-high"
    >
      {status === 'connected' ? (
        // Como en Stitch: punto con pulso (sin animación si se pide menos movimiento).
        <span aria-hidden className="relative flex size-2.5">
          <span className="absolute inline-flex size-full rounded-full bg-primary opacity-75 motion-safe:animate-ping" />
          <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
        </span>
      ) : status === 'connecting' ? (
        <RefreshCw aria-hidden className="size-4 text-tertiary" />
      ) : (
        <CloudOff aria-hidden className="size-4 text-error" />
      )}
      <span className="sr-only">Actualizaciones en vivo: {label}</span>
      <span
        aria-hidden
        className={cn(
          'hidden text-caption tab:inline',
          status === 'connected' ? 'text-primary' : status === 'connecting' ? 'text-tertiary' : 'text-error',
        )}
      >
        {label}
      </span>
    </div>
  );
}

export function LiveIndicator() {
  return <LiveIndicatorView status={useLiveState().status} />;
}

export const DEGRADED_TEXT = 'Las actualizaciones en vivo están demoradas: las pantallas se actualizan solas cada 30 segundos.';

/** S-GEN-19 (solo actualizaciones en vivo: aún no hay documentos). Franja bajo la cabecera. */
export function DegradedBannerView({ onHide }: { onHide: () => void }) {
  return (
    <div role="status" className="flex min-h-touch shrink-0 items-center gap-space-sm bg-status-waiting-container pr-space-xs pl-4 text-status-waiting tab:pl-space-lg">
      <RefreshCwOff aria-hidden className="size-5 shrink-0" />
      <p className="min-w-0 flex-1 text-body-md-medium">{DEGRADED_TEXT}</p>
      <button
        type="button"
        aria-label="Ocultar aviso"
        title="Ocultar aviso"
        onClick={onHide}
        className="flex size-12 shrink-0 items-center justify-center rounded-md hover:bg-status-waiting-border/50"
      >
        <X aria-hidden className="size-5" />
      </button>
    </div>
  );
}

export function DegradedBanner() {
  const state = useLiveState();
  if (!state.degraded || state.bannerHidden) return null;
  return (
    <DegradedBannerView
      onHide={() => {
        realtime.hideBanner();
      }}
    />
  );
}

const KIND_ICONS: Record<NotificationKind, LucideIcon> = {
  'encounter.provider_assigned': UserRoundCheck,
  'appointment.changed': CalendarClock,
  'order.created': ClipboardList,
  'order.changed': ClipboardList,
  'system.setup_incomplete': Settings,
  'system.client_outdated': CircleArrowUp,
  'security.alert': ShieldAlert,
  'membership.owner_clinical_roles': UserCog,
};

/** Lista del panel. Tocar un aviso lo marca como leído (y cierra el panel). */
export function NotificationList({ rows, now, onOpen }: { rows: NotificationItem[]; now: number; onOpen: (item: NotificationItem) => void }) {
  if (rows.length === 0) {
    return (
      <div className="p-space-md">
        <EmptyState icon={Bell} title="Está al día" description="Las asignaciones y alertas para usted aparecerán aquí." />
      </div>
    );
  }
  return (
    <ul className="flex flex-col py-space-xs">
      {rows.map((item) => {
        const Icon = KIND_ICONS[item.kind];
        const { title, body } = notificationText(item.kind, item.code);
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => {
                onOpen(item);
              }}
              className="flex min-h-16 w-full items-center gap-space-sm px-space-md py-space-sm text-left hover:bg-surface-container-low dark:hover:bg-surface-container"
            >
              <span
                aria-hidden
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-container dark:bg-surface-container-high',
                  item.read ? 'text-outline' : 'text-primary',
                )}
              >
                <Icon className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn('truncate text-body-md text-on-surface', !item.read && 'font-semibold')}>{title}</span>
                <span className="truncate text-caption text-on-surface-variant">
                  {body} · {notificationAge(item.createdAt, now)}
                </span>
              </span>
              {item.read ? null : (
                <span className="flex shrink-0 items-center">
                  <span aria-hidden className="size-2.5 rounded-full bg-primary" />
                  <span className="sr-only">Sin leer</span>
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** La campana como en Stitch, con el número de no leídas. */
export function BellButton({ unread, ...props }: { unread: number } & ComponentProps<'button'>) {
  const Icon = unread > 0 ? BellRing : Bell;
  return (
    <button
      type="button"
      title="Notificaciones"
      aria-label={unread > 0 ? `Notificaciones, ${String(unread)} sin leer` : 'Notificaciones'}
      className="relative flex size-12 shrink-0 items-center justify-center rounded-md text-on-surface hover:bg-surface-container-low dark:hover:bg-surface-container-high"
      {...props}
    >
      <Icon aria-hidden className="size-6" />
      {unread > 0 ? (
        <span
          aria-hidden
          className="absolute top-1 right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1 text-caption text-on-error"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </button>
  );
}

/** S-GEN-15 Centro de notificaciones de la organización activa. */
export function NotificationCenter({ organizationId }: { organizationId: string }) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const query = useNotifications(organizationId);
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const unread = query.data?.unread ?? 0;
  const rows = query.data?.rows ?? [];

  // La antigüedad se actualiza mientras el panel está abierto.
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [open]);

  const run = async (action: () => Promise<unknown>, what: string) => {
    try {
      await action();
    } catch (error) {
      snackbar({ message: failureMessage(error, what) });
    } finally {
      await queryClient.invalidateQueries({ queryKey: keys.notifications(organizationId) });
    }
  };

  return (
    <FloatingPanel
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setNow(Date.now());
          void query.refetch();
        }
      }}
      title="Notificaciones"
      trigger={<BellButton unread={unread} />}
      actions={
        <>
          {unread > 0 ? (
            <Button variant="text" onClick={() => void run(api.readAllNotifications, 'marcar las notificaciones como leídas')}>
              Marcar todo como leído
            </Button>
          ) : null}
          {rows.length > 0 ? (
            <Button
              variant="text"
              aria-label="Borrar"
              title="Borrar"
              className="w-12 px-0 text-on-surface-variant"
              onClick={() => void run(api.clearNotifications, 'borrar las notificaciones')}
            >
              <Trash2 aria-hidden className="size-5" />
            </Button>
          ) : null}
        </>
      }
    >
      {query.isPending ? (
        <div className="flex justify-center p-space-lg">
          <Spinner />
        </div>
      ) : query.isError && !query.data ? (
        <div className="p-space-md">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : (
        <NotificationList
          rows={rows}
          now={now}
          onOpen={(item) => {
            setOpen(false);
            // Los enlaces a cada pantalla llegan con su fase; por ahora solo se marca como leído.
            if (!item.read) void run(() => api.readNotification(item.id), 'marcar la notificación como leída');
          }}
        />
      )}
    </FloatingPanel>
  );
}
