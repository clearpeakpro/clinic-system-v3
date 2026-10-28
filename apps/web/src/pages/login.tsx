import { useNavigate } from '@tanstack/react-router';
import { Copy, Eye, EyeOff, Lock, Mail, ShieldCheck, Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { BrandMark } from '../components/brand.tsx';
import { Button } from '../components/ui/button.tsx';
import { AuthCard, Banner, Field } from '../components/ui/field.tsx';
import { Checkbox } from '../components/ui/overlay.tsx';
import { api, ApiError } from '../lib/api.ts';
import { copyText } from '../lib/clipboard.ts';
import { keys, queryClient } from '../lib/session.ts';

// S-GEN-03 Iniciar sesión → S-GEN-06 código de MFA, o S-GEN-07 inscripción
// obligatoria → S-GEN-08 códigos de recuperación. La URL no cambia (manual).
// Secretos (contraseña, clave TOTP, códigos) solo en memoria del componente.

export type LoginReason = 'inactividad' | 'cerrada';
type Step = 'credentials' | 'code' | 'enroll' | 'recovery';

const REASON_TEXT: Record<LoginReason, { title: string; body: string }> = {
  inactividad: { title: 'Su sesión se cerró por inactividad.', body: 'Por seguridad, inicie sesión de nuevo.' },
  cerrada: { title: 'Su sesión terminó.', body: 'Inicie sesión de nuevo para continuar.' },
};

function signInError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return 'Demasiados intentos. Espere unos minutos e inténtelo de nuevo.';
    if (error.code === 'user_disabled' || error.status === 403) return 'Su cuenta ya no está activa. Contacte a un administrador.';
    if (error.status === 401) return 'Correo o contraseña incorrectos.';
  }
  return 'No se pudo iniciar sesión. Revise su conexión e inténtelo de nuevo.';
}

export function LoginPage({ reason, step: initialStep }: { reason?: LoginReason | undefined; step?: 'inscripcion' | undefined }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(initialStep === 'inscripcion' ? 'enroll' : 'credentials');
  // Solo en memoria: la inscripción del MFA vuelve a pedir la contraseña.
  const password = useRef('');

  const finish = async () => {
    await queryClient.invalidateQueries({ queryKey: keys.me });
    await navigate({ to: '/', replace: true });
  };

  const afterPassword = async () => {
    try {
      await api.me();
      await finish();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'mfa_enrollment_required') setStep('enroll');
      else throw error;
    }
  };

  const backToLogin = async () => {
    await api.signOut().catch(() => undefined);
    password.current = '';
    setStep('credentials');
  };

  return (
    <AuthCard>
      {step === 'credentials' ? (
        <Credentials
          reason={reason}
          onSuccess={async (pw, needsCode) => {
            password.current = pw;
            if (needsCode) setStep('code');
            else await afterPassword();
          }}
        />
      ) : null}
      {step === 'code' ? <MfaCode onSuccess={finish} onBack={backToLogin} /> : null}
      {step === 'enroll' ? (
        <MfaEnroll password={password} onEnrolled={() => { setStep('recovery'); }} onBack={backToLogin} />
      ) : null}
      {step === 'recovery' ? <RecoveryCodes onContinue={finish} /> : null}
    </AuthCard>
  );
}

function Header({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="mb-space-lg flex flex-col items-center gap-space-sm text-center">
      <div className="flex size-14 items-center justify-center rounded-lg bg-primary-container text-on-primary">{icon}</div>
      <h1 className="text-headline-lg text-on-surface">{title}</h1>
      <p className="text-body-md text-on-surface-variant">{subtitle}</p>
    </div>
  );
}

function Credentials({
  reason,
  onSuccess,
}: {
  reason: LoginReason | undefined;
  onSuccess: (password: string, needsCode: boolean) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = email.trim();
    const errors: typeof fieldErrors = {};
    if (!trimmed) errors.email = 'Este campo es obligatorio.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) errors.email = 'Ingrese un correo electrónico válido.';
    if (!password) errors.password = 'Este campo es obligatorio.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.signIn(trimmed, password);
      await onSuccess(password, result.twoFactorRedirect === true);
    } catch (e) {
      setError(signInError(e));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-space-md">
      <Header icon={<BrandMark className="size-7" />} title="Iniciar sesión" subtitle="Inicie sesión para continuar." />
      {reason ? (
        <Banner title={REASON_TEXT[reason].title}>{REASON_TEXT[reason].body}</Banner>
      ) : null}
      <Field
        label="Correo electrónico"
        type="email"
        autoComplete="username"
        autoFocus
        icon={<Mail className="size-5" />}
        value={email}
        disabled={busy}
        error={fieldErrors.email ?? null}
        onChange={(e) => { setEmail(e.target.value); }}
      />
      <Field
        label="Contraseña"
        type={show ? 'text' : 'password'}
        autoComplete="current-password"
        icon={<Lock className="size-5" />}
        value={password}
        disabled={busy}
        error={fieldErrors.password ?? null}
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
      <div aria-live="polite">{error ? <Banner tone="error" title={error} /> : null}</div>
      <Button type="submit" size="block" loading={busy}>
        Iniciar sesión
      </Button>
      <p className="rounded-lg bg-surface-container-low p-space-md text-center text-body-md text-on-surface-variant">
        ¿Olvidó su contraseña? Pida a un administrador un enlace de restablecimiento.
      </p>
    </form>
  );
}

