import { COVERAGE_TYPE_LABELS, type ArrivalContext, type ArrivalPatient, type ArrivalResult } from '@clinic/shared';
import { AsyncView, Button, CodeText, EmptyState, RouteBadge } from '@clinic/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, CalendarOff, CircleCheck, ClipboardList, Footprints, Hash, UserRoundX, UserSearch } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { useAfterAppointmentChange } from '../components/appointments/appointment-detail-dialog.tsx';
import { PatientPickerDialog } from '../components/appointments/patient-picker-dialog.tsx';
import { ArrivalWizard } from '../components/arrival/arrival-wizard.tsx';
import { api, type ApiError } from '../lib/api.ts';
import { canArrive, INACTIVE_PATIENT_TEXT, MERGED_PATIENT_TEXT, notArrivableText } from '../lib/arrival.ts';
import { useActiveLocation, useMe } from '../lib/session.ts';

// S-REC-18 Registro de llegada (/app/<SEDE>/llegada/<cita>) y S-REC-19 Visita
// sin cita (/app/<SEDE>/llegada/sin-cita?paciente=<id>), con el asistente
// (S-REC-20 a 26) y la vista de éxito (S-REC-27). Solo Recepción
// (appointments.check_in; la ruta redirige al Panel a los demás). La flecha
// atrás vuelve a Citas sin pedir confirmación (manual). Tras registrar, la
// vista de éxito se mantiene aunque el evento en vivo traiga la cita como
// «Llegó»; si otro puesto se adelanta, «No es posible registrar la llegada».

function PageHeader({ sede, title, action }: { sede: string; title: string; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-space-sm">
      <Link
        to="/app/$sede/citas"
        params={{ sede }}
        search={{}}
        aria-label="Volver a citas"
        title="Volver a citas"
        className="flex size-12 items-center justify-center rounded-full text-on-surface hover:bg-surface-container-low"
      >
        <ArrowLeft aria-hidden className="size-6" />
      </Link>
      <h1 id="page-title" className="flex-1 text-headline-lg text-on-surface">
        {title}
      </h1>
      {action}
    </header>
  );
}

function BackToAppointments({ sede }: { sede: string }) {
  const navigate = useNavigate();
  return (
    <Button variant="outline" onClick={() => void navigate({ to: '/app/$sede/citas', params: { sede }, search: {} })}>
      Volver a citas
    </Button>
  );
}

/** Paciente inactivo o fusionado: se dice qué hacer antes de empezar el asistente. */
function PatientBlocked({ sede, patient }: { sede: string; patient: ArrivalPatient }) {
  const merged = patient.mergedInto;
  return (
    <EmptyState
      icon={UserRoundX}
      title="No es posible registrar la llegada"
      description={merged ? MERGED_PATIENT_TEXT : INACTIVE_PATIENT_TEXT}
      action={
        <div className="flex flex-wrap justify-center gap-space-sm">
          <BackToAppointments sede={sede} />
          <Button asChild>
            <Link to="/app/$sede/pacientes/$id" params={{ sede, id: merged ?? patient.id }}>
              {merged ? 'Abrir registro principal' : 'Abrir perfil del paciente'}
            </Link>
          </Button>
        </div>
      }
    />
  );
}

const blocked = (patient: ArrivalPatient) => patient.mergedInto !== null || patient.status !== 'active';

export function AppointmentArrivalPage({ sede, appointmentId }: { sede: string; appointmentId: string }) {
  const active = useActiveLocation();
  const afterChange = useAfterAppointmentChange();
  const [result, setResult] = useState<ArrivalResult | null>(null);
  const sending = useRef(false);
  const ready = active?.code === sede;
  const context = useQuery<ArrivalContext, ApiError>({
    queryKey: ['arrival', 'appointment', appointmentId],
    queryFn: () => api.arrivalForAppointment(appointmentId),
    enabled: ready,
    staleTime: 0,
    gcTime: 0,
    retry: (failures: number, error: ApiError) => error.status >= 500 && failures < 2,
  });

  return (
    <section aria-labelledby="page-title" className="mx-auto flex w-full max-w-4xl flex-col gap-space-lg">
      <PageHeader sede={sede} title="Registro de llegada" />
      <AsyncView source={context}>
        {(ctx) => {
          if (result) return <ArrivalSuccess sede={sede} patient={ctx.patient} result={result} />;
          const appointment = ctx.appointment;
          if (!appointment) return null;
          if (!sending.current && (!canArrive(appointment.status) || !appointment.isToday)) {
            return (
              <EmptyState
                icon={CalendarOff}
                title="No es posible registrar la llegada"
                description={canArrive(appointment.status) ? 'Solo se puede registrar la llegada de las citas de hoy.' : notArrivableText(appointment.status)}
                action={<BackToAppointments sede={sede} />}
              />
            );
          }
          if (blocked(ctx.patient)) return <PatientBlocked sede={sede} patient={ctx.patient} />;
          return (
            <ArrivalWizard
              sede={sede}
              context={ctx}
              // La versión vigente: la cita se relee en vivo (appointment.changed).
              mode={{ kind: 'appointment', appointmentId: appointment.id, version: appointment.version }}
              onSending={(value) => {
                sending.current = value;
              }}
              onDone={(r) => {
                setResult(r);
                void afterChange(appointment.id);
              }}
            />
          );
        }}
      </AsyncView>
    </section>
  );
}

