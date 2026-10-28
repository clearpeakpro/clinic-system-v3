import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@clinic/shared';
import { Banner, Button, Field } from '@clinic/ui';
import { useNavigate } from '@tanstack/react-router';
import { CircleCheck, Eye, EyeOff, KeyRound, Link2Off, Lock } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { AuthCard, AuthHeader, AuthLayout } from '../components/auth-layout.tsx';
import { api, ApiError } from '../lib/api.ts';

// S-GEN-10 Restablecer contraseña (/restablecer/<token>). El enlace lo emite un
// administrador (S-ADM-04). No inicia sesión: al terminar, «Ir a iniciar
// sesión». Better Auth cierra todas las sesiones de la cuenta.

type Step = 'form' | 'done' | 'invalid';

function resetError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'password_too_common') return 'Esa contraseña es demasiado común. Elija otra.';
    if (error.code === 'PASSWORD_TOO_SHORT') return `La contraseña debe tener al menos ${String(PASSWORD_MIN_LENGTH)} caracteres.`;
    if (error.code === 'PASSWORD_TOO_LONG') return `La contraseña puede tener como máximo ${String(PASSWORD_MAX_LENGTH)} caracteres.`;
    if (error.status === 429) return 'Demasiados intentos. Intente de nuevo en unos segundos.';
  }
  return 'No se pudo cambiar la contraseña. Revise su conexión e inténtelo de nuevo.';
}

export function ResetPasswordPage({ token }: { token: string }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(token.length < 20 ? 'invalid' : 'form');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (!password) next.password = 'Este campo es obligatorio.';
    else if (password.length < PASSWORD_MIN_LENGTH) next.password = `Al menos ${String(PASSWORD_MIN_LENGTH)} caracteres.`;
    else if (password.length > PASSWORD_MAX_LENGTH) next.password = `Máximo ${String(PASSWORD_MAX_LENGTH)} caracteres.`;
    if (confirm !== password) next.confirm = 'Las contraseñas no coinciden.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword(token, password);
      setPassword('');
      setConfirm('');
      setStep('done');
    } catch (e) {
      // Better Auth responde INVALID_TOKEN para un enlace inválido, vencido o usado.
      if (e instanceof ApiError && e.code === 'INVALID_TOKEN') setStep('invalid');
      else setError(resetError(e));
      setBusy(false);
    }
  };

  const goToLogin = (
    <Button size="block" onClick={() => void navigate({ to: '/login', replace: true })}>
      Ir a iniciar sesión
    </Button>
  );

  return (
    <AuthLayout>
      <AuthCard>
        {step === 'invalid' ? (
          <div className="flex flex-col gap-space-md">
            <AuthHeader
              icon={<Link2Off aria-hidden className="size-9" />}
              title="Enlace no válido"
              subtitle="Este enlace para restablecer la contraseña no es válido, venció o ya se usó. Pida a un administrador uno nuevo."
            />
            {goToLogin}
          </div>
        ) : null}
        {step === 'done' ? (
          <div className="flex flex-col gap-space-md">
            <AuthHeader
              icon={<CircleCheck aria-hidden className="size-9" />}
              title="Contraseña actualizada"
              subtitle="Ya puede iniciar sesión con su nueva contraseña."
            />
            {goToLogin}
          </div>
        ) : null}
        {step === 'form' ? (
          <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-space-md">
            <AuthHeader
              icon={<KeyRound aria-hidden className="size-9" />}
              title="Defina una nueva contraseña"
              subtitle="Elija una nueva contraseña para su cuenta."
            />
            <Field
              label="Nueva contraseña"
              hint={`De ${String(PASSWORD_MIN_LENGTH)} a ${String(PASSWORD_MAX_LENGTH)} caracteres; puede ser una frase.`}
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              autoFocus
              icon={<Lock className="size-5" />}
              value={password}
              disabled={busy}
              error={errors.password ?? null}
              onChange={(e) => { setPassword(e.target.value); }}
              trailing={
                <button
                  type="button"
                  className="flex size-10 items-center justify-center text-on-surface-variant"
                  aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  title={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => { setShow(!show); }}
                >
                  {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              }
            />
            <Field
              label="Confirmar nueva contraseña"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              icon={<Lock className="size-5" />}
              value={confirm}
              disabled={busy}
              error={errors.confirm ?? null}
              onChange={(e) => { setConfirm(e.target.value); }}
            />
            <div aria-live="polite">{error ? <Banner tone="error" title={error} /> : null}</div>
            <Button type="submit" size="block" loading={busy}>
              Cambiar contraseña
            </Button>
          </form>
        ) : null}
      </AuthCard>
    </AuthLayout>
  );
}
