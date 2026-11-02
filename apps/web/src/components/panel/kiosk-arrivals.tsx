import { ageLabel, ageOn, type KioskArrival, type KioskArrivals } from '@clinic/shared';
import { Button, ConfirmDialog, DateTimeText, StatusChip, useSnackbar } from '@clinic/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { BellOff, BellRing, IdCard, TabletSmartphone, Trash2, UserCheck, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, type ApiError } from '../../lib/api.ts';
import { formatDay } from '../../lib/catalog.ts';
import { maskedPhone, newArrivalIds } from '../../lib/kiosk-arrivals.ts';
import { minutesText } from '../../lib/panel.ts';
import { userActionMessage } from '../../lib/users.ts';
import { KioskReasonChip } from '../kiosk/declared-reason.tsx';

// S-REC-28 Llegadas del kiosco (T-021; Stitch: design/stitch/recepcion/
// S-REC-28_llegadas_del_kiosco), arriba del Panel, para Recepción.
//  - Registros pendientes de la sede, el más antiguo primero, con «Primera
//    vez» o «Ya es paciente», la hora y hace cuánto, nacimiento y edad,
//    teléfono enmascarado (se ve completo al confirmar), el motivo con icono,
//    texto y color, y los síntomas tal como los escribió.
//  - En vivo con `kiosk.checkin` (solo el id); suena un aviso con cada
//    registro nuevo, salvo con «Silenciar» (recordado en memoria, solo en esta
//    ventana).
//  - «Confirmar llegada» abre el asistente con el registro; «Descartar…» pide motivo.

let muted = false;

/** Un aviso corto con Web Audio: sin archivos ni almacenamiento. */
function chime(): void {
  try {
    const Ctx = window.AudioContext as typeof AudioContext | undefined;
    if (!Ctx) return;
    const ctx = new Ctx();
    for (const [i, freq] of [880, 1320].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.17);
    }
    setTimeout(() => void ctx.close(), 800);
  } catch {
    // Sin audio (navegador sin permiso de reproducir): solo el aviso visual.
  }
}

/** Hora del servidor estimada, redibujada cada 15 s (como el Panel). */
function useServerNow(serverNow: string | undefined, receivedAt: number): number {
  const [deviceNow, setDeviceNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => { setDeviceNow(Date.now()); }, 15_000);
    return () => { clearInterval(timer); };
  }, []);
  if (!serverNow) return deviceNow;
  return Math.max(deviceNow, receivedAt) + (new Date(serverNow).getTime() - receivedAt);
}

