import type { ReactNode } from 'react';
import { cn } from '@clinic/ui';
import { APP_VERSION } from '../lib/format.ts';
import { Brand } from './brand.tsx';

// Pantallas de acceso (S-GEN-03, 06, 07, 08, 11), como en Stitch: barra con la
// marca (sin selector de idioma), fondo con degradado suave y pie discreto.

export function AuthLayout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="relative isolate flex min-h-full flex-col overflow-x-hidden bg-surface">
      {/* Degradado ambiental de Stitch: dos manchas difuminadas, sin contenido. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -left-16 -z-10 size-96 rounded-full bg-primary-fixed/40 blur-3xl dark:bg-primary/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -bottom-20 -z-10 size-[28rem] rounded-full bg-secondary-fixed/30 blur-3xl dark:bg-secondary/10"
      />
      <header className="mx-auto flex w-full max-w-7xl items-center px-margin pt-margin">
        <Brand />
      </header>
      <main className={cn('flex w-full flex-1 flex-col items-center justify-center px-margin py-space-xl', wide && 'mx-auto max-w-7xl')}>
        {children}
      </main>
      <footer className="px-margin pb-margin text-center text-caption text-on-surface-variant">
        © 2026 Clinic System · {APP_VERSION}
      </footer>
    </div>
  );
}

/** Tarjeta sin borde con sombra suave. 460 px (inicio de sesión) o 520 px (MFA). */
export function AuthCard({ children, size = 'md' }: { children: ReactNode; size?: 'md' | 'lg' }) {
  return (
    <section
      className={cn(
        'w-full rounded-lg bg-surface-container-lowest p-6 shadow-level-2 sm:p-10 dark:bg-surface-container-low',
        size === 'md' ? 'max-w-[460px]' : 'max-w-[520px]',
      )}
    >
      {children}
    </section>
  );
}

/**
 * Encabezado de la tarjeta con el icono en un halo claro. `brand`: logo dentro
 * de un cuadro (S-GEN-03); `round`: icono en un círculo (S-GEN-06).
 */
export function AuthHeader({
  icon,
  halo = 'round',
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  halo?: 'brand' | 'round';
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-space-lg flex flex-col items-center text-center">
      {halo === 'brand' ? (
        <div className="mb-space-md flex size-14 items-center justify-center rounded-lg bg-surface-container-low shadow-level-1 dark:bg-surface-container-high">
          <span className="flex size-10 items-center justify-center rounded-md bg-primary text-on-primary">{icon}</span>
        </div>
      ) : (
        <div className="mb-space-lg flex size-16 items-center justify-center rounded-full bg-surface-container-low text-primary shadow-level-1 dark:bg-surface-container-high">
          {icon}
        </div>
      )}
      <h1 className="mb-space-xs text-headline-lg tracking-tight text-on-surface">{title}</h1>
      <p className={cn('text-on-surface-variant', halo === 'brand' ? 'max-w-xs text-body-md' : 'max-w-sm text-body-lg')}>{subtitle}</p>
      {children}
    </div>
  );
}
