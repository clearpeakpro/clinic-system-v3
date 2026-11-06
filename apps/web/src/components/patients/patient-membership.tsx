import {
  BILLING_DAYS,
  MEMBERSHIP_EVENT_LABELS,
  MEMBERSHIP_FEE_KIND_LABELS,
  MEMBERSHIP_FEE_STATUS_LABELS,
  MEMBERSHIP_MEMBER_ROLE_LABELS,
  parsePatientQuery,
  PATIENT_QUERY_ERRORS,
  PAYMENT_METHOD_LABELS,
  type EnrollablePlan,
  type MembershipFeeView,
  type MembershipFeeStatus,
  type PatientMembershipCard,
  type PatientMembershipView,
  type PatientSummary,
} from '@clinic/shared';
import {
  AsyncView,
  Banner,
  Button,
  Checkbox,
  CodeText,
  ConfirmDialog,
  DateTimeText,
  Dialog,
  DiscardChangesDialog,
  EmptyState,
  Field,
  MoneyText,
  SelectField,
  SemanticChip,
  Spinner,
  useSnackbar,
} from '@clinic/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, BadgeCheck, CalendarClock, IdCard, ReceiptText, Search, ShieldCheck, UserMinus, UserPlus, Users, Wallet, X } from 'lucide-react';
import { useRef, useState, type ComponentType, type ReactNode, type SubmitEvent } from 'react';
import { api, type ApiError } from '../../lib/api.ts';
import { newIdempotencyKey } from '../../lib/appointments.ts';
import { billingMessage, maskedReference, VOID_CANCELS_MEMBERSHIP_TEXT, VOID_PAYMENT_RECEIPTS_TEXT } from '../../lib/billing.ts';
import { formatDay } from '../../lib/catalog.ts';
import { firstDueText, MEMBERSHIP_STATUS_TONES, membershipMessage, membershipStatusDetail, membershipStatusLabel } from '../../lib/memberships.ts';
import { useMe } from '../../lib/session.ts';
import { useUnsavedChanges } from '../../lib/unsaved.ts';
import { PayFeeDialog } from '../billing/pay-fee-dialog.tsx';
import { ReceiptsCard } from '../billing/receipts-card.tsx';
import { VoidDialog } from '../billing/void-dialog.tsx';

// S-PAC-22 Tarjeta «Membresía» del perfil y S-PAC-23 «Inscribir en un plan»
// (T-026b parte B; ADR 0034). Fichas nuevas del manual: Stitch no tiene
// diseño; siguen las tarjetas del Resumen (S-PAC-06) y los diálogos de
// packages/ui.
//  - La ven los cuatro roles (patients.access); inscriben, añaden o quitan
//    afiliados y registran el aviso de cancelación quienes tienen
//    memberships.manage (Recepción). Lo decide el servidor (`abilities`).
//  - Estado con icono + texto + color, calculado por el servidor con el reloj.
//  - Las cuotas, en centavos del servidor: aquí solo se les da formato.
//  - T-028: «Cobrar» cada cuota pendiente (Recepción, completa) y «Anular
//    pago» (Propietario o Administrador con un rol clínico, ADR 0033). Si
//    anular cancelaría la membresía, el diálogo lo avisa antes (decisión del
//    2026-11-05).
//  - T-029: «Recibos» en cada cuota pagada (o anulada): generar el recibo de
//    la cuota (Recepción) y verlo, imprimirlo o reimprimirlo (también el
//    Propietario o el Administrador con un rol clínico).
//  - «Identidad verificada» es obligatoria: Recepción mira el documento; el
//    sistema no guarda números de ID ni datos de tarjeta.
//  - Afiliados (plan Familiar): pacientes ya registrados, buscados como en
//    Pacientes (por nombre o código).

const FEE_TONES: Record<MembershipFeeStatus, 'warning' | 'success' | 'neutral'> = { pending: 'warning', paid: 'success', voided: 'neutral' };

/** El marco de tarjeta del Resumen (S-PAC-06). */
export type SummaryCard = ComponentType<{ icon: ReactNode; title: string; action?: ReactNode; children: ReactNode }>;

