import {
  ALLERGY_STATUS_LABELS,
  ASSESSMENT_LABELS,
  HISTORY_FIELDS,
  VISIT_ASSESSMENT_FIELDS,
  VITAL_RULES,
  type AssessmentField,
  type EncounterDetail,
  type NursingSection as NursingSectionData,
  type NursingVitals,
  type SaveAssessmentInput,
  type VitalField,
} from '@clinic/shared';
import { AsyncView, Button, ConfirmDialog, DateTimeText, Dialog, DiscardChangesDialog, formatDateTime, SemanticChip, useSnackbar } from '@clinic/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBlocker, useNavigate } from '@tanstack/react-router';
import { ArrowRight, Circle, CircleCheck, HeartPulse, Pencil, Send, ShieldAlert } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';
import { api, type ApiError } from '../../lib/api.ts';
import { encounterMessage, isVersionConflict, VERSION_CONFLICT_TEXT } from '../../lib/encounters.ts';
import { heightText } from '../../lib/nursing.ts';
import { useMe } from '../../lib/session.ts';
import { unsavedChanges, useUnsavedChanges } from '../../lib/unsaved.ts';
import { AssessmentForm, AssessmentSection } from './assessment-form.tsx';
import { VitalsForm } from './vitals-form.tsx';

// S-CLI-13 Sección «Enfermería» de la visita (T-022), con S-CLI-14 a 16 y S-CLI-26.
//  - Vista limitada (Recepción): solo fechas, nunca valores (la API no los envía).
//  - Vista completa: signos vitales y valoración en lectura o en edición. En
//    «Esperando enfermería» y «Con enfermería» los formularios se abren ya en
//    edición para quien puede editarlos; en los demás estados, con «Editar».
//    En Caja y con la visita cerrada: solo lectura.
//  - El texto clínico de la lectura no se selecciona (manual, HIPAA).
//  - «Enviar al proveedor» (ADR 0003): un solo botón. Sin peso ni presión no
//    se ofrece «Continuar» (el servidor lo rechazaría): «Ir a signos vitales»
//    y, para el Propietario o el Administrador con rol clínico, «Enviar con
//    excepción…» con motivo (ADR 0033). Con cambios sin guardar, primero se guarda.
//  - Cambios sin guardar: «¿Descartar cambios sin guardar?» al salir (menú,
//    atrás) o al cambiar de sede.

const STAGE = new Set(['WAITING_FOR_NURSE', 'WITH_NURSE']);

export function NursingSection({ encounter, sede }: { encounter: EncounterDetail; sede: string }) {
  const query = useQuery<NursingSectionData, ApiError>({
    queryKey: ['nursing', encounter.id],
    queryFn: () => api.nursingSection(encounter.id),
    staleTime: 0,
    gcTime: 0,
  });
  return (
    <AsyncView source={query}>
      {(data) => (data.view === 'limited' ? <LimitedView data={data} encounter={encounter} sede={sede} /> : <FullView data={data} encounter={encounter} sede={sede} />)}
    </AsyncView>
  );
}

function useReload(encounterId: string) {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['nursing', encounterId] }),
      queryClient.invalidateQueries({ queryKey: ['encounter', encounterId] }),
      queryClient.invalidateQueries({ queryKey: ['nursing-queue'] }),
    ]);
  };
}

function savedText(startedNursing: boolean, base: string): string {
  return startedNursing ? `${base} Enfermería iniciada: la visita está ahora con enfermería.` : base;
}

/** S-CLI-13, vista limitada: tres filas con su fecha y la nota del manual. */
function LimitedView({ data, encounter, sede }: { data: NursingSectionData; encounter: EncounterDetail; sede: string }) {
  const tz = encounter.location.timezone;
  const row = (label: string, at: string | null, done: string, pending: string) => (
    <li className="flex items-center gap-space-sm">
      {at ? <CircleCheck aria-hidden className="size-5 shrink-0 text-status-completed" /> : <Circle aria-hidden className="size-5 shrink-0 text-on-surface-variant" />}
      <span className="text-body-md-medium text-on-surface">{label}</span>
      <span className="text-body-md text-on-surface-variant">{at ? `${done} ${formatDateTime(at, tz)}` : pending}</span>
    </li>
  );
  return (
    <div className="flex flex-col gap-space-md" data-testid="nursing-limited">
      <ul className="flex flex-col gap-space-sm">
        {row('Signos vitales', data.summary.vitalsAt, 'Registrado', 'Sin registrar')}
        {row('Valoración', data.summary.assessmentAt, 'Actualizado', 'Sin registrar')}
        {row('Enfermería completada', data.summary.completedAt, 'Completado', 'Pendiente')}
      </ul>
      <p className="text-caption text-on-surface-variant">Los valores clínicos solo son visibles para el personal clínico.</p>
      <SendToProvider data={data} encounter={encounter} sede={sede} dirty={false} onGoToVitals={null} />
    </div>
  );
}

