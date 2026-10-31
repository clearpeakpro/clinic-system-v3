import {
  formatPhone,
  PATIENT_NAME_MAX,
  phoneDigits,
  reasonSchema,
  REFERRAL_DETAILS_MAX,
  updatePatientSchema,
  type CatalogList,
  type DuplicateCandidate,
  type PatientProfile,
  type UpdatePatientInput,
} from '@clinic/shared';
import { Banner, Button, ConfirmDialog, Dialog, DiscardChangesDialog, Field, SelectField, TextAreaField } from '@clinic/ui';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Pencil, Phone, RefreshCw, Share2, UserCheck, UserX } from 'lucide-react';
import { useId, useRef, useState, type SubmitEvent } from 'react';
import { api, ApiError } from '../../lib/api.ts';
import { patientMessage } from '../../lib/patients.ts';
import { SharedPhoneDialog } from './new-patient-dialog.tsx';

// S-PAC-11 «Editar paciente» (Stitch no tiene captura: mismo estilo que
// S-PAC-02). Campos de la ficha y de T-013: nombre, apellido, teléfono y
// referido; la fecha de nacimiento solo la cambian el Propietario o el
// Administrador con rol clínico, con motivo (ADR 0009). Se envían solo los
// campos cambiados con la versión leída; si otro usuario lo cambió antes,
// S-PAC-12 «Actualizado por otro usuario», sin «guardar igualmente». Si el
// teléfono nuevo ya está en otro paciente, el mismo aviso del alta con
// «Guardar de todos modos» (ADR 0030), solo al pulsar «Guardar». Al pie,
// «Inactivar paciente» o «Reactivar paciente» para quien puede (ADR 0009).

/** Lo que puede hacer quien edita, según sus permisos en la sede activa. */
export interface PatientEditScope {
  /** Nombre, apellidos, teléfono y referido (Recepción). */
  edit: boolean;
  /** Solo el teléfono (Proveedor). */
  editPhone: boolean;
  /** Fecha de nacimiento, con motivo (Propietario o Administrador con rol clínico). */
  editBirthDate: boolean;
  /** Inactivar y reactivar (ídem). */
  deactivate: boolean;
}

/** ¿Ve «Editar»? */
export function canOpenEditor(scope: PatientEditScope): boolean {
  return scope.edit || scope.editPhone || scope.editBirthDate || scope.deactivate;
}

interface Values {
  firstName: string;
  lastName: string;
  birthDate: string;
  birthDateReason: string;
  phone: string;
  referralSourceId: string;
  referralDetails: string;
}

function initialValues(p: PatientProfile): Values {
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    birthDate: p.birthDate,
    birthDateReason: '',
    phone: p.phone ? formatPhone(p.phone) : '',
    referralSourceId: p.referralSource?.id ?? '',
    referralDetails: p.referralDetails ?? '',
  };
}

