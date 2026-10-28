import { cn } from '@clinic/ui';

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('fill-current', className)}>
      <path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z" />
    </svg>
  );
}

/** Cuadro del logo (Stitch: 32 px, radio de componente, fondo primary). */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-on-primary', className)}>
      <BrandMark className="size-5" />
    </span>
  );
}

/**
 * Marca. `bar`: barra superior de las pantallas de acceso (S-GEN-03/06/11).
 * `nav`: cabecera del menú lateral (S-GEN-12), con la línea «Gestión clínica».
 */
export function Brand({ variant = 'bar' }: { variant?: 'bar' | 'nav' }) {
  if (variant === 'nav') {
    return (
      <div className="flex items-center gap-space-sm">
        <BrandLogo />
        <div className="flex flex-col">
          <span className="text-headline-sm tracking-tight text-primary">Clinic System</span>
          <span className="text-caption text-on-surface-variant">Gestión clínica</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-space-sm">
      <BrandLogo />
      <span className="text-headline-sm tracking-tight text-on-surface">Clinic System</span>
    </div>
  );
}
