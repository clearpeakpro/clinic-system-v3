import type { PanelMetrics, PanelRow, WaitThresholds } from '@clinic/shared';
import { cn } from '@clinic/ui';
import { BriefcaseMedical, Calculator, CircleCheck, CircleCheckBig, ClipboardPlus, Hourglass, Stethoscope, UserSearch, Users, type LucideIcon } from 'lucide-react';
import { PANEL_CARDS, worstLevel, type PanelGroup } from '../../lib/panel.ts';
import { WaitBadge } from './wait-badge.tsx';

// S-REC-02 Tarjetas de métricas (Stitch: design/stitch/recepcion/S-REC-01_panel).
//  - Números del servidor; «–» mientras cargan o si no hay datos.
//  - Tocar una tarjeta filtra la lista y tocarla de nuevo vuelve a «Todos los
//    abiertos»; se anuncia como botón pulsado. «Pacientes hoy» no se toca.
//  - Teléfono: franja horizontal desplazable de 150 px; tableta, 3 columnas;
//    pantalla ancha, 5 columnas (manual).
//  - «Alerta» / «Crítico» (ADR 0039): la marca más grave de sus visitas.

const ICONS: Record<keyof PanelMetrics, LucideIcon> = {
  patientsToday: Users,
  waiting: Hourglass,
  withNurse: ClipboardPlus,
  waitingForProvider: UserSearch,
  withProvider: Stethoscope,
  procedurePending: BriefcaseMedical,
  readyForCheckout: CircleCheck,
  checkout: Calculator,
  completedToday: CircleCheckBig,
};

export function MetricCards({
  metrics,
  rows,
  now,
  thresholds,
  selected,
  onSelect,
}: {
  metrics: PanelMetrics | undefined;
  rows: readonly PanelRow[];
  now: number;
  thresholds: WaitThresholds | undefined;
  selected: PanelGroup;
  onSelect: (group: PanelGroup) => void;
}) {
  return (
    <ul
      aria-label="Resumen del día"
      className="relative -mx-4 flex snap-x gap-space-sm overflow-x-auto px-4 pb-1 tab:mx-0 tab:grid tab:grid-cols-3 tab:overflow-visible tab:px-0 desk:grid-cols-5"
    >
      {PANEL_CARDS.map((card) => {
        const Icon = ICONS[card.metric];
        const value = metrics ? String(metrics[card.metric]) : '–';
        const level = card.group && thresholds ? worstLevel(rows, card.group, now, thresholds) : 'none';
        const isSelected = card.group !== null && card.group === selected;
        const body = (
          <>
            <span className="flex items-start justify-between gap-space-xs">
              <Icon aria-hidden className={cn('size-6 shrink-0', isSelected ? 'text-on-primary-fixed' : 'text-primary')} />
              <WaitBadge level={level} />
            </span>
            <span className="font-mono text-headline-lg tabular-nums" data-testid={`metric-${card.metric}`}>
              {value}
            </span>
            <span className={cn('truncate text-caption', isSelected ? 'text-on-primary-fixed' : 'text-on-surface-variant')}>{card.label}</span>
          </>
        );
        const base = cn(
          'flex h-full min-h-28 w-full flex-col justify-between gap-space-xs rounded-lg p-space-md text-left shadow-level-1',
          isSelected ? 'bg-primary-fixed text-on-primary-fixed' : 'bg-surface-container-lowest text-on-surface dark:bg-surface-container-low',
        );
        const group = card.group;
        return (
          <li key={card.metric} className="flex w-[150px] shrink-0 snap-start tab:w-auto">
            {group === null ? (
              <div className={base}>{body}</div>
            ) : (
              <button
                type="button"
                aria-pressed={isSelected}
                aria-label={`${card.label}: ${value}${level === 'none' ? '' : `, ${level === 'alert' ? 'Alerta' : 'Crítico'}`}`}
                onClick={() => { onSelect(isSelected ? 'open' : group); }}
                className={cn(base, 'transition-colors hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-primary', isSelected && 'hover:bg-primary-fixed-dim')}
              >
                {body}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
