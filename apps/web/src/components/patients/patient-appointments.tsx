import { addDays, shortAppointmentCode, type PatientAppointmentRow, type PatientAppointments } from '@clinic/shared';
import { AppointmentStatusChip, Button, cn, DataTable, DateTimeText, EmptyState, ErrorState, Spinner, type Column } from '@clinic/ui';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { BriefcaseMedical, Building2, CalendarClock, CalendarDays, ChevronDown, ExternalLink, Stethoscope } from 'lucide-react';
import type { ApiError } from '../../lib/api.ts';
import { dayBadge, localDay, providerLabel, relativeDay, typeLabel } from '../../lib/appointments.ts';
import { formatDay } from '../../lib/catalog.ts';
import { AGENDA_STRIPE } from '../catalog/catalog-dialog.tsx';

// Citas del paciente en el perfil (T-014), en solo lectura: las crea y
// cambia la agenda.
//  - S-PAC-07 Pestaña Citas: «Abrir citas» y la tabla con «Fecha», «Hora»,
//    «Código», «Sede», «Tipo», «Proveedor» y «Estado», de la más reciente a la
//    más antigua, con «Cargar más» (50 por página). Una fila abre la agenda de
//    la sede de la cita en su fecha, con su detalle (desde ahí, «Registrar
//    llegada», T-017). Solo las de las sedes donde quien mira
//    tiene Citas.
//  - «Próxima cita» del Resumen (Stitch S-PAC-05): estado, la fecha
//    destacada, «Mañana · 9:30 a. m.», el tipo, el proveedor y la sede (Stitch
//    pone un consultorio, que el sistema no tiene).
// Fechas y horas en la zona horaria de la sede activa.

export type PatientAppointmentsQuery = UseInfiniteQueryResult<InfiniteData<PatientAppointments>, ApiError>;

export function PatientAppointmentsTab({ query, sede, timeZone }: { query: PatientAppointmentsQuery; sede: string; timeZone: string }) {
  const navigate = useNavigate();
  const openAgenda = (row: PatientAppointmentRow) => {
    void navigate({ to: '/app/$sede/citas', params: { sede: row.location.code }, search: { fecha: localDay(row.startsAt, timeZone), cita: row.id } });
  };
  const pages = query.data?.pages ?? [];
  const rows = [...new Map(pages.flatMap((p) => p.appointments).map((a) => [a.id, a])).values()];

  const columns: Column<PatientAppointmentRow>[] = [
    {
      key: 'fecha',
      header: 'Fecha',
      cell: (a) => (
        <span className="flex items-center gap-space-sm">
          <span aria-hidden className={cn('h-8 w-1.5 shrink-0 rounded-full', AGENDA_STRIPE[a.type.color])} />
          <DateTimeText value={a.startsAt} timeZone={timeZone} format="date" />
        </span>
      ),
    },
    { key: 'hora', header: 'Hora', cell: (a) => <DateTimeText value={a.startsAt} timeZone={timeZone} format="time" /> },
    {
      key: 'codigo',
      header: 'Código',
      primary: true,
      cell: (a) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openAgenda(a);
          }}
          aria-label={`Abrir en la agenda la cita ${shortAppointmentCode(a.code)}`}
          className="min-h-touch rounded-sm font-mono text-code-sm whitespace-nowrap text-primary tabular-nums underline-offset-4 hover:underline"
        >
          {shortAppointmentCode(a.code)}
        </button>
      ),
    },
    { key: 'sede', header: 'Sede', cell: (a) => a.location.code },
    { key: 'tipo', header: 'Tipo', cell: (a) => typeLabel(a.type) },
    {
      key: 'proveedor',
      header: 'Proveedor',
      cell: (a) => (a.provider ? providerLabel(a.provider).text : <span className="text-on-surface-variant italic">Sin asignar</span>),
    },
    { key: 'estado', header: 'Estado', cell: (a) => <AppointmentStatusChip status={a.status} /> },
  ];

  return (
    <div className="flex flex-col gap-space-md">
      <div className="flex justify-end">
        <Button variant="text" onClick={() => void navigate({ to: '/app/$sede/citas', params: { sede }, search: {} })}>
          <ExternalLink aria-hidden className="size-5" /> Abrir citas
        </Button>
      </div>
      {query.data === undefined ? (
        query.error ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <Spinner />
        )
      ) : rows.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Aún no hay citas." description="Las citas del paciente se mostrarán aquí." />
      ) : (
        <>
          <DataTable caption="Citas del paciente" columns={columns} rows={rows} rowKey={(a) => a.id} onRowClick={openAgenda} />
          {query.hasNextPage ? (
            <Button variant="tonal" className="self-center" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
              <ChevronDown aria-hidden className="size-5" /> Cargar más
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Contenido de la tarjeta «Próxima cita» del Resumen. */
export function UpcomingAppointment({ query, timeZone }: { query: PatientAppointmentsQuery; timeZone: string }) {
  const first = query.data?.pages[0];
  if (!first) {
    return query.error ? (
      <p className="text-body-md text-on-surface-variant">No se pudo cargar la próxima cita.</p>
    ) : (
      <Spinner />
    );
  }
  const a = first.upcoming;
  if (!a) return <p className="text-body-md text-on-surface-variant">{first.appointments.length > 0 ? 'Sin próximas citas.' : 'Aún no hay citas.'}</p>;
  const day = localDay(a.startsAt, timeZone);
  const badge = dayBadge(day);
  const provider = providerLabel(a.provider);
  return (
    <div className="flex flex-col gap-space-md" data-testid="upcoming-appointment">
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-md">
          <span className="flex w-16 shrink-0 flex-col items-center rounded-md bg-surface-container py-space-xs text-primary dark:bg-surface-container-high">
            <span className="text-caption font-semibold tracking-wide">{badge.month}</span>
            <span className="text-headline-lg tabular-nums">{badge.day}</span>
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex items-center gap-space-xs text-body-lg-medium text-on-surface">
              <CalendarClock aria-hidden className="size-5 text-on-surface-variant" />
              {relativeDay(day, first.today, addDays(first.today, 1))} · <DateTimeText value={a.startsAt} timeZone={timeZone} format="time" />
            </span>
            <span className="flex items-center gap-space-xs text-body-md text-on-surface-variant">
              <Stethoscope aria-hidden className="size-5" /> {typeLabel(a.type)}
            </span>
          </div>
        </div>
        <AppointmentStatusChip status={a.status} />
      </div>
      <div className="flex flex-wrap gap-x-space-lg gap-y-space-xs text-body-md text-on-surface-variant">
        <span className="flex items-center gap-space-xs">
          <BriefcaseMedical aria-hidden className="size-5" />
          <span className={cn(provider.unassigned && 'italic')}>{provider.text}</span>
        </span>
        <span className="flex items-center gap-space-xs">
          <Building2 aria-hidden className="size-5" /> {a.location.name} ({a.location.code})
        </span>
        <span className="sr-only">Fecha: {formatDay(day)}</span>
      </div>
    </div>
  );
}
