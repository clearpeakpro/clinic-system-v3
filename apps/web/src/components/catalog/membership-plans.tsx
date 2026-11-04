import { CATALOG_CODE_REGEX, MEMBERSHIP_MAX_MEMBERS, type MembershipPlan, type MembershipPlanList } from '@clinic/shared';
import {
  AsyncView,
  Banner,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DiscardChangesDialog,
  EmptyState,
  Field,
  formatMoneyInput,
  MoneyField,
  MoneyText,
  parseMoney,
  SelectField,
  SemanticChip,
  useSnackbar,
  type Column,
} from '@clinic/ui';
import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Ban, CalendarDays, CirclePause, CirclePlay, Gift, Hash, IdCard, Pencil, RefreshCw, Search } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { api, ApiError } from '../../lib/api.ts';
import { catalogMessage, formatDay } from '../../lib/catalog.ts';
import { isVersionConflict } from '../../lib/users.ts';

// S-ADM-21 Catálogos › Planes de membresía (T-026b parte A, ADR 0034). Sin
// captura de Stitch: el patrón de las demás pestañas de Catálogos (S-ADM-14:
// búsqueda, filtro de estado, «Actualizar», tabla con código en recuadro,
// estado y acciones en la fila) y el diálogo de la hoja S-GEN-30. Columnas
// del manual («Código», «Nombre (ES)», «Nombre (EN)», «Cuota inicial»,
// «Cuota mensual», «Máximo de miembros», «Orden», «Estado»), más la columna
// «Beneficios» con los activos. «Beneficios» va en la fila, no escondido en
// un menú (nota de rediseño del manual). Las cuotas tienen vigencia, como los
// precios (ADR 0029), y valen en todas las sedes (decisión 9).

type StateFilter = 'all' | 'active' | 'inactive';

