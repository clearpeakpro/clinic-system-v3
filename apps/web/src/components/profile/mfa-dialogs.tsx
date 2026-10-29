import { Banner, Button, Dialog, OTP_LENGTH, OtpInput } from '@clinic/ui';
import { KeyRound, ShieldOff, Smartphone } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api.ts';
import { failureKind, failureMessage } from '../../lib/errors.ts';
import { MfaEnroll, RecoveryCodes } from '../../pages/login.tsx';

// Diálogos del Perfil sobre la verificación en dos pasos. Ninguno se cierra
// tocando fuera (manual): contraseña, clave y códigos viven solo aquí.

/**
 * S-GEN-23: contraseña → QR y código (panel de S-GEN-07) → códigos de
 * recuperación (S-GEN-08). «Cancelar» solo en las dos primeras etapas.
 */
export function SetupMfaDialog({ onClose, onEnabled }: { onClose: () => void; onEnabled: () => void }) {
  const [stage, setStage] = useState<'enroll' | 'codes'>('enroll');
  // Vacía: MfaEnroll pide la contraseña actual dentro del diálogo.
  const password = useRef('');
  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open && stage === 'enroll') onClose(); }}
      dismissible={false}
      wide
      fullScreenOnPhone={stage === 'enroll'}
      icon={stage === 'enroll' ? <Smartphone className="size-7" /> : <KeyRound className="size-7" />}
      title={stage === 'enroll' ? 'Configurar la verificación en dos pasos' : 'Guarde sus códigos de recuperación'}
      footer={
        stage === 'enroll' ? (
          <Button variant="text" onClick={onClose}>
            Cancelar
          </Button>
        ) : undefined
      }
    >
      {stage === 'enroll' ? (
        <MfaEnroll embedded password={password} onEnrolled={() => { setStage('codes'); }} />
      ) : (
        <RecoveryCodes embedded onContinue={() => { onEnabled(); return Promise.resolve(); }} />
      )}
    </Dialog>
  );
}

function codeMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'invalid_code') return 'Ese código no es válido. Revise la aplicación e inténtelo de nuevo.';
    if (error.code === 'mfa_locked')
      return 'La verificación en dos pasos está bloqueada tras demasiados códigos erróneos seguidos. Se rechaza cualquier código durante un tiempo.';
    if (error.code === 'mfa_required_for_role') return 'Su rol exige la verificación en dos pasos, así que no se puede desactivar.';
    if (error.code === 'mfa_not_enrolled') return 'La verificación en dos pasos ya no está activada. Cierre este diálogo para ver su estado.';
  }
  if (failureKind(error) !== 'other') return failureMessage(error, 'comprobar el código');
  return 'No se pudo comprobar el código. Inténtelo de nuevo.';
}

const COPY = {
  regenerate: {
    title: '¿Generar nuevos códigos de recuperación?',
    description:
      'Sus códigos de recuperación actuales dejarán de funcionar. Ingrese un código de su aplicación de autenticación para continuar.',
    confirm: 'Nuevos códigos de recuperación',
  },
  disable: {
    title: '¿Desactivar la verificación en dos pasos?',
    description:
      'Para iniciar sesión solo se pedirá su contraseña y sus códigos de recuperación dejarán de funcionar. Ingrese un código de su aplicación de autenticación para confirmar.',
    confirm: 'Desactivar',
  },
} as const;

/**
 * S-GEN-24: un código actual de la aplicación confirma la acción. Un código
 * erróneo deja el diálogo abierto y vacía el campo; si el factor queda
 * bloqueado, solo queda «Cancelar». Al cerrar, el Perfil vuelve a leer el estado.
 */
export function CodeDialog({
  variant,
  onClose,
  onRegenerated,
  onDisabled,
}: {
  variant: 'regenerate' | 'disable';
  onClose: () => void;
  onRegenerated: (codes: string[]) => void;
  onDisabled: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const errorId = useId();
  const copy = COPY[variant];

  const submit = async () => {
    if (code.length !== OTP_LENGTH) {
      setError('Ingrese los 6 dígitos del código.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (variant === 'regenerate') onRegenerated((await api.regenerateRecoveryCodes(code)).backupCodes);
      else {
        await api.disableOwnMfa(code);
        onDisabled();
      }
    } catch (e) {
      setError(codeMessage(e));
      setBlocked(e instanceof ApiError && (e.code === 'mfa_locked' || e.code === 'mfa_required_for_role' || e.code === 'mfa_not_enrolled'));
      setCode('');
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      dismissible={false}
      tone={variant === 'disable' ? 'danger' : 'primary'}
      icon={variant === 'disable' ? <ShieldOff className="size-7" /> : <KeyRound className="size-7" />}
      title={copy.title}
      description={copy.description}
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            Cancelar
          </Button>
          {blocked ? null : (
            <Button variant={variant === 'disable' ? 'destructive' : 'primary'} loading={busy} onClick={() => void submit()}>
              {copy.confirm}
            </Button>
          )}
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-space-md"
      >
        <OtpInput value={code} onChange={setCode} disabled={busy || blocked} invalid={error !== null} describedBy={error ? errorId : undefined} />
        <div id={errorId} aria-live="polite">
          {error ? <Banner tone="error" title={error} /> : null}
        </div>
        {/* Enter envía el formulario (manual: no se envía solo al sexto dígito). */}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}

/** S-GEN-25: los códigos recién generados, una sola vez. */
export function RecoveryCodesDialog({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={() => undefined} dismissible={false} icon={<KeyRound className="size-7" />} title="Guarde sus códigos de recuperación">
      <RecoveryCodes embedded codes={codes} onContinue={() => { onClose(); return Promise.resolve(); }} />
    </Dialog>
  );
}
