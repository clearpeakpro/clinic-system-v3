import {
  BENEFIT_QUANTITY_MAX,
  BENEFIT_QUOTA_MODE_HELP,
  BENEFIT_QUOTA_MODE_LABELS,
  BENEFIT_QUOTA_MODES,
  CATALOG_LABELS,
  formatPercentBp,
  MEMBERSHIP_BENEFIT_TYPE_LABELS,
  MEMBERSHIP_CATEGORIES,
  MEMBERSHIP_CATEGORY_LABELS,
  parsePercentBp,
  type BenefitItemKind,
  type BenefitItemRef,
  type BenefitQuotaMode,
  type CatalogList,
  type MembershipBenefit,
  type MembershipBenefitType,
  type MembershipCategory,
  type MembershipPlanDetail,
} from '@clinic/shared';
import {
  AsyncView,
  Banner,
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  Dialog,
  DiscardChangesDialog,
  EmptyState,
  Field,
  SelectField,
  SemanticChip,
  useSnackbar,
  type Column,
} from '@clinic/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Ban, CirclePause, CirclePlay, Gift, Pencil, Percent, Plus, RefreshCw } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { api, ApiError } from '../lib/api.ts';
import { catalogMessage } from '../lib/catalog.ts';
import { useActiveLocation } from '../lib/session.ts';
import { isVersionConflict } from '../lib/users.ts';

// S-ADM-22 Beneficios · {plan} (T-026b parte A, ADR 0034). Sin captura de
// Stitch: encabezado con flecha atrás, «Beneficios · {plan}» y el código del
// plan como subtítulo; «Mostrar inactivos», «Actualizar» y «Nuevo
// beneficio»; tabla como las de Catálogos (S-ADM-14) con «Tipo de
// beneficio», «Categoría o servicios», «Valor», «Periodo», «Estado» y las
// acciones en la fila; diálogo de la hoja S-GEN-30. Cambios respecto del
// manual (notas de rediseño y decisiones del dueño):
//  - la categoría es un selector, no un código libre;
//  - un «Incluido» lleva los servicios del catálogo que cuentan (consultas,
//    procedimientos o pruebas) en vez de una categoría;
//  - el periodo es siempre el año de la membresía, por persona (decisiones 1
//    y 4): no hay «Mes» ni «Vitalicio».

type Dialogs = { kind: 'new' } | { kind: 'edit'; benefit: MembershipBenefit } | { kind: 'deactivate'; benefit: MembershipBenefit } | null;

