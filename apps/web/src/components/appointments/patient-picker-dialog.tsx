import { formatPhone, parsePatientQuery, type PatientSearchResult, type PatientSummary } from '@clinic/shared';
import { Banner, Button, Checkbox, cn, CodeText, Dialog, EmptyState, ErrorState, Field, SemanticChip, Spinner } from '@clinic/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronDown, RotateCcw, Search, UserPlus, UserSearch, UsersRound } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { api, type ApiError } from '../../lib/api.ts';
import { formatDay } from '../../lib/catalog.ts';
import { patientInitials, patientMessage, queryErrorText } from '../../lib/patients.ts';
import { NewPatientDialog } from '../patients/new-patient-dialog.tsx';

// S-REC-12 Elegir paciente (sin captura de Stitch: mismo estilo que S-PAC-01).
// El mismo campo único de la búsqueda de Pacientes (ADR 0030), con su estado
// propio: abrir el selector no muestra ni borra la búsqueda de otra pantalla.
// Solo busca con «Buscar» o Enter. Los pacientes inactivos se ven
// deshabilitados (no se les agenda: T-015). «Crear paciente», solo con
// patients.create: el paciente nuevo vuelve al formulario sin abrir el perfil.

export interface PickedPatient {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
}

export function PatientPickerDialog({
  today,
  canCreate,
  onPick,
  onClose,
}: {
  today: string;
  canCreate: boolean;
  onPick: (patient: PickedPatient) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [submitted, setSubmitted] = useState<{ q: string; inactive: boolean; n: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const results = useInfiniteQuery<PatientSearchResult, ApiError>({
    queryKey: ['patient-picker', submitted?.q, submitted?.inactive, submitted?.n],
    queryFn: ({ pageParam }) => api.searchPatients(submitted?.q ?? '', pageParam as number, submitted?.inactive ?? false),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    enabled: submitted !== null,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parsePatientQuery(text);
    if (!parsed.ok) {
      const message = queryErrorText(parsed.error);
      setError(message);
      if (!message) setSubmitted(null);
      return;
    }
    setError(null);
    setSubmitted({ q: text.trim(), inactive: includeInactive, n: (submitted?.n ?? 0) + 1 });
  };
  const clear = () => {
    setText('');
    setIncludeInactive(false);
    setError(null);
    setSubmitted(null);
  };
  /** Paciente creado o «Abrir existente» del alta: se lee para tener su nombre y su código. */
  const pickById = async (patientId: string) => {
    setCreating(false);
    try {
      const p = await api.patient(patientId);
      onPick({ id: p.id, code: p.code, firstName: p.firstName, lastName: p.lastName });
    } catch (e) {
      setLoadError(patientMessage(e));
    }
  };

  const rows = [...new Map((results.data?.pages ?? []).flatMap((p) => p.patients).map((p) => [p.id, p])).values()];
  const createButton = canCreate ? (
    <Button onClick={() => { setCreating(true); }}>
      <UserPlus aria-hidden className="size-5" /> Crear paciente
    </Button>
  ) : undefined;

  return (
    <>
      <Dialog
        open={!creating}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title="Elegir paciente"
        wide
        fullScreenOnPhone
        icon={<UserSearch className="size-6" />}
      >
        <form role="search" aria-label="Buscar paciente" noValidate onSubmit={submit} className="flex flex-col gap-space-sm">
          <Field
            label="Buscar paciente"
            icon={<Search className="size-5" />}
            autoComplete="off"
            spellCheck={false}
            maxLength={200}
            placeholder="Ej. maria lopez, 11241985, (214) 555-0101 o P-000123"
            hint="Fecha como MMDDAAAA"
            value={text}
            error={error}
            autoFocus
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-space-sm">
            <Checkbox label="Incluir inactivos" checked={includeInactive} onCheckedChange={setIncludeInactive} />
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
        {loadError ? <Banner tone="error" title={loadError} /> : null}
        <div className="flex min-h-48 flex-col gap-space-sm">
          {submitted === null ? (
            <EmptyState
              icon={UserSearch}
              title="Elegir paciente"
              description="Busque por nombre, fecha de nacimiento, teléfono o código y elija un resultado."
              {...(createButton ? { action: createButton } : {})}
            />
          ) : results.isPending ? (
            <div className="flex justify-center py-space-lg">
              <Spinner />
            </div>
          ) : results.isError && rows.length === 0 ? (
            <ErrorState error={results.error} onRetry={() => void results.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title="No se encontraron pacientes"
              description="Ningún paciente coincide con estos criterios."
              {...(createButton ? { action: createButton } : {})}
            />
          ) : (
            <>
              <ul aria-label="Resultados" className="flex flex-col divide-y divide-surface-container-high">
                {rows.map((p) => (
                  <li key={p.id}>
                    <PatientRow
                      patient={p}
                      onPick={() => {
                        onPick({ id: p.id, code: p.code, firstName: p.firstName, lastName: p.lastName });
                      }}
                    />
                  </li>
                ))}
              </ul>
              {results.isFetchNextPageError ? <Banner tone="error" title={patientMessage(results.error)} /> : null}
              {results.hasNextPage || results.isFetchNextPageError ? (
                <Button variant="tonal" className="self-center" loading={results.isFetchingNextPage} onClick={() => void results.fetchNextPage()}>
                  <ChevronDown aria-hidden className="size-5" /> {results.isFetchNextPageError ? 'Reintentar' : 'Cargar más'}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </Dialog>
      {creating ? (
        <NewPatientDialog
          today={today}
          onClose={() => { setCreating(false); }}
          onCreated={(created) => void pickById(created.id)}
          onOpenExisting={(id) => void pickById(id)}
        />
      ) : null}
    </>
  );
}

/** Una fila: inicial, nombre, «fecha de nacimiento · teléfono» y el código. Los inactivos, deshabilitados. */
function PatientRow({ patient: p, onPick }: { patient: PatientSummary; onPick: () => void }) {
  const inactive = p.status !== 'active';
  return (
    <button
      type="button"
      disabled={inactive}
      onClick={onPick}
      className={cn(
        'flex min-h-16 w-full items-center gap-space-sm px-space-xs py-space-sm text-left',
        inactive ? 'cursor-not-allowed text-on-surface-variant' : 'hover:bg-surface-container-low dark:hover:bg-surface-container',
      )}
    >
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-caption font-semibold text-secondary">
        {patientInitials(p.firstName, p.lastName)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body-lg-medium">
          {p.firstName} {p.lastName}
        </span>
        <span className="truncate text-caption text-on-surface-variant">
          {formatDay(p.birthDate)}
          {p.phone ? ` · ${formatPhone(p.phone)}` : ''}
        </span>
      </span>
      {inactive ? <SemanticChip tone="neutral" label="Inactivo" /> : null}
      <CodeText code={p.code} />
    </button>
  );
}
