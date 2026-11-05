import type { BillingStatement, StatementLine } from '@clinic/shared';
import { AsyncView, Button, CodeText, MoneyText, useSnackbar, VisitStatusChip } from '@clinic/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { ArrowLeft, CircleCheckBig, ClipboardList, Play, RefreshCw, UserRound } from 'lucide-react';
import { useState } from 'react';
import { AddChargeDialog } from '../components/billing/add-charge-dialog.tsx';
import { CompleteVisitDialog } from '../components/billing/complete-visit-dialog.tsx';
import { PaymentsCard } from '../components/billing/payments-card.tsx';
import { StatementCard } from '../components/billing/statement-card.tsx';
import { VoidDialog } from '../components/billing/void-dialog.tsx';
import { OpenOrdersDialog } from '../components/encounters/open-orders-dialog.tsx';
import { api, type ApiError } from '../lib/api.ts';
import { BILLING_CONFLICT_TEXT, billingMessage, pendingBalance, VOID_CHARGE_PAID_TEXT } from '../lib/billing.ts';
import { isOpenOrders, isVersionConflict, VERSION_CONFLICT_TEXT } from '../lib/encounters.ts';
import { useActiveLocation } from '../lib/session.ts';

// S-CAJ-03 Caja de la visita (Stitch: design/stitch/caja/S-CAJ-03_caja_de_la_visita), T-027,
// con S-CAJ-04 (barra de estado), S-CAJ-05 (completar con saldo), S-CAJ-06
// (órdenes abiertas), S-CAJ-07 (estado de cuenta) y S-CAJ-08 (agregar cargo).
//  - Recepción (checkout.access). De Stitch: «Atrás», el nombre del paciente
//    con «Caja · {código}», el chip de estado y «Completar visita» arriba, y el
//    estado de cuenta, y a la derecha la tarjeta «Pagos» (T-028, S-CAJ-11 y
//    12). La tarjeta «Recibos» llega con T-029.
//  - T-028: la abre también quien anula (Propietario o Administrador con un
//    rol clínico, ADR 0033), que ve el estado de cuenta completo y «Anular»
//    pero solo cobra si además tiene Recepción. Se cobra también con la
//    visita completada o «Se retiró» (ADR 0004 y 0042).
//  - Se puede agregar cargos en cualquier estado abierto (cobro anticipado);
//    con la visita cerrada, solo lectura.
//  - «Completar visita» con saldo: el servidor lo rechaza con el saldo y se
//    pide confirmación (S-CAJ-05); sin saldo, se completa directamente.
//  - Al abrir el estado de cuenta, el servidor recalcula los beneficios de
//    membresía. Se relee con `billing.changed` y `encounter.changed`.
//  - Nada se guarda en el navegador; la web no suma importes.

