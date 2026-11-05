import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, PAYMENT_REFERENCE_MAX, type BillingStatement, type PaymentMethod, type PaymentView } from '@clinic/shared';
import { Button, DateTimeText, Field, formatMoney, formatMoneyInput, MoneyField, MoneyText, SegmentedControl, useSnackbar } from '@clinic/ui';
import { Ban, Banknote, CircleCheck, CreditCard, Ellipsis, Lock, ReceiptText, Wallet } from 'lucide-react';
import { useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api.ts';
import { newIdempotencyKey } from '../../lib/appointments.ts';
import {
  AMOUNT_EXCEEDS_TEXT,
  BILLING_CONFLICT_TEXT,
  billingMessage,
  isBillingConflict,
  maskedReference,
  NOTHING_DUE_TEXT,
  paymentAmountError,
  REFERENCE_HINT,
  VOID_PAYMENT_RECEIPTS_TEXT,
  VOIDED_STATEMENT_TEXT,
} from '../../lib/billing.ts';
import { VoidDialog } from './void-dialog.tsx';

// S-CAJ-11 Tarjeta «Pagos»: panel «Registrar pago» y S-CAJ-12 lista de pagos
// (Stitch: design/stitch/caja/S-CAJ-03_caja_de_la_visita, columna derecha), T-028.
// De Stitch: el título «Pagos», el método en botones segmentados, «Monto
// (USD)» con «Pagar saldo» dentro, «Referencia (opcional)», «Registrar pago ·
// $X» y la lista de pagos de la visita.
//  - El sistema solo registra el pago (no hay terminal integrada) y nunca
//    guarda datos de tarjeta: de la referencia solo se guardan los últimos 4.
//  - «Pagar saldo» copia el saldo del servidor y no envía nada. El tope es el
//    saldo del servidor; la web solo compara, nunca suma.
//  - Enter no registra el pago (en el manual sí lo hacía): solo el botón.
//  - Idempotency-Key: la misma mientras no cambie lo que se envía, así un
//    doble toque o un reintento registran un solo pago.
//  - Sin «Estado de cuenta v{n}» visible (era un dato técnico del manual).
//  - Lista: primero los registrados y después los anulados; «Anular pago»
//    solo para quien anula (ADR 0033).

const METHOD_ICONS = { cash: Banknote, credit_card: CreditCard, debit_card: CreditCard, other: Ellipsis } as const;

export function PaymentsCard({ statement: s, timeZone, onChanged }: { statement: BillingStatement; timeZone: string; onChanged: () => Promise<void> | void }) {
  const snackbar = useSnackbar();
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amount, setAmount] = useState('');
  const [cents, setCents] = useState<number | null>(null);
  const [reference, setReference] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [voiding, setVoiding] = useState<PaymentView | null>(null);
  const lastSent = useRef<{ body: string; key: string } | null>(null);
  const payments = s.payments ?? [];
  const balance = s.totals.balanceCents;
  const amountError = paymentAmountError(amount, cents, balance);
  const payable = s.canPay && balance > 0;

  const submit = async () => {
    setTried(true);
    if (amountError || cents === null) return;
    const input = { method, amountCents: cents, ...(reference.trim() ? { reference: reference.trim() } : {}), expectedVersion: s.statementVersion };
    const body = JSON.stringify(input);
    if (lastSent.current?.body !== body) lastSent.current = { body, key: newIdempotencyKey() };
    setBusy(true);
    try {
      await api.recordPayment(s.encounter.id, input, lastSent.current.key);
      snackbar({ message: `Pago de ${formatMoney(cents)} registrado.` });
      setAmount('');
      setCents(null);
      setReference('');
      setTried(false);
      lastSent.current = null;
    } catch (error) {
      if (isBillingConflict(error)) snackbar({ message: BILLING_CONFLICT_TEXT });
      else if (error instanceof ApiError && error.code === 'amount_exceeds_balance') snackbar({ message: AMOUNT_EXCEEDS_TEXT });
      else snackbar({ message: billingMessage(error) });
    } finally {
      setBusy(false);
      await onChanged();
    }
  };

  return (
    <section aria-labelledby="payments-title" className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-md shadow-level-1 tab:p-space-lg dark:bg-surface-container-low">
      <h2 id="payments-title" className="flex items-center gap-space-sm text-headline-sm text-on-surface">
        <Wallet aria-hidden className="size-6 text-primary" /> Pagos
      </h2>

      {payable ? (
        <fieldset disabled={busy} className="flex min-w-0 flex-col gap-space-md" data-testid="payment-form">
          <legend className="sr-only">Registrar pago</legend>
          <div className="flex flex-col gap-space-xs">
            <span className="text-caption font-semibold tracking-wide text-on-surface-variant uppercase">Método</span>
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
          </div>
          <div className="flex flex-col gap-space-xs">
            <MoneyField
              label="Monto (USD)"
              value={amount}
              maxLength={20}
              error={tried ? amountError : null}
              onValueChange={(text, value) => {
                setAmount(text);
                setCents(value);
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
            />
            <div className="flex flex-wrap items-center justify-between gap-space-sm">
              <span className="text-body-md text-on-surface-variant">
                Saldo: <MoneyText cents={balance} className="font-semibold text-on-surface" />
              </span>
              <Button
                variant="tonal"
                onClick={() => {
                  setAmount(formatMoneyInput(balance));
                  setCents(balance);
                }}
              >
                Pagar saldo
              </Button>
            </div>
          </div>
          <Field
            label="Referencia (opcional)"
            hint={REFERENCE_HINT}
            value={reference}
            maxLength={PAYMENT_REFERENCE_MAX}
            autoComplete="off"
            onChange={(e) => { setReference(e.target.value); }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
          />
          <Button loading={busy} disabled={amount.trim() === ''} onClick={() => void submit()} data-testid="record-payment">
            <CircleCheck aria-hidden className="size-5" /> {cents !== null && !amountError ? `Registrar pago · ${formatMoney(cents)}` : 'Registrar pago'}
          </Button>
        </fieldset>
      ) : (
        <p className="flex items-center gap-space-xs rounded-md bg-surface-container-low p-space-sm text-body-md text-on-surface dark:bg-surface-container" data-testid="payments-closed">
          {s.totals.status === 'voided' ? (
            <>
              <Lock aria-hidden className="size-5 shrink-0" /> {VOIDED_STATEMENT_TEXT}
            </>
          ) : s.canPay ? (
            <>
              <CircleCheck aria-hidden className="size-5 shrink-0 text-status-completed" /> {NOTHING_DUE_TEXT}
            </>
          ) : (
            <>
              <Lock aria-hidden className="size-5 shrink-0" /> Solo Recepción registra pagos.
            </>
          )}
        </p>
      )}

      <div className="flex flex-col gap-space-sm border-t border-outline-variant/60 pt-space-md">
        <h3 className="text-caption font-semibold tracking-wide text-on-surface-variant uppercase">Pagos de esta visita</h3>
        {payments.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">No hay pagos registrados.</p>
        ) : (
          <ul className="flex flex-col gap-space-xs" aria-label="Pagos de esta visita">
            {payments.map((p) => (
              <PaymentRow key={p.id} payment={p} timeZone={timeZone} canVoid={s.canVoid} onVoid={() => { setVoiding(p); }} />
            ))}
          </ul>
        )}
      </div>

      {voiding ? (
        <VoidDialog
          title="Anular pago"
          summary={
            <p className="flex items-center justify-between gap-space-sm text-body-lg text-on-surface">
              {PAYMENT_METHOD_LABELS[voiding.method]} <MoneyText cents={voiding.amountCents} className="font-bold" />
            </p>
          }
          warnings={[VOID_PAYMENT_RECEIPTS_TEXT]}
          onClose={() => { setVoiding(null); }}
          onConfirm={async (reason, key) => {
            try {
              await api.voidPayment(voiding.id, { reason, expectedVersion: s.statementVersion }, key);
              snackbar({ message: 'Pago anulado.' });
            } catch (error) {
              snackbar({ message: billingMessage(error) });
            } finally {
              await onChanged();
            }
          }}
        />
      ) : null}
    </section>
  );
}

/** Una fila de S-CAJ-12: método (tachado si está anulado), fecha, quién lo recibió, referencia enmascarada y motivo. */
export function PaymentRow({ payment: p, timeZone, canVoid, onVoid }: { payment: PaymentView; timeZone: string; canVoid: boolean; onVoid: () => void }) {
  const voided = p.voided !== null;
  const ref = maskedReference(p.referenceLast4);
  return (
    <li className="flex items-start justify-between gap-space-sm rounded-md border border-outline-variant/60 p-space-sm" data-testid="payment-row" data-voided={voided ? 'true' : 'false'}>
      <span className="flex min-w-0 items-start gap-space-sm">
        {voided ? <Ban aria-hidden className="mt-0.5 size-5 shrink-0 text-error" /> : <ReceiptText aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />}
        <span className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-space-xs text-body-lg text-on-surface">
            <span className={voided ? 'line-through' : undefined}>{PAYMENT_METHOD_LABELS[p.method]}</span>
            {voided ? <span className="rounded-sm bg-error-container px-1.5 text-caption font-semibold text-on-error-container">Anulado</span> : null}
          </span>
          <span className="text-body-md break-words text-on-surface-variant">
            <DateTimeText value={p.recordedAt} timeZone={timeZone} />
            {p.recordedBy ? ` · Recibido por ${p.recordedBy}` : ''}
            {ref ? ` · ${ref}` : ''}
          </span>
          {p.voided?.reason ? <span className="text-body-md break-words text-on-surface-variant">{`Anulado: ${p.voided.reason}`}</span> : null}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-space-xs">
        <MoneyText cents={p.amountCents} className={voided ? 'text-body-lg text-on-surface-variant line-through' : 'text-body-lg font-bold text-on-surface'} />
        {canVoid && !voided ? (
          <Button variant="text" aria-label="Anular pago" title="Anular pago" onClick={onVoid}>
            <Ban aria-hidden className="size-5 text-error" />
          </Button>
        ) : null}
      </span>
    </li>
  );
}

