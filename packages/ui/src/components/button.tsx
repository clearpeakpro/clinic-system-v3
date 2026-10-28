import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../cn.ts';

// Botones (hoja S-GEN-30, sección 4): alto 48 px (objetivo táctil), radio de
// componente (8 px), texto de 16 px (T-004). Decisiones de T-005: principal
// #005C55, tonal menta, contorno blanco con borde, destructivo rojo sólido.
const button = cva(
  'inline-flex min-h-touch items-center justify-center gap-space-sm rounded-md px-5 text-body-lg-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary shadow-level-1 hover:bg-primary/90',
        tonal: 'bg-surface-container text-primary hover:bg-surface-container-high dark:bg-surface-container-high dark:hover:bg-surface-container-highest',
        outline: 'border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low',
        // Secundario de Stitch: superficie clara con sombra, sin borde.
        elevated: 'bg-surface-container-lowest text-on-surface shadow-level-1 hover:bg-surface-container dark:bg-surface-container-high',
        text: 'text-primary hover:bg-surface-container',
        destructive: 'bg-error text-on-error shadow-level-1 hover:bg-error/90',
      },
      size: { default: '', block: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  asChild?: boolean;
  loading?: boolean;
  /** Texto mientras carga («Guardando…»); si falta, se mantiene el texto del botón. */
  loadingText?: ReactNode;
}

export function Button({ className, variant, size, asChild, loading, loadingText, children, disabled, ...props }: ButtonProps) {
  if (asChild) {
    // Slot exige un único hijo (p. ej. un <Link>): sin indicador de carga.
    return (
      <Slot className={cn(button({ variant, size }), className)} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <button
      className={cn(button({ variant, size }), loading && 'disabled:opacity-80', className)}
      disabled={disabled ?? loading}
      aria-busy={loading}
      {...props}
    >
      {loading ? <Loader2 aria-hidden className="size-5 animate-spin" /> : null}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}
