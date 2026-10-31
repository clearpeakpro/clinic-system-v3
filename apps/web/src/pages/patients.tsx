import { ageLabel, ageOn, formatPhone, parsePatientQuery, type PatientSearchResult, type PatientSummary } from '@clinic/shared';
import { Banner, Button, Checkbox, cn, CodeText, DataTable, EmptyState, ErrorState, Field, SemanticChip, Spinner, useSnackbar, type Column } from '@clinic/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, ChevronDown, CornerDownLeft, FolderSearch, Info, Lock, RotateCcw, Search, UserPlus, UserSearch, UsersRound } from 'lucide-react';
import { useEffect, useState, type SubmitEvent } from 'react';
import { NewPatientDialog } from '../components/patients/new-patient-dialog.tsx';
import { api, type ApiError } from '../lib/api.ts';
import { formatDay } from '../lib/catalog.ts';
import { patientInitials, patientMessage, patientSearch, queryErrorText, useSubmittedSearch } from '../lib/patients.ts';
import { useActiveLocation, useMe } from '../lib/session.ts';

// S-PAC-01 Pacientes (Stitch: design/stitch/pacientes/S-PAC-01_pacientes).
// Se toma la distribución: migas, título con «Crear paciente», la tarjeta
// «Búsqueda de expedientes clínicos» con la regla operativa, «Limpiar» y
// «Buscar», «Resultados encontrados» con su total, la tabla y «Cargar más
// pacientes», y el estado inicial. Cambio decidido (ADR 0030): un solo campo
// que interpreta fecha, teléfono, código o nombre, en vez de cinco. No se
// construye lo que el sistema no tiene (estadísticas, «Ordenar por»,
// descargar, sexo y seguro bajo el nombre, chips de escáner y búsqueda
// fonética) ni textos que afirmen cumplimiento de normas. La búsqueda se lanza
// solo con «Buscar» o Enter, y vive solo en memoria. «Incluir inactivos»
// (T-013) se aplica al buscar; por código se encuentra siempre.