export function EditPatientDialog({
  patient,
  scope,
  onClose,
  onSaved,
  onConflict,
  onStatusChange,
}: {
  patient: PatientProfile;
  scope: PatientEditScope;
  onClose: () => void;
  onSaved: () => void;
  /** 409 version_conflict: el perfil muestra S-PAC-12. */
  onConflict: () => void;
  /** «Inactivar paciente» / «Reactivar paciente»: cierra el editor y abre su diálogo con motivo. */
  onStatusChange: () => void;
}) {
  const catalog = useQuery<CatalogList, ApiError>({ queryKey: ['catalog'], queryFn: api.catalog, enabled: scope.edit });
  const activeSources = catalog.data?.items['referral-sources'] ?? [];
  // La fuente actual aunque ya no esté activa, para no perderla al abrir.
  const current = patient.referralSource;
  const sources = current && !activeSources.some((s) => s.id === current.id) ? [current, ...activeSources] : activeSources;
  const initial = initialValues(patient);
  const [values, setValues] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [phoneMatches, setPhoneMatches] = useState<DuplicateCandidate[] | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<null | 'close' | 'status'>(null);
  const phoneId = useId();
  /** «Volver y corregir»: al cerrar el aviso, el foco va al teléfono. */
  const focusPhone = useRef(false);
  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  const birthDateChanged = values.birthDate !== initial.birthDate;
  const phoneChanged = phoneDigits(values.phone) !== phoneDigits(initial.phone);
  const referralChanged =
    values.referralSourceId !== initial.referralSourceId ||
    (values.referralSourceId !== '' && values.referralDetails.trim() !== initial.referralDetails.trim());
  const dirty =
    values.firstName.trim() !== initial.firstName ||
    values.lastName.trim() !== initial.lastName ||
    birthDateChanged ||
    phoneChanged ||
    referralChanged;

  const errors: Partial<Record<keyof Values, string>> = {};
  if (values.firstName.trim() === '') errors.firstName = 'Este campo es obligatorio.';
  if (values.lastName.trim() === '') errors.lastName = 'Este campo es obligatorio.';
  if (birthDateChanged) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.birthDate) || values.birthDate < '1900-01-01') errors.birthDate = 'La fecha no es válida.';
    else if (values.birthDate > patient.today) errors.birthDate = 'La fecha de nacimiento no puede ser futura.';
    if (!reasonSchema.safeParse(values.birthDateReason).success) errors.birthDateReason = 'Se requiere un motivo.';
  }
  const digits = phoneDigits(values.phone);
  if (values.phone.trim() !== '' && (digits.length < 7 || digits.length > 15)) errors.phone = 'Ingrese un teléfono válido (al menos 7 dígitos).';
  const shown = (key: keyof Values) => (submitted ? (errors[key] ?? null) : null);

  const requestClose = () => {
    if (busy) return;
    if (dirty) setConfirmDiscard('close');
    else onClose();
  };
  const requestStatusChange = () => {
    if (dirty) setConfirmDiscard('status');
    else onStatusChange();
  };

  const save = async (confirmSharedPhone = false) => {
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    // Sin cambios: cierra sin llamar al servidor (S-PAC-11).
    if (!dirty) {
      onClose();
      return;
    }
    const input: UpdatePatientInput = { expectedVersion: patient.version, confirmSharedPhone };
    if (values.firstName.trim() !== initial.firstName) input.firstName = values.firstName;
    if (values.lastName.trim() !== initial.lastName) input.lastName = values.lastName;
    if (birthDateChanged) {
      input.birthDate = values.birthDate;
      input.birthDateReason = values.birthDateReason;
    }
    if (phoneChanged) input.phone = values.phone.trim() === '' ? null : values.phone;
    if (referralChanged) {
      input.referral = {
        sourceId: values.referralSourceId === '' ? null : values.referralSourceId,
        details: values.referralSourceId === '' || values.referralDetails.trim() === '' ? null : values.referralDetails,
      };
    }
    if (!updatePatientSchema.safeParse(input).success) {
      setServerError('Algunos campos no son válidos. Revíselos.');
      return;
    }
    setBusy(true);
    setServerError(null);
    try {
      await api.updatePatient(patient.id, input);
      onSaved();
    } catch (error) {
      setPhoneMatches(null);
      if (error instanceof ApiError && error.code === 'version_conflict') {
        onConflict();
        return;
      }
      if (error instanceof ApiError && error.code === 'phone_shared') {
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
    api.phoneSharedBack({ phone: values.phone, patientId: patient.id }).catch((error: unknown) => {
      setServerError(patientMessage(error));
    });
  };

  const identityLocked = busy || !scope.edit;
  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => { if (!next) requestClose(); }}
        dismissible={false}
        wide
        fullScreenOnPhone
        icon={<Pencil className="size-7" />}
        title="Editar paciente"
        footer={
          <>
            {scope.deactivate ? (
              <Button variant="text" className="tab:mr-auto" disabled={busy} onClick={requestStatusChange}>
                {patient.status === 'active' ? (
                  <>
                    <UserX aria-hidden className="size-5" /> Inactivar paciente
                  </>
                ) : (
                  <>
                    <UserCheck aria-hidden className="size-5" /> Reactivar paciente
                  </>
                )}
              </Button>
            ) : null}
            <Button variant="tonal" className="text-on-surface" disabled={busy} onClick={requestClose}>
              Cancelar
            </Button>
            <Button type="submit" form="edit-patient-form" loading={busy}>
              Guardar
            </Button>
          </>
        }
      >
        <form
          id="edit-patient-form"
          noValidate
          onSubmit={(e: SubmitEvent<HTMLFormElement>) => {
            e.preventDefault();
            void save();
          }}
          className="flex flex-col gap-space-md"
        >
          <div aria-live="polite">{serverError ? <Banner tone="error" title={serverError} /> : null}</div>
          {!scope.edit && scope.editPhone ? <p className="text-body-md text-on-surface-variant">Su rol solo puede actualizar el teléfono.</p> : null}
          <div className="grid gap-space-md tab:grid-cols-2">
            <Field
              label="Nombre"
              hint="Requerido"
              autoComplete="off"
              maxLength={PATIENT_NAME_MAX}
              value={values.firstName}
              disabled={identityLocked}
              error={shown('firstName')}
              onChange={(e) => { set('firstName', e.target.value); }}
            />
            <Field
              label="Apellido"
              hint="Requerido"
              autoComplete="off"
              maxLength={PATIENT_NAME_MAX}
              value={values.lastName}
              disabled={identityLocked}
              error={shown('lastName')}
              onChange={(e) => { set('lastName', e.target.value); }}
            />
          </div>
          <Field
            label="Fecha de nacimiento"
            hint={scope.editBirthDate ? 'Cambiarla exige un motivo' : 'Solo la cambia un Administrador o el Propietario'}
            type="date"
            min="1900-01-01"
            max={patient.today}
            icon={<CalendarDays className="size-5" />}
            value={values.birthDate}
            disabled={busy || !scope.editBirthDate}
            error={shown('birthDate')}
            onChange={(e) => { set('birthDate', e.target.value); }}
          />
          {birthDateChanged ? (
            <TextAreaField
              label="Motivo del cambio de fecha"
              hint="Requerido; queda en la auditoría"
              required
              rows={2}
              maxLength={500}
              value={values.birthDateReason}
              disabled={busy}
              error={shown('birthDateReason')}
              onChange={(e) => { set('birthDateReason', e.target.value); }}
            />
          ) : null}
          <Field
            id={phoneId}
            label="Teléfono"
            hint="Opcional"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="(555) 000-0000"
            icon={<Phone className="size-5" />}
            value={values.phone}
            disabled={busy || (!scope.edit && !scope.editPhone)}
            error={shown('phone')}
            onChange={(e) => { set('phone', e.target.value); }}
          />
          <SelectField
            label="Fuente de referido"
            icon={<Share2 className="size-5" />}
            value={values.referralSourceId}
            disabled={identityLocked}
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
            hint={values.referralSourceId === '' ? 'Sin fuente de referido no hay detalles.' : 'Notas adicionales'}
            rows={2}
            maxLength={REFERRAL_DETAILS_MAX}
            value={values.referralSourceId === '' ? '' : values.referralDetails}
            disabled={identityLocked || values.referralSourceId === ''}
            onChange={(e) => { set('referralDetails', e.target.value); }}
          />
        </form>
      </Dialog>
      {phoneMatches ? (
        <SharedPhoneDialog
          matches={phoneMatches}
          busy={busy}
          confirmLabel="Guardar de todos modos"
          onBack={backToForm}
          onConfirm={() => void save(true)}
          onCloseAutoFocus={(event) => {
            if (!focusPhone.current) return;
            focusPhone.current = false;
            event.preventDefault();
            document.getElementById(phoneId)?.focus();
          }}
        />
      ) : null}
      <DiscardChangesDialog
        open={confirmDiscard !== null}
        onOpenChange={(open) => { if (!open) setConfirmDiscard(null); }}
        onDiscard={() => {
          if (confirmDiscard === 'status') onStatusChange();
          else onClose();
        }}
      />
    </>
  );
}

