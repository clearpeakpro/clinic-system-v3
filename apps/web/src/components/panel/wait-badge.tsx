import { WAIT_LEVEL_LABELS, type WaitLevel } from '@clinic/shared';
import { cn } from '@clinic/ui';
import { OctagonAlert, TriangleAlert } from 'lucide-react';

// Marca de espera (ADR 0039): icono + texto + color, nunca solo color.
// «Alerta» en ámbar con triángulo; «Crítico» en rojo con octógono.

const STYLE = {
  alert: { icon: TriangleAlert, className: 'border-status-waiting-border bg-status-waiting-container text-status-waiting' },
  critical: { icon: OctagonAlert, className: 'border-error/40 bg-error-container text-on-error-container' },
} as const;

/** `detail`: texto para lectores de pantalla (p. ej. «12 min en Esperando proveedor»). */
export function WaitBadge({ level, detail, className }: { level: WaitLevel; detail?: string; className?: string }) {
  if (level === 'none') return null;
  const { icon: Icon, className: tone } = STYLE[level];
  return (
    <span
      data-wait-level={level}
      title={detail}
      className={cn('inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-caption font-semibold whitespace-nowrap', tone, className)}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {WAIT_LEVEL_LABELS[level]}
      {detail ? <span className="sr-only">: {detail}</span> : null}
    </span>
  );
}
