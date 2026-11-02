import { VISIT_STATUS_LABELS, type PanelRow, type WaitThresholds } from '@clinic/shared';
import { cn, copyText, DataTable, DateTimeText, RouteBadge, useSnackbar, VisitStatusChip, type Column } from '@clinic/ui';
import { CircleCheckBig, Timer } from 'lucide-react';
import { useRef } from 'react';
import { inStatusText, providerLabel, rowWaitLevel, shortCode, waitingText } from '../../lib/panel.ts';
import { WaitBadge } from './wait-badge.tsx';

// S-REC-04 Lista en vivo: tabla desde 600 px y tarjetas en el teléfono.
//  - Del paciente, solo nombre y código corto (mínimo necesario); mantener
//    pulsado el código copia el completo.
//  - «Tiempo de espera»: desde la llegada con la hora del servidor; en las
//    completadas, «Finalizada». Junto a él, «Alerta» o «Crítico» (ADR 0039),
//    contados desde el estado actual; la fila crítica, con fondo rojo suave.
//  - Toda fila abre la visita; el nombre es además un botón para el teclado.

const LONG_PRESS_MS = 600;

function PatientCode({ code }: { code: string }) {
  const snackbar = useSnackbar();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copied = useRef(false);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <span
      title={code}
      className="w-fit font-mono text-code-sm text-on-surface-variant tabular-nums select-none"
      onPointerDown={() => {
        copied.current = false;
        cancel();
        timer.current = setTimeout(() => {
          copied.current = true;
          void copyText(code).then((ok) => { if (ok) snackbar({ message: `Código ${code} copiado.` }); });
        }, LONG_PRESS_MS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onClickCapture={(event) => {
        // Tras copiar, el toque no abre la visita.
        if (copied.current) {
          event.stopPropagation();
          copied.current = false;
        }
      }}
      onContextMenu={(event) => { event.preventDefault(); }}
    >
      {shortCode(code)}
    </span>
  );
}

export function QueueList({
  rows,
  now,
  thresholds,
  timeZone,
  myMembershipId,
  onOpen,
}: {
  rows: PanelRow[];
  now: number;
  thresholds: WaitThresholds;
  timeZone: string;
  myMembershipId: string;
  onOpen: (row: PanelRow) => void;
}) {
  const columns: Column<PanelRow>[] = [
    {
      key: 'paciente',
      header: 'Paciente',
      primary: true,
      cell: (r) => (
        <span className="flex min-w-0 flex-col">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpen(r);
            }}
            aria-label={`Abrir la visita de ${r.patient.firstName} ${r.patient.lastName}`}
            className="w-fit rounded-sm text-left text-body-lg-medium text-on-surface underline-offset-4 hover:underline"
          >
            {r.patient.firstName} {r.patient.lastName}
          </button>
          <PatientCode code={r.patient.code} />
        </span>
      ),
    },
    { key: 'llegada', header: 'Llegada', cell: (r) => <DateTimeText value={r.arrivedAt} timeZone={timeZone} format="time" /> },
    {
      key: 'espera',
      header: 'Tiempo de espera',
      cell: (r) => {
        const level = rowWaitLevel(r, now, thresholds);
        const text = waitingText(r, now);
        const finished = text === 'Finalizada';
        return (
          <span className="flex flex-wrap items-center gap-space-xs">
            <span className={cn('flex items-center gap-1 whitespace-nowrap tabular-nums', finished ? 'text-on-surface-variant' : 'font-mono text-code-md text-on-surface')}>
              {finished ? <CircleCheckBig aria-hidden className="size-4" /> : <Timer aria-hidden className="size-4 text-on-surface-variant" />}
              <span className="sr-only">{finished ? '' : 'Esperando '}</span>
              <span data-testid="queue-waiting">{text}</span>
            </span>
            <WaitBadge level={level} detail={`${inStatusText(r, now)} en ${VISIT_STATUS_LABELS[r.status]}`} />
          </span>
        );
      },
    },
    {
      key: 'estado',
      header: 'Estación actual',
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-space-xs">
          <VisitStatusChip status={r.status} />
          <RouteBadge route={r.route} />
        </span>
      ),
    },
    {
      key: 'proveedor',
      header: 'Proveedor',
      cell: (r) => {
        const p = providerLabel(r, myMembershipId);
        return <span className={cn(p.unassigned && 'text-on-surface-variant italic')}>{p.text}</span>;
      },
    },
    { key: 'tipo', header: 'Tipo de cita', cell: (r) => r.appointmentType ?? <span className="text-on-surface-variant">Sin cita</span> },
  ];
  return (
    <DataTable
      caption="Pacientes en la clínica"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      onRowClick={onOpen}
      rowClassName={(r) => (rowWaitLevel(r, now, thresholds) === 'critical' ? 'bg-error-container/40 dark:bg-error-container/20' : undefined)}
    />
  );
}
