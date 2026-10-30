import {
  AGENDA_COLOR_LABELS,
  AGENDA_COLORS,
  APPOINTMENT_DURATION_MAX,
  APPOINTMENT_DURATION_MIN,
  CATALOG_CODE_REGEX,
  PRICED_KINDS,
  PROCEDURE_KIND_LABELS,
  PROCEDURE_KINDS,
  SORT_ORDER_MAX,
  VISIT_ROUTE_LABELS,
  VISIT_ROUTES,
  type AgendaColor,
  type CatalogItem,
  type CatalogKind,
  type CatalogPriceInput,
  type ProcedureKind,
} from '@clinic/shared';
import { Banner, Button, cn, Dialog, DiscardChangesDialog, Field, formatMoneyInput, MoneyField, parseMoney, SelectField } from '@clinic/ui';
import { BookOpen, CalendarDays, Hash } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { api, ApiError } from '../../lib/api.ts';
import { catalogMessage, EDIT_LABELS, formatDay, NEW_LABELS } from '../../lib/catalog.ts';

// S-ADM-19 «Nuevo / Editar» de los catálogos. Sin captura de Stitch: diálogo
// de la hoja S-GEN-30, con los campos del manual (S-ADM-13 a 18) y el precio
// de la sede elegida en Procedimientos y Pruebas (T-011). El código solo se
// escribe al crear; los opcionales dicen «(opcional)»; no se cierra tocando
// fuera y, con cambios, pregunta antes de descartarlos.

interface Values {
  code: string;
  name: string;
  sortOrder: string;
  duration: string;
  route: string;
  color: AgendaColor;
  procedureKind: ProcedureKind;
  price: string;
  effectiveFrom: string;
}

type Errors = Partial<Record<keyof Values, string>>;

const INTEGER = /^\d+$/;

function integerError(text: string, min: number, max: number): string | undefined {
  if (text.trim() === '') return undefined;
  const n = Number(text);
  return INTEGER.test(text.trim()) && n >= min && n <= max ? undefined : `Ingrese un número entero entre ${String(min)} y ${String(max)}.`;
}

