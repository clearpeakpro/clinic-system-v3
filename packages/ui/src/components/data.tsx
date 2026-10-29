import { Check, Copy, type LucideIcon } from 'lucide-react';
import { useState, type InputHTMLAttributes } from 'react';
import { copyText } from '../clipboard.ts';
import { cn } from '../cn.ts';
import { formatDate, formatDateTime, formatMoney, formatMoneyInput, formatTime, parseMoney } from '../format.ts';
import { Field } from './field.tsx';

// Datos con formato (hoja S-GEN-30, sección 7): importes, códigos y fechas en
// monoespaciado con cifras tabulares para alinear columnas.

/**
 * Importe en centavos: «$1,234.50». Los negativos (saldo a favor) van en el
 * color del texto, nunca en rojo; la etiqueta «Saldo a favor» la pone la pantalla.
 */
export function MoneyText({ cents, emphasis = false, className }: { cents: number; emphasis?: boolean; className?: string }) {
  return (
    <span className={cn('font-mono whitespace-nowrap tabular-nums', emphasis && cents >= 0 && 'font-bold text-primary', className)}>
      {formatMoney(cents)}
    </span>
  );
}

interface MoneyFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  label: string;
  /** Texto tal como se escribe («1,234.50»). */
  value: string;
  /** Texto y su valor en centavos (`null` si no es un importe válido). */
  onValueChange: (text: string, cents: number | null) => void;
  allowNegative?: boolean;
  error?: string | null;
}

/**
 * Campo de dinero: «$» a la izquierda, cifra a la derecha y «USD». Entrega
 * centavos enteros; al salir del campo da formato a lo escrito («1234.5» →
 * «1,234.50»).
 */
export function MoneyField({ label, value, onValueChange, allowNegative = false, error, onBlur, ...props }: MoneyFieldProps) {
  const [touched, setTouched] = useState(false);
  const cents = parseMoney(value, { allowNegative });
  const invalid = touched && value.trim() !== '' && cents === null;
  return (
    <Field
      {...props}
      label={label}
      inputMode="decimal"
      autoComplete="off"
      value={value}
      error={error ?? (invalid ? 'El monto no es válido.' : null)}
      icon={<span className="font-mono text-code-md font-bold text-primary">$</span>}
      trailing={<span className="text-caption text-on-surface-variant">USD</span>}
      className="text-right font-mono font-semibold tabular-nums"
      onChange={(e) => { onValueChange(e.target.value, parseMoney(e.target.value, { allowNegative })); }}
      onBlur={(e) => {
        setTouched(true);
        if (cents !== null) onValueChange(formatMoneyInput(cents), cents);
        onBlur?.(e);
      }}
    />
  );
}

/**
 * Código humano (`P-000123`, `NOR1-V-000210`) en monoespaciado. `inline`: en
 * recuadro pequeño dentro de un texto o una tabla. `block`: fila con etiqueta,
 * icono y botón «Copiar» (la hoja; el manual pedía una señal al copiar).
 */
export function CodeText({
  code,
  variant = 'inline',
  label,
  icon: Icon,
  copyable = false,
  className,
}: {
  code: string;
  variant?: 'inline' | 'block';
  label?: string;
  icon?: LucideIcon;
  copyable?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (await copyText(code)) {
      setCopied(true);
      setTimeout(() => { setCopied(false); }, 2000);
    }
  };
  if (variant === 'inline') {
    return (
      <span className={cn('rounded-sm bg-surface-container px-1.5 py-0.5 font-mono text-code-sm tabular-nums text-on-surface dark:bg-surface-container-high', className)}>
        {code}
      </span>
    );
  }
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-space-sm rounded-md bg-surface-container-low p-space-sm dark:bg-surface-container', className)}>
      <div className="flex min-w-0 items-center gap-space-sm">
        {Icon ? <Icon aria-hidden className="size-[22px] shrink-0 text-primary" /> : null}
        <div className="flex min-w-0 flex-col">
          {label ? <span className="text-caption text-on-surface-variant">{label}</span> : null}
          <span className="font-mono text-code-md font-bold tracking-wider whitespace-nowrap text-on-surface tabular-nums">{code}</span>
        </div>
      </div>
      {copyable ? (
        <>
          <button
            type="button"
            onClick={() => void copy()}
            aria-label={`Copiar el código ${code}`}
            className="flex min-h-touch shrink-0 items-center gap-1 rounded-md bg-surface-container-highest px-space-sm text-body-md-medium text-on-surface hover:bg-surface-container dark:bg-surface-container-high"
          >
            {copied ? <Check aria-hidden className="size-4 text-primary" /> : <Copy aria-hidden className="size-4" />}
            <span aria-hidden>{copied ? 'Copiado' : 'Copiar'}</span>
          </button>
          <span role="status" className="sr-only">
            {copied ? `Código ${code} copiado` : ''}
          </span>
        </>
      ) : null}
    </div>
  );
}

/** Campo para escribir un código: monoespaciado, sin autocorrección. */
export function CodeField(props: Omit<Parameters<typeof Field>[0], 'className'>) {
  return <Field {...props} autoComplete="off" autoCapitalize="characters" spellCheck={false} className="font-mono tracking-wider uppercase" />;
}

/** Fecha u hora en la zona horaria de la sede: «25 oct 2026», «3:15 p. m.». */
export function DateTimeText({
  value,
  timeZone,
  format = 'datetime',
  className,
}: {
  value: Date | string;
  timeZone: string;
  format?: 'date' | 'time' | 'datetime';
  className?: string;
}) {
  const iso = typeof value === 'string' ? value : value.toISOString();
  const text = format === 'date' ? formatDate(value, timeZone) : format === 'time' ? formatTime(value, timeZone) : formatDateTime(value, timeZone);
  return (
    <time dateTime={iso} className={cn('whitespace-nowrap tabular-nums', className)}>
      {text}
    </time>
  );
}

const STAT_TONES = {
  primary: 'bg-surface-container text-primary dark:bg-surface-container-high',
  info: 'bg-status-in-care-container text-status-in-care',
  neutral: 'bg-surface-container-high text-on-surface-variant dark:bg-surface-container-highest',
} as const;

/**
 * Tarjeta de total (cabecera de S-ADM-02): etiqueta, cifra grande y un icono
 * en un cuadro de color. La cifra la calcula quien la muestra a partir de
 * datos reales; nunca un porcentaje ni una tendencia inventados.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'primary',
  className,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: keyof typeof STAT_TONES;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-space-sm rounded-lg bg-surface-container-lowest p-space-md shadow-level-1 dark:bg-surface-container-low',
        className,
      )}
    >
      <dl className="flex min-w-0 flex-col gap-space-xs">
        <dt className="text-caption text-on-surface">{label}</dt>
        <dd className={cn('font-mono text-headline-lg tabular-nums', tone === 'info' ? 'text-status-in-care' : tone === 'neutral' ? 'text-on-surface-variant' : 'text-on-surface')}>
          {value}
        </dd>
      </dl>
      <span aria-hidden className={cn('flex size-12 shrink-0 items-center justify-center rounded-md', STAT_TONES[tone])}>
        <Icon className="size-6" />
      </span>
    </div>
  );
}
