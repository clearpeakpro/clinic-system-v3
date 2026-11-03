import { type OrderAssignee } from '@clinic/shared';
import { AsyncView, Banner, Button, cn, Dialog, EmptyState } from '@clinic/ui';
import { useQuery } from '@tanstack/react-query';
import { Circle, CircleCheck, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { api, type ApiError } from '../../lib/api.ts';

// S-CLI-22 «Asignar orden» (T-026). La lista: el personal activo con rol
// Enfermería o Proveedor en la sede (decisión del 2026-11-02; el manual solo
// mostraba proveedores). Un toque asigna. «Asignarme» si quien llama no es
// el asignado; «Quitar asignación» si hay alguien. Solo nombres del personal.

const ROLE_LABELS = { enfermeria: 'Enfermería', proveedor: 'Proveedor' } as const;

export function AssignOrderDialog({
  code,
  current,
  onClose,
  onAssign,
}: {
  code: string;
  /** Membresía del asignado actual (nula: «Sin asignar»). */
  current: string | null;
  onClose: () => void;
  /** Devuelve el mensaje de error, o nulo si salió bien. */
  onAssign: (membershipId: string | null) => Promise<string | null>;
}) {
  const people = useQuery<OrderAssignee[], ApiError>({ queryKey: ['order-assignees'], queryFn: api.orderAssignees, staleTime: 0, gcTime: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const me = people.data?.find((p) => p.me) ?? null;

  const pick = async (membershipId: string | null) => {
    setBusy(true);
    setError(null);
    try {
      setError(await onAssign(membershipId));
    } finally {
      setBusy(false);
    }
  };

  const assignedToMe = me !== null && me.membershipId === current;

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}
      icon={<UserPlus className="size-7" />}
      title="Asignar orden"
      description={`Orden ${code}. Elija quién la ejecutará.`}
      footer={
        <>
          <Button variant="tonal" className="text-on-surface" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          {current !== null ? (
            <Button variant="outline" disabled={busy} onClick={() => void pick(null)}>
              Quitar asignación
            </Button>
          ) : null}
          {me && !assignedToMe ? (
            <Button loading={busy} onClick={() => void pick(me.membershipId)}>
              Asignarme
            </Button>
          ) : null}
        </>
      }
    >
      <AsyncView source={people} isEmpty={(data) => data.length === 0} empty={<EmptyState icon={Users} title="No hay personal elegible en esta sede." />}>
        {(data) => (
          <div role="radiogroup" aria-label="Personal de la sede" className="flex max-h-80 flex-col gap-space-xs overflow-y-auto">
            {data.map((p) => {
              const selected = p.membershipId === current;
              const Icon = selected ? CircleCheck : Circle;
              return (
                <button
                  key={p.membershipId}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={busy}
                  onClick={() => { if (!selected) void pick(p.membershipId); }}
                  className={cn(
                    'flex min-h-touch w-full items-center gap-space-sm rounded-md px-space-md text-left text-body-lg text-on-surface hover:bg-surface-container-low disabled:opacity-60',
                    selected && 'bg-surface-container',
                  )}
                >
                  <Icon aria-hidden className={cn('size-5 shrink-0', selected ? 'text-primary' : 'text-on-surface-variant')} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span>{p.me ? `${p.name} (usted)` : p.name}</span>
                    <span className="text-caption text-on-surface-variant">{p.roles.map((r) => ROLE_LABELS[r]).join(' · ')}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </AsyncView>
      {error ? <Banner tone="error" title={error} /> : null}
    </Dialog>
  );
}