function codeError(error: unknown, recovery: boolean): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return 'Demasiados intentos. Espere unos segundos e inténtelo de nuevo.';
    if (error.code === 'ACCOUNT_TEMPORARILY_LOCKED')
      return 'La verificación en dos pasos está bloqueada tras demasiados códigos erróneos seguidos. Pida a un administrador que la restablezca.';
    if (error.status === 401 && recovery) return 'Ese código de recuperación no es válido o ya se usó.';
    if (error.status === 401) return 'Ese código no es válido. Revise la aplicación e inténtelo de nuevo.';
  }
  return 'Este intento de inicio de sesión venció. Inicie sesión de nuevo.';
}

function CodeInput({ value, onChange, onComplete, disabled }: { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; disabled: boolean }) {
  return (
    <Field
      label="Código de verificación"
      hint="6 dígitos; cambia cada 30 segundos."
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus
      maxLength={6}
      className="font-mono text-code-md tracking-[0.3em]"
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
        onChange(digits);
        if (digits.length === 6) onComplete?.(digits);
      }}
    />
  );
}

/** S-GEN-06: código de la aplicación o código de recuperación. Envío automático al sexto dígito. */
function MfaCode({ onSuccess, onBack }: { onSuccess: () => Promise<void>; onBack: () => Promise<void> }) {
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const verify = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      if (recovery) await api.verifyBackupCode(value.trim());
      else await api.verifyTotp(value);
      await onSuccess();
    } catch (e) {
      setError(codeError(e, recovery));
      setCode('');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); void verify(code); }} className="flex flex-col gap-space-md">
      <Header
        icon={<ShieldCheck className="size-7" />}
        title="Verificación en dos pasos"
        subtitle={recovery ? 'Ingrese uno de los códigos de recuperación que guardó.' : 'Ingrese el código de 6 dígitos de su aplicación de autenticación.'}
      />
      {recovery ? (
        <Field
          label="Código de recuperación"
          hint="Cada código sirve una sola vez."
          autoFocus
          autoComplete="off"
          className="font-mono text-code-md"
          value={code}
          disabled={busy}
          onChange={(e) => { setCode(e.target.value); }}
        />
      ) : (
        <CodeInput value={code} onChange={setCode} onComplete={(v) => void verify(v)} disabled={busy} />
      )}
      <div aria-live="polite">{error ? <Banner tone="error" title={error} /> : null}</div>
      <Button type="submit" size="block" loading={busy}>
        Verificar
      </Button>
      <Button type="button" variant="text" onClick={() => { setRecovery(!recovery); setCode(''); setError(null); }}>
        {recovery ? 'Usar un código de la aplicación de autenticación' : 'Usar un código de recuperación'}
      </Button>
      <Button type="button" variant="text" onClick={() => void onBack()}>
        Volver a iniciar sesión
      </Button>
    </form>
  );
}

// Los códigos de recuperación pasan de la inscripción a S-GEN-08 en memoria.
let pendingRecoveryCodes: string[] = [];

