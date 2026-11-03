import { Button, Dialog } from '@clinic/ui';
import { ArrowRight, ClipboardList } from 'lucide-react';

// S-CLI-08 Diálogo «Órdenes abiertas» (T-023): aparece cuando el servidor
// rechaza pasar a Caja con órdenes pendientes o en curso (`open_orders`).
// Desde T-025, «Ir a órdenes» lleva a la sección Órdenes (S-CLI-17).

export function OpenOrdersDialog({ open, onClose, onGoToOrders }: { open: boolean; onClose: () => void; onGoToOrders?: (() => void) | undefined }) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next) onClose(); }}
      icon={<ClipboardList className="size-7" />}
      title="Órdenes abiertas"
      description="Esta visita aún tiene órdenes pendientes o en curso. Complételas o cancélelas antes de continuar."
      footer={
        <>
          <Button variant="tonal" className="text-on-surface" onClick={onClose}>
            Cerrar
          </Button>
          {onGoToOrders ? (
            <Button
              onClick={() => {
                onClose();
                onGoToOrders();
              }}
            >
              Ir a órdenes <ArrowRight aria-hidden className="size-5" />
            </Button>
          ) : null}
        </>
      }
    />
  );
}
