import {
  ARRIVAL_COVERAGE_TYPES,
  COVERAGE_TYPE_LABELS,
  formatPhone,
  INSURANCE_TERM_LABELS,
  INSURANCE_TERMS,
  suggestedRoute,
  VISIT_ROUTE_HELP,
  VISIT_ROUTE_LABELS,
  VISIT_ROUTES,
  type ArrivalContext,
  type ArrivalResult,
  type InsuranceTerm,
} from '@clinic/shared';
import { Button, Checkbox, cn, CodeText, Field, formatDateTime, RouteBadge, SegmentedControl, SelectField, VISIT_ROUTE_ICONS } from '@clinic/ui';
import { Link } from '@tanstack/react-router';
import { Building2, Check, CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { api } from '../../lib/api.ts';
import { newIdempotencyKey } from '../../lib/appointments.ts';
import {
  arrivalFailure,
  arrivalInput,
  arrivalSteps,
  capitalizeWords,
  emptyDraft,
  STEP_TITLES,
  stepIssues,
  withTerm,
  type ArrivalDraft,
  type ArrivalFailure,
  type ArrivalStep,
  type DraftCoverage,
} from '../../lib/arrival.ts';
import { formatDay } from '../../lib/catalog.ts';
import { useUnsavedChanges } from '../../lib/unsaved.ts';

// S-REC-20 Asistente de llegada (marco común) con sus pasos S-REC-21 a 26
// (Stitch: design/stitch/recepcion/S-REC-20_asistente_de_llegada). De Stitch:
// los pasos en chips con su check, el título del paso y la botonera a la
// derecha. No se construye lo que no está en el manual («Modo Asistido
// Activo», la barra de variantes, «Cancelar y volver al Panel»).
//  - Validación por paso al «Continuar» (banner ámbar) y completa al confirmar.
//  - Errores del servidor en un banner rojo, con el enlace que da contexto
//    («Abrir la visita existente», «Abrir perfil del paciente», «Abrir registro principal»).
//  - Desde el paso 2 hay cambios sin guardar: el selector de sede pide confirmación (S-REC-17).
//  - El borrador vive solo en memoria. Una Idempotency-Key por contenido
//    enviado: reintentar lo mismo no crea otra visita.

export type ArrivalMode = { kind: 'appointment'; appointmentId: string; version: number } | { kind: 'walk_in'; patientId: string };

export function ArrivalWizard({
  sede,
  context,
  mode,
  onSending,
  onDone,
}: {
  sede: string;
  context: ArrivalContext;
  mode: ArrivalMode;
  /** Envío en curso: la página no cambia a «No es posible…» por el eco en vivo de su propio registro. */
  onSending?: (sending: boolean) => void;
  onDone: (result: ArrivalResult) => void;
}) {
  const [draft, setDraft] = useState<ArrivalDraft>(() => emptyDraft(suggestedRoute(context.appointment?.appointmentType)));
  const [step, setStep] = useState<ArrivalStep>('patient');
  const [done, setDone] = useState<ArrivalStep[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [failure, setFailure] = useState<ArrivalFailure | null>(null);
  const [sending, setSending] = useState(false);
  const lastSent = useRef<{ body: string; key: string } | null>(null);

  const steps = arrivalSteps(draft);
  const index = steps.indexOf(step);
  useUnsavedChanges(index >= 1);

  /** Cualquier cambio en un campo borra las incidencias y el error (S-REC-20). */
  const change = (next: Partial<ArrivalDraft> | ((d: ArrivalDraft) => ArrivalDraft)) => {
    setDraft((d) => (typeof next === 'function' ? next(d) : { ...d, ...next }));
    setIssues([]);
    setFailure(null);
  };
  const goTo = (target: ArrivalStep) => {
    setStep(target);
    setIssues([]);
    setFailure(null);
  };
  const next = () => {
    const found = stepIssues(step, draft, context.site.active);
    if (found.length > 0) {
      setIssues(found);
      return;
    }
    setDone((d) => (d.includes(step) ? d : [...d, step]));
    const following = steps[index + 1];
    if (following) goTo(following);
  };
  const submit = async () => {
    const found = stepIssues('confirm', draft, context.site.active);
    if (found.length > 0) {
      setIssues(found);
      return;
    }
    const input = arrivalInput(draft, mode.kind === 'appointment' ? mode : { kind: 'walk_in', patientId: mode.patientId });
    const body = JSON.stringify(input);
    if (lastSent.current?.body !== body) lastSent.current = { body, key: newIdempotencyKey() };
    setSending(true);
    onSending?.(true);
    setFailure(null);
    try {
      const result = await api.arrive(input, lastSent.current.key);
      onDone(result);
    } catch (error) {
      setFailure(arrivalFailure(error));
      setSending(false);
      onSending?.(false);
    }
  };

  const patient = context.patient;
  return (
    <div className="flex flex-col gap-space-lg rounded-lg bg-surface-container-lowest p-space-md shadow-level-1 tab:p-space-lg dark:bg-surface-container-low">
      <ol aria-label="Pasos" className="grid grid-cols-2 gap-space-sm tab:flex tab:flex-wrap">
        {steps.map((s, i) => {
          const isDone = done.includes(s) && s !== step;
          const current = s === step;
          return (
            <li key={s} className="tab:flex-1">
              <button
                type="button"
                disabled={!isDone || sending}
                aria-current={current ? 'step' : undefined}
                onClick={() => { goTo(s); }}
                className={cn(
                  'flex min-h-touch w-full items-center justify-center gap-space-xs rounded-md px-space-sm text-body-md-medium',
                  current ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface dark:bg-surface-container',
                  isDone && 'hover:bg-surface-container',
                  !isDone && !current && 'text-on-surface-variant',
                )}
              >
                {isDone ? (
                  <span aria-hidden className="flex size-6 items-center justify-center rounded-full bg-primary text-on-primary">
                    <Check className="size-4" />
                  </span>
                ) : (
                  <span aria-hidden className={cn('flex size-6 items-center justify-center rounded-full text-caption', current ? 'bg-on-primary text-primary' : 'bg-surface-container-highest')}>
                    {i + 1}
                  </span>
                )}
                {STEP_TITLES[s]}
                {isDone ? <span className="sr-only"> (completado)</span> : null}
              </button>
            </li>
          );
        })}
      </ol>

      <h2 className="text-headline-sm text-on-surface">{`Paso ${String(index + 1)} de ${String(steps.length)}: ${STEP_TITLES[step]}`}</h2>

      {issues.length > 0 ? (
        <div role="alert" className="flex gap-3 rounded-md border border-status-waiting-border bg-status-waiting-container p-3.5 text-status-waiting">
          <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
          <ul className="flex flex-col gap-0.5 text-body-md">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {failure ? <FailureBanner sede={sede} failure={failure} /> : null}

      <div className="flex flex-col gap-space-md">
        {step === 'patient' ? (
          <>
            <div className="flex flex-col gap-space-sm rounded-md bg-surface-container-low p-space-md dark:bg-surface-container">
              <p className="text-headline-md text-on-surface">{`${patient.firstName} ${patient.lastName}`}</p>
              <dl className="grid gap-space-sm tab:grid-cols-3">
                <Pair label="Fecha de nacimiento">{formatDay(patient.birthDate)}</Pair>
                <Pair label="Código del paciente">
                  <CodeText code={patient.code} />
                </Pair>
                {patient.phone ? <Pair label="Teléfono">{formatPhone(patient.phone)}</Pair> : null}
              </dl>
            </div>
            <div>
              <Checkbox label="Verifiqué la identidad del paciente" checked={draft.identityVerified} onCheckedChange={(v) => { change({ identityVerified: v }); }} />
              <p className="pl-[34px] text-caption text-on-surface-variant">Confirme el nombre y la fecha de nacimiento con el paciente.</p>
            </div>
          </>
        ) : null}

        {step === 'site' ? (
          <>
            <div className="flex items-center gap-space-md rounded-md bg-surface-container-low p-space-md dark:bg-surface-container">
              <Building2 aria-hidden className="size-8 shrink-0 text-primary" />
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="text-headline-sm text-on-surface">{context.site.name}</p>
                <p className="font-mono text-code-sm text-on-surface-variant">{`${context.site.code} · ${context.site.timezone}`}</p>
              </div>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-space-sm py-0.5 text-caption',
                  context.site.active ? 'bg-status-completed-container text-status-completed' : 'bg-error-container text-on-error-container',
                )}
              >
                {context.site.active ? <Check aria-hidden className="size-3.5" /> : <CircleAlert aria-hidden className="size-3.5" />}
                {context.site.active ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            {!context.site.active ? <p className="text-body-md text-error">Esta sede está inactiva. No es posible registrar llegadas aquí.</p> : null}
            <p className="text-body-md text-on-surface-variant">Para registrar la llegada en otra sede, cambie primero la sede en el encabezado.</p>
            {context.site.active ? (
              <Checkbox label="Confirmar esta sede" checked={draft.siteConfirmed} onCheckedChange={(v) => { change({ siteConfirmed: v }); }} />
            ) : null}
          </>
        ) : null}

        {step === 'route' ? (
          <>
            {mode.kind === 'walk_in' ? (
              <SelectField
                label="Tipo de cita"
                value={draft.appointmentTypeId ?? ''}
                onChange={(e) => {
                  const id = e.target.value || null;
                  const type = context.appointmentTypes.find((t) => t.id === id);
                  // Elegir un tipo ajusta la ruta a su sugerencia (S-REC-23).
                  change({ appointmentTypeId: id, ...(type ? { route: suggestedRoute(type) } : {}) });
                }}
              >
                <option value="">Sin tipo de cita</option>
                {context.appointmentTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </SelectField>
            ) : context.appointment?.appointmentType ? (
              <p className="flex items-center gap-space-xs text-body-md text-on-surface-variant">
                <Info aria-hidden className="size-5 text-secondary" />
                {`Sugerida por el tipo de cita (${context.appointment.appointmentType.name}). Puede cambiarla.`}
              </p>
            ) : null}
            <div role="radiogroup" aria-label="Ruta de atención" className="grid gap-space-sm tab:grid-cols-2">
              {VISIT_ROUTES.map((r) => {
                const Icon = VISIT_ROUTE_ICONS[r];
                const selected = draft.route === r;
                return (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => { change({ route: r }); }}
                    className={cn(
                      'flex min-h-touch items-start gap-space-sm rounded-md border p-space-md text-left',
                      selected ? 'border-primary bg-surface-container ring-1 ring-primary' : 'border-outline-variant hover:bg-surface-container-low',
                    )}
                  >
                    <Icon aria-hidden className={cn('mt-0.5 size-5 shrink-0', selected ? 'text-primary' : 'text-on-surface-variant')} />
                    <span className="flex flex-col">
                      <span className="text-body-md-medium text-on-surface">{VISIT_ROUTE_LABELS[r]}</span>
                      <span className="text-caption text-on-surface-variant">{VISIT_ROUTE_HELP[r]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        {step === 'coverage' ? (
          <SegmentedControl<DraftCoverage>
            label="Cobertura"
            options={ARRIVAL_COVERAGE_TYPES.map((t) => ({ value: t, label: COVERAGE_TYPE_LABELS[t] }))}
            value={draft.coverage}
            onChange={(v) => { change({ coverage: v }); }}
            className="self-start"
          />
        ) : null}

        {step === 'payer' ? (
          <>
            <div className="grid gap-space-md tab:grid-cols-2">
              <Field
                label="Nombre del seguro"
                required
                value={draft.insurerName}
                autoComplete="off"
                onChange={(e) => { change({ insurerName: capitalizeWords(e.target.value) }); }}
              />
              <Field label="ID de miembro" value={draft.memberId} autoComplete="off" onChange={(e) => { change({ memberId: e.target.value }); }} />
            </div>
            <p className="text-body-md text-on-surface-variant">Registre uno: copago, coaseguro % o deducible.</p>
            <SegmentedControl<InsuranceTerm>
              label="Término"
              options={INSURANCE_TERMS.map((t) => ({ value: t, label: INSURANCE_TERM_LABELS[t] }))}
              value={draft.term}
              onChange={(t) => { change((d) => withTerm(d, t)); }}
              className="self-start"
            />
            <div className="tab:max-w-xs">
              {draft.term === 'coinsurance' ? (
                <Field
                  key="percent"
                  label={INSURANCE_TERM_LABELS.coinsurance}
                  required
                  inputMode="decimal"
                  autoComplete="off"
                  hint="Porcentaje entre 0 y 100"
                  trailing={<span className="text-on-surface-variant">%</span>}
                  value={draft.value}
                  onChange={(e) => { change({ value: e.target.value }); }}
                />
              ) : (
                <Field
                  key="money"
                  label={INSURANCE_TERM_LABELS[draft.term]}
                  required
                  inputMode="decimal"
                  autoComplete="off"
                  hint="Monto en dólares, p. ej. 25.00"
                  icon={<span className="text-on-surface-variant">$</span>}
                  trailing={<span className="text-on-surface-variant">USD</span>}
                  value={draft.value}
                  onChange={(e) => { change({ value: e.target.value }); }}
                />
              )}
            </div>
          </>
        ) : null}

        {step === 'confirm' ? <Summary context={context} draft={draft} /> : null}
      </div>

      <div className="flex flex-col-reverse gap-space-sm border-t border-outline-variant pt-space-md tab:flex-row tab:justify-end">
        {index > 0 ? (
          <Button
            variant="outline"
            disabled={sending}
            onClick={() => {
              const previous = steps[index - 1];
              if (previous) goTo(previous);
            }}
          >
            Atrás
          </Button>
        ) : null}
        {step === 'confirm' ? (
          <Button loading={sending} onClick={() => void submit()}>
            {mode.kind === 'appointment' ? 'Registrar llegada' : 'Iniciar visita sin cita'}
          </Button>
        ) : (
          <Button onClick={next}>Continuar</Button>
        )}
      </div>
    </div>
  );
}

function Pair({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption text-on-surface-variant">{label}</dt>
      <dd className="text-body-md text-on-surface">{children}</dd>
    </div>
  );
}

/** S-REC-26 «Revisar y confirmar»: todo antes de la acción irreversible. */
function Summary({ context, draft }: { context: ArrivalContext; draft: ArrivalDraft }) {
  const type = context.appointment ? context.appointment.appointmentType : context.appointmentTypes.find((t) => t.id === draft.appointmentTypeId);
  return (
    <section aria-labelledby="summary-title" className="flex flex-col gap-space-md rounded-md bg-surface-container-low p-space-md dark:bg-surface-container">
      <h3 id="summary-title" className="text-body-lg-medium text-on-surface">
        Revisar y confirmar
      </h3>
      <dl className="grid gap-space-md tab:grid-cols-2">
        <Pair label="Paciente">{`${context.patient.firstName} ${context.patient.lastName}`}</Pair>
        <Pair label="Sede">{`${context.site.name} (${context.site.code})`}</Pair>
        {context.appointment ? (
          <Pair label="Cita">
            <CodeText code={context.appointment.code} /> {`· ${formatDateTime(context.appointment.startsAt, context.site.timezone)}`}
          </Pair>
        ) : (
          <Pair label="Visita">Sin cita</Pair>
        )}
        {type ? <Pair label="Tipo de cita">{type.name}</Pair> : null}
        <Pair label="Ruta">
          <RouteBadge route={draft.route} />
        </Pair>
        <Pair label="Cobertura">{COVERAGE_TYPE_LABELS[draft.coverage]}</Pair>
        {draft.coverage === 'insurance' ? (
          <>
            <Pair label="Nombre del seguro">{draft.insurerName.trim()}</Pair>
            {draft.memberId.trim() ? <Pair label="ID de miembro">{draft.memberId.trim()}</Pair> : null}
            <Pair label={INSURANCE_TERM_LABELS[draft.term]}>{draft.term === 'coinsurance' ? `${draft.value.trim()} %` : `$ ${draft.value.trim()}`}</Pair>
          </>
        ) : null}
      </dl>
    </section>
  );
}

function FailureBanner({ sede, failure }: { sede: string; failure: ArrivalFailure }) {
  const link = failure.link;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md bg-error-container p-3.5 text-on-error-container">
      <CircleAlert aria-hidden className="size-5 shrink-0 text-error" />
      <p className="flex-1 text-body-md">{failure.message}</p>
      {link?.kind === 'encounter' ? (
        <Link to="/app/$sede/visitas/$id" params={{ sede, id: link.id }} className="text-body-md-medium underline">
          Abrir la visita existente
        </Link>
      ) : null}
      {link?.kind === 'patient' ? (
        <Link to="/app/$sede/pacientes/$id" params={{ sede, id: link.id }} className="text-body-md-medium underline">
          {link.label}
        </Link>
      ) : null}
    </div>
  );
}
