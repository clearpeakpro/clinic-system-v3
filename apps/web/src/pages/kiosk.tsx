import { KIOSK_DONE_SECONDS, KIOSK_REASONS, KIOSK_SYMPTOMS_MAX, type KioskReason, type KioskSession } from '@clinic/shared';
import { cn, Dialog } from '@clinic/ui';
import { useNavigate } from '@tanstack/react-router';
import { Check, CircleAlert, ClipboardList, Frown, Globe, IdCard, Link2, Lock, Plus, Syringe, UserCheck, UserPlus, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api.ts';
import { daysInMonth, EMPTY_KIOSK_DRAFT, idleState, kioskErrors, kioskInput, typedPhone, type KioskDraft, type KioskField } from '../lib/kiosk.ts';
import { KIOSK_TEXTS, type KioskLanguage, type KioskTexts } from '../lib/kiosk-texts.ts';

// S-KIO-01 Registro y S-KIO-02 Listo (T-020; docs/manual/11_kiosco.md, ADR 0014
// y 0031; Stitch: design/stitch/kiosco). Una tableta vinculada a una sede.
//  - Fuera de la app del personal: sin sesión, menú ni tiempo real. La tableta
//    solo renueva su sesión (que devuelve el código y el nombre de su sede) y
//    envía registros; nunca lee datos.
//  - Todo vive en la memoria de esta página (estado de React): nada en
//    localStorage, sessionStorage, IndexedDB ni en la caché. Recargar lo borra.
//    Autocompletado desactivado. El idioma tampoco se guarda.
//  - Se borra al enviar, tras 60 s sin tocar nada (aviso los últimos 10 s) y
//    al ocultar la pestaña. «Listo» no muestra el nombre.
//  - Español e inglés con un botón grande; botones de 64 px o más; tema claro
//    de alto contraste.

type Screen = { kind: 'loading' } | { kind: 'unlinked' } | { kind: 'unavailable' } | { kind: 'form'; session: KioskSession } | { kind: 'done'; session: KioskSession };

const REASON_ICONS: Record<KioskReason, LucideIcon> = { sick: Frown, results: ClipboardList, injection: Syringe, other: Plus };

/** Día del dispositivo (aaaa-mm-dd). Solo para avisar antes de enviar: el servidor usa el de la sede. */
function deviceToday(): string {
  const d = new Date();
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function KioskPage({ sede }: { sede: string }) {
  const navigate = useNavigate();
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  const [language, setLanguage] = useState<KioskLanguage>('es');
  const t = KIOSK_TEXTS[language];

  // El kiosco siempre en tema claro (alto contraste), sin tocar la preferencia guardada.
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    root.classList.remove('dark');
    return () => {
      root.classList.toggle('dark', wasDark);
    };
  }, []);

  const fetchSession = useCallback(async (): Promise<Screen> => {
    try {
      const session = await api.kioskSession();
      // Vinculada a otra sede: a la suya.
      if (session.location.code.toUpperCase() !== sede.toUpperCase()) {
        void navigate({ to: '/kiosk/$sede', params: { sede: session.location.code }, replace: true });
      }
      return { kind: 'form', session };
    } catch (error) {
      return error instanceof ApiError && error.status === 401 ? { kind: 'unlinked' } : { kind: 'unavailable' };
    }
  }, [navigate, sede]);

  useEffect(() => {
    let alive = true;
    void fetchSession().then((next) => {
      if (alive) setScreen(next);
    });
    return () => {
      alive = false;
    };
  }, [fetchSession]);

  const retry = async () => {
    setScreen({ kind: 'loading' });
    setScreen(await fetchSession());
  };

  const toggleLanguage = () => {
    setLanguage((l) => (l === 'es' ? 'en' : 'es'));
  };

  return (
    <div className="min-h-dvh bg-surface text-on-surface">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-space-lg px-4 py-space-lg tab:px-space-lg">
        <header className="flex items-center justify-between gap-space-md">
          <div className="flex min-w-0 items-center gap-space-sm">
            <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary">
              <Plus className="size-7" strokeWidth={3} />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-headline-sm text-primary">Clinic System</span>
              {screen.kind === 'form' || screen.kind === 'done' ? <span className="truncate text-body-md text-on-surface-variant">{screen.session.location.name}</span> : null}
            </div>
          </div>
          {screen.kind === 'form' || screen.kind === 'done' ? (
            <button
              type="button"
              onClick={toggleLanguage}
              aria-label={t.languageButtonLabel}
              lang={language === 'es' ? 'en' : 'es'}
              className="inline-flex min-h-touch-kiosk shrink-0 items-center gap-space-sm rounded-full border-2 border-primary bg-surface-container-lowest px-space-lg text-title-md text-primary hover:bg-surface-container-low"
            >
              <Globe aria-hidden className="size-6" /> {t.languageButton}
            </button>
          ) : null}
        </header>

        <main className="flex flex-1 flex-col" lang={language}>
          {screen.kind === 'loading' ? <p className="m-auto text-title-md text-on-surface-variant">…</p> : null}
          {screen.kind === 'unavailable' ? (
            <Notice icon={CircleAlert} title={KIOSK_TEXTS.es.unavailable}>
              <BigButton onClick={() => void retry()}>{KIOSK_TEXTS.es.retry}</BigButton>
            </Notice>
          ) : null}
          {screen.kind === 'unlinked' ? <LinkForm sede={sede} onLinked={(session) => { setScreen({ kind: 'form', session }); }} /> : null}
          {screen.kind === 'form' ? (
            <CheckinForm
              t={t}
              onSent={() => {
                // «Listo» sigue en el idioma elegido (ADR 0031); vuelve a español con el formulario.
                setScreen({ kind: 'done', session: screen.session });
              }}
              onClear={() => { setLanguage('es'); }}
              onUnlinked={() => {
                setLanguage('es');
                setScreen({ kind: 'unlinked' });
              }}
            />
          ) : null}
          {screen.kind === 'done' ? (
            <Done
              t={t}
              onBack={() => {
                setLanguage('es');
                setScreen({ kind: 'form', session: screen.session });
              }}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}

/** S-KIO-01: el formulario. Su estado vive solo aquí; al desmontarse, desaparece. */
function CheckinForm({ t, onSent, onClear, onUnlinked }: { t: KioskTexts; onSent: () => void; onClear: () => void; onUnlinked: () => void }) {
  const [draft, setDraft] = useState<KioskDraft>(EMPTY_KIOSK_DRAFT);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  // El tipo de problema, no su texto: así cambia de idioma y el de «revise» se va al corregir.
  const [problem, setProblem] = useState<null | 'fix' | 'send' | 'rate'>(null);
  const [idle, setIdle] = useState<number | null>(null);
  // Se fija al montar el formulario (efecto de inactividad).
  const lastActivity = useRef(0);
  // Una clave por contenido: reintentar lo mismo no crea dos registros.
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const errors = kioskErrors(draft, deviceToday(), t);

  // Las funciones del padre cambian en cada render: se leen de una referencia
  // para que los temporizadores no se reinicien.
  const onClearRef = useRef(onClear);
  useEffect(() => {
    onClearRef.current = onClear;
  });
  const clear = useCallback(() => {
    setDraft(EMPTY_KIOSK_DRAFT);
    setShowErrors(false);
    setProblem(null);
    setIdle(null);
    attempt.current = null;
    lastActivity.current = Date.now();
    onClearRef.current();
  }, []);

  // Inactividad: aviso los últimos 10 s y borrado a los 60 s.
  useEffect(() => {
    const touch = () => {
      lastActivity.current = Date.now();
      setIdle(null);
    };
    lastActivity.current = Date.now();
    const events = ['pointerdown', 'keydown', 'input'] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true });
    const timer = setInterval(() => {
      const state = idleState(lastActivity.current, Date.now());
      if (state.kind === 'expired') clear();
      else setIdle(state.kind === 'warning' ? state.secondsLeft : null);
    }, 250);
    return () => {
      for (const e of events) window.removeEventListener(e, touch);
      clearInterval(timer);
    };
  }, [clear]);

  // Al ocultar la pestaña (otra app, pantalla apagada): se borra.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') clear();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => { document.removeEventListener('visibilitychange', onHide); };
  }, [clear]);

  const set = <K extends keyof KioskDraft>(field: K, value: KioskDraft[K]) => {
    setDraft((d) => ({ ...d, [field]: value }));
  };

  const submit = async () => {
    setShowErrors(true);
    setProblem(null);
    const input = kioskInput(draft);
    if (!input || Object.keys(errors).length > 0) {
      setProblem('fix');
      return;
    }
    const body = JSON.stringify(input);
    if (attempt.current?.body !== body) attempt.current = { body, key: crypto.randomUUID() };
    setBusy(true);
    try {
      await api.kioskSubmit(input, attempt.current.key);
      // El formulario se desmonta (su estado desaparece); el idioma se conserva para «Listo».
      setDraft(EMPTY_KIOSK_DRAFT);
      attempt.current = null;
      onSent();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clear();
        onUnlinked();
      } else setProblem(error instanceof ApiError && error.code === 'kiosk_rate_limited' ? 'rate' : 'send');
    } finally {
      setBusy(false);
    }
  };

  const err = (field: KioskField) => (showErrors ? (errors[field] ?? null) : null);
  const problemText =
    problem === 'fix' ? (Object.keys(errors).length > 0 ? t.fixErrors : null) : problem === 'rate' ? t.rateLimited : problem === 'send' ? t.sendFailed : null;
  const days = daysInMonth(draft.month, draft.year);

  return (
    <form
      aria-label={t.title}
      autoComplete="off"
      noValidate
      className="flex flex-col gap-space-lg pb-28"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-col gap-space-xs">
        <h1 className="text-display-md">{t.title}</h1>
        <p className="text-title-md text-on-surface-variant">{t.intro}</p>
      </div>

      <Card>
        <div className="grid gap-space-md tab:grid-cols-2">
          <TextField label={t.firstName} required={t.required} value={draft.firstName} error={err('firstName')} onChange={(v) => { set('firstName', v); }} autoCapitalize="words" />
          <TextField label={t.lastName} required={t.required} value={draft.lastName} error={err('lastName')} onChange={(v) => { set('lastName', v); }} autoCapitalize="words" />
        </div>
        <fieldset className="flex flex-col gap-space-xs" aria-describedby={err('birthDate') ? 'kiosk-birth-error' : undefined}>
          <legend className="pb-space-xs text-title-md">
            {t.birthDate} <Req label={t.required} />
          </legend>
          <div className="grid grid-cols-[2fr_1fr_1.4fr] gap-space-sm">
            <label className="flex flex-col gap-1">
              <span className="text-body-md text-on-surface-variant">{t.month}</span>
              <select
                value={draft.month}
                aria-required
                aria-invalid={err('birthDate') ? true : undefined}
                onChange={(e) => { set('month', e.target.value); }}
                className={inputClass(err('birthDate'))}
                autoComplete="off"
              >
                <option value="">{t.month}</option>
                {t.months.map((m, i) => (
                  <option key={m} value={String(i + 1)}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-body-md text-on-surface-variant">{t.day}</span>
              <input
                inputMode="numeric"
                autoComplete="off"
                maxLength={2}
                placeholder={`1–${String(days)}`}
                value={draft.day}
                aria-required
                aria-invalid={err('birthDate') ? true : undefined}
                onChange={(e) => { set('day', e.target.value.replace(/\D/g, '').slice(0, 2)); }}
                className={cn(inputClass(err('birthDate')), 'text-center tabular-nums')}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-body-md text-on-surface-variant">{t.year}</span>
              <input
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                placeholder="aaaa"
                value={draft.year}
                aria-required
                aria-invalid={err('birthDate') ? true : undefined}
                onChange={(e) => { set('year', e.target.value.replace(/\D/g, '').slice(0, 4)); }}
                className={cn(inputClass(err('birthDate')), 'text-center tabular-nums')}
              />
            </label>
          </div>
          <FieldError id="kiosk-birth-error" text={err('birthDate')} />
        </fieldset>
        <TextField
          label={t.phone}
          hint={t.phoneHint}
          required={t.required}
          value={draft.phone}
          error={err('phone')}
          inputMode="tel"
          onChange={(v) => { set('phone', typedPhone(v)); }}
        />
      </Card>

      <Card>
        <Choice
          label={t.firstVisitQuestion}
          required={t.required}
          error={err('firstVisit')}
          value={draft.firstVisit === null ? null : draft.firstVisit ? 'yes' : 'no'}
          onChange={(v) => { set('firstVisit', v === 'yes'); }}
          options={[
            { value: 'yes', label: t.firstVisitYes, icon: UserPlus },
            { value: 'no', label: t.firstVisitNo, icon: IdCard },
          ]}
        />
      </Card>

      <Card>
        <Choice
          label={t.reasonQuestion}
          hint={t.reasonHint}
          required={t.required}
          error={err('reason')}
          value={draft.reason}
          onChange={(v) => { set('reason', v as KioskReason); }}
          options={KIOSK_REASONS.map((r) => ({ value: r, label: t.reasons[r].label, help: t.reasons[r].help, icon: REASON_ICONS[r] }))}
          tall
        />
      </Card>

      <Card>
        <Symptoms t={t} value={draft.symptoms} error={err('symptoms')} onChange={(v) => { set('symptoms', v); }} />
      </Card>

      {problemText ? (
        <p role="alert" className="flex items-center gap-space-sm rounded-md bg-error-container p-space-md text-title-md text-on-error-container">
          <CircleAlert aria-hidden className="size-6 shrink-0" /> {problemText}
        </p>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 border-t border-outline-variant bg-surface-container-lowest/95 px-4 py-space-sm backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <button
            type="submit"
            disabled={busy}
            className="flex min-h-touch-kiosk w-full items-center justify-center gap-space-sm rounded-lg bg-primary px-space-lg text-title-lg text-on-primary shadow-level-2 hover:bg-primary/90 disabled:opacity-70"
          >
            <UserCheck aria-hidden className="size-7" /> {busy ? t.submitting : t.submit}
          </button>
        </div>
      </div>

      <Dialog
        open={idle !== null}
        onOpenChange={(open) => {
          if (!open) {
            lastActivity.current = Date.now();
            setIdle(null);
          }
        }}
        title={t.idleTitle}
        description={idle !== null ? t.idleBody(idle) : ''}
        footer={
          <BigButton
            onClick={() => {
              lastActivity.current = Date.now();
              setIdle(null);
            }}
          >
            {t.idleContinue}
          </BigButton>
        }
      />
    </form>
  );
}

/** S-KIO-02 «Listo»: sin el nombre; vuelve solo al formulario tras la cuenta regresiva. */
function Done({ t, onBack }: { t: KioskTexts; onBack: () => void }) {
  const [left, setLeft] = useState(KIOSK_DONE_SECONDS);
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  });
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      const remaining = KIOSK_DONE_SECONDS - Math.floor((Date.now() - started) / 1000);
      if (remaining <= 0) onBackRef.current();
      else setLeft(remaining);
    }, 250);
    return () => { clearInterval(timer); };
  }, []);
  return (
    <section aria-labelledby="kiosk-done" className="m-auto flex w-full max-w-xl flex-col items-center gap-space-lg text-center">
      <span aria-hidden className="flex size-28 items-center justify-center rounded-full bg-primary-container/20">
        <span className="flex size-20 items-center justify-center rounded-full bg-primary text-on-primary">
          <Check className="size-12" strokeWidth={3} />
        </span>
      </span>
      <div className="flex flex-col gap-space-xs">
        <h1 id="kiosk-done" className="text-display-md">
          {t.doneTitle}
        </h1>
        <p className="text-headline-sm">{t.doneBody}</p>
      </div>
      <div className="flex w-full flex-col gap-space-xs">
        <p className="text-body-lg text-on-surface-variant" role="timer" aria-live="off">
          {t.doneBack(left)}
        </p>
        <div aria-hidden className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
          <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${String((left / KIOSK_DONE_SECONDS) * 100)}%` }} />
        </div>
      </div>
      <BigButton onClick={onBack}>
        <UserPlus aria-hidden className="size-6" /> {t.doneAnother}
      </BigButton>
    </section>
  );
}

/** Tableta sin vincular (o revocada): el código de un solo uso que da la Administración en Sedes. */
function LinkForm({ sede, onLinked }: { sede: string; onLinked: (session: KioskSession) => void }) {
  const t = KIOSK_TEXTS.es;
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onLinked(await api.kioskLink({ locationCode: sede, code }));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 429 ? t.linkTooMany : t.linkInvalid);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      aria-label={t.linkTitle}
      autoComplete="off"
      className="m-auto flex w-full max-w-md flex-col gap-space-md"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <span aria-hidden className="flex size-16 items-center justify-center self-center rounded-full bg-surface-container-high text-primary">
        <Link2 className="size-8" />
      </span>
      <h1 className="text-center text-headline-lg">{t.linkTitle}</h1>
      <p className="text-center text-body-lg text-on-surface-variant">{t.linkBody}</p>
      <p className="text-center font-mono text-title-md text-primary">{sede.toUpperCase()}</p>
      <label htmlFor={id} className="text-title-md">
        {t.linkCode}
      </label>
      <input
        id={id}
        value={code}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={7}
        placeholder="K7Q-4M2"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => { setCode(e.target.value.toUpperCase()); }}
        className={cn(inputClass(error), 'text-center font-mono text-headline-lg tracking-[0.2em]')}
      />
      <FieldError id={`${id}-error`} text={error} />
      <BigButton type="submit" disabled={busy || code.replace(/[\s-]/g, '').length !== 6}>
        {t.linkSubmit}
      </BigButton>
    </form>
  );
}

// --- Piezas ------------------------------------------------------------------

function inputClass(error: string | null) {
  return cn(
    'min-h-touch-kiosk w-full rounded-md border-2 bg-surface-container-lowest px-space-md text-title-md text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary',
    error ? 'border-error bg-error-container/30' : 'border-outline',
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-space-md rounded-lg border border-outline-variant bg-surface-container-lowest p-space-md tab:p-space-lg">{children}</div>;
}

function Notice({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section role="alert" className="m-auto flex w-full max-w-md flex-col items-center gap-space-md text-center">
      <Icon aria-hidden className="size-12 text-error" />
      <p className="text-headline-sm">{title}</p>
      {children}
    </section>
  );
}

/** Asterisco visible; para los lectores de pantalla, el campo lleva aria-required. */
function Req({ label }: { label: string }) {
  return (
    <span aria-hidden className="text-error" data-label={label}>
      *
    </span>
  );
}

function FieldError({ id, text }: { id: string; text: string | null }) {
  if (!text) return null;
  return (
    <p id={id} className="flex items-center gap-space-xs text-body-lg text-error">
      <CircleAlert aria-hidden className="size-5 shrink-0" /> {text}
    </p>
  );
}

function BigButton({ children, onClick, type = 'button', disabled = false }: { children: ReactNode; onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-touch-kiosk w-full items-center justify-center gap-space-sm rounded-lg bg-primary px-space-lg text-title-lg text-on-primary hover:bg-primary/90 disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function TextField({
  label,
  hint,
  required,
  value,
  error,
  onChange,
  inputMode,
  autoCapitalize,
}: {
  label: string;
  hint?: string;
  required: string;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  inputMode?: 'tel' | 'text';
  autoCapitalize?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-space-xs">
        <label htmlFor={id} className="text-title-md">
          {label} <Req label={required} />
        </label>
        {hint ? <span className="text-body-md text-on-surface-variant">{hint}</span> : null}
      </div>
      <input
        id={id}
        value={value}
        autoComplete="off"
        spellCheck={false}
        inputMode={inputMode}
        autoCapitalize={autoCapitalize}
        aria-required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => { onChange(e.target.value); }}
        className={inputClass(error)}
      />
      <FieldError id={`${id}-error`} text={error} />
    </div>
  );
}

function Choice({
  label,
  hint,
  required,
  error,
  value,
  onChange,
  options,
  tall = false,
}: {
  label: string;
  hint?: string;
  required: string;
  error: string | null;
  value: string | null;
  onChange: (value: string) => void;
  options: { value: string; label: string; help?: string; icon: LucideIcon }[];
  tall?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-space-sm">
      <div className="flex flex-col gap-1">
        <span id={id} className="text-title-md">
          {label} <Req label={required} />
        </span>
        {hint ? <span className="text-body-md text-on-surface-variant">{hint}</span> : null}
      </div>
      <div role="radiogroup" aria-required aria-labelledby={id} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} className="grid gap-space-sm tab:grid-cols-2">
        {options.map((o) => {
          const selected = value === o.value;
          const Icon = o.icon;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => { onChange(o.value); }}
              className={cn(
                'flex min-h-touch-kiosk items-center gap-space-md rounded-lg border-2 px-space-md text-left',
                tall && 'py-space-md',
                selected ? 'border-primary bg-primary-container/15 text-primary' : 'border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low',
                error && !selected && 'border-error',
              )}
            >
              <span aria-hidden className={cn('flex size-11 shrink-0 items-center justify-center rounded-md', selected ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant')}>
                <Icon className="size-6" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-title-md">{o.label}</span>
                {o.help ? <span className="text-body-md text-on-surface-variant">{o.help}</span> : null}
              </span>
              {selected ? <Check aria-hidden className="size-6 shrink-0" /> : null}
            </button>
          );
        })}
      </div>
      <FieldError id={`${id}-error`} text={error} />
    </div>
  );
}

function Symptoms({ t, value, error, onChange }: { t: KioskTexts; value: string; error: string | null; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-title-md">
        {t.symptoms} <span className="text-body-md text-on-surface-variant">{t.optional}</span>
      </label>
      <textarea
        id={id}
        rows={3}
        value={value}
        autoComplete="off"
        maxLength={KIOSK_SYMPTOMS_MAX + 50}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-privacy`}
        onChange={(e) => { onChange(e.target.value); }}
        className={cn(inputClass(error), 'min-h-32 py-space-sm')}
      />
      <p id={`${id}-privacy`} className="flex items-center gap-space-xs text-body-md text-on-surface-variant">
        <Lock aria-hidden className="size-4 shrink-0" /> {t.symptomsPrivacy}
        <span className="ml-auto tabular-nums">{`${String(value.length)}/${String(KIOSK_SYMPTOMS_MAX)}`}</span>
      </p>
      <FieldError id={`${id}-error`} text={error} />
    </div>
  );
}
