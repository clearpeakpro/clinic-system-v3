import type { ReceiptDocument, ReceiptListItem } from '@clinic/shared';
import { formatMoney } from '@clinic/ui';
import { ApiError } from './api.ts';
import { userActionMessage } from './users.ts';

// Recibos (T-029; S-CAJ-14, 15 y 24; ADR 0037): textos, errores y la
// impresión, sin React, para probarlos aparte.
//  - El texto del recibo lo arma el servidor. La web no lo construye ni lo
//    guarda: vive en memoria mientras se ve (React Query con gcTime 0) y, al
//    imprimir, en un iframe temporal que se borra al terminar. Nada pasa por
//    localStorage, sessionStorage, IndexedDB ni la caché del service worker
//    (que nunca guarda /api; la API responde con Cache-Control: no-store).
//  - Primero la auditoría y después la impresión: solo se imprime el texto
//    que devuelve POST /api/receipts/:id/print, que el servidor entrega
//    después de registrar la impresión. Si falla, no se imprime nada.

export const AUDIT_FAILED_TEXT = 'Exportación cancelada: no se pudo registrar en la auditoría. Inténtelo de nuevo en un momento.';
export const PRINT_FAILED_TEXT = 'No se pudo imprimir el recibo.';
export const NO_RECEIPTS_TEXT = 'Aún no se han generado recibos.';
export const GENERATE_CONFIRM_TEXT = 'Se creará un recibo nuevo, con su propio código. Para volver a imprimir uno que ya existe, use «Imprimir» o «Reimprimir» en la lista.';
export const RECEIPTS_IMMUTABLE_TEXT = 'Los recibos no cambian ni se anulan: si hubo pagos o anulaciones después, genere uno nuevo.';

const MESSAGES: Record<string, string> = {
  payment_voided: 'El pago seleccionado está anulado; genere el recibo sin vincularlo.',
  payment_not_found: 'No se encontró el pago seleccionado. Genere el recibo sin vincularlo.',
  statement_voided: 'Esta visita fue cancelada; la facturación está cerrada.',
  fee_not_paid: 'La cuota no está pagada: cóbrela antes de generar su recibo.',
  fee_not_found: 'No se encontró la cuota.',
  encounter_not_found: 'No se encontró la visita.',
  receipt_not_found: 'Recibo no encontrado.',
  forbidden: 'No puede ver este recibo.',
};

/** Mensaje en «usted» de un error al generar o ver un recibo. */
export function receiptMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const text = MESSAGES[error.code];
    if (text) return text;
  }
  return userActionMessage(error);
}

/** Subtítulo de una fila de S-CAJ-14: «por {nombre} · Vinculado a un pago de $X» (la fecha va aparte). */
export function receiptSubtitle(r: ReceiptListItem): string {
  const parts = [r.issuedBy ? `por ${r.issuedBy}` : null, r.linkedPayment ? `Vinculado a un pago de ${formatMoney(r.linkedPayment.amountCents)}` : null];
  return parts.filter(Boolean).join(' · ');
}

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * La hoja de impresión de 80 mm: el texto de 42 columnas en monoespaciado.
 * 42 caracteres de 0.6 em a 10.5 px ocupan unos 70 mm, dentro de los 72 mm
 * imprimibles de un rollo de 80 mm.
 */
export function receiptPrintHtml(doc: ReceiptDocument): string {
  return `<!doctype html><html lang="${doc.language}"><head><meta charset="utf-8"><title>${escapeHtml(doc.code)}</title><style>
@page { size: 80mm auto; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { padding: 4mm; }
pre { margin: 0; font: 10.5px/1.3 ui-monospace, 'Cascadia Mono', Menlo, Consolas, 'Courier New', monospace; white-space: pre; }
</style></head><body><pre>${escapeHtml(doc.text)}</pre></body></html>`;
}

/**
 * Abre el diálogo de impresión del navegador con el recibo, en un iframe
 * temporal (sin tocar el resto de la página). El iframe se borra al cerrar
 * el diálogo, así no queda ninguna copia del texto en la página.
 */
export async function printReceiptDocument(doc: ReceiptDocument): Promise<void> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.dataset.testid = 'receipt-print-frame';
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  let removeLater = false;
  try {
    await new Promise<void>((resolve, reject) => {
      frame.onload = () => {
        resolve();
      };
      frame.onerror = () => {
        reject(new Error('iframe'));
      };
      frame.srcdoc = receiptPrintHtml(doc);
      document.body.appendChild(frame);
    });
    const win = frame.contentWindow;
    if (!win) throw new Error('sin ventana de impresión');
    // En Chromium print() espera a que se cierre el diálogo; en Safari vuelve
    // enseguida: el iframe se borra con «afterprint» o, como mucho, al minuto.
    const remove = () => {
      frame.remove();
    };
    win.addEventListener('afterprint', remove, { once: true });
    setTimeout(remove, 60_000);
    win.focus();
    win.print();
    removeLater = true;
  } finally {
    if (!removeLater) frame.remove();
  }
}
