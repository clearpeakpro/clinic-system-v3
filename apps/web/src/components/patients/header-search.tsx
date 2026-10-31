import { ageLabel, ageOn, parsePatientQuery, type PatientSearchResult } from '@clinic/shared';
import { cn, Spinner } from '@clinic/ui';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type SubmitEvent } from 'react';
import { api } from '../../lib/api.ts';
import { formatDay } from '../../lib/catalog.ts';
import { patientMessage, patientSearch, queryErrorText } from '../../lib/patients.ts';

// «Buscar pacientes» de la cabecera (T-012, ADR 0030): un campo con la lupa
// como botón integrado, con las mismas reglas que la pantalla Pacientes (un
// solo campo, mínimo de 3 letras para el nombre, solo con Enter o la lupa).
// Los resultados salen en un panel bajo el campo: hasta 8 pacientes y «Ver
// todos los resultados», que abre Pacientes con la búsqueda en memoria (nunca
// en la URL). Un código que existe abre directamente el perfil.
//
// El campo se vacía al elegir un paciente, al cerrar el panel (Esc o clic
// fuera), al cambiar de sede (el marco lo monta con la sede como key) y al
// cerrar sesión (el marco se desmonta). «/» enfoca el campo.
//
// Tamaños: escritorio ~360 px; tableta, más estrecho y se ensancha con el
// foco; teléfono, solo la lupa, que despliega el campo a todo el ancho de la
// cabecera. Patrón combobox + listbox (flechas, Enter, Esc).

const MAX_RESULTS = 8;

type PanelState =
  | { kind: 'closed' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'results'; result: PatientSearchResult; text: string };

