import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, X } from 'lucide-react';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../cn.ts';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Botones del pie: a la derecha; en el teléfono, apilados a lo ancho. */
  footer?: ReactNode;
  /** false: no se cierra tocando fuera ni con Esc (S-GEN-20). */
  dismissible?: boolean;
  icon?: ReactNode;
  /** Color del círculo del icono: `danger` para acciones destructivas. */
  tone?: 'primary' | 'danger';
  /** Solo para /dev/ui: se dibuja en la página, sin capa ni foco atrapado. */
  inline?: boolean;
  /** 560 px en lugar de 512 (formularios de S-ADM-03). */
  wide?: boolean;
  /**
   * En el teléfono ocupa toda la pantalla, con «Cerrar» (X) arriba a la
   * izquierda (formularios de administración, S-ADM-03 y S-ADM-09).
   */
  fullScreenOnPhone?: boolean;
  /** Al cerrarse: `preventDefault()` y enfocar otro elemento (p. ej., el campo a corregir). */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * Diálogo (hoja S-GEN-30, sección 5): icono en un círculo, título de 20 px y
 * texto al lado; pie con línea superior. Elevación de nivel 3 y fondo con
 * desenfoque (DESIGN.md).
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  dismissible = true,
  icon,
  tone = 'primary',
  inline = false,
  wide = false,
  fullScreenOnPhone = false,
  onCloseAutoFocus,
}: DialogProps) {
  const content = (
    <DialogPrimitive.Content
      className={cn(
        'flex flex-col gap-space-md rounded-lg border border-outline-variant/60 bg-surface-container-lowest p-space-lg shadow-level-3 dark:bg-surface-container-low',
        inline
          ? 'relative w-full max-w-lg'
          : 'fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto',
        wide && 'max-w-[560px]',
        fullScreenOnPhone &&
          !inline &&
          'max-tab:inset-0 max-tab:h-dvh max-tab:max-h-none max-tab:w-full max-tab:max-w-none max-tab:translate-x-0 max-tab:translate-y-0 max-tab:rounded-none max-tab:border-0',
      )}
      {...(inline ? { onOpenAutoFocus: (e: Event) => { e.preventDefault(); } } : {})}
      {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
      {...(dismissible ? {} : { onPointerDownOutside: (e: Event) => { e.preventDefault(); }, onEscapeKeyDown: (e: Event) => { e.preventDefault(); } })}
    >
      <div className="flex items-start gap-space-sm">
        {fullScreenOnPhone && !inline ? (
          <DialogPrimitive.Close
            aria-label="Cerrar"
            className="-ml-2 flex size-12 shrink-0 items-center justify-center rounded-md text-on-surface hover:bg-surface-container tab:hidden"
          >
            <X aria-hidden className="size-6" />
          </DialogPrimitive.Close>
        ) : null}
        {icon ? (
          <div
            aria-hidden
            className={cn(
              'flex size-12 shrink-0 items-center justify-center rounded-full',
              tone === 'danger' ? 'bg-error-container text-error' : 'bg-surface-container text-primary dark:bg-surface-container-high',
            )}
          >
            {icon}
          </div>
        ) : null}
        <div className="flex min-w-0 flex-col gap-1">
          <DialogPrimitive.Title className="text-headline-md text-on-surface">{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="text-body-md text-on-surface-variant">{description}</DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
        </div>
      </div>
      {children}
      {footer ? (
        <div
          className={cn(
            'flex flex-col-reverse gap-space-sm border-t border-surface-container-high pt-space-md tab:flex-row tab:justify-end [&>*]:w-full tab:[&>*]:w-auto',
            fullScreenOnPhone && 'max-tab:mt-auto',
          )}
        >
          {footer}
        </div>
      ) : null}
    </DialogPrimitive.Content>
  );

  if (inline) {
    return (
      <DialogPrimitive.Root open modal={false}>
        {content}
      </DialogPrimitive.Root>
    );
  }
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[var(--backdrop)] backdrop-blur-[4px]" />
        {content}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Panel lateral derecho (cajón «Menú» del teléfono, S-GEN-12). */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[var(--backdrop)] backdrop-blur-[4px]" />
        <DialogPrimitive.Content className="fixed top-0 right-0 z-50 flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto bg-surface-container-lowest p-space-md shadow-level-3 dark:bg-surface-container-low">
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const SheetClose = DialogPrimitive.Close;

export const DropdownMenu = Menu.Root;
export const DropdownTrigger = Menu.Trigger;

export function DropdownContent({ className, ...props }: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={8}
        align="end"
        className={cn('z-50 min-w-64 rounded-lg border border-outline-variant bg-surface-container-lowest p-space-xs shadow-level-2', className)}
        {...props}
      />
    </Menu.Portal>
  );
}

export function DropdownItem({ className, ...props }: ComponentProps<typeof Menu.Item>) {
  return (
    <Menu.Item
      className={cn(
        'flex min-h-touch cursor-pointer items-center gap-space-sm rounded-md px-space-sm text-body-md text-on-surface outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-container',
        className,
      )}
      {...props}
    />
  );
}

export const DropdownSeparator = () => <Menu.Separator className="my-space-xs h-px bg-outline-variant" />;
export const DropdownLabel = Menu.Label;

export function Checkbox({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-touch cursor-pointer items-center gap-space-sm text-body-md text-on-surface">
      <CheckboxPrimitive.Root
        checked={checked}
        onCheckedChange={(v) => { onCheckedChange(v === true); }}
        className="flex size-[22px] items-center justify-center rounded-[6px] border-[1.5px] border-outline-variant data-[state=checked]:border-primary data-[state=checked]:bg-primary"
      >
        <CheckboxPrimitive.Indicator>
          <Check aria-hidden className="size-4 text-on-primary" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label}
    </label>
  );
}

/** ¿Pantalla de 600 px o más? (tableta y escritorio; S-GEN-12). */
function useTabletUp(): boolean {
  const query = '(min-width: 600px)';
  const [matches, setMatches] = useState(() => typeof window === 'undefined' || typeof window.matchMedia !== 'function' || window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const onChange = () => {
      setMatches(list.matches);
    };
    list.addEventListener('change', onChange);
    return () => {
      list.removeEventListener('change', onChange);
    };
  }, []);
  return matches;
}

