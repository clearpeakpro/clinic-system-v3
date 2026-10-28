import { useNavigate } from '@tanstack/react-router';
import { Check, LogOut, MapPinOff } from 'lucide-react';
import { useState } from 'react';
import { Brand } from '../components/brand.tsx';
import { LogoutDialog } from '../components/logout-dialog.tsx';
import { Button } from '../components/ui/button.tsx';
import { Banner, Spinner } from '../components/ui/field.tsx';
import { api } from '../lib/api.ts';
import { landingPath } from '../lib/nav.ts';
import { flatten, keys, queryClient, useLocations, useMe, type FlatLocation } from '../lib/session.ts';
import { prefs } from '../lib/storage.ts';

/** S-GEN-11 Seleccionar sede. Sin menú de cuenta: solo cerrar sesión. */
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

  const list = locations.data ? flatten(locations.data) : [];
  const multiOrg = new Set(list.map((l) => l.organizationId)).size > 1;

  return (
    <div className="flex min-h-full flex-col bg-background">
      <header className="flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-margin py-space-sm">
        <div className="flex items-center gap-space-md">
          <Brand compact />
          <h1 className="text-headline-md text-on-surface">Seleccionar sede</h1>
        </div>
        <Button variant="text" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={() => { setLogout(true); }}>
          <LogOut aria-hidden className="size-5" />
        </Button>
      </header>
      <main className="mx-auto w-full max-w-5xl px-margin py-space-xl">
        <p className="mb-space-lg text-body-lg text-on-surface-variant">Elija dónde trabaja hoy.</p>
        {error ? <Banner tone="error" title="No se pudo elegir la sede. Inténtelo de nuevo." /> : null}
        {locations.isPending ? <Spinner /> : null}
        {locations.isError ? (
          <div className="flex flex-col items-start gap-space-md">
            <Banner tone="error" title="Algo salió mal">No se pudieron cargar sus sedes.</Banner>
            <Button variant="outline" onClick={() => void locations.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : null}
        {locations.isSuccess && list.length === 0 ? (
          <div className="flex flex-col items-center gap-space-sm py-space-xl text-center">
            <MapPinOff aria-hidden className="size-10 text-on-surface-variant" />
            <p className="text-headline-sm text-on-surface">Sin sedes asignadas</p>
            <p className="text-body-md text-on-surface-variant">
              Su cuenta no tiene ninguna sede activa. Pida a un administrador que le asigne una.
            </p>
          </div>
        ) : null}
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,360px))] gap-space-md">
          {list.map((location) => {
            const active = me.data?.context?.locationId === location.id;
            return (
              <li key={location.id}>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void choose(location)}
                  className={`flex w-full items-center gap-space-md rounded-lg border bg-surface-container-lowest p-space-md text-left shadow-level-1 hover:bg-surface-container-low ${active ? 'border-2 border-primary' : 'border-outline-variant'}`}
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-primary-fixed font-mono text-code-md text-on-primary-fixed">
                    {location.code}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body-lg-medium text-on-surface">{location.name}</span>
                    {multiOrg ? <span className="truncate text-body-md text-on-surface-variant">{location.organizationName}</span> : null}
                    <span className="text-caption text-on-surface-variant">Zona horaria: {location.timezone}</span>
                  </span>
                  {active ? <Check aria-label="Actual" className="size-5 text-primary" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </main>
      <LogoutDialog open={logout} onOpenChange={setLogout} variant="simple" />
    </div>
  );
}
