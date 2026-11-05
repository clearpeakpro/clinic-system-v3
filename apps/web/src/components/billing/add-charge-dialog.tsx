import { CHARGE_ITEM_GROUP_LABELS, CHARGE_ITEM_GROUPS, CHARGE_QUANTITY_MAX, type ChargeItemGroup, type ChargeOptions } from '@clinic/shared';
import { AsyncView, Banner, Button, cn, CodeText, Dialog, EmptyState, Field, MoneyText, SegmentedControl } from '@clinic/ui';
import { useQuery } from '@tanstack/react-query';
import { Circle, CircleCheck, FlaskConical, Minus, Plus, ReceiptText, Search, Stethoscope, Syringe, UserRound } from 'lucide-react';
import { useRef, useState } from 'react';
import { api, type ApiError } from '../../lib/api.ts';
import { newIdempotencyKey } from '../../lib/appointments.ts';
import { billingMessage, chargeQuantityError, filterChargeOptions, isBillingConflict } from '../../lib/billing.ts';

// S-CAJ-08 «Agregar cargo» (T-027; ADR 0041). Sin precio libre, sin código de
// texto y sin descuento: se elige un servicio del catálogo (consulta,
// procedimiento, inyección o prueba) y la cantidad. El precio que se ve y el
// que se cobra es el vigente de la sede hoy, que pone el servidor; el cargo
// recibe los beneficios de membresía en el servidor.
//  - Idempotency-Key: la misma mientras no cambie lo que se envía (un doble
//    toque no crea dos cargos), con la versión del estado de cuenta leída.
//  - Si el servidor lo rechaza, el diálogo sigue abierto con lo elegido (en el
//    manual se cerraba antes y se perdía).

const GROUP_ICONS = { consultation: UserRound, procedure: Stethoscope, injection: Syringe, lab_test: FlaskConical } as const;