export function MembershipPlansPanel({
  plans,
  creating,
  onCloseCreate,
  onReload,
}: {
  plans: UseQueryResult<MembershipPlanList, ApiError>;
  /** «Nuevo plan» del encabezado de la página. */
  creating: boolean;
  onCloseCreate: () => void;
  onReload: () => Promise<void>;
}) {
  const snackbar = useSnackbar();
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [editing, setEditing] = useState<MembershipPlan | null>(null);
  const [deactivating, setDeactivating] = useState<MembershipPlan | null>(null);

  const conflict = () => {
    setEditing(null);
    setDeactivating(null);
    onCloseCreate();
    snackbar({ message: 'Este registro fue actualizado por otro usuario. Actualice para continuar.', action: { label: 'Actualizar', onClick: () => void onReload() } });
  };
  const reactivate = async (plan: MembershipPlan) => {
    try {
      await api.setMembershipPlanActive(plan.id, true, plan.version);
      await onReload();
    } catch (error) {
      if (isVersionConflict(error)) conflict();
      else snackbar({ message: catalogMessage(error) });
    }
  };

  const visible = (rows: MembershipPlan[]) => {
    const q = search.trim().toLocaleLowerCase('es');
    return rows.filter(
      (p) =>
        (stateFilter === 'all' || p.active === (stateFilter === 'active')) &&
        (q === '' || [p.code, p.nameEs, p.nameEn].some((text) => text.toLocaleLowerCase('es').includes(q))),
    );
  };

  const columns: Column<MembershipPlan>[] = [
    {
      key: 'code',
      header: 'Código',
      cell: (p) => <span className="rounded-sm bg-surface-container-high px-space-xs py-0.5 font-mono text-code-md whitespace-nowrap text-on-surface">{p.code}</span>,
    },
    { key: 'nameEs', header: 'Nombre (ES)', primary: true, className: 'min-w-32', cell: (p) => <span className="text-body-lg-medium text-on-surface">{p.nameEs}</span> },
    { key: 'nameEn', header: 'Nombre (EN)', cell: (p) => p.nameEn },
    { key: 'initial', header: 'Cuota inicial', align: 'end', cell: (p) => <FeeCell plan={p} which="initialFeeCents" /> },
    { key: 'monthly', header: 'Cuota mensual', align: 'end', cell: (p) => <FeeCell plan={p} which="monthlyFeeCents" /> },
    { key: 'members', header: 'Máximo de miembros', align: 'end', cell: (p) => p.maxMembers },
    { key: 'benefits', header: 'Beneficios', align: 'end', cell: (p) => p.activeBenefits },
    { key: 'state', header: 'Estado', cell: (p) => <SemanticChip tone={p.active ? 'success' : 'neutral'} label={p.active ? 'Activo' : 'Inactivo'} /> },
    {
      key: 'actions',
      header: 'Acciones',
      align: 'end',
      cell: (p) => (
        <span className="flex flex-nowrap justify-end gap-space-xs">
          <Link
            to="/admin/catalogos/planes-de-membresia/$planId"
            params={{ planId: p.id }}
            title="Beneficios"
            aria-label={`Beneficios de ${p.nameEs}`}
            className="inline-flex min-h-touch w-12 items-center justify-center gap-space-xs rounded-md text-body-lg-medium text-primary hover:bg-primary/10 2xl:w-auto 2xl:px-space-sm"
          >
            <Gift aria-hidden className="size-5" /> <span className="hidden 2xl:inline">Beneficios</span>
          </Link>
          <Button variant="text" className="w-12 px-0 2xl:w-auto 2xl:px-space-sm" title="Editar" aria-label={`Editar ${p.nameEs}`} onClick={() => { setEditing(p); }}>
            <Pencil aria-hidden className="size-5" /> <span className="hidden 2xl:inline">Editar</span>
          </Button>
          {p.active ? (
            <Button
              variant="text"
              className="w-12 px-0 text-on-surface-variant 2xl:w-auto 2xl:px-space-sm"
              title="Desactivar"
              aria-label={`Desactivar ${p.nameEs}`}
              onClick={() => { setDeactivating(p); }}
            >
              <CirclePause aria-hidden className="size-5" /> <span className="hidden 2xl:inline">Desactivar</span>
            </Button>
          ) : (
            <Button variant="text" className="w-12 px-0 2xl:w-auto 2xl:px-space-sm" title="Activar" aria-label={`Activar ${p.nameEs}`} onClick={() => void reactivate(p)}>
              <CirclePlay aria-hidden className="size-5" /> <span className="hidden 2xl:inline">Activar</span>
            </Button>
          )}
        </span>
      ),
    },
  ];

  const form = creating ? null : editing;
  const showForm = creating || editing !== null;

  return (
    <>
      <div className="flex flex-wrap items-end gap-space-sm">
        <div className="min-w-60 flex-1">
          <Field
            label="Buscar"
            hideLabel
            icon={<Search className="size-5" />}
            placeholder="Buscar por código o nombre del plan…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); }}
          />
        </div>
        <SelectField label="Estado" hideLabel value={stateFilter} onChange={(e) => { setStateFilter(e.target.value as StateFilter); }}>
          <option value="all">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
        </SelectField>
        <Button variant="elevated" aria-label="Actualizar" title="Actualizar" className="px-3" onClick={() => void onReload()}>
          <RefreshCw aria-hidden className="size-5" />
        </Button>
      </div>

      <AsyncView
        source={plans}
        loading="skeleton"
        isEmpty={(data) => data.plans.length === 0 && !creating}
        empty={<EmptyState icon={IdCard} title="Aún no hay planes de membresía." description="Cree el primer plan con sus cuotas; después, defina sus beneficios." />}
      >
        {(data) => (
          <>
            <DataTable
              caption="Planes de membresía"
              density="compact"
              cardsBelow="desk"
              rows={visible(data.plans)}
              rowKey={(p) => p.id}
              rowClassName={(p) => (p.active ? undefined : 'opacity-70')}
              empty="Ningún plan coincide con la búsqueda."
              columns={columns}
            />
            {showForm ? (
              <PlanDialog
                plan={form}
                generalToday={data.generalToday}
                onClose={() => {
                  setEditing(null);
                  onCloseCreate();
                }}
                onConflict={conflict}
                onSaved={() => {
                  setEditing(null);
                  onCloseCreate();
                  void onReload();
                  snackbar({ message: 'Guardado.' });
                }}
              />
            ) : null}
          </>
        )}
      </AsyncView>

      {deactivating ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) setDeactivating(null); }}
          destructive
          icon={<Ban className="size-7" />}
          title={`¿Desactivar ${deactivating.nameEs}?`}
          description="Un plan inactivo ya no se ofrece para inscribir pacientes, pero se conserva en el historial con sus cuotas y beneficios."
          reason={{ label: 'Motivo', hint: 'Se guarda en la auditoría y lo ven los administradores: no incluya información de pacientes.' }}
          confirmLabel="Desactivar"
          onConfirm={async (reason) => {
            try {
              await api.setMembershipPlanActive(deactivating.id, false, deactivating.version, reason ?? '');
              setDeactivating(null);
              await onReload();
            } catch (error) {
              if (isVersionConflict(error)) conflict();
              else {
                setDeactivating(null);
                snackbar({ message: catalogMessage(error) });
              }
            }
          }}
        />
      ) : null}
    </>
  );
}

