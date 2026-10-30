import { LAB_PREFERENCE_MAX, LAB_PREFERENCE_MIN, type LabProvider } from '@clinic/shared';
import { Banner, Button, ConfirmDialog, DataTable, Dialog, DiscardChangesDialog, Field, SelectField, SemanticChip, useSnackbar, type Column } from '@clinic/ui';
import { Ban, CirclePause, CirclePlay, FlaskConical, ListOrdered, Pencil, RefreshCw, Search } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { api, ApiError } from '../../lib/api.ts';
import { catalogMessage } from '../../lib/catalog.ts';
import { isVersionConflict } from '../../lib/users.ts';

// S-ADM-17 Catálogos › Proveedores de laboratorio (T-011b, ADR 0028). Sin
// captura de Stitch: el patrón de las demás pestañas de Catálogos (búsqueda,
// filtro de estado, «Actualizar», tabla con estado y acciones en la fila) y
// el diálogo de la hoja S-GEN-30. Campos del ADR: nombre, orden de
// preferencia (1 es el más preferido) y estado. Desactivar pide motivo.

type StateFilter = 'all' | 'active' | 'inactive';

export function LabProvidersPanel({
  providers,
  creating,
  onCloseCreate,
  onReload,
}: {
  providers: LabProvider[];
  /** «Nuevo laboratorio» del encabezado de la página. */
  creating: boolean;
  onCloseCreate: () => void;
  onReload: () => Promise<void>;
}) {
  const snackbar = useSnackbar();
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [editing, setEditing] = useState<LabProvider | null>(null);
  const [deactivating, setDeactivating] = useState<LabProvider | null>(null);

  const conflict = () => {
    setEditing(null);
    setDeactivating(null);
    onCloseCreate();
    snackbar({ message: 'Este registro fue actualizado por otro usuario. Actualice para continuar.', action: { label: 'Actualizar', onClick: () => void onReload() } });
  };
  const reactivate = async (provider: LabProvider) => {
    try {
      await api.reactivateLabProvider(provider.id, provider.version);
      await onReload();
    } catch (error) {
      if (isVersionConflict(error)) conflict();
      else snackbar({ message: catalogMessage(error) });
    }
  };

  const q = search.trim().toLocaleLowerCase('es');
  const rows = providers.filter((p) => (stateFilter === 'all' || p.active === (stateFilter === 'active')) && (q === '' || p.name.toLocaleLowerCase('es').includes(q)));

  const columns: Column<LabProvider>[] = [
    { key: 'name', header: 'Nombre', primary: true, className: 'min-w-32', cell: (p) => <span className="text-body-lg-medium text-on-surface">{p.name}</span> },
    { key: 'preference', header: 'Orden de preferencia', align: 'end', cell: (p) => p.preference },
    { key: 'state', header: 'Estado', cell: (p) => <SemanticChip tone={p.active ? 'success' : 'neutral'} label={p.active ? 'Activo' : 'Inactivo'} /> },
    {
      key: 'actions',
      header: 'Acciones',
      align: 'end',
      cell: (p) => (
        <span className="flex flex-nowrap justify-end gap-space-xs">
          <Button variant="text" className="w-12 px-0 2xl:w-auto 2xl:px-space-sm" title="Editar" aria-label={`Editar ${p.name}`} onClick={() => { setEditing(p); }}>
            <Pencil aria-hidden className="size-5" /> <span className="hidden 2xl:inline">Editar</span>
          </Button>
          {p.active ? (
            <Button
              variant="text"
              className="w-12 px-0 text-on-surface-variant 2xl:w-auto 2xl:px-space-sm"
              title="Desactivar"
              aria-label={`Desactivar ${p.name}`}
              onClick={() => { setDeactivating(p); }}
            >
              <CirclePause aria-hidden className="size-5" /> <span className="hidden 2xl:inline">Desactivar</span>
            </Button>
          ) : (
            <Button variant="text" className="w-12 px-0 2xl:w-auto 2xl:px-space-sm" title="Reactivar" aria-label={`Reactivar ${p.name}`} onClick={() => void reactivate(p)}>
              <CirclePlay aria-hidden className="size-5" /> <span className="hidden 2xl:inline">Reactivar</span>
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end gap-space-sm">
        <div className="min-w-60 flex-1">
          <Field
            label="Buscar"
            hideLabel
            icon={<Search className="size-5" />}
            placeholder="Buscar por nombre de laboratorio…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); }}
          />
        </div>
        <SelectField label="Estado" hideLabel value={stateFilter} onChange={(e) => { setStateFilter(e.target.value as StateFilter); }}>
          <option value="all">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
        </SelectField>
        <Button variant="elevated" aria-label="Actualizar" title="Actualizar" className="px-3" onClick={() => void onReload()}>
          <RefreshCw aria-hidden className="size-5" />
        </Button>
      </div>
      <p className="flex items-center gap-space-xs text-body-md text-on-surface-variant">
        <span aria-hidden className="size-2 rounded-full bg-primary" />
        Mostrando <strong className="text-on-surface">{rows.length}</strong> de <strong className="text-on-surface">{providers.length}</strong> laboratorios
      </p>
      <DataTable
        caption="Proveedores de laboratorio"
        density="compact"
        cardsBelow="desk"
        rows={rows}
        rowKey={(p) => p.id}
        rowClassName={(p) => (p.active ? undefined : 'opacity-70')}
        empty="Ningún laboratorio coincide con la búsqueda."
        columns={columns}
      />

      {creating || editing ? (
        <LabProviderDialog
          provider={editing}
          onClose={() => {
            setEditing(null);
            onCloseCreate();
          }}
          onConflict={conflict}
          onSaved={() => {
            setEditing(null);
            onCloseCreate();
            void onReload();
            snackbar({ message: 'Guardado.' });
          }}
        />
      ) : null}
      {deactivating ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) setDeactivating(null); }}
          destructive
          icon={<Ban className="size-7" />}
          title={`¿Desactivar ${deactivating.name}?`}
          description="Un laboratorio inactivo ya no se ofrece ni se puede marcar en las pruebas. Sus costos se conservan en el historial."
          reason={{ label: 'Motivo', hint: 'Se guarda en la auditoría y lo ven los administradores: no incluya información de pacientes.' }}
          confirmLabel="Desactivar"
          onConfirm={async (reason) => {
            try {
              await api.deactivateLabProvider(deactivating.id, reason ?? '', deactivating.version);
              setDeactivating(null);
              await onReload();
            } catch (error) {
              if (isVersionConflict(error)) conflict();
              else {
                setDeactivating(null);
                snackbar({ message: catalogMessage(error) });
              }
            }
          }}
        />
      ) : null}
    </>
  );
}