export function AdminMembershipBenefitsPage({ planId }: { planId: string }) {
  const snackbar = useSnackbar();
  const active = useActiveLocation();
  const detail = useQuery<MembershipPlanDetail & { generalToday: string }, ApiError>({
    queryKey: ['membership-plan', planId],
    queryFn: () => api.membershipPlan(planId),
    staleTime: 0,
  });
  // Los servicios que se pueden incluir: el catálogo de la organización (los precios no importan aquí).
  const catalog = useQuery<CatalogList, ApiError>({
    queryKey: ['admin-catalog', active?.id],
    queryFn: () => api.adminCatalog(active?.id ?? ''),
    enabled: active !== undefined,
    staleTime: 0,
  });
  const [showInactive, setShowInactive] = useState(false);
  const [dialog, setDialog] = useState<Dialogs>(null);

  const reload = async () => {
    await detail.refetch();
  };
  const conflict = () => {
    setDialog(null);
    snackbar({ message: 'Este registro fue actualizado por otro usuario. Actualice para continuar.', action: { label: 'Actualizar', onClick: () => void reload() } });
  };
  const reactivate = async (benefit: MembershipBenefit) => {
    try {
      await api.setMembershipBenefitActive(benefit.id, true, benefit.version);
      await reload();
    } catch (error) {
      if (isVersionConflict(error)) conflict();
      else snackbar({ message: catalogMessage(error) });
    }
  };

  const columns: Column<MembershipBenefit>[] = [
    {
      key: 'type',
      header: 'Tipo de beneficio',
      primary: true,
      className: 'min-w-40',
      cell: (b) => (
        <span className="flex flex-col items-start gap-space-xs">
          <SemanticChip tone={b.type === 'included' ? 'success' : 'info'} label={MEMBERSHIP_BENEFIT_TYPE_LABELS[b.type]} />
          {b.type === 'included' ? <span className="text-body-lg-medium text-on-surface">{b.nameEs}</span> : null}
        </span>
      ),
    },
    {
      key: 'scope',
      header: 'Categoría o servicios',
      className: 'min-w-40',
      cell: (b) =>
        b.type === 'discount' ? (
          b.category ? MEMBERSHIP_CATEGORY_LABELS[b.category] : '—'
        ) : (
          <span className="flex flex-col gap-0.5">
            {b.items.map((item) => (
              <span key={`${item.kind}:${item.id}`} className={item.active ? 'text-on-surface' : 'text-on-surface-variant line-through'}>
                <span className="font-mono text-code-md">{item.code}</span> · {item.name}
              </span>
            ))}
            {b.quotaMode ? <span className="text-caption text-on-surface-variant">{BENEFIT_QUOTA_MODE_LABELS[b.quotaMode]}: {BENEFIT_QUOTA_MODE_HELP[b.quotaMode].toLowerCase()}</span> : null}
            {b.includesSameVisitLabs ? <span className="text-caption text-on-surface-variant">Incluye sin costo los laboratorios de la misma visita.</span> : null}
          </span>
        ),
    },
    {
      key: 'value',
      header: 'Valor',
      align: 'end',
      cell: (b) => (b.type === 'discount' ? formatPercentBp(b.discountBp ?? 0) : `${String(b.quantityPerYear ?? 0)} incluido${b.quantityPerYear === 1 ? '' : 's'}`),
    },
    {
      key: 'period',
      header: 'Periodo',
      cell: (b) => (b.type === 'included' ? 'Por persona y año de la membresía' : 'Después de los incluidos'),
    },
    { key: 'state', header: 'Estado', cell: (b) => <SemanticChip tone={b.active ? 'success' : 'neutral'} label={b.active ? 'Activo' : 'Inactivo'} /> },
    {
      key: 'actions',
      header: 'Acciones',
      align: 'end',
      cell: (b) => {
        const label = benefitLabel(b);
        return (
          <span className="flex flex-nowrap justify-end gap-space-xs">
            <Button variant="text" className="w-12 px-0 2xl:w-auto 2xl:px-space-sm" title="Editar" aria-label={`Editar ${label}`} onClick={() => { setDialog({ kind: 'edit', benefit: b }); }}>
              <Pencil aria-hidden className="size-5" /> <span className="hidden 2xl:inline">Editar</span>
            </Button>
            {b.active ? (
              <Button
                variant="text"
                className="w-12 px-0 text-on-surface-variant 2xl:w-auto 2xl:px-space-sm"
                title="Desactivar"
                aria-label={`Desactivar ${label}`}
                onClick={() => { setDialog({ kind: 'deactivate', benefit: b }); }}
              >
                <CirclePause aria-hidden className="size-5" /> <span className="hidden 2xl:inline">Desactivar</span>
              </Button>
            ) : (
              <Button variant="text" className="w-12 px-0 2xl:w-auto 2xl:px-space-sm" title="Activar" aria-label={`Activar ${label}`} onClick={() => void reactivate(b)}>
                <CirclePlay aria-hidden className="size-5" /> <span className="hidden 2xl:inline">Activar</span>
              </Button>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <section aria-labelledby="page-title" className="mx-auto flex w-full max-w-7xl flex-col gap-space-lg">
      <header className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-lg shadow-level-1 dark:bg-surface-container-low">
        <div className="flex flex-wrap items-center gap-space-sm">
          <Link
            to="/admin/catalogos/$pestana"
            params={{ pestana: 'planes-de-membresia' }}
            aria-label="Volver a Planes de membresía"
            title="Volver a Planes de membresía"
            className="flex size-12 items-center justify-center rounded-full text-on-surface hover:bg-surface-container-low"
          >
            <ArrowLeft aria-hidden className="size-6" />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 id="page-title" className="text-display-md text-on-surface">
              Beneficios · {detail.data?.plan.nameEs ?? '…'}
            </h1>
            {detail.data ? <p className="font-mono text-code-md text-on-surface-variant">{detail.data.plan.code}</p> : null}
          </div>
          <Button className="shrink-0" disabled={!detail.data} onClick={() => { setDialog({ kind: 'new' }); }}>
            <Plus aria-hidden className="size-5" /> Nuevo beneficio
          </Button>
        </div>
        <p className="self-start rounded-md bg-primary/10 px-space-sm py-space-xs text-body-md text-primary">
          Primero se usan los servicios incluidos, sin costo; después se aplica el descuento de su categoría, sobre el precio vigente de la sede.
        </p>
      </header>

      <div className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-md shadow-level-1 dark:bg-surface-container-low">
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <Checkbox label="Mostrar inactivos" checked={showInactive} onCheckedChange={setShowInactive} />
          <Button variant="elevated" aria-label="Actualizar" title="Actualizar" className="px-3" onClick={() => void reload()}>
            <RefreshCw aria-hidden className="size-5" />
          </Button>
        </div>
        <AsyncView
          source={detail}
          loading="skeleton"
          isEmpty={(data) => data.benefits.length === 0}
          empty={
            <EmptyState
              icon={Gift}
              title="Este plan aún no tiene beneficios."
              description="Agregue los servicios incluidos y los descuentos por categoría."
              action={
                <Button onClick={() => { setDialog({ kind: 'new' }); }}>
                  <Plus aria-hidden className="size-5" /> Nuevo beneficio
                </Button>
              }
            />
          }
        >
          {(data) => (
            <DataTable
              caption={`Beneficios de ${data.plan.nameEs}`}
              density="compact"
              cardsBelow="desk"
              rows={data.benefits.filter((b) => showInactive || b.active)}
              rowKey={(b) => b.id}
              rowClassName={(b) => (b.active ? undefined : 'opacity-70')}
              empty="No hay beneficios activos. Marque «Mostrar inactivos» para ver los demás."
              columns={columns}
            />
          )}
        </AsyncView>
      </div>

      {(dialog?.kind === 'new' || dialog?.kind === 'edit') && catalog.data ? (
        <BenefitDialog
          planId={planId}
          benefit={dialog.kind === 'edit' ? dialog.benefit : null}
          catalog={catalog.data}
          onClose={() => { setDialog(null); }}
          onConflict={conflict}
          onSaved={() => {
            setDialog(null);
            void reload();
            snackbar({ message: 'Guardado.' });
          }}
        />
      ) : null}
      {dialog?.kind === 'deactivate' ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) setDialog(null); }}
          destructive
          icon={<Ban className="size-7" />}
          title={`¿Desactivar ${benefitLabel(dialog.benefit)}?`}
          description="Un beneficio inactivo deja de aplicarse a los cargos nuevos. Se conserva en el historial."
          reason={{ label: 'Motivo', hint: 'Se guarda en la auditoría y lo ven los administradores: no incluya información de pacientes.' }}
          confirmLabel="Desactivar"
          onConfirm={async (reason) => {
            try {
              await api.setMembershipBenefitActive(dialog.benefit.id, false, dialog.benefit.version, reason ?? '');
              setDialog(null);
              await reload();
            } catch (error) {
              if (isVersionConflict(error)) conflict();
              else {
                setDialog(null);
                snackbar({ message: catalogMessage(error) });
              }
            }
          }}
        />
      ) : null}
    </section>
  );
}

/** El nombre de un beneficio en los diálogos y en las etiquetas: «Incluido Consulta inicial», «Descuento Laboratorio». */
function benefitLabel(b: MembershipBenefit): string {
  const what = b.type === 'included' ? (b.nameEs ?? '') : b.category ? MEMBERSHIP_CATEGORY_LABELS[b.category] : '';
  return `${MEMBERSHIP_BENEFIT_TYPE_LABELS[b.type]} ${what}`;
}

const ITEM_KINDS: readonly BenefitItemKind[] = ['consultations', 'procedures', 'lab-tests'];
const keyOf = (ref: BenefitItemRef) => `${ref.kind}:${ref.id}`;

interface Values {
  type: MembershipBenefitType;
  nameEs: string;
  nameEn: string;
  quantity: string;
  quotaMode: BenefitQuotaMode;
  sameVisitLabs: boolean;
  items: string[];
  category: MembershipCategory;
  percent: string;
}

/**
 * S-ADM-22 «Nuevo beneficio» / «Editar beneficio». El tipo solo se elige al
 * crear. «Incluido»: nombre en español e inglés, cantidad por persona y año y
 * los servicios del catálogo que cuentan. «Descuento»: categoría y
 * porcentaje con hasta dos decimales.
 */
function BenefitDialog({
  planId,
  benefit,
  catalog,
  onClose,
  onSaved,
  onConflict,
}: {
  planId: string;
  /** Nulo: «Nuevo beneficio». */
  benefit: MembershipBenefit | null;
  catalog: CatalogList;
  onClose: () => void;
  onSaved: () => void;
  onConflict: () => void;
}) {
  const editing = benefit !== null;
  const initial: Values = {
    type: benefit?.type ?? 'included',
    nameEs: benefit?.nameEs ?? '',
    nameEn: benefit?.nameEn ?? '',
    quantity: benefit?.quantityPerYear ? String(benefit.quantityPerYear) : '1',
    quotaMode: benefit?.quotaMode ?? 'package',
    sameVisitLabs: benefit?.includesSameVisitLabs ?? false,
    items: (benefit?.items ?? []).map(keyOf),
    category: benefit?.category ?? 'consultation',
    percent: benefit?.discountBp !== null && benefit?.discountBp !== undefined ? formatPercentBp(benefit.discountBp).replace(' %', '') : '',
  };
  const [values, setValues] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  };
  const toggleItem = (key: string, checked: boolean) => {
    setValues((v) => ({ ...v, items: checked ? [...v.items, key] : v.items.filter((k) => k !== key) }));
  };

  // Los servicios activos de cada catálogo, más los ya elegidos aunque estén inactivos.
  const chosen = new Set(values.items);
  const options = (kind: BenefitItemKind) => catalog.items[kind].filter((item) => item.active || chosen.has(`${kind}:${item.id}`));

  const quantity = Number(values.quantity);
  const discountBp = parsePercentBp(values.percent);
  const errors: Partial<Record<'nameEs' | 'nameEn' | 'quantity' | 'items' | 'percent', string>> = {};
  if (values.type === 'included') {
    for (const key of ['nameEs', 'nameEn'] as const) {
      if (values[key].trim() === '') errors[key] = 'Este campo es obligatorio.';
      else if (values[key].trim().length > 120) errors[key] = 'Use como máximo 120 caracteres.';
    }
    if (!/^\d+$/.test(values.quantity) || quantity < 1 || quantity > BENEFIT_QUANTITY_MAX) {
      errors.quantity = `Ingrese un número entero entre 1 y ${String(BENEFIT_QUANTITY_MAX)}.`;
    }
    if (values.items.length === 0) errors.items = 'Elija al menos un servicio.';
  } else if (discountBp === null) {
    errors.percent = 'Ingrese un porcentaje entre 0 y 100.';
  }
  const dirty = (Object.keys(initial) as (keyof Values)[]).some((key) => JSON.stringify(values[key]) !== JSON.stringify(initial[key]));
  const shown = (key: keyof typeof errors) => (submitted ? (errors[key] ?? null) : null);

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
    const sortOrder = benefit?.sortOrder ?? null;
    const input =
      values.type === 'included'
        ? {
            type: 'included' as const,
            nameEs: values.nameEs.trim(),
            nameEn: values.nameEn.trim(),
            quantityPerYear: quantity,
            quotaMode: values.quotaMode,
            includesSameVisitLabs: values.sameVisitLabs,
            items: values.items.map((key) => {
              const [kind, id] = key.split(':') as [BenefitItemKind, string];
              return { kind, id };
            }),
            sortOrder,
          }
        : { type: 'discount' as const, category: values.category, discountBp: discountBp ?? 0, sortOrder };
    try {
      if (benefit) await api.updateMembershipBenefit(benefit.id, { ...input, expectedVersion: benefit.version });
      else await api.createMembershipBenefit(planId, input);
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
        icon={<Gift className="size-7" />}
        title={editing ? 'Editar beneficio' : 'Nuevo beneficio'}
        footer={
          <>
            <Button variant="tonal" className="text-on-surface" disabled={busy} onClick={requestClose}>
              Cancelar
            </Button>
            <Button type="submit" form="benefit-form" loading={busy}>
              {editing ? 'Guardar' : 'Crear'}
            </Button>
          </>
        }
      >
        <form id="benefit-form" noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-space-md">
          <div aria-live="polite">{serverError ? <Banner tone="error" title={serverError} /> : null}</div>
          <SelectField label="Tipo de beneficio" value={values.type} disabled={editing || busy} onChange={(e) => { set('type', e.target.value as MembershipBenefitType); }}>
            <option value="included">Incluido (sin costo)</option>
            <option value="discount">Descuento por categoría</option>
          </SelectField>
          <p className="-mt-space-sm text-caption text-on-surface-variant">El tipo de beneficio no se puede cambiar después de crearlo.</p>

          {values.type === 'included' ? (
            <>
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
                label="Cantidad incluida"
                hint="Por persona y por año de la membresía (desde la fecha de inicio)."
                inputMode="numeric"
                autoComplete="off"
                value={values.quantity}
                disabled={busy}
                error={shown('quantity')}
                onChange={(e) => { set('quantity', e.target.value.replace(/\D/g, '')); }}
              />
              <SelectField
                label="Cómo se cuenta la cantidad"
                value={values.quotaMode}
                disabled={busy}
                onChange={(e) => { set('quotaMode', e.target.value as BenefitQuotaMode); }}
              >
                {BENEFIT_QUOTA_MODES.map((m) => (
                  <option key={m} value={m}>
                    {BENEFIT_QUOTA_MODE_LABELS[m]}
                  </option>
                ))}
              </SelectField>
              <p className="-mt-space-sm text-caption text-on-surface-variant">{BENEFIT_QUOTA_MODE_HELP[values.quotaMode]}</p>
              <Checkbox
                label="Incluye sin costo los laboratorios ordenados en la misma visita"
                checked={values.sameVisitLabs}
                onCheckedChange={(checked) => { set('sameVisitLabs', checked); }}
              />
              <fieldset className="flex flex-col gap-space-sm rounded-lg bg-surface-container-low p-space-md dark:bg-surface-container">
                <legend className="sr-only">Servicios incluidos</legend>
                <p aria-hidden className="text-body-md-medium text-on-surface">
                  Servicios incluidos
                </p>
                <p className="text-caption text-on-surface-variant">Marque los servicios del catálogo que cuentan para este beneficio. El personal elige el servicio; el sistema solo cuenta cuántos se usaron.</p>
                {shown('items') ? <p className="text-caption text-error">{shown('items')}</p> : null}
                {ITEM_KINDS.map((kind) => {
                  const list = options(kind);
                  if (list.length === 0) return null;
                  return (
                    <div key={kind} className="flex flex-col border-t border-outline-variant pt-space-sm first-of-type:border-t-0">
                      <p className="text-caption font-semibold text-on-surface-variant uppercase">{CATALOG_LABELS[kind].title}</p>
                      {list.map((item) => {
                        const key = `${kind}:${item.id}`;
                        return <Checkbox key={key} label={`${item.code} · ${item.name}`} checked={chosen.has(key)} onCheckedChange={(checked) => { toggleItem(key, checked); }} />;
                      })}
                    </div>
                  );
                })}
              </fieldset>
            </>
          ) : (
            <div className="grid gap-space-sm tab:grid-cols-2">
              <SelectField label="Categoría" value={values.category} disabled={busy} onChange={(e) => { set('category', e.target.value as MembershipCategory); }}>
                {MEMBERSHIP_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {MEMBERSHIP_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </SelectField>
              <Field
                label="Descuento"
                hint="Porcentaje entre 0 y 100, p. ej. 25 o 12.5."
                inputMode="decimal"
                autoComplete="off"
                icon={<Percent className="size-5" />}
                value={values.percent}
                disabled={busy}
                error={shown('percent')}
                onChange={(e) => { set('percent', e.target.value.replace(/[^\d.]/g, '')); }}
              />
            </div>
          )}
        </form>
      </Dialog>
      <DiscardChangesDialog open={confirmDiscard} onOpenChange={setConfirmDiscard} onDiscard={onClose} />
    </>
  );
}
