import { CHARGE_SOURCE_LABELS, isOpenVisitStatus, type BillingStatement, type StatementLine } from '@clinic/shared';
import { Button, CodeText, MoneyText } from '@clinic/ui';
import { Ban, BadgePercent, ChevronDown, Lock, Plus, ReceiptText } from 'lucide-react';
import { CLOSED_STATEMENT_TEXT, VOIDED_STATEMENT_TEXT } from '../../lib/billing.ts';
import { CoverageRule, StatementTotalsView } from './statement-totals.tsx';

// S-CAJ-07 Tarjeta «Estado de cuenta» (Stitch: design/stitch/caja/S-CAJ-03_caja_de_la_visita), T-027.
// De Stitch: el título con el chip de la cobertura, la frase de la regla, la
// tabla (Servicio con su código y origen, Cant., Precio unitario, Descuento y
// Total línea) y el recuadro de totales; «Agregar cargo» abajo.
//  - Sin «Aplicar descuento» ni insignia «Manual» (ADR 0041): la columna
//    Descuento lleva solo la insignia «Membresía». Sin «Recalcular»: el
//    servidor recalcula al abrir.
//  - T-028: «Anular cargo» (S-CAJ-10) en los cargos de Caja, solo para quien
//    anula (ADR 0033). Los de orden lo muestran deshabilitado: se anulan
//    cancelando la orden.
//  - «A cargo del seguro» en su propia fila (ADR 0035), no como descuento.
//  - Tabla desde 600 px; en el teléfono, una tarjeta por línea.
//  - Todos los importes, del servidor: la web no suma nada.

