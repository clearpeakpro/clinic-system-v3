import { ageLabel, ageOn, type EncounterDetail } from '@clinic/shared';
import { Button, cn, CodeText, DateTimeText, RouteBadge, Spinner, VisitStatusChip } from '@clinic/ui';
import { BriefcaseMedical, Clock, UserCheck, UserRoundPlus } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { clockOffset, waitingTimes } from '../../lib/encounters.ts';

// S-CLI-05 Encabezado de la visita (Stitch: design/stitch/clinicas/S-CLI-04_visita).
// De Stitch: chips de estado, ruta, hora de registro y tipo de cita, y la
// celda «Proveedor asignado» con su botón. No se construye lo que el sistema
// no tiene en T-018 (alergias, motivo del kiosco, ubicación en la clínica).
//  - Los cronómetros parten de la hora del servidor (serverNow) y avanzan
//    cada segundo en el dispositivo: no dependen de la hora de la tableta.
//  - «Asignar proveedor» / «Cambiar proveedor» (Recepción) y «Asignarme»
//    (Proveedor), solo con la visita abierta.

/** Hora del servidor estimada, que avanza cada segundo. */
function useServerNow(serverNow: string): number {
  const [offset] = useState(() => clockOffset(serverNow, Date.now()));
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now() + offset);
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [offset]);
  return now;
}

export function providerText(e: Pick<EncounterDetail, 'provider' | 'myMembershipId'>): { text: string; unassigned: boolean } {
  if (!e.provider) return { text: 'Sin asignar', unassigned: true };
  if (e.provider.membershipId === e.myMembershipId) return { text: 'Usted', unassigned: false };
  return { text: e.provider.name || 'Asignado', unassigned: false };
}

export function EncounterHeader({
  encounter: e,
  busy,
  onAssign,
  onAssignSelf,
}: {
  encounter: EncounterDetail;
  busy: boolean;
  onAssign: () => void;
  onAssignSelf: () => void;
}) {
  const provider = providerText(e);
  const timeZone = e.location.timezone;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-space-md">
      <Cell label="Paciente">
        <span className="flex flex-wrap items-center gap-space-xs">
          <CodeText code={e.patient.code} />
          <span className="text-body-md text-on-surface-variant">{ageLabel(ageOn(e.patient.birthDate, e.today))}</span>
        </span>
      </Cell>
      <Cell label="Visita">
        <CodeText code={e.code} />
      </Cell>
      <Cell label="Sede">{e.location.name}</Cell>
      <Cell label="Tipo de cita">{e.appointmentType?.name ?? 'Sin cita'}</Cell>
      <Cell label="Ruta">
        <RouteBadge route={e.route} />
      </Cell>
      <Cell label="Estado actual">
        <VisitStatusChip status={e.status} />
      </Cell>
      {/* key: cada lectura de la visita trae una hora del servidor nueva y recalcula el desfase. */}
      <WaitingCell key={e.serverNow} encounter={e} timeZone={timeZone} />
      <div className="col-span-full flex flex-wrap items-center justify-between gap-space-sm rounded-md bg-surface-container-low p-space-md dark:bg-surface-container">
        <div className="flex min-w-0 items-center gap-space-sm">
          <BriefcaseMedical aria-hidden className="size-6 shrink-0 text-primary" />
          <div className="flex min-w-0 flex-col">
            <span className="text-caption text-on-surface-variant">Proveedor</span>
            <span data-testid="encounter-provider" className={cn('text-body-lg-medium text-on-surface', provider.unassigned && 'italic text-on-surface-variant')}>
              {provider.text}
            </span>
          </div>
        </div>
        {busy ? (
          <Spinner label="Asignando…" />
        ) : (
          <div className="flex flex-wrap gap-space-xs">
            {e.abilities.assignProvider ? (
              <Button variant="text" onClick={onAssign}>
                <UserRoundPlus aria-hidden className="size-5" /> {e.provider ? 'Cambiar proveedor' : 'Asignar proveedor'}
              </Button>
            ) : null}
            {e.abilities.assignSelf ? (
              <Button variant="text" onClick={onAssignSelf}>
                <UserCheck aria-hidden className="size-5" /> Asignarme
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function WaitingCell({ encounter: e, timeZone }: { encounter: EncounterDetail; timeZone: string }) {
  const now = useServerNow(e.serverNow);
  const times = waitingTimes(e, now);
  return (
    <Cell label="Tiempo de espera">
      <span className="flex flex-col">
        <span className="flex items-center gap-space-xs font-mono text-code-md tabular-nums text-on-surface" data-testid="encounter-waiting">
          <Clock aria-hidden className="size-4 text-on-surface-variant" />
          {times.total}
        </span>
        {times.inStatus ? <span className="text-caption text-on-surface-variant">{`En este estado ${times.inStatus}`}</span> : null}
        <span className="text-caption text-on-surface-variant">
          Registro: <DateTimeText value={e.arrivedAt} timeZone={timeZone} format="time" />
        </span>
      </span>
    </Cell>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-caption text-on-surface-variant">{label}</span>
      <div className="text-body-md text-on-surface">{children}</div>
    </div>
  );
}