export function PatientMembershipCardView({ patientId, timeZone, card: Card }: { patientId: string; timeZone: string; card: SummaryCard }) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const query = useQuery<PatientMembershipCard, ApiError>({
    queryKey: ['patient-membership', patientId],
    queryFn: () => api.patientMembership(patientId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const [dialog, setDialog] = useState<null | 'enroll' | 'add' | 'cancel' | { remove: { patientId: string; name: string } }>(null);
  const [paying, setPaying] = useState<MembershipFeeView | null>(null);
  const [voiding, setVoiding] = useState<MembershipFeeView | null>(null);
  const [receiptsFor, setReceiptsFor] = useState<MembershipFeeView | null>(null);
  const permissions = useMe().data?.permissions ?? [];
  const canReceipts = permissions.includes('receipts.print') && permissions.includes('patients.access');
  const reload = async (message?: string) => {
    setDialog(null);
    await queryClient.invalidateQueries({ queryKey: ['patient-membership'] });
    void queryClient.invalidateQueries({ queryKey: ['patient-balances'] });
    if (message) snackbar({ message });
  };
  const fail = (error: unknown) => {
    snackbar({ message: membershipMessage(error) });
    void query.refetch();
  };
  const m = query.data?.membership ?? null;
  const enroll = query.data?.canEnroll ? (
    <Button variant="text" onClick={() => { setDialog('enroll'); }}>
      <UserPlus aria-hidden className="size-5" /> Inscribir en un plan
    </Button>
  ) : null;

  return (
    <>
      <Card icon={<BadgeCheck className="size-6" />} title="Membresía" action={enroll}>
        <AsyncView source={query} loading="skeleton">
          {(data) =>
            data.membership ? (
              <MembershipBody
                membership={data.membership}
                timeZone={timeZone}
                onAdd={() => { setDialog('add'); }}
                onCancel={() => { setDialog('cancel'); }}
                onRemove={(p) => { setDialog({ remove: p }); }}
                onPayFee={setPaying}
                onVoidFeePayment={setVoiding}
                onReceipts={canReceipts ? setReceiptsFor : null}
              />
            ) : (
              <EmptyState icon={BadgeCheck} title="Sin membresía." description="Este paciente no está inscrito en ningún plan." />
            )
          }
        </AsyncView>
      </Card>
      {dialog === 'enroll' ? <EnrollDialog patientId={patientId} onClose={() => { setDialog(null); }} onSaved={() => void reload('Paciente inscrito. Cobre la cuota inicial para activar la membresía.')} /> : null}
      {paying ? (
        <PayFeeDialog
          fee={paying}
          onClose={() => { setPaying(null); }}
          onPaid={() => {
            setPaying(null);
            void reload('Cuota pagada.');
          }}
        />
      ) : null}
      {voiding?.payment ? (
        <VoidDialog
          title="Anular pago"
          summary={
            <p className="flex items-center justify-between gap-space-sm text-body-lg text-on-surface">
              {`${MEMBERSHIP_FEE_KIND_LABELS[voiding.kind]} · ${PAYMENT_METHOD_LABELS[voiding.payment.method]}`}
              <MoneyText cents={voiding.payment.amountCents} className="font-bold" />
            </p>
          }
          danger={voiding.voidCancelsMembership ? VOID_CANCELS_MEMBERSHIP_TEXT : null}
          warnings={['La cuota vuelve a quedar pendiente y el estado de la membresía se recalcula.', VOID_PAYMENT_RECEIPTS_TEXT]}
          onClose={() => { setVoiding(null); }}
          onConfirm={async (reason, key) => {
            const target = voiding;
            try {
              await api.voidPayment(target.payment?.id ?? '', { reason, expectedVersion: target.version }, key);
              setVoiding(null);
              await reload('Pago anulado.');
            } catch (error) {
              setVoiding(null);
              snackbar({ message: billingMessage(error) });
              void query.refetch();
            }
          }}
        />
      ) : null}
      {receiptsFor ? (
        <Dialog
          open
          wide
          sheetOnPhone
          onOpenChange={(open) => { if (!open) setReceiptsFor(null); }}
          icon={<ReceiptText className="size-7" />}
          title={`Recibos · ${MEMBERSHIP_FEE_KIND_LABELS[receiptsFor.kind]}`}
          description={`Vence ${formatDay(receiptsFor.dueDate)}`}
          footer={
            <Button variant="text" onClick={() => { setReceiptsFor(null); }}>
              Cerrar
            </Button>
          }
        >
          <ReceiptsCard target={{ kind: 'fee', id: receiptsFor.id }} timeZone={timeZone} bare />
        </Dialog>
      ) : null}
      {dialog === 'add' && m ? <AddAffiliateDialog membership={m} onClose={() => { setDialog(null); }} onSaved={() => void reload('Afiliado añadido.')} /> : null}
      {m && dialog === 'cancel' ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) setDialog(null); }}
          title="Registrar aviso de cancelación"
          confirmLabel="Registrar aviso"
          destructive
          description={
            m.status === 'pending_payment'
              ? 'La membresía aún no se ha pagado: se cancela ahora y se anula la cuota inicial.'
              : 'Con 15 días o más antes del próximo cobro, los beneficios valen hasta el día anterior. Con menos, esa mensualidad se debe igual y los beneficios duran un mes más.'
          }
          onConfirm={async () => {
            try {
              const result = await api.cancelMembership(m.id, m.version);
              await reload(
                result.status === 'cancelled'
                  ? 'Membresía cancelada.'
                  : `Aviso registrado. Beneficios hasta el ${formatDay(result.benefitsEndDate ?? '')}.${result.owedDueDate ? ` Se debe la mensualidad del ${formatDay(result.owedDueDate)}.` : ''}`,
              );
            } catch (error) {
              setDialog(null);
              fail(error);
            }
          }}
        />
      ) : null}
      {m && dialog !== null && typeof dialog === 'object' ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) setDialog(null); }}
          title="Quitar afiliado"
          confirmLabel="Quitar"
          destructive
          description={`${dialog.remove.name} deja de tener los beneficios de esta membresía desde hoy. Lo ya usado no cambia.`}
          onConfirm={async () => {
            try {
              await api.removeMembershipMember(m.id, dialog.remove.patientId, m.version);
              await reload('Afiliado quitado.');
            } catch (error) {
              setDialog(null);
              fail(error);
            }
          }}
        />
      ) : null}
    </>
  );
}

