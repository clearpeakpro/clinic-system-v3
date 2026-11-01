import {
  APPOINTMENT_DURATION_MAX,
  APPOINTMENT_DURATION_MIN,
  APPOINTMENT_NOTES_FORM_MAX,
  isBookableDay,
  isCalendarDate,
  isClockTime,
  type AppointmentDetail,
  type AppointmentFormOptions,
  type AppointmentOverlap,
  type AppointmentSaved,
  type CatalogList,
  type UpdateAppointmentInput,
} from '@clinic/shared';
import { Banner, Button, cn, CodeText, Dialog, DiscardChangesDialog, Field, SelectField, TextAreaField } from '@clinic/ui';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, CalendarDays, CalendarPlus, Clock, Pencil, Stethoscope, TriangleAlert, User, UserSearch } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode, type SubmitEvent } from 'react';
import { api, type ApiError } from '../../lib/api.ts';
import { appointmentMessage, isVersionConflict, localClock, localDay, newIdempotencyKey, overlapText, typeLabel } from '../../lib/appointments.ts';
import { PatientPickerDialog, type PickedPatient } from './patient-picker-dialog.tsx';

// S-REC-10 «Nueva cita» / «Editar cita» (Stitch: design/stitch/recepcion/S-REC-10_nueva_cita).
// De Stitch: el aviso de solapamiento arriba («{Proveedor} ya tiene una cita
// que se solapa a las …» y «Se permite guardar como sobrecupo»), el paciente
// elegido como «P-000123 · Nombre» con «Cambiar», Tipo de cita, Fecha y Hora
// en una fila, Duración con «MIN» y Proveedor con «Ocupado», Notas
// «Opcional», y «Cancelar» / «Crear cita». No se construyen «Expediente
// validado» ni «Programación integrada con el expediente clínico» (no existen).
// Reglas (manual y decisiones de T-015):
//  - el solapamiento se comprueba antes de guardar y nunca bloquea; el
//    servidor lo repite al guardar;
//  - solo desde hoy en la sede; en edición la fecha y la hora no se cambian
//    (se reprograman);
//  - el Proveedor agenda solo para sí mismo (campo fijo «Yo · »);
//  - con cambios, cerrar pide S-REC-17; un conflicto de versión, S-REC-16.

type Mode = { kind: 'create'; date: string; patient: PickedPatient | null } | { kind: 'edit'; appointment: AppointmentDetail };

interface Values {
  patient: PickedPatient | null;
  typeId: string;
  date: string;
  time: string;
  duration: string;
  /** '' = «Sin proveedor». */
  provider: string;
  notes: string;
}

/** Espera `ms` sin cambios antes de devolver el valor (comprobación del solapamiento). */
export function useDebounced<T>(value: T, ms = 400): T {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setShown(value);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [value, ms]);
  return shown;
}

