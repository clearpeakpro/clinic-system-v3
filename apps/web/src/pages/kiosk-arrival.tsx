import { ageLabel, ageOn, formatPhone, type ArrivalContext, type ArrivalResult, type KioskArrivalDetail, type KioskMatch } from '@clinic/shared';
import { AsyncView, Button, CodeText, DateTimeText, EmptyState, StatusChip } from '@clinic/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, CircleCheck, IdCard, SearchX, TabletSmartphone, UserPlus, UserSearch } from 'lucide-react';
import { useState } from 'react';
import { PatientPickerDialog } from '../components/appointments/patient-picker-dialog.tsx';
import { ArrivalWizard } from '../components/arrival/arrival-wizard.tsx';
import { DeclaredReasonCard } from '../components/kiosk/declared-reason.tsx';
import { NewPatientDialog } from '../components/patients/new-patient-dialog.tsx';
import { api, type ApiError } from '../lib/api.ts';
import { formatDay } from '../lib/catalog.ts';
import { kioskArrivalMessage, matchText } from '../lib/kiosk-arrivals.ts';
import { useActiveLocation, useMe } from '../lib/session.ts';
import { ArrivalSuccess, blocked, PatientBlocked, todayIn } from './arrival.tsx';

// Confirmar un registro del kiosco (T-021; S-REC-28 → S-PAC-03 → S-REC-20 a 27).
//  1. Paso previo: el paciente.
//     - «Primera vez»: «Nuevo paciente» con los datos del kiosco ya escritos,
//       pasando por la detección de duplicados (S-PAC-03).
//     - «Ya soy paciente»: coincidencias por nombre, fecha de nacimiento y
//       teléfono; Recepción elige.
//     - En los dos casos se puede buscar otro paciente o crearlo.
//  2. El asistente de llegada (T-017) con el registro: si el paciente tiene
//     cita hoy en la sede, en modo cita (la cita pasa a «Llegó»); si no, sin
//     cita. La ruta no viene preseleccionada (ADR 0031).
//  3. Al confirmar, el servidor borra el contenido del registro.
// Nada se guarda en el navegador: el registro se pide al servidor y vive en memoria.

export function KioskArrivalPage({ sede, checkinId }: { sede: string; checkinId: string }) {
  const active = useActiveLocation();
  const ready = active?.code === sede;
  const [patientId, setPatientId] = useState<string | null>(null);
  const [result, setResult] = useState<ArrivalResult | null>(null);
  const detail = useQuery<KioskArrivalDetail, ApiError>({
    queryKey: ['kiosk-arrival', checkinId],
    queryFn: () => api.kioskArrival(checkinId),
    enabled: ready && result === null,
    staleTime: Infinity,
    gcTime: 0,
    retry: (failures: number, error: ApiError) => error.status >= 500 && failures < 2,
  });

  return (
    <section aria-labelledby="page-title" className="mx-auto flex w-full max-w-4xl flex-col gap-space-lg">
      <header className="flex flex-wrap items-center gap-space-sm">
        <Link
          to="/app/$sede/$destino"
          params={{ sede, destino: 'panel' }}
          aria-label="Volver al Panel"
          title="Volver al Panel"
          className="flex size-12 items-center justify-center rounded-full text-on-surface hover:bg-surface-container-low"
        >
          <ArrowLeft aria-hidden className="size-6" />
        </Link>
        <h1 id="page-title" className="flex-1 text-headline-lg text-on-surface">
          Llegada del kiosco
        </h1>
        {patientId && !result ? (
          <Button variant="tonal" onClick={() => { setPatientId(null); }}>
            <UserSearch aria-hidden className="size-5" /> Cambiar paciente
          </Button>
        ) : null}
      </header>
      {detail.error ? (
        <EmptyState
          icon={SearchX}
          title="Este registro ya no está pendiente"
          description={kioskArrivalMessage(detail.error)}
          action={
            <Button asChild>
              <Link to="/app/$sede/$destino" params={{ sede, destino: 'panel' }}>
                Volver al Panel
              </Link>
            </Button>
          }
        />
      ) : (
        <AsyncView source={detail}>
          {(d) =>
            patientId ? (
              <Confirm sede={sede} detail={d} patientId={patientId} result={result} onDone={setResult} />
            ) : (
              <ChoosePatient detail={d} timeZone={active?.timezone ?? 'America/Chicago'} onChoose={setPatientId} />
            )
          }
        </AsyncView>
      )}
    </section>
  );
}

