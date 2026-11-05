import { COVERAGE_TYPE_LABELS, INSURANCE_TERM_LABELS, STATEMENT_RULE_TEXT, STATEMENT_STATUS_LABELS, type BillingStatement, type StatementTotals } from '@clinic/shared';
import { cn, MoneyText, SemanticChip } from '@clinic/ui';
import { BadgePercent, HandCoins, Info, ShieldCheck, Wallet } from 'lucide-react';
import { STATEMENT_STATUS_TONE, totalRows } from '../../lib/billing.ts';

// Totales del estado de cuenta (S-CAJ-07 y S-CAJ-16 / S-CLI-23), tal como los
// calcula el servidor: la web no suma ni resta nada (CLAUDE.md, regla 4).
// «A cargo del seguro» va en su propia fila y no es un descuento (ADR 0035).
// T-028: un saldo negativo se muestra como «Crédito a favor» (el servidor
// manda su valor en positivo), sin el rojo de un error; en V1 no hay
// reembolsos.

/** Chip de la cobertura («Seguro · Copago») y la frase de la regla. */
export function CoverageRule({ coverage, totals }: { coverage: BillingStatement['coverage']; totals: StatementTotals }) {
  const label = coverage ? (coverage.type === 'insurance' && coverage.term ? `${COVERAGE_TYPE_LABELS.insurance} · ${INSURANCE_TERM_LABELS[coverage.term]}` : COVERAGE_TYPE_LABELS[coverage.type]) : COVERAGE_TYPE_LABELS.self_pay;
  return (
    <div className="flex flex-col gap-space-sm">
      <div className="flex flex-wrap items-center gap-space-xs">
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-status-in-care-border bg-status-in-care-container px-3 text-caption font-semibold text-status-in-care">
          <ShieldCheck aria-hidden className="size-4" /> {label}
        </span>
        {totals.rule === 'membership_applied' ? (
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-status-completed-border bg-status-completed-container px-3 text-caption font-semibold text-status-completed">
            <BadgePercent aria-hidden className="size-4" /> Beneficio de membresía
          </span>
        ) : null}
      </div>
      <p className="flex items-start gap-space-xs rounded-md bg-surface-container-low p-space-sm text-body-md text-on-surface dark:bg-surface-container">
        <Info aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
        <span data-testid="statement-rule">{STATEMENT_RULE_TEXT[totals.rule]}</span>
      </p>
    </div>
  );
}

/** Las filas de totales, el saldo destacado y el chip de estado. */
export function StatementTotalsView({ totals, className }: { totals: StatementTotals; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-space-sm rounded-md bg-surface-container-low p-space-md dark:bg-surface-container', className)} data-testid="statement-totals">
      <dl className="flex flex-col gap-space-xs">
        {totalRows(totals).map((row) => (
          <div key={row.key} className="flex items-baseline justify-between gap-space-md" data-testid={`total-${row.key}`}>
            <dt className={cn('text-body-lg text-on-surface-variant', row.strong && 'text-body-lg-medium text-on-surface')}>{row.label}</dt>
            <dd>
              <MoneyText cents={row.cents} emphasis={row.strong === true} className={cn('text-body-lg', row.strong && 'text-title-md')} />
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-space-sm border-t border-outline-variant/60 pt-space-sm" data-testid="total-balance">
        {totals.creditCents > 0 ? (
          <span className="flex items-center gap-space-xs text-title-md text-on-surface">
            <HandCoins aria-hidden className="size-5 text-primary" /> Crédito a favor
          </span>
        ) : (
          <span className="flex items-center gap-space-xs text-title-md text-on-surface">
            <Wallet aria-hidden className="size-5 text-primary" /> Saldo
          </span>
        )}
        <span className="flex flex-wrap items-center gap-space-sm">
          <SemanticChip tone={STATEMENT_STATUS_TONE[totals.status]} label={STATEMENT_STATUS_LABELS[totals.status]} />
          <MoneyText cents={totals.creditCents > 0 ? totals.creditCents : totals.balanceCents} className="text-headline-md font-bold text-on-surface" />
        </span>
      </div>
    </div>
  );
}
