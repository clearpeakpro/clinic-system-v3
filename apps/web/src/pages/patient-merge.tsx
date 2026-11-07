import {
  ageLabel,
  ageOn,
  formatPhone,
  isMergeConfirmation,
  MERGE_BLOCKER_MESSAGES,
  MERGE_CONFIRM_WORD,
  parsePatientQuery,
  type MergeBlocker,
  type MergeCandidate,
  type PatientSummary,
} from '@clinic/shared';
import { AsyncView, Banner, Button, cn, CodeText, ConfirmDialog, DateTimeText, Field, SemanticChip, Spinner, TextAreaField, useSnackbar } from '@clinic/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowLeftRight, Merge, Search, TriangleAlert } from 'lucide-react';
import { useRef, useState, type SubmitEvent } from 'react';
import { api, ApiError } from '../lib/api.ts';
import { newIdempotencyKey } from '../lib/appointments.ts';
import { formatDay } from '../lib/catalog.ts';
import { patientMessage, queryErrorText } from '../lib/patients.ts';
import { queryClient, useActiveLocation } from '../lib/session.ts';

// S-PAC-13 Fusionar pacientes y S-PAC-14 «¿Fusionar estos pacientes?» (T-030;
// ADR 0032 y sus precisiones del 2026-11-07). No hay diseño de Stitch: se usan
// los componentes de packages/ui con el estilo del perfil (S-PAC-05).
//  - Buscar al otro paciente en un solo campo (ADR 0030); los resultados
//    excluyen al paciente abierto (los fusionados ya no salen en la búsqueda).
//  - Por defecto, el paciente abierto es el duplicado (se fusiona) y el
//    elegido el principal (se conserva); «Invertir dirección» los cambia.
//  - Tarjetas comparativas: «Principal (se conserva)» en el color primario y
//    «Duplicado (se fusiona)» en el de error, con citas, visitas, visitas
//    abiertas y membresía. Lo que impide fusionar se explica arriba y deja
//    «Fusionar» deshabilitado.
//  - Doble confirmación: motivo obligatorio, escribir «FUSIONAR» (en el manual,
//    «MERGE») y el diálogo destructivo con los dos nombres.
//  - Éxito: «Pacientes fusionados.» y el perfil del principal.

const MERGE_ERRORS: Record<string, string> = {
  ...MERGE_BLOCKER_MESSAGES,
  version_conflict: 'Otra persona cambió uno de los dos pacientes. Se volvieron a cargar sus datos; revíselos antes de fusionar.',
};

function mergeMessage(error: unknown): string {
  if (error instanceof ApiError && MERGE_ERRORS[error.code]) return MERGE_ERRORS[error.code] ?? '';
  return patientMessage(error);
}

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

