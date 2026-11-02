import { ALLERGY_STATUS_LABELS, type AllergyNotice } from '@clinic/shared';
import { cn } from '@clinic/ui';
import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';

// Aviso de alergias del encabezado de la visita (ADR 0040, T-022). Tres casos
// distintos, cada uno con icono, texto y color (nunca solo color):
//  - alergias registradas, con su lista (texto del paciente);
//  - «Sin alergias conocidas»;
//  - «Alergias no registradas».
// Recepción no lo ve: la API no envía el aviso a quien no ve datos clínicos.

const STYLE = {
  recorded: { icon: ShieldAlert, className: 'border-error/40 bg-error-container text-on-error-container' },
  none_known: { icon: ShieldCheck, className: 'border-status-completed-border bg-status-completed-container text-status-completed' },
  not_recorded: { icon: ShieldQuestion, className: 'border-status-waiting-border bg-status-waiting-container text-status-waiting' },
} as const;

export function AllergyBanner({ notice }: { notice: AllergyNotice }) {
  const { icon: Icon, className } = STYLE[notice.status];
  return (
    <div
      role="note"
      aria-label="Alergias del paciente"
      data-testid="allergy-banner"
      data-status={notice.status}
      className={cn('flex items-start gap-space-sm rounded-md border px-space-md py-space-sm', className)}
    >
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      {notice.status === 'recorded' ? (
        <p className="min-w-0 text-body-md">
          <span className="font-semibold">{ALLERGY_STATUS_LABELS.recorded}: </span>
          <span className="break-words whitespace-pre-line select-none">{notice.text}</span>
        </p>
      ) : (
        <p className="text-body-md font-semibold">{ALLERGY_STATUS_LABELS[notice.status]}</p>
      )}
    </div>
  );
}

/**
 * Versión compacta para las tarjetas de la Cola de proveedor (T-023, decisión
 * del 2026-11-02): los mismos tres casos, en una línea; el texto largo se
 * corta con «…» y completo queda en el título.
 */
export function AllergyChip({ notice }: { notice: AllergyNotice }) {
  const { icon: Icon, className } = STYLE[notice.status];
  const text = notice.status === 'recorded' ? `${ALLERGY_STATUS_LABELS.recorded}: ${notice.text ?? ''}` : ALLERGY_STATUS_LABELS[notice.status];
  return (
    <span
      data-testid="allergy-chip"
      data-status={notice.status}
      title={text}
      className={cn('inline-flex max-w-full min-w-0 items-center gap-space-xs rounded-full border px-space-sm py-0.5 text-body-md-medium', className)}
    >
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="truncate">{text}</span>
    </span>
  );
}
