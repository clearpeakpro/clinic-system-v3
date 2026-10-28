import { reasonSchema } from '@clinic/shared';
import { TriangleAlert } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { cn } from '../cn.ts';
import { Button } from './button.tsx';
import { Dialog } from './overlay.tsx';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  /** Botón principal; «Confirmar» si no se indica (S-GEN-27). */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Acción destructiva: botón rojo e icono de advertencia; la acción segura es la secundaria. */
  destructive?: boolean;
  icon?: ReactNode;
  /** Pide un motivo obligatorio (regla 6 de CLAUDE.md), con su etiqueta. */
  reason?: { label: string };
  /** Recibe el motivo ya recortado. Si lanza, el diálogo sigue abierto. */
  onConfirm: (reason: string | undefined) => Promise<void> | void;
  /** Solo para /dev/ui. */
  inline?: boolean;
}

/**
 * S-GEN-27 Diálogo de confirmación genérico. «Cancelar» o tocar fuera equivale
 * a no confirmar. Con `reason`, el motivo es texto libre obligatorio (1 a 500
 * caracteres, el mismo esquema que valida la API).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  icon,
  reason,
  onConfirm,
  inline = false,
}: ConfirmDialogProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fieldId = useId();

  const close = (next: boolean) => {
    if (!next) {
      setText('');
      setError(null);
    }
    onOpenChange(next);
  };

  const confirm = async () => {
    let value: string | undefined;
    if (reason) {
      const parsed = reasonSchema.safeParse(text);
      if (!parsed.success) {
        setError('Se requiere un motivo.');
        return;
      }
      value = parsed.data;
    }
    setBusy(true);
    try {
      await onConfirm(value);
      close(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={title}
      description={description}
      icon={icon ?? (destructive ? <TriangleAlert className="size-7" /> : undefined)}
      tone={destructive ? 'danger' : 'primary'}
      inline={inline}
      footer={
        <>
          <Button variant="tonal" className="text-on-surface" onClick={() => { close(false); }}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? 'destructive' : 'primary'} loading={busy} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {reason ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={fieldId} className="flex items-center gap-1 text-body-md-medium text-on-surface">
            {reason.label}
            <span aria-hidden className="font-bold text-error">
              *
            </span>
          </label>
          <textarea
            id={fieldId}
            required
            aria-required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${fieldId}-error` : undefined}
            maxLength={500}
            rows={3}
            value={text}
            disabled={busy}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            className={cn(
              'min-h-24 w-full resize-y rounded-md bg-surface-container-low px-3.5 py-3 text-body-lg text-on-surface outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary dark:bg-surface-container-high',
              error && 'ring-2 ring-error focus:ring-error',
            )}
          />
          {error ? (
            <p id={`${fieldId}-error`} className="text-caption text-error">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}

/** S-GEN-26 ¿Descartar cambios sin guardar? (textos del manual). */
export function DiscardChangesDialog({
  open,
  onOpenChange,
  onDiscard,
  inline = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  inline?: boolean;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="¿Descartar cambios sin guardar?"
      description="Tiene cambios sin guardar. Si sale ahora se perderán."
      cancelLabel="Seguir editando"
      confirmLabel="Descartar"
      destructive
      onConfirm={onDiscard}
      inline={inline}
    />
  );
}
