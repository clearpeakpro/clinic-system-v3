import {
  createOrderSchema,
  ORDER_NOTES_MAX,
  ORDER_TYPE_CHOICES,
  ORDER_TYPE_LABELS,
  reasonSchema,
  type CreateOrderInput,
  type OrderableItems,
  type OrderPreview,
  type OrderType,
} from '@clinic/shared';
import { AsyncView, Banner, Button, cn, CodeText, Dialog, EmptyState, Field, MoneyText, SegmentedControl, SelectField, SemanticChip, TextAreaField } from '@clinic/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CircleCheck, Circle, ClipboardPlus, FlaskConical, Minus, Plus, Search, SquareCheck, Square, Stethoscope, Syringe } from 'lucide-react';
import { useRef, useState } from 'react';
import { api, type ApiError } from '../../lib/api.ts';
import { newIdempotencyKey } from '../../lib/appointments.ts';
import {
  chosenLab,
  ESTIMATE_NOTE,
  filterOrderables,
  groupKey,
  isLabGroupsChanged,
  labChanged,
  labGroupsInput,
  NO_LAB_TEXT,
  orderMessage,
  quantityError,
  type LabChoices,
} from '../../lib/orders.ts';

// S-CLI-18 Diálogo «Nueva orden» (Stitch: design/stitch/clinicas/S-CLI-18_nueva_orden), T-025.
// De Stitch: el buscador, la lista con radio, nombre, código y precio a la
// derecha, «Cantidad» con − y +, el laboratorio al lado, las notas y el
// recuadro «Cargo estimado» con su nota; «Cancelar» y «Crear orden».
//  - Solo el rol Proveedor lo abre (ADR 0033); el servidor lo revalida.
//  - Procedimiento e Inyección: un solo ítem. Laboratorio: varias pruebas a la
//    vez (casillas); el servidor las reparte en una orden por laboratorio y
//    sugiere el más barato (ADR 0028). Aquí solo se ve el NOMBRE del
//    laboratorio: los costos nunca llegan a la web. Cambiar el sugerido pide
//    motivo. Con seguro no hay sugerido: elegir es opcional.
//  - El precio, el «Cargo estimado» y el total los calcula la API: la web solo
//    da formato (CLAUDE.md, regla 4).
//  - No se cierra tocando fuera. Idempotency-Key: la misma mientras no cambie
//    lo que se envía (un doble toque no crea dos órdenes).

const TYPE_ICONS = { procedure: Stethoscope, lab: FlaskConical, injection: Syringe } as const;

