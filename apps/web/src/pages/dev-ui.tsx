import { VISIT_ROUTES, VISIT_STATUSES } from '@clinic/shared';
import {
  Button,
  ChipGroup,
  CodeField,
  CodeText,
  ConfirmDialog,
  DataTable,
  DateTimeText,
  DiscardChangesDialog,
  EmptyState,
  ErrorState,
  FilterChip,
  MoneyField,
  MoneyText,
  RefreshBar,
  RouteBadge,
  SegmentedControl,
  SelectField,
  SemanticChip,
  SkeletonRows,
  Spinner,
  StaleDataBanner,
  TextAreaField,
  useSnackbar,
  VisitStatusChip,
  type Column,
} from '@clinic/ui';
import type { VisitRoute, VisitStatus } from '@clinic/shared';
import { Check, Coffee, IdCard, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { IdleWarningDialog } from '../components/idle-guard.tsx';

/**
 * /dev/ui (T-005): todos los componentes compartidos en claro y oscuro, para
 * compararlos con la hoja de Stitch (design/stitch/componentes/S-GEN-30_hoja_componentes).
 * Solo existe en desarrollo (ver router.tsx). Datos de ejemplo ficticios.
 */

const TZ = 'America/Chicago';
const SAMPLE_TIME = '2026-10-28T20:15:00Z';
const noop = () => undefined;

interface Row {
  id: string;
  code: string;
  patient: string;
  arrival: string;
  status: VisitStatus;
  route: VisitRoute;
  balance: number;
}

const ROWS: Row[] = [
  { id: '1', code: 'P-000123', patient: 'Paciente Ficticio Uno', arrival: '2026-10-28T20:15:00Z', status: 'WAITING_FOR_NURSE', route: 'STANDARD', balance: 4500 },
  { id: '2', code: 'P-000452', patient: 'Paciente Ficticia Dos', arrival: '2026-10-28T19:50:00Z', status: 'WITH_NURSE', route: 'INJECTION_ONLY', balance: 0 },
  { id: '3', code: 'P-000881', patient: 'Paciente Ficticio Tres', arrival: '2026-10-28T19:25:00Z', status: 'READY_FOR_CHECKOUT', route: 'STANDARD', balance: -2500 },
];

const COLUMNS: Column<Row>[] = [
  {
    key: 'patient',
    header: 'Paciente',
    primary: true,
    cell: (r) => (
      <span className="flex flex-col">
        <span className="text-body-lg-medium">{r.patient}</span>
        <span className="font-mono text-code-sm text-on-surface-variant">{r.code}</span>
      </span>
    ),
  },
  { key: 'arrival', header: 'Llegada', cell: (r) => <DateTimeText value={r.arrival} timeZone={TZ} format="time" /> },
  {
    key: 'status',
    header: 'Estado y ruta',
    cell: (r) => (
      <span className="flex flex-wrap gap-space-xs">
        <VisitStatusChip status={r.status} />
        <RouteBadge route={r.route} />
      </span>
    ),
  },
  { key: 'balance', header: 'Saldo', align: 'end', cell: (r) => <MoneyText cents={r.balance} /> },
];

export function DevUiPage() {
  // La columna «claro» necesita la raíz en claro; la preferencia guardada no cambia.
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    root.classList.remove('dark');
    return () => {
      if (wasDark) root.classList.add('dark');
    };
  }, []);

  return (
    <main className="min-h-full bg-background px-margin py-space-lg">
      <header className="mb-space-xl flex flex-col gap-space-xs">
        <p className="self-start rounded-full bg-surface-container px-space-sm py-1 font-mono text-code-sm text-primary">/dev/ui · solo en desarrollo</p>
        <h1 className="text-display-md text-on-surface">Componentes compartidos</h1>
        <p className="text-body-lg text-on-surface-variant">
          Referencia: hoja de componentes de Stitch (S-GEN-30). Cada sección, en tema claro y oscuro.
        </p>
      </header>
      <div className="flex flex-col gap-space-xl">
        <Section n={1} title="Chips de estado de la visita">
          <div className="flex flex-wrap gap-space-sm">
            {VISIT_STATUSES.map((s) => <VisitStatusChip key={s} status={s} />)}
          </div>
          <p className="text-body-md text-on-surface-variant">Tonos generales (S-GEN-30):</p>
          <div className="flex flex-wrap gap-space-sm">
            <SemanticChip tone="neutral" label="Neutro" />
            <SemanticChip tone="info" label="Información" />
            <SemanticChip tone="success" label="Éxito" />
            <SemanticChip tone="warning" label="Advertencia" />
            <SemanticChip tone="danger" label="Peligro" />
          </div>
        </Section>

        <Section n={2} title="Insignias de ruta">
          <div className="flex flex-wrap gap-space-sm">
            {VISIT_ROUTES.map((r) => <RouteBadge key={r} route={r} />)}
          </div>
        </Section>

        <Section n={3} title="Estados de una lista y tabla">
          <Sub title="Tabla (desde 600 px; tarjetas en el teléfono)">
            <DataTable caption="Visitas de ejemplo" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />
          </Sub>
          <Sub title="a) Cargando: esqueleto (tablas y listas)">
            <SkeletonRows />
          </Sub>
          <Sub title="Cargando: spinner (lo demás)">
            <Spinner />
          </Sub>
          <Sub title="Refrescando con datos: barra de 2 px">
            <RefreshBar />
            <DataTable caption="Visitas de ejemplo (refrescando)" columns={COLUMNS} rows={ROWS.slice(0, 1)} rowKey={(r) => r.id} />
          </Sub>
          <Sub title="b) Vacío">
            <EmptyState
              icon={Coffee}
              title="No hay pacientes en cola"
              description="Cuando llegue alguien aparecerá aquí."
              action={
                <Button variant="tonal">
                  <RefreshCw aria-hidden className="size-5" /> Actualizar
                </Button>
              }
            />
            <DataTable caption="Tabla vacía" columns={COLUMNS} rows={[]} rowKey={(r) => r.id} />
          </Sub>
          <Sub title="c) Error sin datos">
            <ErrorState error={{ status: 503, code: 'service_unavailable' }} onRetry={noop} />
          </Sub>
          <Sub title="d) Error con datos previos">
            <StaleDataBanner error={new TypeError('fetch failed')} onRetry={noop} />
            <DataTable caption="Visitas de ejemplo (datos previos)" columns={COLUMNS} rows={ROWS.slice(0, 2)} rowKey={(r) => r.id} />
          </Sub>
        </Section>

        <Section n={4} title="Botones">
          <div className="grid gap-space-md tab:grid-cols-2 desk:grid-cols-3">
            <Button>
              <Check aria-hidden className="size-5" /> Principal
            </Button>
            <Button variant="tonal">Tonal</Button>
            <Button variant="outline">Contorno</Button>
            <Button variant="elevated">Elevado</Button>
            <Button variant="text">Texto</Button>
            <Button variant="destructive">
              <Trash2 aria-hidden className="size-5" /> Destructivo
            </Button>
            <Button loading loadingText="Guardando…">
              Guardar
            </Button>
            <Button disabled>Deshabilitado</Button>
          </div>
        </Section>

        <Section n={5} title="Diálogos de confirmación">
          <Dialogs />
        </Section>

        <Section n={6} title="Aviso de inactividad">
          <IdleWarningDialog inline open secondsLeft={45} onKeepAlive={noop} onSignOut={noop} />
        </Section>

        <Section n={7} title="Campos con formato, códigos y fechas">
          <Fields />
        </Section>

        <Section n={8} title="Formularios y avisos (T-006a)">
          <Forms />
        </Section>
      </div>
    </main>
  );
}

