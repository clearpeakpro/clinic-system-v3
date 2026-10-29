import { assignmentsFor, displayNameSchema, needsLocation, reasonSchema, type Role } from '@clinic/shared';
import { Banner, Button, Checkbox, ChipGroup, Dialog, Field, TextAreaField } from '@clinic/ui';
import { MapPin, Pencil, UserCog } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { api, type MemberRow, type UsersList } from '../../lib/api.ts';
import { ROLE_LABELS } from '../../lib/format.ts';
import { isVersionConflict, locationIdsOf, rolesOf, userActionMessage } from '../../lib/users.ts';

// S-ADM-05 Editar nombre y S-ADM-06 Editar roles / Editar sedes. Envían la
// versión de la fila que se muestra; con un conflicto de versión (409) se
// cierran y la página ofrece «Actualizar». Otros errores, dentro del diálogo.

interface EditProps {
  row: MemberRow;
  onClose: () => void;
  onSaved: () => void;
  onConflict: () => void;
}

export function EditNameDialog({ row, onClose, onSaved, onConflict }: EditProps) {
  const [name, setName] = useState(row.name);
  const [error, setError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(name.trim() ? 'Máximo 120 caracteres.' : 'Este campo es obligatorio.');
      return;
    }
    // Sin cambios: no se envía nada (S-ADM-05).
    if (parsed.data === row.name) {
      onClose();
      return;
    }
    setBusy(true);
    setServerError(null);
    try {
      await api.renameMember(row.membershipId, parsed.data, row.version);
      onSaved();
    } catch (e) {
      if (isVersionConflict(e)) onConflict();
      else setServerError(userActionMessage(e));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}
      title="Editar nombre"
      icon={<Pencil className="size-7" />}
      footer={
        <>
          <Button variant="tonal" className="text-on-surface" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="edit-name-form" loading={busy}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="edit-name-form" noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-space-md">
        <div aria-live="polite">{serverError ? <Banner tone="error" title={serverError} /> : null}</div>
        <Field
          label="Nombre para mostrar"
          hint={`${String(name.length)}/120`}
          autoFocus
          maxLength={120}
          value={name}
          disabled={busy}
          error={error}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
      </form>
    </Dialog>
  );
}

/**
 * S-ADM-06. «Editar roles» y «Editar sedes» cambian una de las dos listas y
 * mantienen la otra: los roles clínicos se asignan en cada sede elegida y los
 * administrativos, en toda la organización. Exige motivo (regla 6).
 */
export function EditAssignmentsDialog({ row, mode, list, onClose, onSaved, onConflict }: EditProps & { mode: 'roles' | 'locations'; list: UsersList }) {
  const [roles, setRoles] = useState<Role[]>(rolesOf(row.assignments));
  const [locationIds, setLocationIds] = useState<string[]>(locationIdsOf(row.assignments));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ roles?: string | undefined; locations?: string | undefined; reason?: string | undefined }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Las sedes se muestran en «Editar sedes» y también en «Editar roles» si un
  // rol clínico nuevo no tiene todavía ninguna sede.
  const showLocations = mode === 'locations' || (needsLocation(roles) && locationIdsOf(row.assignments).length === 0);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (roles.length === 0) next.roles = 'Seleccione al menos un rol.';
    if (needsLocation(roles) && locationIds.length === 0) next.locations = 'Seleccione al menos una sede.';
    const parsedReason = reasonSchema.safeParse(reason);
    if (!parsedReason.success) next.reason = 'Se requiere un motivo.';
    setErrors(next);
    if (next.roles ?? next.locations ?? next.reason ?? !parsedReason.success) return;
    setBusy(true);
    setServerError(null);
    try {
      await api.changeRoles(row.membershipId, assignmentsFor(roles, locationIds), parsedReason.data, row.version);
      onSaved();
    } catch (e) {
      if (isVersionConflict(e)) onConflict();
      else setServerError(userActionMessage(e));
      setBusy(false);
    }
  };

  const toggle = <T,>(items: T[], item: T, on: boolean) => (on ? [...items, item] : items.filter((i) => i !== item));

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}
      dismissible={false}
      title={mode === 'roles' ? 'Editar roles' : 'Editar sedes'}
      description={row.name}
      icon={mode === 'roles' ? <UserCog className="size-7" /> : <MapPin className="size-7" />}
      footer={
        <>
          <Button variant="tonal" className="text-on-surface" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="edit-assignments-form" loading={busy}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="edit-assignments-form" noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-space-md">
        <div aria-live="polite">{serverError ? <Banner tone="error" title={serverError} /> : null}</div>
        {mode === 'roles' ? (
          <ChipGroup label="Roles" required error={errors.roles} hint="Los permisos se suman: la persona tiene todos los de sus roles.">
            <div className="flex w-full flex-col">
              {list.assignableRoles.map((role) => (
                <Checkbox key={role} label={ROLE_LABELS[role]} checked={roles.includes(role)} onCheckedChange={(on) => { setRoles((r) => toggle(r, role, on)); }} />
              ))}
            </div>
          </ChipGroup>
        ) : null}
        {showLocations ? (
          <ChipGroup label="Sedes" required error={errors.locations} hint="Los roles clínicos se asignan en cada sede elegida.">
            <div className="flex w-full flex-col">
              {/* Las inactivas solo aparecen si ya las tenía: se pueden conservar o quitar, no añadir (T-007). */}
              {list.locations.filter((l) => l.active || locationIds.includes(l.id)).map((location) => (
                <Checkbox
                  key={location.id}
                  label={`${location.name} (${location.code})${location.active ? '' : ' · inactiva'}`}
                  checked={locationIds.includes(location.id)}
                  onCheckedChange={(on) => { setLocationIds((l) => toggle(l, location.id, on)); }}
                />
              ))}
            </div>
          </ChipGroup>
        ) : null}
        <TextAreaField
          label="Motivo del cambio"
          hint="Se guarda en la auditoría y lo ven los administradores: no incluya información de pacientes."
          required
          maxLength={500}
          rows={2}
          value={reason}
          disabled={busy}
          error={errors.reason ?? null}
          onChange={(e) => {
            setReason(e.target.value);
            setErrors((current) => ({ ...current, reason: undefined }));
          }}
        />
      </form>
    </Dialog>
  );
}