/** Paso previo: los datos del kiosco y a qué paciente corresponden. */
function ChoosePatient({ detail, timeZone, onChoose }: { detail: KioskArrivalDetail; timeZone: string; onChoose: (patientId: string) => void }) {
  const me = useMe();
  const [dialog, setDialog] = useState<null | 'new' | 'search'>(null);
  const a = detail.arrival;
  const today = todayIn(timeZone);
  const canCreate = me.data?.permissions.includes('patients.create') ?? false;
  const createButton = (primary: boolean) =>
    canCreate ? (
      <Button variant={primary ? 'primary' : 'tonal'} onClick={() => { setDialog('new'); }}>
        <UserPlus aria-hidden className="size-5" /> Crear paciente nuevo
      </Button>
    ) : null;

  return (
    <div className="flex flex-col gap-space-lg">
      <div className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-md shadow-level-1 tab:p-space-lg dark:bg-surface-container-low">
        <div className="flex flex-wrap items-center gap-space-sm">
          <TabletSmartphone aria-hidden className="size-6 text-primary" />
          <h2 className="text-headline-sm text-on-surface">{`${a.firstName} ${a.lastName}`}</h2>
          {a.firstVisit ? <StatusChip tone="registered" icon={UserPlus} label="Primera vez" /> : <StatusChip tone="completed" icon={IdCard} label="Ya es paciente" />}
        </div>
        <dl className="grid gap-space-sm text-body-md tab:grid-cols-3">
          <div>
            <dt className="text-caption text-on-surface-variant">Fecha de nacimiento</dt>
            <dd className="text-on-surface">{`${formatDay(a.birthDate)} (${ageLabel(ageOn(a.birthDate, today))})`}</dd>
          </div>
          <div>
            <dt className="text-caption text-on-surface-variant">Teléfono celular</dt>
            <dd className="text-on-surface tabular-nums">{formatPhone(a.phone)}</dd>
          </div>
          <div>
            <dt className="text-caption text-on-surface-variant">Enviado</dt>
            <dd className="text-on-surface">
              <DateTimeText value={a.createdAt} timeZone={timeZone} format="time" />
            </dd>
          </div>
        </dl>
        <DeclaredReasonCard declared={{ reason: a.reason, symptoms: a.symptoms }} compact />
      </div>

      <section aria-labelledby="kiosk-candidates" className="flex flex-col gap-space-sm">
        <h2 id="kiosk-candidates" className="text-title-md text-on-surface">
          {a.firstVisit ? 'Posibles pacientes existentes' : 'Coincidencias'}
        </h2>
        <p className="text-body-md text-on-surface-variant">
          {a.firstVisit
            ? 'Dice que es su primera vez: cree el paciente (se revisan los duplicados) o elija uno existente si ya estaba registrado.'
            : 'Dice que ya es paciente: elija el registro que corresponde, tras confirmar su nombre y su fecha de nacimiento.'}
        </p>
        {detail.candidates.length === 0 ? (
          <p className="rounded-md bg-surface-container-low p-space-md text-body-md text-on-surface-variant dark:bg-surface-container">Sin coincidencias por nombre, fecha de nacimiento ni teléfono.</p>
        ) : (
          <ul aria-label="Pacientes que coinciden" className="flex flex-col gap-space-sm">
            {detail.candidates.map((c) => (
              <Candidate key={c.patient.id} candidate={c} today={today} onPick={() => { onChoose(c.patient.id); }} />
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-space-sm">
          {createButton(a.firstVisit)}
          <Button variant={a.firstVisit ? 'outline' : 'tonal'} onClick={() => { setDialog('search'); }}>
            <UserSearch aria-hidden className="size-5" /> Buscar otro paciente
          </Button>
        </div>
      </section>

      {dialog === 'new' ? (
        <NewPatientDialog
          today={today}
          initial={{ firstName: a.firstName, lastName: a.lastName, birthDate: a.birthDate, phone: a.phone }}
          onClose={() => { setDialog(null); }}
          onCreated={(created) => {
            setDialog(null);
            onChoose(created.id);
          }}
          onOpenExisting={(id) => {
            setDialog(null);
            onChoose(id);
          }}
        />
      ) : null}
      {dialog === 'search' ? (
        <PatientPickerDialog
          today={today}
          canCreate={false}
          onClose={() => { setDialog(null); }}
          onPick={(p) => {
            setDialog(null);
            onChoose(p.id);
          }}
        />
      ) : null}
    </div>
  );
}

function Candidate({ candidate: c, today, onPick }: { candidate: KioskMatch; today: string; onPick: () => void }) {
  const p = c.patient;
  const name = `${p.firstName} ${p.lastName}`;
  return (
    <li data-testid="kiosk-candidate" className="flex flex-wrap items-center justify-between gap-space-sm rounded-md border border-outline-variant p-space-md">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-space-sm">
          <span className="text-body-lg-medium text-on-surface">{name}</span>
          <CodeText code={p.code} />
          {p.status !== 'active' ? <StatusChip tone="departed" icon={IdCard} label="Inactivo" /> : null}
        </span>
        <span className="text-body-md text-on-surface-variant">
          {`${formatDay(p.birthDate)} (${ageLabel(ageOn(p.birthDate, today))})`}
          {p.phone ? ` · ${formatPhone(p.phone)}` : ''}
        </span>
        <span className="flex items-center gap-space-xs text-body-md text-primary">
          <CircleCheck aria-hidden className="size-4" /> {matchText(c.matches)}
        </span>
      </div>
      <Button variant="tonal" onClick={onPick} aria-label={`Es ${name}`}>
        Es este paciente
      </Button>
    </li>
  );
}

/** El asistente con el registro: con la cita de hoy si la tiene; si no, sin cita. */
function Confirm({
  sede,
  detail,
  patientId,
  result,
  onDone,
}: {
  sede: string;
  detail: KioskArrivalDetail;
  patientId: string;
  result: ArrivalResult | null;
  onDone: (result: ArrivalResult) => void;
}) {
  const queryClient = useQueryClient();
  const context = useQuery<{ ctx: ArrivalContext; appointmentId: string | null }, ApiError>({
    queryKey: ['arrival', 'kiosk', detail.arrival.id, patientId],
    queryFn: async () => {
      const { appointmentId } = await api.kioskTodayAppointment(patientId);
      return { ctx: appointmentId ? await api.arrivalForAppointment(appointmentId) : await api.arrivalForPatient(patientId), appointmentId };
    },
    staleTime: Infinity,
    gcTime: 0,
    retry: (failures: number, error: ApiError) => error.status >= 500 && failures < 2,
  });
  const kiosk = { checkinId: detail.arrival.id, declared: { reason: detail.arrival.reason, symptoms: detail.arrival.symptoms } };
  return (
    <AsyncView source={context}>
      {({ ctx }) => {
        if (result) return <ArrivalSuccess sede={sede} patient={ctx.patient} result={result} />;
        if (blocked(ctx.patient)) return <PatientBlocked sede={sede} patient={ctx.patient} />;
        const appointment = ctx.appointment;
        return (
          <div className="flex flex-col gap-space-md">
            {appointment ? (
              <p className="rounded-md bg-surface-container-low p-space-md text-body-md text-on-surface dark:bg-surface-container">
                Tiene cita hoy (<CodeText code={appointment.code} />): al confirmar, la cita pasa a «Llegó».
              </p>
            ) : null}
            <ArrivalWizard
              key={patientId}
              sede={sede}
              context={ctx}
              mode={appointment ? { kind: 'appointment', appointmentId: appointment.id, version: appointment.version } : { kind: 'walk_in', patientId: ctx.patient.id }}
              kiosk={kiosk}
              onDone={(r) => {
                onDone(r);
                void queryClient.invalidateQueries({ queryKey: ['kiosk-arrivals'] });
                void queryClient.invalidateQueries({ queryKey: ['panel'] });
              }}
            />
          </div>
        );
      }}
    </AsyncView>
  );
}