/** S-PAC-12 «Actualizado por otro usuario»: un solo botón, «Actualizar»; lo escrito se pierde. */
export function VersionConflictDialog({ onRefresh }: { onRefresh: () => void }) {
  return (
    <Dialog
      open
      onOpenChange={() => undefined}
      dismissible={false}
      icon={<RefreshCw className="size-7" />}
      title="Actualizado por otro usuario"
      description="Otro usuario actualizó este paciente. Actualice el registro para continuar."
      footer={<Button onClick={onRefresh}>Actualizar</Button>}
    />
  );
}

/** Inactivar o reactivar (ADR 0009), con motivo obligatorio. Otros errores: se cierra y el perfil avisa. */
export function PatientStatusDialog({
  patient,
  onClose,
  onDone,
  onConflict,
  onError,
}: {
  patient: PatientProfile;
  onClose: () => void;
  onDone: () => void;
  onConflict: () => void;
  onError: (message: string) => void;
}) {
  const deactivating = patient.status === 'active';
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      dismissible={false}
      destructive={deactivating}
      icon={deactivating ? <UserX className="size-7" /> : <UserCheck className="size-7" />}
      title={deactivating ? 'Inactivar paciente' : 'Reactivar paciente'}
      description={
        deactivating
          ? 'Un paciente inactivo no aparece en la búsqueda por defecto y no se le pueden agendar citas.'
          : 'El paciente volverá a aparecer en la búsqueda y se le podrán agendar citas.'
      }
      confirmLabel={deactivating ? 'Inactivar' : 'Reactivar'}
      reason={{ label: 'Motivo', hint: 'Requerido; queda en la auditoría' }}
      onConfirm={async (reason) => {
        try {
          if (deactivating) await api.deactivatePatient(patient.id, reason ?? '', patient.version);
          else await api.reactivatePatient(patient.id, reason ?? '', patient.version);
          onDone();
        } catch (e) {
          if (e instanceof ApiError && e.code === 'version_conflict') onConflict();
          else onError(patientMessage(e));
        }
      }}
    />
  );
}
