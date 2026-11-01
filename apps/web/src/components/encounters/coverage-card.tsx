import { ARRIVAL_COVERAGE_TYPES, COVERAGE_TYPE_LABELS, INSURANCE_TERM_LABELS, INSURANCE_TERMS, type EncounterCoverage, type InsuranceTerm } from '@clinic/shared';
import { Banner, Button, Dialog, DiscardChangesDialog, Field, SegmentedControl } from '@clinic/ui';
import { CreditCard, Pencil, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { capitalizeWords } from '../../lib/arrival.ts';
import {
  coverageDirty,
  coverageDraft,
  coverageDraftInput,
  coverageIssues,
  coverageRows,
  withCoverageTerm,
  type CoverageDraft,
  type CoverageDraftType,
} from '../../lib/encounters.ts';
import { useUnsavedChanges } from '../../lib/unsaved.ts';
import { SectionCard } from './section-card.tsx';

// S-CLI-11 Tarjeta «Cobertura» y S-CLI-12 diálogo «Cobertura».
//  - Los cuatro roles la ven; editan Recepción (visits.manage) con la visita abierta.
//  - En la parte 3A: «Pago directo» o «Seguro» con un solo término, como la
//    llegada (ADR 0034). Los importes se envían como texto y los convierte a
//    centavos el servidor; aquí solo se les da formato.
//  - Con cambios: cambiar de sede pide confirmación (S-CLI-26) y «Cancelar»
//    también (el manual descartaba sin aviso al tocar fuera).
//  - Conflicto de versión: el diálogo se cierra y la pantalla lo explica.

export function CoverageCard({ coverage, canEdit, onEdit }: { coverage: EncounterCoverage | null; canEdit: boolean; onEdit: () => void }) {
  const rows = coverage ? coverageRows(coverage) : [];
  return (
    <SectionCard
      id="coverage"
      icon={<ShieldCheck className="size-6" />}
      title="Cobertura"
      badge={
        <span className="rounded-full bg-status-in-care-container px-space-sm py-0.5 text-caption text-status-in-care">
          {coverage ? COVERAGE_TYPE_LABELS[coverage.type] : 'Sin definir'}
        </span>
      }
      action={
        canEdit ? (
          <Button variant="text" onClick={onEdit} aria-label="Editar cobertura">
            <Pencil aria-hidden className="size-5" /> Editar
          </Button>
        ) : null
      }
    >
      {!coverage ? (
        <p className="text-body-md text-on-surface-variant">No se registró cobertura.</p>
      ) : rows.length === 0 ? (
        <p className="flex items-center gap-space-xs text-body-lg-medium text-on-surface">
          <CreditCard aria-hidden className="size-5 text-primary" /> {COVERAGE_TYPE_LABELS[coverage.type]}
        </p>
      ) : (
        <dl className="grid gap-space-sm tab:grid-cols-2">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-col gap-0.5">
              <dt className="text-caption text-on-surface-variant">{r.label}</dt>
              <dd className="text-body-md break-words text-on-surface">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </SectionCard>
  );
}

export function CoverageDialog({
  coverage,
  onClose,
  onSave,
}: {
  coverage: EncounterCoverage | null;
  onClose: () => void;
  /** Devuelve el mensaje de error del servidor, o null si guardó (o si el conflicto ya lo resolvió la página). */
  onSave: (input: ReturnType<typeof coverageDraftInput>, expectedVersion: number) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState<CoverageDraft>(() => coverageDraft(coverage));
  const [showIssues, setShowIssues] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const dirty = coverageDirty(draft, coverage);
  useUnsavedChanges(dirty);
  const issues = showIssues ? coverageIssues(draft) : {};

  const change = (next: Partial<CoverageDraft> | ((d: CoverageDraft) => CoverageDraft)) => {
    setDraft((d) => (typeof next === 'function' ? next(d) : { ...d, ...next }));
    setServerError(null);
  };
  const requestClose = () => {
    if (dirty) setDiscard(true);
    else onClose();
  };
  const save = async () => {
    setShowIssues(true);
    const found = coverageIssues(draft);
    if (found.insurerName || found.value) return;
    if (!coverage) return;
    setBusy(true);
    const error = await onSave(coverageDraftInput(draft), coverage.version);
    setBusy(false);
    if (error) setServerError(error);
  };

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => { if (!open) requestClose(); }}
        dismissible={false}
        fullScreenOnPhone
        icon={<ShieldCheck className="size-7" />}
        title="Cobertura"
        footer={
          <>
            <Button variant="tonal" className="text-on-surface" disabled={busy} onClick={requestClose}>
              Cancelar
            </Button>
            <Button loading={busy} onClick={() => void save()}>
              Guardar
            </Button>
          </>
        }
      >
        {serverError ? <Banner tone="error" title={serverError} /> : null}
        <SegmentedControl<CoverageDraftType>
          label="Tipo de cobertura"
          options={ARRIVAL_COVERAGE_TYPES.map((t) => ({ value: t, label: COVERAGE_TYPE_LABELS[t] }))}
          value={draft.type}
          onChange={(type) => { change({ type }); }}
          className="self-start"
        />
        {draft.type === 'insurance' ? (
          <>
            <div className="grid gap-space-md tab:grid-cols-2">
              <Field
                label="Aseguradora"
                required
                autoComplete="off"
                value={draft.insurerName}
                error={issues.insurerName ?? null}
                disabled={busy}
                onChange={(e) => { change({ insurerName: capitalizeWords(e.target.value) }); }}
              />
              <Field label="ID de miembro" autoComplete="off" value={draft.memberId} disabled={busy} onChange={(e) => { change({ memberId: e.target.value }); }} />
            </div>
            <p className="text-body-md text-on-surface-variant">Registre uno: copago, coaseguro % o deducible.</p>
            <SegmentedControl<InsuranceTerm>
              label="Término"
              options={INSURANCE_TERMS.map((t) => ({ value: t, label: INSURANCE_TERM_LABELS[t] }))}
              value={draft.term}
              onChange={(term) => { change((d) => withCoverageTerm(d, term)); }}
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
                  error={issues.value ?? null}
                  disabled={busy}
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
                  error={issues.value ?? null}
                  disabled={busy}
                  onChange={(e) => { change({ value: e.target.value }); }}
                />
              )}
            </div>
          </>
        ) : null}
      </Dialog>
      <DiscardChangesDialog open={discard} onOpenChange={setDiscard} onDiscard={onClose} />
    </>
  );
}
