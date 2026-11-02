import type { EncounterDetail, EncounterProvider, RegularVisitAction } from '@clinic/shared';
import { AsyncView, Button, EmptyState, Tabs, useSnackbar, type TabItem } from '@clinic/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { ArrowLeft, ClipboardList, FileText, History, HeartPulse, ReceiptText, RefreshCw, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ActionBar, type BarCommand } from '../components/encounters/action-bar.tsx';
import { AssignProviderDialog } from '../components/encounters/assign-provider-dialog.tsx';
import { CoverageCard, CoverageDialog } from '../components/encounters/coverage-card.tsx';
import { EncounterHeader } from '../components/encounters/encounter-header.tsx';
import { EncounterTimeline } from '../components/encounters/encounter-timeline.tsx';
import { SectionCard } from '../components/encounters/section-card.tsx';
import { api, type ApiError } from '../lib/api.ts';
import { encounterMessage, isVersionConflict, movedText, VERSION_CONFLICT_TEXT } from '../lib/encounters.ts';
import { useActiveLocation } from '../lib/session.ts';

// S-CLI-04 Detalle de visita (Stitch: design/stitch/clinicas/S-CLI-04_visita), T-018.
// De Stitch: «Volver», el nombre del paciente con «Visita {código}», «Abrir
// perfil del paciente», la tarjeta con el encabezado y la barra de acciones,
// las pestañas «Resumen» e «Historial» (con su número) y, en Resumen, las
// tarjetas con icono: a la izquierda Enfermería y Órdenes, a la derecha
// Cobertura y Facturación. En el teléfono, en el orden del manual: Cobertura,
// Enfermería, Órdenes y Facturación. No se construye lo que llega en otras
// tareas (Enfermería T-022, Órdenes T-025, Facturación T-027) ni lo que el
// sistema no tiene (alergias en el encabezado hasta T-022, enfermera
// responsable, folio).
//  - Los cuatro roles clínicos la abren (patients.access); la API calcula qué
//    puede hacer cada uno y revalida cada operación.
//  - Toda acción lleva la versión leída: ante un 409 se avisa y se relee.
//  - Se relee sola con `encounter.changed` (y cada 30 s sin conexión en vivo).
//  - Cada lectura se audita en el servidor; nada se guarda en el navegador.

type TabKey = 'resumen' | 'historial';

export type EncounterSection = 'nursing' | 'orders' | 'billing';

