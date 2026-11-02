import type { EncounterProvider } from '@clinic/shared';
import { cn, Field, SelectField } from '@clinic/ui';
import { Check, Search, Stethoscope, X } from 'lucide-react';
import { groupLabel, isChipGroup, PANEL_CHIPS, type PanelFilter, type PanelGroup } from '../../lib/panel.ts';

// S-REC-03 Barra de filtros: chips de estación (selección única, con su
// número como en Stitch) y menú de proveedor; los dos se combinan. Si el
// filtro activo viene de una tarjeta sin chip («Con enfermería»…), aparece
// marcado como un chip más, con «Quitar filtro», para que se vea en la barra
// (nota del manual). Búsqueda en la cola (ADR 0012) por nombre o código.

function Chip({ label, count, selected, onClick }: { label: string; count?: number; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-touch shrink-0 items-center gap-space-xs rounded-full border px-space-md text-body-md-medium whitespace-nowrap transition-colors',
        selected
          ? 'border-primary bg-primary text-on-primary'
          : 'border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low dark:bg-surface-container-low',
      )}
    >
      {selected ? <Check aria-hidden className="size-[18px]" /> : null}
      {label}
      {count === undefined ? null : (
        <span
          className={cn(
            'min-w-6 rounded-full px-1.5 text-center text-caption tabular-nums',
            selected ? 'bg-on-primary text-primary' : 'bg-surface-container-high text-on-surface-variant dark:bg-surface-container-highest',
          )}
        >
          <span className="sr-only">(</span>
          {count}
          <span className="sr-only">)</span>
        </span>
      )}
    </button>
  );
}

export function FilterBar({
  filter,
  counts,
  providers,
  canMine,
  search,
  onFilter,
  onSearch,
}: {
  filter: PanelFilter;
  counts: Record<PanelGroup, number> | null;
  providers: readonly EncounterProvider[];
  canMine: boolean;
  search: string;
  onFilter: (next: PanelFilter) => void;
  onSearch: (text: string) => void;
}) {
  const knownProvider = ['all', 'mine', 'none'].includes(filter.provider) || providers.some((p) => p.membershipId === filter.provider);
  return (
    <div className="flex flex-col gap-space-sm">
      <div role="group" aria-label="Estación" className="relative -mx-4 flex gap-space-sm overflow-x-auto px-4 pb-1 tab:mx-0 tab:flex-wrap tab:overflow-visible tab:px-0">
        {PANEL_CHIPS.map((chip) => (
          <Chip
            key={chip.group}
            label={chip.label}
            {...(counts ? { count: counts[chip.group] } : {})}
            selected={filter.group === chip.group}
            onClick={() => { onFilter({ ...filter, group: chip.group }); }}
          />
        ))}
        {isChipGroup(filter.group) ? null : (
          <span className="inline-flex min-h-touch shrink-0 items-center gap-space-xs rounded-full border border-primary bg-primary pr-1 pl-space-md text-body-md-medium whitespace-nowrap text-on-primary">
            <Check aria-hidden className="size-[18px]" />
            <span data-testid="card-filter">{groupLabel(filter.group)}</span>
            {counts ? <span className="sr-only">({counts[filter.group]})</span> : null}
            <button
              type="button"
              aria-label={`Quitar el filtro ${groupLabel(filter.group)}`}
              title="Quitar filtro"
              onClick={() => { onFilter({ ...filter, group: 'open' }); }}
              className="flex size-10 items-center justify-center rounded-full hover:bg-on-primary/15"
            >
              <X aria-hidden className="size-5" />
            </button>
          </span>
        )}
      </div>
      <div className="flex flex-col gap-space-sm tab:flex-row tab:items-end tab:justify-between">
        <div className="min-w-0 tab:w-full tab:max-w-md">
          <Field
            label="Buscar en la cola"
            hideLabel
            type="search"
            placeholder="Buscar en la cola por nombre o código"
            icon={<Search className="size-5" />}
            value={search}
            onChange={(e) => { onSearch(e.target.value); }}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="tab:w-80 tab:shrink-0">
          <SelectField
            label="Proveedor"
            hideLabel
            icon={<Stethoscope className="size-5" />}
            value={filter.provider}
            onChange={(e) => { onFilter({ ...filter, provider: e.target.value }); }}
          >
            <option value="all">Todos los proveedores</option>
            {canMine ? <option value="mine">Mis pacientes</option> : null}
            <option value="none">Sin asignar</option>
            {knownProvider ? null : <option value={filter.provider}>Asignado</option>}
            {providers.length > 0 ? <option disabled>──────────</option> : null}
            {providers.map((p) => (
              <option key={p.membershipId} value={p.membershipId}>
                {p.name}
              </option>
            ))}
          </SelectField>
        </div>
      </div>
    </div>
  );
}
