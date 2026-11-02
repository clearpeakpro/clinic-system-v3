import {
  CLOSE_OUTCOME_LABELS,
  CLOSE_OUTCOMES,
  reopens,
  VISIT_ACTION_LABELS,
  VISIT_STATUS_LABELS,
  type CloseOutcome,
  type EncounterDetail,
  type VisitAction,
  type VisitStatus,
} from '@clinic/shared';
import { Button, ConfirmDialog, SegmentedControl, SelectField, Spinner } from '@clinic/ui';
import { ArrowRight, Lock, LogOut, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

// S-CLI-07 Barra de acciones de la visita, con S-CLI-09 «Cerrar visita» y
// S-CLI-10 «Cambio excepcional de estado».
//  - Los botones salen de las capacidades que calcula la API con la máquina
//    de estados (estado × ruta × roles × permisos); el servidor revalida.
//  - La primera acción regular, rellena; las demás, tonales; «Cerrar visita…»
//    con borde y «Forzar estado…» como texto (acciones de riesgo).
//  - Visita cerrada: banner «Esta visita está cerrada.» con su motivo; quien
//    puede forzar ve además «Forzar estado…» (reabrir).

export type BarCommand =
  | { kind: 'transition'; action: VisitAction }
  | { kind: 'close'; outcome: CloseOutcome; reason: string }
  | { kind: 'force'; status: VisitStatus; reason: string };

export function ActionBar({ encounter: e, busy, onCommand }: { encounter: EncounterDetail; busy: boolean; onCommand: (command: BarCommand) => Promise<void> }) {
  const [dialog, setDialog] = useState<null | 'close' | 'force'>(null);
  const { abilities } = e;
  const closed = e.closedAt !== null;
  const nothing = abilities.actions.length === 0 && !abilities.close && abilities.forceTargets.length === 0;
  return (
    <div className="flex flex-col gap-space-sm">
      {closed ? (
        <div role="status" className="flex items-start gap-space-sm rounded-md bg-surface-container-high p-space-md text-on-surface dark:bg-surface-container-highest">
          <Lock aria-hidden className="mt-0.5 size-5 shrink-0 text-on-surface-variant" />
          <div className="flex flex-col gap-0.5">
            <p className="text-body-md-medium">Esta visita está cerrada.</p>
            {e.closeReason ? <p className="text-body-md break-words text-on-surface-variant">{`Motivo: ${e.closeReason}`}</p> : null}
          </div>
        </div>
      ) : null}
      {nothing ? (
        closed ? null : <p className="text-body-md text-on-surface-variant">No hay acciones disponibles para su rol en este estado.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-space-sm">
          {abilities.actions.map((action, i) => (
            <Button key={action} variant={i === 0 ? 'primary' : 'tonal'} disabled={busy} onClick={() => void onCommand({ kind: 'transition', action })}>
              {VISIT_ACTION_LABELS[action]} <ArrowRight aria-hidden className="size-5" />
            </Button>
          ))}
          {abilities.close ? (
            <Button variant="outline" disabled={busy} onClick={() => { setDialog('close'); }}>
              <LogOut aria-hidden className="size-5" /> Cerrar visita…
            </Button>
          ) : null}
          {abilities.forceTargets.length > 0 ? (
            <Button variant="text" disabled={busy} onClick={() => { setDialog('force'); }}>
              <ShieldAlert aria-hidden className="size-5" /> Forzar estado…
            </Button>
          ) : null}
          {busy ? <Spinner label="Guardando…" /> : null}
        </div>
      )}
      {dialog === 'close' ? (
        <CloseEncounterDialog
          onClose={() => { setDialog(null); }}
          onConfirm={(outcome, reason) => onCommand({ kind: 'close', outcome, reason })}
        />
      ) : null}
      {dialog === 'force' ? (
        <ForceStateDialog
          from={e.status}
          targets={abilities.forceTargets}
          onClose={() => { setDialog(null); }}
          onConfirm={(status, reason) => onCommand({ kind: 'force', status, reason })}
        />
      ) : null}
    </div>
  );
}

/** S-CLI-09 «Cerrar visita»: resultado y motivo obligatorio; botón rojo. */
function CloseEncounterDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: (outcome: CloseOutcome, reason: string) => Promise<void> }) {
  const [outcome, setOutcome] = useState<CloseOutcome>('LEFT_EARLY');
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      dismissible={false}
      destructive
      icon={<LogOut className="size-7" />}
      title="Cerrar visita"
      description="La visita se cerrará y no podrá continuar. Se requiere un motivo."
      confirmLabel="Cerrar visita"
      reason={{ label: 'Motivo', hint: 'Máximo 500 caracteres' }}
      onConfirm={(reason) => onConfirm(outcome, reason ?? '')}
    >
      <SegmentedControl<CloseOutcome>
        label="Resultado"
        options={CLOSE_OUTCOMES.map((o) => ({ value: o, label: CLOSE_OUTCOME_LABELS[o] }))}
        value={outcome}
        onChange={setOutcome}
        className="self-start"
      />
    </ConfirmDialog>
  );
}

/** S-CLI-10 «Cambio excepcional de estado» (ADR 0033): destino y motivo; avisa si reabre. */
function ForceStateDialog({
  from,
  targets,
  onClose,
  onConfirm,
}: {
  from: VisitStatus;
  targets: VisitStatus[];
  onClose: () => void;
  onConfirm: (status: VisitStatus, reason: string) => Promise<void>;
}) {
  const [target, setTarget] = useState<VisitStatus>(targets[0] ?? from);
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      dismissible={false}
      icon={<ShieldAlert className="size-7" />}
      title="Cambio excepcional de estado"
      confirmLabel="Forzar"
      reason={{ label: 'Motivo', hint: 'Queda en la auditoría' }}
      onConfirm={(reason) => onConfirm(target, reason ?? '')}
    >
      <div role="note" className="flex gap-3 rounded-md border border-status-waiting-border bg-status-waiting-container p-3.5 text-status-waiting">
        <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
        <p className="text-body-md">Esto omite el flujo normal. El cambio queda registrado en la auditoría con su motivo.</p>
      </div>
      <SelectField
        label="Nuevo estado"
        value={target}
        onChange={(event) => { setTarget(event.target.value as VisitStatus); }}
      >
        {targets.map((status) => (
          <option key={status} value={status}>
            {VISIT_STATUS_LABELS[status]}
          </option>
        ))}
      </SelectField>
      <p className="text-body-md text-on-surface-variant">
        {`${VISIT_STATUS_LABELS[from]} → ${VISIT_STATUS_LABELS[target]}`}
        {reopens(from, target) ? '. La visita se reabrirá.' : ''}
      </p>
    </ConfirmDialog>
  );
}
