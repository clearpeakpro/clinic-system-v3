import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

// Aviso temporal (snackbar) de Material 3: abajo y al centro, superficie
// inversa, un mensaje y como mucho una acción. Lo usa el manual para los
// resultados de acciones («Invitación revocada.», conflicto de versión con
// «Actualizar»). Se anuncia a los lectores de pantalla (role="status").

export interface SnackbarMessage {
  message: string;
  action?: { label: string; onClick: () => void };
}

interface Shown extends SnackbarMessage {
  id: number;
}

const SnackbarContext = createContext<((message: SnackbarMessage) => void) | null>(null);

/** Con acción el aviso dura más: hay que poder alcanzarla. */
const DURATION_MS = 5000;
const DURATION_WITH_ACTION_MS = 10000;

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const counter = useRef(0);
  const show = useCallback((message: SnackbarMessage) => {
    counter.current += 1;
    setShown({ ...message, id: counter.current });
  }, []);

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => { setShown(null); }, shown.action ? DURATION_WITH_ACTION_MS : DURATION_MS);
    return () => { clearTimeout(timer); };
  }, [shown]);

  const value = useMemo(() => show, [show]);
  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 desk:bottom-8">
        <div role="status" aria-live="polite" className="contents">
          {shown ? (
            <div
              key={shown.id}
              className="pointer-events-auto flex max-w-xl min-w-0 items-center gap-space-sm rounded-md bg-inverse-surface py-1.5 pr-1.5 pl-space-md text-body-md text-inverse-on-surface shadow-level-3"
            >
              <p className="min-w-0 flex-1 py-2">{shown.message}</p>
              {shown.action ? (
                <button
                  type="button"
                  className="min-h-touch shrink-0 rounded-md px-space-sm text-body-md-medium text-inverse-primary hover:bg-inverse-on-surface/10"
                  onClick={() => {
                    shown.action?.onClick();
                    setShown(null);
                  }}
                >
                  {shown.action.label}
                </button>
              ) : null}
              <button
                type="button"
                aria-label="Cerrar aviso"
                className="flex size-12 shrink-0 items-center justify-center rounded-md hover:bg-inverse-on-surface/10"
                onClick={() => { setShown(null); }}
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </SnackbarContext.Provider>
  );
}

/** Muestra un aviso. Fuera de un SnackbarProvider no hace nada (p. ej. en pruebas aisladas). */
export function useSnackbar(): (message: SnackbarMessage) => void {
  return useContext(SnackbarContext) ?? noop;
}

function noop() {
  // Sin proveedor.
}
