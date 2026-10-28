import { useNavigate } from '@tanstack/react-router';
import { Clock, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { IdleClock, secondsText, type IdlePhase } from '../lib/idle.ts';
import { endSession } from '../lib/session.ts';
import { Button } from './ui/button.tsx';
import { Dialog } from './ui/overlay.tsx';

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
    <Dialog
      open={state.phase === 'warning'}
      onOpenChange={() => undefined}
      dismissible={false}
      icon={<Clock aria-hidden className="size-8" />}
      title="¿Sigue ahí?"
      description={state.phase === 'warning' ? `Su sesión se cerrará en ${secondsText(state.secondsLeft)} por inactividad.` : ''}
    >
      <div className="flex flex-wrap justify-end gap-space-sm">
        <Button variant="text" onClick={() => void expire()}>
          Cerrar sesión
        </Button>
        <Button
          autoFocus
          onClick={() => {
            clock.keepAlive(Date.now());
            tick();
          }}
        >
          Mantener la sesión
        </Button>
      </div>
    </Dialog>
  );
}
