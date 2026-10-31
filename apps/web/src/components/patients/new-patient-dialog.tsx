import { createPatientSchema, PATIENT_NAME_MAX, REFERRAL_DETAILS_MAX, type CatalogList, type CreatedPatient, type DuplicateCandidate } from '@clinic/shared';
import { Banner, Button, Dialog, DiscardChangesDialog, Field, SelectField, TextAreaField } from '@clinic/ui';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ExternalLink, Phone, Share2, TriangleAlert, UserPlus } from 'lucide-react';
import { useId, useRef, useState, type SubmitEvent } from 'react';
import { api, ApiError } from '../../lib/api.ts';
import { formatDay } from '../../lib/catalog.ts';
import { patientMessage } from '../../lib/patients.ts';

// S-PAC-02 «Nuevo paciente» (Stitch: design/stitch/pacientes/S-PAC-02_nuevo_paciente),
// con S-PAC-03 «Posible paciente existente» dentro del diálogo, arriba, como
// en Stitch, y S-PAC-04 al salir con cambios (DiscardChangesDialog de T-005).
// Si no hay posible duplicado pero el teléfono ya está en otro paciente, un
// diálogo informativo pide confirmarlo (ADR 0030); solo al pulsar «Crear».
// Campos del manual: Nombre, Apellido, Fecha de nacimiento, Teléfono, Fuente
// y Detalles del referido. No se construye lo que el sistema no tiene
// («EXP-ADM-01») ni textos que afirmen cumplimiento de normas.

interface Values {
  firstName: string;
  lastName: string;
  birthDate: string;
  phone: string;
  referralSourceId: string;
  referralDetails: string;
}

const EMPTY: Values = { firstName: '', lastName: '', birthDate: '', phone: '', referralSourceId: '', referralDetails: '' };

