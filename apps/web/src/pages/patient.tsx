import { ageLabel, ageOn, canSchedule, formatPhone, shortAppointmentCode, type PatientAppointments, type PatientProfile } from '@clinic/shared';
import { AsyncView, Button, CodeText, DateTimeText, EmptyState, SemanticChip, Tabs, useSnackbar, type TabItem } from '@clinic/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  Cake,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  Contact,
  History,
  Megaphone,
  NotebookPen,
  Pencil,
  Phone,
  Share2,
  SquareCheckBig,
  Wallet,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  canOpenEditor,
  EditPatientDialog,
  PatientStatusDialog,
  VersionConflictDialog,
  type PatientEditScope,
} from '../components/patients/edit-patient-dialog.tsx';
import { useAfterAppointmentChange } from '../components/appointments/appointment-detail-dialog.tsx';
import { AppointmentFormDialog } from '../components/appointments/appointment-form-dialog.tsx';
import { PatientAppointmentsTab, UpcomingAppointment, type PatientAppointmentsQuery } from '../components/patients/patient-appointments.tsx';
import { api, type ApiError } from '../lib/api.ts';
import { formatDay } from '../lib/catalog.ts';
import { patientInitials } from '../lib/patients.ts';
import { useActiveLocation, useMe } from '../lib/session.ts';

// S-PAC-05 Perfil del paciente (Stitch: design/stitch/pacientes/S-PAC-05_perfil_del_paciente),
// T-013. Se toma de Stitch: «Volver a Pacientes», «Editar» y «Nueva cita»
// arriba; el encabezado con iniciales, nombre, código, estado y «fecha
// (edad) • teléfono • Origen: fuente»; las pestañas con icono; en Resumen,
// «Próxima cita», «Última visita» y la tarjeta ancha «Información de
// Contacto y Admisión» con «Actualizar datos». No se construye lo que el
// sistema no tiene (foto, triaje, alerta médica, saldo y factura, contacto
// de emergencia, seguro, idioma, farmacia, EHR, contadores de las pestañas)
// ni «Fusionar con…» (S-PAC-13) ni Documentos. «Nueva cita» (T-015) abre
// S-REC-10 con el paciente ya elegido, para la sede activa. Cada apertura se audita en el servidor (patient.read) y no se guarda
// en caché. La pestaña no va en la URL: al volver, el perfil abre en Resumen.
// T-014: la pestaña Citas (S-PAC-07) y la «Próxima cita» del Resumen, en solo
// lectura; sin acceso a Citas (Enfermería, ADR 0027) no se muestran.

type TabKey = 'resumen' | 'citas' | 'visitas' | 'saldos';

const TABS: readonly TabItem<TabKey>[] = [
  { key: 'resumen', label: 'Resumen', icon: ClipboardList },
  { key: 'citas', label: 'Citas', icon: CalendarDays },
  { key: 'visitas', label: 'Visitas', icon: History },
  { key: 'saldos', label: 'Saldos', icon: Wallet },
];

/** Las visitas, los saldos y la última visita llegan con la fase 3 (T-013). */
const PHASE_3 = 'Llega en la fase 3.';