function Dialogs() {
  const [open, setOpen] = useState<null | 'reason' | 'discard'>(null);
  return (
    <>
      <div className="flex flex-col gap-space-lg">
        <ConfirmDialog
          inline
          open
          onOpenChange={noop}
          destructive
          title="¿Anular este cargo?"
          description="El cargo queda anulado con su motivo; no se borra."
          confirmLabel="Anular cargo"
          reason={{ label: 'Motivo de la anulación' }}
          onConfirm={noop}
        />
        <DiscardChangesDialog inline open onOpenChange={noop} onDiscard={noop} />
      </div>
      <div className="flex flex-wrap gap-space-sm">
        <Button variant="outline" onClick={() => { setOpen('reason'); }}>
          Abrir: confirmación con motivo
        </Button>
        <Button variant="outline" onClick={() => { setOpen('discard'); }}>
          Abrir: descartar cambios
        </Button>
      </div>
      <ConfirmDialog
        open={open === 'reason'}
        onOpenChange={(o) => { if (!o) setOpen(null); }}
        destructive
        title="¿Anular este cargo?"
        description="El cargo queda anulado con su motivo; no se borra."
        confirmLabel="Anular cargo"
        reason={{ label: 'Motivo de la anulación' }}
        onConfirm={noop}
      />
      <DiscardChangesDialog open={open === 'discard'} onOpenChange={(o) => { if (!o) setOpen(null); }} onDiscard={noop} />
    </>
  );
}