function FullView({ data, encounter, sede }: { data: NursingSectionData; encounter: EncounterDetail; sede: string }) {
  const snackbar = useSnackbar();
  const reload = useReload(encounter.id);
  const stage = STAGE.has(data.status);
  // null: el modo inicial según el estado; true/false: lo eligió la persona («Editar» / «Cancelar»).
  const [vitalsOpen, setVitalsOpen] = useState<boolean | null>(null);
  const [assessmentOpen, setAssessmentOpen] = useState<boolean | null>(null);
  const [vitalsToken, setVitalsToken] = useState(0);
  const [assessmentToken, setAssessmentToken] = useState(0);
  const [vitalsDirty, setVitalsDirty] = useState(false);
  const [assessmentDirty, setAssessmentDirty] = useState(false);
  const dirty = vitalsDirty || assessmentDirty;
  useUnsavedChanges(dirty);
  const blocker = useBlocker({ shouldBlockFn: () => unsavedChanges.isDirty(), enableBeforeUnload: () => unsavedChanges.isDirty(), withResolver: true });

  const editingVitals = data.abilities.editVitals && (vitalsOpen ?? stage);
  const editingAssessment = data.abilities.editAssessment && (assessmentOpen ?? stage);
  const onVitalsDirty = useCallback((value: boolean) => { setVitalsDirty(value); }, []);
  const onAssessmentDirty = useCallback((value: boolean) => { setAssessmentDirty(value); }, []);

  const handle = async (work: () => Promise<{ startedNursing: boolean }>, base: string, onConflict: () => void, after: () => void): Promise<string | null> => {
    try {
      const saved = await work();
      snackbar({ message: savedText(saved.startedNursing, base) });
      after();
      await reload();
      return null;
    } catch (error) {
      if (isVersionConflict(error)) {
        snackbar({ message: VERSION_CONFLICT_TEXT });
        onConflict();
        await reload();
        return null;
      }
      return encounterMessage(error);
    }
  };

  const saveVitals = (changes: Partial<Record<VitalField, number | null>>, expectedVersion: number) =>
    handle(
      () => api.saveVitals(encounter.id, { changes, expectedVersion }),
      'Signos vitales guardados.',
      () => { setVitalsToken((t) => t + 1); },
      () => { if (!stage) setVitalsOpen(false); },
    );
  const saveAssessment = (input: SaveAssessmentInput) =>
    handle(
      () => api.saveAssessment(encounter.id, input),
      'Valoración guardada.',
      () => { setAssessmentToken((t) => t + 1); },
      () => { if (!stage) setAssessmentOpen(false); },
    );

  const tz = encounter.location.timezone;
  return (
    <div className="flex flex-col gap-space-lg">
      {data.summary.completedAt ? <SemanticChip tone="success" label={`Completado ${formatDateTime(data.summary.completedAt, tz)}`} className="self-start" /> : null}

      <Block
        title="Signos vitales"
        subtitle={data.vitals ? <>Registrado <DateTimeText value={data.vitals.updatedAt} timeZone={tz} /></> : null}
        canEdit={data.abilities.editVitals && !editingVitals}
        onEdit={() => { setVitalsOpen(true); }}
        editLabel="Editar signos vitales"
      >
        {editingVitals ? (
          <VitalsForm
            saved={data.vitals}
            resetToken={vitalsToken}
            onSave={saveVitals}
            onDirtyChange={onVitalsDirty}
            {...(stage ? {} : { onCancel: () => { setVitalsOpen(false); } })}
          />
        ) : data.vitals ? (
          <VitalsSummary vitals={data.vitals} />
        ) : (
          <p className="text-body-md text-on-surface-variant">Aún no se registraron signos vitales.</p>
        )}
      </Block>

      <hr className="border-outline-variant" />

      <Block
        title="Valoración"
        subtitle={data.assessment?.updatedAt ? <>Actualizado <DateTimeText value={data.assessment.updatedAt} timeZone={tz} /></> : null}
        canEdit={data.abilities.editAssessment && !editingAssessment}
        onEdit={() => { setAssessmentOpen(true); }}
        editLabel="Editar valoración"
      >
        {editingAssessment ? (
          <AssessmentForm
            history={data.history}
            assessment={data.assessment}
            resetToken={assessmentToken}
            onSave={saveAssessment}
            onDirtyChange={onAssessmentDirty}
            {...(stage ? {} : { onCancel: () => { setAssessmentOpen(false); } })}
          />
        ) : (
          <AssessmentSummary data={data} />
        )}
      </Block>

      <SendToProvider
        data={data}
        encounter={encounter}
        sede={sede}
        dirty={dirty}
        onGoToVitals={
          data.abilities.editVitals
            ? () => {
                setVitalsOpen(true);
                requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-vital="weightLb"]')?.focus());
              }
            : null
        }
      />

      <DiscardChangesDialog
        open={blocker.status === 'blocked'}
        onOpenChange={(open) => { if (!open && blocker.status === 'blocked') blocker.reset(); }}
        onDiscard={() => {
          unsavedChanges.set(false);
          if (blocker.status === 'blocked') blocker.proceed();
        }}
      />
    </div>
  );
}

