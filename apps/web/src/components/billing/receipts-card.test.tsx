import type { ReceiptsPanel } from '@clinic/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../lib/api.ts';
import * as receipts from '../../lib/receipts.ts';
import { ReceiptsCard } from './receipts-card.tsx';

// T-029 S-CAJ-14, 15 y 24: la tarjeta «Recibos».
//  - «Generar recibo» pide confirmación y usa una sola Idempotency-Key por
//    diálogo; «Vincular al último pago» va marcada y envía ese pago.
//  - «Imprimir» en el más reciente, «Reimprimir» en los demás; el idioma se
//    elige antes (Español por defecto).
//  - Solo se imprime el texto que devuelve el servidor tras auditar; si falla,
//    no se imprime nada.
//  - Nada del recibo queda en el almacenamiento del navegador.

afterEach(cleanup);
beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

const PANEL: ReceiptsPanel = {
  receipts: [
    { id: 'r2', code: 'NOR1-R-2026-000046', issuedAt: '2026-11-05T16:10:00Z', issuedBy: 'Usted', linkedPayment: { method: 'cash', amountCents: 2000 } },
    { id: 'r1', code: 'NOR1-R-2026-000045', issuedAt: '2026-11-05T16:00:00Z', issuedBy: 'Recepción ficticia', linkedPayment: null },
  ],
  canGenerate: true,
  canPrint: true,
  blocked: null,
  latestPayment: { id: 'pay-1', method: 'cash', amountCents: 2000 },
};

