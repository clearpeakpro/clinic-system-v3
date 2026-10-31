import { parsePatientQuery } from '@clinic/shared';
import { Button, Field, FloatingPanel } from '@clinic/ui';
import { useNavigate } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { patientSearch, queryErrorText } from '../../lib/patients.ts';

// «Buscar pacientes» de la cabecera (Stitch, S-PAC-01; pendiente desde T-004).
// Abre un panel con el mismo campo único de la página Pacientes (ADR 0030) y,
// con Enter o «Buscar», lleva a Pacientes con la búsqueda hecha. La búsqueda
// vive solo en memoria, nunca en la URL. Solo con patients.access.

export function HeaderPatientSearch({ code }: { code: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parsePatientQuery(text);
    if (!parsed.ok) {
      setError(queryErrorText(parsed.error) ?? 'Escriba lo que quiere buscar.');
      return;
    }
    patientSearch.submit(text.trim());
    setOpen(false);
    setText('');
    void navigate({ to: '/app/$sede/pacientes', params: { sede: code } });
  };

  return (
    <FloatingPanel
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
      }}
      title="Buscar pacientes"
      trigger={
        <button
          type="button"
          className="flex h-12 items-center gap-space-sm rounded-md bg-surface-container-low px-space-md text-body-md text-on-surface hover:bg-surface-container dark:bg-surface-container-high"
          aria-label="Buscar pacientes"
        >
          <Search aria-hidden className="size-5 text-on-surface-variant" />
          <span className="hidden tab:inline">Buscar pacientes</span>
        </button>
      }
    >
      <form role="search" aria-label="Buscar pacientes" noValidate onSubmit={submit} className="flex flex-col gap-space-sm p-space-md">
        <Field
          label="Buscar paciente"
          icon={<Search className="size-5" />}
          autoComplete="off"
          spellCheck={false}
          autoFocus
          maxLength={200}
          placeholder="Nombre, MMDDAAAA, teléfono o P-000123"
          value={text}
          error={error}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
        />
        <Button type="submit" className="self-end">
          <Search aria-hidden className="size-5" /> Buscar
        </Button>
      </form>
    </FloatingPanel>
  );
}
