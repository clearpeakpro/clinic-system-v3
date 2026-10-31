import {
  addDays,
  agendaDateRange,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUSES,
  shortAppointmentCode,
  type AgendaAppointment,
  type AgendaDay,
  type AppointmentStatus,
} from '@clinic/shared';
import {
  APPOINTMENT_STATUS_STYLE,
  AppointmentStatusChip,
  AsyncView,
  Button,
  cn,
  CodeText,
  DataTable,
  EmptyState,
  SegmentedControl,
  SelectField,
  type Column,
  type StatusTone,
} from '@clinic/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Clock, LayoutList, Rows3, Stethoscope } from 'lucide-react';
import { useRef, useState } from 'react';
import { AppointmentCard } from '../components/appointments/appointment-card.tsx';
import { AppointmentDetailDialog } from '../components/appointments/appointment-detail-dialog.tsx';
import { AGENDA_STRIPE } from '../components/catalog/catalog-dialog.tsx';
import { api, type ApiError } from '../lib/api.ts';
import {
  agendaPrefs,
  countByStatus,
  filterAgenda,
  groupByHour,
  hourLabel,
  initialProviderFilter,
  longDay,
  providerLabel,
  timeRange,
  typeLabel,
  useAgendaPrefs,
  type AgendaView,
  type ProviderFilter,
} from '../lib/appointments.ts';
import { formatDay } from '../lib/catalog.ts';
import { useActiveLocation, useMe } from '../lib/session.ts';

// S-REC-06 Citas (Stitch: design/stitch/recepcion/S-REC-06_citas_vista_dia),
// con la vista Día (S-REC-07), la vista Lista (S-REC-08) y el detalle
// (S-REC-09), en solo lectura (T-014). De Stitch: título con la fecha larga,
// barra con «<», la fecha, «>», «Hoy», el conmutador Día / Lista y el
// proveedor; los chips de estado con su número («Todos» con el total); las
// secciones por hora con «N citas» y las tarjetas. «Nueva cita» se ve
// deshabilitada hasta T-015 y «Sin cita» no aparece hasta la fase 3. La fecha
// va en la URL (?fecha=AAAA-MM-DD); sin ella, o si no es válida, el servidor
// devuelve hoy en la sede. Todo en la zona horaria de la sede.

const VIEWS = [
  { value: 'day', label: 'Día', icon: <Rows3 aria-hidden className="size-[18px]" /> },
  { value: 'list', label: 'Lista', icon: <LayoutList aria-hidden className="size-[18px]" /> },
] as const;

const TONE_TEXT: Record<StatusTone, string> = {
  registered: 'text-status-registered',
  waiting: 'text-status-waiting',
  'in-care': 'text-status-in-care',
  checkout: 'text-status-checkout',
  completed: 'text-status-completed',
  departed: 'text-status-departed',
  danger: 'text-error',
};

const citas = (n: number) => (n === 1 ? '1 cita' : `${String(n)} citas`);