export function AddChargeDialog({
  encounterId,
  statementVersion,
  onClose,
  onAdded,
  onConflict,
}: {
  encounterId: string;
  statementVersion: number;
  onClose: () => void;
  onAdded: () => void;
  onConflict: () => void;
}) {
  const [group, setGroup] = useState<ChargeItemGroup>('consultation');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const lastSent = useRef<{ body: string; key: string } | null>(null);
  const options = useQuery<ChargeOptions, ApiError>({
    queryKey: ['charge-options', encounterId],
    queryFn: () => api.chargeOptions(encounterId),
    staleTime: 0,
    gcTime: 0,
  });
  const qtyError = chargeQuantityError(quantity);
  const item = options.data?.items.find((i) => i.id === selected) ?? null;
  const selectionError = tried && !item ? 'Seleccione un servicio.' : null;

  const changeGroup = (next: ChargeItemGroup) => {
    setGroup(next);
    setSelected(null);
    setSearch('');
    setServerError(null);
  };
  const step = (delta: number) => {
    const value = Number(quantity.trim());
    const base = Number.isInteger(value) ? value : 1;
    setQuantity(String(Math.min(CHARGE_QUANTITY_MAX, Math.max(1, base + delta))));
  };

  const submit = async () => {
    setTried(true);
    setServerError(null);
    if (!item || qtyError) return;
    const input = { item: { kind: item.kind, id: item.id }, quantity: Number(quantity.trim()), expectedVersion: statementVersion };
    const body = JSON.stringify(input);
    if (lastSent.current?.body !== body) lastSent.current = { body, key: newIdempotencyKey() };
    setBusy(true);
    try {
      await api.addCharge(encounterId, input, lastSent.current.key);
      onAdded();
    } catch (error) {
      if (isBillingConflict(error)) {
        onConflict();
        return;
      }
      setServerError(billingMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const GroupIcon = GROUP_ICONS[group];
  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}
      dismissible={false}
      wide
      fullScreenOnPhone
      icon={<ReceiptText className="size-7" />}
      title="Agregar cargo"
      description="Elija un servicio del catálogo. El precio es el vigente en esta sede hoy."
      footer={
        <>
          <Button variant="tonal" className="text-on-surface" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            <Plus aria-hidden className="size-5" /> Agregar cargo
          </Button>
        </>
      }
    >
      <fieldset disabled={busy} className="flex min-w-0 flex-col gap-space-md">
        <SegmentedControl
          label="Tipo de servicio"
          className="w-full flex-wrap [&>button]:flex-1 [&>button]:justify-center"
          options={CHARGE_ITEM_GROUPS.map((g) => {
            const Icon = GROUP_ICONS[g];
            return { value: g, label: CHARGE_ITEM_GROUP_LABELS[g], icon: <Icon aria-hidden className="size-[18px]" /> };
          })}
          value={group}
          onChange={changeGroup}
        />
        <Field
          label="Buscar por código o nombre"
          hideLabel
          placeholder="Buscar por código o nombre"
          icon={<Search className="size-5" />}
          value={search}
          onChange={(e) => { setSearch(e.target.value); }}
        />
        <AsyncView source={options}>
          {(data) => {
            const items = filterChargeOptions(data.items, group, search);
            if (items.length === 0) return <EmptyState icon={GroupIcon} title="Ningún servicio activo coincide." />;
            return (
              <div
                role="radiogroup"
                aria-label={CHARGE_ITEM_GROUP_LABELS[group]}
                className={cn('flex max-h-[260px] flex-col overflow-y-auto rounded-md border border-outline-variant/60', selectionError && 'border-error')}
              >
                {items.map((option) => {
                  const on = option.id === selected;
                  const unpriced = option.unitPriceCents === null;
                  const Icon = on ? CircleCheck : Circle;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-disabled={unpriced}
                      onClick={() => {
                        if (unpriced) return;
                        setServerError(null);
                        setSelected(option.id);
                      }}
                      className={cn(
                        'flex min-h-touch w-full items-center gap-space-sm border-b border-outline-variant/40 px-space-md py-space-sm text-left last:border-b-0',
                        unpriced ? 'cursor-not-allowed opacity-60' : 'hover:bg-surface-container-low',
                        on && 'bg-surface-container',
                      )}
                    >
                      <Icon aria-hidden className={cn('size-5 shrink-0', on ? 'text-primary' : 'text-on-surface-variant')} />
                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-space-xs">
                        <span className="text-body-lg text-on-surface">{option.name}</span>
                        <CodeText code={option.code} />
                      </span>
                      {option.unitPriceCents === null ? <span className="text-caption text-on-surface-variant">Sin precio en esta sede</span> : <MoneyText cents={option.unitPriceCents} />}
                    </button>
                  );
                })}
              </div>
            );
          }}
        </AsyncView>
        {selectionError ? <p className="-mt-space-sm text-caption text-error">{selectionError}</p> : null}

        <div className="flex w-[180px] flex-col gap-space-xs">
          <span className="text-body-md-medium text-on-surface">Cantidad</span>
          <div className="flex items-center gap-space-xs">
            <Button variant="tonal" aria-label="Restar uno" className="px-3" onClick={() => { step(-1); }}>
              <Minus aria-hidden className="size-5" />
            </Button>
            <Field
              label="Cantidad"
              hideLabel
              inputMode="numeric"
              className="text-center"
              value={quantity}
              error={qtyError && (tried || quantity !== '') ? qtyError : null}
              onChange={(e) => { setQuantity(e.target.value.replace(/[^\d]/g, '')); }}
            />
            <Button variant="tonal" aria-label="Sumar uno" className="px-3" onClick={() => { step(1); }}>
              <Plus aria-hidden className="size-5" />
            </Button>
          </div>
        </div>
        <p className="text-body-md text-on-surface-variant">El importe, los beneficios de membresía y el reparto con el seguro los calcula el sistema en el estado de cuenta.</p>
        {serverError ? <Banner tone="error" title={serverError} /> : null}
      </fieldset>
    </Dialog>
  );
}
