import { ageLabel, ageOn, formatPhone } from '@clinic/shared';
import { AsyncView, CodeText, SemanticChip } from '@clinic/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Cake, Phone } from 'lucide-react';
import { api, type ApiError } from '../lib/api.ts';
import { formatDay } from '../lib/catalog.ts';
import { patientInitials } from '../lib/patients.ts';

// S-PAC-05 Perfil del paciente (Stitch: design/stitch/pacientes/S-PAC-05_perfil_del_paciente),
// solo el encabezado hasta T-013 (ADR 0030, decisión 2): «Volver a
// Pacientes», nombre, código, estado y «fecha (edad) · teléfono». Las
// pestañas, «Editar», «Fusionar con…» y «Nueva cita» llegan con T-013 y
// T-015. Cada apertura se audita en el servidor (patient.read). No se guarda
// en caché: cada visita vuelve a pedirlo.

export function PatientPage({ sede, patientId }: { sede: string; patientId: string }) {
  const patient = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => api.patient(patientId),
    staleTime: 0,
    gcTime: 0,
    retry: (failures: number, error: ApiError) => error.status >= 500 && failures < 2,
  });
  return (
    <section aria-labelledby="page-title" className="mx-auto flex w-full max-w-7xl flex-col gap-space-lg">
      <Link
        to="/app/$sede/pacientes"
        params={{ sede }}
        className="flex min-h-touch items-center gap-space-xs self-start rounded-md px-space-xs text-body-lg text-on-surface hover:bg-surface-container-low"
      >
        <ArrowLeft aria-hidden className="size-5" /> Volver a Pacientes
      </Link>
      <AsyncView source={patient} loading="skeleton">
        {(p) => (
          <header className="flex flex-wrap items-center gap-space-md rounded-lg bg-surface-container-lowest p-space-lg shadow-level-1 dark:bg-surface-container-low">
            <span aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-headline-sm text-secondary">
              {patientInitials(p.firstName, p.lastName)}
            </span>
            <div className="flex min-w-0 flex-col gap-space-xs">
              <div className="flex flex-wrap items-center gap-space-sm">
                <h1 id="page-title" className="text-display-md text-on-surface">
                  {p.firstName} {p.lastName}
                </h1>
                <CodeText code={p.code} />
                <SemanticChip tone={p.status === 'active' ? 'success' : 'neutral'} label={p.status === 'active' ? 'Activo' : 'Inactivo'} />
              </div>
              <p className="flex flex-wrap items-center gap-x-space-md gap-y-space-xs text-body-lg text-on-surface-variant">
                <span className="flex items-center gap-space-xs">
                  <Cake aria-hidden className="size-5" /> {formatDay(p.birthDate)} ({ageLabel(ageOn(p.birthDate, p.today))})
                </span>
                <span aria-hidden>•</span>
                <span className="flex items-center gap-space-xs">
                  <Phone aria-hidden className="size-5" /> {p.phone ? formatPhone(p.phone) : 'Teléfono no indicado'}
                </span>
              </p>
            </div>
          </header>
        )}
      </AsyncView>
    </section>
  );
}
