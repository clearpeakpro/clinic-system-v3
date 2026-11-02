import { cn } from '@clinic/ui';
import { CloudOff, RefreshCw, Zap } from 'lucide-react';
import type { LiveStatus } from '../../lib/realtime.ts';
import { useLiveState } from '../../lib/session.ts';

// S-REC-05 Indicador de conexión del Panel: icono + texto con los textos del
// manual. Los colores son los del indicador global (S-GEN-14), para que los
// dos no se contradigan (nota del manual: allí «Sin conexión» era ámbar en el
// Panel y rojo en la cabecera). Solo informa: no bloquea la pantalla.

export const PANEL_LIVE_LABELS: Record<LiveStatus, string> = {
  connected: 'En vivo',
  connecting: 'Reconectando — los datos pueden estar desactualizados',
  disconnected: 'Sin conexión — los datos pueden estar desactualizados',
};

export function PanelLiveChipView({ status }: { status: LiveStatus }) {
  const Icon = status === 'connected' ? Zap : status === 'connecting' ? RefreshCw : CloudOff;
  return (
    <span
      role="status"
      data-testid="panel-live"
      data-status={status}
      title={PANEL_LIVE_LABELS[status]}
      className={cn(
        'inline-flex min-h-10 max-w-full items-center gap-space-xs rounded-full bg-surface-container px-space-sm text-caption font-semibold dark:bg-surface-container-high',
        status === 'connected' ? 'text-primary' : status === 'connecting' ? 'text-tertiary' : 'text-error',
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="truncate">{PANEL_LIVE_LABELS[status]}</span>
    </span>
  );
}

export function PanelLiveChip() {
  return <PanelLiveChipView status={useLiveState().status} />;
}
