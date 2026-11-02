import type { EncounterProvider } from '@clinic/shared';
import { AsyncView, Button, cn, Dialog, EmptyState } from '@clinic/ui';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, Circle, UserRoundPlus, Users } from 'lucide-react';
import { api, type ApiError } from '../../lib/api.ts';

// S-CLI-06 «Asignar proveedor»: proveedores activos de la sede, por nombre;
// el actual con el radio lleno. Un toque asigna y cierra (manual). Elegir el
// actual no cambia nada (el servidor responde sin escribir).

export function AssignProviderDialog({
  current,
  onClose,
  onPick,
}: {
  current: string | null;
  onClose: () => void;
  onPick: (provider: EncounterProvider) => void;
}) {
  const providers = useQuery<EncounterProvider[], ApiError>({ queryKey: ['encounter-providers'], queryFn: api.encounterProviders, staleTime: 60_000 });
  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      icon={<UserRoundPlus className="size-7" />}
      title="Asignar proveedor"
      footer={
        <Button variant="tonal" className="text-on-surface" onClick={onClose}>
          Cancelar
        </Button>
      }
    >
      <AsyncView
        source={providers}
        isEmpty={(list) => list.length === 0}
        empty={<EmptyState icon={Users} title="No hay proveedores activos en esta sede." />}
      >
        {(list) => (
          <div role="radiogroup" aria-label="Proveedores" className="flex max-h-80 flex-col gap-space-xs overflow-y-auto">
            {list.map((p) => {
              const selected = p.membershipId === current;
              const Icon = selected ? CircleCheck : Circle;
              return (
                <button
                  key={p.membershipId}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => { onPick(p); }}
                  className={cn(
                    'flex min-h-touch w-full items-center gap-space-sm rounded-md px-space-md text-left text-body-lg text-on-surface hover:bg-surface-container-low',
                    selected && 'bg-surface-container',
                  )}
                >
                  <Icon aria-hidden className={cn('size-5 shrink-0', selected ? 'text-primary' : 'text-on-surface-variant')} />
                  {p.name}
                </button>
              );
            })}
          </div>
        )}
      </AsyncView>
    </Dialog>
  );
}