/** «Nuevo laboratorio» / «Editar laboratorio». */
function LabProviderDialog({
  provider,
  onClose,
  onSaved,
  onConflict,
}: {
  /** Nulo: «Nuevo». */
  provider: LabProvider | null;
  onClose: () => void;
  onSaved: () => void;
  onConflict: () => void;
}) {
  const initial = { name: provider?.name ?? '', preference: provider ? String(provider.preference) : '' };
  const [values, setValues] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const errors: { name?: string; preference?: string } = {};
  if (values.name.trim() === '') errors.name = 'Este campo es obligatorio.';
  else if (values.name.trim().length > 120) errors.name = 'Use como máximo 120 caracteres.';
  const preference = Number(values.preference);
  if (values.preference.trim() === '') errors.preference = 'Este campo es obligatorio.';
  else if (!/^\d+$/.test(values.preference) || preference < LAB_PREFERENCE_MIN || preference > LAB_PREFERENCE_MAX) {
    errors.preference = `Ingrese un número entero entre ${String(LAB_PREFERENCE_MIN)} y ${String(LAB_PREFERENCE_MAX)}.`;
  }
  const dirty = values.name !== initial.name || values.preference !== initial.preference;
  const shown = (key: keyof typeof errors) => (submitted ? (errors[key] ?? null) : null);

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
    const input = { name: values.name.trim(), preference };
    try {
      if (provider) await api.updateLabProvider(provider.id, input, provider.version);
      else await api.createLabProvider(input);
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
        fullScreenOnPhone
        icon={<FlaskConical className="size-7" />}
        title={provider ? 'Editar laboratorio' : 'Nuevo laboratorio'}
        footer={
          <>
            <Button variant="tonal" className="text-on-surface" disabled={busy} onClick={requestClose}>
              Cancelar
            </Button>
            <Button type="submit" form="lab-provider-form" loading={busy}>
              {provider ? 'Guardar' : 'Crear'}
            </Button>
          </>
        }
      >
        <form id="lab-provider-form" noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-space-md">
          <div aria-live="polite">{serverError ? <Banner tone="error" title={serverError} /> : null}</div>
          <Field
            label="Nombre"
            autoComplete="off"
            autoFocus
            maxLength={120}
            value={values.name}
            disabled={busy}
            error={shown('name')}
            onChange={(e) => { setValues((v) => ({ ...v, name: e.target.value })); }}
          />
          <Field
            label="Orden de preferencia"
            hint="1 es el más preferido. Decide la sugerencia cuando dos laboratorios cuestan lo mismo."
            inputMode="numeric"
            autoComplete="off"
            icon={<ListOrdered className="size-5" />}
            value={values.preference}
            disabled={busy}
            error={shown('preference')}
            onChange={(e) => { setValues((v) => ({ ...v, preference: e.target.value.replace(/\D/g, '') })); }}
          />
        </form>
      </Dialog>
      <DiscardChangesDialog open={confirmDiscard} onOpenChange={setConfirmDiscard} onDiscard={onClose} />
    </>
  );
}
