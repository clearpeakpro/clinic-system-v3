import { QueryClient, useQuery } from '@tanstack/react-query';
import { api, ApiError, type LocationChoice, type Me } from './api.ts';

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

export const keys = { me: ['me'] as const, locations: ['locations'] as const };

export const useMe = () => useQuery<Me, ApiError>({ queryKey: keys.me, queryFn: api.me });
export const useLocations = () => useQuery<LocationChoice[], ApiError>({ queryKey: keys.locations, queryFn: api.locations });

export interface FlatLocation {
  organizationId: string;
  organizationName: string;
  id: string;
  code: string;
  name: string;
  timezone: string;
}

export function flatten(choices: LocationChoice[]): FlatLocation[] {
  return choices.flatMap((o) =>
    o.locations.map((l) => ({ organizationId: o.organizationId, organizationName: o.organizationName, ...l })),
  );
}

/** Cierre de sesión: el servidor primero; después se borra todo lo que hay en memoria. */
export async function endSession(kind: 'voluntary' | 'everywhere' | 'idle'): Promise<void> {
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
  }
}
