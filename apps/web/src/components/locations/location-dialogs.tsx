import { isIanaTimeZone, LOCATION_CODE_PATTERN } from '@clinic/shared';
import { Banner, Button, cn, Dialog, DiscardChangesDialog, Field, TextAreaField } from '@clinic/ui';
import { Building2, Check, ChevronRight, Clock, Hash, Phone, Search } from 'lucide-react';
import { useMemo, useState, type SubmitEvent } from 'react';
import { api, ApiError, type LocationRow } from '../../lib/api.ts';
import { userActionMessage } from '../../lib/users.ts';

// S-ADM-11 Nueva sede / Editar sede y S-ADM-12 Selector de zona horaria. Sin
// captura de Stitch: diálogos de la hoja S-GEN-30. No se cierran tocando
// fuera; con cambios, preguntan antes de descartarlos.

function locationMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'location_code_taken') return 'Este registro ya existe.';
  return userActionMessage(error);
}

interface Errors {
  code?: string;
  name?: string;
  timezone?: string;
  address?: string;
  phone?: string;
}

/** S-ADM-11. `location` nulo: «Nueva sede». */
export function LocationDialog({
  location,
  defaultTimezone,
  onClose,
  onSaved,
  onConflict,
}: {
  location: LocationRow | null;
  defaultTimezone: string;
  onClose: () => void;
  onSaved: () => void;
  onConflict: () => void;
}) {
  const editing = location !== null;
  const initial = {
    code: location?.code ?? '',
    name: location?.name ?? '',
    timezone: location?.timezone ?? defaultTimezone,
    address: location?.address ?? '',
    phone: location?.phone ?? '',
  };
  const [values, setValues] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [picking, setPicking] = useState(false);

  const errors: Errors = {};
  if (!editing && !LOCATION_CODE_PATTERN.test(values.code)) errors.code = 'Use de 2 a 8 caracteres: letras mayúsculas y dígitos, empezando por una letra (p. ej. LAN).';
  if (values.name.trim() === '') errors.name = 'Este campo es obligatorio.';
  if (!isIanaTimeZone(values.timezone)) errors.timezone = 'Seleccione una zona horaria IANA válida.';
  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((key) => values[key] !== initial[key]);
  const set = (key: keyof typeof initial, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

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
    const input = { name: values.name.trim(), timezone: values.timezone, address: values.address.trim() || null, phone: values.phone.trim() || null };
    try {
      if (location) await api.updateLocation(location.id, input, location.version);
      else await api.createLocation({ ...input, code: values.code });
      onSaved();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'version_conflict') onConflict();
      else setServerError(locationMessage(error));
      setBusy(false);
    }
  };

  const shown = (key: keyof Errors) => (submitted ? (errors[key] ?? null) : null);

  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => { if (!next) requestClose(); }}
        dismissible={false}
        wide
        fullScreenOnPhone
        icon={<Building2 className="size-7" />}
        title={editing ? 'Editar sede' : 'Nueva sede'}
        footer={
          <>
            <Button variant="tonal" className="text-on-surface" disabled={busy} onClick={requestClose}>
              Cancelar
            </Button>
            <Button type="submit" form="location-form" loading={busy}>
              {editing ? 'Guardar' : 'Crear'}
            </Button>
          </>
        }
      >
        <form id="location-form" noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-space-md">
          <div aria-live="polite">{serverError ? <Banner tone="error" title={serverError} /> : null}</div>
          <Field
            label="Código"
            hint={editing ? 'No se puede cambiar.' : 'p. ej. LAN'}
            icon={<Hash className="size-5" />}
            className="font-mono uppercase"
            autoComplete="off"
            autoFocus={!editing}
            maxLength={8}
            value={values.code}
            readOnly={editing}
            disabled={busy || editing}
            error={shown('code')}
            onChange={(e) => { set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); }}
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
          <TimezoneField value={values.timezone} error={shown('timezone')} disabled={busy} onOpen={() => { setPicking(true); }} />
          <TextAreaField
            label="Dirección"
            rows={2}
            maxLength={250}
            value={values.address}
            disabled={busy}
            onChange={(e) => { set('address', e.target.value); }}
          />
          <Field
            label="Teléfono"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            icon={<Phone className="size-5" />}
            maxLength={30}
            value={values.phone}
            disabled={busy}
            onChange={(e) => { set('phone', e.target.value); }}
          />
        </form>
      </Dialog>
      {picking ? (
        <TimezoneDialog
          value={values.timezone}
          onClose={() => { setPicking(false); }}
          onPick={(zone) => {
            set('timezone', zone);
            setPicking(false);
          }}
        />
      ) : null}
      <DiscardChangesDialog open={confirmDiscard} onOpenChange={setConfirmDiscard} onDiscard={onClose} />
    </>
  );
}