export function PatientsPage() {
  const me = useMe();
  const active = useActiveLocation();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const canCreate = me.data?.permissions.includes('patients.create') ?? false;
  const { text: submitted, includeInactive: submittedInactive, version } = useSubmittedSearch();
  const [text, setText] = useState(submitted ?? '');
  const [includeInactive, setIncludeInactive] = useState(submittedInactive);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const results = useInfiniteQuery<PatientSearchResult, ApiError>({
    // La versión hace que repetir la misma búsqueda vuelva a pedirla (y a auditarla).
    queryKey: ['patient-search', submitted, submittedInactive, version],
    queryFn: ({ pageParam }) => api.searchPatients(submitted ?? '', pageParam as number, submittedInactive),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    enabled: submitted !== null,
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    retry: false,
  });

  // «Buscar pacientes» de la cabecera llega aquí con el foco en el campo.
  useEffect(() => {
    focusSearch();
  }, []);
  // Una búsqueda enviada desde la cabecera reemplaza el texto del campo.
  const [seenVersion, setSeenVersion] = useState(version);
  if (seenVersion !== version) {
    setSeenVersion(version);
    setText(submitted ?? '');
    setIncludeInactive(submittedInactive);
  }

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parsePatientQuery(text);
    if (!parsed.ok) {
      const message = queryErrorText(parsed.error);
      setError(message);
      if (!message) patientSearch.submit(null);
      return;
    }
    setError(null);
    patientSearch.submit(text.trim(), includeInactive);
  };
  const clear = () => {
    setText('');
    setIncludeInactive(false);
    setError(null);
    patientSearch.submit(null);
    focusSearch();
  };
  const openProfile = (patientId: string) => {
    if (active) void navigate({ to: '/app/$sede/pacientes/$id', params: { sede: active.code, id: patientId } });
  };

  const pages = results.data?.pages ?? [];
  // Sin repetir filas entre páginas.
  const rows = [...new Map(pages.flatMap((p) => p.patients).map((p) => [p.id, p])).values()];
  const total = pages[0]?.total ?? 0;
  const today = pages[0]?.today ?? '';

  return (
    <section aria-labelledby="page-title" className="mx-auto flex w-full max-w-7xl flex-col gap-space-lg">
      <header className="flex flex-wrap items-end justify-between gap-space-md">
        <div className="flex min-w-0 flex-col gap-space-xs">
          {active ? (
            <p className="flex items-center gap-space-xs text-caption font-semibold tracking-wide text-primary uppercase">
              <FolderSearch aria-hidden className="size-4" /> Sede {active.name} ({active.code}) • Expedientes
            </p>
          ) : null}
          <h1 id="page-title" className="text-display-md text-on-surface">
            Pacientes
          </h1>
          <p className="text-body-lg text-on-surface-variant">
            Búsqueda y alta de pacientes{active ? ` de ${active.organizationName}` : ''}.
          </p>
        </div>
        {canCreate ? (
          <Button className="hidden shrink-0 tab:inline-flex" onClick={() => { setCreating(true); }}>
            <UserPlus aria-hidden className="size-5" /> Crear paciente
          </Button>
        ) : null}
      </header>

      <form
        role="search"
        aria-labelledby="search-title"
        noValidate
        onSubmit={submit}
        className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-lg shadow-level-1 dark:bg-surface-container-low"
      >
        <div className="flex items-center gap-space-sm">
          <span aria-hidden className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <UserSearch className="size-5" />
          </span>
          <div className="flex flex-col">
            <h2 id="search-title" className="text-headline-sm text-on-surface">
              Búsqueda de expedientes clínicos
            </h2>
            <p className="text-caption text-on-surface-variant">Nombre, fecha de nacimiento, teléfono o código del paciente.</p>
          </div>
        </div>
        <p className="flex items-start gap-space-xs rounded-md bg-primary/10 px-space-sm py-space-xs text-body-md text-on-surface">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            <strong>Regla operativa:</strong> la búsqueda se ejecuta únicamente al pulsar «Buscar» o presionar Enter.
          </span>
        </p>
        <Field
          id={SEARCH_INPUT_ID}
          label="Buscar paciente"
          icon={<Search className="size-5" />}
          autoComplete="off"
          spellCheck={false}
          maxLength={200}
          placeholder="Ej. maria lopez, 11241985, (214) 555-0101 o P-000123"
          hint="Fecha como MMDDAAAA"
          value={text}
          error={error}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
        />
        <Checkbox label="Incluir inactivos" checked={includeInactive} onCheckedChange={setIncludeInactive} />
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <p className="flex items-center gap-space-xs text-caption text-on-surface-variant">
            <CornerDownLeft aria-hidden className="size-4" /> Presione Enter para iniciar la búsqueda
          </p>
          <div className="flex gap-space-sm">
            <Button type="button" variant="tonal" className="text-on-surface" onClick={clear}>
              <RotateCcw aria-hidden className="size-5" /> Limpiar
            </Button>
            <Button type="submit" loading={results.isFetching && !results.isFetchingNextPage}>
              <Search aria-hidden className="size-5" /> Buscar
            </Button>
          </div>
        </div>
      </form>

      <div className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-md shadow-level-1 dark:bg-surface-container-low">
        {submitted === null ? (
          <InitialState />
        ) : results.isPending ? (
          <div className="flex justify-center py-space-xl">
            <Spinner />
          </div>
        ) : results.isError && rows.length === 0 ? (
          <ErrorState error={results.error} onRetry={() => void results.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="No se encontraron pacientes"
            description="Ningún paciente coincide con estos criterios."
            {...(canCreate
              ? {
                  action: (
                    <Button onClick={() => { setCreating(true); }}>
                      <UserPlus aria-hidden className="size-5" /> Crear paciente
                    </Button>
                  ),
                }
              : {})}
          />
        ) : (
          <>
            <div className="flex items-center gap-space-sm">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-body-md-medium text-primary">{total}</span>
              <div className="flex flex-col">
                <h2 className="text-headline-sm text-on-surface">Resultados encontrados</h2>
                <p className="text-caption text-on-surface-variant">
                  Mostrando {rows.length} de {total} coincidencias
                </p>
              </div>
            </div>
            <DataTable
              caption="Resultados de la búsqueda de pacientes"
              density="compact"
              cardsBelow="tab"
              rows={rows}
              rowKey={(r) => r.id}
              columns={columns(today, openProfile)}
            />
            {results.isFetchNextPageError ? <Banner tone="error" title={patientMessage(results.error)} /> : null}
            {results.hasNextPage || results.isFetchNextPageError ? (
              <div className="flex flex-col items-center gap-space-xs">
                <Button variant="tonal" loading={results.isFetchingNextPage} onClick={() => void results.fetchNextPage()}>
                  <ChevronDown aria-hidden className="size-5" /> {results.isFetchNextPageError ? 'Reintentar' : 'Cargar más pacientes'}
                </Button>
                <p className="text-caption text-on-surface-variant">
                  Mostrando {rows.length} pacientes de {total} coincidencias
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>

      {canCreate ? (
        <Button
          className="fixed right-4 bottom-24 z-20 size-14 rounded-full p-0 shadow-level-3 tab:hidden"
          aria-label="Crear paciente"
          title="Crear paciente"
          onClick={() => { setCreating(true); }}
        >
          <UserPlus aria-hidden className="size-6" />
        </Button>
      ) : null}
      {creating && active ? (
        <NewPatientDialog
          today={today || todayIn(active.timezone)}
          onClose={() => { setCreating(false); }}
          onOpenExisting={(id) => {
            setCreating(false);
            openProfile(id);
          }}
          onCreated={(created) => {
            setCreating(false);
            snackbar({ message: 'Paciente creado.' });
            openProfile(created.id);
          }}
        />
      ) : null}
    </section>
  );
}

/** Estado inicial: aún no se buscó (no se muestra ningún paciente por defecto). */
function InitialState() {
  return (
    <div className="flex flex-col items-center gap-space-md px-space-md py-space-xl text-center">
      <span aria-hidden className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <UserSearch className="size-8" />
      </span>
      <div className="flex flex-col gap-space-xs">
        <h2 className="text-headline-sm text-on-surface">Buscar pacientes</h2>
        <p className="text-body-lg text-on-surface-variant">Ingrese nombre, fecha de nacimiento, teléfono o código y pulse Buscar.</p>
      </div>
      <p className="flex items-center gap-space-xs text-body-md text-on-surface-variant">
        <Lock aria-hidden className="size-4" /> Las búsquedas y consultas de pacientes quedan registradas.
      </p>
    </div>
  );
}

function columns(today: string, onOpen: (id: string) => void): Column<PatientSummary>[] {
  return [
    { key: 'code', header: 'Código', cell: (p) => <CodeText code={p.code} /> },
    {
      key: 'name',
      header: 'Nombre completo',
      primary: true,
      className: 'min-w-48',
      cell: (p) => (
        <span className="flex items-center gap-space-sm">
          <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-caption font-semibold text-secondary">
            {patientInitials(p.firstName, p.lastName)}
          </span>
          <span className="text-body-lg-medium text-on-surface">
            {p.firstName} {p.lastName}
          </span>
        </span>
      ),
    },
    { key: 'birth', header: 'Fecha nac.', cell: (p) => <span className="font-mono whitespace-nowrap">{formatDay(p.birthDate)}</span> },
    { key: 'age', header: 'Edad', cell: (p) => (today ? ageLabel(ageOn(p.birthDate, today)) : '—') },
    {
      key: 'phone',
      header: 'Teléfono',
      cell: (p) => (p.phone ? <span className="font-mono whitespace-nowrap">{formatPhone(p.phone)}</span> : <span className="text-on-surface-variant">No indicado</span>),
    },
    {
      key: 'status',
      header: 'Estado',
      cell: (p) => <SemanticChip tone={p.status === 'active' ? 'success' : 'neutral'} label={p.status === 'active' ? 'Activo' : 'Inactivo'} />,
    },
    {
      key: 'actions',
      header: 'Acciones',
      align: 'end',
      cell: (p) => (
        <Button variant="tonal" className={cn('whitespace-nowrap')} aria-label={`Ver perfil de ${p.firstName} ${p.lastName}`} onClick={() => { onOpen(p.id); }}>
          Ver perfil <ArrowRight aria-hidden className="size-5" />
        </Button>
      ),
    },
  ];
}

const SEARCH_INPUT_ID = 'patient-search';

function focusSearch() {
  document.getElementById(SEARCH_INPUT_ID)?.focus();
}

/** Hoy en la zona de la sede, antes de la primera búsqueda. */
function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
