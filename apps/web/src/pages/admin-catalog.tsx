import {
  AGENDA_COLOR_LABELS,
  CATALOG_KINDS,
  CATALOG_LABELS,
  PRICED_KINDS,
  PROCEDURE_KIND_LABELS,
  VISIT_ROUTE_LABELS,
  type CatalogItem,
  type CatalogKind,
  type CatalogList,
  type LabProvider,
  type PriceTimeline,
  type ProcedureKind,
} from '@clinic/shared';
import {
  AsyncView,
  Button,
  cn,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  MoneyText,
  SelectField,
  SemanticChip,
  useSnackbar,
  type Column,
} from '@clinic/ui';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  Ban,
  BookOpen,
  BriefcaseMedical,
  Building2,
  CalendarDays,
  CirclePause,
  CirclePlay,
  FlaskConical,
  Info,
  Microscope,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Syringe,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { AGENDA_STRIPE, CatalogDialog } from '../components/catalog/catalog-dialog.tsx';
import { LabProvidersPanel } from '../components/catalog/lab-providers.tsx';
import { api, ApiError } from '../lib/api.ts';
import { catalogMessage, formatDay, hasNoLab, NEW_LABELS, nextPriceText, withAmount } from '../lib/catalog.ts';
import { flatten, useActiveLocation, useLocations } from '../lib/session.ts';
import { isVersionConflict } from '../lib/users.ts';

// S-ADM-13 a 20 Catálogos y precios (Stitch:
// design/stitch/admin/S-ADM-14_catalogos_y_precios). Se toma la distribución:
// encabezado con «+ Nuevo …», selector de sede de los precios y su aviso
// (adaptado al precio general con excepción por sede),
// pestañas con su número de entradas, búsqueda por código o nombre, filtros
// de tipo y de estado, «Actualizar», y la tabla con el código en recuadro,
// el tipo, los precios, el estado y las acciones «Editar» y
// «Desactivar»/«Reactivar» en la fila. Los precios (T-011): «Precio general»
// de la organización y «Precio en {sede}», el propio de la sede elegida o
// «Usa el precio general»; cada uno con su fecha de vigencia («Vigente
// desde» de Stitch) y el próximo programado. No se construye lo que el
// sistema no tiene: «Exportar catálogo», paginación, versión del catálogo,
// descripciones bajo el nombre ni el aviso de auditoría. Las pestañas sin
// captura (Tipos de cita, Pruebas, Fuentes) siguen el mismo patrón con las
// columnas del manual. T-011b: quinta pestaña «Proveedores de laboratorio»
// (S-ADM-17, como en el manual) y, en Pruebas, el aviso «Sin laboratorio
// asignado» (ADR 0028).

/** Pestañas: los cuatro catálogos y los proveedores de laboratorio. */
export type CatalogTab = CatalogKind | 'lab-providers';
const TABS: readonly CatalogTab[] = [...CATALOG_KINDS, 'lab-providers'];
const LAB_PROVIDERS_TAB = { title: 'Proveedores de laboratorio', segment: 'proveedores-de-laboratorio' };
const tabLabel = (tab: CatalogTab) => (tab === 'lab-providers' ? LAB_PROVIDERS_TAB : CATALOG_LABELS[tab]);

const TAB_ICONS: Record<CatalogTab, LucideIcon> = {
  'appointment-types': CalendarDays,
  procedures: BriefcaseMedical,
  'lab-tests': FlaskConical,
  'referral-sources': Share2,
  'lab-providers': Microscope,
};

const KIND_ICONS: Record<ProcedureKind, LucideIcon> = { procedure: BriefcaseMedical, injection: Syringe };

type StateFilter = 'all' | 'active' | 'inactive';
type KindFilter = 'all' | ProcedureKind;

type Dialogs =
  | { kind: 'new' }
  | { kind: 'edit'; item: CatalogItem }
  | { kind: 'deactivate'; item: CatalogItem }
  | { kind: 'use-general'; item: CatalogItem }
  | null;

/** Pestaña de la URL (`/admin/catalogos/<pestaña>`). */
export function catalogTabOf(segment: string): CatalogTab | undefined {
  return TABS.find((t) => tabLabel(t).segment === segment);
}