/** Campo de solo lectura que abre S-ADM-12. */
function TimezoneField({ value, error, disabled, onOpen }: { value: string; error: string | null; disabled: boolean; onOpen: () => void }) {
  return (
    <div className="flex flex-col gap-space-xs">
      <span id="timezone-label" className="text-body-md-medium text-on-surface">
        Zona horaria
      </span>
      <button
        type="button"
        aria-labelledby="timezone-label timezone-value"
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={onOpen}
        className={cn(
          'flex min-h-touch items-center gap-space-sm rounded-md bg-surface-container-low px-3.5 text-left text-body-lg text-on-surface hover:bg-surface-container dark:bg-surface-container-high',
          error ? 'ring-2 ring-error' : 'focus-visible:ring-2 focus-visible:ring-primary',
        )}
      >
        <Clock aria-hidden className="size-5 text-on-surface-variant" />
        <span id="timezone-value" className="flex-1 font-mono text-code-md">
          {value || 'Seleccione una zona horaria'}
        </span>
        <ChevronRight aria-hidden className="size-5 text-on-surface-variant" />
      </button>
      {error ? <p className="text-caption text-error">{error}</p> : null}
    </div>
  );
}

/** Zonas IANA del navegador, sin desfases ni nombres amigables (manual). */
const ZONES: readonly string[] = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/New_York', 'UTC'];
  }
})();

/** S-ADM-12: buscador sin distinguir mayúsculas (los espacios cuentan como «_») y lista con la actual resaltada. */
export function TimezoneDialog({ value, onClose, onPick }: { value: string; onClose: () => void; onPick: (zone: string) => void }) {
  const [query, setQuery] = useState('');
  const zones = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/\s+/g, '_');
    return needle === '' ? ZONES : ZONES.filter((z) => z.toLowerCase().includes(needle));
  }, [query]);
  return (
    <Dialog
      open
      onOpenChange={(next) => { if (!next) onClose(); }}
      dismissible={false}
      icon={<Clock className="size-7" />}
      title="Zona horaria"
      footer={
        <Button variant="tonal" className="text-on-surface" onClick={onClose}>
          Cancelar
        </Button>
      }
    >
      <Field
        label="Buscar zona horaria"
        hideLabel
        type="search"
        placeholder="Buscar zona horaria"
        autoFocus
        icon={<Search className="size-5" />}
        value={query}
        onChange={(e) => { setQuery(e.target.value); }}
      />
      <ul aria-label="Zonas horarias" className="-mx-space-xs flex h-80 flex-col overflow-y-auto">
        {zones.map((zone) => {
          const current = zone === value;
          return (
            <li key={zone}>
              <button
                type="button"
                aria-current={current ? 'true' : undefined}
                onClick={() => { onPick(zone); }}
                className={cn(
                  'flex min-h-touch w-full items-center justify-between gap-space-sm rounded-md px-space-sm text-left font-mono text-code-md',
                  current ? 'bg-surface-container text-primary dark:bg-surface-container-high' : 'text-on-surface hover:bg-surface-container-low',
                )}
              >
                {zone}
                {current ? <Check aria-label="Actual" className="size-4 shrink-0" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
