import { reasonSchema, type OrderLabOptions, type OrderView } from '@clinic/shared';
import { AsyncView, Banner, Button, cn, Dialog, EmptyState, TextAreaField } from '@clinic/ui';
import { useQuery } from '@tanstack/react-query';
import { Circle, CircleCheck, FlaskConical } from 'lucide-react';
import { useState } from 'react';
import { api, type ApiError } from '../../lib/api.ts';
import { isOrderConflict, orderMessage } from '../../lib/orders.ts';

// «Cambiar laboratorio…» (T-025; ADR 0028 y decisión del 2026-11-02):
// Enfermería y Proveedor, en una orden de laboratorio abierta. Solo los
// laboratorios activos que hacen todas las pruebas de la orden hoy, por su
// nombre (nunca costos). Motivo obligatorio, auditado; con la versión leída
// (409 → se avisa y se relee).

export function ChangeLabDialog({ order, onClose, onSaved, onConflict }: { order: OrderView; onClose: () => void; onSaved: () => void; onConflict: () => void }) {
  const options = useQuery<OrderLabOptions, ApiError>({ queryKey: ['order-lab-options', order.id], queryFn: () => api.orderLabOptions(order.id), staleTime: 0, gcTime: 0 });
  const [picked, setPicked] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickError = tried && picked === null ? 'Elija un laboratorio.' : null;
  const reasonError = tried && !reasonSchema.safeParse(reason).success ? 'Se requiere un motivo.' : null;

  const save = async () => {
    setTried(true);
    setError(null);
    if (picked === null || !reasonSchema.safeParse(reason).success) return;
    setBusy(true);
    try {
      await api.changeOrderLab(order.id, { labProviderId: picked, reason: reason.trim(), expectedVersion: order.version });
      onSaved();
    } catch (e) {
      if (isOrderConflict(e)) onConflict();
      else setError(orderMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}
      dismissible={false}
      icon={<FlaskConical className="size-7" />}
      title="Cambiar laboratorio"
      description={`Orden ${order.code}. Solo aparecen los laboratorios que realizan todas sus pruebas.`}
      footer={
        <>
          <Button variant="tonal" className="text-on-surface" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} onClick={() => void save()}>
            Cambiar laboratorio
          </Button>
        </>
      }
    >
      <AsyncView
        source={options}
        isEmpty={(data) => data.options.length === 0}
        empty={<EmptyState icon={FlaskConical} title="Ningún laboratorio activo realiza todas las pruebas de esta orden." />}
      >
        {(data) => (
          <div role="radiogroup" aria-label="Laboratorio proveedor" className="flex flex-col gap-space-xs">
            {data.options.map((lab) => {
              const current = lab.id === data.current?.id;
              const selected = lab.id === picked;
              const Icon = selected ? CircleCheck : Circle;
              return (
                <button
                  key={lab.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={current || busy}
                  onClick={() => { setPicked(lab.id); }}
                  className={cn(
                    'flex min-h-touch w-full items-center gap-space-sm rounded-md px-space-md text-left text-body-lg text-on-surface hover:bg-surface-container-low disabled:opacity-60',
                    selected && 'bg-surface-container',
                  )}
                >
                  <Icon aria-hidden className={cn('size-5 shrink-0', selected ? 'text-primary' : 'text-on-surface-variant')} />
                  {lab.name}
                  {current ? <span className="text-caption text-on-surface-variant">(actual)</span> : null}
                </button>
              );
            })}
          </div>
        )}
      </AsyncView>
      {pickError ? <p className="text-caption text-error">{pickError}</p> : null}
      <TextAreaField label="Motivo" required maxLength={500} value={reason} error={reasonError} disabled={busy} onChange={(e) => { setReason(e.target.value); }} />
      {error ? <Banner tone="error" title={error} /> : null}
    </Dialog>
  );
}
