import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@clinic/shared';
import { Banner, Button, Field, SegmentedControl } from '@clinic/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, Eye, EyeOff, Link2Off, Lock, Moon, Sun, UserPlus, UserRound } from 'lucide-react';
import { useRef, useState, type SubmitEvent } from 'react';
import { AuthCard, AuthHeader, AuthLayout } from '../components/auth-layout.tsx';
import { api, ApiError } from '../lib/api.ts';
import { keys, queryClient } from '../lib/session.ts';
import { applyTheme, prefs, type ThemePreference } from '../lib/storage.ts';
import { MfaEnroll, RecoveryCodes } from './login.tsx';

// S-GEN-09 Aceptar invitación (/invitacion/<token>). Sin sesión: nombre,
// contraseña y tema; la cuenta se crea, la sesión se abre y, si el rol exige
// MFA, se inscribe aquí mismo (S-GEN-07/08) con la contraseña recién escrita
// (solo en memoria). Con sesión (persona que ya trabaja en otra organización):
// solo «Aceptar invitación». Sin selector de idioma: la interfaz es en español.

type Step = 'form' | 'enroll' | 'recovery' | 'invalid';

const INVALID_CODES = new Set(['invitation_not_found', 'invitation_used', 'invitation_expired', 'invitation_revoked', 'invitation_invalid']);

function acceptError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'password_too_short':
        return `La contraseña debe tener al menos ${String(PASSWORD_MIN_LENGTH)} caracteres.`;
      case 'password_too_long':
        return `La contraseña puede tener como máximo ${String(PASSWORD_MAX_LENGTH)} caracteres.`;
      case 'password_too_common':
        return 'Esa contraseña es demasiado común. Elija otra.';
      case 'account_exists':
        return 'Ya tiene una cuenta con este correo. Inicie sesión y vuelva a abrir este enlace.';
      case 'invitation_email_mismatch':
        return 'Esta invitación es para otro correo. Cierre la sesión y vuelva a abrir el enlace.';
    }
    if (error.status === 429) {
      return error.retryAfterSeconds
        ? `Demasiados intentos. Intente de nuevo en ${String(error.retryAfterSeconds)} segundos.`
        : 'Demasiados intentos. Intente de nuevo en unos segundos.';
    }
  }
  return 'No se pudo aceptar la invitación. Revise su conexión e inténtelo de nuevo.';
}

export function AcceptInvitationPage({ token }: { token: string }) {
  const navigate = useNavigate();
  const session = useQuery({ queryKey: ['invitation-session'], queryFn: api.session, staleTime: 0, gcTime: 0, retry: false });
  const [step, setStep] = useState<Step>(token.length < 20 ? 'invalid' : 'form');
  // Solo en memoria, para la inscripción del MFA justo después.
  const password = useRef('');

  const finish = async () => {
    await queryClient.invalidateQueries({ queryKey: keys.me });
    await navigate({ to: '/', replace: true });
  };

  const accepted = async (signedIn: boolean) => {
    if (!signedIn) {
      await navigate({ to: '/login', replace: true });
      return;
    }
    try {
      await api.me();
      await finish();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'mfa_enrollment_required') setStep('enroll');
      else await finish();
    }
  };

  const onError = (error: unknown) => {
    if (error instanceof ApiError && INVALID_CODES.has(error.code)) {
      setStep('invalid');
      return null;
    }
    return acceptError(error);
  };

  return (
    <AuthLayout>
      <AuthCard size={step === 'form' || step === 'invalid' ? 'md' : 'lg'}>
        {step === 'invalid' ? (
          <div className="flex flex-col gap-space-md">
            <AuthHeader
              icon={<Link2Off aria-hidden className="size-9" />}
              title="Invitación no válida"
              subtitle="Este enlace de invitación no es válido, venció o ya se usó. Pida a un administrador uno nuevo."
            />
            <Button size="block" onClick={() => void navigate({ to: '/login' })}>
              Ir a iniciar sesión
            </Button>
          </div>
        ) : null}
        {step === 'form' && session.isPending ? <p className="sr-only" role="status">Cargando…</p> : null}
        {step === 'form' && !session.isPending ? (
          session.data ? (
            <SignedInAccept token={token} onAccepted={() => accepted(true)} onError={onError} />
          ) : (
            <NewAccount
              token={token}
              onAccepted={async (pw, signedIn) => {
                password.current = pw;
                await accepted(signedIn);
              }}
              onError={onError}
            />
          )
        ) : null}
        {step === 'enroll' ? (
          <MfaEnroll
            password={password}
            onEnrolled={() => { setStep('recovery'); }}
            onBack={async () => {
              await api.signOut().catch(() => undefined);
              password.current = '';
              await navigate({ to: '/login', replace: true });
            }}
          />
        ) : null}
        {step === 'recovery' ? <RecoveryCodes onContinue={finish} /> : null}
      </AuthCard>
    </AuthLayout>
  );
}