export function KioskArrivalsTray({ sede, locationId }: { sede: string; locationId: string }) {
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const arrivals = useQuery<KioskArrivals, ApiError>({ queryKey: ['kiosk-arrivals', locationId], queryFn: api.kioskArrivals });
  const [silenced, setSilenced] = useState(muted);
  const [discarding, setDiscarding] = useState<KioskArrival | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const known = useRef<Set<string> | null>(null);
  const data = arrivals.data;
  const now = useServerNow(data?.serverNow, arrivals.dataUpdatedAt);

  // Registros nuevos desde la última lectura: aviso sonoro y marca «Nuevo».
  useEffect(() => {
    if (!data) return;
    const ids = data.rows.map((r) => r.id);
    const added = newArrivalIds(known.current, ids);
    known.current = new Set(ids);
    if (added.length === 0) return;
    if (!muted) chime();
    setFresh((f) => new Set([...f, ...added]));
  }, [data]);

  if (!data || data.rows.length === 0) {
    return (
      <section aria-labelledby="kiosk-tray-title" data-testid="kiosk-tray" className="flex items-center gap-space-sm rounded-lg bg-surface-container-low px-space-md py-space-sm text-body-md text-on-surface-variant dark:bg-surface-container">
        <TabletSmartphone aria-hidden className="size-5 text-primary" />
        <h2 id="kiosk-tray-title" className="text-body-md-medium text-on-surface">
          Llegadas del kiosco
        </h2>
        <span>· {arrivals.error ? 'No se pudieron cargar.' : 'Sin registros pendientes.'}</span>
      </section>
    );
  }

  const newCount = data.rows.filter((r) => fresh.has(r.id)).length;

  return (
    <section aria-labelledby="kiosk-tray-title" data-testid="kiosk-tray" className="flex flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest shadow-level-1 dark:bg-surface-container-low">
      <header className="flex flex-wrap items-center justify-between gap-space-sm bg-surface-container-low px-space-md py-space-sm dark:bg-surface-container">
        <div className="flex flex-wrap items-center gap-space-sm">
          <TabletSmartphone aria-hidden className="size-6 text-primary" />
          <h2 id="kiosk-tray-title" className="text-headline-sm text-on-surface">
            Llegadas del kiosco
          </h2>
          <span data-testid="kiosk-tray-count" className="rounded-full bg-primary px-2.5 py-0.5 text-caption font-semibold text-on-primary">
            {newCount > 0 ? `${String(newCount)} ${newCount === 1 ? 'nueva' : 'nuevas'}` : `${String(data.rows.length)} pendientes`}
          </span>
        </div>
        <Button
          variant="text"
          aria-pressed={silenced}
          onClick={() => {
            muted = !muted;
            setSilenced(muted);
          }}
        >
          {silenced ? <BellOff aria-hidden className="size-5" /> : <BellRing aria-hidden className="size-5" />}
          {silenced ? 'Activar sonido' : 'Silenciar'}
        </Button>
      </header>
      <ul aria-label="Registros del kiosco pendientes" className="flex flex-col divide-y divide-outline-variant">
        {data.rows.map((r) => {
          const name = `${r.firstName} ${r.lastName}`;
          return (
            <li key={r.id} data-testid="kiosk-arrival" className="flex flex-wrap items-center justify-between gap-space-md px-space-md py-space-sm">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-space-sm">
                  <span className="text-body-lg-medium text-on-surface">{name}</span>
                  {r.firstVisit ? <StatusChip tone="registered" icon={UserPlus} label="Primera vez" /> : <StatusChip tone="completed" icon={IdCard} label="Ya es paciente" />}
                  {fresh.has(r.id) ? <span className="text-caption font-semibold text-primary">Nuevo</span> : null}
                  <span className="text-body-md text-on-surface-variant">
                    <DateTimeText value={r.createdAt} timeZone={data.timeZone} format="time" /> (hace {minutesText(now - new Date(r.createdAt).getTime())})
                  </span>
                </div>
                <p className="text-body-md text-on-surface-variant">
                  Nacimiento: {formatDay(r.birthDate)} ({ageLabel(ageOn(r.birthDate, data.today))}) · Tel.: {maskedPhone(r.phone)}
                </p>
                <div className="flex flex-wrap items-center gap-space-sm">
                  <KioskReasonChip reason={r.reason} />
                  {r.symptoms ? <span className="line-clamp-1 min-w-0 text-body-md break-all text-on-surface italic">{`«${r.symptoms}»`}</span> : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-space-xs">
                <Button
                  onClick={() => void navigate({ to: '/app/$sede/llegada/kiosco/$id', params: { sede, id: r.id } })}
                  aria-label={`Confirmar llegada de ${name}`}
                >
                  <UserCheck aria-hidden className="size-5" /> Confirmar llegada
                </Button>
                <Button variant="text" onClick={() => { setDiscarding(r); }} aria-label={`Descartar el registro de ${name}`}>
                  <Trash2 aria-hidden className="size-5" /> Descartar…
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {discarding ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) setDiscarding(null); }}
          destructive
          dismissible={false}
          icon={<Trash2 className="size-7" />}
          title="¿Descartar este registro del kiosco?"
          description={`${discarding.firstName} ${discarding.lastName}. No se abrirá ninguna visita y sus datos se borran. Úselo para envíos de prueba o duplicados.`}
          confirmLabel="Descartar"
          reason={{ label: 'Motivo', hint: 'Máximo 500 caracteres' }}
          onConfirm={async (reason) => {
            try {
              await api.discardKioskArrival(discarding.id, reason ?? '');
              setDiscarding(null);
              snackbar({ message: 'Registro descartado.' });
            } catch (error) {
              setDiscarding(null);
              snackbar({ message: userActionMessage(error) });
            } finally {
              void queryClient.invalidateQueries({ queryKey: ['kiosk-arrivals'] });
            }
          }}
        />
      ) : null}
    </section>
  );
}