export function NewOrderDialog({
  encounterId,
  onClose,
  onCreated,
  onNotOrderable,
}: {
  encounterId: string;
  onClose: () => void;
  onCreated: (count: number) => void;
  onNotOrderable: () => void;
}) {
  const [type, setType] = useState<OrderType>('procedure');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [choices, setChoices] = useState<LabChoices>({});
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const lastSent = useRef<{ body: string; key: string } | null>(null);

  const catalog = useQuery<OrderableItems, ApiError>({
    queryKey: ['orderables', encounterId, type],
    queryFn: () => api.orderables(encounterId, type),
    staleTime: 0,
    gcTime: 0,
  });
  const qtyError = quantityError(quantity);
  const qty = qtyError ? null : Number(quantity.trim());
  const lines = qty === null ? [] : selected.map((itemId) => ({ itemId, quantity: qty }));
  const preview = useQuery<OrderPreview, ApiError>({
    queryKey: ['order-preview', encounterId, type, lines],
    queryFn: () => api.orderPreview(encounterId, { type, lines }),
    enabled: lines.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 0,
    gcTime: 0,
  });
  const current = lines.length > 0 && preview.data?.type === type ? preview.data : null;
  const groups = current?.lab?.groups ?? [];
  const changed = labChanged(groups, choices);

  const changeType = (next: OrderType) => {
    // Cambiar de tipo limpia el ítem y el laboratorio elegidos (manual).
    setType(next);
    setSelected([]);
    setChoices({});
    setReason('');
    setSearch('');
    setServerError(null);
  };
  const toggle = (id: string) => {
    setServerError(null);
    if (type !== 'lab') {
      setSelected([id]);
      return;
    }
    setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  };
  const step = (delta: number) => {
    const value = Number(quantity.trim());
    const base = Number.isInteger(value) ? value : 1;
    setQuantity(String(Math.min(1000, Math.max(1, base + delta))));
  };

  const selectionError = tried && selected.length === 0 ? 'Seleccione un elemento.' : null;
  const reasonError = tried && changed && !reasonSchema.safeParse(reason).success ? 'Se requiere un motivo.' : null;

  const submit = async () => {
    setTried(true);
    setServerError(null);
    if (selected.length === 0 || qty === null || notes.length > ORDER_NOTES_MAX) return;
    if (changed && !reasonSchema.safeParse(reason).success) return;
    if (type === 'lab' && !current) return;
    const input: CreateOrderInput = {
      type,
      lines,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(type === 'lab' ? { labGroups: labGroupsInput(groups, choices) } : {}),
      ...(type === 'lab' && changed ? { labChangeReason: reason.trim() } : {}),
    };
    if (!createOrderSchema.safeParse(input).success) return;
    const body = JSON.stringify(input);
    if (lastSent.current?.body !== body) lastSent.current = { body, key: newIdempotencyKey() };
    setBusy(true);
    try {
      const created = await api.createOrder(encounterId, input, lastSent.current.key);
      onCreated(created.orders.length);
    } catch (error) {
      if ((error as ApiError).code === 'encounter_not_orderable') {
        onNotOrderable();
        return;
      }
      if (isLabGroupsChanged(error)) {
        setChoices({});
        void preview.refetch();
      }
      setServerError(orderMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const TypeIcon = TYPE_ICONS[type];
  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}
      dismissible={false}
      wide
      fullScreenOnPhone
      icon={<ClipboardPlus className="size-7" />}
      title="Nueva orden"
      footer={
        <>
          <Button variant="tonal" className="text-on-surface" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            <ClipboardPlus aria-hidden className="size-5" /> Crear orden
          </Button>
        </>
      }
    >
      <fieldset disabled={busy} className="flex min-w-0 flex-col gap-space-md">
        <SegmentedControl
          label="Tipo"
          className="w-full [&>button]:flex-1 [&>button]:justify-center"
          options={ORDER_TYPE_CHOICES.map((t) => {
            const Icon = TYPE_ICONS[t];
            return { value: t, label: ORDER_TYPE_LABELS[t], icon: <Icon aria-hidden className="size-[18px]" /> };
          })}
          value={type}
          onChange={changeType}
        />
        <Field
          label="Buscar por código o nombre"
          hideLabel
          placeholder="Buscar por código o nombre"
          icon={<Search className="size-5" />}
          value={search}
          onChange={(e) => { setSearch(e.target.value); }}
        />
        <AsyncView source={catalog}>
          {(data) => {
            const items = filterOrderables(data.items, search);
            if (items.length === 0) return <EmptyState icon={TypeIcon} title="Ningún elemento activo coincide." />;
            return (
              <div
                role={type === 'lab' ? 'group' : 'radiogroup'}
                aria-label={type === 'lab' ? 'Pruebas de laboratorio' : ORDER_TYPE_LABELS[type]}
                className={cn('flex max-h-[220px] flex-col overflow-y-auto rounded-md border border-outline-variant/60', selectionError && 'border-error')}
              >
                {items.map((item) => {
                  const on = selected.includes(item.id);
                  const Icon = type === 'lab' ? (on ? SquareCheck : Square) : on ? CircleCheck : Circle;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role={type === 'lab' ? 'checkbox' : 'radio'}
                      aria-checked={on}
                      onClick={() => { toggle(item.id); }}
                      className={cn(
                        'flex min-h-touch w-full items-center gap-space-sm border-b border-outline-variant/40 px-space-md py-space-sm text-left last:border-b-0 hover:bg-surface-container-low',
                        on && 'bg-surface-container',
                      )}
                    >
                      <Icon aria-hidden className={cn('size-5 shrink-0', on ? 'text-primary' : 'text-on-surface-variant')} />
                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-space-xs">
                        <span className="text-body-lg text-on-surface">{item.name}</span>
                        <CodeText code={item.code} />
                      </span>
                      {item.unitPriceCents === null ? (
                        <span className="text-caption text-on-surface-variant">Sin precio</span>
                      ) : (
                        <MoneyText cents={item.unitPriceCents} />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          }}
        </AsyncView>
        {selectionError ? <p className="-mt-space-sm text-caption text-error">{selectionError}</p> : null}

        <div className="flex flex-wrap items-end gap-space-md">
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
        </div>

        {type === 'lab' && current?.lab ? (
          <LabGroups preview={current} choices={choices} onChoose={(key, id) => { setChoices((c) => ({ ...c, [key]: id })); }} />
        ) : null}
        {type === 'lab' && changed ? (
          <TextAreaField
            label="Motivo del cambio de laboratorio"
            required
            maxLength={500}
            value={reason}
            error={reasonError}
            onChange={(e) => { setReason(e.target.value); }}
          />
        ) : null}

        <TextAreaField
          label="Notas (opcional)"
          rows={3}
          maxLength={ORDER_NOTES_MAX}
          hint={`${String(notes.length)}/${String(ORDER_NOTES_MAX)}`}
          value={notes}
          onChange={(e) => { setNotes(e.target.value); }}
        />

        <Estimate preview={current} />
        {serverError ? <Banner tone="error" title={serverError} /> : null}
      </fieldset>
    </Dialog>
  );
}

/** Cómo se repartirán las pruebas y con qué laboratorio (solo nombres, ADR 0028). */
function LabGroups({ preview, choices: picked, onChoose }: { preview: OrderPreview; choices: LabChoices; onChoose: (key: string, id: string | null) => void }) {
  const lab = preview.lab;
  if (!lab) return null;
  const nameOf = (id: string) => preview.lines.find((l) => l.itemId === id)?.name ?? '';
  return (
    <div className="flex flex-col gap-space-sm" data-testid="lab-groups">
      {lab.coverage === 'insurance' ? (
        <p className="text-body-md text-on-surface-variant">Con seguro no se sugiere laboratorio: elija uno de la red del seguro o déjelo para Enfermería.</p>
      ) : null}
      {lab.groups.length > 1 ? <p className="text-body-md text-on-surface-variant">Se crearán {lab.groups.length} órdenes, una por laboratorio.</p> : null}
      {lab.groups.map((g) => {
        const key = groupKey(g.labTestIds);
        const chosen = chosenLab(g, picked);
        return (
          <div key={key} className="flex flex-col gap-space-xs rounded-md bg-surface-container-low p-space-md dark:bg-surface-container">
            <p className="text-body-md-medium text-on-surface">{g.labTestIds.map(nameOf).join(' · ')}</p>
            {g.options.length === 0 ? (
              <SemanticChip tone="warning" label={NO_LAB_TEXT} />
            ) : (
              <>
                {g.suggested ? <p className="text-body-md text-on-surface-variant">Laboratorio sugerido: {g.suggested.name}</p> : null}
                <SelectField
                  label="Laboratorio proveedor"
                  value={chosen ?? ''}
                  onChange={(e) => { onChoose(key, e.target.value === '' ? null : e.target.value); }}
                >
                  {g.suggested ? null : <option value="">{NO_LAB_TEXT}</option>}
                  {g.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                      {o.id === g.suggested?.id ? ' (sugerido)' : ''}
                    </option>
                  ))}
                </SelectField>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** «Cargo estimado» (S-CLI-18): lo calcula la API; aquí solo se da formato. */
function Estimate({ preview }: { preview: OrderPreview | null }) {
  const single = preview?.lines.length === 1 ? preview.lines[0] : undefined;
  return (
    <div className="flex flex-wrap items-center justify-between gap-space-sm rounded-md bg-surface-container p-space-md dark:bg-surface-container-high" data-testid="order-estimate">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-label-md text-primary uppercase">Cargo estimado</span>
        <span className="text-caption text-on-surface-variant">{ESTIMATE_NOTE}</span>
      </div>
      <div className="flex flex-col items-end">
        {preview?.totalCents !== null && preview?.totalCents !== undefined ? (
          <span className="text-headline-md text-primary">
            <MoneyText cents={preview.totalCents} emphasis />
          </span>
        ) : (
          <span className="text-body-md text-on-surface-variant">Estimación no disponible</span>
        )}
        {single && single.quantity > 1 && single.unitPriceCents !== null ? (
          <span className="text-caption text-on-surface-variant">
            <MoneyText cents={single.unitPriceCents} /> × {single.quantity}
          </span>
        ) : null}
      </div>
    </div>
  );
}