export function HeaderPatientSearch({ code }: { code: string }) {
  const navigate = useNavigate();
  const id = useId();
  const listId = `${id}-results`;
  const optionId = (index: number) => `${id}-option-${String(index)}`;
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [panel, setPanel] = useState<PanelState>({ kind: 'closed' });
  const [active, setActive] = useState(-1);
  /** Teléfono: el campo desplegado sobre la cabecera. */
  const [expanded, setExpanded] = useState(false);
  /** Descarta la respuesta de una búsqueda anterior si llega tarde. */
  const request = useRef(0);

  const reset = () => {
    request.current += 1;
    setText('');
    setPanel({ kind: 'closed' });
    setActive(-1);
    setExpanded(false);
  };

  // Esc o clic fuera: cierra y vacía.
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (container.current && !container.current.contains(event.target as Node)) reset();
    };
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  // «/» enfoca el campo (salvo si ya se escribe en otro campo).
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      event.preventDefault();
      setExpanded(true);
      // En el teléfono el campo aparece al desplegarse.
      requestAnimationFrame(() => input.current?.focus());
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const openProfile = (patientId: string) => {
    reset();
    input.current?.blur();
    void navigate({ to: '/app/$sede/pacientes/$id', params: { sede: code, id: patientId } });
  };
  const viewAll = (submitted: string) => {
    reset();
    input.current?.blur();
    patientSearch.submit(submitted);
    void navigate({ to: '/app/$sede/pacientes', params: { sede: code } });
  };

  const search = async () => {
    const parsed = parsePatientQuery(text);
    if (!parsed.ok) {
      setActive(-1);
      setPanel({ kind: 'error', message: queryErrorText(parsed.error) ?? 'Escriba lo que quiere buscar.' });
      return;
    }
    const current = ++request.current;
    const submitted = text.trim();
    setActive(-1);
    setPanel({ kind: 'loading' });
    try {
      const result = await api.searchPatients(submitted, 0);
      if (current !== request.current) return;
      // Un código que existe (escrito o escaneado) abre directamente el perfil.
      const only = result.patients[0];
      if (parsed.query.code && result.total === 1 && only) {
        openProfile(only.id);
        return;
      }
      setPanel({ kind: 'results', result, text: submitted });
    } catch (error) {
      if (current === request.current) setPanel({ kind: 'error', message: patientMessage(error) });
    }
  };

  const shown = panel.kind === 'results' ? panel.result.patients.slice(0, MAX_RESULTS) : [];
  // Las opciones: los pacientes y, al final, «Ver todos los resultados».
  const optionCount = panel.kind === 'results' && panel.result.total > 0 ? shown.length + 1 : 0;
  const activate = (index: number) => {
    if (panel.kind !== 'results') return;
    const patient = shown[index];
    if (patient) openProfile(patient.id);
    else if (index === shown.length) viewAll(panel.text);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      reset();
      input.current?.blur();
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && optionCount > 0) {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + optionCount) % optionCount);
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      activate(active);
    }
  };

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    void search();
  };

  const open = panel.kind !== 'closed';
  return (
    <div
      ref={container}
      className={cn(
        // Teléfono: solo la lupa; desplegado, el campo ocupa toda la cabecera.
        expanded ? 'absolute inset-x-0 top-0 z-30 flex h-16 items-center bg-surface-container-lowest px-4 dark:bg-surface-container-low' : 'relative',
        'tab:relative tab:inset-auto tab:z-auto tab:h-auto tab:bg-transparent tab:px-0',
      )}
    >
      {!expanded ? (
        <button
          type="button"
          aria-label="Buscar pacientes"
          className="flex size-12 items-center justify-center rounded-md bg-surface-container-low text-on-surface hover:bg-surface-container tab:hidden dark:bg-surface-container-high"
          onClick={() => {
            setExpanded(true);
            requestAnimationFrame(() => input.current?.focus());
          }}
        >
          <Search aria-hidden className="size-5" />
        </button>
      ) : null}
      <form
        role="search"
        aria-label="Buscar pacientes"
        noValidate
        onSubmit={submit}
        className={cn('relative w-full', expanded ? 'block' : 'hidden tab:block')}
      >
        <div
          className={cn(
            'flex h-12 items-center rounded-md bg-surface-container-low transition-[width] duration-200 focus-within:ring-2 focus-within:ring-primary dark:bg-surface-container-high',
            'w-full tab:w-48 tab:focus-within:w-80 desk:w-[360px] desk:focus-within:w-[360px]',
          )}
        >
          <label htmlFor={`${id}-input`} className="sr-only">
            Buscar pacientes
          </label>
          <input
            ref={input}
            id={`${id}-input`}
            role="combobox"
            aria-expanded={optionCount > 0}
            aria-controls={listId}
            aria-haspopup="listbox"
            aria-autocomplete="none"
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
            aria-keyshortcuts="/"
            autoComplete="off"
            spellCheck={false}
            maxLength={200}
            placeholder="Buscar pacientes"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              // Los resultados son de la búsqueda anterior: no se dejan a la vista.
              request.current += 1;
              setPanel({ kind: 'closed' });
              setActive(-1);
            }}
            onKeyDown={onKeyDown}
            className="h-full min-w-0 flex-1 bg-transparent pl-space-md text-body-md text-on-surface outline-none placeholder:text-on-surface-variant"
          />
          {expanded ? (
            <button type="button" aria-label="Cerrar la búsqueda" className="flex size-12 shrink-0 items-center justify-center text-on-surface-variant tab:hidden" onClick={reset}>
              <X aria-hidden className="size-5" />
            </button>
          ) : null}
          <button type="submit" aria-label="Buscar" title="Buscar" className="flex size-12 shrink-0 items-center justify-center rounded-r-md text-on-surface-variant hover:text-primary">
            <Search aria-hidden className="size-5" />
          </button>
        </div>

        {open ? (
          <div
            className={cn(
              'absolute top-full right-0 z-40 mt-space-xs w-full overflow-hidden rounded-lg border border-outline-variant/60 bg-surface-container-lowest shadow-level-3 dark:bg-surface-container-low',
              'tab:w-[360px]',
            )}
          >
            {panel.kind === 'loading' ? (
              <div className="flex justify-center p-space-md">
                <Spinner />
              </div>
            ) : null}
            {panel.kind === 'error' ? (
              <p role="alert" className="p-space-md text-body-md text-error">
                {panel.message}
              </p>
            ) : null}
            {panel.kind === 'results' && panel.result.total === 0 ? (
              <p role="status" className="p-space-md text-body-md text-on-surface-variant">
                No se encontraron pacientes.
              </p>
            ) : null}
            {panel.kind === 'results' && panel.result.total > 0 ? (
              <>
                <p role="status" className="px-space-md pt-space-sm text-caption text-on-surface-variant">
                  {panel.result.total === 1 ? '1 paciente' : `${String(panel.result.total)} pacientes`}
                </p>
                <ul id={listId} role="listbox" aria-label="Resultados de la búsqueda de pacientes" className="flex max-h-[60vh] flex-col overflow-y-auto py-space-xs">
                  {shown.map((p, index) => (
                    <li
                      key={p.id}
                      id={optionId(index)}
                      role="option"
                      aria-selected={active === index}
                      className={cn(
                        'flex min-h-touch cursor-pointer flex-col justify-center px-space-md py-space-xs',
                        active === index ? 'bg-primary/10' : 'hover:bg-surface-container-low dark:hover:bg-surface-container-high',
                      )}
                      onMouseDown={(e) => { e.preventDefault(); }}
                      onClick={() => { openProfile(p.id); }}
                    >
                      <span className="flex items-baseline gap-space-sm">
                        <span className="font-mono text-code-sm text-primary">{p.code}</span>
                        <span className="truncate text-body-md-medium text-on-surface">
                          {p.firstName} {p.lastName}
                        </span>
                      </span>
                      <span className="text-caption text-on-surface-variant">
                        {formatDay(p.birthDate)} · {ageLabel(ageOn(p.birthDate, panel.result.today))}
                      </span>
                    </li>
                  ))}
                  <li
                    id={optionId(shown.length)}
                    role="option"
                    aria-selected={active === shown.length}
                    className={cn(
                      'flex min-h-touch cursor-pointer items-center justify-between gap-space-sm border-t border-outline-variant/60 px-space-md text-body-md-medium text-primary',
                      active === shown.length ? 'bg-primary/10' : 'hover:bg-surface-container-low dark:hover:bg-surface-container-high',
                    )}
                    onMouseDown={(e) => { e.preventDefault(); }}
                    onClick={() => { viewAll(panel.text); }}
                  >
                    Ver todos los resultados <ArrowRight aria-hidden className="size-5" />
                  </li>
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
      </form>
    </div>
  );
}