/**
 * Panel anclado a un botón de la cabecera (S-GEN-15): en tableta y escritorio,
 * 400 × 520 px arriba a la derecha y sin oscurecer el fondo; en el teléfono,
 * hoja inferior de 480 px con asa. Título visible y acciones a su derecha.
 */
export function FloatingPanel({
  open,
  onOpenChange,
  trigger,
  title,
  actions,
  children,
  inline = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Botón que lo abre (también lo cierra). */
  trigger?: ReactNode;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Solo para /dev/ui: se dibuja en la página. */
  inline?: boolean;
}) {
  const tabletUp = useTabletUp();
  const sheet = !tabletUp && !inline;
  const content = (
    <DialogPrimitive.Content
      className={cn(
        'flex flex-col overflow-hidden border border-outline-variant/60 bg-surface-container-lowest dark:bg-surface-container-low',
        inline
          ? 'relative h-[520px] w-full max-w-[400px] rounded-lg shadow-level-2'
          : sheet
            ? 'fixed inset-x-0 bottom-0 z-50 h-[480px] max-h-[85dvh] rounded-t-lg shadow-level-3'
            : 'fixed top-[72px] right-4 z-50 h-[520px] max-h-[calc(100dvh-88px)] w-[400px] max-w-[calc(100vw-2rem)] rounded-lg shadow-level-2',
      )}
      {...(inline ? { onOpenAutoFocus: (e: Event) => { e.preventDefault(); } } : {})}
    >
      {sheet ? <div aria-hidden className="mx-auto mt-space-sm h-1 w-8 shrink-0 rounded-full bg-outline-variant" /> : null}
      <div className="flex min-h-16 shrink-0 items-center gap-space-xs border-b border-surface-container-high py-space-xs pr-space-xs pl-space-md">
        <DialogPrimitive.Title className="flex-1 text-headline-sm text-on-surface">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
        {actions}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </DialogPrimitive.Content>
  );
  if (inline) {
    return (
      <DialogPrimitive.Root open modal={false}>
        {content}
      </DialogPrimitive.Root>
    );
  }
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={sheet}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        {sheet ? <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[var(--backdrop)] backdrop-blur-[4px]" /> : null}
        {content}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
