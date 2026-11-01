import type { EncounterSummary } from '@clinic/shared';
import { AsyncView, CodeText, EmptyState, RouteBadge, VisitStatusChip } from '@clinic/ui';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Hash } from 'lucide-react';
import { api, type ApiError } from '../lib/api.ts';
import { useActiveLocation } from '../lib/session.ts';

// /app/<SEDE>/visitas/<id>: versión mínima hasta T-018 (S-CLI-04). Código,
// estado y ruta de la visita de la sede activa; se actualiza en vivo
// (encounter.changed). El servidor audita cada lectura.

export function EncounterPage({ sede, encounterId }: { sede: string; encounterId: string }) {
  const active = useActiveLocation();
  const encounter = useQuery<EncounterSummary, ApiError>({
    queryKey: ['encounter', encounterId],
    queryFn: () => api.encounter(encounterId),
    enabled: active?.code === sede,
    staleTime: 0,
    gcTime: 0,
    retry: (failures: number, error: ApiError) => error.status >= 500 && failures < 2,
  });
  return (
    <section aria-labelledby="page-title" className="mx-auto flex w-full max-w-4xl flex-col gap-space-lg">
      <h1 id="page-title" className="text-headline-lg text-on-surface">
        Visita
      </h1>
      <AsyncView source={encounter}>
        {(e) => (
          <div className="flex flex-col gap-space-md">
            <div className="flex flex-wrap items-center gap-space-sm">
              <CodeText code={e.code} variant="block" label="Código de la visita" icon={Hash} copyable className="min-w-0 flex-1" />
              <VisitStatusChip status={e.status} />
              <RouteBadge route={e.route} />
            </div>
            <EmptyState icon={ClipboardList} title="Visita abierta" description="La pantalla de la visita llega en T-018." />
          </div>
        )}
      </AsyncView>
    </section>
  );
}