export function NewPatientDialog({
  today,
  onClose,
  onCreated,
  onOpenExisting,
}: {
  /** Hoy en la sede activa: la fecha de nacimiento no puede ser posterior. */
  today: string;
  onClose: () => void;
  onCreated: (created: CreatedPatient) => void;
  onOpenExisting: (patientId: string) => void;
}) {
  const catalog = useQuery<CatalogList, ApiError>({ queryKey: ['catalog'], queryFn: api.catalog });
  const sources = catalog.data?.items['referral-sources'] ?? [];
  const [values, setValues] = useState(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DuplicateCandidate[] | null>(null);
  const [phoneMatches, setPhoneMatches] = useState<DuplicateCandidate[] | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const phoneId = useId();
  /** «Volver y corregir»: al cerrar el aviso, el foco va al teléfono. */
  const focusPhone = useRef(false);
  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    // Con otros datos, el aviso de duplicado ya no corresponde.
    setCandidates(null);
  };

  const errors: Partial<Record<keyof Values, string>> = {};
  if (values.firstName.trim() === '') errors.firstName = 'Este campo es obligatorio.';
  if (values.lastName.trim() === '') errors.lastName = 'Este campo es obligatorio.';
  if (values.birthDate === '') errors.birthDate = 'Seleccione la fecha de nacimiento.';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(values.birthDate) || values.birthDate < '1900-01-01') errors.birthDate = 'La fecha no es válida.';
  else if (values.birthDate > today) errors.birthDate = 'La fecha de nacimiento no puede ser futura.';
  const digits = values.phone.replace(/\D/g, '');
  if (values.phone.trim() !== '' && (digits.length < 7 || digits.length > 15)) errors.phone = 'Ingrese un teléfono válido (al menos 7 dígitos).';
  const dirty = (Object.keys(EMPTY) as (keyof Values)[]).some((k) => values[k] !== EMPTY[k]);
  const shown = (key: keyof Values) => (submitted ? (errors[key] ?? null) : null);

  const requestClose = () => {
    if (busy) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  const create = async ({ forceCreate = false, confirmSharedPhone = false } = {}) => {
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    const input = createPatientSchema.safeParse({
      firstName: values.firstName,
      lastName: values.lastName,
      birthDate: values.birthDate,
      phone: values.phone.trim() === '' ? null : values.phone,
      referralSourceId: values.referralSourceId === '' ? null : values.referralSourceId,
      referralDetails: values.referralSourceId === '' || values.referralDetails.trim() === '' ? null : values.referralDetails,
      forceCreate,
      confirmSharedPhone,
    });
    if (!input.success) {
      setServerError('Algunos campos no son válidos. Revíselos.');
      return;
    }
    setBusy(true);
    setServerError(null);
    try {
      onCreated(await api.createPatient(input.data));
    } catch (error) {
      setPhoneMatches(null);
      if (error instanceof ApiError && error.code === 'possible_duplicate') {
        setCandidates((error.details.candidates as DuplicateCandidate[] | undefined) ?? []);
      } else if (error instanceof ApiError && error.code === 'phone_shared') {
        setPhoneMatches((error.details.matches as DuplicateCandidate[] | undefined) ?? []);
      } else {
        setServerError(patientMessage(error));
      }
      setBusy(false);
    }
  };

  /** «Volver y corregir»: los datos quedan intactos; la elección se audita (el teléfono como HMAC). */
  const backToForm = () => {
    focusPhone.current = true;
    setPhoneMatches(null);
    api.phoneSharedBack({ phone: values.phone }).catch((error: unknown) => {
      setServerError(patientMessage(error));
    });
  };

  const openExisting = async (candidate: DuplicateCandidate) => {
    setBusy(true);
    try {
      // La elección se audita (T-012).
      await api.openExistingPatient(candidate.id);
      onOpenExisting(candidate.id);
    } catch (error) {
      setServerError(patientMessage(error));
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => { if (!next) requestClose(); }}
        dismissible={false}
        wide
        fullScreenOnPhone
        icon={<UserPlus className="size-7" />}
        title="Nuevo paciente"
        description="Ingrese los datos básicos del paciente para abrir su expediente."
        footer={
          <>
            <Button variant="tonal" className="text-on-surface" disabled={busy} onClick={requestClose}>
              Cancelar
            </Button>
            <Button type="submit" form="new-patient-form" loading={busy}>
              <UserPlus aria-hidden className="size-5" /> Crear
            </Button>
          </>
        }
      >
        <form id="new-patient-form" noValidate onSubmit={(e: SubmitEvent<HTMLFormElement>) => { e.preventDefault(); void create(); }} className="flex flex-col gap-space-md">
          <div aria-live="polite" className="flex flex-col gap-space-sm">
            {serverError ? <Banner tone="error" title={serverError} /> : null}
            {candidates ? <DuplicateNotice candidates={candidates} busy={busy} onOpen={(c) => void openExisting(c)} onForce={() => void create({ forceCreate: true })} /> : null}
          </div>
          <div className="grid gap-space-md tab:grid-cols-2">
            <Field
              label="Nombre"
              hint="Requerido"
              autoComplete="off"
              autoFocus
              maxLength={PATIENT_NAME_MAX}
              value={values.firstName}
              disabled={busy}
              error={shown('firstName')}
              onChange={(e) => { set('firstName', e.target.value); }}
            />
            <Field
              label="Apellido"
              hint="Requerido"
              autoComplete="off"
              maxLength={PATIENT_NAME_MAX}
              value={values.lastName}
              disabled={busy}
              error={shown('lastName')}
              onChange={(e) => { set('lastName', e.target.value); }}
            />
          </div>
          <Field
            label="Fecha de nacimiento"
            hint="Requerido"
            type="date"
            min="1900-01-01"
            max={today}
            icon={<CalendarDays className="size-5" />}
            value={values.birthDate}
            disabled={busy}
            error={shown('birthDate')}
            onChange={(e) => { set('birthDate', e.target.value); }}
          />
          <Field
            id={phoneId}
            label="Teléfono de contacto"
            hint="Opcional"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="(555) 000-0000"
            icon={<Phone className="size-5" />}
            value={values.phone}
            disabled={busy}
            error={shown('phone')}
            onChange={(e) => { set('phone', e.target.value); }}
          />
          <SelectField
            label="Fuente de referido"
            icon={<Share2 className="size-5" />}
            value={values.referralSourceId}
            disabled={busy}
            onChange={(e) => { set('referralSourceId', e.target.value); }}
          >
            <option value="">Ninguna</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
          {catalog.error ? <p className="-mt-space-sm text-caption text-error">No se pudieron cargar las fuentes de referido.</p> : null}
          <TextAreaField
            label="Detalles del referido"
            hint={values.referralSourceId === '' ? 'Elija primero una fuente de referido.' : 'Notas adicionales'}
            rows={2}
            maxLength={REFERRAL_DETAILS_MAX}
            placeholder="Nombre del especialista, clínica remitente o motivo de derivación…"
            value={values.referralDetails}
            disabled={busy || values.referralSourceId === ''}
            onChange={(e) => { set('referralDetails', e.target.value); }}
          />
        </form>
      </Dialog>
      {phoneMatches ? (
        <SharedPhoneDialog
          matches={phoneMatches}
          busy={busy}
          confirmLabel="Crear de todos modos"
          onBack={backToForm}
          onConfirm={() => void create({ confirmSharedPhone: true })}
          onCloseAutoFocus={(event) => {
            if (!focusPhone.current) return;
            focusPhone.current = false;
            event.preventDefault();
            document.getElementById(phoneId)?.focus();
          }}
        />
      ) : null}
      <DiscardChangesDialog open={confirmDiscard} onOpenChange={setConfirmDiscard} onDiscard={onClose} />
    </>
  );
}

