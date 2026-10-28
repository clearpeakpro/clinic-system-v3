import { ConfirmDialog } from '@clinic/ui';
import { useNavigate } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';
import { endSession } from '../lib/session.ts';

/** S-GEN-17 Confirmaciones de cierre de sesión (texto adaptado a «usted»). */
export function LogoutDialog({
  open,
  onOpenChange,
  variant,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: 'simple' | 'everywhere';
}) {
  const navigate = useNavigate();
  const everywhere = variant === 'everywhere';
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={everywhere ? '¿Cerrar sesión en todos los dispositivos?' : '¿Cerrar sesión?'}
      description={
        everywhere
          ? 'Cerrará su sesión en todos los dispositivos, incluido este.'
          : 'Tendrá que iniciar sesión de nuevo para seguir trabajando.'
      }
      icon={<LogOut className="size-6" />}
      confirmLabel={everywhere ? 'Cerrar sesión en todos los dispositivos' : 'Cerrar sesión'}
      destructive={everywhere}
      onConfirm={async () => {
        await endSession(everywhere ? 'everywhere' : 'voluntary');
        await navigate({ to: '/login', replace: true });
      }}
    />
  );
}
