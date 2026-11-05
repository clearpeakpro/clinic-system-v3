import { MEMBERSHIP_FEE_KIND_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_METHODS, PAYMENT_REFERENCE_MAX, type MembershipFeeKind, type PaymentMethod } from '@clinic/shared';
import { Banner, Button, Dialog, Field, formatMoney, MoneyText, SegmentedControl } from '@clinic/ui';
import { Banknote, CircleCheck, CreditCard, Ellipsis, Wallet } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '../../lib/api.ts';
import { newIdempotencyKey } from '../../lib/appointments.ts';
import { billingMessage, REFERENCE_HINT } from '../../lib/billing.ts';
import { formatDay } from '../../lib/catalog.ts';

// Cobro de una cuota de membresía (T-028; ADR 0034), desde la tarjeta
// «Membresía» del perfil (S-PAC-22) y desde la pestaña Saldos (S-CAJ-17).
// Recepción, con la terminal de la clínica: el sistema solo registra el
// método y, si se escribe, los últimos 4 caracteres de la referencia.
//  - La cuota se cobra completa, un pago por cuota (decisión del 2026-11-05):
//    no hay campo de monto. En el servidor, pagar la cuota inicial activa la
//    membresía y pagar una mensualidad vencida la reactiva.
//  - Idempotency-Key: una por diálogo abierto y lo elegido; Enter no envía.
//  - Si el servidor lo rechaza, el diálogo sigue abierto con el mensaje.

const METHOD_ICONS = { cash: Banknote, credit_card: CreditCard, debit_card: CreditCard, other: Ellipsis } as const;

export interface PayableFee {
  id: string;
  kind: MembershipFeeKind;
  dueDate: string;
  amountCents: number;
  version: number;
}

export function PayFeeDialog({ fee, onClose, onPaid }: { fee: PayableFee; onClose: () => void; onPaid: () => void }) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSent = useRef<{ body: string; key: string } | null>(null);

  const submit = async () => {
    setError(null);
    const input = { method, ...(reference.trim() ? { reference: reference.trim() } : {}), expectedVersion: fee.version };
    const body = JSON.stringify(input);
    if (lastSent.current?.body !== body) lastSent.current = { body, key: newIdempotencyKey() };
    setBusy(true);
    try {
      await api.payMembershipFee(fee.id, input, lastSent.current.key);
      onPaid();
    } catch (e) {
      setError(billingMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}
      dismissible={false}
      fullScreenOnPhone
      icon={<Wallet className="size-7" />}
      title="Cobrar cuota"
      description={`${MEMBERSHIP_FEE_KIND_LABELS[fee.kind]} · vence ${formatDay(fee.dueDate)}`}
      footer={
        <>
          <Button variant="tonal" className="text-on-surface" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            <CircleCheck aria-hidden className="size-5" /> {`Registrar pago · ${formatMoney(fee.amountCents)}`}
          </Button>
        </>
      }
    >
      <fieldset disabled={busy} className="flex min-w-0 flex-col gap-space-md">
        <p className="flex items-center justify-between gap-space-sm text-body-lg text-on-surface">
          Monto de la cuota <MoneyText cents={fee.amountCents} className="font-bold" />
        </p>
        <SegmentedControl<PaymentMethod>
          label="Método"
          className="w-full flex-wrap [&>button]:flex-1 [&>button]:justify-center"
          options={PAYMENT_METHODS.map((m) => {
            const Icon = METHOD_ICONS[m];
            return { value: m, label: PAYMENT_METHOD_LABELS[m], icon: <Icon aria-hidden className="size-[18px]" /> };
          })}
          value={method}
          onChange={setMethod}
        />
        <Field
          label="Referencia (opcional)"
          hint={REFERENCE_HINT}
          value={reference}
          maxLength={PAYMENT_REFERENCE_MAX}
          autoComplete="off"
          onChange={(e) => { setReference(e.target.value); }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
        />
        {error ? <Banner tone="error" title={error} /> : null}
      </fieldset>
    </Dialog>
  );
}
