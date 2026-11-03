import { ORDER_NOTES_MAX } from '@clinic/shared';
import { Banner, Button, Dialog, TextAreaField } from '@clinic/ui';
import { CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { completionNoteError } from '../../lib/orders.ts';

// S-CLI-20 «Completar orden» (T-026): «Notas de finalización (opcional)», máx.
// 4000, con foco automático. La nota se añade a las notas de la orden en el
// servidor (cifradas); aquí solo vive en memoria mientras el diálogo está
// abierto (CLAUDE.md, regla 9).

export function CompleteOrderDialog({
  code,
  onClose,
  onConfirm,
}: {
  code: string;
  onClose: () => void;
  /** Devuelve el mensaje de error para mostrarlo en el diálogo, o nulo si salió bien. */
  onConfirm: (notes: string) => Promise<string | null>;
}) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldError = completionNoteError(notes);

  const confirm = async () => {
    if (fieldError) return;
    setBusy(true);
    setError(null);
    try {
      setError(await onConfirm(notes));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}
      dismissible={false}
      icon={<CircleCheck className="size-7" />}
      title="Completar orden"
      description={`Orden ${code}.`}
      footer={
        <>
          <Button variant="tonal" className="text-on-surface" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} loadingText="Completando…" disabled={fieldError !== null} onClick={() => void confirm()}>
            Completar
          </Button>
        </>
      }
    >
      <TextAreaField
        label="Notas de finalización (opcional)"
        rows={4}
        autoFocus
        value={notes}
        disabled={busy}
        error={fieldError}
        hint={`${String(notes.length)}/${String(ORDER_NOTES_MAX)}`}
        onChange={(e) => { setNotes(e.target.value); }}
      />
      {error ? <Banner tone="error" title={error} /> : null}
    </Dialog>
  );
}