export function PatientPage({ sede, patientId }: { sede: string; patientId: string }) {
  const me = useMe();
  const timeZone = useActiveLocation()?.timezone ?? 'America/Chicago';
  const snackbar = useSnackbar();
  const permissions = me.data?.permissions ?? [];
  const scope: PatientEditScope = {
    edit: permissions.includes('patients.edit'),
    editPhone: permissions.includes('patients.edit_phone'),
    editBirthDate: permissions.includes('patients.edit_birth_date'),
    deactivate: permissions.includes('patients.deactivate'),
  };
  const canAppointments = permissions.includes('appointments.access');
  const canManageAppointments = canAppointments && permissions.includes('appointments.manage');
  const afterAppointment = useAfterAppointmentChange();
  const tabs = canAppointments ? TABS : TABS.filter((t) => t.key !== 'citas');
  const [tab, setTab] = useState<TabKey>('resumen');
  const appointments: PatientAppointmentsQuery = useInfiniteQuery<PatientAppointments, ApiError>({
    queryKey: ['patient-appointments', patientId],
    queryFn: ({ pageParam }) => api.patientAppointments(patientId, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    enabled: canAppointments,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const [dialog, setDialog] = useState<null | 'edit' | 'status' | 'conflict' | 'appointment'>(null);
  const patient = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => api.patient(patientId),
    staleTime: 0,
    gcTime: 0,
    retry: (failures: number, error: ApiError) => error.status >= 500 && failures < 2,
  });
  const reload = async (message?: string) => {
    await patient.refetch();
    setDialog(null);
    if (message) snackbar({ message });
  };

  return (
    <section aria-labelledby="page-title" className="mx-auto flex w-full max-w-7xl flex-col gap-space-lg">
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <Link
          to="/app/$sede/pacientes"
          params={{ sede }}
          className="flex min-h-touch items-center gap-space-xs rounded-md px-space-xs text-body-lg text-on-surface hover:bg-surface-container-low"
        >
          <ArrowLeft aria-hidden className="size-5" /> Volver a Pacientes
        </Link>
        {patient.data ? (
          <div className="flex flex-wrap items-center justify-end gap-space-sm">
            {canOpenEditor(scope) ? (
              <Button variant="tonal" onClick={() => { setDialog('edit'); }}>
                <Pencil aria-hidden className="size-5" /> Editar
              </Button>
            ) : null}
            {canManageAppointments && canSchedule(patient.data) ? (
              <Button onClick={() => { setDialog('appointment'); }}>
                <CalendarPlus aria-hidden className="size-5" /> Nueva cita
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <AsyncView source={patient} loading="skeleton">
        {(p) => (
          <>
            <ProfileHeader patient={p} />
            <Tabs label="Secciones del perfil" items={tabs} value={tab} onValueChange={setTab}>
              {tab === 'resumen' ? (
                <Summary
                  patient={p}
                  timeZone={timeZone}
                  {...(canAppointments ? { appointments } : {})}
                  {...(canOpenEditor(scope) ? { onEdit: () => { setDialog('edit'); } } : {})}
                />
              ) : tab === 'citas' && canAppointments ? (
                <PatientAppointmentsTab query={appointments} sede={sede} timeZone={timeZone} />
              ) : tab === 'visitas' ? (
                <EmptyState icon={History} title="Aún no hay visitas." description={PHASE_3} />
              ) : (
                <EmptyState icon={Wallet} title="No hay saldos pendientes." description={PHASE_3} />
              )}
            </Tabs>
            {dialog === 'edit' ? (
              <EditPatientDialog
                patient={p}
                scope={scope}
                onClose={() => { setDialog(null); }}
                onSaved={() => void reload('Paciente actualizado.')}
                onConflict={() => { setDialog('conflict'); }}
                onStatusChange={() => { setDialog('status'); }}
              />
            ) : null}
            {dialog === 'status' ? (
              <PatientStatusDialog
                patient={p}
                onClose={() => { setDialog(null); }}
                onDone={() => void reload(p.status === 'active' ? 'Paciente inactivado.' : 'Paciente reactivado.')}
                onConflict={() => { setDialog('conflict'); }}
                onError={(message) => {
                  setDialog(null);
                  snackbar({ message });
                }}
              />
            ) : null}
            {dialog === 'conflict' ? <VersionConflictDialog onRefresh={() => void reload()} /> : null}
            {dialog === 'appointment' ? (
              <AppointmentFormDialog
                mode={{ kind: 'create', date: p.today, patient: { id: p.id, code: p.code, firstName: p.firstName, lastName: p.lastName } }}
                canCreatePatient={false}
                onClose={() => { setDialog(null); }}
                onConflict={() => { setDialog(null); }}
                onSaved={(saved) => {
                  setDialog(null);
                  void afterAppointment();
                  const message = `Cita ${shortAppointmentCode(saved.code)} creada.`;
                  snackbar({ message: saved.warnings.includes('provider_overlap') ? `${message} El proveedor ya tiene una cita en ese horario.` : message });
                }}
              />
            ) : null}
          </>
        )}
      </AsyncView>
    </section>
  );
}

function ProfileHeader({ patient: p }: { patient: PatientProfile }) {
  return (
    <header className="flex flex-wrap items-center gap-space-md rounded-lg bg-surface-container-lowest p-space-lg shadow-level-1 dark:bg-surface-container-low">
      <span aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-headline-sm text-secondary">
        {patientInitials(p.firstName, p.lastName)}
      </span>
      <div className="flex min-w-0 flex-col gap-space-xs">
        <div className="flex flex-wrap items-center gap-space-sm">
          <h1 id="page-title" className="text-display-md text-on-surface">
            {p.firstName} {p.lastName}
          </h1>
          <CodeText code={p.code} />
          <SemanticChip tone={p.status === 'active' ? 'success' : 'neutral'} label={p.status === 'active' ? 'Activo' : 'Inactivo'} />
        </div>
        <p className="flex flex-wrap items-center gap-x-space-md gap-y-space-xs text-body-lg text-on-surface-variant">
          <span className="flex items-center gap-space-xs">
            <Cake aria-hidden className="size-5" /> {formatDay(p.birthDate)} ({ageLabel(ageOn(p.birthDate, p.today))})
          </span>
          <span aria-hidden>•</span>
          <span className="flex items-center gap-space-xs">
            <Phone aria-hidden className="size-5" /> {p.phone ? formatPhone(p.phone) : 'Teléfono no indicado'}
          </span>
          {p.referralSource ? (
            <>
              <span aria-hidden>•</span>
              <span className="flex items-center gap-space-xs">
                <Share2 aria-hidden className="size-5" /> Origen: <strong className="font-medium text-on-surface">{p.referralSource.name}</strong>
              </span>
            </>
          ) : null}
        </p>
      </div>
    </header>
  );
}

/** S-PAC-06 Resumen: próxima cita (T-014, solo con acceso a Citas), última visita (fase 3) y los datos de admisión. */
function Summary({
  patient: p,
  timeZone,
  appointments,
  onEdit,
}: {
  patient: PatientProfile;
  timeZone: string;
  appointments?: PatientAppointmentsQuery;
  onEdit?: () => void;
}) {
  return (
    <div className="flex flex-col gap-space-md">
      <div className="grid gap-space-md tab:grid-cols-2">
        {appointments ? (
          <Card icon={<CalendarClock className="size-6" />} title="Próxima cita">
            <UpcomingAppointment query={appointments} timeZone={timeZone} />
          </Card>
        ) : null}
        <Card icon={<SquareCheckBig className="size-6" />} title="Última visita">
          <p className="text-body-md text-on-surface-variant">Aún no hay visitas. {PHASE_3}</p>
        </Card>
      </div>
      <Card
        icon={<Contact className="size-6" />}
        title="Información de Contacto y Admisión"
        action={
          onEdit ? (
            <Button variant="text" onClick={onEdit}>
              <NotebookPen aria-hidden className="size-5" /> Actualizar datos
            </Button>
          ) : null
        }
      >
        <dl className="grid gap-space-md tab:grid-cols-3">
          <Detail icon={<Phone className="size-4" />} label="Teléfono">
            <dd className="text-body-lg-medium text-on-surface">{p.phone ? formatPhone(p.phone) : 'No indicado'}</dd>
          </Detail>
          <Detail icon={<Megaphone className="size-4" />} label="Canal de registro">
            <dd className="text-body-lg-medium text-on-surface">{p.referralSource?.name ?? 'No indicado'}</dd>
            {p.referralDetails ? <dd className="text-body-md break-words text-on-surface-variant">{p.referralDetails}</dd> : null}
            <dd className="text-body-md text-on-surface-variant">
              Ingreso: <DateTimeText value={p.createdAt} timeZone={timeZone} format="date" />
            </dd>
          </Detail>
          <Detail icon={<CalendarCheck className="size-4" />} label="Última actualización">
            <dd className="text-body-lg-medium text-on-surface">
              <DateTimeText value={p.updatedAt} timeZone={timeZone} />
            </dd>
          </Detail>
        </dl>
      </Card>
    </div>
  );
}

function Card({ icon, title, action, children }: { icon: ReactNode; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-lg shadow-level-1 dark:bg-surface-container-low">
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <h2 className="flex items-center gap-space-xs text-headline-sm text-on-surface">
          <span aria-hidden className="text-primary">
            {icon}
          </span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Detail({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-surface-container-low p-space-md dark:bg-surface-container">
      <dt className="flex items-center gap-1 text-caption tracking-wider text-on-surface-variant uppercase">
        <span aria-hidden>{icon}</span>
        {label}
      </dt>
      {children}
    </div>
  );
}
