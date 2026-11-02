import type { ReactNode } from 'react';

// Tarjeta de sección de la pantalla de la visita (S-CLI-04, Stitch): icono en
// un cuadro, título, una insignia opcional y la acción a la derecha. El `id`
// permite el enlace profundo `?section=` (orders, nursing, billing).

export function SectionCard({
  id,
  icon,
  title,
  subtitle,
  badge,
  action,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={`section-${id}`}
      aria-labelledby={`section-${id}-title`}
      className="flex scroll-mt-space-lg flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-lg shadow-level-1 dark:bg-surface-container-low"
    >
      <div className="flex flex-wrap items-start justify-between gap-space-sm">
        <div className="flex min-w-0 items-start gap-space-sm">
          <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-md bg-surface-container text-primary dark:bg-surface-container-high">
            {icon}
          </span>
          <div className="flex min-w-0 flex-col">
            <h2 id={`section-${id}-title`} className="flex flex-wrap items-center gap-space-sm text-headline-sm text-on-surface">
              {title} {badge}
            </h2>
            {subtitle ? <p className="text-body-md text-on-surface-variant">{subtitle}</p> : null}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