export function PatientMergePage({ sede, patientId }: { sede: string; patientId: string }) {
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const timeZone = useActiveLocation()?.timezone ?? 'America/Chicago';
  const patient = useQuery({ queryKey: ['patient', patientId], queryFn: () => api.patient(patientId), staleTime: 0, gcTime: 0, retry: false });

  const [text, setText] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const search = useMutation({ mutationFn: (q: string) => api.searchPatients(q, 0) });
  const [otherId, setOtherId] = useState<string | null>(null);
  const [inverted, setInverted] = useState(false);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());

  const preview = useQuery({
    queryKey: ['merge-preview', patientId, otherId],
    queryFn: () => api.mergePreview(patientId, otherId ?? ''),
    enabled: otherId !== null,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const opened = preview.data?.patients.find((p) => p.id === patientId);
  const other = preview.data?.patients.find((p) => p.id === otherId);
  const principal = inverted ? opened : other;
  const duplicate = inverted ? other : opened;
  const blockers: MergeBlocker[] = preview.data?.blockers ?? [];

  const merge = useMutation({
    mutationFn: ({ p, d }: { p: MergeCandidate; d: MergeCandidate }) =>
      api.mergePatients(d.id, { principalId: p.id, principalVersion: p.version, duplicateVersion: d.version, reason: reason.trim(), confirm }, key.current),
  });

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parsePatientQuery(text);
    if (!parsed.ok) {
      setSearchError(queryErrorText(parsed.error));
      return;
    }
    setSearchError(null);
    search.mutate(text.trim());
  };
  const select = (p: PatientSummary) => {
    setOtherId(p.id);
    setInverted(false);
    setError(null);
    key.current = newIdempotencyKey();
  };
  const ready = principal !== undefined && duplicate !== undefined && blockers.length === 0 && reason.trim() !== '' && isMergeConfirmation(confirm);
  const results = (search.data?.patients ?? []).filter((p) => p.id !== patientId);

  const doMerge = async () => {
    if (!principal || !duplicate) return;
    try {
      await merge.mutateAsync({ p: principal, d: duplicate });
    } catch (e) {
      setConfirming(false);
      setError(mergeMessage(e));
      // Una nueva clave para el siguiente intento (otro contenido o versiones nuevas).
      key.current = newIdempotencyKey();
      if (e instanceof ApiError && e.status === 409) await preview.refetch();
      return;
    }
    setConfirming(false);
    await queryClient.invalidateQueries({ queryKey: ['patient'] });
    snackbar({ message: 'Pacientes fusionados.' });
    void navigate({ to: '/app/$sede/pacientes/$id', params: { sede, id: principal.id } });
  };

  return (
    <section aria-labelledby="page-title" className="mx-auto flex w-full max-w-7xl flex-col gap-space-lg">
      <Link
        to="/app/$sede/pacientes/$id"
        params={{ sede, id: patientId }}
        className="flex min-h-touch w-fit items-center gap-space-xs rounded-md px-space-xs text-body-lg text-on-surface hover:bg-surface-container-low"
      >
        <ArrowLeft aria-hidden className="size-5" /> Volver al perfil
      </Link>
      <header className="flex flex-col gap-space-xs">
        <h1 id="page-title" className="text-display-md text-on-surface">
          Fusionar pacientes
        </h1>
        <p className="max-w-3xl text-body-lg text-on-surface-variant">
          El registro duplicado se fusiona con el registro principal. Sus citas, visitas, saldos, recibos, membresía e historia pasan al paciente principal. Esta
          acción no se puede deshacer.
        </p>
      </header>

      <AsyncView source={patient} loading="skeleton">
        {(p) =>
          p.mergedInto ? (
            <Banner tone="error" title="Este registro ya fue fusionado con otro paciente." />
          ) : (
            <>
              <form
                role="search"
                aria-labelledby="merge-search-title"
                noValidate
                onSubmit={submit}
                className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-lg shadow-level-1 dark:bg-surface-container-low"
              >
                <h2 id="merge-search-title" className="text-headline-sm text-on-surface">
                  Buscar al otro paciente
                </h2>
                <div className="flex flex-col gap-space-sm tab:flex-row tab:items-start">
                  <div className="flex-1">
                    <Field
                      label="Buscar paciente"
                      icon={<Search className="size-5" />}
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={200}
                      placeholder="Ej. maria lopez, 11241985 o P-000123"
                      hint="Nombre, fecha de nacimiento (MMDDAAAA), teléfono o código"
                      value={text}
                      error={searchError}
                      onChange={(e) => {
                        setText(e.target.value);
                        setSearchError(null);
                      }}
                    />
                  </div>
                  <Button type="submit" variant="tonal" className="tab:mt-7" loading={search.isPending}>
                    <Search aria-hidden className="size-5" /> Buscar
                  </Button>
                </div>
                {search.isError ? <p className="text-body-md text-error">{patientMessage(search.error)}</p> : null}
                {search.isSuccess ? (
                  results.length === 0 ? (
                    <p className="text-body-md text-on-surface-variant">Ningún otro paciente coincide con la búsqueda.</p>
                  ) : (
                    <ul aria-label="Resultados" className="flex flex-col divide-y divide-outline-variant rounded-md border border-outline-variant">
                      {results.map((r) => (
                        <li
                          key={r.id}
                          className={cn('flex flex-wrap items-center justify-between gap-space-sm p-space-sm', r.id === otherId && 'bg-primary/10')}
                        >
                          <span className="flex min-w-0 flex-wrap items-center gap-space-sm">
                            <CodeText code={r.code} />
                            <span className="text-body-lg-medium text-on-surface">{fullName(r)}</span>
                            <span className="text-body-md text-on-surface-variant">
                              {formatDay(r.birthDate)} ({ageLabel(ageOn(r.birthDate, search.data.today))})
                            </span>
                            {r.status !== 'active' ? <SemanticChip tone="neutral" label="Inactivo" /> : null}
                          </span>
                          <Button variant={r.id === otherId ? 'primary' : 'outline'} aria-pressed={r.id === otherId} onClick={() => { select(r); }}>
                            {r.id === otherId ? 'Seleccionado' : 'Seleccionar'}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}
              </form>

              {otherId === null ? (
                <p className="text-body-lg text-on-surface-variant">Aún no se ha seleccionado un paciente.</p>
              ) : preview.isPending ? (
                <div className="flex justify-center py-space-lg">
                  <Spinner />
                </div>
              ) : preview.isError ? (
                <Banner tone="error" title={mergeMessage(preview.error)} />
              ) : principal && duplicate ? (
                <>
                  <div className="grid gap-space-md tab:grid-cols-2">
                    <CandidateCard kind="principal" candidate={principal} timeZone={timeZone} today={p.today} />
                    <CandidateCard kind="duplicate" candidate={duplicate} timeZone={timeZone} today={p.today} />
                  </div>
                  <Button
                    variant="text"
                    className="w-fit"
                    onClick={() => {
                      setInverted((v) => !v);
                      key.current = newIdempotencyKey();
                    }}
                  >
                    <ArrowLeftRight aria-hidden className="size-5" /> Invertir dirección
                  </Button>
                  {blockers.map((b) => (
                    <Banner key={b} tone="error" title={MERGE_BLOCKER_MESSAGES[b]} />
                  ))}
                  <div className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-lg shadow-level-1 dark:bg-surface-container-low">
                    <TextAreaField label="Motivo" required maxLength={500} hint="Obligatorio. Queda en la auditoría." value={reason} onChange={(e) => { setReason(e.target.value); }} />
                    <Field
                      label={`Escriba ${MERGE_CONFIRM_WORD} para confirmar`}
                      autoComplete="off"
                      spellCheck={false}
                      value={confirm}
                      disabled={merge.isPending}
                      onChange={(e) => { setConfirm(e.target.value); }}
                    />
                    {error ? <Banner tone="error" title={error} /> : null}
                    <div className="flex justify-end">
                      <Button variant="destructive" disabled={!ready} onClick={() => { setConfirming(true); }}>
                        <Merge aria-hidden className="size-5" /> Fusionar
                      </Button>
                    </div>
                  </div>
                  <ConfirmDialog
                    open={confirming}
                    onOpenChange={setConfirming}
                    destructive
                    icon={<TriangleAlert className="size-7" />}
                    title="¿Fusionar estos pacientes?"
                    description={`${fullName(duplicate)} (${duplicate.code}) se fusionará con ${fullName(principal)} (${principal.code}). Esta acción no se puede deshacer.`}
                    confirmLabel="Fusionar"
                    onConfirm={doMerge}
                  />
                </>
              ) : null}
            </>
          )
        }
      </AsyncView>
    </section>
  );
}

const MEMBERSHIP_ROLE: Record<string, string> = { holder: 'Titular', affiliate: 'Afiliado' };

function CandidateCard({ kind, candidate: c, timeZone, today }: { kind: 'principal' | 'duplicate'; candidate: MergeCandidate; timeZone: string; today: string }) {
  const principal = kind === 'principal';
  return (
    <section
      aria-label={principal ? 'Principal (se conserva)' : 'Duplicado (se fusiona)'}
      className="flex flex-col overflow-hidden rounded-lg bg-surface-container-lowest shadow-level-1 dark:bg-surface-container-low"
    >
      <h2 className={cn('px-space-lg py-space-sm text-headline-sm', principal ? 'bg-primary text-on-primary' : 'bg-error text-on-error')}>
        {principal ? 'Principal (se conserva)' : 'Duplicado (se fusiona)'}
      </h2>
      <div className="flex flex-col gap-space-sm p-space-lg">
        <p className="flex flex-wrap items-center gap-space-sm">
          <span className="text-headline-sm text-on-surface">{fullName(c)}</span>
          <CodeText code={c.code} />
          <SemanticChip tone={c.status === 'active' ? 'success' : 'neutral'} label={c.status === 'active' ? 'Activo' : 'Inactivo'} />
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-space-md gap-y-space-xs text-body-md">
          <dt className="text-on-surface-variant">Fecha de nacimiento</dt>
          <dd className="text-on-surface">
            {formatDay(c.birthDate)} ({ageLabel(ageOn(c.birthDate, today))})
          </dd>
          <dt className="text-on-surface-variant">Teléfono</dt>
          <dd className="text-on-surface">{c.phone ? formatPhone(c.phone) : 'No indicado'}</dd>
          <dt className="text-on-surface-variant">Creado</dt>
          <dd className="text-on-surface">
            <DateTimeText value={c.createdAt} timeZone={timeZone} format="date" />
          </dd>
          <dt className="text-on-surface-variant">Citas</dt>
          <dd className="text-on-surface">{c.appointments}</dd>
          <dt className="text-on-surface-variant">Visitas</dt>
          <dd className="text-on-surface">
            {c.encounters}
            {c.openVisitLocations.length > 0 ? ` (abierta en ${c.openVisitLocations.join(', ')})` : ''}
          </dd>
          <dt className="text-on-surface-variant">Membresía</dt>
          <dd className="text-on-surface">{c.membership ? `${c.membership.code} · ${MEMBERSHIP_ROLE[c.membership.role] ?? ''}` : 'Ninguna en curso'}</dd>
        </dl>
      </div>
    </section>
  );
}
