import type { ChargeOption } from '@clinic/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from './api.ts';
import { billingMessage, chargeQuantityError, checkoutQueueSubtitle, completeWithBalanceText, filterChargeOptions, pendingBalance, totalRows } from './billing.ts';

// T-027: textos y filtros de Caja. Los importes llegan del servidor; aquí solo se les da formato.

describe('Caja (textos y errores)', () => {
  it('subtítulo de la cola', () => {
    expect(checkoutQueueSubtitle(0)).toBe('Sin visitas en Caja');
    expect(checkoutQueueSubtitle(1)).toBe('1 visita en Caja');
    expect(checkoutQueueSubtitle(3)).toBe('3 visitas en Caja');
  });

  it('el saldo de «Completar visita» sale del error del servidor, exacto', () => {
    expect(pendingBalance(new ApiError(409, 'balance_pending', undefined, { code: 'balance_pending', balanceCents: 6000 }))).toBe(6000);
    expect(pendingBalance(new ApiError(409, 'open_orders'))).toBeNull();
    expect(pendingBalance(new Error('x'))).toBeNull();
    expect(completeWithBalanceText(123450)).toBe('Queda un saldo de $1,234.50. Permanecerá en la cuenta del paciente como saldo abierto. ¿Completar la visita de todos modos?');
  });

  it('mensajes en «usted»; «Caja», no «Checkout»', () => {
    expect(billingMessage(new ApiError(409, 'version_conflict'))).toBe('Otra persona actualizó el estado de cuenta. Se ha actualizado.');
    expect(billingMessage(new ApiError(409, 'price_unavailable'))).toContain('no tiene precio en esta sede');
    expect(billingMessage(new ApiError(409, 'encounter_closed'))).toBe('La visita ya está cerrada.');
    for (const code of ['version_conflict', 'open_orders', 'item_inactive', 'invalid_request']) expect(billingMessage(new ApiError(409, code)).toLowerCase()).not.toContain('checkout');
  });

  it('las filas de totales llevan los importes tal como llegan, en el orden del ADR 0035', () => {
    const rows = totalRows({ subtotalCents: 1, discountCents: 2, insuranceCents: 3, totalDueCents: 4, paidCents: 5, balanceCents: 6, status: 'open', rule: 'self_pay' });
    expect(rows.map((r) => [r.label, r.cents])).toEqual([
      ['Subtotal', 1],
      ['Descuento total', 2],
      ['A cargo del seguro', 3],
      ['Total a pagar', 4],
      ['Pagado', 5],
    ]);
  });

  it('«Agregar cargo»: filtra por grupo y por nombre o código, sin acentos; cantidad de 1 a 1000', () => {
    const items: ChargeOption[] = [
      { kind: 'consultation', group: 'consultation', id: 'a', code: 'CONS-INICIAL', name: 'Consulta médica inicial', unitPriceCents: 6000 },
      { kind: 'consultation', group: 'consultation', id: 'b', code: 'CONS-SEGUIMIENTO', name: 'Consulta de seguimiento', unitPriceCents: 4500 },
      { kind: 'procedure', group: 'injection', id: 'c', code: 'INJ-B12', name: 'Inyección de vitamina B12', unitPriceCents: 2000 },
    ];
    expect(filterChargeOptions(items, 'consultation', '').map((i) => i.id)).toEqual(['a', 'b']);
    expect(filterChargeOptions(items, 'consultation', 'medica').map((i) => i.id)).toEqual(['a']);
    expect(filterChargeOptions(items, 'injection', 'b12').map((i) => i.id)).toEqual(['c']);
    expect(filterChargeOptions(items, 'lab_test', '')).toEqual([]);
    expect(chargeQuantityError('1')).toBeNull();
    expect(chargeQuantityError('1000')).toBeNull();
    expect(chargeQuantityError('0')).not.toBeNull();
    expect(chargeQuantityError('1001')).not.toBeNull();
    expect(chargeQuantityError('2.5')).not.toBeNull();
  });
});
