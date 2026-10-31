import type { AgendaAppointment } from '@clinic/shared';
import { AppointmentStatusChip, cn, CodeText } from '@clinic/ui';
import { BriefcaseMedical, Stethoscope } from 'lucide-react';
import { providerLabel, timeRange, typeLabel } from '../../lib/appointments.ts';
import { AGENDA_STRIPE } from '../catalog/catalog-dialog.tsx';

// Tarjeta de cita (S-REC-07; Stitch: design/stitch/recepcion/S-REC-06_citas_vista_dia).
// De Stitch: rango horario y duración en recuadro, chip de estado, código y
// nombre del paciente, tipo y proveedor con icono. El color del tipo de cita
// va solo como franja lateral, nunca como chip, para no confundirlo con el
// estado (T-014). Sin el código de la cita (va en la vista Lista y en el
// detalle), sin botones (T-015 y fase 3) ni consultorio. Cancelada y No se
// presentó se ven atenuadas, y la cancelada con el nombre tachado, como en
// Stitch. Se atenúan con el color de texto secundario y la superficie, nunca
// con transparencia, para mantener el contraste (WCAG AA).

export function AppointmentCard({
  appointment: a,
  timeZone,
  myMembershipId,
  onOpen,
  className,
}: {
  appointment: AgendaAppointment;
  timeZone: string;
  myMembershipId: string;
  onOpen: (appointment: AgendaAppointment) => void;
  className?: string;
}) {
  const provider = providerLabel(a.provider, myMembershipId);
  const muted = a.status === 'CANCELLED' || a.status === 'NO_SHOW';
  const name = `${a.patient.firstName} ${a.patient.lastName}`;
  return (
    <button
      type="button"
      onClick={() => { onOpen(a); }}
      aria-label={`${timeRange(a.startsAt, a.durationMinutes, timeZone)}, ${name}. Abrir la cita`}
      className={cn(
        'relative flex min-h-touch w-full flex-col gap-space-sm overflow-hidden rounded-lg py-space-md pr-space-md pl-space-lg text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary',
        muted
          ? 'bg-surface-container-low hover:bg-surface-container dark:bg-surface-container dark:hover:bg-surface-container-high'
          : 'bg-surface-container-lowest shadow-level-1 hover:bg-surface-container-low dark:bg-surface-container-low dark:hover:bg-surface-container',
        className,
      )}
      data-testid="appointment-card"
    >
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1.5', AGENDA_STRIPE[a.type.color])} data-testid="type-stripe" />
      <span className="flex items-start justify-between gap-space-xs">
        <span
          className={cn(
            'min-w-0 rounded-sm bg-surface-container px-1.5 py-0.5 font-mono text-code-sm tabular-nums dark:bg-surface-container-high',
            muted ? 'text-on-surface-variant' : 'text-on-surface',
          )}
        >
          {timeRange(a.startsAt, a.durationMinutes, timeZone)} · {a.durationMinutes} min
        </span>
        <AppointmentStatusChip status={a.status} />
      </span>
      <span className="flex flex-wrap items-baseline gap-x-space-sm gap-y-1">
        <CodeText code={a.patient.code} />
        <span className={cn('text-body-lg-medium', muted ? 'text-on-surface-variant' : 'text-on-surface', a.status === 'CANCELLED' && 'line-through')}>{name}</span>
      </span>
      <span className={cn('flex items-center gap-space-xs text-body-md', muted ? 'text-on-surface-variant' : 'text-on-surface')}>
        <Stethoscope aria-hidden className="size-5 shrink-0 text-on-surface-variant" />
        {typeLabel(a.type)}
      </span>
      <span className="flex items-center gap-space-xs text-body-md text-on-surface-variant">
        <BriefcaseMedical aria-hidden className="size-4 shrink-0" />
        <span className={cn(provider.unassigned && 'italic')}>{provider.text}</span>
      </span>
    </button>
  );
}
