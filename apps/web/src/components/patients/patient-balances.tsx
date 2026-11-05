import { MEMBERSHIP_FEE_KIND_LABELS, STATEMENT_STATUS_LABELS, VISIT_STATUS_LABELS, type PatientBalanceFee, type PatientBalances } from '@clinic/shared';
import { AsyncView, Button, CodeText, DateTimeText, EmptyState, MoneyText, SemanticChip, useSnackbar } from '@clinic/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BadgeCheck, ClipboardList, ReceiptText, Wallet } from 'lucide-react';
import { useState } from 'react';
import { api, type ApiError } from '../../lib/api.ts';
import { STATEMENT_STATUS_TONE } from '../../lib/billing.ts';
import { formatDay } from '../../lib/catalog.ts';
import { PayFeeDialog } from '../billing/pay-fee-dialog.tsx';

// S-CAJ-17 / S-PAC-10 Pestaña «Saldos» del perfil (T-028; ADR 0004 y 0034).
// Ficha del manual; Stitch no tiene diseño propio (sigue la pestaña del
// perfil de S-PAC-05).
//  - Las visitas con saldo del paciente en las sedes de quien mira (las
//    filtra el servidor), de la más reciente a la más antigua, con «Total»,
//    «Pagado», «Saldo» y el estado; todo del servidor. Sin total agregado: la
//    web no suma (manual). Una visita «Cancelada» no aparece: su estado de
//    cuenta está anulado (ADR 0042); «Se retiró» sí.
//  - Las cuotas de membresía pendientes de las que es titular.
//  - Recepción: «Cobrar» (la Caja de la visita, en su sede; la cuota, aquí
//    mismo). El Proveedor solo mira, con «Abrir visita». Enfermería no ve la
//    pestaña (en el manual la veía y siempre daba error).
//  - Se relee con `billing.changed` (session.ts) y al cobrar.

export function PatientBalancesTab({ patientId, timeZone }: { patientId: string; timeZone: string }) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const [paying, setPaying] = useState<PatientBalanceFee | null>(null);
  const query = useQuery<PatientBalances, ApiError>({
    queryKey: ['patient-balances', patientId],
    queryFn: () => api.patientBalances(patientId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  return (
    <AsyncView source={query} loading="skeleton">
      {(data) =>
        data.visits.length === 0 && data.fees.length === 0 ? (
          <EmptyState icon={Wallet} title="No hay saldos pendientes." />
        ) : (
          <div className="flex flex-col gap-space-lg" data-testid="patient-balances">
            {data.visits.length > 0 ? (
              <section aria-label="Visitas con saldo" className="flex flex-col gap-space-sm">
                <h3 className="flex items-center gap-space-xs text-body-lg-medium text-on-surface">
                  <ReceiptText aria-hidden className="size-5 text-primary" /> Visitas con saldo
                </h3>
                <ul className="flex flex-col gap-space-sm">
                  {data.visits.map((v) => (
                    <li
                      key={v.encounterId}
                      className="flex flex-wrap items-center justify-between gap-space-md rounded-md border border-outline-variant/60 bg-surface-container-lowest p-space-md dark:bg-surface-container-low"
                      data-testid="balance-visit"
                      data-code={v.code}
                    >
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-space-xs">
                          <CodeText code={v.code} />
                          <SemanticChip tone={STATEMENT_STATUS_TONE[v.statementStatus]} label={STATEMENT_STATUS_LABELS[v.statementStatus]} />
                        </span>
                        <span className="text-body-md text-on-surface-variant">
                          {`${v.location.code} · `}
                          <DateTimeText value={v.arrivedAt} timeZone={timeZone} format="date" />
                          {` · ${VISIT_STATUS_LABELS[v.status]}`}
                        </span>
                      </span>
                      <dl className="flex flex-wrap items-end gap-space-md">
                        <Amount label="Total" cents={v.totalDueCents} />
                        <Amount label="Pagado" cents={v.paidCents} />
                        <Amount label="Saldo" cents={v.balanceCents} strong />
                      </dl>
                      {data.canCollect ? (
                        <Link
                          to="/app/$sede/caja/$id"
                          params={{ sede: v.location.code, id: v.encounterId }}
                          className="flex min-h-touch items-center gap-space-xs rounded-md bg-primary px-space-md text-body-lg-medium text-on-primary hover:opacity-90"
                        >
                          <Wallet aria-hidden className="size-5" /> Cobrar
                        </Link>
                      ) : (
                        <Link
                          to="/app/$sede/visitas/$id"
                          params={{ sede: v.location.code, id: v.encounterId }}
                          className="flex min-h-touch items-center gap-space-xs rounded-md bg-surface-container px-space-md text-body-lg-medium text-primary hover:bg-surface-container-high"
                        >
                          <ClipboardList aria-hidden className="size-5" /> Abrir visita
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {data.fees.length > 0 ? (
              <section aria-label="Cuotas de membresía pendientes" className="flex flex-col gap-space-sm">
                <h3 className="flex items-center gap-space-xs text-body-lg-medium text-on-surface">
                  <BadgeCheck aria-hidden className="size-5 text-primary" /> Cuotas de membresía pendientes
                </h3>
                <ul className="flex flex-col gap-space-sm">
                  {data.fees.map((f) => (
                    <li
                      key={f.feeId}
                      className="flex flex-wrap items-center justify-between gap-space-md rounded-md border border-outline-variant/60 bg-surface-container-lowest p-space-md dark:bg-surface-container-low"
                      data-testid="balance-fee"
                      data-kind={f.kind}
                    >
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-space-xs text-body-lg text-on-surface">
                          {`${MEMBERSHIP_FEE_KIND_LABELS[f.kind]} · ${f.planName}`} <CodeText code={f.membershipCode} />
                        </span>
                        <span className="text-body-md text-on-surface-variant">{`Vence ${formatDay(f.dueDate)}`}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-space-md">
                        <MoneyText cents={f.amountCents} className="text-title-md font-bold text-on-surface" />
                        {data.canCollect ? (
                          <Button onClick={() => { setPaying(f); }}>
                            <Wallet aria-hidden className="size-5" /> Cobrar
                          </Button>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {paying ? (
              <PayFeeDialog
                fee={{ id: paying.feeId, kind: paying.kind, dueDate: paying.dueDate, amountCents: paying.amountCents, version: paying.version }}
                onClose={() => { setPaying(null); }}
                onPaid={() => {
                  setPaying(null);
                  snackbar({ message: 'Cuota pagada.' });
                  void queryClient.invalidateQueries({ queryKey: ['patient-balances', patientId] });
                  void queryClient.invalidateQueries({ queryKey: ['patient-membership'] });
                }}
              />
            ) : null}
          </div>
        )
      }
    </AsyncView>
  );
}

function Amount({ label, cents, strong = false }: { label: string; cents: number; strong?: boolean }) {
  return (
    <div className="flex flex-col items-end">
      <dt className="text-caption tracking-wide text-on-surface-variant uppercase">{label}</dt>
      <dd>
        <MoneyText cents={cents} className={strong ? 'text-title-md font-bold text-on-surface' : 'text-body-lg text-on-surface'} />
      </dd>
    </div>
  );
}