export function CheckoutPage({ sede, encounterId }: { sede: string; encounterId: string }) {
  const active = useActiveLocation();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<null | 'charge' | 'open-orders'>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [voidingCharge, setVoidingCharge] = useState<StatementLine | null>(null);
  const statement = useQuery<BillingStatement, ApiError>({
    queryKey: ['statement', encounterId],
    queryFn: () => api.statement(encounterId),
    enabled: active?.code === sede,
    staleTime: 0,
    gcTime: 0,
    retry: (failures: number, error: ApiError) => error.status >= 500 && failures < 2,
  });

  const reload = async () => {
    await queryClient.invalidateQueries({ queryKey: ['statement', encounterId] });
    void queryClient.invalidateQueries({ queryKey: ['checkout-queue'] });
    void queryClient.invalidateQueries({ queryKey: ['encounter', encounterId] });
  };

  const move = async (s: BillingStatement, action: 'start_checkout' | 'complete', acknowledgeBalance = false) => {
    setBusy(true);
    try {
      await api.encounterTransition(s.encounter.id, { action, expectedVersion: s.encounter.version, ...(acknowledgeBalance ? { acknowledgeBalance: true } : {}) });
      setBalance(null);
      snackbar({ message: action === 'complete' ? 'Visita completada.' : 'Caja iniciada.' });
    } catch (error) {
      const pending = pendingBalance(error);
      if (pending !== null) setBalance(pending);
      else if (isOpenOrders(error)) setDialog('open-orders');
      else snackbar({ message: isVersionConflict(error) ? VERSION_CONFLICT_TEXT : billingMessage(error) });
    } finally {
      setBusy(false);
      await reload();
    }
  };

  const back = () => {
    if (window.history.length > 1) router.history.back();
    else void navigate({ to: '/app/$sede/caja', params: { sede } });
  };

  const s = statement.data;
  return (
    <section aria-labelledby="page-title" className="mx-auto flex w-full max-w-7xl flex-col gap-space-lg">
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex min-w-0 flex-wrap items-center gap-space-md">
          <Button variant="tonal" onClick={back}>
            <ArrowLeft aria-hidden className="size-5" /> Atrás
          </Button>
          <div className="flex min-w-0 flex-col">
            <h1 id="page-title" className="text-headline-lg text-on-surface">
              {s?.patient ? `${s.patient.firstName} ${s.patient.lastName}` : 'Caja'}
            </h1>
            <p className="flex flex-wrap items-center gap-space-xs text-body-md text-on-surface-variant">
              Caja {s ? <CodeText code={s.encounter.code} /> : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm">
          <Button variant="text" aria-label="Actualizar" disabled={statement.isFetching} onClick={() => void reload()}>
            <RefreshCw aria-hidden className="size-5" />
          </Button>
          <Link
            to="/app/$sede/visitas/$id"
            params={{ sede, id: encounterId }}
            className="flex min-h-touch items-center gap-space-xs rounded-md bg-surface-container px-space-md text-body-lg-medium text-primary hover:bg-surface-container-high"
          >
            <ClipboardList aria-hidden className="size-5" /> Abrir visita
          </Link>
          {s?.patient ? (
            <Link
              to="/app/$sede/pacientes/$id"
              params={{ sede, id: s.patient.id }}
              className="flex min-h-touch items-center gap-space-xs rounded-md bg-surface-container px-space-md text-body-lg-medium text-primary hover:bg-surface-container-high"
            >
              <UserRound aria-hidden className="size-5" /> Abrir perfil del paciente
            </Link>
          ) : null}
        </div>
      </div>

      <AsyncView source={statement}>
        {(d) => (
          <>
            <div className="flex flex-wrap items-center justify-between gap-space-sm rounded-lg bg-surface-container-lowest p-space-md shadow-level-1 dark:bg-surface-container-low" data-testid="checkout-bar">
              <span className="flex flex-wrap items-center gap-space-sm">
                <CodeText code={d.encounter.code} />
                <VisitStatusChip status={d.encounter.status} />
              </span>
              {d.encounter.status === 'READY_FOR_CHECKOUT' ? (
                <Button loading={busy} onClick={() => void move(d, 'start_checkout')}>
                  <Play aria-hidden className="size-5" /> Iniciar caja
                </Button>
              ) : d.encounter.status === 'CHECKOUT' ? (
                <Button loading={busy} onClick={() => void move(d, 'complete')}>
                  <CircleCheckBig aria-hidden className="size-5" /> Completar visita
                </Button>
              ) : null}
            </div>
            <div className="grid items-start gap-space-lg desk:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <StatementCard statement={d} onAddCharge={() => { setDialog('charge'); }} onVoidCharge={setVoidingCharge} />
              <PaymentsCard statement={d} timeZone={active?.timezone ?? 'UTC'} onChanged={reload} />
            </div>
            {voidingCharge ? (
              <VoidDialog
                title="Anular cargo"
                summary={
                  <p className="flex items-center justify-between gap-space-sm text-body-lg text-on-surface">
                    <span className="font-mono">{`${voidingCharge.itemCode} · Cant. ${String(voidingCharge.quantity)}`}</span>
                    <MoneyText cents={voidingCharge.lineTotalCents} className="font-bold" />
                  </p>
                }
                warnings={[VOID_CHARGE_PAID_TEXT]}
                onClose={() => { setVoidingCharge(null); }}
                onConfirm={async (reason, key) => {
                  try {
                    await api.voidCharge(voidingCharge.id, { reason, expectedVersion: d.statementVersion }, key);
                    snackbar({ message: 'Cargo anulado.' });
                  } catch (error) {
                    snackbar({ message: billingMessage(error) });
                  } finally {
                    await reload();
                  }
                }}
              />
            ) : null}
            {dialog === 'charge' ? (
              <AddChargeDialog
                encounterId={d.encounter.id}
                statementVersion={d.statementVersion}
                onClose={() => { setDialog(null); }}
                onAdded={() => {
                  setDialog(null);
                  snackbar({ message: 'Cargo agregado.' });
                  void reload();
                }}
                onConflict={() => {
                  setDialog(null);
                  snackbar({ message: BILLING_CONFLICT_TEXT });
                  void reload();
                }}
              />
            ) : null}
            <OpenOrdersDialog
              open={dialog === 'open-orders'}
              onClose={() => { setDialog(null); }}
              onGoToOrders={() => void navigate({ to: '/app/$sede/visitas/$id', params: { sede, id: encounterId }, search: { section: 'orders' } })}
            />
            <CompleteVisitDialog balanceCents={balance} onClose={() => { setBalance(null); }} onConfirm={() => move(d, 'complete', true)} />
          </>
        )}
      </AsyncView>
    </section>
  );
}
