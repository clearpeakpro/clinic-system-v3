import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, ROLES, type Role } from '@clinic/shared';
import { AsyncView, Banner, Button, Field, formatTime, SegmentedControl, StatusChip, useSnackbar } from '@clinic/ui';
import { useQuery } from '@tanstack/react-query';
import {
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogOut,
  type LucideIcon,
  MapPin,
  Moon,
  Palette,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Sun,
  UserRound,
} from 'lucide-react';
import { useState, type ReactNode, type SubmitEvent } from 'react';
import { LogoutDialog } from '../components/logout-dialog.tsx';
import { CodeDialog, RecoveryCodesDialog, SetupMfaDialog } from '../components/profile/mfa-dialogs.tsx';
import { api, ApiError, type Me, type OwnMfaStatus } from '../lib/api.ts';
import { failureMessage } from '../lib/errors.ts';
import { initials, ROLE_LABELS } from '../lib/format.ts';
import { keys, queryClient, useActiveLocation, useLocations, useMe } from '../lib/session.ts';
import { applyTheme, prefs, type ThemePreference } from '../lib/storage.ts';

// S-GEN-21 Perfil (/app/<SEDE>/perfil, desde el menú de cuenta). Sin captura
// de Stitch: el marco de S-GEN-12 con tarjetas blancas como las de S-GEN-11.
// Tarjetas: Cuenta (solo lectura), Verificación en dos pasos (S-GEN-22 a 25),
// Contraseña (la pide T-006; cierra las demás sesiones), Preferencias (solo
// el tema: la interfaz está solo en español y el tema se guarda en el
// dispositivo) y Sesiones (S-GEN-17).

const OWN_MFA_KEY = ['own-mfa'] as const;

export function ProfilePage() {
  const me = useMe();
  if (!me.data) return null;
  return (
    <section aria-labelledby="page-title" className="mx-auto flex w-full max-w-6xl flex-col gap-space-lg">
      <h1 id="page-title" className="text-display-md text-on-surface">
        Perfil
      </h1>
      {/* Una columna en el orden del manual; en escritorio, dos columnas. */}
      <div className="flex flex-col gap-space-md desk:grid desk:grid-cols-2 desk:items-start desk:gap-space-lg">
        <div className="contents desk:flex desk:flex-col desk:gap-space-lg">
          <div className="order-1">
            <AccountCard me={me.data} />
          </div>
          <div className="order-2">
            <PreferencesCard />
          </div>
          <div className="order-5">
            <SessionsCard />
          </div>
        </div>
        <div className="contents desk:flex desk:flex-col desk:gap-space-lg">
          <div className="order-3">
            <MfaCard />
          </div>
          <div className="order-4">
            <PasswordCard />
          </div>
        </div>
      </div>
    </section>
  );
}

