import { NOT_ORDERABLE_TEXT, ORDER_TYPE_LABELS, type EncounterDetail, type EncounterOrders, type OrderView } from '@clinic/shared';
import { AsyncView, Button, CodeText, ConfirmDialog, Dialog, EmptyState, FilterChip, formatTime, MoneyText, OrderStatusChip, SemanticChip, useSnackbar } from '@clinic/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, ClipboardList, FileText, FlaskConical, Plus, Stethoscope, Syringe } from 'lucide-react';
import { useState } from 'react';
import { api, type ApiError } from '../../lib/api.ts';
import { newIdempotencyKey } from '../../lib/appointments.ts';
import { ESTIMATE_NOTE, isOrderConflict, NO_LAB_TEXT, ORDER_CONFLICT_TEXT, orderMessage, personText, visibleOrders } from '../../lib/orders.ts';
import { ChangeLabDialog } from './change-lab-dialog.tsx';
import { NewOrderDialog } from './new-order-dialog.tsx';

// S-CLI-17 Sección «Órdenes» de la visita (T-025), con S-CLI-18 y S-CLI-21.
//  - Los cuatro roles clínicos la ven (Recepción: solo lectura, sin notas;
//    la API no las envía). «Nueva orden», solo el rol Proveedor (ADR 0033):
//    fuera de los estados que aceptan órdenes, deshabilitado con su texto.
//  - Más recientes primero; las canceladas ocultas salvo con «Mostrar
//    canceladas ({n})». Chip de estado con icono, texto y color.
//  - «Estimado {importe}»: el que devuelve la API (la web no suma).
//  - Laboratorio: solo el nombre (ADR 0028) o «Sin laboratorio asignado».
//    «Cambiar laboratorio…» (Enfermería y Proveedor) pide motivo.
//  - «Cancelar orden»: el Proveedor que la ordenó o el de la visita, con
//    motivo e Idempotency-Key; anula el cargo y puede pasar la visita a «Listo
//    para caja». Ejecutar órdenes llega con T-026.
//  - Se relee con `order.created`, `order.changed` y `billing.changed`.

const TYPE_ICONS = { procedure: Stethoscope, lab: FlaskConical, injection: Syringe } as const;

export function OrdersSection({ encounter }: { encounter: EncounterDetail }) {
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const [showCancelled, setShowCancelled] = useState(false);
  const [dialog, setDialog] = useState<null | { kind: 'new' } | { kind: 'not-orderable' } | { kind: 'cancel'; order: OrderView; key: string } | { kind: 'lab'; order: OrderView }>(null);
  const query = useQuery<EncounterOrders, ApiError>({
    queryKey: ['orders', encounter.id],
    queryFn: () => api.encounterOrders(encounter.id),
    staleTime: 0,
    gcTime: 0,
  });

  const reload = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['orders', encounter.id] }),
      queryClient.invalidateQueries({ queryKey: ['encounter', encounter.id] }),
    ]);
  };

  const cancel = async (order: OrderView, reason: string, key: string) => {
    try {
      const saved = await api.cancelOrder(order.id, { reason, expectedVersion: order.version }, key);
      snackbar({ message: saved.encounter.status === 'READY_FOR_CHECKOUT' && encounter.status !== 'READY_FOR_CHECKOUT' ? 'Orden cancelada. La visita pasó a Listo para caja.' : 'Orden cancelada.' });
    } catch (error) {
      snackbar({ message: isOrderConflict(error) ? ORDER_CONFLICT_TEXT : orderMessage(error) });
    } finally {
      await reload();
    }
  };

  return (
    <AsyncView source={query}>
      {(data) => {
        const cancelled = data.orders.filter((o) => o.status === 'CANCELLED').length;
        const list = visibleOrders(data.orders, showCancelled);
        return (
          <div className="flex flex-col gap-space-md" data-testid="orders-section">
            <div className="flex flex-wrap items-center justify-between gap-space-sm">
              {cancelled > 0 ? (
                <FilterChip label={`Mostrar canceladas (${String(cancelled)})`} selected={showCancelled} onToggle={setShowCancelled} />
              ) : (
                <span />
              )}
              {data.canCreate ? (
                <Button variant="tonal" disabled={!data.orderable} onClick={() => { setDialog({ kind: 'new' }); }}>
                  <Plus aria-hidden className="size-5" /> Nueva orden
                </Button>
              ) : null}
            </div>
            {data.canCreate && !data.orderable ? <p className="text-body-md text-on-surface-variant">{NOT_ORDERABLE_TEXT}</p> : null}
            {list.length === 0 ? (
              <EmptyState icon={FileText} title="Aún no hay órdenes en esta consulta." />
            ) : (
              <ul className="flex flex-col divide-y divide-outline-variant/50">
                {list.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    timeZone={encounter.location.timezone}
                    onCancel={() => { setDialog({ kind: 'cancel', order, key: newIdempotencyKey() }); }}
                    onChangeLab={() => { setDialog({ kind: 'lab', order }); }}
                  />
                ))}
              </ul>
            )}
            {data.orders.length > 0 ? <p className="text-caption text-on-surface-variant">{ESTIMATE_NOTE}</p> : null}

            {dialog?.kind === 'new' ? (
              <NewOrderDialog
                encounterId={encounter.id}
                onClose={() => { setDialog(null); }}
                onNotOrderable={() => {
                  setDialog({ kind: 'not-orderable' });
                  void reload();
                }}
                onCreated={(count) => {
                  setDialog(null);
                  snackbar({ message: count > 1 ? `Se crearon ${String(count)} órdenes.` : 'Orden creada.' });
                  void reload();
                }}
              />
            ) : null}
            <Dialog
              open={dialog?.kind === 'not-orderable'}
              onOpenChange={(open) => { if (!open) setDialog(null); }}
              icon={<ClipboardList className="size-7" />}
              title="No se permiten órdenes ahora"
              description={`Esta consulta no está en un estado que acepte órdenes. ${NOT_ORDERABLE_TEXT}`}
              footer={
                <Button variant="tonal" className="text-on-surface" onClick={() => { setDialog(null); }}>
                  Cerrar
                </Button>
              }
            />
            {dialog?.kind === 'cancel' ? (
              <ConfirmDialog
                open
                onOpenChange={(open) => { if (!open) setDialog(null); }}
                title="Cancelar orden"
                description="La orden y su cargo quedarán anulados. Esta acción no se puede deshacer."
                destructive
                icon={<Ban className="size-7" />}
                confirmLabel="Cancelar orden"
                cancelLabel="Conservar orden"
                reason={{ label: 'Motivo' }}
                onConfirm={(reason) => cancel(dialog.order, reason ?? '', dialog.key)}
              />
            ) : null}
            {dialog?.kind === 'lab' ? (
              <ChangeLabDialog
                order={dialog.order}
                onClose={() => { setDialog(null); }}
                onSaved={() => {
                  setDialog(null);
                  snackbar({ message: 'Laboratorio cambiado.' });
                  void reload();
                }}
                onConflict={() => {
                  setDialog(null);
                  snackbar({ message: ORDER_CONFLICT_TEXT });
                  void reload();
                }}
              />
            ) : null}
          </div>
        );
      }}
    </AsyncView>
  );
}