/** Solapamiento del proveedor antes de guardar (decisión de T-015). Sin proveedor o con datos incompletos, nada. */
export function useOverlap(input: { provider: string; date: string; time: string; duration: string; appointmentId?: string }) {
  const key = useDebounced(input);
  const minutes = Number(key.duration);
  const valid =
    key.provider !== '' &&
    isCalendarDate(key.date) &&
    isClockTime(key.time) &&
    Number.isInteger(minutes) &&
    minutes >= APPOINTMENT_DURATION_MIN &&
    minutes <= APPOINTMENT_DURATION_MAX;
  return useQuery<AppointmentOverlap, ApiError>({
    queryKey: ['appointment-overlap', key.provider, key.date, key.time, minutes, key.appointmentId ?? null],
    queryFn: () =>
      api.appointmentOverlap({
        providerMembershipId: key.provider,
        date: key.date,
        time: key.time,
        durationMinutes: minutes,
        ...(key.appointmentId ? { appointmentId: key.appointmentId } : {}),
      }),
    enabled: valid,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

/** Banner ámbar de Stitch: no bloquea. */
export function OverlapBanner({ text }: { text: string }) {
  return (
    <div role="status" className="flex gap-3 rounded-md bg-status-waiting-container p-3.5 text-status-waiting">
      <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="flex flex-col gap-0.5">
        <p className="text-body-md-medium">{text}</p>
        <p className="text-caption">Se permite guardar como sobrecupo.</p>
      </div>
    </div>
  );
}

export function durationError(value: string): string | null {
  const n = Number(value);
  return value.trim() !== '' && Number.isInteger(n) && n >= APPOINTMENT_DURATION_MIN && n <= APPOINTMENT_DURATION_MAX
    ? null
    : 'La duración debe estar entre 5 y 480 minutos.';
}

function initial(mode: Mode): Values {
  if (mode.kind === 'create') return { patient: mode.patient, typeId: '', date: mode.date, time: '09:00', duration: '', provider: '', notes: '' };
  const a = mode.appointment;
  return {
    patient: { id: a.patient.id, code: a.patient.code, firstName: a.patient.firstName, lastName: a.patient.lastName },
    typeId: a.type.id,
    date: localDay(a.startsAt, a.timeZone),
    time: localClock(a.startsAt, a.timeZone),
    duration: String(a.durationMinutes),
    provider: a.provider?.membershipId ?? '',
    notes: a.notes ?? '',
  };
}

export function AppointmentFormDialog({
  mode: openedWith,
  canCreatePatient,
  onClose,
  onSaved,
  onConflict,
}: {
  mode: Mode;
  canCreatePatient: boolean;
  onClose: () => void;
  onSaved: (saved: AppointmentSaved) => void;
  /** 409 version_conflict: quien abrió el formulario muestra S-REC-16. */
  onConflict: () => void;
}) {
  // La cita tal como estaba al abrir: si otra persona la cambia mientras tanto,
  // guardar da 409 y S-REC-16 (concurrencia optimista, sin «guardar igualmente»).
  const [mode] = useState(openedWith);
  const editing = mode.kind === 'edit';
  const options = useQuery<AppointmentFormOptions, ApiError>({ queryKey: ['appointment-form-options'], queryFn: api.appointmentFormOptions, staleTime: 0 });
  const catalog = useQuery<CatalogList, ApiError>({ queryKey: ['catalog'], queryFn: api.catalog, staleTime: 0 });
  const opts = options.data;
  const ownOnly = opts?.scope === 'own';
  const start = initial(mode);
  const [values, setValues] = useState<Values>(start);
  const [durationTouched, setDurationTouched] = useState(editing);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [idempotencyKey] = useState(newIdempotencyKey);
  const notesId = useId();
  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setServerError(null);
  };
  // El Proveedor agenda solo para sí mismo: su campo es fijo («Yo · »).
  const provider = mode.kind === 'create' && opts?.scope === 'own' ? opts.myMembershipId : values.provider;

  const types = catalog.data?.items['appointment-types'] ?? [];
  const current = mode.kind === 'edit' ? mode.appointment : null;
  // En edición, el tipo actual aunque ya no esté activo (se muestra con su código).
  const typeOptions = current && !types.some((t) => t.id === current.type.id) ? [{ id: current.type.id, name: typeLabel(current.type), defaultDurationMinutes: null }, ...types] : types;
  const today = opts?.today ?? '';
  const timeZone = opts?.timeZone ?? (current ? current.timeZone : 'America/Chicago');

  // Proveedores: «Sin proveedor», «Yo · » (si quien agenda es Proveedor) y los activos de la sede.
  const providers = (opts?.providers ?? []).map((p) => ({ id: p.membershipId, label: p.membershipId === opts?.myMembershipId ? `Yo · ${p.name}` : p.name }));
  if (current?.provider && !providers.some((p) => p.id === current.provider?.membershipId)) {
    providers.push({ id: current.provider.membershipId, label: current.provider.name || 'Proveedor asignado' });
  }
  const providerName = providers.find((p) => p.id === provider)?.label.replace(/^Yo · /, '') ?? '';

  const overlap = useOverlap({
    provider,
    date: values.date,
    time: values.time,
    duration: values.duration,
    ...(current ? { appointmentId: current.id } : {}),
  });
  const conflictAt = overlap.data?.overlap ? overlap.data.conflictStartsAt : null;

  const dirty = JSON.stringify(values) !== JSON.stringify(start);

  const errors: Partial<Record<'patient' | 'typeId' | 'when' | 'duration', string>> = {};
  if (!values.patient) errors.patient = 'Elija un paciente.';
  if (values.typeId === '') errors.typeId = 'Elija un tipo de cita.';
  if (!editing) {
    if (!isCalendarDate(values.date) || !isClockTime(values.time)) errors.when = 'Elija una fecha y una hora.';
    else if (today && !isBookableDay(values.date, today)) errors.when = 'No se pueden agendar citas en días anteriores a hoy.';
  }
  const durationMessage = durationError(values.duration);
  if (durationMessage) errors.duration = durationMessage;
  // Validación en vivo tras tocar el campo; Paciente, Fecha y Hora, tras intentar guardar (S-REC-10).
  const show = (key: keyof typeof errors, live = false) => (submitted || live ? (errors[key] ?? null) : null);

  const requestClose = () => {
    if (busy) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  const save = async () => {
    setSubmitted(true);
    if (Object.keys(errors).length > 0 || !values.patient) return;
    const notes = values.notes.trim() === '' ? null : values.notes;
    setBusy(true);
    setServerError(null);
    try {
      if (mode.kind === 'create') {
        onSaved(
          await api.createAppointment(
            {
              patientId: values.patient.id,
              appointmentTypeId: values.typeId,
              date: values.date,
              time: values.time,
              durationMinutes: Number(values.duration),
              providerMembershipId: provider === '' ? null : provider,
              notes,
            },
            idempotencyKey,
          ),
        );
      } else {
        // Solo los campos cambiados (S-REC-10). Sin cambios, cierra sin llamar al servidor.
        const a = mode.appointment;
        const input: UpdateAppointmentInput = { expectedVersion: a.version };
        if (values.typeId !== start.typeId) input.appointmentTypeId = values.typeId;
        if (values.duration !== start.duration) input.durationMinutes = Number(values.duration);
        if (values.provider !== start.provider) input.providerMembershipId = values.provider === '' ? null : values.provider;
        if (values.notes.trim() !== start.notes.trim()) input.notes = notes;
        if (Object.keys(input).length === 1) {
          onClose();
          return;
        }
        onSaved(await api.updateAppointment(a.id, input));
      }
    } catch (error) {
      if (isVersionConflict(error)) {
        onConflict();
        return;
      }
      setServerError(appointmentMessage(error));
      setBusy(false);
    }
  };

  const providerLocked = busy || ownOnly;
  return (
    <>
      <Dialog
        open={!picking}
        onOpenChange={(next) => { if (!next) requestClose(); }}
        dismissible={false}
        wide
        fullScreenOnPhone
        icon={editing ? <Pencil className="size-6" /> : <CalendarPlus className="size-6" />}
        title={editing ? 'Editar cita' : 'Nueva cita'}
        footer={
          <>
            <Button variant="tonal" className="text-on-surface" disabled={busy} onClick={requestClose}>
              Cancelar
            </Button>
            <Button type="submit" form="appointment-form" loading={busy}>
              <CalendarCheck aria-hidden className="size-5" /> {editing ? 'Guardar' : 'Crear cita'}
            </Button>
          </>
        }
      >
        <form
          id="appointment-form"
          noValidate
          onSubmit={(e: SubmitEvent<HTMLFormElement>) => {
            e.preventDefault();
            void save();
          }}
          className="flex flex-col gap-space-md"
        >
          <div aria-live="polite" className="flex flex-col gap-space-sm empty:hidden">
            {conflictAt ? <OverlapBanner text={overlapText(providerName, conflictAt, timeZone)} /> : null}
            {serverError ? <Banner tone="error" title={serverError} /> : null}
            {options.isError || catalog.isError ? <Banner tone="error" title="No se pudieron cargar los tipos de cita o los proveedores." /> : null}
          </div>

          <FormRow label="Paciente" required error={show('patient')}>
            {values.patient ? (
              <div className="flex min-h-touch items-center gap-space-sm rounded-md bg-surface-container px-space-sm py-1.5 dark:bg-surface-container-high">
                <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant">
                  <User className="size-5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-space-xs">
                  <CodeText code={values.patient.code} />
                  <span aria-hidden className="text-on-surface-variant">·</span>
                  <span className="truncate text-body-lg text-on-surface">
                    {values.patient.firstName} {values.patient.lastName}
                  </span>
                </span>
                {editing ? null : (
                  <Button type="button" variant="outline" className="shrink-0" disabled={busy} onClick={() => { setPicking(true); }}>
                    <UserSearch aria-hidden className="size-5" /> Cambiar
                  </Button>
                )}
              </div>
            ) : (
              <Button type="button" variant="tonal" className="w-full justify-start" disabled={busy} onClick={() => { setPicking(true); }}>
                <UserSearch aria-hidden className="size-5" /> Elegir paciente
              </Button>
            )}
          </FormRow>

          <div className="flex flex-col gap-1.5">
            <SelectField
              label="Tipo de cita"
              required
              value={values.typeId}
              disabled={busy}
              aria-invalid={show('typeId') ? true : undefined}
              onChange={(e) => {
                const typeId = e.target.value;
                const type = types.find((t) => t.id === typeId);
                setValues((v) => ({
                  ...v,
                  typeId,
                  // La duración por defecto del tipo, salvo que ya se haya escrito una.
                  ...(!durationTouched && type?.defaultDurationMinutes ? { duration: String(type.defaultDurationMinutes) } : {}),
                }));
                setServerError(null);
              }}
            >
              <option value="" disabled>
                {catalog.isPending ? 'Cargando…' : 'Elija un tipo de cita'}
              </option>
              {typeOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </SelectField>
            {catalog.data && types.length === 0 ? (
              <p className="text-caption text-error">No hay tipos de cita activos. Pida a un administrador que agregue uno.</p>
            ) : show('typeId') ? (
              <p className="text-caption text-error">{show('typeId')}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="grid gap-space-md tab:grid-cols-2">
              <Field
                label="Fecha"
                required
                type="date"
                icon={<CalendarDays className="size-5" />}
                {...(today ? { min: today } : {})}
                value={values.date}
                disabled={busy || editing}
                aria-invalid={show('when') ? true : undefined}
                onChange={(e) => { set('date', e.target.value); }}
              />
              <Field
                label="Hora"
                required
                type="time"
                step={300}
                icon={<Clock className="size-5" />}
                value={values.time}
                disabled={busy || editing}
                aria-invalid={show('when') ? true : undefined}
                onChange={(e) => { set('time', e.target.value); }}
              />
            </div>
            {editing ? (
              <p className="text-caption text-on-surface-variant">Use Reprogramar para cambiar la fecha o la hora.</p>
            ) : show('when', submitted || (today !== '' && isCalendarDate(values.date) && !isBookableDay(values.date, today))) ? (
              <p role="alert" className="text-caption text-error">
                {show('when', true)}
              </p>
            ) : null}
          </div>

          <div className="grid gap-space-md tab:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Field
              label="Duración"
              inputMode="numeric"
              autoComplete="off"
              maxLength={3}
              trailing={<span className="text-caption font-semibold text-on-surface-variant uppercase">min</span>}
              value={values.duration}
              disabled={busy}
              error={show('duration', durationTouched && values.duration !== '')}
              onChange={(e) => {
                setDurationTouched(true);
                set('duration', e.target.value.replace(/\D/g, ''));
              }}
            />
            <div className="flex flex-col gap-1.5">
              <SelectField
                label="Proveedor"
                icon={<Stethoscope className="size-5" />}
                value={provider}
                disabled={providerLocked}
                onChange={(e) => { set('provider', e.target.value); }}
              >
                {ownOnly ? null : <option value="">Sin proveedor</option>}
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </SelectField>
              {conflictAt ? (
                <p className="flex items-center gap-1 self-end text-caption text-status-waiting">
                  <span aria-hidden className="size-2 rounded-full bg-status-waiting" /> Ocupado
                </p>
              ) : null}
              {ownOnly ? <p className="text-caption text-on-surface-variant">Solo puede gestionar las citas asignadas a usted.</p> : null}
              {options.isPending ? <p className="text-caption text-on-surface-variant">Cargando…</p> : null}
            </div>
          </div>

          <TextAreaField
            id={notesId}
            label="Notas"
            hint={`Opcional · ${String(values.notes.length)}/${String(APPOINTMENT_NOTES_FORM_MAX)}`}
            rows={3}
            maxLength={APPOINTMENT_NOTES_FORM_MAX}
            placeholder="Notas adicionales sobre la cita o la preparación del paciente…"
            value={values.notes}
            disabled={busy}
            onChange={(e) => { set('notes', e.target.value); }}
          />
        </form>
      </Dialog>
      {picking && today ? (
        <PatientPickerDialog
          today={today}
          canCreate={canCreatePatient}
          onClose={() => { setPicking(false); }}
          onPick={(patient) => {
            setPicking(false);
            set('patient', patient);
          }}
        />
      ) : null}
      <DiscardChangesDialog open={confirmDiscard} onOpenChange={setConfirmDiscard} onDiscard={onClose} />
    </>
  );
}

function FormRow({ label, required, error, children }: { label: string; required?: boolean; error: string | null; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1 text-body-md-medium text-on-surface">
        {label}
        {required ? (
          <span aria-hidden className="font-bold text-error">
            *
          </span>
        ) : null}
      </span>
      {children}
      {error ? <p className={cn('text-caption text-error')}>{error}</p> : null}
    </div>
  );
}