export function AppointmentsPage({ sede, fecha }: { sede: string; fecha: string | undefined }) {
  const me = useMe();
  const active = useActiveLocation();
  const navigate = useNavigate();
  const roles = me.data?.roles ?? [];
  const isProvider = roles.includes('proveedor');
  const prefs = useAgendaPrefs(initialProviderFilter(roles));
  const [statuses, setStatuses] = useState<AppointmentStatus[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const dateInput = useRef<HTMLInputElement>(null);

  // Solo con la sede de la URL ya activa (al cambiarla por URL, el marco cambia el contexto).
  const ready = active?.code === sede;
  const agenda = useQuery<AgendaDay, ApiError>({
    queryKey: ['agenda', active?.id, fecha ?? 'hoy'],
    queryFn: () => api.agenda(fecha),
    enabled: ready,
    // Al cambiar de día se ve el anterior con la barra de carga; nunca el de otra sede.
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === active?.id ? keepPreviousData(previous) : undefined),
  });
  const data = agenda.data;
  const shown = data?.date ?? fecha;
  const range = data ? agendaDateRange(data.today) : null;
  // «Mis citas» solo para el rol Proveedor (T-014); si no, el filtro vuelve a «Todos».
  const provider: ProviderFilter = prefs.provider === 'mine' && !isProvider ? 'all' : prefs.provider;

  const goTo = (date: string | undefined) => {
    void navigate({ to: '/app/$sede/citas', params: { sede }, search: date ? { fecha: date } : {} });
  };
  const toggleStatus = (status: AppointmentStatus) => {
    setStatuses((current) => (current.includes(status) ? current.filter((s) => s !== status) : [...current, status]));
  };
  const clearFilters = () => {
    setStatuses([]);
    agendaPrefs.setProvider('all');
  };
  const openPicker = () => {
    const input = dateInput.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  };

  return (
    <section aria-labelledby="page-title" className="mx-auto flex w-full max-w-7xl flex-col gap-space-lg">
      <header className="flex flex-wrap items-end justify-between gap-space-md">
        <div className="flex min-w-0 flex-col gap-space-xs">
          <h1 id="page-title" className="text-display-md text-on-surface">
            Citas
          </h1>
          <p className="text-body-lg text-on-surface-variant">{shown ? longDay(shown) : ' '}</p>
        </div>
        <span className="flex flex-col items-end">
          <Button disabled aria-describedby="new-appointment-note">
            <CalendarPlus aria-hidden className="size-5" /> Nueva cita
          </Button>
          <span id="new-appointment-note" className="text-caption text-on-surface-variant">
            Llega con la agenda
          </span>
        </span>
      </header>

      <div className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-md shadow-level-1 dark:bg-surface-container-low">
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <div className="flex flex-wrap items-center gap-space-xs">
            <Button
              variant="tonal"
              className="px-3"
              aria-label="Día anterior"
              title="Día anterior"
              disabled={!shown || (range !== null && addDays(shown, -1) < range.min)}
              onClick={() => { if (shown) goTo(addDays(shown, -1)); }}
            >
              <ChevronLeft aria-hidden className="size-5" />
            </Button>
            <span className="relative">
              <Button variant="tonal" onClick={openPicker} aria-label={shown ? `Elegir fecha: ${formatDay(shown)}` : 'Elegir fecha'}>
                <CalendarDays aria-hidden className="size-5" />
                <span className="tabular-nums">{shown ? formatDay(shown) : ''}</span>
              </Button>
              <input
                ref={dateInput}
                type="date"
                aria-label="Fecha"
                tabIndex={-1}
                className="pointer-events-none absolute inset-0 opacity-0"
                value={shown ?? ''}
                {...(range ? { min: range.min, max: range.max } : {})}
                onChange={(e) => { if (e.target.value) goTo(e.target.value); }}
              />
            </span>
            <Button
              variant="tonal"
              className="px-3"
              aria-label="Día siguiente"
              title="Día siguiente"
              disabled={!shown || (range !== null && addDays(shown, 1) > range.max)}
              onClick={() => { if (shown) goTo(addDays(shown, 1)); }}
            >
              <ChevronRight aria-hidden className="size-5" />
            </Button>
            {data && data.date !== data.today ? (
              <Button variant="tonal" onClick={() => { goTo(undefined); }}>
                Hoy
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-space-sm">
            <SegmentedControl<AgendaView> label="Vista" options={VIEWS} value={prefs.view} onChange={(v) => { agendaPrefs.setView(v); }} />
            <SelectField
              label="Proveedor"
              hideLabel
              icon={<Stethoscope className="size-5" />}
              className="w-72"
              value={provider}
              onChange={(e) => { agendaPrefs.setProvider(e.target.value as ProviderFilter); }}
            >
              <option value="all">Todos los proveedores</option>
              {isProvider ? <option value="mine">Mis citas</option> : null}
              <option value="none">Sin asignar</option>
              {data?.providers.map((p) => (
                <option key={p.membershipId} value={`member:${p.membershipId}`}>
                  {p.name}
                </option>
              ))}
            </SelectField>
          </div>
        </div>
        <StatusChips appointments={data?.appointments ?? []} selected={statuses} onToggle={toggleStatus} onAll={() => { setStatuses([]); }} />
      </div>

      {ready ? (
        <AsyncView
          source={agenda}
          isEmpty={(d) => filterAgenda(d.appointments, provider, statuses, d.myMembershipId).length === 0}
          empty={
            data && data.appointments.length > 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="No hay citas"
                description="Ninguna cita coincide con los filtros actuales."
                action={
                  <Button variant="tonal" onClick={clearFilters}>
                    Quitar filtros
                  </Button>
                }
              />
            ) : (
              <EmptyState icon={CalendarDays} title="No hay citas" description="No hay nada programado para este día." />
            )
          }
        >
          {(d) => {
            const rows = filterAgenda(d.appointments, provider, statuses, d.myMembershipId);
            const open = (a: AgendaAppointment) => { setOpenId(a.id); };
            return prefs.view === 'day' ? (
              <DayView rows={rows} agenda={d} onOpen={open} />
            ) : (
              <ListView rows={rows} agenda={d} onOpen={open} />
            );
          }}
        </AsyncView>
      ) : null}

      {openId && data ? (
        <AppointmentDetailDialog appointmentId={openId} sede={sede} myMembershipId={data.myMembershipId} onClose={() => { setOpenId(null); }} />
      ) : null}
    </section>
  );
}

/** Chips de estado (Stitch): «Todos» con el total y cada estado con su icono, su color y su número; selección múltiple. */
function StatusChips({
  appointments,
  selected,
  onToggle,
  onAll,
}: {
  appointments: AgendaAppointment[];
  selected: AppointmentStatus[];
  onToggle: (status: AppointmentStatus) => void;
  onAll: () => void;
}) {
  const counts = countByStatus(appointments);
  const chip = 'inline-flex min-h-touch items-center gap-space-xs rounded-full border px-space-md text-body-md-medium transition-colors';
  const count = 'rounded-full px-2 py-0.5 text-caption tabular-nums';
  return (
    <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-space-sm">
      <button
        type="button"
        aria-pressed={selected.length === 0}
        onClick={onAll}
        className={cn(
          chip,
          selected.length === 0
            ? 'border-primary bg-primary text-on-primary'
            : 'border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low dark:bg-surface-container-low',
        )}
      >
        Todos
        <span className={cn(count, selected.length === 0 ? 'bg-on-primary/20' : 'bg-surface-container dark:bg-surface-container-high')}>{appointments.length}</span>
      </button>
      {APPOINTMENT_STATUSES.map((status) => {
        const style = APPOINTMENT_STATUS_STYLE[status];
        const Icon = style.icon;
        const on = selected.includes(status);
        return (
          <button
            key={status}
            type="button"
            aria-pressed={on}
            onClick={() => { onToggle(status); }}
            className={cn(
              chip,
              on
                ? 'border-primary bg-surface-container text-on-surface dark:bg-surface-container-highest'
                : 'border-transparent bg-transparent text-on-surface hover:bg-surface-container-low dark:hover:bg-surface-container',
            )}
          >
            <Icon aria-hidden className={cn('size-4', TONE_TEXT[style.tone])} />
            {APPOINTMENT_STATUS_LABELS[status]}
            <span className={cn(count, 'bg-surface-container dark:bg-surface-container-high')}>{counts[status]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** S-REC-07: una sección por hora local con citas, con sus tarjetas. */
function DayView({ rows, agenda, onOpen }: { rows: AgendaAppointment[]; agenda: AgendaDay; onOpen: (a: AgendaAppointment) => void }) {
  return (
    <div className="flex flex-col gap-space-lg">
      {groupByHour(rows, agenda.timeZone).map((group) => (
        <section key={group.key} aria-label={hourLabel(group.hour)} className="flex flex-col gap-space-md">
          <div className="flex items-center gap-space-sm">
            <h2 className="flex items-center gap-space-xs rounded-md bg-surface-container px-space-sm py-1 text-headline-sm text-on-surface dark:bg-surface-container-high">
              <Clock aria-hidden className="size-5 text-primary" />
              {hourLabel(group.hour)}
            </h2>
            <span className="text-caption text-on-surface-variant">{citas(group.items.length)}</span>
            <span aria-hidden className="h-px flex-1 bg-outline-variant" />
          </div>
          <ul className="flex flex-wrap gap-space-md">
            {group.items.map((a) => (
              <li key={a.id} className="w-full tab:w-80">
                <AppointmentCard appointment={a} timeZone={agenda.timeZone} myMembershipId={agenda.myMembershipId} onOpen={onOpen} className="h-full" />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** S-REC-08: tabla en tableta y escritorio; en el teléfono, las mismas tarjetas sin agrupar. */
function ListView({ rows, agenda, onOpen }: { rows: AgendaAppointment[]; agenda: AgendaDay; onOpen: (a: AgendaAppointment) => void }) {
  const columns: Column<AgendaAppointment>[] = [
    {
      key: 'hora',
      header: 'Hora',
      cell: (a) => (
        <span className="flex items-center gap-space-sm">
          <span aria-hidden className={cn('h-8 w-1.5 shrink-0 rounded-full', AGENDA_STRIPE[a.type.color])} />
          <span className="whitespace-nowrap tabular-nums">{timeRange(a.startsAt, a.durationMinutes, agenda.timeZone)}</span>
        </span>
      ),
    },
    {
      key: 'codigo',
      header: 'Código',
      primary: true,
      cell: (a) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(a);
          }}
          aria-label={`Abrir la cita ${shortAppointmentCode(a.code)}`}
          className="min-h-touch rounded-sm font-mono text-code-sm whitespace-nowrap text-primary tabular-nums underline-offset-4 hover:underline"
        >
          {shortAppointmentCode(a.code)}
        </button>
      ),
    },
    {
      key: 'paciente',
      header: 'Paciente',
      cell: (a) => (
        <span className="flex flex-wrap items-baseline gap-x-space-sm">
          <CodeText code={a.patient.code} />
          <span className={cn('text-body-md-medium', a.status === 'CANCELLED' && 'line-through')}>
            {a.patient.firstName} {a.patient.lastName}
          </span>
        </span>
      ),
    },
    { key: 'tipo', header: 'Tipo', cell: (a) => typeLabel(a.type) },
    {
      key: 'proveedor',
      header: 'Proveedor',
      cell: (a) => {
        const p = providerLabel(a.provider, agenda.myMembershipId);
        return <span className={cn(p.unassigned && 'text-on-surface-variant italic')}>{p.text}</span>;
      },
    },
    { key: 'duracion', header: 'Duración', align: 'end', cell: (a) => <span className="whitespace-nowrap tabular-nums">{a.durationMinutes} min</span> },
    { key: 'estado', header: 'Estado', cell: (a) => <AppointmentStatusChip status={a.status} /> },
  ];
  return (
    <>
      <div className="hidden tab:block">
        <DataTable caption="Citas del día" columns={columns} rows={rows} rowKey={(a) => a.id} onRowClick={onOpen} />
      </div>
      <ul aria-label="Citas del día" className="flex flex-col gap-space-sm tab:hidden">
        {rows.map((a) => (
          <li key={a.id}>
            <AppointmentCard appointment={a} timeZone={agenda.timeZone} myMembershipId={agenda.myMembershipId} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </>
  );
}
