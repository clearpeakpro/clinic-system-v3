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
  type CatalogPrice,
  type LabCostChange,
  type LabProvider,
  type LabTestLab,
  type ProcedureKind,
} from '@clinic/shared';
import { Banner, Button, Checkbox, cn, Dialog, DiscardChangesDialog, Field, formatMoneyInput, MoneyField, parseMoney, SelectField } from '@clinic/ui';
import { BookOpen, CalendarDays, Hash } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { api, ApiError } from '../../lib/api.ts';
import { catalogMessage, EDIT_LABELS, formatDay, NEW_LABELS, nextLabCostText, withAmount } from '../../lib/catalog.ts';

// S-ADM-19 «Nuevo / Editar» de los catálogos. Sin captura de Stitch: diálogo
// de la hoja S-GEN-30, con los campos del manual (S-ADM-13 a 18). En
// Procedimientos y Pruebas (T-011): «Precio general» de la organización y,
// opcional, «Precio en {sede}» para la sede elegida, cada uno con su fecha de
// vigencia. Sin precio propio, la sede usa el general. El código solo se
// escribe al crear; los opcionales dicen «(opcional)»; no se cierra tocando
// fuera y, con cambios, pregunta antes de descartarlos. En Pruebas (T-011b,
// ADR 0028; S-ADM-16): «Laboratorios que la realizan», cada laboratorio
// activo con su costo para la clínica y su fecha de vigencia; desmarcarlo es
// «No la realiza desde {fecha}».

interface Values {
  code: string;
  name: string;
  sortOrder: string;
  duration: string;
  route: string;
  color: AgendaColor;
  procedureKind: ProcedureKind;
  generalPrice: string;
  generalFrom: string;
  locationPrice: string;
  locationFrom: string;
}

type Errors = Partial<Record<keyof Values, string>>;

/** Un laboratorio en «Laboratorios que la realizan». */
interface LabValues {
  checked: boolean;
  amount: string;
  from: string;
}
type LabErrors = Record<string, { amount?: string; from?: string }>;

const MONEY_ERROR = 'Ingrese un monto válido con hasta dos decimales (p. ej. 25.00).';