export function StatementCard({ statement: s, onAddCharge, onVoidCharge }: { statement: BillingStatement; onAddCharge: () => void; onVoidCharge?: (line: StatementLine) => void }) {
  const lines = s.lines ?? [];
  const voided = s.voided ?? [];
  const canVoid = s.canVoid && onVoidCharge !== undefined;
  const voidButton = (line: StatementLine) =>
    canVoid ? <VoidChargeButton line={line} onVoid={() => { onVoidCharge(line); }} /> : null;
  return (
    <section aria-labelledby="statement-title" className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-md shadow-level-1 tab:p-space-lg dark:bg-surface-container-low">
      <header className="flex flex-wrap items-center justify-between gap-space-sm">
        <h2 id="statement-title" className="flex items-center gap-space-sm text-headline-sm text-on-surface">
          <ReceiptText aria-hidden className="size-6 text-primary" /> Estado de cuenta
        </h2>
        {s.editable ? (
          <Button variant="tonal" onClick={onAddCharge}>
            <Plus aria-hidden className="size-5" /> Agregar cargo
          </Button>
        ) : null}
      </header>
      <CoverageRule coverage={s.coverage} totals={s.totals} />

      {lines.length === 0 ? (
        <p className="rounded-md border border-dashed border-outline-variant p-space-md text-body-md text-on-surface-variant">Esta visita aún no tiene cargos.</p>
      ) : (
        <>
          {/* Con la tarjeta «Pagos» al lado, la tabla puede desplazarse: el contenedor recibe el foco (teclado). */}
          <div className="hidden overflow-x-auto tab:block" tabIndex={0} role="region" aria-label="Cargos de la visita, desplazable">
            <table className="w-full min-w-[560px] border-collapse text-left" aria-label="Cargos de la visita">
              <thead>
                <tr className="bg-surface-container-low text-caption font-semibold tracking-wide text-on-surface-variant uppercase dark:bg-surface-container">
                  <th scope="col" className="px-space-sm py-space-sm">Servicio</th>
                  <th scope="col" className="px-space-sm py-space-sm text-right">Cant.</th>
                  <th scope="col" className="px-space-sm py-space-sm text-right">Precio unitario</th>
                  <th scope="col" className="px-space-sm py-space-sm text-right">Descuento</th>
                  <th scope="col" className="px-space-sm py-space-sm text-right">Total línea</th>
                  {canVoid ? (
                    <th scope="col" className="px-space-sm py-space-sm text-right">
                      <span className="sr-only">Acciones</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} className="border-b border-outline-variant/40 align-top last:border-b-0" data-testid="statement-line" data-code={line.itemCode}>
                    <td className="px-space-sm py-space-sm">
                      <LineService line={line} />
                    </td>
                    <td className="px-space-sm py-space-sm text-right text-body-lg tabular-nums">{line.quantity}</td>
                    <td className="px-space-sm py-space-sm text-right">
                      <MoneyText cents={line.unitPriceCents} className="text-body-lg" />
                    </td>
                    <td className="px-space-sm py-space-sm text-right">
                      <LineDiscount line={line} />
                    </td>
                    <td className="px-space-sm py-space-sm text-right">
                      <MoneyText cents={line.lineTotalCents} className="text-body-lg font-bold" />
                    </td>
                    {canVoid ? <td className="px-space-sm py-space-sm text-right">{voidButton(line)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-space-sm tab:hidden" aria-label="Cargos de la visita">
            {lines.map((line) => (
              <li key={line.id} className="flex flex-col gap-space-xs rounded-md border border-outline-variant/60 p-space-sm" data-testid="statement-line-card">
                <div className="flex items-start justify-between gap-space-sm">
                  <LineService line={line} />
                  <MoneyText cents={line.lineTotalCents} className="text-body-lg font-bold" />
                </div>
                <p className="text-body-md text-on-surface-variant">
                  Cant. {line.quantity} × <MoneyText cents={line.unitPriceCents} />
                </p>
                <div className="flex items-center justify-between gap-space-xs text-body-md text-on-surface-variant">
                  <span className="flex items-center gap-space-xs">
                    Descuento: <LineDiscount line={line} />
                  </span>
                  {voidButton(line)}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {voided.length > 0 ? (
        <details className="rounded-md border border-outline-variant/60 p-space-sm">
          <summary className="flex min-h-touch cursor-pointer items-center gap-space-xs text-body-md-medium text-on-surface">
            <ChevronDown aria-hidden className="size-5" />
            {voided.length === 1 ? '1 cargo anulado' : `${String(voided.length)} cargos anulados`}
          </summary>
          <ul className="flex flex-col gap-space-xs pt-space-xs">
            {voided.map((v) => (
              <li key={v.id} className="flex flex-wrap items-start justify-between gap-space-sm text-body-md text-on-surface-variant">
                <span className="flex min-w-0 flex-col">
                  <span className="line-through">{v.itemName}</span>
                  {v.reason ? <span className="break-words">{`Anulado: ${v.reason}`}</span> : null}
                </span>
                <MoneyText cents={v.amountCents} className="line-through" />
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <StatementTotalsView totals={s.totals} />
      {s.totals.status === 'voided' ? (
        <p className="flex items-center gap-space-xs text-body-md text-on-surface-variant">
          <Lock aria-hidden className="size-4 shrink-0" /> {VOIDED_STATEMENT_TEXT}
        </p>
      ) : isOpenVisitStatus(s.encounter.status) ? null : (
        <p className="flex items-center gap-space-xs text-body-md text-on-surface-variant">
          <Lock aria-hidden className="size-4 shrink-0" /> {CLOSED_STATEMENT_TEXT}
        </p>
      )}
    </section>
  );
}

function LineService({ line }: { line: StatementLine }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="text-body-lg text-on-surface">{line.itemName}</span>
      <span className="flex flex-wrap items-center gap-space-xs">
        <CodeText code={line.itemCode} />
        <span className="rounded-sm bg-surface-container px-1.5 text-caption text-on-surface-variant" data-testid="line-source">
          {CHARGE_SOURCE_LABELS[line.source]}
        </span>
        {line.orderCode ? <CodeText code={line.orderCode} /> : null}
      </span>
    </span>
  );
}

/** S-CAJ-10: solo los cargos de Caja; los de orden, deshabilitado con su explicación. */
function VoidChargeButton({ line, onVoid }: { line: StatementLine; onVoid: () => void }) {
  const fromOrder = line.source === 'order';
  return (
    <Button
      variant="text"
      aria-label={fromOrder ? 'Los cargos de órdenes se anulan cancelando la orden' : `Anular cargo ${line.itemCode}`}
      title={fromOrder ? 'Los cargos de órdenes se anulan cancelando la orden.' : 'Anular cargo'}
      disabled={fromOrder}
      onClick={onVoid}
    >
      <Ban aria-hidden className={fromOrder ? 'size-5' : 'size-5 text-error'} />
    </Button>
  );
}

function LineDiscount({ line }: { line: StatementLine }) {
  if (line.discountCents === 0) return <span className="text-body-lg text-on-surface-variant">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex h-7 items-center gap-1 rounded-full border border-status-completed-border bg-status-completed-container px-2 text-caption font-semibold text-status-completed">
        <BadgePercent aria-hidden className="size-4" /> Membresía
      </span>
      <MoneyText cents={line.discountCents} className="text-body-lg" />
    </span>
  );
}
