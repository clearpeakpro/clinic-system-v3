import { displayNameSchema, needsLocation, type Role } from '@clinic/shared';
import { Banner, Button, ChipGroup, Dialog, DiscardChangesDialog, Field, FilterChip } from '@clinic/ui';
import { Mail, UserPlus, UserRound } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { api, type UsersList } from '../../lib/api.ts';
import { ROLE_LABELS } from '../../lib/format.ts';
import { userActionMessage } from '../../lib/users.ts';
import type { Secret } from './secret-dialog.tsx';

// S-ADM-03 Invitar usuario. 560 px; en el teléfono, pantalla completa. No se
// cierra tocando fuera; con datos escritos pregunta antes de descartarlos.
// Los roles que se ofrecen son solo los que quien invita puede asignar (regla
// escalonada). Sin un rol clínico no hacen falta sedes: los roles
// administrativos valen para toda la organización.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteDialog({
  open,
  onOpenChange,
  list,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  list: UsersList;
  onCreated: (secret: Secret) => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState({ email: false, name: false });
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const withLocations = needsLocation(roles);
  const errors = {
    email: !email.trim() ? 'Este campo es obligatorio.' : !EMAIL_RE.test(email.trim()) || email.trim().length > 254 ? 'Ingrese un correo electrónico válido.' : null,
    name: !name.trim() ? 'Este campo es obligatorio.' : displayNameSchema.safeParse(name).success ? null : 'Máximo 120 caracteres.',
    roles: roles.length === 0 ? 'Seleccione al menos un rol.' : null,
    locations: withLocations && locationIds.length === 0 ? 'Seleccione al menos una sede.' : null,
  };
  const dirty = email !== '' || name !== '' || roles.length > 0 || locationIds.length > 0;

  const reset = () => {
    setEmail('');
    setName('');
    setRoles([]);
    setLocationIds([]);
    setSubmitted(false);
    setTouched({ email: false, name: false });
    setServerError(null);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const requestClose = () => {
    if (busy) return;
    if (dirty) setConfirmDiscard(true);
    else close();
  };

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    setTouched({ email: true, name: true });
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    setServerError(null);
    try {
      const created = await api.invite({
        email: email.trim(),
        name: name.trim(),
        roles,
        locationIds: withLocations ? locationIds : [],
      });
      const secret: Secret = {
        kind: 'invitation',
        name: name.trim(),
        email: email.trim().toLowerCase(),
        link: created.link,
        expiresAt: created.expiresAt,
        mailSent: created.mailSent,
      };
      close();
      onCreated(secret);
    } catch (error) {
      setServerError(userActionMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const toggle = <T,>(items: T[], item: T, on: boolean) => (on ? [...items, item] : items.filter((i) => i !== item));

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => { if (!next) requestClose(); }}
        dismissible={false}
        wide
        fullScreenOnPhone
        title="Invitar usuario"
        icon={<UserPlus className="size-7" />}
        description="La persona recibe un enlace de un solo uso para crear su contraseña."
        footer={
          <>
            <Button variant="tonal" className="text-on-surface" disabled={busy} onClick={requestClose}>
              Cancelar
            </Button>
            <Button type="submit" form="invite-form" loading={busy}>
              Crear invitación
            </Button>
          </>
        }
      >
        <form id="invite-form" noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-space-md">
          <div aria-live="polite">{serverError ? <Banner tone="error" title={serverError} /> : null}</div>
          <Field
            label="Correo electrónico"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoFocus
            maxLength={254}
            icon={<Mail className="size-5" />}
            value={email}
            disabled={busy}
            error={touched.email ? errors.email : null}
            onChange={(e) => { setEmail(e.target.value); setTouched((t) => ({ ...t, email: true })); }}
          />
          <Field
            label="Nombre para mostrar"
            hint={`${String(name.length)}/120`}
            autoComplete="off"
            autoCapitalize="words"
            maxLength={120}
            icon={<UserRound className="size-5" />}
            value={name}
            disabled={busy}
            error={touched.name ? errors.name : null}
            onChange={(e) => { setName(e.target.value); setTouched((t) => ({ ...t, name: true })); }}
          />
          <ChipGroup label="Roles" required error={submitted ? errors.roles : null}>
            {list.assignableRoles.map((role) => (
              <FilterChip
                key={role}
                label={ROLE_LABELS[role]}
                selected={roles.includes(role)}
                disabled={busy}
                onToggle={(on) => { setRoles((r) => toggle(r, role, on)); }}
              />
            ))}
          </ChipGroup>
          {withLocations ? (
            <ChipGroup label="Sedes" required error={submitted ? errors.locations : null} hint="Los roles clínicos se asignan en cada sede elegida.">
              {/* Las sedes inactivas no se ofrecen (T-007). */}
              {list.locations.filter((l) => l.active).map((location) => (
                <FilterChip
                  key={location.id}
                  label={`${location.name} (${location.code})`}
                  selected={locationIds.includes(location.id)}
                  disabled={busy}
                  onToggle={(on) => { setLocationIds((l) => toggle(l, location.id, on)); }}
                />
              ))}
            </ChipGroup>
          ) : roles.length > 0 ? (
            <p className="text-body-md text-on-surface-variant">Los roles administrativos valen para toda la organización: no llevan sedes.</p>
          ) : null}
        </form>
      </Dialog>
      <DiscardChangesDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        onDiscard={() => {
          setConfirmDiscard(false);
          close();
        }}
      />
    </>
  );
}