function OrderRow({ order, timeZone, onCancel, onChangeLab }: { order: OrderView; timeZone: string; onCancel: () => void; onChangeLab: () => void }) {
  const Icon = TYPE_ICONS[order.type];
  const many = order.items.length > 1;
  return (
    <li className="flex flex-col gap-space-sm py-space-md first:pt-0" data-testid="order-row" data-code={order.code}>
      <div className="flex flex-wrap items-start justify-between gap-space-sm">
        <div className="flex min-w-0 flex-col gap-space-xs">
          <div className="flex flex-wrap items-center gap-space-xs">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-outline-variant px-3 text-caption font-semibold text-on-surface">
              <Icon aria-hidden className="size-4" /> {ORDER_TYPE_LABELS[order.type]}
            </span>
            {many ? null : <span className="text-body-lg-medium text-on-surface">{order.items[0]?.name}</span>}
            <CodeText code={order.code} />
            {many ? null : <span className="text-body-md text-on-surface-variant">Cant. {order.items[0]?.quantity}</span>}
          </div>
          {many ? (
            <ul className="flex flex-col gap-1 pl-space-sm">
              {order.items.map((item) => (
                <li key={item.code} className="text-body-md text-on-surface">
                  {item.name} <span className="text-on-surface-variant">· Cant. {item.quantity}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-body-md text-on-surface-variant">
            Ordenada por {personText(order.orderedBy)} · Ordenada {formatTime(order.orderedAt, timeZone)} ·{' '}
            {order.assignedTo ? `Asignada a ${personText(order.assignedTo)}` : 'Sin asignar'}
          </p>
          {order.type === 'lab' ? (
            order.lab ? (
              <p className="text-body-md text-on-surface">Laboratorio proveedor: {order.lab.name}</p>
            ) : (
              <SemanticChip tone="warning" label={NO_LAB_TEXT} />
            )
          ) : null}
          {order.notes ? <p className="text-body-md text-on-surface select-none">Notas: {order.notes}</p> : null}
          {order.cancelReason ? <p className="text-body-md text-on-surface-variant select-none">Cancelada: {order.cancelReason}</p> : null}
        </div>
        <div className="flex flex-col items-end gap-space-xs">
          <OrderStatusChip status={order.status} />
          <span className="text-body-md text-on-surface-variant">
            Estimado <MoneyText cents={order.estimateCents} />
          </span>
        </div>
      </div>
      {order.abilities.changeLab || order.abilities.cancel ? (
        <div className="flex flex-wrap justify-end gap-space-sm">
          {order.abilities.changeLab ? (
            <Button variant="outline" onClick={onChangeLab}>
              <FlaskConical aria-hidden className="size-5" /> Cambiar laboratorio…
            </Button>
          ) : null}
          {order.abilities.cancel ? (
            <Button variant="text" className="text-error" onClick={onCancel}>
              <Ban aria-hidden className="size-5" /> Cancelar orden
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
