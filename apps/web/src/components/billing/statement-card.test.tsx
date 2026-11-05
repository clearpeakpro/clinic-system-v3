import type { BillingStatement } from '@clinic/shared';
import { cleanup, render, screen, within } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { StatementCard } from './statement-card.tsx';
import { StatementTotalsView } from './statement-totals.tsx';

// T-027: la web no suma (CLAUDE.md, regla 4). Se le dan a propósito importes
// del servidor que NO cuadran entre sí: la pantalla debe mostrarlos tal cual,
// sin recalcular el total de la línea, los totales ni el saldo.

afterEach(cleanup);

const statement = (over: Partial<BillingStatement> = {}): BillingStatement => ({
  encounter: { id: 'e', code: 'NOR1-V-000001', status: 'CHECKOUT', route: 'LAB_ONLY', version: 3, hasOpenOrders: false },
  patient: { id: 'p', code: 'P-000001', firstName: 'Paciente', lastName: 'Ficticio' },
  coverage: { type: 'insurance', term: 'copay' },
  statementVersion: 2,
  // Ninguna cifra sale de las otras: 111 + 222 ≠ 999, etc.
  totals: { subtotalCents: 99900, discountCents: 1100, insuranceCents: 2200, totalDueCents: 3300, paidCents: 4400, balanceCents: 5500, status: 'partial', rule: 'insurance_copay' },
  view: 'full',
  lines: [
    {
      id: 'l1',
      source: 'order',
      kind: 'procedure',
      itemCode: 'INJ-B12',
      itemName: 'Inyección ficticia',
      orderCode: 'NOR1-O-000001',
      quantity: 3,
      unitPriceCents: 11100,
      amountCents: 77700,
      discountCents: 0,
      includedQuantity: 0,
      lineTotalCents: 12300,
      createdAt: '2026-11-05T16:00:00Z',
    },
    {
      id: 'l2',
      source: 'cashier',
      kind: 'consultation',
      itemCode: 'CONS-INICIAL',
      itemName: 'Consulta ficticia',
      orderCode: null,
      quantity: 1,
      unitPriceCents: 22200,
      amountCents: 22200,
      discountCents: 700,
      includedQuantity: 0,
      lineTotalCents: 45600,
      createdAt: '2026-11-05T16:05:00Z',
    },
  ],
  voided: [],
  editable: true,
  ...over,
});

describe('estado de cuenta (S-CAJ-07)', () => {
  it('muestra los importes del servidor tal cual, aunque no cuadren', () => {
    render(<StatementCard statement={statement()} onAddCharge={() => undefined} />);
    const rows = screen.getAllByTestId('statement-line');
    expect(within(rows[0] as HTMLElement).getByText('$123.00')).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText('$456.00')).toBeTruthy();
    // Origen «Orden» y «Caja»; la insignia de descuento es solo «Membresía».
    expect(within(rows[0] as HTMLElement).getByTestId('line-source').textContent).toBe('Orden');
    expect(within(rows[1] as HTMLElement).getByTestId('line-source').textContent).toBe('Caja');
    expect(within(rows[1] as HTMLElement).getByText('Membresía')).toBeTruthy();
    expect(screen.queryByText('Manual')).toBeNull();
    expect(screen.queryByText(/Aplicar descuento/)).toBeNull();
    const totals = screen.getByTestId('statement-totals');
    expect(within(totals).getByTestId('total-subtotal').textContent).toContain('$999.00');
    expect(within(totals).getByTestId('total-discount').textContent).toContain('$11.00');
    expect(within(totals).getByTestId('total-insurance').textContent).toContain('$22.00');
    expect(within(totals).getByTestId('total-due').textContent).toContain('$33.00');
    expect(within(totals).getByTestId('total-paid').textContent).toContain('$44.00');
    expect(within(totals).getByTestId('total-balance').textContent).toContain('$55.00');
    expect(within(totals).getByTestId('total-balance').textContent).toContain('Pago parcial');
    expect(screen.getByTestId('statement-rule').textContent).toContain('copago');
    expect(screen.getByRole('button', { name: /Agregar cargo/ })).toBeTruthy();
  });

  it('sin cargos y con la visita cerrada: sin «Agregar cargo» y en solo lectura', () => {
    render(<StatementCard statement={statement({ lines: [], editable: false })} onAddCharge={() => undefined} />);
    expect(screen.getByText('Esta visita aún no tiene cargos.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Agregar cargo/ })).toBeNull();
    expect(screen.getByText('Esta visita está cerrada. El estado de cuenta es de solo lectura.')).toBeTruthy();
  });

  it('los totales de la sección Facturación también son los del servidor', () => {
    render(<StatementTotalsView totals={statement().totals} />);
    expect(screen.getByTestId('total-balance').textContent).toContain('$55.00');
  });
});

describe('revisión: ningún archivo de Caja hace cuentas con importes', () => {
  // Una suma, resta o multiplicación sobre algo que se llame «…Cents» en el
  // código de Caja de la web sería calcular dinero en el navegador.
  const here = dirname(fileURLToPath(import.meta.url));
  const ARITHMETIC = /\b\w*Cents\b\s*[-+*/]\s*[\w(]|[\w)]\s*[-+*/]\s*[\w.?]*Cents\b|\.reduce\(/;
  const files = [
    ...readdirSync(here).filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx')).map((f) => join(here, f)),
    join(here, '../../lib/billing.ts'),
    join(here, '../../pages/checkout.tsx'),
    join(here, '../../pages/checkout-queue.tsx'),
  ];

  it('la revisión detecta una cuenta', () => {
    for (const sample of ['const x = s.totals.totalDueCents + 1;', 'const y = qty * item.unitPriceCents;', 'lines.reduce((a, l) => a + l.amountCents, 0)']) expect(ARITHMETIC.test(sample), sample).toBe(true);
    expect(ARITHMETIC.test('<MoneyText cents={line.lineTotalCents} />')).toBe(false);
  });

  it.each(files)('%s', (file) => {
    const offending = readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && ARITHMETIC.test(line));
    expect(offending).toEqual([]);
  });
});