/** Una cuota con su vigencia y la próxima programada. */
function FeeCell({ plan, which }: { plan: MembershipPlan; which: 'initialFeeCents' | 'monthlyFeeCents' }) {
  const { current, next } = plan.fee;
  return (
    <span className="flex flex-col items-end gap-0.5">
      {current ? (
        <MoneyText cents={current[which]} emphasis={plan.active} className="text-body-lg" />
      ) : (
        <span className="text-body-md text-on-surface-variant">Sin cuota</span>
      )}
      {next ? (
        <span className="text-caption whitespace-nowrap text-on-surface-variant">
          Desde {formatDay(next.effectiveFrom)}: {formatMoneyInput(next[which])}
        </span>
      ) : null}
    </span>
  );
}

interface Values {
  code: string;
  nameEs: string;
  nameEn: string;
  descriptionEs: string;
  descriptionEn: string;
  maxMembers: string;
  sortOrder: string;
  initialFee: string;
  monthlyFee: string;
  feeFrom: string;
}

const MONEY_ERROR = 'Ingrese un monto válido con hasta dos decimales (p. ej. 25.00).';
const INTEGER = /^\d+$/;

function integerError(text: string, min: number, max: number, required: boolean): string | undefined {
  if (text.trim() === '') return required ? 'Este campo es obligatorio.' : undefined;
  const n = Number(text);
  return INTEGER.test(text.trim()) && n >= min && n <= max ? undefined : `Ingrese un número entero entre ${String(min)} y ${String(max)}.`;
}

/**
 * S-ADM-21 «Nuevo plan» / «Editar plan». El código solo se escribe al crear.
 * Las cuotas se guardan como un registro nuevo con su fecha de vigencia
 * (hoy o después) solo si cambian; las anteriores se conservan.
 */
