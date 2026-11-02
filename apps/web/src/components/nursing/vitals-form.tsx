import { VITAL_RULES, type NursingVitals, type VitalField } from '@clinic/shared';
import { Banner, Button, Checkbox, cn, Field, SegmentedControl } from '@clinic/ui';
import { Save } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { bmiPreview, readVitalsDraft, vitalsChanges, vitalsDraft, withHeightMode, type HeightMode, type VitalsDraft } from '../../lib/nursing.ts';

// S-CLI-14 Formulario «Signos vitales» (Stitch: design/stitch/clinicas/S-CLI-14_signos_vitales).
//  - Unidades imperiales fijas; validación en vivo con los rangos del manual
//    (los mismos que el servidor); estatura en ft / in o en pulgadas, con
//    etiqueta en los dos campos; dolor con interruptor y deslizador.
//  - IMC solo de vista previa: el guardado lo calcula el servidor.
//  - Se envía solo lo cambiado (vaciar borra), con la versión del registro.
//  - Si otra persona guarda mientras se edita, el formulario no pierde lo
//    tecleado: el guardado recibirá el conflicto (409) y se recargará.
//  - El borrador vive solo en memoria.

const FIELD_ORDER: [VitalField, VitalField][] = [
  ['systolic', 'diastolic'],
  ['pulse', 'respirations'],
  ['temperatureF', 'spo2'],
];

export interface VitalsFormProps {
  saved: NursingVitals | null;
  /** Cambia tras un conflicto: el formulario vuelve a lo guardado. */
  resetToken: number;
  onCancel?: () => void;
  onSave: (changes: Partial<Record<VitalField, number | null>>, expectedVersion: number) => Promise<string | null>;
  onDirtyChange: (dirty: boolean) => void;
}

