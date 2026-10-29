import { MFA_REQUIRED_ROLES, reasonSchema } from '@clinic/shared';
import { Banner, Button, Dialog, formatDateTime, RefreshBar, TextAreaField } from '@clinic/ui';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { api, ApiError, type MemberRow, type MfaStatus } from '../../lib/api.ts';
import { userActionMessage } from '../../lib/users.ts';
import type { Secret } from './secret-dialog.tsx';

// S-ADM-08 Restablecer la verificación en dos pasos. Lee primero el estado;
// con un restablecimiento pendiente muestra la vista «pendiente», desde la que
// se emite un enlace nuevo. Motivo obligatorio en las dos vistas (decisión de
// T-006a). Sin inicio de sesión con Google: no hay casilla ni avisos de Google.

export function MfaResetDialog({
  row,
  timeZone,
  onClose,
  onDone,
}: {
  row: MemberRow;
  timeZone: string;
  onClose: () => void;
  /** Hecho: con el enlace de restablecimiento si lo hubo y el aviso para la página. */
  onDone: (secret: Secret | null, message: string | null) => void;
}) {
  const status = useQuery<MfaStatus, ApiError>({
    queryKey: ['users', 'mfa', row.membershipId],
    queryFn: () => api.mfaStatus(row.membershipId),
    staleTime: 0,
    gcTime: 0,
  });
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [lostLink, setLostLink] = useState(false);
  const [busy, setBusy] = useState(false);

  const data = status.data;
  const pending = data?.resetPendingSince ?? null;
  const active = row.status === 'active';
  const mfaRequired = row.assignments.some((a) => MFA_REQUIRED_ROLES.includes(a.role));
  const nothing = data !== undefined && !pending && !data.enrolled;
  const name = row.name;

  const parsedReason = () => {
    const parsed = reasonSchema.safeParse(reason);
    if (!parsed.success) {
      setReasonError('Ingrese el motivo.');
      return null;
    }
    return parsed.data;
  };

  const reset = async () => {
    const value = parsedReason();
    if (!value) return;
    setBusy(true);
    setServerError(null);
    try {
      const { reset: link } = await api.resetMfa(row.membershipId, value);
      onDone(
        link
          ? { kind: 'mfa', name, link: link.link, expiresAt: link.expiresAt, wasLocked: data?.lockedUntil !== null, mfaRequired }
          : null,
        `Se restableció la verificación en dos pasos de ${name}.`,
      );
    } catch (error) {
      // Si la respuesta se perdió pero el restablecimiento se hizo, se pasa a la vista pendiente.
      const fresh = await status.refetch();
      if (fresh.data?.resetPendingSince) {
        setLostLink(true);
        setReason('');
      } else {
        setServerError(userActionMessage(error));
      }
      setBusy(false);
    }
  };

  const issue = async () => {
    const value = parsedReason();
    if (!value) return;
    setBusy(true);
    setServerError(null);
    try {
      const link = await api.createPasswordReset(row.membershipId, value);
      onDone({ kind: 'new-token', name, link: link.link, expiresAt: link.expiresAt }, null);
    } catch (error) {
      setServerError(userActionMessage(error));
      setBusy(false);
    }
  };

  const reasonField = (
    <TextAreaField
      label="Motivo"
      placeholder="Por ejemplo: perdió el teléfono, identidad confirmada en persona"
      hint="Se guarda en la auditoría y lo ven los administradores: no incluya información de pacientes."
      required
      maxLength={500}
      rows={2}
      value={reason}
      disabled={busy || nothing}
      error={reasonError}
      onChange={(e) => {
        setReason(e.target.value);
        setReasonError(null);
      }}
    />
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}
      dismissible={!busy && reason === ''}
      wide
      tone="danger"
      icon={<ShieldAlert className="size-7" />}
      title={`¿Restablecer la verificación en dos pasos de ${name}?`}
      footer={
        <>
          <Button variant="tonal" className="text-on-surface" disabled={busy} onClick={onClose}>
            {pending && !active ? 'Cerrar' : 'Cancelar'}
          </Button>
          {pending ? (
            active ? (
              <Button loading={busy} onClick={() => void issue()}>
                Emitir un enlace nuevo
              </Button>
            ) : null
          ) : (
            <Button variant="destructive" loading={busy} disabled={(data === undefined && !status.error) || nothing} onClick={() => void reset()}>
              Restablecer la verificación en dos pasos
            </Button>
          )}
        </>
      }
    >
      {status.isFetching && !data ? <RefreshBar label="Leyendo el estado…" /> : null}
      {/* Estado ilegible: sin línea de estado; el restablecimiento sigue disponible. */}
      <div aria-live="polite">{serverError ? <Banner tone="error" title={serverError} /> : null}</div>
      {pending ? (
        <>
          <p className="rounded-md bg-surface-container-low p-space-sm text-body-md text-on-surface dark:bg-surface-container">
            {lostLink
              ? 'El restablecimiento se completó, pero ningún enlace llegó a esta pantalla. Emita uno nuevo. '
              : null}
            Restablecida el {formatDateTime(pending, timeZone)}, pendiente de {name}: hasta que fije una contraseña nueva con el enlace de restablecimiento e
            inicie sesión, la cuenta sigue cerrada. Si el enlace se perdió o venció, emita uno nuevo.
          </p>
          {active ? reasonField : <p className="text-body-md text-on-surface-variant">Podrá emitir un enlace nuevo cuando la cuenta vuelva a estar activa.</p>}
        </>
      ) : (
        <>
          {data && !data.enrolled ? <p className="text-body-md text-on-surface">{name} no tiene verificación en dos pasos que restablecer.</p> : null}
          {data?.enrolled && data.lockedUntil ? (
            <p role="note" className="rounded-md bg-error-container p-space-sm text-body-md text-on-error-container">
              Bloqueada hasta el {formatDateTime(data.lockedUntil, timeZone)} tras demasiados códigos erróneos seguidos. Salvo que los haya escrito {name},
              trátelo como un incidente de seguridad.
            </p>
          ) : null}
          {data?.enrolled && !data.lockedUntil ? (
            <p className="text-body-md text-on-surface">
              Activa.
              {data.backupCodesLeft !== null ? ` Códigos de recuperación sin usar: ${String(data.backupCodesLeft)}.` : null}
            </p>
          ) : null}
          <p className="text-body-md text-on-surface-variant">
            Úselo cuando la persona perdió o cambió su teléfono, o tiene la verificación en dos pasos bloqueada, y solo después de confirmar su identidad (en
            persona o llamando a un número conocido). Su aplicación de autenticación, sus códigos de recuperación y su contraseña dejan de funcionar y se
            cierran todas sus sesiones.{' '}
            {mfaRequired
              ? 'Su rol la exige: al volver a entrar deberá configurarla de nuevo.'
              : 'Al volver a entrar podrá activarla de nuevo desde su Perfil.'}
          </p>
          {reasonField}
        </>
      )}
    </Dialog>
  );
}
