import { QueryClient, useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { api, ApiError, type LocationChoice, type Me, type NotificationsList } from './api.ts';
import { agendaPrefs } from './appointments.ts';
import { patientSearch } from './patients.ts';
import { RealtimeClient, type LiveState, type ScreenEvent } from './realtime.ts';

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

/** Ráfagas de eventos en vivo: una sola relectura cada 500 ms (S-REC-01). */
export const EVENT_BATCH_MS = 500;

/**
 * Eventos de pantalla de la sede activa (el servidor solo envía los de esa
 * sede). `appointment.changed` (T-015): se relee la agenda de todos los días,
 * el detalle de esa cita (y su registro de llegada, T-017), «N citas hoy» del
 * Panel y las citas del perfil. `encounter.changed` (T-017): esa visita. Los
 * mensajes solo traen ids y estado: los datos se vuelven a pedir por HTTP.
 */
export function createEventBatcher(invalidate: (queryKey: readonly unknown[]) => void, delay = EVENT_BATCH_MS) {
  let pending: { appointments: Set<string>; encounters: Set<string> } | null = null;
  return (event: ScreenEvent) => {
    if (event.name !== 'appointment.changed' && event.name !== 'encounter.changed') return;
    const first = pending === null;
    pending ??= { appointments: new Set(), encounters: new Set() };
    if (event.name === 'appointment.changed' && event.ids.appointment) pending.appointments.add(event.ids.appointment);
    if (event.name === 'encounter.changed' && event.ids.encounter) pending.encounters.add(event.ids.encounter);
    if (!first) return;
    setTimeout(() => {
      const ids = pending ?? { appointments: new Set<string>(), encounters: new Set<string>() };
      pending = null;
      if (ids.appointments.size > 0) {
        invalidate(['agenda']);
        invalidate(['today-count']);
        invalidate(['patient-appointments']);
      }
      for (const appointmentId of ids.appointments) {
        invalidate(['appointment', appointmentId]);
        invalidate(['arrival', 'appointment', appointmentId]);
      }
      // T-018: también la pestaña Visitas y «Última visita» del perfil (S-PAC-08).
      if (ids.encounters.size > 0) invalidate(['patient-encounters']);
      for (const encounterId of ids.encounters) invalidate(['encounter', encounterId]);
    }, delay);
  };
}

/** Conexión en vivo de la pestaña (T-009). */
export const realtime = new RealtimeClient({
  resync: () => void queryClient.invalidateQueries({ refetchType: 'active' }),
  sessionChanged: () => void queryClient.invalidateQueries({ queryKey: keys.me }),
  notifications: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  event: createEventBatcher((queryKey) => void queryClient.invalidateQueries({ queryKey })),
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
