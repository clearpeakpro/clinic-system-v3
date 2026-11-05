import type { BillingStatement } from '@clinic/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api.ts';
import { PaymentsCard } from './payments-card.tsx';

// T-028 S-CAJ-11 y S-CAJ-12: «Registrar pago» y la lista de pagos.
//  - Enter en el monto o la referencia no registra el pago (en el manual sí).
//  - Un doble toque envía la misma Idempotency-Key.
//  - «Pagar saldo» copia el saldo del servidor y no envía nada.
//  - La lista muestra solo los últimos 4 de la referencia y los anulados aparte.

afterEach(cleanup);
beforeEach(() => {
  vi.restoreAllMocks();
});

const statement = (over: Partial<BillingStatement> = {}): BillingStatement => ({
  encounter: { id: 'e', code: 'NOR1-V-000001', status: 'CHECKOUT', route: 'LAB_ONLY', version: 3, hasOpenOrders: false },
  patient: { id: 'p', code: 'P-000001', firstName: 'Paciente', lastName: 'Ficticio' },
  coverage: { type: 'self_pay', term: null },
  statementVersion: 7,
  totals: { subtotalCents: 6000, discountCents: 0, insuranceCents: 0, totalDueCents: 6000, paidCents: 1500, balanceCents: 4500, creditCents: 0, status: 'partial', rule: 'self_pay' },
  view: 'full',
  lines: [],
  voided: [],
  editable: true,
  payments: [
    { id: 'p1', method: 'credit_card', amountCents: 1500, referenceLast4: '7654', recordedAt: '2026-11-05T16:00:00Z', recordedBy: 'Usted', voided: null },
    { id: 'p2', method: 'cash', amountCents: 900, referenceLast4: null, recordedAt: '2026-11-05T15:00:00Z', recordedBy: 'Recepción ficticia', voided: { reason: 'Cobro duplicado', at: '2026-11-05T15:30:00Z', by: 'Usted' } },
  ],
  canPay: true,
  canVoid: false,
  ...over,
});

describe('tarjeta «Pagos» (S-CAJ-11 y 12)', () => {
  it('Enter no registra el pago; el botón sí, con los centavos, el método y la versión; un doble toque usa la misma clave', async () => {
    const record = vi.spyOn(api, 'recordPayment').mockResolvedValue({ paymentId: 'x', version: 8 });
    const changed = vi.fn();
    render(<PaymentsCard statement={statement()} timeZone="America/Chicago" onChanged={changed} />);
    const amount = screen.getByLabelText(/Monto \(USD\)/);
    fireEvent.change(amount, { target: { value: '20.50' } });
    fireEvent.keyDown(amount, { key: 'Enter' });
    fireEvent.change(screen.getByLabelText(/Referencia/), { target: { value: 'AUTH-1234' } });
    fireEvent.keyDown(screen.getByLabelText(/Referencia/), { key: 'Enter' });
    expect(record).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: /Tarjeta de débito/ }));
    const button = screen.getByTestId('record-payment');
    expect(button.textContent).toContain('Registrar pago · $20.50');
    fireEvent.click(button);
    await waitFor(() => { expect(record).toHaveBeenCalledTimes(1); });
    expect(record.mock.calls[0]?.slice(0, 2)).toEqual(['e', { method: 'debit_card', amountCents: 2050, reference: 'AUTH-1234', expectedVersion: 7 }]);
    await waitFor(() => { expect(changed).toHaveBeenCalled(); });
  });

  it('un reintento tras un error usa la misma Idempotency-Key; más que el saldo no se envía', async () => {
    const record = vi.spyOn(api, 'recordPayment').mockRejectedValueOnce(new Error('red')).mockResolvedValue({ paymentId: 'x', version: 8 });
    render(<PaymentsCard statement={statement()} timeZone="America/Chicago" onChanged={() => undefined} />);
    const amount = screen.getByLabelText(/Monto \(USD\)/);
    fireEvent.change(amount, { target: { value: '45.01' } });
    fireEvent.click(screen.getByTestId('record-payment'));
    expect(await screen.findByText('El monto supera el saldo.')).toBeTruthy();
    expect(record).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Pagar saldo' }));
    expect((amount as HTMLInputElement).value).toBe('45.00');
    expect(record).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('record-payment'));
    await waitFor(() => { expect(record).toHaveBeenCalledTimes(1); });
    fireEvent.click(screen.getByTestId('record-payment'));
    await waitFor(() => { expect(record).toHaveBeenCalledTimes(2); });
    expect(record.mock.calls[0]?.[2]).toBe(record.mock.calls[1]?.[2]);
  });

  it('la lista: método, «Recibido por», solo los últimos 4 y los anulados con su motivo, después de los registrados', () => {
    render(<PaymentsCard statement={statement()} timeZone="America/Chicago" onChanged={() => undefined} />);
    const rows = screen.getAllByTestId('payment-row');
    expect(rows.map((r) => r.dataset.voided)).toEqual(['false', 'true']);
    expect(within(rows[0] as HTMLElement).getByText(/Ref\. ••••7654/)).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText('Anulado: Cobro duplicado')).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText(/Recibido por Recepción ficticia/)).toBeTruthy();
    // Sin permiso de anular, no hay botón.
    expect(screen.queryByRole('button', { name: 'Anular pago' })).toBeNull();
  });

  it('quien anula ve «Anular pago» solo en los registrados; sin saldo o con el estado de cuenta anulado, no hay formulario', () => {
    const { unmount } = render(<PaymentsCard statement={statement({ canVoid: true })} timeZone="America/Chicago" onChanged={() => undefined} />);
    expect(screen.getAllByRole('button', { name: 'Anular pago' })).toHaveLength(1);
    unmount();
    const paid = statement({ totals: { ...statement().totals, balanceCents: 0, status: 'paid' } });
    const { unmount: u2 } = render(<PaymentsCard statement={paid} timeZone="America/Chicago" onChanged={() => undefined} />);
    expect(screen.queryByTestId('payment-form')).toBeNull();
    expect(screen.getByTestId('payments-closed').textContent).toContain('No hay nada pendiente');
    u2();
    const voided = statement({ canPay: false, totals: { ...statement().totals, totalDueCents: 0, balanceCents: -1500, creditCents: 1500, status: 'voided' } });
    render(<PaymentsCard statement={voided} timeZone="America/Chicago" onChanged={() => undefined} />);
    expect(screen.getByTestId('payments-closed').textContent).toContain('anulado');
  });
});