/** S-GEN-07: inscripción obligatoria (QR, clave en grupos de 4, confirmar con un código). */
function MfaEnroll({ password, onEnrolled, onBack }: { password: { current: string }; onEnrolled: () => void; onBack: () => Promise<void> }) {
  // Con la contraseña en memoria (recién iniciada la sesión) la inscripción
  // arranca sola; si se recargó la página, se vuelve a pedir.
  const [initialPassword] = useState(password.current);
  const [needsPassword, setNeedsPassword] = useState(initialPassword === '');
  const [passwordInput, setPasswordInput] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(initialPassword !== '');
  const [copied, setCopied] = useState(false);

  const start = async (pw: string) => {
    setBusy(true);
    setError(null);
    await enable(pw);
  };

  // Sin cambios de estado síncronos: se puede llamar desde el efecto inicial.
  const enable = async (pw: string) => {
    try {
      const { totpURI, backupCodes } = await api.enableTotp(pw);
      pendingRecoveryCodes = backupCodes;
      setSecret(new URL(totpURI).searchParams.get('secret'));
      setQr(await QRCode.toDataURL(totpURI, { width: 196, margin: 1 }));
      setNeedsPassword(false);
    } catch (e) {
      setError(e instanceof ApiError && e.status < 500 ? 'La contraseña no es correcta.' : 'No se pudo preparar la verificación. Inténtelo de nuevo.');
      setNeedsPassword(true);
    } finally {
      setBusy(false);
      password.current = '';
    }
  };

  useEffect(() => {
    if (initialPassword) void enable(initialPassword);
    // Solo al montar: la contraseña inicial no cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.verifyTotp(value);
      onEnrolled();
    } catch (e) {
      setError(codeError(e, false));
      setCode('');
      setBusy(false);
    }
  };

  const groups = secret?.match(/.{1,4}/g)?.join(' ') ?? '';

  return (
    <div className="flex flex-col gap-space-md">
      <Header
        icon={<Smartphone className="size-7" />}
        title="Configurar la verificación en dos pasos"
        subtitle="Esta cuenta necesita un código de una aplicación de autenticación cada vez que inicia sesión. Configurarla toma un minuto."
      />
      {needsPassword ? (
        <form onSubmit={(e) => { e.preventDefault(); void start(passwordInput); }} className="flex flex-col gap-space-md">
          <Field
            label="Confirme su contraseña"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={passwordInput}
            disabled={busy}
            onChange={(e) => { setPasswordInput(e.target.value); }}
          />
          <div aria-live="polite">{error ? <Banner tone="error" title={error} /> : null}</div>
          <Button type="submit" size="block" loading={busy}>
            Continuar
          </Button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void confirm(code); }} className="flex flex-col gap-space-md">
          <ol className="flex flex-col gap-space-md text-body-md text-on-surface">
            <li>1. Instale en su teléfono una aplicación de autenticación, como Google Authenticator o Microsoft Authenticator.</li>
            <li className="flex flex-col items-center gap-space-sm">
              <span className="self-start">2. En la aplicación, agregue una cuenta y escanee este código QR.</span>
              {qr ? <img src={qr} alt="Código QR para la aplicación de autenticación" width={196} height={196} /> : null}
              <span className="self-start text-on-surface-variant">¿No puede escanearlo? Ingrese esta clave en la aplicación:</span>
              <span className="flex items-center gap-space-sm">
                <code data-testid="totp-secret" className="select-all rounded-md bg-surface-container px-space-sm py-space-xs font-mono text-code-md">
                  {groups}
                </code>
                <Button
                  type="button"
                  variant="text"
                  aria-label="Copiar clave"
                  onClick={() => { void copyText(secret ?? '').then(setCopied); }}
                >
                  <Copy aria-hidden className="size-5" />
                </Button>
              </span>
              {copied ? (
                <span role="status" className="text-caption text-on-surface-variant">
                  Clave copiada. Péguela ahora en su aplicación de autenticación.
                </span>
              ) : null}
            </li>
            <li>3. Ingrese el código de 6 dígitos que muestra la aplicación para confirmar.</li>
          </ol>
          <CodeInput value={code} onChange={setCode} disabled={busy || !secret} />
          <div aria-live="polite">{error ? <Banner tone="error" title={error} /> : null}</div>
          <Button type="submit" size="block" loading={busy} disabled={code.length !== 6}>
            Confirmar
          </Button>
        </form>
      )}
      <Button type="button" variant="text" onClick={() => void onBack()}>
        Volver a iniciar sesión
      </Button>
    </div>
  );
}

/** S-GEN-08: los códigos solo se muestran ahora; «Continuar» exige marcar «Guardé estos códigos». */
function RecoveryCodes({ onContinue }: { onContinue: () => Promise<void> }) {
  const [codes] = useState(() => pendingRecoveryCodes);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const done = async () => {
    setBusy(true);
    pendingRecoveryCodes = [];
    // Se intenta borrar el portapapeles si se copiaron (el navegador puede no permitirlo).
    if (copied) await copyText('');
    await onContinue();
  };

  return (
    <div className="flex flex-col gap-space-md">
      <Header
        icon={<ShieldCheck className="size-7" />}
        title="Guarde sus códigos de recuperación"
        subtitle="Si pierde su teléfono, cada código le permite iniciar sesión una vez. Guárdelos en un lugar seguro y privado: solo se muestran ahora."
      />
      <ul data-testid="recovery-codes" className="grid grid-cols-2 gap-space-sm rounded-lg bg-surface-container p-space-md font-mono text-code-md select-all">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <Button
        type="button"
        variant="text"
        onClick={() => { void copyText(codes.join('\n')).then(setCopied); }}
      >
        <Copy aria-hidden className="size-5" /> Copiar códigos
      </Button>
      {copied ? (
        <p role="status" className="text-caption text-on-surface-variant">
          Códigos de recuperación copiados. Péguelos ahora en su gestor de contraseñas. El portapapeles se borra al continuar, si el navegador lo permite.
        </p>
      ) : null}
      <Checkbox label="Guardé estos códigos" checked={saved} onCheckedChange={setSaved} />
      <Button type="button" size="block" disabled={!saved} loading={busy} onClick={() => void done()}>
        Continuar
      </Button>
    </div>
  );
}
