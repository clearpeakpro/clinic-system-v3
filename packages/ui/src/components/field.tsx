import { CircleAlert, Info } from 'lucide-react';
import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../cn.ts';

// Campos rellenos como en Stitch: fondo menta sin borde; al enfocar, fondo
// claro y anillo primary. Alto 48 px, radio de componente (8 px).

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
  icon?: ReactNode;
  trailing?: ReactNode;
  /** Etiqueta solo para lectores de pantalla (buscador de una fila de filtros). */
  hideLabel?: boolean;
}

export function Field({ label, hint, error, icon, trailing, hideLabel = false, className, id, ...props }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : undefined;
  return (
    <div className="flex flex-col gap-space-xs">
      <div className={cn('flex items-baseline justify-between', hideLabel && 'sr-only')}>
        <label htmlFor={inputId} className="flex items-center gap-1 text-body-md-medium text-on-surface">
          {label}
          {props.required ? (
            <span aria-hidden className="font-bold text-error">
              *
            </span>
          ) : null}
        </label>
        {hint ? <span className="text-caption text-on-surface-variant">{hint}</span> : null}
      </div>
      <div
        className={cn(
          'flex min-h-touch items-center gap-space-sm rounded-md bg-surface-container-low px-3.5 transition-colors focus-within:bg-surface-container-lowest focus-within:ring-2 dark:bg-surface-container-high',
          error ? 'ring-2 ring-error focus-within:ring-error' : 'focus-within:ring-primary',
        )}
      >
        {icon ? <span className="text-on-surface-variant" aria-hidden>{icon}</span> : null}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn('min-w-0 flex-1 bg-transparent text-body-lg text-on-surface outline-none placeholder:text-on-surface-variant/70', className)}
          {...props}
        />
        {trailing}
      </div>
      {error ? (
        <p id={describedBy} className="text-caption text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Banner({ tone = 'info', title, children }: { tone?: 'info' | 'error'; title: string; children?: ReactNode }) {
  const Icon = tone === 'error' ? CircleAlert : Info;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex gap-3 rounded-md p-3.5',
        tone === 'error' ? 'bg-error-container text-on-error-container' : 'bg-surface-container-low text-on-surface dark:bg-surface-container-high',
      )}
    >
      <Icon aria-hidden className={cn('mt-0.5 size-5 shrink-0', tone === 'error' ? 'text-error' : 'text-secondary')} />
      <div className="flex flex-col gap-0.5 text-left">
        <p className="text-body-md-medium">{title}</p>
        {children ? <div className={cn('text-body-md', tone === 'info' && 'text-on-surface-variant')}>{children}</div> : null}
      </div>
    </div>
  );
}
