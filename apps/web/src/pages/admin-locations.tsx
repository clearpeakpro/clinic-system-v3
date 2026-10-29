import {
  AsyncView,
  Button,
  cn,
  ConfirmDialog,
  DropdownContent,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  EmptyState,
  StatusChip,
  useSnackbar,
} from '@clinic/ui';
import { useQuery } from '@tanstack/react-query';
import { Ban, Building2, CircleCheck, CirclePause, Clock, MapPin, MoreVertical, Pencil, Phone, Plus, RefreshCw, Power } from 'lucide-react';
import { useState } from 'react';
import { LocationDialog } from '../components/locations/location-dialogs.tsx';
import { api, ApiError, type LocationRow } from '../lib/api.ts';
import { timezoneLabel } from '../lib/format.ts';
import { keys, queryClient, useActiveLocation } from '../lib/session.ts';
import { isVersionConflict, userActionMessage } from '../lib/users.ts';

// S-ADM-10 Sedes (Stitch: design/stitch/admin/S-ADM-10_sedes_y_kioscos). Se
// toma la cuadrícula de tarjetas: código en recuadro monoespaciado, chip
// «Seleccionada» y barra superior en la sede actual, nombre, zona horaria,
// dirección y teléfono, y el estado al pie. No se construye lo que el sistema
// no tiene: kioscos y «Vincular kiosco» (fase 3), «Sincronizar redes»,
// «HIPAA Verified Config», capacidad, VLAN, horarios, tráfico, «Sede
// operativa principal», «Próxima apertura» ni el aviso de despliegue.

const LOCATIONS_KEY = ['admin-locations'] as const;

type Dialogs = { kind: 'new' } | { kind: 'edit'; row: LocationRow } | { kind: 'deactivate'; row: LocationRow } | null;

export function AdminLocationsPage() {
  const locations = useQuery<LocationRow[], ApiError>({ queryKey: LOCATIONS_KEY, queryFn: api.adminLocations, staleTime: 0 });
  const active = useActiveLocation();
  const snackbar = useSnackbar();
  const [dialog, setDialog] = useState<Dialogs>(null);

  // Tras cada cambio: la lista y las sedes propias (el selector de la cabecera).
  const reload = async () => {
    await Promise.all([locations.refetch(), queryClient.invalidateQueries({ queryKey: keys.locations }), queryClient.invalidateQueries({ queryKey: keys.me })]);
  };
  const conflict = () => {
    setDialog(null);
    snackbar({ message: 'Este registro fue actualizado por otro usuario. Actualice para continuar.', action: { label: 'Actualizar', onClick: () => void reload() } });
  };
  const failed = (error: unknown) => {
    if (isVersionConflict(error)) conflict();
    else snackbar({ message: error instanceof ApiError && error.code === 'last_active_location' ? 'No se puede desactivar la única sede activa.' : userActionMessage(error) });
  };
  const activate = async (row: LocationRow) => {
    try {
      await api.setLocationActive(row.id, true, row.version);
      await reload();
    } catch (error) {
      failed(error);
    }
  };

  return (
    <section aria-labelledby="page-title" className="mx-auto flex w-full max-w-7xl flex-col gap-space-lg">
      <header className="flex flex-wrap items-end justify-between gap-space-md">
        <div className="flex min-w-0 flex-col gap-space-xs">
          <h1 id="page-title" className="text-display-md text-on-surface">
            Sedes
          </h1>
          <p className="text-body-lg text-on-surface-variant">Sedes de la clínica, su zona horaria y datos de contacto.</p>
        </div>
        <div className="flex items-center gap-space-sm">
          <Button variant="elevated" aria-label="Actualizar" title="Actualizar" className="px-3" onClick={() => void reload()}>
            <RefreshCw aria-hidden className="size-5" />
          </Button>
          <Button onClick={() => { setDialog({ kind: 'new' }); }}>
            <Plus aria-hidden className="size-5" /> Nueva sede
          </Button>
        </div>
      </header>

      <AsyncView
        source={locations}
        loading="skeleton"
        isEmpty={(rows) => rows.length === 0}
        empty={
          <EmptyState
            icon={Building2}
            title="Aún no hay sedes."
            description="Cree la primera."
            action={
              <Button onClick={() => { setDialog({ kind: 'new' }); }}>
                <Plus aria-hidden className="size-5" /> Nueva sede
              </Button>
            }
          />
        }
      >
        {(rows) => (
          <ul aria-label="Sedes" className="grid grid-cols-1 gap-space-md tab:grid-cols-2 desk:grid-cols-3">
            {rows.map((row) => (
              <LocationCard
                key={row.id}
                row={row}
                selected={row.id === active?.id}
                onEdit={() => { setDialog({ kind: 'edit', row }); }}
                onDeactivate={() => { setDialog({ kind: 'deactivate', row }); }}
                onActivate={() => void activate(row)}
              />
            ))}
          </ul>
        )}
      </AsyncView>

      {dialog?.kind === 'new' || dialog?.kind === 'edit' ? (
        <LocationDialog
          location={dialog.kind === 'edit' ? dialog.row : null}
          defaultTimezone={active?.timezone ?? 'America/Chicago'}
          onClose={() => { setDialog(null); }}
          onConflict={conflict}
          onSaved={() => {
            setDialog(null);
            void reload();
            snackbar({ message: 'Guardado.' });
          }}
        />
      ) : null}
      {dialog?.kind === 'deactivate' ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) setDialog(null); }}
          destructive
          icon={<Ban className="size-7" />}
          title={`¿Desactivar ${dialog.row.name}?`}
          description="El personal no podrá trabajar en esta sede hasta que se active de nuevo. El historial se conserva."
          confirmLabel="Desactivar"
          onConfirm={async () => {
            try {
              await api.setLocationActive(dialog.row.id, false, dialog.row.version);
              setDialog(null);
              await reload();
            } catch (error) {
              setDialog(null);
              failed(error);
            }
          }}
        />
      ) : null}
    </section>
  );
}

