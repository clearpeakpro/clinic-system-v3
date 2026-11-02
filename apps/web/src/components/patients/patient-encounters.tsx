import { VISIT_ROUTE_LABELS, type PatientEncounterRow, type PatientEncounters } from '@clinic/shared';
import { Button, cn, DataTable, DateTimeText, EmptyState, ErrorState, RouteBadge, Spinner, VisitStatusChip, type Column } from '@clinic/ui';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { BriefcaseMedical, Building2, ChevronDown, ClipboardList, History } from 'lucide-react';
import type { ApiError } from '../../lib/api.ts';

// Visitas del paciente en el perfil (T-018), en solo lectura:
//  - S-PAC-08 Pestaña Visitas: «Visita», «Registro», «Sede», «Proveedor»,
//    «Ruta» y «Estado», de la más reciente a la más antigua, con «Cargar más»
//    (50 por página). Solo las sedes donde quien mira tiene un rol clínico
//    (decisión del 2026-11-01). Una fila abre la visita en su sede: si es
//    otra, la sede activa cambia por la URL (S-GEN-13), como dice el manual.
//  - «Última visita» del Resumen: la primera de la lista.
// Fechas y horas en la zona horaria de la sede activa.

export type PatientEncountersQuery = UseInfiniteQueryResult<InfiniteData<PatientEncounters>, ApiError>;

function useOpenEncounter() {
  const navigate = useNavigate();
  return (row: PatientEncounterRow) => {
    void navigate({ to: '/app/$sede/visitas/$id', params: { sede: row.location.code, id: row.id } });
  };
}

const providerCell = (row: PatientEncounterRow) =>
  row.provider?.name ? row.provider.name : <span className="text-on-surface-variant italic">Sin asignar</span>;

export function PatientEncountersTab({ query, timeZone }: { query: PatientEncountersQuery; timeZone: string }) {
  const open = useOpenEncounter();
  const rows = [...new Map((query.data?.pages ?? []).flatMap((p) => p.encounters).map((e) => [e.id, e])).values()];
  const columns: Column<PatientEncounterRow>[] = [
    {
      key: 'visita',
      header: 'Visita',
      primary: true,
      cell: (e) => (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            open(e);
          }}
          aria-label={`Abrir la visita ${e.code}`}
          className="min-h-touch rounded-sm font-mono text-code-sm whitespace-nowrap text-primary tabular-nums underline-offset-4 hover:underline"
        >
          {e.code}
        </button>
      ),
    },
    { key: 'registro', header: 'Registro', cell: (e) => <DateTimeText value={e.arrivedAt} timeZone={timeZone} /> },
    { key: 'sede', header: 'Sede', cell: (e) => e.location.code },
    { key: 'proveedor', header: 'Proveedor', cell: providerCell },
    { key: 'ruta', header: 'Ruta', cell: (e) => <RouteBadge route={e.route} /> },
    { key: 'estado', header: 'Estado', cell: (e) => <VisitStatusChip status={e.status} /> },
  ];

  if (query.data === undefined) return query.error ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : <Spinner />;
  if (rows.length === 0) return <EmptyState icon={History} title="Aún no hay visitas." description="Las visitas del paciente se mostrarán aquí." />;
  return (
    <div className="flex flex-col gap-space-md">
      <DataTable caption="Visitas del paciente" columns={columns} rows={rows} rowKey={(e) => e.id} onRowClick={open} />
      {query.hasNextPage ? (
        <Button variant="tonal" className="self-center" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          <ChevronDown aria-hidden className="size-5" /> Cargar más
        </Button>
      ) : null}
    </div>
  );
}

/** Contenido de la tarjeta «Última visita» del Resumen. */
export function LastEncounter({ query, timeZone }: { query: PatientEncountersQuery; timeZone: string }) {
  const open = useOpenEncounter();
  const first = query.data?.pages[0];
  if (!first) {
    return query.error ? <p className="text-body-md text-on-surface-variant">No se pudo cargar la última visita.</p> : <Spinner />;
  }
  const e = first.encounters[0];
  if (!e) return <p className="text-body-md text-on-surface-variant">Aún no hay visitas.</p>;
  return (
    <div className="flex flex-col gap-space-md" data-testid="last-encounter">
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-space-xs text-body-lg-medium text-on-surface">
            <ClipboardList aria-hidden className="size-5 text-on-surface-variant" />
            <DateTimeText value={e.arrivedAt} timeZone={timeZone} />
          </span>
          <span className="font-mono text-code-sm text-on-surface-variant tabular-nums">{e.code}</span>
        </div>
        <VisitStatusChip status={e.status} />
      </div>
      <div className="flex flex-wrap gap-x-space-lg gap-y-space-xs text-body-md text-on-surface-variant">
        <span className="flex items-center gap-space-xs">
          <Building2 aria-hidden className="size-5" /> {`${e.location.name} (${e.location.code})`}
        </span>
        <span className="flex items-center gap-space-xs">
          <BriefcaseMedical aria-hidden className="size-5" />
          <span className={cn(!e.provider?.name && 'italic')}>{e.provider?.name || 'Sin asignar'}</span>
        </span>
        <span>{VISIT_ROUTE_LABELS[e.route]}</span>
      </div>
      <Button variant="text" className="self-start" onClick={() => { open(e); }}>
        Abrir visita
      </Button>
    </div>
  );
}