/** Hoy en la zona de la sede (`AAAA-MM-DD`), para la edad del selector. */
function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function WalkInArrivalPage({ sede, patientId }: { sede: string; patientId: string | undefined }) {
  const me = useMe();
  const active = useActiveLocation();
  const navigate = useNavigate();
  const afterChange = useAfterAppointmentChange();
  const [picking, setPicking] = useState(false);
  const [result, setResult] = useState<ArrivalResult | null>(null);
  const ready = active?.code === sede;
  const context = useQuery<ArrivalContext, ApiError>({
    queryKey: ['arrival', 'patient', patientId],
    queryFn: () => api.arrivalForPatient(patientId ?? ''),
    enabled: ready && patientId !== undefined,
    staleTime: 0,
    gcTime: 0,
    retry: (failures: number, error: ApiError) => error.status >= 500 && failures < 2,
  });
  const choose = () => {
    setPicking(true);
  };

  return (
    <section aria-labelledby="page-title" className="mx-auto flex w-full max-w-4xl flex-col gap-space-lg">
      <PageHeader
        sede={sede}
        title="Visita sin cita"
        action={
          patientId && !result ? (
            <Button variant="tonal" onClick={choose}>
              <UserSearch aria-hidden className="size-5" /> Cambiar paciente
            </Button>
          ) : null
        }
      />
      {patientId === undefined ? (
        <EmptyState
          icon={Footprints}
          title="Visita sin cita"
          description="Elija al paciente que acaba de llegar para iniciar la visita sin cita."
          action={
            <Button onClick={choose}>
              <UserSearch aria-hidden className="size-5" /> Elegir paciente
            </Button>
          }
        />
      ) : (
        <AsyncView source={context}>
          {(ctx) => {
            if (result) return <ArrivalSuccess sede={sede} patient={ctx.patient} result={result} />;
            if (blocked(ctx.patient)) return <PatientBlocked sede={sede} patient={ctx.patient} />;
            return (
              <ArrivalWizard
                // «Cambiar paciente» reinicia el asistente sin pedir confirmación (S-REC-19).
                key={ctx.patient.id}
                sede={sede}
                context={ctx}
                mode={{ kind: 'walk_in', patientId: ctx.patient.id }}
                onDone={(r) => {
                  setResult(r);
                  void afterChange();
                }}
              />
            );
          }}
        </AsyncView>
      )}
      {picking && active ? (
        <PatientPickerDialog
          today={todayIn(active.timezone)}
          canCreate={me.data?.permissions.includes('patients.create') ?? false}
          onClose={() => { setPicking(false); }}
          onPick={(p) => {
            setPicking(false);
            setResult(null);
            void navigate({ to: '/app/$sede/llegada/sin-cita', params: { sede }, search: { paciente: p.id } });
          }}
        />
      ) : null}
    </section>
  );
}

/** S-REC-27 Llegada registrada: sin navegación automática. */
function ArrivalSuccess({ sede, patient, result }: { sede: string; patient: ArrivalPatient; result: ArrivalResult }) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col items-center gap-space-md rounded-lg bg-surface-container-lowest p-space-lg text-center shadow-level-1 dark:bg-surface-container-low">
      <span className="flex size-20 items-center justify-center rounded-full bg-status-completed-container text-status-completed">
        <CircleCheck aria-hidden className="size-12" />
      </span>
      <h2 className="text-headline-lg text-on-surface">Llegada registrada</h2>
      <p className="text-body-lg text-on-surface">{`${patient.firstName} ${patient.lastName}`}</p>
      <CodeText code={result.encounter.code} variant="block" label="Código de la visita" icon={Hash} copyable className="w-full" />
      <p className="flex flex-wrap items-center justify-center gap-space-xs text-body-md text-on-surface-variant">
        <RouteBadge route={result.encounter.route} />
        <span aria-hidden>·</span>
        {COVERAGE_TYPE_LABELS[result.coverageType]}
      </p>
      <div className="flex w-full flex-col-reverse gap-space-sm tab:flex-row tab:justify-center">
        <Button variant="text" onClick={() => void navigate({ to: '/app/$sede/citas', params: { sede }, search: {} })}>
          Volver a citas
        </Button>
        <Button onClick={() => void navigate({ to: '/app/$sede/visitas/$id', params: { sede, id: result.encounter.id } })}>
          <ClipboardList aria-hidden className="size-5" /> Abrir visita
        </Button>
      </div>
    </div>
  );
}
