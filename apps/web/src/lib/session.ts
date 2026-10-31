import { QueryClient, useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { api, ApiError, type LocationChoice, type Me, type NotificationsList } from './api.ts';
import { agendaPrefs } from './appointments.ts';
import { patientSearch } from './patients.ts';
import { RealtimeClient, type LiveState } from './realtime.ts';

// Estado de sesión en memoria (TanStack Query). Sin persistencia: al cerrar
// sesión se borra todo (S-GEN-17, S-GEN-20).

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failures, error) => !(error instanceof ApiError && error.status < 500) && failures < 2,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

export const keys = {
  me: ['me'] as const,
  locations: ['locations'] as const,
  /** Por organización: la bandeja es de la organización activa. */
  notifications: (organizationId: string) => ['notifications', organizationId] as const,
};

export const useMe = () => useQuery<Me, ApiError>({ queryKey: keys.me, queryFn: api.me });
export const useLocations = () => useQuery<LocationChoice[], ApiError>({ queryKey: keys.locations, queryFn: api.locations });
export const useNotifications = (organizationId: string) =>
  useQuery<NotificationsList, ApiError>({ queryKey: keys.notifications(organizationId), queryFn: api.notifications });

/** Conexión en vivo de la pestaña (T-009). */
export const realtime = new RealtimeClient({
  resync: () => void queryClient.invalidateQueries({ refetchType: 'active' }),
  sessionChanged: () => void queryClient.invalidateQueries({ queryKey: keys.me }),
  notifications: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
});

export function useLiveState(): LiveState {
  return useSyncExternalStore(realtime.subscribe, realtime.getState);
}

export interface FlatLocation {
  organizationId: string;
  organizationName: string;
  id: string;
  code: string;
  name: string;
  timezone: string;
  address: string | null;
}

export function flatten(choices: LocationChoice[]): FlatLocation[] {
  return choices.flatMap((o) =>
    o.locations.map((l) => ({ organizationId: o.organizationId, organizationName: o.organizationName, ...l })),
  );
}

/** Cierre de sesión: el servidor primero; después se borra todo lo que hay en memoria. */
export async function endSession(kind: 'voluntary' | 'everywhere' | 'idle'): Promise<void> {
  realtime.stop();
  try {
    if (kind === 'idle') {
      // Registro del motivo (máx. 5 s, S-GEN-20); el cierre sigue aunque falle.
      await Promise.race([api.idleLogout(), new Promise((resolve) => setTimeout(resolve, 5000))]).catch(() => undefined);
    }
    if (kind === 'everywhere') await api.signOutEverywhere();
    await api.signOut();
  } catch {
    // Si el servidor no responde, la sesión vence sola (límite + 2 min).
  } finally {
    queryClient.clear();
    // La búsqueda de pacientes (T-012) vive en memoria fuera de la caché.
    patientSearch.submit(null);
    agendaPrefs.reset();
  }
}

/** Sede activa (la del contexto de la sesión), para su zona horaria. */
export function useActiveLocation(): FlatLocation | undefined {
  const me = useMe();
  const locations = useLocations();
  const context = me.data?.context;
  if (!context || !locations.data) return undefined;
  return flatten(locations.data).find((l) => l.organizationId === context.organizationId && l.id === context.locationId);
}
