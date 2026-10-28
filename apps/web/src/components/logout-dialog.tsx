import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { endSession } from '../lib/session.ts';
import { Button } from './ui/button.tsx';
import { Dialog } from './ui/overlay.tsx';

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
  const [busy, setBusy] = useState(false);
  const everywhere = variant === 'everywhere';

  const confirm = async () => {
    setBusy(true);
    await endSession(everywhere ? 'everywhere' : 'voluntary');
    onOpenChange(false);
    setBusy(false);
    await navigate({ to: '/login', replace: true });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={everywhere ? '¿Cerrar sesión en todos los dispositivos?' : '¿Cerrar sesión?'}
      description={
        everywhere
          ? 'Cerrará su sesión en todos los dispositivos, incluido este.'
          : 'Tendrá que iniciar sesión de nuevo para seguir trabajando.'
      }
    >
      <div className="flex flex-wrap justify-end gap-space-sm">
        <Button variant="text" onClick={() => { onOpenChange(false); }}>
          Cancelar
        </Button>
        <Button variant={everywhere ? 'destructive' : 'primary'} loading={busy} onClick={() => void confirm()}>
          {everywhere ? 'Cerrar sesión en todos los dispositivos' : 'Cerrar sesión'}
        </Button>
      </div>
    </Dialog>
  );
}
