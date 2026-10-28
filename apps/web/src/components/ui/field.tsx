import { CircleAlert, Info, Loader2 } from 'lucide-react';
import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn.ts';

// Campos (DESIGN.md, «Form Fields & Inputs»): alto 48 px, radio 8 px.

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
  icon?: ReactNode;
  trailing?: ReactNode;
}

export function Field({ label, hint, error, icon, trailing, className, id, ...props }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : undefined;
  return (
    <div className="flex flex-col gap-space-xs">
      <div className="flex items-baseline justify-between">
        <label htmlFor={inputId} className="text-body-md-medium text-on-surface">
          {label}
        </label>
        {hint ? <span className="text-caption text-on-surface-variant">{hint}</span> : null}
      </div>
      <div
        className={cn(
          'flex min-h-touch items-center gap-space-sm rounded-md border bg-surface-container-lowest px-3.5 focus-within:ring-2 focus-within:ring-primary/30',
          error ? 'border-error' : 'border-outline-variant focus-within:border-primary',
        )}
      >
        {icon ? <span className="text-on-surface-variant" aria-hidden>{icon}</span> : null}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn('min-w-0 flex-1 bg-transparent text-body-lg text-on-surface outline-none placeholder:text-on-surface-variant', className)}
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
        'flex gap-space-sm rounded-lg p-space-md',
        tone === 'error' ? 'bg-error-container text-on-error-container' : 'bg-surface-container text-on-surface',
      )}
    >
      <Icon aria-hidden className={cn('mt-0.5 size-5 shrink-0', tone === 'error' ? 'text-error' : 'text-secondary')} />
      <div className="flex flex-col gap-space-xs">
        <p className="text-body-md-medium">{title}</p>
        {children ? <div className="text-body-md">{children}</div> : null}
      </div>
    </div>
  );
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center p-space-xl text-primary">
      <Loader2 aria-hidden className="size-8 animate-spin" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Tarjeta centrada de las pantallas de acceso (máx. 520 px, como S-GEN-07). */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-full items-center justify-center bg-surface px-margin py-space-xl">
      <div className="w-full max-w-[520px] rounded-lg border border-outline-variant bg-surface-container-lowest p-space-xl shadow-level-2">
        {children}
      </div>
    </main>
  );
}
