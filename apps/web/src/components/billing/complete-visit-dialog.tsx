import { ConfirmDialog } from '@clinic/ui';
import { CircleCheckBig } from 'lucide-react';
import { completeWithBalanceText } from '../../lib/billing.ts';

// S-CAJ-05 Diálogo «Completar visita» con saldo pendiente (T-027). Lo abre el
// rechazo del servidor (`balance_pending`), con el saldo exacto que calculó:
// así se pide igual desde Caja y desde la barra de la visita (en el manual,
// la barra no lo pedía). Confirmar repite el paso con `acknowledgeBalance`.

export function CompleteVisitDialog({ balanceCents, onClose, onConfirm }: { balanceCents: number | null; onClose: () => void; onConfirm: () => Promise<void> }) {
  return (
    <ConfirmDialog
      open={balanceCents !== null}
      onOpenChange={(open) => { if (!open) onClose(); }}
      icon={<CircleCheckBig className="size-7" />}
      title="Completar visita"
      description={balanceCents === null ? '' : completeWithBalanceText(balanceCents)}
      confirmLabel="Completar visita"
      onConfirm={onConfirm}
    />
  );
}