export function VitalsForm({ saved, resetToken, onCancel, onSave, onDirtyChange }: VitalsFormProps) {
  const savedValues = saved?.values ?? null;
  const [base, setBase] = useState({ values: savedValues, version: saved?.version ?? 0, token: resetToken });
  const [draft, setDraft] = useState<VitalsDraft>(() => vitalsDraft(savedValues));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const read = readVitalsDraft(draft);
  const changes = vitalsChanges(base.values, read.values);
  const dirty = Object.keys(changes).length > 0;

  // Lo guardado cambió (guardado propio, de otra persona o tras un conflicto):
  // si no hay cambios sin guardar, o lo tecleado ya es lo guardado (guardado
  // propio), el formulario se pone al día. Con cambios ajenos pendientes se
  // conserva lo tecleado: el guardado recibirá el conflicto.
  const serverVersion = saved?.version ?? 0;
  const matchesServer = Object.keys(vitalsChanges(savedValues, read.values)).length === 0;
  if ((serverVersion !== base.version && (!dirty || matchesServer)) || resetToken !== base.token) {
    setBase({ values: savedValues, version: serverVersion, token: resetToken });
    setDraft(vitalsDraft(savedValues, draft.heightMode));
  }

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => { onDirtyChange(false); }, [onDirtyChange]);

  const hasErrors = Object.keys(read.errors).length > 0;
  const bmi = bmiPreview(read.values);
  const setText = (field: keyof VitalsDraft['text'], value: string) => {
    setDraft((d) => ({ ...d, text: { ...d.text, [field]: value } }));
  };

  const submit = async () => {
    if (!dirty || hasErrors) return;
    setBusy(true);
    setError(null);
    try {
      const problem = await onSave(changes, base.version);
      if (problem) setError(problem);
    } finally {
      setBusy(false);
    }
  };

  const numberField = (field: Exclude<VitalField, 'heightIn' | 'pain'>, extra: { hint?: string } = {}) => {
    const rule = VITAL_RULES[field];
    return (
      <Field
        key={field}
        label={`${rule.label} (${rule.unit})`}
        {...extra}
        inputMode={rule.decimals === 0 ? 'numeric' : 'decimal'}
        autoComplete="off"
        value={draft.text[field]}
        error={read.errors[field] ?? null}
        disabled={busy}
        onChange={(e) => { setText(field, e.target.value); }}
        data-vital={field}
        className="text-right tabular-nums"
      />
    );
  };

  return (
    <form
      aria-label="Signos vitales"
      className="flex flex-col gap-space-md"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {error ? <Banner tone="error" title={error} /> : null}
      <div className="grid gap-space-md tab:grid-cols-2">
        {numberField('weightLb')}
        <div className="flex flex-col gap-space-xs">
          {draft.heightMode === 'ftin' ? (
            <div className="grid grid-cols-2 gap-space-sm">
              <Field
                label="Estatura: pies (ft)"
                inputMode="numeric"
                autoComplete="off"
                value={draft.feet}
                error={read.errors.feet ?? null}
                disabled={busy}
                onChange={(e) => { setDraft((d) => ({ ...d, feet: e.target.value })); }}
                className="text-right tabular-nums"
              />
              <Field
                label="Estatura: pulgadas (in)"
                inputMode="decimal"
                autoComplete="off"
                value={draft.inches}
                error={read.errors.inches ?? read.errors.heightIn ?? null}
                disabled={busy}
                onChange={(e) => { setDraft((d) => ({ ...d, inches: e.target.value })); }}
                className="text-right tabular-nums"
              />
            </div>
          ) : (
            <Field
              label="Estatura (pulgadas totales)"
              inputMode="decimal"
              autoComplete="off"
              value={draft.heightTotal}
              error={read.errors.heightIn ?? null}
              disabled={busy}
              onChange={(e) => { setDraft((d) => ({ ...d, heightTotal: e.target.value })); }}
              className="text-right tabular-nums"
            />
          )}
          <SegmentedControl<HeightMode>
            label="Unidad de la estatura"
            options={[
              { value: 'ftin', label: 'ft / in' },
              { value: 'in', label: 'pulgadas' },
            ]}
            value={draft.heightMode}
            onChange={(mode) => { setDraft((d) => withHeightMode(d, mode)); }}
            className="self-start"
          />
        </div>
      </div>
      <p className={cn('text-body-md', read.errors.bmi ? 'text-error' : 'text-on-surface-variant')} data-testid="bmi-preview">
        <span className="font-semibold text-on-surface">IMC: {bmi === null ? '—' : String(bmi)}</span>
        {' · '}
        {read.errors.bmi ?? 'Solo vista previa; el valor guardado lo calcula el servidor al guardar.'}
        {saved?.bmi != null ? ` · Guardado: ${String(saved.bmi)}` : ''}
      </p>
      {FIELD_ORDER.map(([a, b]) => (
        <div key={a} className="grid gap-space-md tab:grid-cols-2">
          {numberField(a as Exclude<VitalField, 'heightIn' | 'pain'>)}
          {numberField(b as Exclude<VitalField, 'heightIn' | 'pain'>)}
        </div>
      ))}
      <div className="grid gap-space-md tab:grid-cols-2">
        {numberField('glucose', { hint: 'Opcional' })}
        <PainControl draft={draft} disabled={busy} onChange={(painOn, pain) => { setDraft((d) => ({ ...d, painOn, pain })); }} />
      </div>
      <div className="flex flex-wrap justify-end gap-space-sm">
        {onCancel ? (
          <Button type="button" variant="tonal" disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" disabled={!dirty || hasErrors} loading={busy} loadingText="Guardando…">
          <Save aria-hidden className="size-5" /> Guardar signos vitales
        </Button>
      </div>
    </form>
  );
}

function PainControl({ draft, disabled, onChange }: { draft: VitalsDraft; disabled: boolean; onChange: (on: boolean, pain: number) => void }): ReactNode {
  return (
    <fieldset className="flex flex-col gap-space-xs" disabled={disabled}>
      <legend className="sr-only">Dolor</legend>
      <Checkbox label={draft.painOn ? `Dolor (0–10): ${String(draft.pain)}` : 'Dolor (0–10) · Opcional'} checked={draft.painOn} onCheckedChange={(on) => { onChange(on, draft.pain); }} />
      {draft.painOn ? (
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={draft.pain}
          aria-label="Dolor de 0 a 10"
          aria-valuetext={`${String(draft.pain)} de 10`}
          onChange={(e) => { onChange(true, Number(e.target.value)); }}
          className="h-12 w-full accent-primary"
        />
      ) : null}
    </fieldset>
  );
}
