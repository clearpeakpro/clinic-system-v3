import { useId, useState } from 'react';
import { cn } from '../cn.ts';

export const OTP_LENGTH = 6;

/**
 * Código de 6 dígitos (S-GEN-06, S-GEN-07). Se ven seis casillas en dos grupos
 * de 3, pero hay UN solo campo real encima, invisible: así se puede pegar el
 * código completo, el teléfono lo autocompleta (autocomplete one-time-code) y
 * los lectores de pantalla anuncian un único campo.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  invalid = false,
  describedBy,
  label = 'Código de verificación',
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string | undefined;
  label?: string;
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, OTP_LENGTH - 1);

  const box = (index: number) => {
    const digit = value[index];
    return (
      <span
        key={index}
        aria-hidden
        className={cn(
          'flex h-16 min-w-0 flex-1 items-center justify-center rounded-md bg-surface-container-low font-mono text-display-md font-medium text-on-surface shadow-level-1 transition-colors sm:max-w-14 dark:bg-surface-container-high',
          focused && index === active && 'bg-surface-container-lowest ring-2 ring-primary',
          invalid && 'ring-2 ring-error',
        )}
      >
        {digit ?? <span className="text-outline-variant">-</span>}
      </span>
    );
  };

  return (
    <div className="relative mx-auto flex w-full max-w-[420px] items-center justify-between gap-2 sm:gap-3">
      {[0, 1, 2].map(box)}
      <span aria-hidden className="text-headline-md text-outline-variant">
        ·
      </span>
      {[3, 4, 5].map(box)}
      <input
        id={id}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={OTP_LENGTH}
        autoFocus
        disabled={disabled}
        value={value}
        onFocus={() => { setFocused(true); }}
        onBlur={() => { setFocused(false); }}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH);
          onChange(digits);
          if (digits.length === OTP_LENGTH) onComplete?.(digits);
        }}
        // Invisible pero enfocable y del tamaño de las casillas (tocar cualquiera lo enfoca).
        className="absolute inset-0 size-full cursor-text bg-transparent text-transparent caret-transparent opacity-0 outline-none selection:bg-transparent"
      />
    </div>
  );
}

/** Segundos que le quedan al código TOTP actual (periodos de 30 s alineados con el reloj). */
export function totpSecondsLeft(now: number = Date.now()): number {
  return 30 - (Math.floor(now / 1000) % 30);
}