function Fields() {
  const [amount, setAmount] = useState('1,234.50');
  const [cents, setCents] = useState<number | null>(123450);
  const [code, setCode] = useState('NOR1');
  return (
    <div className="flex flex-col gap-space-lg">
      <Sub title="Dinero">
        <MoneyField
          label="Monto a cobrar"
          value={amount}
          onValueChange={(text, value) => {
            setAmount(text);
            setCents(value);
          }}
        />
        <p className="text-caption text-on-surface-variant">
          Centavos: <span className="font-mono">{cents === null ? '—' : String(cents)}</span>
        </p>
        <Row label="Saldo pendiente">
          <MoneyText cents={4500} emphasis />
        </Row>
        <Row label="Saldo a favor">
          <MoneyText cents={-2500} />
        </Row>
      </Sub>
      <Sub title="Códigos">
        <CodeText variant="block" code="P-000123" label="Código del paciente" icon={IdCard} copyable />
        <CodeText variant="block" code="NOR1-V-000210" label="Visita" />
        <p className="text-body-md text-on-surface">
          En un texto: <CodeText code="INJ_B12" />
        </p>
        <CodeField label="Código de sede" value={code} onChange={(e) => { setCode(e.target.value); }} />
      </Sub>
      <Sub title="Fecha y hora de la sede (hora Central)">
        <Row label="Fecha">
          <DateTimeText value={SAMPLE_TIME} timeZone={TZ} format="date" />
        </Row>
        <Row label="Hora">
          <DateTimeText value={SAMPLE_TIME} timeZone={TZ} format="time" />
        </Row>
        <Row label="Fecha y hora">
          <DateTimeText value={SAMPLE_TIME} timeZone={TZ} />
        </Row>
      </Sub>
    </div>
  );
}

function Forms() {
  const snackbar = useSnackbar();
  const [status, setStatus] = useState<'all' | 'invited' | 'active'>('all');
  const [roles, setRoles] = useState<string[]>(['Recepción']);
  const [reason, setReason] = useState('');
  return (
    <div className="flex flex-col gap-space-lg">
      <Sub title="Botones segmentados">
        <SegmentedControl
          label="Estado"
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'invited', label: 'Invitado' },
            { value: 'active', label: 'Activo' },
          ]}
          value={status}
          onChange={setStatus}
        />
      </Sub>
      <Sub title="Chips de filtro">
        <ChipGroup label="Roles" required error={roles.length === 0 ? 'Seleccione al menos un rol.' : null}>
          {['Recepción', 'Enfermería', 'Proveedor'].map((r) => (
            <FilterChip key={r} label={r} selected={roles.includes(r)} onToggle={(on) => { setRoles(on ? [...roles, r] : roles.filter((x) => x !== r)); }} />
          ))}
        </ChipGroup>
      </Sub>
      <Sub title="Desplegable y texto multilínea">
        <SelectField label="Sede" defaultValue="all">
          <option value="all">Todas las sedes</option>
          <option value="NOR1">Norte Centro (NOR1)</option>
        </SelectField>
        <TextAreaField
          label="Motivo"
          required
          hint="Se guarda en la auditoría: no incluya información de pacientes."
          value={reason}
          onChange={(e) => { setReason(e.target.value); }}
        />
      </Sub>
      <Sub title="Aviso temporal">
        <Button
          variant="outline"
          onClick={() => {
            snackbar({ message: 'Este registro fue actualizado por otro usuario. Actualice para continuar.', action: { label: 'Actualizar', onClick: noop } });
          }}
        >
          Mostrar aviso
        </Button>
      </Sub>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-surface-container-high/40 p-space-sm text-body-md">
      <span className="text-on-surface-variant">{label}</span>
      <span className="text-on-surface">{children}</span>
    </div>
  );
}

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-space-sm">
      <h4 className="text-headline-sm text-on-surface">{title}</h4>
      {children}
    </div>
  );
}

/** Cada sección se dibuja dos veces: tema claro y tema oscuro (clase `dark` en el bloque). */
function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`seccion-${String(n)}`} className="flex flex-col gap-space-md">
      <h2 id={`seccion-${String(n)}`} className="text-headline-lg text-on-surface">
        {n}. {title}
      </h2>
      <div className="grid gap-space-md desk:grid-cols-2">
        {(['claro', 'oscuro'] as const).map((theme) => (
          <div
            key={theme}
            className={`${theme === 'oscuro' ? 'dark ' : ''}flex min-w-0 flex-col gap-space-md rounded-lg bg-surface-container-lowest p-space-lg text-on-surface shadow-level-1 dark:bg-background`}
          >
            <h3 className="text-caption tracking-wider text-on-surface-variant uppercase">Tema {theme}</h3>
            {children}
          </div>
        ))}
      </div>
    </section>
  );
}
