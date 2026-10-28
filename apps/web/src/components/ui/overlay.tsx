import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/cn.ts';

// Diálogo (DESIGN.md, «Elevation Level 3»: radio 12 px, fondo con desenfoque).
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  dismissible = true,
  icon,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** false: no se cierra tocando fuera ni con Esc (S-GEN-20). */
  dismissible?: boolean;
  icon?: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[var(--backdrop)] backdrop-blur-[4px]" />
        <DialogPrimitive.Content
          className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-outline-variant bg-surface-container-lowest p-space-lg shadow-level-3"
          {...(dismissible ? {} : { onPointerDownOutside: (e) => { e.preventDefault(); }, onEscapeKeyDown: (e) => { e.preventDefault(); } })}
          aria-describedby={description ? undefined : undefined}
        >
          {icon ? <div className="mb-space-md text-primary">{icon}</div> : null}
          <DialogPrimitive.Title className="text-headline-sm text-on-surface">{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="mt-space-sm text-body-md text-on-surface-variant">{description}</DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
          <div className="mt-space-lg">{children}</div>
        </DialogPrimitive.Content>
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
        'flex min-h-touch cursor-pointer items-center gap-space-sm rounded-md px-space-sm text-body-md text-on-surface outline-none data-[highlighted]:bg-surface-container',
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
