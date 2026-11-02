import {
  ASSESSMENT_LABELS,
  ASSESSMENT_MAX,
  HISTORY_FIELDS,
  VISIT_ASSESSMENT_FIELDS,
  type AssessmentField,
  type PatientHistoryView,
  type SaveAssessmentInput,
  type VisitAssessmentView,
} from '@clinic/shared';
import { Banner, Button, Checkbox, cn } from '@clinic/ui';
import { ChevronDown, Save } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { assessmentDirty, assessmentDraft, assessmentErrors, assessmentInput, type AssessmentDraft } from '../../lib/nursing.ts';

// S-CLI-15 Formulario «Valoración» (Stitch: design/stitch/clinicas/S-CLI-15_valoracion_de_enfermeria).
//  - Ocho apartados desplegables en el orden del manual, con contador «{n}/4000».
//    Abiertos al inicio: «Síntomas / motivo de consulta» y los que tienen texto.
//  - Los seis primeros son de la historia del paciente (ADR 0036): se guardan
//    en su expediente y se verán en cada visita. Los dos últimos, de esta visita.
//  - Alergias (ADR 0040): «Sin alergias conocidas» es un estado explícito; si
//    se escribe una alergia, el estado es «registradas».
//  - Un solo «Guardar valoración» para todo, con las dos versiones leídas.

const ALL_FIELDS: readonly AssessmentField[] = [...HISTORY_FIELDS, ...VISIT_ASSESSMENT_FIELDS];

export interface AssessmentFormProps {
  history: PatientHistoryView | null;
  assessment: VisitAssessmentView | null;
  resetToken: number;
  onCancel?: () => void;
  onSave: (input: SaveAssessmentInput) => Promise<string | null>;
  onDirtyChange: (dirty: boolean) => void;
}

export function AssessmentForm({ history, assessment, resetToken, onCancel, onSave, onDirtyChange }: AssessmentFormProps) {
  const [base, setBase] = useState({ history, assessment, token: resetToken });
  const [draft, setDraft] = useState<AssessmentDraft>(() => assessmentDraft(history, assessment));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = assessmentDirty(draft, base.history, base.assessment);
  const errors = assessmentErrors(draft);

  const changedOnServer = (history?.version ?? 0) !== (base.history?.version ?? 0) || (assessment?.version ?? 0) !== (base.assessment?.version ?? 0);
  // Como en los signos vitales: se pone al día sin cambios pendientes o si lo tecleado ya es lo guardado.
  if ((changedOnServer && (!dirty || !assessmentDirty(draft, history, assessment))) || resetToken !== base.token) {
    setBase({ history, assessment, token: resetToken });
    setDraft(assessmentDraft(history, assessment));
  }

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => { onDirtyChange(false); }, [onDirtyChange]);

  const submit = async () => {
    if (!dirty || Object.keys(errors).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      const problem = await onSave(assessmentInput(draft, base.history, base.assessment));
      if (problem) setError(problem);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      aria-label="Valoración"
      className="flex flex-col gap-space-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {error ? <Banner tone="error" title={error} /> : null}
      {ALL_FIELDS.map((field) => (
        <AssessmentSection key={field} field={field} initiallyOpen={field === 'symptoms' || draft.text[field] !== '' || (field === 'allergies' && draft.noneKnown)}>
          {field === 'allergies' ? (
            <Checkbox
              label="Sin alergias conocidas"
              checked={draft.noneKnown && draft.text.allergies.trim() === ''}
              onCheckedChange={(on) => { setDraft((d) => ({ noneKnown: on, text: on ? { ...d.text, allergies: '' } : d.text })); }}
            />
          ) : null}
          <TextArea
            field={field}
            value={draft.text[field]}
            error={errors[field] ?? null}
            disabled={busy || (field === 'allergies' && draft.noneKnown && draft.text.allergies === '')}
            onChange={(value) => { setDraft((d) => ({ ...d, noneKnown: field === 'allergies' && value.trim() !== '' ? false : d.noneKnown, text: { ...d.text, [field]: value } })); }}
          />
        </AssessmentSection>
      ))}
      <div className="flex flex-wrap justify-end gap-space-sm pt-space-sm">
        {onCancel ? (
          <Button type="button" variant="tonal" disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" disabled={!dirty || Object.keys(errors).length > 0} loading={busy} loadingText="Guardando…">
          <Save aria-hidden className="size-5" /> Guardar valoración
        </Button>
      </div>
    </form>
  );
}

/** Un apartado desplegable con su nombre y, si es del paciente, la indicación de que va al expediente. */
export function AssessmentSection({ field, initiallyOpen, status, children }: { field: AssessmentField; initiallyOpen: boolean; status?: string; children: React.ReactNode }) {
  const patient = (HISTORY_FIELDS as readonly string[]).includes(field);
  // Abierto o cerrado lo decide la persona después del inicio (no el contenido).
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <details
      open={open}
      onToggle={(e) => { setOpen(e.currentTarget.open); }}
      className="group rounded-md border border-outline-variant bg-surface-container-lowest dark:bg-surface-container-low">
      <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-space-sm px-space-md py-space-xs [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-col">
          <span className="text-body-lg-medium text-on-surface">{ASSESSMENT_LABELS[field]}</span>
          {patient ? <span className="text-caption text-on-surface-variant">Del paciente: se guarda en su expediente y se verá en cada visita</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-space-xs">
          {status ? <span className="text-caption text-on-surface-variant">{status}</span> : null}
          <ChevronDown aria-hidden className="size-5 text-on-surface-variant transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="flex flex-col gap-space-xs px-space-md pb-space-md">{children}</div>
    </details>
  );
}

function TextArea({ field, value, error, disabled, onChange }: { field: AssessmentField; value: string; error: string | null; disabled: boolean; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="sr-only">
        {ASSESSMENT_LABELS[field]}
      </label>
      <textarea
        id={id}
        rows={3}
        value={value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-count`}
        autoCapitalize="sentences"
        onChange={(e) => { onChange(e.target.value); }}
        className={cn(
          'min-h-24 w-full resize-y rounded-md bg-surface-container-low px-3.5 py-3 text-body-lg text-on-surface outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary disabled:opacity-60 dark:bg-surface-container-high',
          error && 'ring-2 ring-error',
        )}
      />
      <p id={`${id}-count`} className={cn('self-end text-caption tabular-nums', value.length > ASSESSMENT_MAX ? 'text-error' : 'text-on-surface-variant')}>
        {error ? `${error} ` : ''}
        {`${String(value.length)}/${String(ASSESSMENT_MAX)}`}
      </p>
    </div>
  );
}
