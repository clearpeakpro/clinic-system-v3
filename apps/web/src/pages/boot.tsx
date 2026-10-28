import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Spinner } from '@clinic/ui';
import { api, ApiError, type Me } from '../lib/api.ts';
import { landingPath } from '../lib/nav.ts';
import { flatten, keys, queryClient } from '../lib/session.ts';
import { prefs } from '../lib/storage.ts';

/**
 * S-GEN-01 Arranque: pantalla neutra con un indicador mientras se decide el
 * destino. No muestra el marco ni datos.
 */
export function BootPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const go = (to: string) => {
      if (!cancelled) void navigate({ to, replace: true });
    };
    void (async () => {
      const session = await api.session().catch(() => null);
      if (!session) {
        go('/login');
        return;
      }
      let me: Me;
      try {
        me = await queryClient.query({ queryKey: keys.me, queryFn: api.me, staleTime: 0 });
      } catch (error) {
        if (error instanceof ApiError && error.code === 'mfa_enrollment_required') {
          return void navigate({ to: '/login', search: { paso: 'inscripcion' }, replace: true });
        }
        return void navigate({ to: '/login', search: { motivo: 'cerrada' }, replace: true });
      }
      const locations = flatten(await queryClient.query({ queryKey: keys.locations, queryFn: api.locations }));
      let active = me.context ? locations.find((l) => l.id === me.context?.locationId) : undefined;
      if (!active) {
        // Una sola sede: se elige sola. Varias: la recordada, si sigue asignada.
        const remembered = locations.find((l) => l.id === prefs.lastLocationId());
        const pick = locations.length === 1 ? locations[0] : remembered;
        if (!pick) {
          go('/seleccionar-sede');
          return;
        }
        await api.selectContext(pick.organizationId, pick.id);
        me = await queryClient.query({ queryKey: keys.me, queryFn: api.me, staleTime: 0 });
        active = pick;
      }
      prefs.setLastLocationId(active.id);
      go(landingPath(me.permissions, active.code));
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex h-full items-center justify-center bg-background">
      <Spinner />
    </div>
  );
}