function PlanDialog({
  plan,
  generalToday,
  onClose,
  onSaved,
  onConflict,
}: {
  /** Nulo: «Nuevo plan». */
  plan: MembershipPlan | null;
  generalToday: string;
  onClose: () => void;
  onSaved: () => void;
  onConflict: () => void;
}) {
  const editing = plan !== null;
  const current = plan?.fee.current ?? null;
  const initial: Values = {
    code: plan?.code ?? '',
    nameEs: plan?.nameEs ?? '',
    nameEn: plan?.nameEn ?? '',
    descriptionEs: plan?.descriptionEs ?? '',
    descriptionEn: plan?.descriptionEn ?? '',
    maxMembers: plan ? String(plan.maxMembers) : '1',
    sortOrder: plan?.sortOrder === null || plan?.sortOrder === undefined ? '' : String(plan.sortOrder),
    initialFee: current ? formatMoneyInput(current.initialFeeCents) : '',
    monthlyFee: current ? formatMoneyInput(current.monthlyFeeCents) : '',
    feeFrom: generalToday,
  };
  const [values, setValues] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  const initialCents = parseMoney(values.initialFee);
  const monthlyCents = parseMoney(values.monthlyFee);
  // Las cuotas se envían solo si cambia algún importe o la fecha.
  const feeChanged = !editing || values.initialFee !== initial.initialFee || values.monthlyFee !== initial.monthlyFee || values.feeFrom !== initial.feeFrom;
  const errors: Partial<Record<keyof Values, string>> = {};
  if (!editing && !CATALOG_CODE_REGEX.test(values.code)) {
    errors.code = 'Use de 2 a 41 letras mayúsculas, dígitos, guiones o guiones bajos, empezando con una letra.';
  }
  for (const key of ['nameEs', 'nameEn'] as const) {
    if (values[key].trim() === '') errors[key] = 'Este campo es obligatorio.';
    else if (values[key].trim().length > 120) errors[key] = 'Use como máximo 120 caracteres.';
  }
  for (const key of ['descriptionEs', 'descriptionEn'] as const) {
    if (values[key].trim().length > 500) errors[key] = 'Use como máximo 500 caracteres.';
  }
  const membersError = integerError(values.maxMembers, 1, MEMBERSHIP_MAX_MEMBERS, true);
  if (membersError) errors.maxMembers = membersError;
  const sortError = integerError(values.sortOrder, 0, 100_000, false);
  if (sortError) errors.sortOrder = sortError;
  if (feeChanged) {
    if (values.initialFee.trim() === '') errors.initialFee = 'Este campo es obligatorio.';
    else if (initialCents === null) errors.initialFee = MONEY_ERROR;
    if (values.monthlyFee.trim() === '') errors.monthlyFee = 'Este campo es obligatorio.';
    else if (monthlyCents === null) errors.monthlyFee = MONEY_ERROR;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.feeFrom)) errors.feeFrom = 'Ingrese una fecha como AAAA-MM-DD.';
    else if (values.feeFrom < generalToday) errors.feeFrom = 'La fecha de vigencia no puede ser anterior a hoy.';
  }
  const dirty = (Object.keys(initial) as (keyof Values)[]).some((key) => values[key] !== initial[key]);
  const shown = (key: keyof Values) => (submitted ? (errors[key] ?? null) : null);

  const requestClose = () => {
    if (busy) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    setBusy(true);
    setServerError(null);
    const fields = {
      nameEs: values.nameEs.trim(),
      nameEn: values.nameEn.trim(),
      descriptionEs: values.descriptionEs.trim() === '' ? null : values.descriptionEs.trim(),
      descriptionEn: values.descriptionEn.trim() === '' ? null : values.descriptionEn.trim(),
      maxMembers: Number(values.maxMembers),
      sortOrder: values.sortOrder.trim() === '' ? null : Number(values.sortOrder),
    };
    const fee =
      feeChanged && initialCents !== null && monthlyCents !== null
        ? { initialFeeCents: initialCents, monthlyFeeCents: monthlyCents, effectiveFrom: values.feeFrom }
        : undefined;
    try {
      if (plan) await api.updateMembershipPlan(plan.id, { ...fields, expectedVersion: plan.version, ...(fee ? { fee } : {}) });
      else if (fee) await api.createMembershipPlan({ ...fields, code: values.code, fee });
      onSaved();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'version_conflict') onConflict();
      else setServerError(catalogMessage(error));
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => { if (!next) requestClose(); }}
        dismissible={false}
        wide
        fullScreenOnPhone
        icon={<IdCard className="size-7" />}
        title={editing ? 'Editar plan de membresía' : 'Nuevo plan de membresía'}
        footer={
          <>
            <Button variant="tonal" className="text-on-surface" disabled={busy} onClick={requestClose}>
              Cancelar
            </Button>
            <Button type="submit" form="plan-form" loading={busy}>
              {editing ? 'Guardar' : 'Crear'}
            </Button>
          </>
        }
      >
        <form id="plan-form" noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-space-md">
          <div aria-live="polite">{serverError ? <Banner tone="error" title={serverError} /> : null}</div>
          <Field
            label="Código"
            hint={editing ? 'No se puede cambiar.' : 'p. ej. FAMILIAR'}
            icon={<Hash className="size-5" />}
            className="font-mono uppercase"
            autoComplete="off"
            autoFocus={!editing}
            maxLength={41}
            value={values.code}
            disabled={editing || busy}
            error={shown('code')}
            onChange={(e) => { set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '')); }}
          />
          <div className="grid gap-space-sm tab:grid-cols-2">
            <Field
              label="Nombre (ES)"
              autoComplete="off"
              maxLength={120}
              value={values.nameEs}
              disabled={busy}
              error={shown('nameEs')}
              onChange={(e) => { set('nameEs', e.target.value); }}
            />
            <Field
              label="Nombre (EN)"
              autoComplete="off"
              maxLength={120}
              value={values.nameEn}
              disabled={busy}
              error={shown('nameEn')}
              onChange={(e) => { set('nameEn', e.target.value); }}
            />
          </div>
          <Field
            label="Descripción (ES) (opcional)"
            autoComplete="off"
            maxLength={500}
            value={values.descriptionEs}
            disabled={busy}
            error={shown('descriptionEs')}
            onChange={(e) => { set('descriptionEs', e.target.value); }}
          />
          <Field
            label="Descripción (EN) (opcional)"
            autoComplete="off"
            maxLength={500}
            value={values.descriptionEn}
            disabled={busy}
            error={shown('descriptionEn')}
            onChange={(e) => { set('descriptionEn', e.target.value); }}
          />
          <div className="grid gap-space-sm tab:grid-cols-2">
            <Field
              label="Máximo de miembros"
              hint="Personas que cubre el plan, titular incluido."
              inputMode="numeric"
              autoComplete="off"
              value={values.maxMembers}
              disabled={busy}
              error={shown('maxMembers')}
              onChange={(e) => { set('maxMembers', e.target.value.replace(/\D/g, '')); }}
            />
            <Field
              label="Orden (opcional)"
              inputMode="numeric"
              autoComplete="off"
              value={values.sortOrder}
              disabled={busy}
              error={shown('sortOrder')}
              onChange={(e) => { set('sortOrder', e.target.value.replace(/\D/g, '')); }}
            />
          </div>
          <fieldset className="flex flex-col gap-space-sm rounded-lg bg-surface-container-low p-space-md dark:bg-surface-container">
            <legend className="sr-only">Cuotas</legend>
            <p aria-hidden className="text-body-md-medium text-on-surface">
              Cuotas
            </p>
            <p className="text-caption text-on-surface-variant">
              Valen en todas las sedes. La cuota inicial incluye el primer mes.
              {current
                ? ` Hoy rigen ${formatMoneyInput(current.initialFeeCents)} y ${formatMoneyInput(current.monthlyFeeCents)} USD desde el ${formatDay(current.effectiveFrom)}.`
                : ''}
            </p>
            <div className="grid gap-space-sm tab:grid-cols-3">
              <MoneyField label="Cuota inicial" value={values.initialFee} disabled={busy} error={shown('initialFee')} onValueChange={(text) => { set('initialFee', text); }} />
              <MoneyField label="Cuota mensual" value={values.monthlyFee} disabled={busy} error={shown('monthlyFee')} onValueChange={(text) => { set('monthlyFee', text); }} />
              <Field
                label="Vigente desde"
                type="date"
                min={generalToday}
                icon={<CalendarDays className="size-5" />}
                value={values.feeFrom}
                disabled={busy}
                error={shown('feeFrom')}
                onChange={(e) => { set('feeFrom', e.target.value); }}
              />
            </div>
          </fieldset>
        </form>
      </Dialog>
      <DiscardChangesDialog open={confirmDiscard} onOpenChange={setConfirmDiscard} onDiscard={onClose} />
    </>
  );
}

