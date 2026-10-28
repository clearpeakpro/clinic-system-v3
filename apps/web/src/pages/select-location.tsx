import { useNavigate } from '@tanstack/react-router';
import { ArrowLeftRight, ArrowRight, Building2, CircleCheck, CircleHelp, Clock, LogOut, MapPin, MapPinOff } from 'lucide-react';
import { useId, useState } from 'react';
import { AuthLayout } from '../components/auth-layout.tsx';
import { LogoutDialog } from '../components/logout-dialog.tsx';
import { Button } from '../components/ui/button.tsx';
import { Banner, Spinner } from '../components/ui/field.tsx';
import { api, type LocationChoice } from '../lib/api.ts';
import { cn } from '../lib/cn.ts';
import { timezoneLabel } from '../lib/format.ts';
import { landingPath } from '../lib/nav.ts';
import { keys, queryClient, useLocations, useMe, type FlatLocation } from '../lib/session.ts';
import { prefs } from '../lib/storage.ts';

/**
 * S-GEN-11 Seleccionar sede. Sin menú de cuenta: solo cerrar sesión. Sedes
 * agrupadas por organización; solo los datos que el sistema tiene (código,
 * nombre, zona horaria y dirección).
 */
export function SelectLocationPage() {
  const navigate = useNavigate();
  const me = useMe();
  const locations = useLocations();
  const [logout, setLogout] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const choose = async (location: FlatLocation) => {
    setBusyId(location.id);
    setError(false);
    try {
      await api.selectContext(location.organizationId, location.id);
      prefs.setLastLocationId(location.id);
      const fresh = await queryClient.query({ queryKey: keys.me, queryFn: api.me, staleTime: 0 });
      await navigate({ to: landingPath(fresh.permissions, location.code) });
    } catch {
      setError(true);
      setBusyId(null);
    }
  };

  const groups = (locations.data ?? []).filter((g) => g.locations.length > 0);
  const currentId = me.data?.context?.locationId ?? null;

  return (
    <AuthLayout wide>
      <div className="flex w-full flex-col">
        <section className="flex flex-col items-start justify-between gap-space-md pb-space-lg tab:flex-row tab:items-center">
          <div className="flex min-w-0 flex-col gap-space-xs">
            {me.data ? (
              <p className="inline-flex max-w-full flex-wrap items-center gap-x-space-xs self-start rounded-full bg-surface-container-high px-space-sm py-1 text-caption text-on-surface-variant">
                <span aria-hidden className="size-2 rounded-full bg-primary" />
                <span>Sesión activa:</span>
                <span className="font-semibold text-on-surface">{me.data.name}</span>
                <span className="truncate font-mono text-code-sm">({me.data.email})</span>
              </p>
            ) : null}
            <div className="flex flex-col pt-space-xs">
              <h1 className="text-display-md text-on-surface">Seleccionar sede</h1>
              <p className="text-body-lg text-on-surface-variant">Elija dónde trabaja hoy.</p>
            </div>
          </div>
          <Button variant="elevated" className="self-end text-body-md-medium text-on-surface-variant tab:self-auto" onClick={() => { setLogout(true); }}>
            <LogOut aria-hidden className="size-5" /> Cerrar sesión
          </Button>
        </section>

        {error ? (
          <div className="mb-space-lg">
            <Banner tone="error" title="No se pudo elegir la sede. Inténtelo de nuevo." />
          </div>
        ) : null}
        {locations.isPending ? <Spinner /> : null}
        {locations.isError ? (
          <div className="flex flex-col items-start gap-space-md">
            <Banner tone="error" title="Algo salió mal">No se pudieron cargar sus sedes.</Banner>
            <Button variant="outline" onClick={() => void locations.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : null}
        {locations.isSuccess && groups.length === 0 ? (
          <div className="flex flex-col items-center gap-space-sm py-space-xl text-center">
            <MapPinOff aria-hidden className="size-10 text-on-surface-variant" />
            <p className="text-headline-sm text-on-surface">Sin sedes asignadas</p>
            <p className="text-body-md text-on-surface-variant">
              Su cuenta no tiene ninguna sede activa. Pida a un administrador que le asigne una.
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-space-xl">
          {groups.map((group) => (
            <OrganizationGroup
              key={group.organizationId}
              group={group}
              currentId={currentId}
              busy={busyId !== null}
              busyId={busyId}
              onChoose={(l) => void choose(l)}
            />
          ))}
        </div>

        {locations.isSuccess ? <MissingLocationHelp /> : null}
      </div>
      <LogoutDialog open={logout} onOpenChange={setLogout} variant="simple" />
    </AuthLayout>
  );
}

function OrganizationGroup({
  group,
  currentId,
  busy,
  busyId,
  onChoose,
}: {
  group: LocationChoice;
  currentId: string | null;
  busy: boolean;
  busyId: string | null;
  onChoose: (location: FlatLocation) => void;
}) {
  const titleId = useId();
  const count = group.locations.length;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-space-lg">
      <div className="flex items-center gap-space-md rounded-lg bg-surface-container-low p-space-md dark:bg-surface-container">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-surface-container-lowest text-primary shadow-level-1 dark:bg-surface-container-high">
          <Building2 aria-hidden className="size-6" />
        </span>
        <div className="min-w-0">
          <h2 id={titleId} className="text-headline-sm text-on-surface">
            {group.organizationName}
          </h2>
          <p className="text-caption text-on-surface-variant">{count === 1 ? '1 sede' : `${String(count)} sedes`}</p>
        </div>
      </div>
      <ul className="grid grid-cols-1 items-stretch gap-space-lg tab:grid-cols-2 desk:grid-cols-3">
        {group.locations.map((l) => {
          const location: FlatLocation = { ...l, organizationId: group.organizationId, organizationName: group.organizationName };
          return (
            <li key={l.id} className="flex">
              <LocationCard
                location={location}
                current={l.id === currentId}
                anyCurrent={currentId !== null}
                disabled={busy}
                loading={busyId === l.id}
                onChoose={() => { onChoose(location); }}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LocationCard({
  location,
  current,
  anyCurrent,
  disabled,
  loading,
  onChoose,
}: {
  location: FlatLocation;
  current: boolean;
  anyCurrent: boolean;
  disabled: boolean;
  loading: boolean;
  onChoose: () => void;
}) {
  // La sede actual continúa; las demás «cambian». Sin sede actual (recién
  // iniciada la sesión) cada tarjeta ofrece continuar en esa sede.
  const switching = anyCurrent && !current;
  const label = switching ? 'Cambiar a esta sede' : `Continuar en ${location.name}`;
  return (
    <article
      className={cn(
        'relative flex w-full flex-col justify-between rounded-lg bg-surface-container-lowest p-space-lg dark:bg-surface-container-low',
        current ? 'shadow-level-2 ring-[3px] ring-primary' : 'shadow-level-1',
      )}
    >
      {current ? (
        <span className="absolute -top-3 -right-2 flex h-8 items-center gap-1 rounded-full bg-primary px-space-sm text-caption font-semibold text-on-primary shadow-level-1">
          <CircleCheck aria-hidden className="size-4" /> Actual
        </span>
      ) : null}
      <div>
        <div className="mb-space-md flex items-start gap-space-md">
          <span
            className={cn(
              'flex size-14 shrink-0 items-center justify-center rounded-md font-mono text-code-md font-bold',
              current ? 'bg-primary-fixed text-on-primary-fixed' : 'bg-surface-container-highest text-on-surface',
            )}
          >
            {location.code}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-headline-lg text-on-surface" title={location.name}>
              {location.name}
            </h3>
            <p className="mt-1 flex items-center gap-1 text-caption text-on-surface-variant">
              <Clock aria-hidden className="size-4" /> Zona horaria: {timezoneLabel(location.timezone)}
            </p>
          </div>
        </div>
        {location.address ? (
          <p className="mb-space-md flex items-start gap-space-xs rounded-md bg-surface-container-low p-space-sm text-body-md text-on-surface-variant dark:bg-surface-container">
            <MapPin aria-hidden className="mt-0.5 size-[18px] shrink-0 text-outline" />
            {location.address}
          </p>
        ) : null}
      </div>
      <Button
        size="block"
        variant={current ? 'primary' : switching ? 'elevated' : 'primary'}
        className="mt-space-md"
        disabled={disabled}
        loading={loading}
        // El nombre accesible incluye la sede: varias tarjetas dicen «Cambiar a esta sede».
        aria-label={switching ? `${label}: ${location.name} (${location.code})` : `${label} (${location.code})`}
        onClick={onChoose}
      >
        {switching && !loading ? <ArrowLeftRight aria-hidden className="size-5 text-primary" /> : null}
        {label}
        {!switching && !loading ? <ArrowRight aria-hidden className="size-5" /> : null}
      </Button>
    </article>
  );
}

function MissingLocationHelp() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="mt-space-xl flex flex-col items-end gap-space-xs text-right">
      <Button
        variant="text"
        className="text-body-md"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => { setOpen(!open); }}
      >
        <CircleHelp aria-hidden className="size-[18px]" /> ¿No ve su sede asignada?
      </Button>
      <p id={id} hidden={!open} className="text-body-md text-on-surface-variant">
        Pida a un administrador de su clínica que le asigne la sede.
      </p>
    </div>
  );
}