export function AdminCatalogPage({ tab }: { tab: CatalogTab }) {
  const active = useActiveLocation();
  const locations = useLocations();
  const sites = locations.data ? flatten(locations.data).filter((l) => l.organizationId === active?.organizationId) : [];
  const [siteId, setSiteId] = useState<string | null>(null);
  // Los laboratorios no dependen de la sede: usan la activa.
  const site = (tab === 'lab-providers' ? undefined : sites.find((l) => l.id === siteId)) ?? active;
  const catalog = useQuery<CatalogList, ApiError>({
    queryKey: ['admin-catalog', site?.id],
    queryFn: () => api.adminCatalog(site?.id ?? ''),
    enabled: site !== undefined,
    staleTime: 0,
  });
  const [creating, setCreating] = useState(false);

  const reload = async () => {
    await catalog.refetch();
  };

  return (
    <section aria-labelledby="page-title" className="mx-auto flex w-full max-w-7xl flex-col gap-space-lg">
      <header className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-lg shadow-level-1 dark:bg-surface-container-low">
        <div className="flex flex-wrap items-end justify-between gap-space-md desk:flex-nowrap">
          <div className="flex min-w-0 flex-1 flex-col gap-space-xs">
            <h1 id="page-title" className="text-display-md text-on-surface">
              Catálogos y precios
            </h1>
            <p className="text-body-lg text-on-surface-variant">
              Tipos de cita, procedimientos, pruebas de laboratorio y fuentes de referido, con sus precios por sede, y los laboratorios con los que trabaja.
            </p>
          </div>
          <Button className="shrink-0" onClick={() => { setCreating(true); }}>
            <Plus aria-hidden className="size-5" /> {tab === 'lab-providers' ? 'Nuevo laboratorio' : NEW_LABELS[tab]}
          </Button>
        </div>
        {tab === 'lab-providers' ? (
          <p className="flex items-center gap-space-xs self-start rounded-md bg-primary/10 px-space-sm py-space-xs text-body-md text-primary">
            <Info aria-hidden className="size-4 shrink-0" /> El costo de cada prueba en cada laboratorio se escribe en Pruebas de laboratorio.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-space-md">
            <div className="w-full max-w-sm">
              <SelectField
                label="Sede de los precios"
                icon={<Building2 className="size-5" />}
                value={site?.id ?? ''}
                onChange={(e) => { setSiteId(e.target.value); }}
              >
                {sites.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code} · {l.name}
                  </option>
                ))}
              </SelectField>
            </div>
            <p className="flex items-center gap-space-xs rounded-md bg-primary/10 px-space-sm py-space-xs text-body-md text-primary">
              <Info aria-hidden className="size-4 shrink-0" /> Cada sede usa el precio general, salvo que tenga su propio precio.
            </p>
          </div>
        )}
      </header>

      <nav aria-label="Catálogos" className="flex flex-wrap gap-space-xs rounded-lg bg-surface-container-lowest p-space-xs shadow-level-1 dark:bg-surface-container-low">
        {TABS.map((t) => {
          const Icon = TAB_ICONS[t];
          const selected = t === tab;
          const count = t === 'lab-providers' ? catalog.data?.labProviders?.length : catalog.data?.items[t].length;
          return (
            <Link
              key={t}
              to="/admin/catalogos/$pestana"
              params={{ pestana: tabLabel(t).segment }}
              aria-current={selected ? 'page' : undefined}
              className={cn(
                'flex min-h-touch shrink-0 items-center gap-space-sm rounded-md px-space-md text-body-lg whitespace-nowrap transition-colors',
                selected ? 'bg-primary text-on-primary' : 'text-on-surface hover:bg-surface-container-low dark:hover:bg-surface-container-high',
              )}
            >
              <Icon aria-hidden className="size-5" />
              {tabLabel(t).title}
              {count !== undefined ? (
                <span className={cn('rounded-full px-2 text-caption', selected ? 'bg-on-primary text-primary' : 'bg-surface-container-high text-on-surface-variant')}>
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-md shadow-level-1 dark:bg-surface-container-low">
        {tab === 'lab-providers' ? (
          <AsyncView
            source={catalog}
            loading="skeleton"
            isEmpty={(data) => (data.labProviders ?? []).length === 0 && !creating}
            empty={
              <EmptyState
                icon={Microscope}
                title="Aún no hay laboratorios."
                description="Dé de alta el primer laboratorio con el que trabaja la clínica."
                action={
                  <Button onClick={() => { setCreating(true); }}>
                    <Plus aria-hidden className="size-5" /> Nuevo laboratorio
                  </Button>
                }
              />
            }
          >
            {(data) => (
              <LabProvidersPanel
                providers={data.labProviders ?? []}
                creating={creating}
                onCloseCreate={() => { setCreating(false); }}
                onReload={reload}
              />
            )}
          </AsyncView>
        ) : (
          <CatalogBody
            kind={tab}
            catalog={catalog}
            site={site ? { id: site.id, code: site.code, name: site.name } : undefined}
            creating={creating}
            setCreating={setCreating}
            reload={reload}
          />
        )}
      </div>
    </section>
  );
}

/** Un catálogo: filtros, tabla y sus diálogos. */
function CatalogBody({
  kind,
  catalog,
  site,
  creating,
  setCreating,
  reload,
}: {
  kind: CatalogKind;
  catalog: UseQueryResult<CatalogList, ApiError>;
  site: { id: string; code: string; name: string } | undefined;
  /** «+ Nuevo …» del encabezado. */
  creating: boolean;
  setCreating: (creating: boolean) => void;
  reload: () => Promise<void>;
}) {
  const snackbar = useSnackbar();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const priced = PRICED_KINDS.includes(kind);
  const label = CATALOG_LABELS[kind];
  const form = creating ? ({ kind: 'new' } as const) : dialog?.kind === 'edit' ? dialog : null;
  const closeForm = () => {
    setCreating(false);
    setDialog(null);
  };

  const conflict = () => {
    closeForm();
    snackbar({ message: 'Este registro fue actualizado por otro usuario. Actualice para continuar.', action: { label: 'Actualizar', onClick: () => void reload() } });
  };
  const reactivate = async (item: CatalogItem) => {
    try {
      await api.reactivateCatalogItem(kind, item.id, item.version);
      await reload();
    } catch (error) {
      if (isVersionConflict(error)) conflict();
      else snackbar({ message: catalogMessage(error) });
    }
  };

  const visible = (rows: CatalogItem[]) => {
    const q = search.trim().toLocaleLowerCase('es');
    return rows.filter(
      (r) =>
        (stateFilter === 'all' || r.active === (stateFilter === 'active')) &&
        (kind !== 'procedures' || kindFilter === 'all' || r.kind === kindFilter) &&
        (q === '' || r.code.toLocaleLowerCase('es').includes(q) || r.name.toLocaleLowerCase('es').includes(q)),
    );
  };

  return (
    <>
      <div className="flex flex-wrap items-end gap-space-sm">
        <div className="min-w-60 flex-1">
          <Field
            label="Buscar"
            hideLabel
            icon={<Search className="size-5" />}
            placeholder={`Buscar por código o nombre de ${label.singular}…`}
            value={search}
            onChange={(e) => { setSearch(e.target.value); }}
          />
        </div>
        {kind === 'procedures' ? (
          <SelectField label="Tipo" hideLabel value={kindFilter} onChange={(e) => { setKindFilter(e.target.value as KindFilter); }}>
            <option value="all">Todos los tipos (Procedimiento, Inyección)</option>
            <option value="procedure">Solo Procedimientos</option>
            <option value="injection">Solo Inyecciones</option>
          </SelectField>
        ) : null}
        <SelectField label="Estado" hideLabel value={stateFilter} onChange={(e) => { setStateFilter(e.target.value as StateFilter); }}>
          <option value="all">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
        </SelectField>
        <Button variant="elevated" aria-label="Actualizar" title="Actualizar" className="px-3" onClick={() => void reload()}>
          <RefreshCw aria-hidden className="size-5" />
        </Button>
      </div>

      <AsyncView
        source={catalog}
        loading="skeleton"
        isEmpty={(data) => data.items[kind].length === 0}
        empty={
          <EmptyState
            icon={BookOpen}
            title="Aún no hay entradas."
            description={`Cree la primera de ${label.title.toLocaleLowerCase('es')}.`}
            action={
              <Button onClick={() => { setCreating(true); }}>
                <Plus aria-hidden className="size-5" /> {NEW_LABELS[kind]}
              </Button>
            }
          />
        }
      >
        {(data) => {
          const rows = visible(data.items[kind]);
          return (
            <>
              <p className="flex items-center gap-space-xs text-body-md text-on-surface-variant">
                <span aria-hidden className="size-2 rounded-full bg-primary" />
                Mostrando <strong className="text-on-surface">{rows.length}</strong> de <strong className="text-on-surface">{data.items[kind].length}</strong>{' '}
                {label.title.toLocaleLowerCase('es')}
                {priced && site ? ` · precios de ${site.name}` : ''}
              </p>
              <DataTable
                caption={label.title}
                density="compact"
                cardsBelow="desk"
                rows={rows}
                rowKey={(r) => r.id}
                rowClassName={(r) => (r.active ? undefined : 'opacity-70')}
                empty="Ninguna entrada coincide con la búsqueda."
                columns={columnsFor(kind, site?.code ?? '', data.labProviders ?? [], {
                  onEdit: (item) => { setDialog({ kind: 'edit', item }); },
                  onDeactivate: (item) => { setDialog({ kind: 'deactivate', item }); },
                  onReactivate: (item) => void reactivate(item),
                  onUseGeneral: (item) => { setDialog({ kind: 'use-general', item }); },
                })}
              />
            </>
          );
        }}
      </AsyncView>

      {form && site && catalog.data ? (
        <CatalogDialog
          kind={kind}
          item={form.kind === 'edit' ? form.item : null}
          location={{ id: site.id, name: site.name }}
          today={catalog.data.today}
          generalToday={catalog.data.generalToday}
          labProviders={catalog.data.labProviders ?? []}
          onClose={closeForm}
          onConflict={conflict}
          onSaved={() => {
            closeForm();
            void reload();
            snackbar({ message: 'Guardado.' });
          }}
        />
      ) : null}
      {dialog?.kind === 'use-general' && site && catalog.data ? (
        <UseGeneralDialog
          kind={kind}
          item={dialog.item}
          site={{ id: site.id, name: site.name }}
          today={catalog.data.today}
          onClose={() => { setDialog(null); }}
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
          title={`¿Desactivar ${dialog.item.name}?`}
          description="Las entradas inactivas se ocultan al personal pero se conservan en el historial."
          reason={{ label: 'Motivo', hint: 'Se guarda en la auditoría y lo ven los administradores: no incluya información de pacientes.' }}
          confirmLabel="Desactivar"
          onConfirm={async (reason) => {
            try {
              await api.deactivateCatalogItem(kind, dialog.item.id, reason ?? '', dialog.item.version);
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
    </>
  );
}

function CodeBox({ code }: { code: string }) {
  return <span className="rounded-sm bg-surface-container-high px-space-xs py-0.5 font-mono text-code-md whitespace-nowrap text-on-surface">{code}</span>;
}

function StateChip({ active }: { active: boolean }) {
  return <SemanticChip tone={active ? 'success' : 'neutral'} label={active ? 'Activo' : 'Inactivo'} />;
}

/**
 * Un precio con su vigencia y el próximo programado. `empty`: lo que se
 * muestra sin precio («Sin precio» en el general, «Usa el precio general» en
 * la sede).
 */
function PriceCell({
  timeline,
  active,
  empty,
  action,
}: {
  timeline: PriceTimeline | undefined;
  active: boolean;
  empty: string;
  /** Junto al precio propio de la sede: «Volver al precio general». */
  action?: ReactNode;
}) {
  // Sin importe, la sede «Usa el precio general» (P-15).
  const current = withAmount(timeline?.current);
  const next = timeline?.next ?? null;
  return (
    <span className="flex flex-col items-end gap-0.5">
      {current ? (
        <>
          <span className="flex items-baseline gap-space-xs">
            {action}
            <MoneyText cents={current.amountCents} emphasis={active} className={cn('text-body-lg', !active && 'line-through')} />
            <span className="text-caption text-on-surface-variant">USD</span>
          </span>
          <span className="text-caption whitespace-nowrap text-on-surface-variant">Vigente desde {formatDay(current.effectiveFrom)}</span>
        </>
      ) : (
        <span className="text-body-md whitespace-nowrap text-on-surface-variant">{empty}</span>
      )}
      {next ? <span className="max-w-40 text-right text-caption text-on-surface-variant">{nextPriceText(next)}</span> : null}
    </span>
  );
}

function RowActions({
  item,
  onEdit,
  onDeactivate,
  onReactivate,
}: {
  item: CatalogItem;
  onEdit: (item: CatalogItem) => void;
  onDeactivate: (item: CatalogItem) => void;
  onReactivate: (item: CatalogItem) => void;
}) {
  return (
    <span className="flex flex-nowrap justify-end gap-space-xs">
      <Button variant="text" className="w-12 px-0 2xl:w-auto 2xl:px-space-sm" title="Editar" aria-label={`Editar ${item.name}`} onClick={() => { onEdit(item); }}>
        <Pencil aria-hidden className="size-5" /> <span className="hidden 2xl:inline">Editar</span>
      </Button>
      {item.active ? (
        <Button
          variant="text"
          className="w-12 px-0 text-on-surface-variant 2xl:w-auto 2xl:px-space-sm"
          title="Desactivar"
          aria-label={`Desactivar ${item.name}`}
          onClick={() => { onDeactivate(item); }}
        >
          <CirclePause aria-hidden className="size-5" /> <span className="hidden 2xl:inline">Desactivar</span>
        </Button>
      ) : (
        <Button variant="text" className="w-12 px-0 2xl:w-auto 2xl:px-space-sm" title="Reactivar" aria-label={`Reactivar ${item.name}`} onClick={() => { onReactivate(item); }}>
          <CirclePlay aria-hidden className="size-5" /> <span className="hidden 2xl:inline">Reactivar</span>
        </Button>
      )}
    </span>
  );
}

function columnsFor(
  kind: CatalogKind,
  siteCode: string,
  labProviders: readonly LabProvider[],
  actions: {
    onEdit: (item: CatalogItem) => void;
    onDeactivate: (item: CatalogItem) => void;
    onReactivate: (item: CatalogItem) => void;
    onUseGeneral: (item: CatalogItem) => void;
  },
): Column<CatalogItem>[] {
  const code: Column<CatalogItem> = { key: 'code', header: 'Código', cell: (r) => <CodeBox code={r.code} /> };
  const name: Column<CatalogItem> = {
    key: 'name',
    header: 'Nombre',
    primary: true,
    className: 'min-w-32',
    cell: (r) => <span className="text-body-lg-medium text-on-surface">{r.name}</span>,
  };
  const order: Column<CatalogItem> = { key: 'order', header: 'Orden', align: 'end', cell: (r) => (r.sortOrder === null ? '—' : r.sortOrder) };
  const state: Column<CatalogItem> = { key: 'state', header: 'Estado', cell: (r) => <StateChip active={r.active} /> };
  const general: Column<CatalogItem> = {
    key: 'general',
    header: 'Precio general',
    align: 'end',
    cell: (r) => <PriceCell timeline={r.price?.general} active={r.active} empty="Sin precio" />,
  };
  const site: Column<CatalogItem> = {
    key: 'site',
    header: `Precio en ${siteCode}`,
    align: 'end',
    cell: (r) => (
      <PriceCell
        timeline={r.price?.location}
        active={r.active}
        empty="Usa el precio general"
        action={
          <Button
            variant="text"
            className="w-12 px-0 text-on-surface-variant"
            title="Volver al precio general"
            aria-label={`Volver al precio general en ${siteCode}: ${r.name}`}
            onClick={() => { actions.onUseGeneral(r); }}
          >
            <Undo2 aria-hidden className="size-5" />
          </Button>
        }
      />
    ),
  };
  const acts: Column<CatalogItem> = {
    key: 'actions',
    header: 'Acciones',
    align: 'end',
    cell: (r) => <RowActions item={r} onEdit={actions.onEdit} onDeactivate={actions.onDeactivate} onReactivate={actions.onReactivate} />,
  };

  switch (kind) {
    case 'appointment-types':
      return [
        code,
        name,
        { key: 'duration', header: 'Duración', align: 'end', cell: (r) => (r.defaultDurationMinutes ? `${String(r.defaultDurationMinutes)} min` : '—') },
        { key: 'route', header: 'Ruta sugerida', cell: (r) => (r.suggestedRoute ? VISIT_ROUTE_LABELS[r.suggestedRoute] : '—') },
        {
          key: 'color',
          header: 'Color',
          cell: (r) =>
            r.color ? (
              <span className="flex items-center gap-space-sm">
                <span aria-hidden className={cn('h-6 w-1.5 rounded-full', AGENDA_STRIPE[r.color])} />
                {AGENDA_COLOR_LABELS[r.color]}
              </span>
            ) : (
              '—'
            ),
        },
        order,
        state,
        acts,
      ];
    case 'procedures':
      return [
        code,
        name,
        {
          key: 'kind',
          header: 'Tipo',
          cell: (r) => {
            if (!r.kind) return '—';
            const Icon = KIND_ICONS[r.kind];
            return (
              <span
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-caption font-semibold whitespace-nowrap',
                  r.kind === 'injection' ? 'bg-secondary/10 text-secondary' : 'bg-primary/10 text-primary',
                )}
              >
                <Icon aria-hidden className="size-4" />
                {PROCEDURE_KIND_LABELS[r.kind]}
              </span>
            );
          },
        },
        general,
        site,
        state,
        acts,
      ];
    case 'lab-tests':
      return [
        code,
        {
          ...name,
          // «Sin laboratorio asignado» (ADR 0028): no se podría sugerir laboratorio.
          cell: (r) => (
            <span className="flex flex-col items-start gap-space-xs">
              <span className="text-body-lg-medium text-on-surface">{r.name}</span>
              {hasNoLab(r, labProviders) ? <SemanticChip tone="warning" label="Sin laboratorio asignado" /> : null}
            </span>
          ),
        },
        general,
        site,
        state,
        acts,
      ];
    case 'referral-sources':
      return [code, name, order, state, acts];
  }
}

/**
 * «Volver al precio general» (P-15, ADR 0029): desde la fecha elegida (hoy o
 * después en la sede), la sede cobra el precio general. El precio propio se
 * conserva en el historial y la sede puede volver a tener uno.
 */
function UseGeneralDialog({
  kind,
  item,
  site,
  today,
  onClose,
  onSaved,
}: {
  kind: CatalogKind;
  item: CatalogItem;
  site: { id: string; name: string };
  today: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [from, setFrom] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      setError('Ingrese una fecha como AAAA-MM-DD.');
      return;
    }
    if (from < today) {
      setError('La fecha de vigencia no puede ser anterior a hoy.');
      return;
    }
    setBusy(true);
    try {
      await api.useGeneralPrice(kind, item.id, site.id, from);
      onSaved();
    } catch (e) {
      setError(catalogMessage(e));
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(next) => { if (!next && !busy) onClose(); }}
      icon={<Undo2 className="size-7" />}
      title={`¿Volver al precio general en ${site.name}?`}
      description={`Desde la fecha elegida, ${site.name} cobra el precio general de «${item.name}». Su precio propio se conserva en el historial.`}
      footer={
        <>
          <Button variant="tonal" className="text-on-surface" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} onClick={() => void confirm()}>
            Volver al precio general
          </Button>
        </>
      }
    >
      <Field
        label="Vigente desde"
        type="date"
        min={today}
        icon={<CalendarDays className="size-5" />}
        value={from}
        disabled={busy}
        error={error}
        onChange={(e) => {
          setFrom(e.target.value);
          setError(null);
        }}
      />
    </Dialog>
  );
}
