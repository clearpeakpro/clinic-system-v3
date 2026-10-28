import { Button, copyText, Dialog, formatDateTime, useSnackbar } from '@clinic/ui';
import { Copy, KeyRound, Link as LinkIcon, Mail, ShieldAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// S-ADM-04 Diálogo de secreto de un solo uso. El enlace llega una sola vez del
// servidor y vive solo aquí, en memoria. «Copiar enlace» lo pasa al
// portapapeles y programa su borrado al minuto; «Cerrar» lo borra dentro del
// mismo toque (la web solo deja escribir el portapapeles tras un gesto) y
// cierra: el enlace no se puede volver a ver.

export type SecretKind = 'invitation' | 'password' | 'mfa' | 'new-token';

export interface Secret {
  kind: SecretKind;
  name: string;
  link: string;
  expiresAt: string;
  /** Invitación: correo de destino y si salió el correo. */
  email?: string;
  mailSent?: boolean;
  /** Restablecimiento del MFA: el factor estaba bloqueado. */
  wasLocked?: boolean;
  /** Restablecimiento del MFA: su rol exige volver a configurarla. */
  mfaRequired?: boolean;
}

const TITLES: Record<SecretKind, string> = {
  invitation: 'Invitación creada',
  password: 'Restablecimiento de contraseña creado',
  mfa: 'Verificación en dos pasos restablecida',
  'new-token': 'Nuevo enlace de restablecimiento de contraseña',
};

const CLEAR_AFTER_MS = 60_000;

export function SecretDialog({ secret, timeZone, onClose }: { secret: Secret | null; timeZone: string; onClose: () => void }) {
  const snackbar = useSnackbar();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!secret) return null;
  // «… p. m.» ya termina en punto: el texto no le añade otro.
  const expires = formatDateTime(secret.expiresAt, timeZone).replace(/\.$/, '');

  const copy = async () => {
    if (!(await copyText(secret.link))) return;
    setCopied(true);
    snackbar({ message: 'Copiado al portapapeles.' });
    if (timer.current) clearTimeout(timer.current);
    // Puede que el navegador no lo permita sin un gesto: se intenta igual.
    timer.current = setTimeout(() => void copyText(''), CLEAR_AFTER_MS);
  };

  const close = () => {
    if (copied) void copyText('');
    if (timer.current) clearTimeout(timer.current);
    setCopied(false);
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) close(); }}
      dismissible={false}
      title={TITLES[secret.kind]}
      icon={secret.kind === 'invitation' ? <Mail className="size-7" /> : secret.kind === 'mfa' ? <ShieldAlert className="size-7" /> : <KeyRound className="size-7" />}
      description={<Explanation secret={secret} expires={expires} />}
      footer={<Button onClick={close}>Cerrar</Button>}
    >
      {secret.kind === 'mfa' && secret.wasLocked ? (
        <p role="note" className="rounded-md bg-error-container p-space-sm text-body-md text-on-error-container">
          La verificación estaba bloqueada: regístrelo como incidente de seguridad y revise la actividad reciente de la cuenta.
        </p>
      ) : null}
      {secret.kind === 'invitation' && secret.email ? (
        <p className="text-body-md text-on-surface-variant">
          {secret.mailSent ? (
            <>
              También se envió por correo a <span className="font-mono text-code-sm break-all text-on-surface">{secret.email}</span>.
            </>
          ) : (
            <>
              No se pudo enviar el correo a <span className="font-mono text-code-sm break-all text-on-surface">{secret.email}</span>: entregue este enlace por
              otro medio.
            </>
          )}
        </p>
      ) : null}
      <div className="flex flex-col gap-space-xs rounded-md bg-surface-container-low p-space-sm dark:bg-surface-container">
        <span className="flex items-center gap-space-xs text-caption text-on-surface-variant">
          <LinkIcon aria-hidden className="size-4 text-primary" />
          {secret.kind === 'invitation' ? 'Enlace de invitación' : 'Enlace de restablecimiento'}
        </span>
        <code data-testid="one-time-link" className="font-mono text-code-sm break-all text-on-surface select-all">
          {secret.link}
        </code>
        <Button variant="tonal" className="self-start" onClick={() => void copy()}>
          <Copy aria-hidden className="size-5" /> Copiar enlace
        </Button>
      </div>
      <p className="text-caption text-on-surface-variant">
        Al copiarlo, el enlace pasa al portapapeles de este dispositivo, que el historial o la sincronización del portapapeles pueden conservar. Péguelo
        enseguida donde vaya a entregarlo. La aplicación borra el portapapeles al cerrar y lo intenta de nuevo al cabo de un minuto, pero algunos navegadores
        y dispositivos no lo permiten: si tiene dudas, copie otra cosa encima.
      </p>
    </Dialog>
  );
}

function Explanation({ secret, expires }: { secret: Secret; expires: string }) {
  switch (secret.kind) {
    case 'invitation':
      return `Compártalo con ${secret.name}. Se muestra una sola vez y vence el ${expires}.`;
    case 'password':
      return `Comparta este enlace con ${secret.name}. Se muestra una sola vez y vence el ${expires}.`;
    case 'mfa':
      return `La contraseña de ${secret.name} ya no funciona hasta que fije una nueva con este enlace${
        secret.mfaRequired ? ' y vuelva a configurar la verificación en dos pasos' : ''
      }. Entréguelo a ${secret.name} en persona o por un canal verificado: se muestra una sola vez y vence el ${expires}.`;
    case 'new-token':
      return `Cualquier enlace de restablecimiento anterior de ${secret.name} deja de funcionar. Entregue este a ${secret.name} en persona o por un canal verificado: se muestra una sola vez y vence el ${expires}.`;
  }
}