function Card({ title, icon: Icon, busy, children }: { title: string; icon: LucideIcon; busy?: boolean; children: ReactNode }) {
  const id = `card-${title.replaceAll(' ', '-').toLowerCase()}`;
  return (
    <section
      aria-labelledby={id}
      aria-busy={busy || undefined}
      className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-lg shadow-level-1 dark:bg-surface-container-low"
    >
      <h2 id={id} className="flex items-center gap-space-sm text-headline-sm text-on-surface">
        <span aria-hidden className="flex size-10 items-center justify-center rounded-md bg-surface-container text-primary dark:bg-surface-container-high">
          <Icon className="size-5" />
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Pill({ children, icon: Icon }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <li className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-surface-container px-space-sm text-body-md text-on-surface dark:bg-surface-container-high">
      {Icon ? <Icon aria-hidden className="size-4 shrink-0 text-primary" /> : null}
      {children}
    </li>
  );
}

/** Tarjeta «Cuenta»: iniciales, nombre, correo, roles y sedes (solo lectura). */
function AccountCard({ me }: { me: Me }) {
  const active = useActiveLocation();
  const locations = useLocations();
  const roles: Role[] = ROLES.filter((role) => me.assignments.some((a) => a.role === role));
  // Sedes de la organización activa en las que puede trabajar.
  const sites = (locations.data ?? []).find((o) => o.organizationId === active?.organizationId)?.locations ?? [];
  return (
    <Card title="Cuenta" icon={UserRound}>
      <div className="flex min-w-0 items-center gap-space-md">
        <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-headline-sm text-on-primary">
          {initials(me.name)}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-headline-sm text-on-surface">{me.name}</span>
          <span className="font-mono text-code-sm break-all text-on-surface-variant">{me.email}</span>
        </div>
      </div>
      <dl className="flex flex-col gap-space-md">
        <div className="flex flex-col gap-space-xs">
          <dt className="text-body-md-medium text-on-surface">Roles</dt>
          <dd>
            <ul className="flex flex-wrap gap-space-xs">
              {roles.map((role) => (
                <Pill key={role}>{ROLE_LABELS[role]}</Pill>
              ))}
            </ul>
          </dd>
        </div>
        <div className="flex flex-col gap-space-xs">
          <dt className="text-body-md-medium text-on-surface">Sedes</dt>
          <dd>
            {sites.length === 0 ? (
              <span className="text-body-md text-on-surface-variant">Sin sedes asignadas.</span>
            ) : (
              <ul className="flex flex-wrap gap-space-xs">
                {sites.map((site) => (
                  <Pill key={site.id} icon={MapPin}>
                    <span className="font-mono text-code-sm text-primary">{site.code}</span> · {site.name}
                  </Pill>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

/** Tarjeta «Preferencias»: solo el tema, guardado en este dispositivo. */
function PreferencesCard() {
  const snackbar = useSnackbar();
  const [theme, setTheme] = useState<ThemePreference>(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
  return (
    <Card title="Preferencias" icon={Palette}>
      <div className="flex flex-col gap-space-xs">
        <span aria-hidden className="text-body-md-medium text-on-surface">
          Tema
        </span>
        <SegmentedControl
          label="Tema"
          className="self-start"
          options={[
            { value: 'light', label: 'Claro', icon: <Sun aria-hidden className="size-4" /> },
            { value: 'dark', label: 'Oscuro', icon: <Moon aria-hidden className="size-4" /> },
          ]}
          value={theme}
          onChange={(value) => {
            prefs.setTheme(value);
            setTheme(applyTheme(value));
            snackbar({ message: 'Preferencias guardadas.' });
          }}
        />
      </div>
    </Card>
  );
}

/** Tarjeta «Sesiones» (S-GEN-17). */
function SessionsCard() {
  const [open, setOpen] = useState(false);
  return (
    <Card title="Sesiones" icon={LogOut}>
      <p className="text-body-md text-on-surface-variant">Cerrará su sesión en todos los dispositivos, incluido este.</p>
      <Button variant="outline" className="self-start" onClick={() => { setOpen(true); }}>
        <LogOut aria-hidden className="size-5" /> Cerrar sesión en todos los dispositivos
      </Button>
      <LogoutDialog open={open} onOpenChange={setOpen} variant="everywhere" />
    </Card>
  );
}

type MfaDialog = null | 'setup' | 'regenerate' | 'disable' | { codes: string[] };

/** S-GEN-22 Verificación en dos pasos (sección del Perfil). */
function MfaCard() {
  const status = useQuery<OwnMfaStatus, ApiError>({ queryKey: OWN_MFA_KEY, queryFn: api.ownMfa, staleTime: 0 });
  const timeZone = useActiveLocation()?.timezone ?? 'America/Chicago';
  const snackbar = useSnackbar();
  const [dialog, setDialog] = useState<MfaDialog>(null);
  const reload = async () => {
    await Promise.all([status.refetch(), queryClient.invalidateQueries({ queryKey: keys.me })]);
  };
  const close = () => {
    setDialog(null);
    // Un código erróneo puede haber bloqueado el factor.
    void reload();
  };

  return (
    <Card title="Verificación en dos pasos" icon={ShieldCheck} busy={status.isFetching}>
      <p className="text-body-md text-on-surface-variant">
        Cada inicio de sesión pide su contraseña y un código de una aplicación de autenticación en su teléfono.
      </p>
      <AsyncView source={status}>
        {(mfa) => (
          <div className="flex flex-col gap-space-md">
            <ul aria-label="Estado" className="flex flex-wrap gap-space-xs">
              <li>
                {mfa.enrolled ? (
                  <StatusChip tone="completed" icon={ShieldCheck} label="Activada" />
                ) : (
                  <StatusChip tone="danger" icon={ShieldQuestion} label="Desactivada" />
                )}
              </li>
              {mfa.required ? (
                <li>
                  <StatusChip tone="in-care" icon={ShieldAlert} label="Obligatoria para su rol" />
                </li>
              ) : null}
              {mfa.lockedUntil ? (
                <li>
                  <StatusChip tone="danger" icon={Lock} label="Bloqueada" />
                </li>
              ) : null}
            </ul>
            <MfaHelp mfa={mfa} timeZone={timeZone} />
            {mfa.lockedUntil ? null : (
              <div className="flex flex-wrap gap-space-sm">
                {mfa.enrolled ? (
                  <>
                    <Button variant="tonal" onClick={() => { setDialog('regenerate'); }}>
                      <KeyRound aria-hidden className="size-5" /> Nuevos códigos de recuperación
                    </Button>
                    {mfa.required ? null : (
                      <Button variant="text" className="text-error" onClick={() => { setDialog('disable'); }}>
                        Desactivar
                      </Button>
                    )}
                  </>
                ) : (
                  <Button onClick={() => { setDialog('setup'); }}>
                    <ShieldCheck aria-hidden className="size-5" /> Configurar
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </AsyncView>
      {dialog === 'setup' ? (
        <SetupMfaDialog
          onClose={close}
          onEnabled={() => {
            close();
            snackbar({ message: 'La verificación en dos pasos está activada.' });
          }}
        />
      ) : null}
      {dialog === 'regenerate' || dialog === 'disable' ? (
        <CodeDialog
          variant={dialog}
          onClose={close}
          onRegenerated={(codes) => { setDialog({ codes }); }}
          onDisabled={() => {
            close();
            snackbar({ message: 'La verificación en dos pasos está desactivada.' });
          }}
        />
      ) : null}
      {dialog !== null && typeof dialog === 'object' ? <RecoveryCodesDialog codes={dialog.codes} onClose={close} /> : null}
    </Card>
  );
}

function MfaHelp({ mfa, timeZone }: { mfa: OwnMfaStatus; timeZone: string }) {
  let text: string | null = null;
  if (mfa.lockedUntil) {
    // Better Auth bloquea por un tiempo (no hasta que un administrador lo levante, como dice el manual).
    text = `Demasiados códigos erróneos seguidos: se rechaza cualquier código hasta las ${formatTime(mfa.lockedUntil, timeZone)}. Si no puede esperar, pida a un administrador que le restablezca la verificación en dos pasos; el restablecimiento también reemplaza su contraseña.`;
  } else if (mfa.enrolled) {
    const left = mfa.backupCodesLeft ?? 0;
    text =
      left === 0
        ? 'No le quedan códigos de recuperación: genere nuevos.'
        : left === 1
          ? 'Le queda 1 código de recuperación.'
          : `Le quedan ${String(left)} códigos de recuperación.`;
  } else if (mfa.required) {
    text = 'Su rol la exige: la configurará en su próximo inicio de sesión, o ahora.';
  }
  return text ? <p className="text-body-md text-on-surface">{text}</p> : null;
}

function passwordError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'invalid_password') return 'La contraseña actual no es correcta.';
    if (error.code === 'password_too_common') return 'Esa contraseña es demasiado común. Elija otra.';
    if (error.code === 'PASSWORD_TOO_SHORT') return `La contraseña debe tener al menos ${String(PASSWORD_MIN_LENGTH)} caracteres.`;
    if (error.code === 'PASSWORD_TOO_LONG') return `La contraseña puede tener como máximo ${String(PASSWORD_MAX_LENGTH)} caracteres.`;
  }
  return failureMessage(error, 'cambiar la contraseña');
}

/** Tarjeta «Contraseña» (T-006): con la actual; cierra la sesión en los demás dispositivos. */
function PasswordCard() {
  const snackbar = useSnackbar();
  const email = useMe().data?.email ?? '';
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ current?: string; password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (!current) next.current = 'Escriba su contraseña.';
    if (!password) next.password = 'Este campo es obligatorio.';
    else if (password.length < PASSWORD_MIN_LENGTH) next.password = `Al menos ${String(PASSWORD_MIN_LENGTH)} caracteres.`;
    else if (password.length > PASSWORD_MAX_LENGTH) next.password = `Máximo ${String(PASSWORD_MAX_LENGTH)} caracteres.`;
    if (confirm !== password) next.confirm = 'Las contraseñas no coinciden.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      const { otherSessionsClosed } = await api.changePassword(current, password);
      setCurrent('');
      setPassword('');
      setConfirm('');
      snackbar({
        message:
          otherSessionsClosed > 0 ? 'Contraseña cambiada. Se cerró su sesión en los demás dispositivos.' : 'Contraseña cambiada.',
      });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'invalid_password') setCurrent('');
      setError(passwordError(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (
    <button
      type="button"
      className="flex size-10 items-center justify-center text-on-surface-variant"
      aria-label={show ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
      title={show ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
      onClick={() => { setShow(!show); }}
    >
      {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
    </button>
  );

  return (
    <Card title="Contraseña" icon={KeyRound}>
      <p className="text-body-md text-on-surface-variant">Al cambiarla se cerrará su sesión en los demás dispositivos; en este seguirá abierta.</p>
      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-space-md">
        {/* Para los gestores de contraseñas. */}
        <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
        <Field
          label="Contraseña actual"
          type={show ? 'text' : 'password'}
          autoComplete="current-password"
          icon={<Lock className="size-5" />}
          value={current}
          disabled={busy}
          error={errors.current ?? null}
          onChange={(e) => { setCurrent(e.target.value); }}
          trailing={toggle}
        />
        <Field
          label="Nueva contraseña"
          hint={`De ${String(PASSWORD_MIN_LENGTH)} a ${String(PASSWORD_MAX_LENGTH)} caracteres; puede ser una frase.`}
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          icon={<Lock className="size-5" />}
          value={password}
          disabled={busy}
          error={errors.password ?? null}
          onChange={(e) => { setPassword(e.target.value); }}
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
        <Button type="submit" className="self-start" loading={busy}>
          Cambiar contraseña
        </Button>
      </form>
    </Card>
  );
}
