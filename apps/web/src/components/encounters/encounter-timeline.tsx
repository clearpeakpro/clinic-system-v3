import { VISIT_STATUS_LABELS, type EncounterTimelineEntry } from '@clinic/shared';
import { DateTimeText, EmptyState, SemanticChip, VisitStatusChip } from '@clinic/ui';
import { ArrowRight, DoorOpen, History, ShieldAlert } from 'lucide-react';
import { actorText } from '../../lib/encounters.ts';

// S-CLI-24 Pestaña «Historial»: cada cambio de estado, del más reciente al
// más antiguo (por versión). Icono de entrada, flecha o escudo si fue
// forzado; «{anterior} → [nuevo]» y el chip «Forzado»; «{fecha hora} · por
// {quién} · v{versión}»; el motivo en cursiva. Horas en la zona de la sede.

export function EncounterTimeline({ entries, timeZone }: { entries: EncounterTimelineEntry[]; timeZone: string }) {
  if (entries.length === 0) return <EmptyState icon={History} title="Aún no hay historial." />;
  return (
    <ol aria-label="Historial de estados" className="flex flex-col gap-space-sm">
      {entries.map((e) => {
        const Icon = e.forced ? ShieldAlert : e.fromStatus === null ? DoorOpen : ArrowRight;
        return (
          <li key={e.id} className="flex gap-space-md rounded-lg bg-surface-container-lowest p-space-md shadow-level-1 dark:bg-surface-container-low">
            <span
              aria-hidden
              className={
                e.forced
                  ? 'flex size-10 shrink-0 items-center justify-center rounded-full bg-status-waiting-container text-status-waiting'
                  : 'flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-container text-primary dark:bg-surface-container-high'
              }
            >
              <Icon className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="flex flex-wrap items-center gap-space-xs text-body-lg-medium text-on-surface">
                {e.fromStatus === null ? (
                  'Registrado'
                ) : (
                  <>
                    {VISIT_STATUS_LABELS[e.fromStatus]} <span aria-label="a">→</span> <VisitStatusChip status={e.toStatus} />
                  </>
                )}
                {e.forced ? <SemanticChip tone="warning" label="Forzado" /> : null}
              </p>
              <p className="text-body-md text-on-surface-variant">
                <DateTimeText value={e.occurredAt} timeZone={timeZone} /> {`· por ${actorText(e.actor)} · v${String(e.version)}`}
              </p>
              {e.reason ? <p className="text-body-md break-words text-on-surface italic">{e.reason}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