function Block({ title, subtitle, canEdit, onEdit, editLabel, children }: { title: string; subtitle: ReactNode; canEdit: boolean; onEdit: () => void; editLabel: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-space-md">
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex flex-col">
          <h3 className="text-headline-sm text-on-surface">{title}</h3>
          {subtitle ? <p className="text-caption text-on-surface-variant">{subtitle}</p> : null}
        </div>
        {canEdit ? (
          <Button variant="tonal" onClick={onEdit} aria-label={editLabel}>
            <Pencil aria-hidden className="size-5" /> Editar
          </Button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Lectura de los signos vitales en rejilla (S-CLI-13); no se selecciona. */
function VitalsSummary({ vitals }: { vitals: NursingVitals }) {
  const v = vitals.values;
  const unit = (field: VitalField, value: number | null) => (value === null ? '—' : `${String(value)} ${VITAL_RULES[field].unit}`);
  const items: [string, string][] = [
    ['Peso', unit('weightLb', v.weightLb)],
    ['Estatura', v.heightIn === null ? '—' : heightText(v.heightIn)],
    ['IMC', vitals.bmi === null ? '—' : String(vitals.bmi)],
    ['Presión arterial', v.systolic !== null && v.diastolic !== null ? `${String(v.systolic)}/${String(v.diastolic)} mmHg` : v.systolic !== null ? `${String(v.systolic)}/— mmHg` : '—'],
    ['Pulso', unit('pulse', v.pulse)],
    ['Respiraciones', unit('respirations', v.respirations)],
    ['Temperatura', unit('temperatureF', v.temperatureF)],
    ['SpO2', unit('spo2', v.spo2)],
    ['Glucosa', unit('glucose', v.glucose)],
    ['Dolor', v.pain === null ? '—' : `${String(v.pain)} / 10`],
  ];
  return (
    <dl className="grid grid-cols-2 gap-space-sm select-none tab:grid-cols-3 desk:grid-cols-5" data-testid="vitals-summary">
      {items.map(([label, value]) => (
        <div key={label} className="flex flex-col rounded-md bg-surface-container-low p-space-sm dark:bg-surface-container">
          <dt className="text-caption text-on-surface-variant">{label}</dt>
          <dd className="font-mono text-code-md text-on-surface tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Lectura de la valoración: un desplegable por apartado (abierto «Síntomas / motivo de consulta»). */
function AssessmentSummary({ data }: { data: NursingSectionData }) {
  const value = (field: AssessmentField): string | null =>
    (HISTORY_FIELDS as readonly string[]).includes(field) ? (data.history?.fields[field as (typeof HISTORY_FIELDS)[number]] ?? null) : (data.assessment?.fields[field as (typeof VISIT_ASSESSMENT_FIELDS)[number]] ?? null);
  const empty = [...HISTORY_FIELDS, ...VISIT_ASSESSMENT_FIELDS].every((f) => value(f) === null) && data.history?.allergyStatus !== 'none_known';
  if (empty) return <p className="text-body-md text-on-surface-variant">Aún no se registró la valoración.</p>;
  return (
    <div className="flex flex-col gap-space-sm">
      {[...HISTORY_FIELDS, ...VISIT_ASSESSMENT_FIELDS].map((field) => {
        const text = value(field);
        const status = field === 'allergies' && data.history?.allergyStatus !== 'recorded' ? ALLERGY_STATUS_LABELS[data.history?.allergyStatus ?? 'not_recorded'] : text === null ? 'Sin registrar' : undefined;
        return (
          <AssessmentSection key={field} field={field} initiallyOpen={field === 'symptoms' && text !== null} {...(status ? { status } : {})}>
            <p className="text-body-md break-words whitespace-pre-line text-on-surface select-none">{text ?? (status ?? ASSESSMENT_LABELS[field])}</p>
          </AssessmentSection>
        );
      })}
    </div>
  );
}

/** S-CLI-16 «Enviar al proveedor» y la excepción del ADR 0033. */
function SendToProvider({
  data,
  encounter,
  sede,
  dirty,
  onGoToVitals,
}: {
  data: NursingSectionData;
  encounter: EncounterDetail;
  sede: string;
  dirty: boolean;
  onGoToVitals: (() => void) | null;
}) {
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const me = useMe();
  const reload = useReload(encounter.id);
  const [dialog, setDialog] = useState<null | 'confirm' | 'missing' | 'exception'>(null);
  const { abilities } = data;
  const regular = abilities.sendToProvider && data.hasRequiredVitals;
  const offerException = abilities.sendException && !data.hasRequiredVitals;
  if (!abilities.sendToProvider && !offerException) return null;

  const send = async (reason?: string) => {
    try {
      await api.sendToProvider(encounter.id, { expectedVersion: data.encounterVersion, ...(reason ? { reason } : {}) });
      setDialog(null);
      snackbar({ message: 'Enviado al proveedor.' });
      await reload();
      if (me.data?.permissions.includes('nursing_queue.access')) void navigate({ to: '/app/$sede/$destino', params: { sede, destino: 'cola-enfermeria' } });
    } catch (error) {
      setDialog(null);
      snackbar({ message: isVersionConflict(error) ? VERSION_CONFLICT_TEXT : encounterMessage(error) });
      await reload();
    }
  };

  return (
    <div className="flex flex-col items-end gap-space-xs border-t border-outline-variant pt-space-md">
      <Button disabled={dirty} onClick={() => { setDialog(regular ? 'confirm' : abilities.sendToProvider ? 'missing' : 'exception'); }}>
        {regular || abilities.sendToProvider ? (
          <>
            <Send aria-hidden className="size-5" /> Enviar al proveedor
          </>
        ) : (
          <>
            <ShieldAlert aria-hidden className="size-5" /> Enviar con excepción…
          </>
        )}
      </Button>
      {dirty ? <p className="text-caption text-on-surface-variant">Guarde los cambios antes de enviar al proveedor.</p> : null}

      <ConfirmDialog
        open={dialog === 'confirm'}
        onOpenChange={(open) => { if (!open) setDialog(null); }}
        icon={<Send className="size-7" />}
        title="¿Enviar al proveedor?"
        description="El paciente pasará a la cola del proveedor."
        confirmLabel="Enviar al proveedor"
        onConfirm={() => send()}
      />
      <Dialog
        open={dialog === 'missing'}
        onOpenChange={(open) => { if (!open) setDialog(null); }}
        icon={<HeartPulse className="size-7" />}
        title="Sin signos vitales"
        description="Se requiere peso o presión arterial antes de enviar al proveedor."
        footer={
          <>
            <Button variant="tonal" className="text-on-surface" onClick={() => { setDialog(null); }}>
              Cancelar
            </Button>
            {abilities.sendException ? (
              <Button variant="outline" onClick={() => { setDialog('exception'); }}>
                <ShieldAlert aria-hidden className="size-5" /> Enviar con excepción…
              </Button>
            ) : null}
            {onGoToVitals ? (
              <Button
                onClick={() => {
                  setDialog(null);
                  onGoToVitals();
                }}
              >
                Ir a signos vitales <ArrowRight aria-hidden className="size-5" />
              </Button>
            ) : null}
          </>
        }
      />
      <ConfirmDialog
        open={dialog === 'exception'}
        onOpenChange={(open) => { if (!open) setDialog(null); }}
        dismissible={false}
        icon={<ShieldAlert className="size-7" />}
        title="Enviar con excepción"
        description="Sin peso ni presión arterial guardados. El envío queda en el historial de la visita como excepción, con su motivo."
        confirmLabel="Enviar al proveedor"
        reason={{ label: 'Motivo', hint: 'Máximo 500 caracteres' }}
        onConfirm={(reason) => send(reason)}
      />
    </div>
  );
}