/** S-PAC-03 «Posible paciente existente»: «Crear de todos modos» es la acción secundaria. */
function DuplicateNotice({
  candidates,
  busy,
  onOpen,
  onForce,
}: {
  candidates: DuplicateCandidate[];
  busy: boolean;
  onOpen: (candidate: DuplicateCandidate) => void;
  onForce: () => void;
}) {
  return (
    <section
      aria-labelledby="duplicate-title"
      className="flex flex-col gap-space-sm rounded-lg border border-status-waiting-border bg-status-waiting-container p-space-md text-status-waiting"
    >
      <div className="flex items-start gap-space-sm">
        <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
        <div className="flex flex-col gap-0.5">
          <h2 id="duplicate-title" className="text-body-lg-medium">
            Posible paciente existente
          </h2>
          <p className="text-body-md">Ya existe un paciente con un nombre parecido y la misma fecha de nacimiento. Abra el registro existente o cree uno nuevo de todos modos.</p>
        </div>
      </div>
      <ul className="flex flex-col divide-y divide-status-waiting-border">
        {candidates.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-space-sm py-space-xs">
            <span className="flex flex-col">
              <span className="text-body-md-medium">
                {c.firstName} {c.lastName}
              </span>
              <span className="font-mono text-code-sm">
                {formatDay(c.birthDate)} · Expediente {c.code}
              </span>
            </span>
            <Button variant="tonal" disabled={busy} aria-label={`Abrir existente: ${c.firstName} ${c.lastName}, ${c.code}`} onClick={() => { onOpen(c); }}>
              <ExternalLink aria-hidden className="size-5" /> Abrir existente
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Button variant="text" disabled={busy} className="text-status-waiting" onClick={onForce}>
          Crear de todos modos
        </Button>
      </div>
    </section>
  );
}

/**
 * Aviso informativo del teléfono compartido (ADR 0030): una familia puede
 * compartirlo, así que no es un error. La acción principal es «Crear de todos
 * modos» en el alta y «Guardar de todos modos» en la edición (S-PAC-11).
 */
export function SharedPhoneDialog({
  matches,
  busy,
  confirmLabel,
  onBack,
  onConfirm,
  onCloseAutoFocus,
}: {
  matches: DuplicateCandidate[];
  busy: boolean;
  confirmLabel: string;
  onBack: () => void;
  onConfirm: () => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(next) => { if (!next) onBack(); }}
      dismissible={!busy}
      icon={<Phone className="size-7" />}
      title="Este teléfono ya está registrado en otro paciente"
      description="Puede ser de un familiar. Revise si el número es correcto antes de continuar."
      onCloseAutoFocus={onCloseAutoFocus}
      footer={
        <>
          <Button variant="tonal" className="text-on-surface" disabled={busy} onClick={onBack}>
            Volver y corregir
          </Button>
          <Button loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <ul aria-label="Pacientes con este teléfono" className="flex flex-col divide-y divide-outline-variant rounded-md bg-surface-container-low px-space-md">
        {matches.map((m) => (
          <li key={m.id} className="flex flex-col py-space-xs">
            <span className="text-body-md-medium text-on-surface">
              {m.firstName} {m.lastName}
            </span>
            <span className="font-mono text-code-sm text-on-surface-variant">
              {m.code} · {formatDay(m.birthDate)}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
