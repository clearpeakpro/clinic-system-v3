import { useNavigate } from '@tanstack/react-router';
import { Hand, Loader2, Timer } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Dialog } from '@clinic/ui';
import { IdleClock, secondsText, WARNING_SECONDS, type IdlePhase } from '../lib/idle.ts';
import { endSession } from '../lib/session.ts';

// S-GEN-20 Cierre automático por inactividad (HIPAA 164.312(a)(2)(iii)).
// Solo cuenta la interacción real; timers, peticiones y cambios de foco no.
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input'] as const;

export function IdleGuard({ limitSeconds }: { limitSeconds: number }) {
  const navigate = useNavigate();
  const [clock] = useState(() => new IdleClock(limitSeconds, Date.now()));
  const [state, setState] = useState<IdlePhase>({ phase: 'active' });
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const closing = useRef(false);

  const expire = useCallback(async () => {
    if (closing.current) return;
    closing.current = true;
    await endSession('idle');
    await navigate({ to: '/login', search: { motivo: 'inactividad' }, replace: true });
  }, [navigate]);

  const tick = useCallback(() => {
    const next = clock.state(Date.now());
    setState(next);
    if (next.phase === 'expired') void expire();
  }, [clock, expire]);

  useEffect(() => {
    const onActivity = () => {
      clock.activity(Date.now());
    };
    // Ratón que realmente se mueve (no los eventos sintéticos sin desplazamiento).
    const onMove = (e: PointerEvent) => {
      const prev = lastPointer.current;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      if (prev && (prev.x !== e.clientX || prev.y !== e.clientY)) onActivity();
    };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true, capture: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    // Al volver a la pestaña se evalúa al instante (el tiempo oculto cuenta).
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(tick, 1000);
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity, { capture: true });
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(interval);
    };
  }, [clock, tick]);

  if (state.phase === 'expired') {
    // Cubierta opaca: oculta la pantalla a la vista, al tacto y a los lectores.
    return (
      <div role="alert" aria-live="assertive" className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-space-md bg-background">
        <Loader2 aria-hidden className="size-8 animate-spin text-primary" />
        <p className="text-body-lg text-on-surface">Cerrando sesión…</p>
      </div>
    );
  }

  return (
    <IdleWarningDialog
      open={state.phase === 'warning'}
      secondsLeft={state.phase === 'warning' ? state.secondsLeft : WARNING_SECONDS}
      onKeepAlive={() => {
        clock.keepAlive(Date.now());
        tick();
      }}
      onSignOut={() => void expire()}
    />
  );
}

/**
 * Aviso de S-GEN-20 con el aspecto de la hoja S-GEN-30 (sección 6): cuenta
 * atrás grande y barra de progreso. Textos del manual.
 */
export function IdleWarningDialog({
  open,
  secondsLeft,
  onKeepAlive,
  onSignOut,
  inline = false,
}: {
  open: boolean;
  secondsLeft: number;
  onKeepAlive: () => void;
  onSignOut: () => void;
  inline?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={() => undefined}
      dismissible={false}
      inline={inline}
      icon={<Timer className="size-7" />}
      title="¿Sigue ahí?"
      description={`Su sesión se cerrará en ${secondsText(secondsLeft)} por inactividad.`}
    >
      {/* Repite visualmente la cuenta atrás; el texto ya la anuncia. */}
      <div aria-hidden className="flex flex-col items-center rounded-md bg-surface-container p-space-md text-center dark:bg-surface-container-high">
        <span className="flex items-baseline gap-1 font-mono text-display-md font-bold text-primary tabular-nums">
          {secondsLeft}
          <span className="font-sans text-headline-sm font-normal">{secondsLeft === 1 ? 'segundo' : 'segundos'}</span>
        </span>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-container-high dark:bg-surface-container-highest">
          <div className="h-2 rounded-full bg-primary transition-[width]" style={{ width: `${String((secondsLeft / WARNING_SECONDS) * 100)}%` }} />
        </div>
      </div>
      <div className="flex flex-col gap-space-xs">
        <Button size="block" autoFocus={!inline} onClick={onKeepAlive}>
          <Hand aria-hidden className="size-5" /> Mantener la sesión
        </Button>
        <Button size="block" variant="text" className="text-on-surface-variant hover:text-error" onClick={onSignOut}>
          Cerrar sesión
        </Button>
      </div>
    </Dialog>
  );
}
