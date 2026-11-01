import {
  appointmentActions,
  appointmentScope,
  isBookableDay,
  isCalendarDate,
  isClockTime,
  isFinalAppointmentStatus,
  type AppointmentAction,
  type AppointmentDetail,
  type AppointmentSaved,
} from '@clinic/shared';
import { AppointmentStatusChip, AsyncView, Banner, Button, cn, CodeText, ConfirmDialog, DateTimeText, Dialog, Field, Spinner, useSnackbar } from '@clinic/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  BriefcaseMedical,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarX,
  CircleUser,
  Clock,
  Hash,
  Info,
  LogIn,
  MessageSquareText,
  NotebookText,
  Pencil,
  RefreshCw,
  Stethoscope,
  UserX,
} from 'lucide-react';
import { useState, type ReactNode, type SubmitEvent } from 'react';
import { api, type ApiError } from '../../lib/api.ts';
import {
  appointmentMessage,
  isVersionConflict,
  localClock,
  localDay,
  longDay,
  overlapText,
  providerLabel,
  timeRange,
  typeLabel,
} from '../../lib/appointments.ts';
import { useMe } from '../../lib/session.ts';
import { AppointmentFormDialog, durationError, OverlapBanner, useOverlap } from './appointment-form-dialog.tsx';

// S-REC-09 Detalle de la cita («Cita»), con las acciones de T-015. Diálogo de
// 560 px; en el teléfono, hoja inferior. Los botones salen de la matriz
// estado × rol compartida (@clinic/shared, appointmentActions), la misma que
// aplica el servidor: Programada → Editar, Reprogramar, Confirmar, Cancelar,
// No presentado (desde la hora de inicio) y Registrar llegada (solo hoy y con
// appointments.check_in; abre S-REC-18, T-017); Confirmada, igual sin Confirmar; finales, ninguna. El
// Proveedor, solo en sus citas. El detalle sigue abierto tras cada acción y se
// actualiza; también cuando otra persona cambia la cita (evento en vivo). Las
// notas y el motivo llegan descifrados del servidor, que audita cada lectura.

/** Tras un cambio propio: la agenda (todos los días), el Panel y las citas del perfil. */
export function useAfterAppointmentChange() {
  const queryClient = useQueryClient();
  return async (appointmentId?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['agenda'] }),
      queryClient.invalidateQueries({ queryKey: ['today-count'] }),
      queryClient.invalidateQueries({ queryKey: ['patient-appointments'] }),
      appointmentId ? queryClient.invalidateQueries({ queryKey: ['appointment', appointmentId] }) : Promise.resolve(),
    ]);
  };
}

const OVERLAP_SUFFIX = ' El proveedor ya tiene una cita en ese horario.';
const withOverlap = (message: string, saved: AppointmentSaved) => (saved.warnings.includes('provider_overlap') ? `${message}${OVERLAP_SUFFIX}` : message);