export function CatalogDialog({
  kind,
  item,
  location,
  today,
  onClose,
  onSaved,
  onConflict,
}: {
  kind: CatalogKind;
  /** Nulo: «Nuevo». */
  item: CatalogItem | null;
  /** Sede de los precios (la elegida en la página). */
  location: { id: string; name: string };
  /** Hoy en esa sede (`AAAA-MM-DD`): mínimo de «Vigente desde». */
  today: string;
  onClose: () => void;
  onSaved: () => void;
  onConflict: () => void;
}) {
  const editing = item !== null;
  const priced = PRICED_KINDS.includes(kind);
  const current = item?.price?.current ?? null;
  const initial: Values = {
    code: item?.code ?? '',
    name: item?.name ?? '',
    sortOrder: item?.sortOrder === null || item?.sortOrder === undefined ? '' : String(item.sortOrder),
    duration: item?.defaultDurationMinutes ? String(item.defaultDurationMinutes) : '',
    route: item?.suggestedRoute ?? '',
    color: item?.color ?? 'teal',
    procedureKind: item?.kind ?? 'procedure',
    price: current ? formatMoneyInput(current.amountCents) : '',
    effectiveFrom: today,
  };
  const [values, setValues] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  const cents = parseMoney(values.price);
  const priceChanged = priced && (values.price !== initial.price || values.effectiveFrom !== initial.effectiveFrom) && values.price.trim() !== '';
  const errors: Errors = {};
  if (!editing && !CATALOG_CODE_REGEX.test(values.code)) {
    errors.code = 'Use de 2 a 41 letras mayúsculas, dígitos, guiones o guiones bajos, empezando con una letra.';
  }
  if (values.name.trim() === '') errors.name = 'Este campo es obligatorio.';
  else if (values.name.trim().length > 120) errors.name = 'Use como máximo 120 caracteres.';
  const sortError = integerError(values.sortOrder, 0, SORT_ORDER_MAX);
  if (sortError) errors.sortOrder = sortError;
  if (kind === 'appointment-types') {
    const durationError = integerError(values.duration, APPOINTMENT_DURATION_MIN, APPOINTMENT_DURATION_MAX);
    if (durationError) errors.duration = durationError;
  }
  if (priced) {
    if (!editing && values.price.trim() === '') errors.price = 'Este campo es obligatorio.';
    else if (values.price.trim() !== '' && cents === null) errors.price = 'Ingrese un monto válido con hasta dos decimales (p. ej. 25.00).';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.effectiveFrom)) errors.effectiveFrom = 'Ingrese una fecha como AAAA-MM-DD.';
    else if (values.effectiveFrom < today) errors.effectiveFrom = 'La fecha de vigencia no puede ser anterior a hoy en la sede.';
  }
  const dirty = (Object.keys(initial) as (keyof Values)[]).some((key) => values[key] !== initial[key]);
  const shown = (key: keyof Values) => (submitted ? (errors[key] ?? null) : null);

  const requestClose = () => {
    if (busy) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    setBusy(true);
    setServerError(null);
    const fields: Record<string, unknown> = {
      name: values.name.trim(),
      sortOrder: values.sortOrder.trim() === '' ? null : Number(values.sortOrder),
    };
    if (kind === 'appointment-types') {
      fields.defaultDurationMinutes = values.duration.trim() === '' ? null : Number(values.duration);
      fields.suggestedRoute = values.route === '' ? null : values.route;
      fields.color = values.color;
    }
    if (kind === 'procedures') fields.kind = values.procedureKind;
    const price: CatalogPriceInput | undefined =
      priced && cents !== null && (!editing || priceChanged) ? { locationId: location.id, amountCents: cents, effectiveFrom: values.effectiveFrom } : undefined;
    try {
      if (item) await api.updateCatalogItem(kind, item.id, { ...fields, expectedVersion: item.version, ...(price ? { price } : {}) });
      else await api.createCatalogItem(kind, { ...fields, code: values.code, ...(price ? { price } : {}) });
      onSaved();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'version_conflict') onConflict();
      else setServerError(catalogMessage(error));
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => { if (!next) requestClose(); }}
        dismissible={false}
        wide
        fullScreenOnPhone
        icon={<BookOpen className="size-7" />}
        title={editing ? EDIT_LABELS[kind] : NEW_LABELS[kind]}
        footer={
          <>
            <Button variant="tonal" className="text-on-surface" disabled={busy} onClick={requestClose}>
              Cancelar
            </Button>
            <Button type="submit" form="catalog-form" loading={busy}>
              {editing ? 'Guardar' : 'Crear'}
            </Button>
          </>
        }
      >
        <form id="catalog-form" noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-space-md">
          <div aria-live="polite">{serverError ? <Banner tone="error" title={serverError} /> : null}</div>
          <Field
            label="Código"
            hint={editing ? 'No se puede cambiar.' : 'p. ej. INJ-B12'}
            icon={<Hash className="size-5" />}
            className="font-mono uppercase"
            autoComplete="off"
            autoFocus={!editing}
            maxLength={41}
            value={values.code}
            disabled={editing || busy}
            error={shown('code')}
            onChange={(e) => { set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '')); }}
          />
          <Field
            label="Nombre"
            autoComplete="off"
            autoFocus={editing}
            maxLength={120}
            value={values.name}
            disabled={busy}
            error={shown('name')}
            onChange={(e) => { set('name', e.target.value); }}
          />

          {kind === 'procedures' ? (
            <SelectField
              label="Tipo"
              value={values.procedureKind}
              disabled={busy}
              onChange={(e) => { set('procedureKind', e.target.value as ProcedureKind); }}
            >
              {PROCEDURE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {PROCEDURE_KIND_LABELS[k]}
                </option>
              ))}
            </SelectField>
          ) : null}

          {kind === 'appointment-types' ? (
            <>
              <Field
                label="Duración predeterminada (opcional)"
                inputMode="numeric"
                autoComplete="off"
                value={values.duration}
                disabled={busy}
                error={shown('duration')}
                trailing={<span className="text-caption text-on-surface-variant">min</span>}
                onChange={(e) => { set('duration', e.target.value.replace(/\D/g, '')); }}
              />
              <SelectField label="Ruta sugerida (opcional)" value={values.route} disabled={busy} onChange={(e) => { set('route', e.target.value); }}>
                <option value="">—</option>
                {VISIT_ROUTES.map((r) => (
                  <option key={r} value={r}>
                    {VISIT_ROUTE_LABELS[r]}
                  </option>
                ))}
              </SelectField>
              <fieldset className="flex flex-col gap-space-xs">
                <legend className="mb-space-xs text-body-md-medium text-on-surface">Color de la agenda</legend>
                <p className="text-caption text-on-surface-variant">Se muestra como franja lateral en las tarjetas de la agenda.</p>
                <div className="grid grid-cols-2 gap-space-xs tab:grid-cols-4">
                  {AGENDA_COLORS.map((color) => (
                    <label
                      key={color}
                      className={cn(
                        'flex min-h-touch cursor-pointer items-center gap-space-sm rounded-md border px-space-sm text-body-md',
                        values.color === color ? 'border-primary bg-primary/10 text-on-surface' : 'border-outline-variant text-on-surface-variant',
                      )}
                    >
                      <input
                        type="radio"
                        name="agenda-color"
                        className="sr-only"
                        value={color}
                        checked={values.color === color}
                        disabled={busy}
                        onChange={() => { set('color', color); }}
                      />
                      <span aria-hidden className={cn('h-6 w-1.5 shrink-0 rounded-full', AGENDA_STRIPE[color])} />
                      {AGENDA_COLOR_LABELS[color]}
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          ) : null}

          <Field
            label="Orden (opcional)"
            inputMode="numeric"
            autoComplete="off"
            value={values.sortOrder}
            disabled={busy}
            error={shown('sortOrder')}
            onChange={(e) => { set('sortOrder', e.target.value.replace(/\D/g, '')); }}
          />

          {priced ? (
            <div className="flex flex-col gap-space-md rounded-lg bg-surface-container-low p-space-md dark:bg-surface-container">
              <MoneyField
                label={`Precio en ${location.name}${editing ? ' (opcional)' : ''}`}
                value={values.price}
                disabled={busy}
                error={shown('price')}
                onValueChange={(text) => { set('price', text); }}
              />
              <Field
                label="Vigente desde"
                type="date"
                min={today}
                icon={<CalendarDays className="size-5" />}
                value={values.effectiveFrom}
                disabled={busy}
                error={shown('effectiveFrom')}
                onChange={(e) => { set('effectiveFrom', e.target.value); }}
              />
              <p className="text-caption text-on-surface-variant">
                {editing && current
                  ? `Hoy rige ${formatMoneyInput(current.amountCents)} USD desde el ${formatDay(current.effectiveFrom)}. Un precio nuevo no cambia los anteriores.`
                  : 'Un precio nuevo no cambia los anteriores: se guarda con su fecha de vigencia.'}
              </p>
            </div>
          ) : null}
        </form>
      </Dialog>
      <DiscardChangesDialog open={confirmDiscard} onOpenChange={setConfirmDiscard} onDiscard={onClose} />
    </>
  );
}

/** Franja de color de la agenda (tokens --agenda-* de packages/ui). */
export const AGENDA_STRIPE: Record<AgendaColor, string> = {
  teal: 'bg-agenda-teal',
  cyan: 'bg-agenda-cyan',
  blue: 'bg-agenda-blue',
  indigo: 'bg-agenda-indigo',
  violet: 'bg-agenda-violet',
  fuchsia: 'bg-agenda-fuchsia',
  slate: 'bg-agenda-slate',
  stone: 'bg-agenda-stone',
};
