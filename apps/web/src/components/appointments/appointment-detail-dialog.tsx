import { isFinalAppointmentStatus, type AppointmentDetail } from '@clinic/shared';
import { AppointmentStatusChip, AsyncView, Button, cn, CodeText, DateTimeText, Dialog } from '@clinic/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BriefcaseMedical, CalendarDays, CircleUser, Clock, Hash, Info, MessageSquareText, NotebookText, Stethoscope } from 'lucide-react';
import type { ReactNode } from 'react';
import { api, type ApiError } from '../../lib/api.ts';
import { localDay, longDay, providerLabel, timeRange, typeLabel } from '../../lib/appointments.ts';

// S-REC-09 Detalle de la cita («Cita»), en solo lectura (T-014): las acciones
// (Editar, Reprogramar, Confirmar, Cancelar, No presentado y Registrar
// llegada) llegan con T-015 y la fase 3. Diálogo de 560 px; en el teléfono,
// hoja inferior. Las notas y el motivo de cancelación llegan descifrados del
// servidor, que audita cada apertura; no se guardan en caché al cerrar.

export function AppointmentDetailDialog({
  appointmentId,
  sede,
  myMembershipId,
  onClose,
}: {
  appointmentId: string;
  sede: string;
  myMembershipId: string;
  onClose: () => void;
}) {
  const detail = useQuery<AppointmentDetail, ApiError>({
    queryKey: ['appointment', appointmentId],
    queryFn: () => api.appointment(appointmentId),
    staleTime: 0,
    gcTime: 0,
    retry: (failures: number, error: ApiError) => error.status >= 500 && failures < 2,
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Cita"
      wide
      sheetOnPhone
      icon={<CalendarDays className="size-6" />}
      footer={
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <AsyncView source={detail}>
        {(a) => {
          const provider = providerLabel(a.provider, myMembershipId);
          const day = localDay(a.startsAt, a.timeZone);
          return (
            <div className="flex flex-col gap-space-md">
              <div className="flex flex-wrap items-center justify-between gap-space-sm">
                <CodeText code={a.code} variant="block" label="Código de la cita" icon={Hash} copyable className="min-w-0 flex-1" />
                <AppointmentStatusChip status={a.status} />
              </div>
              <dl className="flex flex-col gap-space-sm">
                <Row icon={<CircleUser />} label="Paciente">
                  <Link
                    to="/app/$sede/pacientes/$id"
                    params={{ sede, id: a.patient.id }}
                    onClick={onClose}
                    className={cn('text-body-lg-medium text-primary underline-offset-4 hover:underline', a.status === 'CANCELLED' && 'line-through')}
                  >
                    {a.patient.firstName} {a.patient.lastName}
                  </Link>{' '}
                  <CodeText code={a.patient.code} />
                </Row>
                <Row icon={<CalendarDays />} label="Fecha">
                  {longDay(day)}, <DateTimeText value={a.startsAt} timeZone={a.timeZone} format="time" />
                </Row>
                <Row icon={<Clock />} label="Duración">
                  {timeRange(a.startsAt, a.durationMinutes, a.timeZone)} · {a.durationMinutes} min
                </Row>
                <Row icon={<Stethoscope />} label="Tipo de cita">
                  {typeLabel(a.type)}
                </Row>
                <Row icon={<BriefcaseMedical />} label="Proveedor">
                  <span className={cn(provider.unassigned && 'text-on-surface-variant italic')}>{provider.text}</span>
                </Row>
                {a.notes ? (
                  <Row icon={<NotebookText />} label="Notas">
                    <span className="break-words whitespace-pre-line">{a.notes}</span>
                  </Row>
                ) : null}
                {a.cancelReason ? (
                  <Row icon={<MessageSquareText />} label="Motivo">
                    <span className="break-words whitespace-pre-line">{a.cancelReason}</span>
                  </Row>
                ) : null}
              </dl>
              <p className="text-caption text-on-surface-variant">
                Creada el <DateTimeText value={a.createdAt} timeZone={a.timeZone} format="date" />
              </p>
              {isFinalAppointmentStatus(a.status) ? (
                <p className="flex items-center gap-space-xs rounded-md bg-surface-container-low p-space-sm text-body-md text-on-surface-variant dark:bg-surface-container">
                  <Info aria-hidden className="size-5 shrink-0" /> Esta cita está cerrada; no hay más acciones disponibles.
                </p>
              ) : null}
            </div>
          );
        }}
      </AsyncView>
    </Dialog>
  );
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[auto_8rem_1fr] items-start gap-x-space-sm max-tab:grid-cols-[auto_1fr]">
      <span aria-hidden className="mt-0.5 text-primary [&>svg]:size-5">
        {icon}
      </span>
      <dt className="text-body-md text-on-surface-variant">{label}</dt>
      <dd className="text-body-md text-on-surface max-tab:col-start-2">{children}</dd>
    </div>
  );
}