function LocationCard({
  row,
  selected,
  onEdit,
  onDeactivate,
  onActivate,
}: {
  row: LocationRow;
  selected: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
  onActivate: () => void;
}) {
  const label = timezoneLabel(row.timezone);
  return (
    <li
      className={cn(
        'relative flex flex-col gap-space-sm overflow-hidden rounded-lg p-space-md',
        row.active
          ? 'bg-surface-container-lowest shadow-level-1 dark:bg-surface-container-low'
          : // Inactiva: atenuada en los dos temas (fondo hundido y barra gris).
            'bg-surface-container-low/60 shadow-[inset_4px_0_0_var(--color-outline-variant)] dark:bg-surface-container-lowest',
        selected && 'shadow-level-2',
      )}
    >
      {selected ? <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-primary" /> : null}
      <div className="flex flex-wrap items-center gap-space-sm pt-1">
        <span
          className={cn(
            'rounded-sm px-2.5 py-1 font-mono text-code-md font-bold',
            row.active ? 'bg-surface-container-high text-primary dark:bg-surface-container-highest' : 'bg-surface-container text-on-surface-variant',
          )}
        >
          {row.code}
        </span>
        {selected ? <StatusChip tone="completed" icon={CircleCheck} label="Seleccionada" /> : null}
      </div>
      <h2 className={cn('truncate text-headline-sm', row.active ? 'text-on-surface' : 'text-on-surface-variant')}>{row.name}</h2>
      <p className="flex items-center gap-1 text-caption text-on-surface-variant">
        <Clock aria-hidden className="size-4 shrink-0 text-primary" />
        <span className="font-mono">{row.timezone}</span>
        {label !== row.timezone ? <span>· {label}</span> : null}
      </p>
      {/* Como en Stitch, sin dirección o sin teléfono la línea no aparece. */}
      {row.address || row.phone ? (
        <dl className="flex flex-col gap-1.5 text-body-md text-on-surface-variant">
          {row.address ? (
            <div className="flex items-start gap-space-xs">
              <dt className="pt-0.5">
                <MapPin aria-label="Dirección" className="size-4 text-outline" />
              </dt>
              <dd>{row.address}</dd>
            </div>
          ) : null}
          {row.phone ? (
            <div className="flex items-center gap-space-xs">
              <dt>
                <Phone aria-label="Teléfono" className="size-4 text-outline" />
              </dt>
              <dd>{row.phone}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <div className="mt-auto flex items-center justify-between gap-space-sm border-t border-surface-container pt-space-sm dark:border-surface-container-high">
        {row.active ? (
          <StatusChip tone="completed" icon={CircleCheck} label="Activo" />
        ) : (
          <StatusChip tone="departed" icon={CirclePause} label="Inactivo" />
        )}
        <span className="flex items-center gap-space-xs">
          <Button variant="text" className="px-3" onClick={onEdit} aria-label={`Editar ${row.name}`}>
            <Pencil aria-hidden className="size-4" /> Editar
          </Button>
          <DropdownMenu>
            <DropdownTrigger
              aria-label={`Más acciones para ${row.name}`}
              className="flex size-12 items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-container"
            >
              <MoreVertical aria-hidden className="size-5" />
            </DropdownTrigger>
            <DropdownContent>
              <DropdownItem onSelect={onEdit}>
                <Pencil aria-hidden className="size-5" /> Editar
              </DropdownItem>
              {row.active ? (
                <DropdownItem className="text-error" onSelect={onDeactivate}>
                  <Ban aria-hidden className="size-5" /> Desactivar
                </DropdownItem>
              ) : (
                <DropdownItem onSelect={onActivate}>
                  <Power aria-hidden className="size-5" /> Activar
                </DropdownItem>
              )}
            </DropdownContent>
          </DropdownMenu>
        </span>
      </div>
    </li>
  );
}
