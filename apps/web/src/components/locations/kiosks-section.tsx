import { formatKioskCode, KIOSK_NAME_MAX, type KioskDeviceView, type KioskPairing } from '@clinic/shared';
import { AsyncView, Button, ConfirmDialog, DateTimeText, Dialog, EmptyState, Field, SelectField, StatusChip, useSnackbar } from '@clinic/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CirclePause, Copy, Hourglass, Link2, Link2Off, RefreshCw, TabletSmartphone, Unlink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, ApiError, type LocationRow } from '../../lib/api.ts';
import { isVersionConflict, userActionMessage } from '../../lib/users.ts';

// Sedes › Kioscos de autorregistro (S-ADM-10, T-020; Stitch:
// design/stitch/admin/S-ADM-10_sedes_y_kioscos). Propietario y Administración
// (kiosks.manage). Las tabletas de la sede elegida, con su nombre, estado,
// vinculación, último uso y vencimiento; «Vincular kiosco» (nombre → código de
// un solo uso de 10 min, con copiar y «Generar nuevo código»); «Revocar» con
// motivo. De Stitch quedan fuera la IP, el modelo, «Reiniciar», las métricas
// y los textos sobre HIPAA (decisión del 2026-11-02).

const kiosksKey = (locationId: string) => ['kiosks', locationId] as const;

type Dialogs = { kind: 'name' } | { kind: 'code'; pairing: KioskPairing } | { kind: 'revoke'; device: KioskDeviceView } | null;