function dateError(value: string, min: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Ingrese una fecha como AAAA-MM-DD.';
  return value < min ? 'La fecha de vigencia no puede ser anterior a hoy.' : undefined;
}

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
  generalToday,
  labProviders,
  onClose,
  onSaved,
  onConflict,
}: {
  kind: CatalogKind;
  /** Nulo: «Nuevo». */
  item: CatalogItem | null;
  /** Sede de los precios (la elegida en la página). */
  location: { id: string; name: string };
  /** Hoy en esa sede (`AAAA-MM-DD`): mínimo de la vigencia de su precio propio. */
  today: string;
  /** El día más adelantado de las sedes activas: mínimo de la vigencia del precio general y de los costos. */
  generalToday: string;
  /** Laboratorios de la organización (solo se usan en Pruebas). */
  labProviders: readonly LabProvider[];
  onClose: () => void;
  onSaved: () => void;
  onConflict: () => void;
}) {
  const editing = item !== null;
  const priced = PRICED_KINDS.includes(kind);
  const general = withAmount(item?.price?.general.current);
  // Sin importe, la sede «Usa el precio general» (P-15).
  const own = withAmount(item?.price?.location.current);
  const initial: Values = {
    code: item?.code ?? '',
    name: item?.name ?? '',
    sortOrder: item?.sortOrder === null || item?.sortOrder === undefined ? '' : String(item.sortOrder),
    duration: item?.defaultDurationMinutes ? String(item.defaultDurationMinutes) : '',
    route: item?.suggestedRoute ?? '',
    color: item?.color ?? 'teal',
    procedureKind: item?.kind ?? 'procedure',
    generalPrice: general ? formatMoneyInput(general.amountCents) : '',
    generalFrom: generalToday,
    locationPrice: own ? formatMoneyInput(own.amountCents) : '',
    locationFrom: today,
  };
  const [values, setValues] = useState(initial);
  // Pruebas: los laboratorios activos, marcados si la realizan hoy.
  const labRows = kind === 'lab-tests' ? labProviders.filter((p) => p.active) : [];
  const labOf = (providerId: string): LabTestLab | undefined => item?.labs?.find((l) => l.labProviderId === providerId);
  const initialLabs: Record<string, LabValues> = Object.fromEntries(
    labRows.map((p) => {
      const current = withAmount(labOf(p.id)?.current);
      return [p.id, { checked: current !== null, amount: current ? formatMoneyInput(current.amountCents) : '', from: generalToday }];
    }),
  );
  const [labs, setLabs] = useState(initialLabs);
  const setLab = (providerId: string, patch: Partial<LabValues>) => {
    setLabs((all) => ({ ...all, [providerId]: { ...(all[providerId] ?? { checked: false, amount: '', from: generalToday }), ...patch } }));
  };
  const labChanged = (providerId: string) => {
    const v = labs[providerId];
    const i = initialLabs[providerId];
    if (!v || !i) return false;
    return v.checked !== i.checked || (v.checked && (v.amount !== i.amount || v.from !== i.from));
  };
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  const generalCents = parseMoney(values.generalPrice);
  const locationCents = parseMoney(values.locationPrice);
  // Un precio se envía solo si cambia el importe o la fecha (y no está vacío).
  const changed = (amount: keyof Values, from: keyof Values) =>
    values[amount].trim() !== '' && (!editing || values[amount] !== initial[amount] || values[from] !== initial[from]);
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
    if (!editing && values.generalPrice.trim() === '') errors.generalPrice = 'Este campo es obligatorio.';
    else if (values.generalPrice.trim() !== '' && generalCents === null) errors.generalPrice = MONEY_ERROR;
    if (values.locationPrice.trim() !== '' && locationCents === null) errors.locationPrice = MONEY_ERROR;
    const generalDate = changed('generalPrice', 'generalFrom') ? dateError(values.generalFrom, generalToday) : undefined;
    const locationDate = changed('locationPrice', 'locationFrom') ? dateError(values.locationFrom, today) : undefined;
    if (generalDate) errors.generalFrom = generalDate;
    if (locationDate) errors.locationFrom = locationDate;
  }
  const labErrors: LabErrors = {};
  for (const p of labRows) {
    const v = labs[p.id];
    if (!v || !labChanged(p.id)) continue;
    const e: { amount?: string; from?: string } = {};
    if (v.checked && v.amount.trim() === '') e.amount = 'Este campo es obligatorio.';
    else if (v.checked && parseMoney(v.amount) === null) e.amount = MONEY_ERROR;
    const fromError = dateError(v.from, generalToday);
    if (fromError) e.from = fromError;
    if (e.amount ?? e.from) labErrors[p.id] = e;
  }
  const dirty = (Object.keys(initial) as (keyof Values)[]).some((key) => values[key] !== initial[key]) || labRows.some((p) => labChanged(p.id));
  const shown = (key: keyof Values) => (submitted ? (errors[key] ?? null) : null);

  const requestClose = () => {
    if (busy) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0 || Object.keys(labErrors).length > 0) return;
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
    const prices: Record<string, unknown> = {};
    if (priced && generalCents !== null && changed('generalPrice', 'generalFrom')) {
      prices.generalPrice = { amountCents: generalCents, effectiveFrom: values.generalFrom };
    }
    if (priced && locationCents !== null && changed('locationPrice', 'locationFrom')) {
      prices.locationPrice = { locationId: location.id, amountCents: locationCents, effectiveFrom: values.locationFrom };
    }
    // Solo los laboratorios que cambian; desmarcar es «No la realiza desde».
    const labCosts: LabCostChange[] = labRows
      .filter((p) => labChanged(p.id))
      .map((p) => {
        const v = labs[p.id] ?? { checked: false, amount: '', from: generalToday };
        return { labProviderId: p.id, amountCents: v.checked ? parseMoney(v.amount) : null, effectiveFrom: v.from };
      });
    if (labCosts.length > 0) prices.labCosts = labCosts;
    try {
      if (item) await api.updateCatalogItem(kind, item.id, { ...fields, expectedVersion: item.version, ...prices });
      else await api.createCatalogItem(kind, { ...fields, code: values.code, ...prices });
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
            <>
              <PriceSection
                title="Precio general"
                hint="Lo que paga el paciente en todas las sedes, salvo en las que tengan precio propio."
                amountLabel={`Precio general${editing ? ' (opcional)' : ''}`}
                amount={values.generalPrice}
                from={values.generalFrom}
                min={generalToday}
                current={general}
                busy={busy}
                amountError={shown('generalPrice')}
                fromError={shown('generalFrom')}
                onAmount={(text) => { set('generalPrice', text); }}
                onFrom={(day) => { set('generalFrom', day); }}
              />
              <PriceSection
                title={`Precio en ${location.name} (opcional)`}
                hint={own ? 'Esta sede tiene su propio precio, que reemplaza al general.' : 'Usa el precio general. Escriba un importe solo si esta sede cobra distinto.'}
                amountLabel={`Precio en ${location.name}`}
                amount={values.locationPrice}
                from={values.locationFrom}
                min={today}
                current={own}
                busy={busy}
                amountError={shown('locationPrice')}
                fromError={shown('locationFrom')}
                onAmount={(text) => { set('locationPrice', text); }}
                onFrom={(day) => { set('locationFrom', day); }}
              />
            </>
          ) : null}

          {kind === 'lab-tests' ? (
            <fieldset className="flex flex-col gap-space-sm rounded-lg bg-surface-container-low p-space-md dark:bg-surface-container">
              <legend className="sr-only">Laboratorios que la realizan</legend>
              <p aria-hidden className="text-body-md-medium text-on-surface">
                Laboratorios que la realizan
              </p>
              <p className="text-caption text-on-surface-variant">
                Marque cada laboratorio que hace esta prueba y escriba su costo para la clínica. No es el precio que paga el paciente.
              </p>
              {labRows.length === 0 ? (
                <p className="text-body-md text-on-surface-variant">No hay laboratorios activos. Dé de alta los laboratorios en la pestaña Proveedores de laboratorio.</p>
              ) : (
                labRows.map((p) => {
                  const v = labs[p.id] ?? { checked: false, amount: '', from: generalToday };
                  const was = initialLabs[p.id]?.checked ?? false;
                  const lab = labOf(p.id);
                  const current = withAmount(lab?.current);
                  const shownLab = (key: 'amount' | 'from') => (submitted ? (labErrors[p.id]?.[key] ?? null) : null);
                  return (
                    <div key={p.id} className="flex flex-col gap-space-xs border-t border-outline-variant pt-space-sm first-of-type:border-t-0">
                      <Checkbox label={p.name} checked={v.checked} onCheckedChange={(checked) => { setLab(p.id, { checked }); }} />
                      {current || lab?.next ? (
                        <p className="text-caption text-on-surface-variant">
                          {current ? `Hoy cuesta ${formatMoneyInput(current.amountCents)} USD desde el ${formatDay(current.effectiveFrom)}.` : ''}
                          {lab?.next ? ` ${nextLabCostText(lab.next)}.` : ''}
                        </p>
                      ) : null}
                      {v.checked ? (
                        <div className="grid gap-space-sm tab:grid-cols-2">
                          <MoneyField
                            label={`Costo para la clínica en ${p.name}`}
                            value={v.amount}
                            disabled={busy}
                            error={shownLab('amount')}
                            onValueChange={(text) => { setLab(p.id, { amount: text }); }}
                          />
                          <Field
                            label={`Vigente desde (${p.name})`}
                            type="date"
                            min={generalToday}
                            icon={<CalendarDays className="size-5" />}
                            value={v.from}
                            disabled={busy}
                            error={shownLab('from')}
                            onChange={(e) => { setLab(p.id, { from: e.target.value }); }}
                          />
                        </div>
                      ) : was ? (
                        <div className="tab:w-1/2">
                          <Field
                            label={`No la realiza desde (${p.name})`}
                            type="date"
                            min={generalToday}
                            icon={<CalendarDays className="size-5" />}
                            value={v.from}
                            disabled={busy}
                            error={shownLab('from')}
                            onChange={(e) => { setLab(p.id, { from: e.target.value }); }}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </fieldset>
          ) : null}
        </form>
      </Dialog>
      <DiscardChangesDialog open={confirmDiscard} onOpenChange={setConfirmDiscard} onDiscard={onClose} />
    </>
  );
}

/** Un precio con su fecha de vigencia («Precio general» o «Precio en {sede}»). */
function PriceSection({
  title,
  hint,
  amountLabel,
  amount,
  from,
  min,
  current,
  busy,
  amountError,
  fromError,
  onAmount,
  onFrom,
}: {
  title: string;
  hint: string;
  amountLabel: string;
  amount: string;
  from: string;
  min: string;
  current: (CatalogPrice & { amountCents: number }) | null;
  busy: boolean;
  amountError: string | null;
  fromError: string | null;
  onAmount: (text: string) => void;
  onFrom: (day: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-space-sm rounded-lg bg-surface-container-low p-space-md dark:bg-surface-container">
      <legend className="sr-only">{title}</legend>
      <p aria-hidden className="text-body-md-medium text-on-surface">
        {title}
      </p>
      <p className="text-caption text-on-surface-variant">
        {hint}
        {current ? ` Hoy rige ${formatMoneyInput(current.amountCents)} USD desde el ${formatDay(current.effectiveFrom)}.` : ''}
      </p>
      <div className="grid gap-space-sm tab:grid-cols-2">
        <MoneyField label={amountLabel} value={amount} disabled={busy} error={amountError} onValueChange={(text) => { onAmount(text); }} />
        <Field
          label="Vigente desde"
          type="date"
          min={min}
          icon={<CalendarDays className="size-5" />}
          value={from}
          disabled={busy}
          error={fromError}
          onChange={(e) => { onFrom(e.target.value); }}
        />
      </div>
    </fieldset>
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