function MembershipBody({
  membership: m,
  timeZone,
  onAdd,
  onCancel,
  onRemove,
  onPayFee,
  onVoidFeePayment,
  onReceipts,
}: {
  membership: PatientMembershipView;
  timeZone: string;
  onAdd: () => void;
  onCancel: () => void;
  onRemove: (person: { patientId: string; name: string }) => void;
  onPayFee: (fee: MembershipFeeView) => void;
  onVoidFeePayment: (fee: MembershipFeeView) => void;
  /** T-029: los recibos de la cuota; nulo si quien mira no los ve. */
  onReceipts: ((fee: MembershipFeeView) => void) | null;
}) {
  const detail = membershipStatusDetail(m);
  return (
    <div className="flex flex-col gap-space-md">
      <div className="flex flex-wrap items-center gap-space-sm">
        <span className="text-headline-sm text-on-surface">{m.plan.name}</span>
        <SemanticChip tone={MEMBERSHIP_STATUS_TONES[m.status]} label={membershipStatusLabel(m.status)} />
        <CodeText code={m.code} />
      </div>
      {detail ? <Banner tone={m.status === 'suspended' ? 'error' : 'info'} title={detail} /> : null}
      <dl className="grid gap-space-md tab:grid-cols-3">
        <Pair label="Inicio">{formatDay(m.startDate)}</Pair>
        <Pair label="Día de cobro">{`Día ${String(m.billingDay)} de cada mes`}</Pair>
        <Pair label="Año de beneficios">{`${formatDay(m.benefitYear.start)} – ${formatDay(m.benefitYear.end)}`}</Pair>
        <Pair label="Cuota inicial">
          <MoneyText cents={m.initialFeeCents} />
        </Pair>
        <Pair label="Mensualidad (monto fijo)">
          <MoneyText cents={m.monthlyFeeCents} />
        </Pair>
        <Pair label="Inscrita en">{`${m.location.name} (${m.location.code}) · ${formatDay(m.enrolledOn)}`}</Pair>
      </dl>
      <p className="flex items-center gap-space-xs text-body-md text-on-surface-variant">
        <ShieldCheck aria-hidden className="size-5 text-primary" /> Identidad verificada por {m.identityVerified.by ?? 'el personal'} · <DateTimeText value={m.identityVerified.at} timeZone={timeZone} format="date" />
      </p>

      <section aria-label="Personas de la membresía" className="flex flex-col gap-space-sm">
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <h3 className="flex items-center gap-space-xs text-body-lg-medium text-on-surface">
            <Users aria-hidden className="size-5 text-primary" /> Personas ({m.members.length} de {m.plan.maxMembers})
          </h3>
          {m.abilities.addMember ? (
            <Button variant="tonal" onClick={onAdd}>
              <UserPlus aria-hidden className="size-5" /> Añadir afiliado
            </Button>
          ) : null}
        </div>
        <ul className="flex flex-col divide-y divide-outline-variant rounded-md bg-surface-container-low dark:bg-surface-container">
          {m.members.map((p) => (
            <li key={p.patientId} className="flex flex-wrap items-center justify-between gap-space-sm px-space-md py-space-sm">
              <span className="flex flex-wrap items-center gap-space-sm">
                <span className="text-body-lg text-on-surface">
                  {p.firstName} {p.lastName}
                </span>
                <CodeText code={p.code} />
                <SemanticChip tone={p.role === 'holder' ? 'info' : 'neutral'} label={MEMBERSHIP_MEMBER_ROLE_LABELS[p.role]} />
              </span>
              {m.abilities.removeMember && p.role === 'affiliate' ? (
                <Button variant="text" onClick={() => { onRemove({ patientId: p.patientId, name: `${p.firstName} ${p.lastName}` }); }} aria-label={`Quitar a ${p.firstName} ${p.lastName}`}>
                  <UserMinus aria-hidden className="size-5" /> Quitar
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Cuotas" className="flex flex-col gap-space-sm">
        <h3 className="flex items-center gap-space-xs text-body-lg-medium text-on-surface">
          <CalendarClock aria-hidden className="size-5 text-primary" /> Cuotas
        </h3>
        <p className="text-caption text-on-surface-variant">Se cobran completas con la terminal de la clínica. El sistema no guarda datos de tarjeta.</p>
        <ul className="flex flex-col divide-y divide-outline-variant rounded-md bg-surface-container-low dark:bg-surface-container">
          {m.fees.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-space-sm px-space-md py-space-sm" data-testid="membership-fee" data-kind={f.kind} data-status={f.status}>
              <span className="flex flex-col">
                <span className="text-body-md-medium text-on-surface">{MEMBERSHIP_FEE_KIND_LABELS[f.kind]}</span>
                <span className="text-caption text-on-surface-variant">
                  Vence {formatDay(f.dueDate)} · cubre del {formatDay(f.periodStart)} al {formatDay(f.periodEnd)}
                </span>
                {f.payment ? (
                  <span className="text-caption text-on-surface-variant">
                    {`Pagada: ${PAYMENT_METHOD_LABELS[f.payment.method]} · `}
                    <DateTimeText value={f.payment.recordedAt} timeZone={timeZone} />
                    {f.payment.referenceLast4 ? ` · ${maskedReference(f.payment.referenceLast4) ?? ''}` : ''}
                  </span>
                ) : null}
              </span>
              <span className="flex flex-wrap items-center gap-space-sm">
                <MoneyText cents={f.amountCents} />
                <SemanticChip tone={FEE_TONES[f.status]} label={MEMBERSHIP_FEE_STATUS_LABELS[f.status]} />
                {f.status === 'pending' && m.abilities.payFee ? (
                  <Button variant="tonal" onClick={() => { onPayFee(f); }}>
                    <Wallet aria-hidden className="size-5" /> Cobrar
                  </Button>
                ) : null}
                {onReceipts && f.status !== 'pending' ? (
                  <Button variant="text" aria-label={`Recibos de la cuota: ${MEMBERSHIP_FEE_KIND_LABELS[f.kind]}`} title="Recibos" onClick={() => { onReceipts(f); }}>
                    <ReceiptText aria-hidden className="size-5" /> Recibos
                  </Button>
                ) : null}
                {f.payment && m.abilities.voidFeePayment ? (
                  <Button variant="text" aria-label="Anular pago" title="Anular pago" onClick={() => { onVoidFeePayment(f); }}>
                    <Ban aria-hidden className="size-5 text-error" />
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <details className="rounded-md bg-surface-container-low px-space-md py-space-sm dark:bg-surface-container">
        <summary className="min-h-touch cursor-pointer content-center text-body-md-medium text-on-surface">Historial de la membresía</summary>
        <ol className="flex flex-col gap-space-xs pb-space-sm">
          {m.history.map((h) => (
            <li key={h.id} className="text-body-md text-on-surface">
              <DateTimeText value={h.occurredAt} timeZone={timeZone} /> · {MEMBERSHIP_EVENT_LABELS[h.action]}
              {h.patientCode ? ` (${h.patientCode})` : ''} · {h.actor.kind === 'system' ? 'Sistema' : h.actor.kind === 'me' ? 'Usted' : (h.actor.name ?? 'Personal')}
            </li>
          ))}
        </ol>
      </details>

      {m.abilities.cancel ? (
        <div className="flex justify-end">
          <Button variant="outline" onClick={onCancel}>
            <X aria-hidden className="size-5" /> Registrar aviso de cancelación
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Pair({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption text-on-surface-variant">{label}</dt>
      <dd className="text-body-lg-medium text-on-surface">{children}</dd>
    </div>
  );
}

/** Buscar pacientes registrados para afiliarlos (por nombre o código, como en Pacientes). */
function PatientPicker({ exclude, onPick, disabled }: { exclude: string[]; onPick: (p: PatientSummary) => void; disabled?: boolean }) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<PatientSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const search = async () => {
    const parsed = parsePatientQuery(text);
    if (!parsed.ok) {
      setError(parsed.error === 'empty' ? null : PATIENT_QUERY_ERRORS[parsed.error]);
      setResults(null);
      return;
    }
    const current = (request.current += 1);
    setBusy(true);
    setError(null);
    try {
      const found = await api.searchPatients(text, 0);
      if (current === request.current) setResults(found.patients.slice(0, 8));
    } catch (e) {
      if (current === request.current) setError(membershipMessage(e));
    } finally {
      if (current === request.current) setBusy(false);
    }
  };
  const shown = (results ?? []).filter((p) => !exclude.includes(p.id));
  return (
    <div className="flex flex-col gap-space-sm">
      <div className="flex items-end gap-space-sm">
        <div className="flex-1">
          <Field
            label="Buscar paciente"
            hint="Nombre y apellido, o código (P-000123)."
            autoComplete="off"
            value={text}
            disabled={disabled}
            error={error}
            onChange={(e) => { setText(e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void search();
              }
            }}
          />
        </div>
        <Button variant="tonal" disabled={disabled} loading={busy} onClick={() => void search()} aria-label="Buscar">
          <Search aria-hidden className="size-5" />
        </Button>
      </div>
      {busy ? <Spinner /> : null}
      {results !== null && shown.length === 0 && !busy ? <p className="text-body-md text-on-surface-variant">No se encontraron pacientes.</p> : null}
      {shown.length > 0 ? (
        <ul className="flex flex-col divide-y divide-outline-variant rounded-md bg-surface-container-low dark:bg-surface-container">
          {shown.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-space-sm px-space-md py-space-xs">
              <span className="flex flex-wrap items-center gap-space-sm">
                <span className="text-body-md text-on-surface">
                  {p.firstName} {p.lastName}
                </span>
                <CodeText code={p.code} />
                <span className="text-caption text-on-surface-variant">{formatDay(p.birthDate)}</span>
              </span>
              <Button variant="text" disabled={disabled || p.status !== 'active'} onClick={() => { onPick(p); }} aria-label={`Añadir a ${p.firstName} ${p.lastName}`}>
                <UserPlus aria-hidden className="size-5" /> Añadir
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** S-PAC-23 «Inscribir en un plan». */
function EnrollDialog({ patientId, onClose, onSaved }: { patientId: string; onClose: () => void; onSaved: () => void }) {
  const options = useQuery({ queryKey: ['enrollment-options'], queryFn: () => api.enrollmentOptions(), staleTime: 0, gcTime: 0, retry: false });
  const [planId, setPlanId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [billingDay, setBillingDay] = useState('');
  const [affiliates, setAffiliates] = useState<PatientSummary[]>([]);
  const [identity, setIdentity] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [discard, setDiscard] = useState(false);
  const lastSent = useRef<{ body: string; key: string } | null>(null);
  const today = options.data?.today ?? '';
  const start = startDate || today;
  const plan: EnrollablePlan | undefined = options.data?.plans.find((p) => p.id === planId);
  const day = Number(billingDay);
  const dirty = planId !== '' || startDate !== '' || billingDay !== '' || affiliates.length > 0 || identity;
  useUnsavedChanges(dirty);

  const errors: Partial<Record<'plan' | 'startDate' | 'billingDay' | 'identity' | 'affiliates', string>> = {};
  if (!plan) errors.plan = 'Elija un plan.';
  if (options.data && (start < options.data.today || start > options.data.maxStartDate)) errors.startDate = 'La fecha de inicio debe ser hoy o hasta 30 días después.';
  if (!(day >= 1 && day <= 31)) errors.billingDay = 'Elija el día de cobro.';
  if (!identity) errors.identity = 'Verifique la identidad del titular antes de inscribir.';
  if (plan && affiliates.length + 1 > plan.maxMembers) errors.affiliates = `El plan admite hasta ${String(plan.maxMembers)} personas.`;
  const shown = (key: keyof typeof errors) => (submitted ? (errors[key] ?? null) : null);

  const requestClose = () => {
    if (busy) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    const input = { planId, startDate: start, billingDay: day, affiliatePatientIds: affiliates.map((a) => a.id), identityVerified: true as const };
    const body = JSON.stringify(input);
    if (lastSent.current?.body !== body) lastSent.current = { body, key: newIdempotencyKey() };
    setBusy(true);
    setServerError(null);
    try {
      await api.enrollMembership(patientId, input, lastSent.current.key);
      onSaved();
    } catch (error) {
      setServerError(membershipMessage(error));
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => { if (!open) requestClose(); }}
        dismissible={false}
        wide
        fullScreenOnPhone
        icon={<BadgeCheck className="size-7" />}
        title="Inscribir en un plan"
        footer={
          <>
            <Button variant="tonal" className="text-on-surface" disabled={busy} onClick={requestClose}>
              Cancelar
            </Button>
            <Button type="submit" form="enroll-form" loading={busy}>
              Inscribir
            </Button>
          </>
        }
      >
        <AsyncView source={options} loading="skeleton">
          {(data) => (
            <form id="enroll-form" noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-space-md">
              <div aria-live="polite">{serverError ? <Banner tone="error" title={serverError} /> : null}</div>
              {data.plans.length === 0 ? <Banner tone="info" title="No hay planes de membresía activos." /> : null}
              <SelectField label="Plan" required value={planId} disabled={busy} onChange={(e) => { setPlanId(e.target.value); }}>
                <option value="">Elija un plan</option>
                {data.plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </SelectField>
              {shown('plan') ? <p className="-mt-space-sm text-caption text-error">{shown('plan')}</p> : null}
              {plan ? (
                <div className="flex flex-col gap-space-xs rounded-md bg-surface-container-low p-space-md dark:bg-surface-container">
                  {plan.description ? <p className="text-body-md text-on-surface">{plan.description}</p> : null}
                  <p className="text-body-md text-on-surface">
                    Cuota inicial <MoneyText cents={plan.initialFeeCents} /> (incluye el primer mes) · Mensualidad <MoneyText cents={plan.monthlyFeeCents} /> · Hasta {plan.maxMembers}{' '}
                    {plan.maxMembers === 1 ? 'persona' : 'personas'}
                  </p>
                  <p className="text-caption text-on-surface-variant">Monto fijo: estas cuotas no cambian aunque el plan cambie de precio después.</p>
                </div>
              ) : null}
              <div className="grid gap-space-sm tab:grid-cols-2">
                <Field
                  label="Fecha de inicio"
                  type="date"
                  required
                  min={data.today}
                  max={data.maxStartDate}
                  value={start}
                  disabled={busy}
                  error={shown('startDate')}
                  onChange={(e) => { setStartDate(e.target.value); }}
                />
                <SelectField label="Día de cobro" required value={billingDay} disabled={busy} onChange={(e) => { setBillingDay(e.target.value); }}>
                  <option value="">Elija el día</option>
                  {BILLING_DAYS.map((d) => (
                    <option key={d} value={String(d)}>
                      {`Día ${String(d)}`}
                    </option>
                  ))}
                </SelectField>
              </div>
              {shown('billingDay') ? <p className="-mt-space-sm text-caption text-error">{shown('billingDay')}</p> : null}
              {day >= 1 && day <= 31 && start ? <p className="text-body-md text-on-surface-variant">{firstDueText(start, day)} Los días 29 a 31 pasan al último día de los meses más cortos.</p> : null}

              {plan && plan.maxMembers > 1 ? (
                <fieldset className="flex flex-col gap-space-sm rounded-md border border-outline-variant p-space-md">
                  <legend className="px-space-xs text-body-md-medium text-on-surface">Afiliados (hasta {plan.maxMembers - 1})</legend>
                  <p className="text-caption text-on-surface-variant">Deben ser pacientes registrados. También se pueden añadir después.</p>
                  {affiliates.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-space-sm">
                      <span className="flex items-center gap-space-sm">
                        <span className="text-body-md text-on-surface">
                          {a.firstName} {a.lastName}
                        </span>
                        <CodeText code={a.code} />
                      </span>
                      <Button variant="text" disabled={busy} onClick={() => { setAffiliates((list) => list.filter((x) => x.id !== a.id)); }} aria-label={`Quitar a ${a.firstName} ${a.lastName}`}>
                        <X aria-hidden className="size-5" /> Quitar
                      </Button>
                    </div>
                  ))}
                  {shown('affiliates') ? <p className="text-caption text-error">{shown('affiliates')}</p> : null}
                  {affiliates.length + 1 < plan.maxMembers ? (
                    <PatientPicker exclude={[patientId, ...affiliates.map((a) => a.id)]} disabled={busy} onPick={(p) => { setAffiliates((list) => [...list, p]); }} />
                  ) : null}
                </fieldset>
              ) : null}

              <div className="flex flex-col gap-space-xs rounded-md bg-surface-container-low p-space-md dark:bg-surface-container">
                <Checkbox label="Identidad verificada" checked={identity} onCheckedChange={setIdentity} />
                <p className="flex items-center gap-space-xs text-caption text-on-surface-variant">
                  <IdCard aria-hidden className="size-4" /> Revise el documento del titular. El sistema anota quién y cuándo; no guarda números de ID ni de tarjeta.
                </p>
                {shown('identity') ? <p className="text-caption text-error">{shown('identity')}</p> : null}
              </div>
            </form>
          )}
        </AsyncView>
      </Dialog>
      <DiscardChangesDialog open={discard} onOpenChange={setDiscard} onDiscard={onClose} />
    </>
  );
}

/** «Añadir afiliado»: un paciente registrado, hasta el máximo del plan. */
function AddAffiliateDialog({ membership: m, onClose, onSaved }: { membership: PatientMembershipView; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = async (p: PatientSummary) => {
    setBusy(true);
    setError(null);
    try {
      await api.addMembershipMember(m.id, p.id, m.version);
      onSaved();
    } catch (e) {
      setError(membershipMessage(e));
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }} wide fullScreenOnPhone icon={<UserPlus className="size-7" />} title="Añadir afiliado"
      footer={
        <Button variant="tonal" className="text-on-surface" disabled={busy} onClick={onClose}>
          Cancelar
        </Button>
      }
    >
      <div aria-live="polite">{error ? <Banner tone="error" title={error} /> : null}</div>
      <p className="text-body-md text-on-surface-variant">
        {m.plan.name}: {m.members.length} de {m.plan.maxMembers} personas. El año de beneficios del afiliado cuenta desde el inicio de la membresía ({formatDay(m.startDate)}).
      </p>
      <PatientPicker exclude={m.members.map((p) => p.patientId)} disabled={busy} onPick={(p) => void add(p)} />
    </Dialog>
  );
}
