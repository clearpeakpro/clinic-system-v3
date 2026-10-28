import { Check, ChevronDown } from 'lucide-react';
import { useId, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../cn.ts';

// Controles de formulario de T-006a (S-ADM-02, S-ADM-03): mismo aspecto que
// Field (relleno menta, sin borde, anillo primary al enfocar) y objetivos
// táctiles de 48 px.

const filled =
  'rounded-md bg-surface-container-low text-body-lg text-on-surface outline-none transition-colors focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary dark:bg-surface-container-high';

function Label({ htmlFor, children, required }: { htmlFor?: string; children: ReactNode; required?: boolean | undefined }) {
  return (
    <label htmlFor={htmlFor} className="flex items-center gap-1 text-body-md-medium text-on-surface">
      {children}
      {required ? (
        <span aria-hidden className="font-bold text-error">
          *
        </span>
      ) : null}
    </label>
  );
}

function FieldMessage({ id, error, hint }: { id: string; error?: string | null | undefined; hint?: string | undefined }) {
  if (error) {
    return (
      <p id={id} className="text-caption text-error">
        {error}
      </p>
    );
  }
  return hint ? (
    <p id={id} className="text-caption text-on-surface-variant">
      {hint}
    </p>
  ) : null;
}

interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'children'> {
  label: string;
  hint?: string | undefined;
  error?: string | null;
}

/** Texto multilínea (motivos: S-GEN-27, S-ADM-08, S-ADM-09). */
export function TextAreaField({ label, hint, error, required, className, id, rows = 3, ...props }: TextAreaFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const messageId = `${fieldId}-message`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldId} required={required}>
        {label}
      </Label>
      <textarea
        id={fieldId}
        required={required}
        aria-required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        rows={rows}
        className={cn(filled, 'min-h-24 w-full resize-y px-3.5 py-3', error && 'ring-2 ring-error focus:ring-error', className)}
        {...props}
      />
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  /** Etiqueta solo para lectores de pantalla (filtros con el valor visible). */
  hideLabel?: boolean;
  icon?: ReactNode;
}

/** Desplegable nativo (filtros de S-ADM-02; en el teléfono, el filtro de estado). */
export function SelectField({ label, hideLabel = false, icon, className, id, children, ...props }: SelectFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className={cn(hideLabel && 'sr-only')}>
        <Label htmlFor={fieldId}>{label}</Label>
      </span>
      <div className="relative flex items-center">
        {icon ? (
          <span aria-hidden className="pointer-events-none absolute left-3.5 text-on-surface-variant">
            {icon}
          </span>
        ) : null}
        <select
          id={fieldId}
          className={cn(filled, 'min-h-touch w-full appearance-none truncate py-0 pr-10', icon ? 'pl-11' : 'pl-3.5', className)}
          {...props}
        >
          {children}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-3 size-5 text-on-surface-variant" />
      </div>
    </div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

/** Botones segmentados de selección única (filtro de estado de S-ADM-02 desde 600 px). */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  /** Nombre del grupo para lectores de pantalla. */
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex overflow-hidden rounded-md border border-outline-variant', className)}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => { onChange(option.value); }}
            className={cn(
              'flex min-h-touch items-center gap-space-xs px-space-md text-body-md-medium whitespace-nowrap transition-colors',
              index > 0 && 'border-l border-outline-variant',
              selected
                ? 'bg-surface-container text-primary dark:bg-surface-container-highest'
                : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-low dark:bg-surface-container-low dark:hover:bg-surface-container',
            )}
          >
            {selected ? <Check aria-hidden className="size-[18px]" /> : option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Chip de filtro (selección múltiple de roles y sedes, S-ADM-03). */
export function FilterChip({
  label,
  selected,
  onToggle,
  disabled,
}: {
  label: string;
  selected: boolean;
  onToggle: (selected: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => { onToggle(!selected); }}
      className={cn(
        'inline-flex min-h-touch items-center gap-space-xs rounded-md border px-space-md text-body-md-medium transition-colors disabled:opacity-50',
        selected
          ? 'border-primary bg-surface-container text-primary dark:bg-surface-container-highest'
          : 'border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low dark:bg-surface-container-low',
      )}
    >
      {selected ? <Check aria-hidden className="size-[18px]" /> : null}
      {label}
    </button>
  );
}

/** Grupo con título y mensaje de error compartido (chips de roles o de sedes). */
export function ChipGroup({
  label,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  error?: string | null | undefined;
  hint?: string | undefined;
  required?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <fieldset aria-describedby={error || hint ? `${id}-message` : undefined} className="flex flex-col gap-space-xs">
      <legend className="mb-space-xs flex items-center gap-1 text-body-md-medium text-on-surface">
        {label}
        {required ? (
          <span aria-hidden className="font-bold text-error">
            *
          </span>
        ) : null}
      </legend>
      <div className="flex flex-wrap gap-space-sm">{children}</div>
      <FieldMessage id={`${id}-message`} error={error} hint={hint} />
    </fieldset>
  );
}
