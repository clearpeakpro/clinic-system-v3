import { KIOSK_REASON_LABELS, type DeclaredReason, type KioskReason } from '@clinic/shared';
import { StatusChip, type StatusTone } from '@clinic/ui';
import { ClipboardList, Frown, MessageSquareQuote, Plus, Syringe, type LucideIcon } from 'lucide-react';

// Motivo del kiosco (T-021; ADR 0031): lo que el paciente declaró, con icono,
// texto y color (nunca solo color). No decide nada clínico: Recepción elige la
// ruta y nadie lo interpreta.

const STYLE: Record<KioskReason, { tone: StatusTone; icon: LucideIcon }> = {
  sick: { tone: 'danger', icon: Frown },
  results: { tone: 'in-care', icon: ClipboardList },
  injection: { tone: 'checkout', icon: Syringe },
  other: { tone: 'departed', icon: Plus },
};

export function KioskReasonChip({ reason }: { reason: KioskReason }) {
  const { tone, icon } = STYLE[reason];
  return <StatusChip tone={tone} icon={icon} label={KIOSK_REASON_LABELS[reason]} />;
}

/** «Motivo declarado por el paciente (kiosco)»: tal como lo envió, de solo lectura. */
export function DeclaredReasonCard({ declared, compact = false }: { declared: DeclaredReason; compact?: boolean }) {
  return (
    <section
      aria-label="Motivo declarado por el paciente"
      data-testid="declared-reason"
      className={compact ? 'flex flex-col gap-space-xs rounded-md bg-surface-container-low p-space-sm dark:bg-surface-container' : 'flex flex-col gap-space-sm rounded-lg bg-surface-container-lowest p-space-md shadow-level-1 dark:bg-surface-container-low'}
    >
      <h2 className="flex items-center gap-space-xs text-body-md-medium text-on-surface">
        <MessageSquareQuote aria-hidden className="size-5 text-primary" /> Motivo declarado por el paciente (kiosco)
      </h2>
      <div className="flex flex-wrap items-center gap-space-sm">
        <KioskReasonChip reason={declared.reason} />
      </div>
      {declared.symptoms ? <p className="text-body-md break-words whitespace-pre-line text-on-surface italic">{`«${declared.symptoms}»`}</p> : <p className="text-body-md text-on-surface-variant">Sin descripción de síntomas.</p>}
      <p className="text-caption text-on-surface-variant">Dato del paciente, sin interpretar. No decide la ruta.</p>
    </section>
  );
}
