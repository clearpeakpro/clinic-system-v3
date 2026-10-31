import type { LucideIcon } from 'lucide-react';
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../cn.ts';

export interface TabItem<K extends string> {
  key: K;
  label: string;
  icon?: LucideIcon;
}

/**
 * Pestañas del perfil del paciente (S-PAC-05, Stitch): icono y texto, la
 * activa en color primario con la barra inferior; se desplazan en horizontal
 * si no caben. Patrón ARIA de pestañas con activación automática: flechas,
 * Inicio y Fin mueven el foco y eligen. Solo se dibuja el panel activo.
 */
export function Tabs<K extends string>({
  label,
  items,
  value,
  onValueChange,
  children,
  className,
}: {
  /** Nombre accesible de la lista de pestañas. */
  label: string;
  items: readonly TabItem<K>[];
  value: K;
  onValueChange: (key: K) => void;
  /** Contenido de la pestaña activa. */
  children: ReactNode;
  className?: string;
}) {
  const prefix = useId();
  const refs = useRef(new Map<K, HTMLButtonElement>());
  const tabId = (key: K) => `${prefix}-tab-${key}`;
  const panelId = (key: K) => `${prefix}-panel-${key}`;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex((item) => item.key === value);
    const last = items.length - 1;
    const next =
      event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null;
    const item = next === null ? undefined : items[next];
    if (!item) return;
    event.preventDefault();
    onValueChange(item.key);
    refs.current.get(item.key)?.focus();
  };

  return (
    <div className={cn('flex flex-col gap-space-md', className)}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex items-center gap-space-md overflow-x-auto rounded-lg bg-surface-container-lowest px-space-md pt-space-xs shadow-level-1 dark:bg-surface-container-low"
      >
        {items.map(({ key, label: text, icon: Icon }) => {
          const selected = key === value;
          return (
            <button
              key={key}
              ref={(el) => {
                if (el) refs.current.set(key, el);
                else refs.current.delete(key);
              }}
              id={tabId(key)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId(key)}
              tabIndex={selected ? 0 : -1}
              onClick={() => { onValueChange(key); }}
              className={cn(
                'relative flex min-h-touch shrink-0 items-center gap-2 rounded-t-md px-space-sm text-body-md whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-primary',
                selected ? 'font-medium text-primary dark:text-primary-fixed-dim' : 'text-on-surface-variant hover:text-on-surface',
              )}
            >
              {Icon ? <Icon aria-hidden className={cn('size-5', !selected && 'text-outline')} /> : null}
              <span>{text}</span>
              <span aria-hidden className={cn('absolute right-0 bottom-0 left-0 h-1 rounded-t-full bg-primary', !selected && 'opacity-0')} />
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={panelId(value)} aria-labelledby={tabId(value)} tabIndex={0} className="outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {children}
      </div>
    </div>
  );
}
