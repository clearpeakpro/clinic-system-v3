import { VISIT_ROUTE_LABELS, VISIT_STATUS_LABELS, type VisitRoute, type VisitStatus } from '@clinic/shared';
import {
  Ban,
  BriefcaseMedical,
  Calculator,
  Circle,
  CircleCheck,
  CircleCheckBig,
  CircleX,
  ClipboardPlus,
  FlaskConical,
  Hourglass,
  Info,
  LogOut,
  type LucideIcon,
  Route,
  Stethoscope,
  Syringe,
  TriangleAlert,
  UserCheck,
  UserSearch,
} from 'lucide-react';
import { cn } from '../cn.ts';

// Chips (hoja S-GEN-30, secciones 1 y 2; decisiones de T-005): 32 px, píldora
// con borde de 1 px, icono de 16 px y texto de 12 px seminegrita. Colores de la
// prosa de DESIGN.md («Visit Status Taxonomy»); iconos de la hoja.

export type StatusTone = 'registered' | 'waiting' | 'in-care' | 'checkout' | 'completed' | 'departed' | 'danger';

const TONE_CLASSES: Record<StatusTone, string> = {
  registered: 'border-status-registered-border bg-status-registered-container text-status-registered',
  waiting: 'border-status-waiting-border bg-status-waiting-container text-status-waiting',
  'in-care': 'border-status-in-care-border bg-status-in-care-container text-status-in-care',
  checkout: 'border-status-checkout-border bg-status-checkout-container text-status-checkout',
  completed: 'border-status-completed-border bg-status-completed-container text-status-completed',
  departed: 'border-status-departed-border bg-status-departed-container text-status-departed',
  danger: 'border-error/40 bg-error-container text-on-error-container',
};

/** Tono e icono de cada estado de la visita. «Cancelada»: gris claro con Ban (T-005). */
export const VISIT_STATUS_STYLE: Record<VisitStatus, { tone: StatusTone; icon: LucideIcon }> = {
  CHECKED_IN: { tone: 'registered', icon: UserCheck },
  WAITING_FOR_NURSE: { tone: 'waiting', icon: Hourglass },
  WITH_NURSE: { tone: 'in-care', icon: ClipboardPlus },
  WAITING_FOR_PROVIDER: { tone: 'waiting', icon: UserSearch },
  WITH_PROVIDER: { tone: 'in-care', icon: Stethoscope },
  PROCEDURE_PENDING: { tone: 'waiting', icon: BriefcaseMedical },
  READY_FOR_CHECKOUT: { tone: 'checkout', icon: CircleCheck },
  CHECKOUT: { tone: 'checkout', icon: Calculator },
  COMPLETED: { tone: 'completed', icon: CircleCheckBig },
  LEFT_EARLY: { tone: 'departed', icon: LogOut },
  CANCELLED: { tone: 'departed', icon: Ban },
};

export const VISIT_ROUTE_ICONS: Record<VisitRoute, LucideIcon> = {
  STANDARD: Route,
  INJECTION_ONLY: Syringe,
  LAB_ONLY: FlaskConical,
  PROCEDURE_ONLY: BriefcaseMedical,
};

const pill = 'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-caption font-semibold whitespace-nowrap';

/**
 * Chip genérico (S-GEN-30 «StatusChip»): icono + texto + color. Se anuncia
 * como «Estado: {texto}».
 */
export function StatusChip({ tone, icon: Icon, label, className }: { tone: StatusTone; icon: LucideIcon; label: string; className?: string }) {
  return (
    <span className={cn(pill, TONE_CLASSES[tone], className)} data-tone={tone}>
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="sr-only">Estado: </span>
      {label}
    </span>
  );
}

/** Tonos semánticos de S-GEN-30 (neutro ○, información ⓘ, éxito ✓, advertencia ⚠, peligro ⊗). */
export const SEMANTIC_TONES = {
  neutral: { tone: 'registered', icon: Circle },
  info: { tone: 'in-care', icon: Info },
  success: { tone: 'completed', icon: CircleCheck },
  warning: { tone: 'waiting', icon: TriangleAlert },
  danger: { tone: 'danger', icon: CircleX },
} as const satisfies Record<string, { tone: StatusTone; icon: LucideIcon }>;

export function SemanticChip({ tone, label, className }: { tone: keyof typeof SEMANTIC_TONES; label: string; className?: string }) {
  const style = SEMANTIC_TONES[tone];
  return <StatusChip tone={style.tone} icon={style.icon} label={label} {...(className ? { className } : {})} />;
}

export function VisitStatusChip({ status, className }: { status: VisitStatus; className?: string }) {
  const style = VISIT_STATUS_STYLE[status];
  return <StatusChip tone={style.tone} icon={style.icon} label={VISIT_STATUS_LABELS[status]} {...(className ? { className } : {})} />;
}

/** Insignia de ruta: neutra con borde (manual, S-REC-01) e icono de la hoja. */
export function RouteBadge({ route, className }: { route: VisitRoute; className?: string }) {
  const Icon = VISIT_ROUTE_ICONS[route];
  return (
    <span
      className={cn(
        pill,
        'border-outline-variant bg-surface-container-lowest font-medium text-on-surface-variant dark:bg-surface-container-high',
        className,
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0 text-primary" />
      <span className="sr-only">Ruta: </span>
      {VISIT_ROUTE_LABELS[route]}
    </span>
  );
}