function renderCard(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

const TEXT = 'Clínica Demo Norte\nRECIBO          NOR1-R-2026-000046\nGracias por su visita';

describe('tarjeta «Recibos» (S-CAJ-14, 15 y 24)', () => {
  it('lista del más nuevo al más antiguo: «Imprimir» en el primero y «Reimprimir» en los demás', async () => {
    vi.spyOn(api, 'visitReceipts').mockResolvedValue(PANEL);
    renderCard(<ReceiptsCard target={{ kind: 'visit', id: 'e' }} timeZone="America/Chicago" />);
    const rows = await screen.findAllByTestId('receipt-row');
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining('NOR1-R-2026-000046'), expect.stringContaining('NOR1-R-2026-000045')]);
    expect(rows[0]?.textContent).toContain('por Usted · Vinculado a un pago de $20.00');
    expect(within(rows[0] as HTMLElement).getByRole('button', { name: 'Imprimir recibo NOR1-R-2026-000046' })).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByRole('button', { name: 'Reimprimir recibo NOR1-R-2026-000045' })).toBeTruthy();
  });

  it('«Generar recibo» pide confirmación, vincula el último pago y un doble toque usa la misma clave', async () => {
    vi.spyOn(api, 'visitReceipts').mockResolvedValue(PANEL);
    const generate = vi.spyOn(api, 'generateVisitReceipt').mockRejectedValueOnce(new Error('red')).mockResolvedValue({ id: 'r3', code: 'NOR1-R-2026-000047' });
    renderCard(<ReceiptsCard target={{ kind: 'visit', id: 'e' }} timeZone="America/Chicago" />);
    fireEvent.click(await screen.findByTestId('generate-receipt'));
    expect(generate).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('checkbox').getAttribute('aria-checked')).toBe('true');
    expect(dialog.textContent).toContain('Vincular al último pago ($20.00)');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generar recibo' }));
    await waitFor(() => { expect(generate).toHaveBeenCalledTimes(1); });
    // Falló: el reintento lleva la misma clave (no crea un segundo recibo).
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull(); });
    fireEvent.click(screen.getByTestId('generate-receipt'));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Generar recibo' }));
    await waitFor(() => { expect(generate).toHaveBeenCalledTimes(2); });
    expect(generate.mock.calls[0]?.[1]).toEqual({ paymentId: 'pay-1' });
    expect(generate.mock.calls[0]?.[2]).toBe(generate.mock.calls[1]?.[2]);
  });

  it('sin vincular: la casilla desmarcada envía paymentId nulo', async () => {
    vi.spyOn(api, 'visitReceipts').mockResolvedValue(PANEL);
    const generate = vi.spyOn(api, 'generateVisitReceipt').mockResolvedValue({ id: 'r3', code: 'NOR1-R-2026-000047' });
    renderCard(<ReceiptsCard target={{ kind: 'visit', id: 'e' }} timeZone="America/Chicago" />);
    fireEvent.click(await screen.findByTestId('generate-receipt'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generar recibo' }));
    await waitFor(() => { expect(generate).toHaveBeenCalledTimes(1); });
    expect(generate.mock.calls[0]?.[1]).toEqual({ paymentId: null });
  });

  it('imprimir: el idioma a la vista (Español por defecto); se imprime lo que devuelve el servidor', async () => {
    vi.spyOn(api, 'visitReceipts').mockResolvedValue(PANEL);
    const printApi = vi.spyOn(api, 'printReceipt').mockResolvedValue({ id: 'r1', code: 'NOR1-R-2026-000045', language: 'en', text: TEXT });
    const printed = vi.spyOn(receipts, 'printReceiptDocument').mockResolvedValue();
    renderCard(<ReceiptsCard target={{ kind: 'visit', id: 'e' }} timeZone="America/Chicago" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reimprimir recibo NOR1-R-2026-000045' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('radio', { name: 'Español' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(dialog).getByRole('radio', { name: 'English' }));
    fireEvent.click(within(dialog).getByTestId('confirm-print'));
    await waitFor(() => { expect(printed).toHaveBeenCalledTimes(1); });
    expect(printApi).toHaveBeenCalledWith('r1', { language: 'en' });
    expect(printed.mock.calls[0]?.[0].text).toBe(TEXT);
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it('si la auditoría falla, no se imprime y se explica', async () => {
    vi.spyOn(api, 'visitReceipts').mockResolvedValue(PANEL);
    vi.spyOn(api, 'printReceipt').mockRejectedValue(new ApiError(500, 'internal_error'));
    const printed = vi.spyOn(receipts, 'printReceiptDocument').mockResolvedValue();
    renderCard(<ReceiptsCard target={{ kind: 'visit', id: 'e' }} timeZone="America/Chicago" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Imprimir recibo NOR1-R-2026-000046' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByTestId('confirm-print'));
    await waitFor(() => { expect(api.printReceipt).toHaveBeenCalled(); });
    expect(printed).not.toHaveBeenCalled();
  });

  it('«Ver»: el texto del servidor, en el idioma elegido, sin construirlo en la web', async () => {
    vi.spyOn(api, 'visitReceipts').mockResolvedValue(PANEL);
    const read = vi.spyOn(api, 'receipt').mockImplementation((id, language) => Promise.resolve({ id, code: 'NOR1-R-2026-000046', language, text: language === 'es' ? 'RECIBO' : 'RECEIPT' }));
    renderCard(<ReceiptsCard target={{ kind: 'visit', id: 'e' }} timeZone="America/Chicago" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver recibo NOR1-R-2026-000046' }));
    expect((await screen.findByTestId('receipt-text')).textContent).toBe('RECIBO');
    fireEvent.click(screen.getByRole('radio', { name: 'English' }));
    await waitFor(() => { expect(screen.getByTestId('receipt-text').textContent).toBe('RECEIPT'); });
    expect(read.mock.calls.map((c) => c[1])).toEqual(['es', 'en']);
  });

  it('sin permiso para generar, sin el botón; sin recibos, el texto vacío', async () => {
    vi.spyOn(api, 'feeReceipts').mockResolvedValue({ ...PANEL, receipts: [], canGenerate: false, blocked: 'fee_not_paid', latestPayment: null });
    renderCard(<ReceiptsCard target={{ kind: 'fee', id: 'f' }} timeZone="America/Chicago" />);
    expect(await screen.findByText('Aún no se han generado recibos.')).toBeTruthy();
    expect(screen.queryByTestId('generate-receipt')).toBeNull();
  });
});

describe('hoja de impresión de 80 mm', () => {
  it('escapa el texto y fija el rollo de 80 mm', () => {
    const html = receipts.receiptPrintHtml({ id: 'r', code: 'NOR1-R-2026-000001', language: 'es', text: 'A < B & C' });
    expect(html).toContain('size: 80mm auto');
    expect(html).toContain('<pre>A &lt; B &amp; C</pre>');
    expect(html).toContain('<title>NOR1-R-2026-000001</title>');
  });

  it('imprime en un iframe temporal que se borra después', async () => {
    const print = vi.fn();
    const appended: HTMLIFrameElement[] = [];
    const appendChild = document.body.appendChild.bind(document.body);
    vi.spyOn(document.body, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
      const result = appendChild(node);
      if (node instanceof HTMLIFrameElement) {
        appended.push(node);
        Object.defineProperty(node, 'contentWindow', { configurable: true, get: () => ({ print, focus: vi.fn(), addEventListener: (_: string, fn: () => void) => { setTimeout(fn, 0); } }) });
        setTimeout(() => {
          node.dispatchEvent(new Event('load'));
        }, 0);
      }
      return result;
    });
    await receipts.printReceiptDocument({ id: 'r', code: 'NOR1-R-2026-000001', language: 'es', text: 'RECIBO' });
    expect(print).toHaveBeenCalledTimes(1);
    expect(appended[0]?.srcdoc).toContain('RECIBO');
    await waitFor(() => { expect(document.querySelector('[data-testid="receipt-print-frame"]')).toBeNull(); });
  });
});
