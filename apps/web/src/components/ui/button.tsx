import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.ts';

// Botones (DESIGN.md, «Buttons»): alto 48 px (objetivo táctil), radio de
// componente (8 px), texto body-lg-medium.
const button = cva(
  'inline-flex min-h-touch items-center justify-center gap-space-sm rounded-md px-5 text-body-lg-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary hover:bg-primary/90 shadow-level-1',
        tonal: 'bg-secondary-fixed text-on-secondary-fixed hover:bg-secondary-fixed-dim',
        outline: 'border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low',
        text: 'text-primary hover:bg-primary/10',
        destructive: 'border border-error bg-error-container text-on-error-container hover:bg-error-container/80',
      },
      size: { default: '', block: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  asChild?: boolean;
  loading?: boolean;
}

export function Button({ className, variant, size, asChild, loading, children, disabled, ...props }: ButtonProps) {
  if (asChild) {
    // Slot exige un único hijo (p. ej. un <Link>): sin indicador de carga.
    return (
      <Slot className={cn(button({ variant, size }), className)} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <button className={cn(button({ variant, size }), className)} disabled={disabled ?? loading} aria-busy={loading} {...props}>
      {loading ? <Loader2 aria-hidden className="size-5 animate-spin" /> : null}
      {children}
    </button>
  );
}