type Open = null | 'edit' | 'reschedule' | 'cancel' | 'no_show' | 'conflict';

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
  const me = useMe();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const afterChange = useAfterAppointmentChange();
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const detail = useQuery<AppointmentDetail, ApiError>({
    queryKey: ['appointment', appointmentId],
    queryFn: () => api.appointment(appointmentId),
    staleTime: 0,
    gcTime: 0,
    retry: (failures: number, error: ApiError) => error.status >= 500 && failures < 2,
  });
  const permissions = me.data?.permissions ?? [];
  const scope = permissions.includes('appointments.manage') ? appointmentScope(me.data?.roles ?? []) : 'none';

  const done = async (message: string) => {
    setOpen(null);
    setBusy(false);
    await afterChange(appointmentId);
    snackbar({ message });
  };
  /** S-REC-16: se relee la cita y la agenda; lo que se estaba haciendo se pierde. */
  const conflict = () => {
    setBusy(false);
    setOpen('conflict');
  };
  const failed = (error: unknown) => {
    setBusy(false);
    if (isVersionConflict(error)) conflict();
    else snackbar({ message: appointmentMessage(error) });
  };
  /** Confirmar no pide confirmación (S-REC-09). */
  const confirm = async (a: AppointmentDetail) => {
    setBusy(true);
    try {
      await api.confirmAppointment(a.id, a.version);
      await done('Cita confirmada.');
    } catch (error) {
      failed(error);
    }
  };

  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next && !busy) onClose();
        }}
        title="Cita"
        wide
        sheetOnPhone
        icon={<CalendarDays className="size-6" />}
        footer={
          detail.data ? (
            <Actions
              actions={appointmentActions({
                status: detail.data.status,
                scope,
                isOwn: detail.data.provider?.membershipId === myMembershipId,
                canCheckIn: permissions.includes('appointments.check_in'),
                startsAt: detail.data.startsAt,
                now: new Date(),
                isToday: localDay(detail.data.startsAt, detail.data.timeZone) === localDay(new Date().toISOString(), detail.data.timeZone),
              })}
              busy={busy}
              onClose={onClose}
              onAction={(action) => {
                if (action === 'confirm') void confirm(detail.data);
                // S-REC-09 → S-REC-18: «Registrar llegada» cierra el detalle y abre el asistente.
                else if (action === 'check_in') void navigate({ to: '/app/$sede/llegada/$cita', params: { sede, cita: detail.data.id } });
                else setOpen(action);
              }}
            />
          ) : (
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          )
        }
      >
        <AsyncView source={detail}>
          {(a) => {
            const provider = providerLabel(a.provider, myMembershipId);
            const day = localDay(a.startsAt, a.timeZone);
            const notMine = scope === 'own' && a.provider?.membershipId !== myMembershipId;
            return (
              <div className="flex flex-col gap-space-md">
                <div className="flex flex-wrap items-center justify-between gap-space-sm">
                  <CodeText code={a.code} variant="block" label="Código de la cita" icon={Hash} copyable className="min-w-0 flex-1" />
                  <span className="flex items-center gap-space-sm">
                    {detail.isFetching ? <Spinner label="Actualizando…" /> : null}
                    <AppointmentStatusChip status={a.status} />
                  </span>
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
                  <Note>Esta cita está cerrada; no hay más acciones disponibles.</Note>
                ) : notMine ? (
                  <Note>Solo puede gestionar las citas asignadas a usted.</Note>
                ) : null}
              </div>
            );
          }}
        </AsyncView>
      </Dialog>

      {detail.data && open === 'edit' ? (
        <AppointmentFormDialog
          mode={{ kind: 'edit', appointment: detail.data }}
          canCreatePatient={false}
          onClose={() => { setOpen(null); }}
          onConflict={conflict}
          onSaved={(saved) => void done(withOverlap('Cita actualizada.', saved))}
        />
      ) : null}
      {detail.data && open === 'reschedule' ? (
        <RescheduleDialog
          appointment={detail.data}
          onClose={() => { setOpen(null); }}
          onConflict={conflict}
          onSaved={(saved) => void done(withOverlap('Cita reprogramada.', saved))}
        />
      ) : null}
      {detail.data ? (
        <ConfirmDialog
          open={open === 'cancel'}
          // Al cerrarse tras un conflicto, S-REC-16 queda abierto.
          onOpenChange={(next) => { if (!next) setOpen((o) => (o === 'cancel' ? null : o)); }}
          dismissible={false}
          destructive
          icon={<CalendarX className="size-7" />}
          title="¿Cancelar esta cita?"
          description="La cita se cancelará. Esta acción no se puede deshacer. Indique un motivo operativo (sin datos clínicos)."
          cancelLabel="Volver"
          confirmLabel="Cancelar cita"
          reason={{ label: 'Motivo', placeholder: 'p. ej. a petición del paciente' }}
          onConfirm={async (reason) => {
            try {
              await api.cancelAppointment(detail.data.id, reason ?? '', detail.data.version);
              await done('Cita cancelada.');
            } catch (error) {
              failed(error);
            }
          }}
        />
      ) : null}
      {detail.data ? (
        <ConfirmDialog
          open={open === 'no_show'}
          onOpenChange={(next) => { if (!next) setOpen((o) => (o === 'no_show' ? null : o)); }}
          destructive
          icon={<UserX className="size-7" />}
          title="¿Marcar como no presentado?"
          description="El paciente no llegó. La cita se cerrará como no presentado."
          confirmLabel="Marcar no presentado"
          onConfirm={async () => {
            try {
              await api.markNoShow(detail.data.id, detail.data.version);
              await done('Marcada como no presentado.');
            } catch (error) {
              failed(error);
            }
          }}
        />
      ) : null}
      {open === 'conflict' ? (
        <VersionConflictDialog
          onRefresh={() => {
            setOpen(null);
            void afterChange(appointmentId);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Botonera de S-REC-09, a la derecha y en varias líneas si hace falta:
 * «Cancelar cita» (texto rojo), «Marcar no presentado», «Editar» y
 * «Reprogramar» (contorno), «Confirmar» (tonal) y «Registrar llegada»
 * (relleno, abre el asistente de llegada, T-017).
 */
function Actions({
  actions,
  busy,
  onClose,
  onAction,
}: {
  actions: AppointmentAction[];
  busy: boolean;
  onClose: () => void;
  onAction: (action: AppointmentAction) => void;
}) {
  const has = (a: AppointmentAction) => actions.includes(a);
  return (
    <div className="flex flex-col gap-space-sm tab:flex-row tab:flex-wrap tab:justify-end [&>*]:w-full tab:[&>*]:w-auto">
      {has('cancel') ? (
        <Button variant="text" className="text-error tab:mr-auto" disabled={busy} onClick={() => { onAction('cancel'); }}>
          <CalendarX aria-hidden className="size-5" /> Cancelar cita
        </Button>
      ) : null}
      {has('no_show') ? (
        <Button variant="text" disabled={busy} onClick={() => { onAction('no_show'); }}>
          <UserX aria-hidden className="size-5" /> Marcar no presentado
        </Button>
      ) : null}
      <Button variant="tonal" className="text-on-surface" onClick={onClose}>
        Cerrar
      </Button>
      {has('edit') ? (
        <Button variant="outline" disabled={busy} onClick={() => { onAction('edit'); }}>
          <Pencil aria-hidden className="size-5" /> Editar
        </Button>
      ) : null}
      {has('reschedule') ? (
        <Button variant="outline" disabled={busy} onClick={() => { onAction('reschedule'); }}>
          <CalendarClock aria-hidden className="size-5" /> Reprogramar
        </Button>
      ) : null}
      {has('confirm') ? (
        <Button variant="tonal" loading={busy} onClick={() => { onAction('confirm'); }}>
          <CalendarCheck aria-hidden className="size-5" /> Confirmar
        </Button>
      ) : null}
      {has('check_in') ? (
        <Button disabled={busy} onClick={() => { onAction('check_in'); }}>
          <LogIn aria-hidden className="size-5" /> Registrar llegada
        </Button>
      ) : null}
    </div>
  );
}

/** S-REC-13 Reprogramar: fecha, hora y duración, con el mismo aviso de solapamiento que el formulario. */
function RescheduleDialog({
  appointment: opened,
  onClose,
  onSaved,
  onConflict,
}: {
  appointment: AppointmentDetail;
  onClose: () => void;
  onSaved: (saved: AppointmentSaved) => void;
  onConflict: () => void;
}) {
  // La versión que se vio al abrir (concurrencia optimista).
  const [a] = useState(opened);
  const [date, setDate] = useState(localDay(a.startsAt, a.timeZone));
  const [time, setTime] = useState(localClock(a.startsAt, a.timeZone));
  const [duration, setDuration] = useState(String(a.durationMinutes));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = localDay(new Date().toISOString(), a.timeZone);
  const overlap = useOverlap({ provider: a.provider?.membershipId ?? '', date, time, duration, appointmentId: a.id });
  const conflictAt = overlap.data?.overlap ? overlap.data.conflictStartsAt : null;

  let validation: string | null = null;
  if (!isCalendarDate(date) || !isClockTime(time)) validation = 'Elija una fecha y una hora.';
  else if (!isBookableDay(date, today)) validation = 'No se pueden agendar citas en días anteriores a hoy.';
  else validation = durationError(duration);

  const save = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.rescheduleAppointment(a.id, { expectedVersion: a.version, date, time, durationMinutes: Number(duration) }));
    } catch (e) {
      setBusy(false);
      if (isVersionConflict(e)) onConflict();
      else setError(appointmentMessage(e));
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => { if (!next && !busy) onClose(); }}
      wide
      icon={<CalendarClock className="size-6" />}
      title="Reprogramar cita"
      footer={
        <>
          <Button variant="tonal" className="text-on-surface" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="reschedule-form" loading={busy}>
            Reprogramar
          </Button>
        </>
      }
    >
      <form id="reschedule-form" noValidate onSubmit={(e) => void save(e)} className="flex flex-col gap-space-md">
        <div aria-live="polite" className="flex flex-col gap-space-sm empty:hidden">
          {conflictAt ? <OverlapBanner text={overlapText(a.provider?.name ?? '', conflictAt, a.timeZone)} /> : null}
          {error ? <Banner tone="error" title={error} /> : null}
        </div>
        <div className="grid gap-space-md tab:grid-cols-2">
          <Field
            label="Fecha"
            required
            type="date"
            min={today}
            icon={<CalendarDays className="size-5" />}
            value={date}
            disabled={busy}
            onChange={(e) => {
              setDate(e.target.value);
              setError(null);
            }}
          />
          <Field
            label="Hora"
            required
            type="time"
            step={300}
            icon={<Clock className="size-5" />}
            value={time}
            disabled={busy}
            onChange={(e) => {
              setTime(e.target.value);
              setError(null);
            }}
          />
        </div>
        <Field
          label="Duración"
          required
          inputMode="numeric"
          autoComplete="off"
          maxLength={3}
          trailing={<span className="text-caption font-semibold text-on-surface-variant uppercase">min</span>}
          value={duration}
          disabled={busy}
          onChange={(e) => {
            setDuration(e.target.value.replace(/\D/g, ''));
            setError(null);
          }}
        />
      </form>
    </Dialog>
  );
}

/** S-REC-16 «Actualizada por otro usuario»: un solo botón; se relee la cita y la agenda. */
export function VersionConflictDialog({ onRefresh }: { onRefresh: () => void }) {
  return (
    <Dialog
      open
      onOpenChange={() => undefined}
      dismissible={false}
      icon={<RefreshCw className="size-7" />}
      title="Actualizada por otro usuario"
      description="Otro usuario actualizó esta cita. Actualice para continuar."
      footer={<Button onClick={onRefresh}>Actualizar</Button>}
    />
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-space-xs rounded-md bg-surface-container-low p-space-sm text-body-md text-on-surface-variant dark:bg-surface-container">
      <Info aria-hidden className="size-5 shrink-0" /> {children}
    </p>
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
