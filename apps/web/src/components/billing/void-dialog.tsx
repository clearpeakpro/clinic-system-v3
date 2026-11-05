import { VOID_REASON_MAX } from '@clinic/shared';
import { Banner, ConfirmDialog } from '@clinic/ui';
import { Ban } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { newIdempotencyKey } from '../../lib/appointments.ts';

// S-CAJ-10 «Anular cargo» y S-CAJ-13 «Anular pago» (T-028; ADR 0033): el
// Propietario o el Administrador con un rol clínico en la sede. Motivo
// obligatorio (máx. 200, cifrado en reposo), botón rojo y los avisos del
// manual: anular un cargo ya pagado deja crédito a favor (no hay reembolsos),
// los recibos emitidos no cambian y, en una cuota de membresía, si la anulación
// cancelaría la membresía (decisión del dueño del 2026-11-05).
//  - Idempotency-Key: una por diálogo abierto, así un doble toque o un
//    reintento no anulan dos veces.
//  - Si el servidor lo rechaza, el diálogo sigue abierto (ConfirmDialog).

export function VoidDialog({
  title,
  summary,
  warnings,
  danger,
  onClose,
  onConfirm,
}: {
  title: 'Anular cargo' | 'Anular pago';
  /** «CÓDIGO · Cant. N» y el importe, o el método y el monto. */
  summary: ReactNode;
  warnings: string[];
  /** Aviso destacado antes de confirmar (p. ej. «Esto cancelará la membresía»). */
  danger?: string | null;
  onClose: () => void;
  onConfirm: (reason: string, idempotencyKey: string) => Promise<void>;
}) {
  const key = useRef(newIdempotencyKey());
  return (
    <ConfirmDialog
      open
      destructive
      icon={<Ban className="size-7" />}
      title={title}
      confirmLabel="Anular"
      dismissible={false}
      reason={{ label: 'Motivo', hint: `Obligatorio. Máximo ${String(VOID_REASON_MAX)} caracteres.`, max: VOID_REASON_MAX }}
      onOpenChange={(open) => { if (!open) onClose(); }}
      onConfirm={(reason) => onConfirm(reason ?? '', key.current)}
    >
      <div className="flex flex-col gap-space-sm" data-testid="void-summary">
        {summary}
        {danger ? <Banner tone="error" title={danger} /> : null}
        {warnings.map((w) => (
          <p key={w} className="text-body-md text-on-surface-variant">
            {w}
          </p>
        ))}
      </div>
    </ConfirmDialog>
  );
}