function NewAccount({
  token,
  onAccepted,
  onError,
}: {
  token: string;
  onAccepted: (password: string, signedIn: boolean) => Promise<void>;
  onError: (error: unknown) => string | null;
}) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
  const [errors, setErrors] = useState<{ name?: string; password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Este campo es obligatorio.';
    else if (name.trim().length > 120) next.name = 'Máximo 120 caracteres.';
    if (!password) next.password = 'Este campo es obligatorio.';
    else if (password.length < PASSWORD_MIN_LENGTH) next.password = `Al menos ${String(PASSWORD_MIN_LENGTH)} caracteres.`;
    else if (password.length > PASSWORD_MAX_LENGTH) next.password = `Máximo ${String(PASSWORD_MAX_LENGTH)} caracteres.`;
    if (confirm !== password) next.confirm = 'Las contraseñas no coinciden.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.acceptInvitation({ token, name: name.trim(), password });
      await onAccepted(password, result.signedIn);
    } catch (e) {
      setError(onError(e));
      setBusy(false);
    }
  };

  const toggle = (
    <button
      type="button"
      className="flex size-10 items-center justify-center text-on-surface-variant"
      aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      title={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      onClick={() => { setShow(!show); }}
    >
      {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
    </button>
  );

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-space-md">
      <AuthHeader
        icon={<UserPlus aria-hidden className="size-9" />}
        title="Aceptar invitación"
        subtitle="Elija su nombre y su contraseña para unirse al equipo."
      />
      <Field
        label="Nombre para mostrar"
        autoComplete="name"
        autoFocus
        maxLength={120}
        icon={<UserRound className="size-5" />}
        value={name}
        disabled={busy}
        error={errors.name ?? null}
        onChange={(e) => { setName(e.target.value); }}
      />
      <Field
        label="Contraseña"
        hint={`De ${String(PASSWORD_MIN_LENGTH)} a ${String(PASSWORD_MAX_LENGTH)} caracteres; puede ser una frase.`}
        type={show ? 'text' : 'password'}
        autoComplete="new-password"
        icon={<Lock className="size-5" />}
        value={password}
        disabled={busy}
        error={errors.password ?? null}
        onChange={(e) => { setPassword(e.target.value); }}
        trailing={toggle}
      />
      <Field
        label="Confirmar contraseña"
        type={show ? 'text' : 'password'}
        autoComplete="new-password"
        icon={<Lock className="size-5" />}
        value={confirm}
        disabled={busy}
        error={errors.confirm ?? null}
        onChange={(e) => { setConfirm(e.target.value); }}
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-body-md-medium text-on-surface">Tema</span>
        <SegmentedControl
          label="Tema"
          className="self-start"
          options={[
            { value: 'light', label: 'Claro', icon: <Sun aria-hidden className="size-[18px]" /> },
            { value: 'dark', label: 'Oscuro', icon: <Moon aria-hidden className="size-[18px]" /> },
          ]}
          value={theme}
          onChange={(value) => {
            prefs.setTheme(value);
            setTheme(applyTheme(value));
          }}
        />
      </div>
      <div aria-live="polite">{error ? <Banner tone="error" title={error} /> : null}</div>
      <Button type="submit" size="block" loading={busy}>
        Aceptar invitación {busy ? null : <ArrowRight aria-hidden className="size-5" />}
      </Button>
    </form>
  );
}

function SignedInAccept({ token, onAccepted, onError }: { token: string; onAccepted: () => Promise<void>; onError: (error: unknown) => string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.acceptInvitation({ token });
      await onAccepted();
    } catch (e) {
      setError(onError(e));
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-space-md">
      <AuthHeader
        icon={<UserPlus aria-hidden className="size-9" />}
        title="Aceptar invitación"
        subtitle="Ya tiene una sesión iniciada: la invitación se agregará a su cuenta."
      />
      <div aria-live="polite">{error ? <Banner tone="error" title={error} /> : null}</div>
      <Button size="block" loading={busy} onClick={() => void accept()}>
        Aceptar invitación {busy ? null : <ArrowRight aria-hidden className="size-5" />}
      </Button>
    </div>
  );
}
