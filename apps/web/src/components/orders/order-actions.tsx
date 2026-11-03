import type { OrderSaved, OrderView, VisitStatus } from '@clinic/shared';
import { Button, ConfirmDialog, useSnackbar } from '@clinic/ui';
import { Ban, Check, FlaskConical, Play, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../lib/api.ts';
import { newIdempotencyKey } from '../../lib/appointments.ts';
import { isOrderConflict, NEEDS_LAB_TEXT, ORDER_CONFLICT_TEXT, orderMessage } from '../../lib/orders.ts';
import { AssignOrderDialog } from './assign-order-dialog.tsx';
import { ChangeLabDialog } from './change-lab-dialog.tsx';
import { CompleteOrderDialog } from './complete-order-dialog.tsx';

// S-CLI-19 Barra de acciones de una orden (T-026), en la sección Órdenes de la
// visita (S-CLI-17) y en cada tarjeta de la Cola de órdenes (S-CLI-03).
//  - Los botones salen de `abilities` (orderActions() de @clinic/shared, la
//    misma regla que aplica la API): «Iniciar», «Completar» (S-CLI-20),
//    «Asignar» (S-CLI-22), «Cambiar laboratorio…» y, separada, «Cancelar
//    orden» (S-CLI-21, con motivo e Idempotency-Key).
//  - En Laboratorio sin laboratorio, «Completar» espera a «Cambiar
//    laboratorio…» y se explica (ADR 0028).
//  - Conflicto de versión: aviso y se relee; nunca «guardar igualmente».
//  - Sin acciones disponibles, la barra no se muestra.

export type ActionableOrder = Pick<OrderView, 'id' | 'code' | 'version' | 'type' | 'abilities' | 'assignedTo'>;

type Open = null | 'complete' | 'assign' | 'lab' | { cancel: string };

export function OrderActions({ order, visitStatus, onChanged }: { order: ActionableOrder; visitStatus: VisitStatus; onChanged: () => Promise<void> }) {
  const snackbar = useSnackbar();
  const [open, setOpen] = useState<Open>(null);
  const [starting, setStarting] = useState(false);
  const { abilities } = order;

  /** Mensaje tras resolver una orden: si la visita pasó sola a «Listo para caja», se dice. */
  const resolvedText = (base: string, saved: OrderSaved) =>
    saved.encounter.status === 'READY_FOR_CHECKOUT' && visitStatus !== 'READY_FOR_CHECKOUT' ? `${base} La visita pasó a Listo para caja.` : base;

  /** Ejecuta una acción; devuelve el mensaje de error para el diálogo (el conflicto cierra y relee). */
  const run = async (action: () => Promise<OrderSaved>, done: (saved: OrderSaved) => string): Promise<string | null> => {
    try {
      const saved = await action();
      setOpen(null);
      snackbar({ message: done(saved) });
      await onChanged();
      return null;
    } catch (error) {
      if (isOrderConflict(error)) {
        setOpen(null);
        snackbar({ message: ORDER_CONFLICT_TEXT });
        await onChanged();
        return null;
      }
      return orderMessage(error);
    }
  };

  const start = async () => {
    setStarting(true);
    try {
      const failed = await run(() => api.startOrder(order.id, { expectedVersion: order.version }), () => 'Orden iniciada.');
      if (failed) {
        snackbar({ message: failed });
        await onChanged();
      }
    } finally {
      setStarting(false);
    }
  };

  const any = abilities.start || abilities.complete || abilities.assign || abilities.changeLab || abilities.cancel;
  if (!any) return null;

  return (
    <div className="flex flex-col items-end gap-space-xs" data-testid="order-actions">
      {abilities.needsLab ? <p className="text-body-md text-on-surface-variant">{NEEDS_LAB_TEXT}</p> : null}
      <div className="flex flex-wrap justify-end gap-space-sm">
        {abilities.changeLab ? (
          <Button variant="outline" onClick={() => { setOpen('lab'); }}>
            <FlaskConical aria-hidden className="size-5" /> Cambiar laboratorio…
          </Button>
        ) : null}
        {abilities.assign ? (
          <Button variant="outline" onClick={() => { setOpen('assign'); }}>
            <UserPlus aria-hidden className="size-5" /> Asignar
          </Button>
        ) : null}
        {abilities.start ? (
          <Button loading={starting} loadingText="Iniciando…" onClick={() => void start()}>
            <Play aria-hidden className="size-5" /> Iniciar
          </Button>
        ) : null}
        {abilities.complete ? (
          <Button onClick={() => { setOpen('complete'); }}>
            <Check aria-hidden className="size-5" /> Completar
          </Button>
        ) : null}
        {abilities.cancel ? (
          <Button variant="text" className="text-error" onClick={() => { setOpen({ cancel: newIdempotencyKey() }); }}>
            <Ban aria-hidden className="size-5" /> Cancelar orden
          </Button>
        ) : null}
      </div>

      {open === 'complete' ? (
        <CompleteOrderDialog
          code={order.code}
          onClose={() => { setOpen(null); }}
          onConfirm={(notes) =>
            run(
              () => api.completeOrder(order.id, { expectedVersion: order.version, ...(notes.trim() ? { notes } : {}) }),
              (saved) => resolvedText('Orden completada.', saved),
            )
          }
        />
      ) : null}
      {open === 'assign' ? (
        <AssignOrderDialog
          code={order.code}
          current={order.assignedTo?.membershipId ?? null}
          onClose={() => { setOpen(null); }}
          onAssign={(membershipId) =>
            run(
              () => api.assignOrder(order.id, { membershipId, expectedVersion: order.version }),
              () => (membershipId === null ? 'Asignación quitada.' : 'Orden asignada.'),
            )
          }
        />
      ) : null}
      {open === 'lab' ? (
        <ChangeLabDialog
          order={order}
          onClose={() => { setOpen(null); }}
          onSaved={() => {
            setOpen(null);
            snackbar({ message: 'Laboratorio cambiado.' });
            void onChanged();
          }}
          onConflict={() => {
            setOpen(null);
            snackbar({ message: ORDER_CONFLICT_TEXT });
            void onChanged();
          }}
        />
      ) : null}
      {open !== null && typeof open === 'object' ? (
        <ConfirmDialog
          open
          onOpenChange={(next) => { if (!next) setOpen(null); }}
          title="Cancelar orden"
          description="La orden y su cargo quedarán anulados. Esta acción no se puede deshacer."
          destructive
          icon={<Ban className="size-7" />}
          confirmLabel="Cancelar orden"
          cancelLabel="Conservar orden"
          reason={{ label: 'Motivo' }}
          onConfirm={async (reason) => {
            const failed = await run(() => api.cancelOrder(order.id, { reason: reason ?? '', expectedVersion: order.version }, open.cancel), (saved) => resolvedText('Orden cancelada.', saved));
            if (failed) {
              setOpen(null);
              snackbar({ message: failed });
              await onChanged();
            }
          }}
        />
      ) : null}
    </div>
  );
}
