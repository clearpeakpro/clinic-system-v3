import { RECEIPT_LANGUAGE_LABELS, RECEIPT_LANGUAGES, type ReceiptDocument, type ReceiptLanguage, type ReceiptListItem, type ReceiptsPanel } from '@clinic/shared';
import { AsyncView, Button, Checkbox, ConfirmDialog, DateTimeText, Dialog, formatMoney, SegmentedControl, useSnackbar } from '@clinic/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, FileText, Plus, Printer, ReceiptText } from 'lucide-react';
import { useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api.ts';
import { newIdempotencyKey } from '../../lib/appointments.ts';
import {
  AUDIT_FAILED_TEXT,
  GENERATE_CONFIRM_TEXT,
  NO_RECEIPTS_TEXT,
  PRINT_FAILED_TEXT,
  printReceiptDocument,
  receiptMessage,
  receiptSubtitle,
  RECEIPTS_IMMUTABLE_TEXT,
} from '../../lib/receipts.ts';

// S-CAJ-14 Tarjeta «Recibos», S-CAJ-15 hoja «Recibo {código}» y S-CAJ-24
// impresión (T-029; ADR 0037). Stitch: design/stitch/caja/S-CAJ-03_caja_de_la_visita,
// última tarjeta de la columna derecha: «Recibos» con «+ Generar recibo» y
// cada recibo con su código, la fecha, «Ver» e «Imprimir».
//  - Generar (Recepción): con confirmación, porque cada toque crea un recibo
//    nuevo con su propio código (en el manual, dos toques creaban dos), y
//    una Idempotency-Key que se conserva hasta que el recibo se genera: un
//    reintento tras un error no crea un segundo recibo. En una visita, la casilla
//    «Vincular al último pago ($X)», marcada por defecto, si hay pagos.
//  - «Imprimir» en el más reciente y «Reimprimir» en los anteriores (en la
//    hoja siempre «Imprimir»). Antes de imprimir se elige el idioma
//    («Español» por defecto, decisión del 2026-11-05): así se ve en qué
//    idioma saldrá.
//  - El texto lo arma el servidor; la hoja lo muestra tal cual, sin dejar
//    seleccionarlo. Solo se imprime el que devuelve el servidor tras auditar.
//  - Lo usan la Caja de la visita y la tarjeta «Membresía» (cuotas).

export type ReceiptTarget = { kind: 'visit'; id: string } | { kind: 'fee'; id: string };

export const receiptsKey = (target: ReceiptTarget) => ['receipts', target.kind, target.id] as const;

export function ReceiptsCard({ target, timeZone, bare = false }: { target: ReceiptTarget; timeZone: string; bare?: boolean }) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const query = useQuery<ReceiptsPanel, ApiError>({
    queryKey: receiptsKey(target),
    queryFn: () => (target.kind === 'visit' ? api.visitReceipts(target.id) : api.feeReceipts(target.id)),
    staleTime: 0,
    gcTime: 0,
  });
  const [confirming, setConfirming] = useState(false);
  const [viewing, setViewing] = useState<ReceiptListItem | null>(null);
  const [printing, setPrinting] = useState<{ receipt: ReceiptListItem; label: 'Imprimir' | 'Reimprimir' } | null>(null);
  const generateKey = useRef<string | null>(null);
  const reload = () => queryClient.invalidateQueries({ queryKey: receiptsKey(target) });

  const body = (
    <AsyncView source={query}>
      {(panel) => (
        <div className="flex flex-col gap-space-md">
          {panel.canGenerate ? (
            <Button
              variant="tonal"
              className="self-start"
              onClick={() => {
                generateKey.current ??= newIdempotencyKey();
                setConfirming(true);
              }}
              data-testid="generate-receipt"
            >
              <Plus aria-hidden className="size-5" /> Generar recibo
            </Button>
          ) : null}
          {panel.receipts.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">{NO_RECEIPTS_TEXT}</p>
          ) : (
            <ul className="flex flex-col gap-space-sm" aria-label="Recibos">
              {panel.receipts.map((r, index) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-space-sm rounded-md bg-surface-container-low p-space-sm dark:bg-surface-container" data-testid="receipt-row">
                  <span className="flex min-w-0 items-start gap-space-sm">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-container text-primary">
                      <FileText aria-hidden className="size-5" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="font-mono text-body-md-medium break-all text-on-surface">{r.code}</span>
                      <span className="text-caption break-words text-on-surface-variant">
                        <DateTimeText value={r.issuedAt} timeZone={timeZone} />
                        {receiptSubtitle(r) ? ` · ${receiptSubtitle(r)}` : ''}
                      </span>
                    </span>
                  </span>
                  {panel.canPrint ? (
                    <span className="flex flex-wrap items-center gap-space-xs">
                      <Button variant="tonal" onClick={() => { setViewing(r); }} aria-label={`Ver recibo ${r.code}`}>
                        <Eye aria-hidden className="size-5" /> Ver
                      </Button>
                      <Button variant="tonal" onClick={() => { setPrinting({ receipt: r, label: index === 0 ? 'Imprimir' : 'Reimprimir' }); }} aria-label={`${index === 0 ? 'Imprimir' : 'Reimprimir'} recibo ${r.code}`}>
                        <Printer aria-hidden className="size-5" /> {index === 0 ? 'Imprimir' : 'Reimprimir'}
                      </Button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {panel.receipts.length > 0 ? <p className="text-caption text-on-surface-variant">{RECEIPTS_IMMUTABLE_TEXT}</p> : null}
          {confirming ? (
            <GenerateDialog
              target={target}
              panel={panel}
              idempotencyKey={generateKey.current ?? newIdempotencyKey()}
              onClose={() => { setConfirming(false); }}
              onGenerated={(receiptCode) => {
                generateKey.current = null;
                setConfirming(false);
                snackbar({ message: `Recibo ${receiptCode} generado.` });
                void reload();
              }}
              onFailed={(error) => {
                // Con otro contenido (p. ej. sin vincular el pago) la clave ya no sirve: una nueva.
                if (error instanceof ApiError && error.code === 'idempotency_key_reused') generateKey.current = null;
                setConfirming(false);
                void reload();
              }}
            />
          ) : null}
        </div>
      )}
    </AsyncView>
  );

  return (
    <>
      {bare ? (
        body
      ) : (
        <section aria-labelledby="receipts-title" className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-md shadow-level-1 tab:p-space-lg dark:bg-surface-container-low" data-testid="receipts-card">
          <h2 id="receipts-title" className="flex items-center gap-space-sm text-headline-sm text-on-surface">
            <ReceiptText aria-hidden className="size-6 text-primary" /> Recibos
          </h2>
          {body}
        </section>
      )}
      {viewing ? <ReceiptSheet receipt={viewing} onClose={() => { setViewing(null); }} /> : null}
      {printing ? <PrintDialog receipt={printing.receipt} label={printing.label} onClose={() => { setPrinting(null); }} /> : null}
    </>
  );
}

/** «Generar recibo» con confirmación y, en una visita, «Vincular al último pago ($X)». */
function GenerateDialog({
  target,
  panel,
  idempotencyKey,
  onClose,
  onGenerated,
  onFailed,
}: {
  target: ReceiptTarget;
  panel: ReceiptsPanel;
  idempotencyKey: string;
  onClose: () => void;
  onGenerated: (code: string) => void;
  onFailed: (error: unknown) => void;
}) {
  const snackbar = useSnackbar();
  const latest = target.kind === 'visit' ? panel.latestPayment : null;
  const [link, setLink] = useState(true);
  return (
    <ConfirmDialog
      open
      icon={<ReceiptText className="size-7" />}
      title="Generar recibo"
      description={GENERATE_CONFIRM_TEXT}
      confirmLabel="Generar recibo"
      onOpenChange={(open) => { if (!open) onClose(); }}
      onConfirm={async () => {
        try {
          const generated =
            target.kind === 'visit'
              ? await api.generateVisitReceipt(target.id, { paymentId: latest && link ? latest.id : null }, idempotencyKey)
              : await api.generateFeeReceipt(target.id, idempotencyKey);
          onGenerated(generated.code);
        } catch (error) {
          snackbar({ message: receiptMessage(error) });
          onFailed(error);
        }
      }}
    >
      {latest ? <Checkbox label={`Vincular al último pago (${formatMoney(latest.amountCents)})`} checked={link} onCheckedChange={setLink} /> : null}
      {target.kind === 'fee' && panel.latestPayment ? <p className="text-body-md text-on-surface-variant">{`Vinculado al pago de la cuota (${formatMoney(panel.latestPayment.amountCents)}).`}</p> : null}
    </ConfirmDialog>
  );
}

function LanguageSelector({ value, onChange }: { value: ReceiptLanguage; onChange: (v: ReceiptLanguage) => void }) {
  return (
    <SegmentedControl<ReceiptLanguage>
      label="Idioma del recibo"
      options={RECEIPT_LANGUAGES.map((l) => ({ value: l, label: RECEIPT_LANGUAGE_LABELS[l] }))}
      value={value}
      onChange={onChange}
    />
  );
}

/** Imprime: primero el servidor audita y devuelve el texto; después, el diálogo del navegador. */
function usePrint() {
  const snackbar = useSnackbar();
  const [busy, setBusy] = useState(false);
  const print = async (receiptId: string, language: ReceiptLanguage): Promise<boolean> => {
    setBusy(true);
    let doc: ReceiptDocument;
    try {
      doc = await api.printReceipt(receiptId, { language });
    } catch {
      // Sin auditoría (o por el límite por minuto) no hay texto: no se imprime nada.
      snackbar({ message: AUDIT_FAILED_TEXT });
      setBusy(false);
      return false;
    }
    try {
      await printReceiptDocument(doc);
      return true;
    } catch {
      snackbar({ message: PRINT_FAILED_TEXT });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { print, busy };
}

/** S-CAJ-24 desde la lista: el idioma a la vista antes de imprimir. */
function PrintDialog({ receipt, label, onClose }: { receipt: ReceiptListItem; label: 'Imprimir' | 'Reimprimir'; onClose: () => void }) {
  const [language, setLanguage] = useState<ReceiptLanguage>('es');
  const { print, busy } = usePrint();
  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      icon={<Printer className="size-7" />}
      title={`${label} recibo`}
      description={<span className="font-mono">{receipt.code}</span>}
      footer={
        <>
          <Button variant="text" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            loading={busy}
            onClick={() =>
              void print(receipt.id, language).then((ok) => {
                if (ok) onClose();
              })
            }
            data-testid="confirm-print"
          >
            <Printer aria-hidden className="size-5" /> {label}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-space-xs">
        <span className="text-caption font-semibold tracking-wide text-on-surface-variant uppercase">Idioma</span>
        <LanguageSelector value={language} onChange={setLanguage} />
        <p className="text-body-md text-on-surface-variant">Rollo de 80 mm para la impresora de tickets. La impresión queda registrada en la auditoría.</p>
      </div>
    </Dialog>
  );
}

/** S-CAJ-15: el recibo tal como lo arma el servidor, en el idioma elegido, con «Imprimir». */
function ReceiptSheet({ receipt, onClose }: { receipt: ReceiptListItem; onClose: () => void }) {
  const [language, setLanguage] = useState<ReceiptLanguage>('es');
  const doc = useQuery<ReceiptDocument, ApiError>({
    queryKey: ['receipt', receipt.id, language],
    queryFn: () => api.receipt(receipt.id, language),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const { print, busy } = usePrint();
  return (
    <Dialog
      open
      wide
      sheetOnPhone
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`Recibo ${receipt.code}`}
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            Cerrar
          </Button>
          <Button loading={busy} disabled={!doc.data} onClick={() => void print(receipt.id, language)} data-testid="sheet-print">
            <Printer aria-hidden className="size-5" /> Imprimir
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-space-md">
        <LanguageSelector value={language} onChange={setLanguage} />
        <AsyncView source={doc}>
          {(d) => (
            <pre
              className="overflow-x-auto rounded-md bg-surface-container-low p-space-md font-mono text-[13px] leading-snug text-on-surface select-none dark:bg-surface-container"
              data-testid="receipt-text"
              lang={d.language}
              onCopy={(e) => { e.preventDefault(); }}
            >
              {d.text}
            </pre>
          )}
        </AsyncView>
      </div>
    </Dialog>
  );
}
