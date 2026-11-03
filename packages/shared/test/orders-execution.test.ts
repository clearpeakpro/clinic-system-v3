import { describe, expect, it } from 'vitest';
import {
  appendCompletionNote,
  assignOrderSchema,
  canMoveOrder,
  completeOrderSchema,
  isOrderQueueTab,
  ORDER_NOTES_MAX,
  ORDER_QUEUE_TAB_LABELS,
  ORDER_QUEUE_TABS,
  ORDER_STATUSES,
  orderActions,
  type OrderActionsInput,
} from '../src/index.ts';

// T-026: ejecutar órdenes (S-CLI-19, 20 y 22) y su cola (S-CLI-03). Reglas puras.

const base: OrderActionsInput = { type: 'procedure', status: 'PENDING', visitStatus: 'PROCEDURE_PENDING', canExecute: true, assigned: 'none', labAssigned: false };

describe('orderActions', () => {
  it('«Iniciar»: Pendiente, sin asignar o asignada a quien llama; nunca asignada a otra persona', () => {
    expect(orderActions(base).start).toBe(true);
    expect(orderActions({ ...base, assigned: 'me' }).start).toBe(true);
    expect(orderActions({ ...base, assigned: 'other' }).start).toBe(false);
    expect(orderActions({ ...base, status: 'IN_PROGRESS' }).start).toBe(false);
  });

  it('«Completar»: En curso, aunque la haya iniciado otra persona; en Laboratorio, solo con laboratorio asignado', () => {
    expect(orderActions({ ...base, status: 'IN_PROGRESS', assigned: 'other' })).toEqual({ start: false, complete: true, assign: true, needsLab: false });
    expect(orderActions({ ...base, status: 'PENDING' }).complete).toBe(false);
    const lab = { ...base, type: 'lab' as const, status: 'IN_PROGRESS' as const };
    expect(orderActions(lab)).toEqual({ start: false, complete: false, assign: true, needsLab: true });
    expect(orderActions({ ...lab, labAssigned: true })).toEqual({ start: false, complete: true, assign: true, needsLab: false });
  });

  it('«Asignar»: cualquier orden abierta', () => {
    expect(orderActions(base).assign).toBe(true);
    expect(orderActions({ ...base, status: 'IN_PROGRESS' }).assign).toBe(true);
    expect(orderActions({ ...base, status: 'COMPLETED' }).assign).toBe(false);
    expect(orderActions({ ...base, status: 'CANCELLED' }).assign).toBe(false);
  });

  it('sin orders.execute o con la visita cerrada: ninguna acción', () => {
    const none = { start: false, complete: false, assign: false, needsLab: false };
    expect(orderActions({ ...base, canExecute: false })).toEqual(none);
    expect(orderActions({ ...base, visitStatus: 'COMPLETED' })).toEqual(none);
    expect(orderActions({ ...base, type: 'lab', status: 'IN_PROGRESS', visitStatus: 'CANCELLED' })).toEqual(none);
  });
});

describe('transiciones de la orden', () => {
  it('Pendiente → En curso → Completada; Pendiente o En curso → Cancelada; ninguna otra', () => {
    const allowed = new Set(['PENDING>IN_PROGRESS', 'IN_PROGRESS>COMPLETED', 'PENDING>CANCELLED', 'IN_PROGRESS>CANCELLED']);
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        expect(canMoveOrder(from, to), `${from} → ${to}`).toBe(allowed.has(`${from}>${to}`));
      }
    }
  });
});

describe('nota de finalización (S-CLI-20)', () => {
  it('se añade a las notas existentes; vacía no cambia nada; más de 4000 en total no se acepta', () => {
    expect(appendCompletionNote(null, '  Nota ficticia  ')).toEqual({ notes: 'Nota ficticia', changed: true });
    expect(appendCompletionNote('Antes', 'Después')).toEqual({ notes: 'Antes\n\nDespués', changed: true });
    expect(appendCompletionNote('Antes', '   ')).toEqual({ notes: 'Antes', changed: false });
    expect(appendCompletionNote('Antes', undefined)).toEqual({ notes: 'Antes', changed: false });
    expect(appendCompletionNote('a'.repeat(ORDER_NOTES_MAX - 3), 'b')).toEqual({ notes: `${'a'.repeat(ORDER_NOTES_MAX - 3)}\n\nb`, changed: true });
    expect(appendCompletionNote('a'.repeat(ORDER_NOTES_MAX - 2), 'b')).toBeNull();
  });

  it('esquemas: nota de hasta 4000 y la versión; asignar a una membresía o a nadie', () => {
    expect(completeOrderSchema.safeParse({ expectedVersion: 1 }).success).toBe(true);
    expect(completeOrderSchema.safeParse({ notes: 'a'.repeat(ORDER_NOTES_MAX + 1), expectedVersion: 1 }).success).toBe(false);
    expect(completeOrderSchema.safeParse({ notes: 'x' }).success).toBe(false);
    expect(assignOrderSchema.safeParse({ membershipId: null, expectedVersion: 2 }).success).toBe(true);
    expect(assignOrderSchema.safeParse({ membershipId: 'no-es-uuid', expectedVersion: 2 }).success).toBe(false);
  });
});

describe('pestañas de la cola (S-CLI-03)', () => {
  it('las cuatro del manual, en su orden', () => {
    expect(ORDER_QUEUE_TABS.map((t) => ORDER_QUEUE_TAB_LABELS[t])).toEqual(['Pendientes', 'En curso', 'Completadas hoy', 'Canceladas']);
    expect(isOrderQueueTab('completed_today')).toBe(true);
    expect(isOrderQueueTab('completed')).toBe(false);
  });
});