export function KiosksSection({ locations, defaultLocationId }: { locations: LocationRow[]; defaultLocationId: string | null }) {
  const active = locations.filter((l) => l.active);
  const [chosen, setChosen] = useState<string | null>(null);
  const locationId = chosen ?? (active.some((l) => l.id === defaultLocationId) ? defaultLocationId : (active[0]?.id ?? null));
  const site = active.find((l) => l.id === locationId) ?? null;
  const [dialog, setDialog] = useState<Dialogs>(null);
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const devices = useQuery<KioskDeviceView[], ApiError>({
    queryKey: kiosksKey(locationId ?? ''),
    queryFn: () => api.kiosks(locationId ?? ''),
    enabled: locationId !== null,
    staleTime: 0,
  });
  const reload = () => queryClient.invalidateQueries({ queryKey: ['kiosks'] });
  const failed = (error: unknown) => {
    setDialog(null);
    snackbar({ message: isVersionConflict(error) ? 'Este registro fue actualizado por otro usuario. Actualice para continuar.' : userActionMessage(error) });
    void reload();
  };

  if (!site) return null;
  return (
    <section aria-labelledby="kiosks-title" className="flex flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-md shadow-level-1 tab:p-space-lg dark:bg-surface-container-low">
      <header className="flex flex-wrap items-end justify-between gap-space-md">
        <div className="flex min-w-0 flex-col gap-space-xs">
          <h2 id="kiosks-title" className="flex items-center gap-space-sm text-headline-sm text-on-surface">
            <TabletSmartphone aria-hidden className="size-6 text-primary" /> Kioscos de autorregistro
          </h2>
          <p className="text-body-md text-on-surface-variant">Tabletas de la recepción donde los pacientes se registran al llegar. Solo envían registros: no pueden leer datos.</p>
        </div>
        <div className="flex flex-wrap items-end gap-space-sm">
          {active.length > 1 ? (
            <div className="w-56">
              <SelectField label="Sede" value={site.id} onChange={(e) => { setChosen(e.target.value); }}>
                {active.map((l) => (
                  <option key={l.id} value={l.id}>
                    {`${l.code} · ${l.name}`}
                  </option>
                ))}
              </SelectField>
            </div>
          ) : null}
          <Button onClick={() => { setDialog({ kind: 'name' }); }}>
            <Link2 aria-hidden className="size-5" /> Vincular kiosco
          </Button>
        </div>
      </header>

      <AsyncView
        source={devices}
        isEmpty={(rows) => rows.length === 0}
        empty={<EmptyState icon={TabletSmartphone} title="Esta sede aún no tiene kioscos." description="Use «Vincular kiosco» para añadir una tableta." />}
      >
        {(rows) => (
          <ul aria-label={`Kioscos de ${site.name}`} className="flex flex-col gap-space-sm">
            {rows.map((d) => (
              <li key={d.id} data-testid="kiosk-row" className="flex flex-wrap items-center justify-between gap-space-sm rounded-md border border-outline-variant p-space-md">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-space-sm">
                    <span className="text-body-lg-medium text-on-surface">{d.name}</span>
                    <DeviceStatus device={d} />
                  </div>
                  <p className="flex flex-wrap gap-x-space-md gap-y-1 text-body-md text-on-surface-variant">
                    {d.status === 'pending' && d.pairingExpiresAt ? (
                      <span>
                        Código vence: <DateTimeText value={d.pairingExpiresAt} timeZone={site.timezone} format="time" />
                      </span>
                    ) : null}
                    {d.linkedAt ? (
                      <span>
                        Vinculada: <DateTimeText value={d.linkedAt} timeZone={site.timezone} />
                      </span>
                    ) : null}
                    {d.lastUsedAt ? (
                      <span>
                        Último uso: <DateTimeText value={d.lastUsedAt} timeZone={site.timezone} />
                      </span>
                    ) : null}
                    {d.status === 'active' && d.tokenExpiresAt ? (
                      <span>
                        Vence si no se usa: <DateTimeText value={d.tokenExpiresAt} timeZone={site.timezone} format="date" />
                      </span>
                    ) : null}
                    {d.revokedAt ? (
                      <span>
                        Revocada: <DateTimeText value={d.revokedAt} timeZone={site.timezone} />
                      </span>
                    ) : null}
                  </p>
                </div>
                {d.status !== 'revoked' ? (
                  <span className="flex flex-wrap gap-space-xs">
                    {d.status === 'pending' ? (
                      <Button
                        variant="tonal"
                        onClick={() => {
                          api.regenerateKioskCode(site.id, d.id, d.version).then(
                            (pairing) => {
                              setDialog({ kind: 'code', pairing });
                              void reload();
                            },
                            failed,
                          );
                        }}
                      >
                        <RefreshCw aria-hidden className="size-5" /> Generar nuevo código
                      </Button>
                    ) : null}
                    <Button variant="text" className="text-error" onClick={() => { setDialog({ kind: 'revoke', device: d }); }} aria-label={`Revocar ${d.name}`}>
                      <Unlink aria-hidden className="size-5" /> Revocar
                    </Button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </AsyncView>

      {dialog?.kind === 'name' ? (
        <NameDialog
          siteLabel={`${site.name} (${site.code})`}
          onClose={() => { setDialog(null); }}
          onCreate={async (name) => {
            try {
              const pairing = await api.createKioskPairing(site.id, { name });
              setDialog({ kind: 'code', pairing });
              void reload();
            } catch (error) {
              failed(error);
            }
          }}
        />
      ) : null}
      {dialog?.kind === 'code' ? (
        <CodeDialog
          pairing={dialog.pairing}
          site={site}
          onClose={() => {
            setDialog(null);
            void reload();
          }}
          onRegenerate={async () => {
            try {
              const fresh = (await api.kiosks(site.id)).find((d) => d.id === dialog.pairing.device.id);
              const pairing = await api.regenerateKioskCode(site.id, dialog.pairing.device.id, fresh?.version ?? dialog.pairing.device.version);
              setDialog({ kind: 'code', pairing });
              void reload();
            } catch (error) {
              failed(error);
            }
          }}
        />
      ) : null}
      {dialog?.kind === 'revoke' ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) setDialog(null); }}
          destructive
          dismissible={false}
          icon={<Link2Off className="size-7" />}
          title={`¿Revocar ${dialog.device.name}?`}
          description="La tableta deja de funcionar al instante. Para volver a usarla, vincúlela con un código nuevo."
          confirmLabel="Revocar"
          reason={{ label: 'Motivo', hint: 'Máximo 500 caracteres' }}
          onConfirm={async (reason) => {
            try {
              await api.revokeKiosk(site.id, dialog.device.id, reason ?? '', dialog.device.version);
              setDialog(null);
              snackbar({ message: 'Kiosco revocado.' });
              void reload();
            } catch (error) {
              failed(error);
            }
          }}
        />
      ) : null}
    </section>
  );
}

function DeviceStatus({ device }: { device: KioskDeviceView }) {
  if (device.status === 'active') return <StatusChip tone="completed" icon={CircleCheck} label="Activo" />;
  if (device.status === 'pending') return <StatusChip tone="waiting" icon={Hourglass} label="Sin vincular" />;
  return <StatusChip tone="departed" icon={CirclePause} label="Revocado" />;
}

function NameDialog({ siteLabel, onClose, onCreate }: { siteLabel: string; onClose: () => void; onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = name.trim().length > 0 && name.trim().length <= KIOSK_NAME_MAX;
  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      icon={<TabletSmartphone className="size-7" />}
      title="Vincular kiosco"
      description={`Sede ${siteLabel}. Ponga un nombre para reconocer la tableta.`}
      footer={
        <>
          <Button variant="tonal" className="text-on-surface" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!valid}
            loading={busy}
            loadingText="Generando…"
            onClick={() => {
              setBusy(true);
              void onCreate(name.trim()).finally(() => { setBusy(false); });
            }}
          >
            Generar código
          </Button>
        </>
      }
    >
      <Field label="Nombre de la tableta" placeholder="Tableta recepción 1" maxLength={KIOSK_NAME_MAX} value={name} onChange={(e) => { setName(e.target.value); }} autoComplete="off" />
    </Dialog>
  );
}

/** El código en claro solo existe en este diálogo (la API no lo vuelve a dar). */
function CodeDialog({ pairing, site, onClose, onRegenerate }: { pairing: KioskPairing; site: LocationRow; onClose: () => void; onRegenerate: () => Promise<void> }) {
  const snackbar = useSnackbar();
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => { setLeft(Math.max(0, Math.round((new Date(pairing.expiresAt).getTime() - Date.now()) / 1000))); };
    tick();
    const timer = setInterval(tick, 1000);
    return () => { clearInterval(timer); };
  }, [pairing.expiresAt]);
  const code = formatKioskCode(pairing.code);
  const url = `${window.location.origin}/kiosk/${site.code}`;
  const mmss = left === null ? '' : `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      icon={<TabletSmartphone className="size-7" />}
      title="Vincular kiosco"
      description={`${pairing.device.name} · Sede ${site.name} (${site.code})`}
      footer={
        <>
          <Button variant="tonal" className="text-on-surface" onClick={() => void onRegenerate()}>
            <RefreshCw aria-hidden className="size-5" /> Generar nuevo código
          </Button>
          <Button onClick={onClose}>Listo</Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-space-sm rounded-lg bg-surface-container-low p-space-md dark:bg-surface-container">
        <span className="text-caption tracking-wide text-on-surface-variant uppercase">Código de vinculación de un solo uso</span>
        <div className="flex items-center gap-space-sm">
          <span data-testid="kiosk-code" className="rounded-md bg-surface-container-lowest px-space-md py-space-xs font-mono text-display-md tracking-widest text-primary">
            {code}
          </span>
          <Button
            variant="outline"
            aria-label="Copiar el código"
            title="Copiar el código"
            className="px-3"
            onClick={() => {
              navigator.clipboard.writeText(code).then(
                () => { snackbar({ message: 'Código copiado.' }); },
                () => { snackbar({ message: 'No se pudo copiar. Escriba el código a mano.' }); },
              );
            }}
          >
            <Copy aria-hidden className="size-5" />
          </Button>
        </div>
        <span role="status" className="flex items-center gap-space-xs text-body-md text-status-waiting">
          <Hourglass aria-hidden className="size-4" />
          {left === 0 ? 'El código venció. Genere uno nuevo.' : `Vence en 10 minutos (${mmss})`}
        </span>
      </div>
      <ol className="flex list-decimal flex-col gap-space-xs pl-space-lg text-body-md text-on-surface">
        <li>Encienda la tableta y fíjela en pantalla completa (modo kiosco de Android).</li>
        <li>
          Abra el navegador en <span className="font-mono break-all text-primary">{url}</span>
        </li>
        <li>
          Escriba el código <span className="font-mono font-semibold">{code}</span> y pulse «Vincular».
        </li>
      </ol>
    </Dialog>
  );
}