export function EncounterPage({ sede, encounterId, section }: { sede: string; encounterId: string; section?: EncounterSection | undefined }) {
  const active = useActiveLocation();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('resumen');
  const [busy, setBusy] = useState<null | 'action' | 'provider'>(null);
  const [dialog, setDialog] = useState<null | 'provider' | 'coverage'>(null);
  const encounter = useQuery<EncounterDetail, ApiError>({
    queryKey: ['encounter', encounterId],
    queryFn: () => api.encounter(encounterId),
    enabled: active?.code === sede,
    staleTime: 0,
    gcTime: 0,
    retry: (failures: number, error: ApiError) => error.status >= 500 && failures < 2,
  });

  // Enlace profundo ?section=: la página abre en «Resumen»; al cargar, desplaza hasta la sección.
  const loaded = encounter.data !== undefined;
  useEffect(() => {
    if (!loaded || !section) return;
    requestAnimationFrame(() => {
      document.getElementById(`section-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [loaded, section]);

  const reload = async () => {
    await queryClient.invalidateQueries({ queryKey: ['encounter', encounterId] });
    void queryClient.invalidateQueries({ queryKey: ['patient-encounters'] });
  };

  /** Tras cada escritura, con éxito o con error, se relee la visita (S-CLI-04). */
  const run = async (kind: 'action' | 'provider', work: () => Promise<{ status: EncounterDetail['status'] } | null>, success: (status: EncounterDetail['status']) => string) => {
    setBusy(kind);
    try {
      const saved = await work();
      if (saved) snackbar({ message: success(saved.status) });
    } catch (error) {
      snackbar({ message: isVersionConflict(error) ? VERSION_CONFLICT_TEXT : encounterMessage(error) });
    } finally {
      setBusy(null);
      await reload();
    }
  };

  const onCommand = async (e: EncounterDetail, command: BarCommand) => {
    await run(
      'action',
      () => {
        switch (command.kind) {
          case 'transition':
            return api.encounterTransition(e.id, { action: command.action as RegularVisitAction, expectedVersion: e.version });
          case 'close':
            return api.closeEncounter(e.id, { outcome: command.outcome, reason: command.reason, expectedVersion: e.version });
          case 'force':
            return api.forceEncounter(e.id, { status: command.status, reason: command.reason, expectedVersion: e.version });
        }
      },
      movedText,
    );
  };

  const assign = async (e: EncounterDetail, provider: EncounterProvider | { membershipId: string }) => {
    setDialog(null);
    await run('provider', () => api.assignProvider(e.id, { providerMembershipId: provider.membershipId, expectedVersion: e.version }), () => 'Proveedor actualizado.');
  };

  const saveCoverage = async (e: EncounterDetail, input: Parameters<typeof api.updateCoverage>[1]['coverage'], expectedVersion: number): Promise<string | null> => {
    try {
      await api.updateCoverage(e.id, { coverage: input, expectedVersion });
      setDialog(null);
      snackbar({ message: 'Cobertura guardada.' });
      await reload();
      return null;
    } catch (error) {
      if (isVersionConflict(error)) {
        setDialog(null);
        snackbar({ message: VERSION_CONFLICT_TEXT });
        await reload();
        return null;
      }
      return encounterMessage(error);
    }
  };

  const back = () => {
    if (window.history.length > 1) router.history.back();
    else void navigate({ to: '/app/$sede/$destino', params: { sede, destino: 'panel' } });
  };

  const e = encounter.data;
  const tabs: readonly TabItem<TabKey>[] = [
    { key: 'resumen', label: 'Resumen', icon: ClipboardList },
    { key: 'historial', label: e ? `Historial (${String(e.timeline.length)})` : 'Historial', icon: History },
  ];

  return (
    <section aria-labelledby="page-title" className="mx-auto flex w-full max-w-7xl flex-col gap-space-lg">
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex min-w-0 flex-wrap items-center gap-space-md">
          <Button variant="tonal" onClick={back}>
            <ArrowLeft aria-hidden className="size-5" /> Atrás
          </Button>
          <div className="flex min-w-0 flex-col">
            <h1 id="page-title" className="text-headline-lg text-on-surface">
              {e ? `${e.patient.firstName} ${e.patient.lastName}` : 'Visita'}
            </h1>
            <p className="text-body-md text-on-surface-variant">Visita</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm">
          <Button variant="text" aria-label="Actualizar" disabled={encounter.isFetching} onClick={() => void reload()}>
            <RefreshCw aria-hidden className="size-5" />
          </Button>
          {e ? (
            <Link
              to="/app/$sede/pacientes/$id"
              params={{ sede, id: e.patient.id }}
              className="flex min-h-touch items-center gap-space-xs rounded-md bg-surface-container px-space-md text-body-lg-medium text-primary hover:bg-surface-container-high"
            >
              <UserRound aria-hidden className="size-5" /> Abrir perfil del paciente
            </Link>
          ) : null}
        </div>
      </div>

      <AsyncView source={encounter}>
        {(d) => (
          <>
            <div className="flex flex-col gap-space-lg rounded-lg bg-surface-container-lowest p-space-md shadow-level-1 tab:p-space-lg dark:bg-surface-container-low">
              <EncounterHeader
                encounter={d}
                busy={busy === 'provider'}
                onAssign={() => { setDialog('provider'); }}
                onAssignSelf={() => void assign(d, { membershipId: d.myMembershipId })}
              />
              <ActionBar encounter={d} busy={busy !== null} onCommand={(c) => onCommand(d, c)} />
            </div>
            <Tabs label="Secciones de la visita" items={tabs} value={tab} onValueChange={setTab}>
              {tab === 'resumen' ? (
                <div className="grid gap-space-md desk:grid-cols-3">
                  <div className="desk:col-start-3 desk:row-start-1">
                    <CoverageCard coverage={d.coverage} canEdit={d.abilities.editCoverage && d.coverage !== null} onEdit={() => { setDialog('coverage'); }} />
                  </div>
                  <div className="desk:col-span-2 desk:col-start-1 desk:row-start-1">
                    <SectionCard id="nursing" icon={<HeartPulse className="size-6" />} title="Enfermería" subtitle="Signos vitales y valoración">
                      <EmptyState icon={HeartPulse} title="Aún no hay datos de enfermería." description="Los signos vitales y la valoración llegan con la tarea de Enfermería (T-022)." />
                    </SectionCard>
                  </div>
                  <div className="desk:col-span-2 desk:col-start-1 desk:row-start-2">
                    <SectionCard id="orders" icon={<FileText className="size-6" />} title="Órdenes" subtitle="Laboratorios, medicamentos y procedimientos">
                      <EmptyState icon={FileText} title="Aún no hay órdenes en esta visita." description="Las órdenes llegan con la tarea de Órdenes (T-025)." />
                    </SectionCard>
                  </div>
                  <div className="desk:col-start-3 desk:row-start-2">
                    <SectionCard id="billing" icon={<ReceiptText className="size-6" />} title="Facturación" subtitle="Cargos y saldo">
                      <EmptyState icon={ReceiptText} title="Aún no hay cargos." description="La facturación llega con la tarea de Caja (T-027)." />
                    </SectionCard>
                  </div>
                </div>
              ) : (
                <EncounterTimeline entries={d.timeline} timeZone={d.location.timezone} />
              )}
            </Tabs>
            {dialog === 'provider' ? (
              <AssignProviderDialog current={d.provider?.membershipId ?? null} onClose={() => { setDialog(null); }} onPick={(p) => void assign(d, p)} />
            ) : null}
            {dialog === 'coverage' ? (
              <CoverageDialog coverage={d.coverage} onClose={() => { setDialog(null); }} onSave={(input, version) => saveCoverage(d, input, version)} />
            ) : null}
          </>
        )}
      </AsyncView>
    </section>
  );
}
