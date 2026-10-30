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
  type PriceTimeline,
  type ProcedureKind,
} from '@clinic/shared';
import {
  AsyncView,
  Button,
  cn,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Field,
  MoneyText,
  SelectField,
  SemanticChip,
  useSnackbar,
  type Column,
} from '@clinic/ui';
import { useQuery } from '@tanstack/react-query';
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
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Syringe,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { AGENDA_STRIPE, CatalogDialog } from '../components/catalog/catalog-dialog.tsx';
import { api, ApiError } from '../lib/api.ts';
import { catalogMessage, formatDay, NEW_LABELS, nextPriceText } from '../lib/catalog.ts';
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
// columnas del manual.

const TAB_ICONS: Record<CatalogKind, LucideIcon> = {
  'appointment-types': CalendarDays,
  procedures: BriefcaseMedical,
  'lab-tests': FlaskConical,
  'referral-sources': Share2,
};

const KIND_ICONS: Record<ProcedureKind, LucideIcon> = { procedure: BriefcaseMedical, injection: Syringe };

type StateFilter = 'all' | 'active' | 'inactive';
type KindFilter = 'all' | ProcedureKind;

type Dialogs = { kind: 'new' } | { kind: 'edit'; item: CatalogItem } | { kind: 'deactivate'; item: CatalogItem } | null;

/** Pestaña de la URL (`/admin/catalogos/<pestaña>`). */
export function catalogKindOf(segment: string): CatalogKind | undefined {
  return CATALOG_KINDS.find((k) => CATALOG_LABELS[k].segment === segment);
}

export function AdminCatalogPage({ kind }: { kind: CatalogKind }) {
  const active = useActiveLocation();
  const locations = useLocations();
  const sites = locations.data ? flatten(locations.data).filter((l) => l.organizationId === active?.organizationId) : [];
  const [siteId, setSiteId] = useState<string | null>(null);
  const site = sites.find((l) => l.id === siteId) ?? active;
  const catalog = useQuery<CatalogList, ApiError>({
    queryKey: ['admin-catalog', site?.id],
    queryFn: () => api.adminCatalog(site?.id ?? ''),
    enabled: site !== undefined,
    staleTime: 0,
  });
  const snackbar = useSnackbar();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const priced = PRICED_KINDS.includes(kind);
  const label = CATALOG_LABELS[kind];

  const reload = async () => {
    await catalog.refetch();
  };
  const conflict = () => {
    setDialog(null);
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
    <section aria-labelledby="page-title" className="mx-auto flex w-full max-w-7xl flex-col gap-space-lg">
      <header className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-lg shadow-level-1 dark:bg-surface-container-low">
        <div className="flex flex-wrap items-end justify-between gap-space-md desk:flex-nowrap">
          <div className="flex min-w-0 flex-1 flex-col gap-space-xs">
            <h1 id="page-title" className="text-display-md text-on-surface">
              Catálogos y precios
            </h1>
            <p className="text-body-lg text-on-surface-variant">Tipos de cita, procedimientos, pruebas de laboratorio y fuentes de referido, con sus precios por sede.</p>
          </div>
          <Button className="shrink-0" onClick={() => { setDialog({ kind: 'new' }); }}>
            <Plus aria-hidden className="size-5" /> {NEW_LABELS[kind]}
          </Button>
        </div>
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
      </header>

      <nav aria-label="Catálogos" className="flex gap-space-xs overflow-x-auto rounded-lg bg-surface-container-lowest p-space-xs shadow-level-1 dark:bg-surface-container-low">
        {CATALOG_KINDS.map((k) => {
          const Icon = TAB_ICONS[k];
          const selected = k === kind;
          const count = catalog.data?.items[k].length;
          return (
            <Link
              key={k}
              to="/admin/catalogos/$pestana"
              params={{ pestana: CATALOG_LABELS[k].segment }}
              aria-current={selected ? 'page' : undefined}
              className={cn(
                'flex min-h-touch shrink-0 items-center gap-space-sm rounded-md px-space-md text-body-lg whitespace-nowrap transition-colors',
                selected ? 'bg-primary text-on-primary' : 'text-on-surface hover:bg-surface-container-low dark:hover:bg-surface-container-high',
              )}
            >
              <Icon aria-hidden className="size-5" />
              {CATALOG_LABELS[k].title}
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
                <Button onClick={() => { setDialog({ kind: 'new' }); }}>
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
                  columns={columnsFor(kind, site?.code ?? '', {
                    onEdit: (item) => { setDialog({ kind: 'edit', item }); },
                    onDeactivate: (item) => { setDialog({ kind: 'deactivate', item }); },
                    onReactivate: (item) => void reactivate(item),
                  })}
                />
              </>
            );
          }}
        </AsyncView>
      </div>

      {(dialog?.kind === 'new' || dialog?.kind === 'edit') && site && catalog.data ? (
        <CatalogDialog
          kind={kind}
          item={dialog.kind === 'edit' ? dialog.item : null}
          location={{ id: site.id, name: site.name }}
          today={catalog.data.today}
          generalToday={catalog.data.generalToday}
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
    </section>
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
function PriceCell({ timeline, active, empty }: { timeline: PriceTimeline | undefined; active: boolean; empty: string }) {
  const current = timeline?.current ?? null;
  const next = timeline?.next ?? null;
  return (
    <span className="flex flex-col items-end gap-0.5">
      {current ? (
        <>
          <span className="flex items-baseline gap-space-xs">
            <MoneyText cents={current.amountCents} emphasis={active} className={cn('text-body-lg', !active && 'line-through')} />
            <span className="text-caption text-on-surface-variant">USD</span>
          </span>
          <span className="text-caption whitespace-nowrap text-on-surface-variant">Vigente desde {formatDay(current.effectiveFrom)}</span>
        </>
      ) : (
        <span className="text-body-md whitespace-nowrap text-on-surface-variant">{empty}</span>
      )}
      {next ? <span className="text-caption whitespace-nowrap text-on-surface-variant">{nextPriceText(next)}</span> : null}
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
  actions: { onEdit: (item: CatalogItem) => void; onDeactivate: (item: CatalogItem) => void; onReactivate: (item: CatalogItem) => void },
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
    cell: (r) => <PriceCell timeline={r.price?.location} active={r.active} empty="Usa el precio general" />,
  };
  const acts: Column<CatalogItem> = { key: 'actions', header: 'Acciones', align: 'end', cell: (r) => <RowActions item={r} {...actions} /> };

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
      return [code, name, general, site, state, acts];
    case 'referral-sources':
      return [code, name, order, state, acts];
  }
}
