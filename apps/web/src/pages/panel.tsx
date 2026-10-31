import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { useActiveLocation } from '../lib/session.ts';

// S-REC-01 Panel. Por ahora solo el encabezado: el título y el subtítulo
// «{sede} · N citas hoy» (Stitch: «Lancaster · 18 citas hoy»), con datos
// reales desde T-014. Cuenta las citas de hoy en la sede menos Canceladas y
// No se presentó; lo calcula el servidor. Las métricas, los filtros y la
// lista en vivo llegan en la fase 3.

/** «Sin citas hoy», «1 cita hoy» o «{n} citas hoy» (manual, S-REC-01). */
export function todayText(count: number): string {
  if (count === 0) return 'Sin citas hoy';
  return count === 1 ? '1 cita hoy' : `${String(count)} citas hoy`;
}

export function PanelPage({ sede }: { sede: string }) {
  const active = useActiveLocation();
  const ready = active?.code === sede;
  const today = useQuery({
    queryKey: ['today-count', active?.id],
    queryFn: api.todayAppointmentCount,
    enabled: ready,
  });
  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-space-sm">
      <h1 id="page-title" className="text-headline-lg text-on-surface">
        Panel
      </h1>
      {ready ? (
        <p className="text-body-lg text-on-surface-variant" data-testid="panel-subtitle">
          {active.name}
          {today.data ? ` · ${todayText(today.data.count)}` : ''}
        </p>
      ) : null}
    </section>
  );
}
