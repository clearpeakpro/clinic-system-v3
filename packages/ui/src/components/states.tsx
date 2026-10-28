import { CloudOff, Inbox, Loader2, type LucideIcon, RefreshCw, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../cn.ts';
import { errorMessage } from '../errors.ts';
import { Button } from './button.tsx';

// S-GEN-28 Estados comunes de carga, vacío y error, con el aspecto de la hoja
// S-GEN-30 (sección 3). Decisión de T-005: esqueletos en tablas y listas,
// spinner en lo demás, y barra de 2 px mientras se refresca con datos.

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center p-space-xl text-primary">
      <Loader2 aria-hidden className="size-8 animate-spin motion-reduce:animate-none" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

const bar = 'rounded bg-outline-variant/40 animate-pulse motion-reduce:animate-none';

/** Esqueleto de tabla o lista: cabecera y filas con la misma altura que las reales. */
export function SkeletonRows({ rows = 3, label = 'Cargando…' }: { rows?: number; label?: string }) {
  return (
    <div role="status" className="flex flex-col gap-3 rounded-lg bg-surface-container-low p-space-sm dark:bg-surface-container">
      <span className="sr-only">{label}</span>
      <div aria-hidden className="flex items-center justify-between rounded bg-surface-container px-3 py-2 dark:bg-surface-container-high">
        <div className={cn(bar, 'h-4 w-24')} />
        <div className={cn(bar, 'h-4 w-36')} />
        <div className={cn(bar, 'h-4 w-16')} />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden className="flex items-center justify-between rounded bg-surface-container-lowest px-3 py-2.5 shadow-level-1 dark:bg-surface-container-high">
          <div className="flex items-center gap-2">
            <div className={cn(bar, 'size-7 rounded-full')} />
            <div className={cn(bar, 'h-4', i % 2 === 0 ? 'w-28' : 'w-32')} />
          </div>
          <div className={cn(bar, 'h-4 w-20')} />
          <div className={cn(bar, 'h-6 w-14 rounded-full')} />
        </div>
      ))}
    </div>
  );
}

/** Refrescando con datos: barra de 2 px arriba; el contenido no se reconstruye. */
export function RefreshBar({ label = 'Actualizando…' }: { label?: string }) {
  return (
    <div role="status" className="relative h-0.5 w-full overflow-hidden rounded-full bg-primary/15">
      <span className="sr-only">{label}</span>
      <div aria-hidden className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-primary animate-refresh motion-reduce:animate-none" />
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title = 'Aún no hay nada',
  description = 'No hay datos para mostrar.',
  action,
}: {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-surface-container-low p-space-xl text-center dark:bg-surface-container">
      <div className="mb-space-sm flex size-16 items-center justify-center rounded-full bg-surface-container text-primary dark:bg-surface-container-high">
        <Icon aria-hidden className="size-9" />
      </div>
      <h3 className="text-headline-sm text-on-surface">{title}</h3>
      <p className="mt-1 max-w-sm text-body-md text-on-surface-variant">{description}</p>
      {action ? <div className="mt-space-md">{action}</div> : null}
    </div>
  );
}

/** Error sin datos: «Algo salió mal», el mensaje y «Reintentar». */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-lg bg-error-container/30 p-space-xl text-center">
      <div className="mb-space-sm flex size-16 items-center justify-center rounded-full bg-error-container text-error">
        <CloudOff aria-hidden className="size-9" />
      </div>
      <h3 className="text-headline-sm text-on-surface">Algo salió mal</h3>
      <p className="mt-1 max-w-sm text-body-md text-on-surface-variant">{errorMessage(error)}</p>
      <Button className="mt-space-md" onClick={onRetry}>
        <RefreshCw aria-hidden className="size-5" /> Reintentar
      </Button>
    </div>
  );
}

/** Error con datos previos: banner rojo compacto arriba; los datos siguen visibles debajo. */
export function StaleDataBanner({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-space-sm rounded-md bg-error px-space-md py-space-xs text-on-error">
      <p className="flex items-center gap-space-xs text-body-md-medium">
        <TriangleAlert aria-hidden className="size-5 shrink-0" />
        {errorMessage(error)}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-touch shrink-0 rounded-md bg-on-error px-space-md text-body-md-medium text-error hover:bg-on-error/90"
      >
        Reintentar
      </button>
    </div>
  );
}

/** Lo que AsyncView necesita de una consulta (encaja con TanStack Query). */
export interface AsyncSource<T> {
  data: T | undefined;
  error: unknown;
  isFetching: boolean;
  refetch: () => unknown;
}

/**
 * Elige el estado según la consulta: cargando (esqueleto o spinner), error sin
 * datos, vacío o los datos; con datos, el refresco y el error se muestran
 * arriba sin desmontar el contenido (conserva scroll y formularios).
 */
export function AsyncView<T>({
  source,
  loading = 'spinner',
  isEmpty,
  empty,
  children,
}: {
  source: AsyncSource<T>;
  loading?: 'spinner' | 'skeleton';
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  const retry = () => void source.refetch();
  if (source.data === undefined) {
    if (source.error) return <ErrorState error={source.error} onRetry={retry} />;
    return loading === 'skeleton' ? <SkeletonRows /> : <Spinner />;
  }
  const data = source.data;
  return (
    <div className="flex flex-col gap-space-sm">
      {source.error ? <StaleDataBanner error={source.error} onRetry={retry} /> : source.isFetching ? <RefreshBar /> : null}
      {isEmpty?.(data) ? (empty ?? <EmptyState />) : children(data)}
    </div>
  );
}
