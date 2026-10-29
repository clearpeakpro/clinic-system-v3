import { ORG_WIDE_ROLES, type Role } from '@clinic/shared';
import {
  AsyncView,
  Button,
  ConfirmDialog,
  DataTable,
  DateTimeText,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownSeparator,
  DropdownTrigger,
  EmptyState,
  Field,
  SelectField,
  SemanticChip,
  StatCard,
  StatusChip,
  useSnackbar,
  type Column,
} from '@clinic/ui';
import { useQuery } from '@tanstack/react-query';
import {
  Award,
  Ban,
  Building2,
  Clock,
  IdCard,
  ConciergeBell,
  HeartPulse,
  KeyRound,
  Lock,
  LockKeyhole,
  type LucideIcon,
  MailPlus,
  MailX,
  MapPin,
  MoreVertical,
  Pencil,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Stethoscope,
  UserCheck,
  UserCog,
  UserPlus,
  UserRoundCheck,
  UserRoundX,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { EditAssignmentsDialog, EditNameDialog } from '../components/users/edit-dialogs.tsx';
import { InviteDialog } from '../components/users/invite-dialog.tsx';
import { MfaResetDialog } from '../components/users/mfa-reset-dialog.tsx';
import { SecretDialog, type Secret } from '../components/users/secret-dialog.tsx';
import { api, ApiError, type InvitationRow, type MemberRow, type UserRow, type UsersList } from '../lib/api.ts';
import { initials, ROLE_LABELS } from '../lib/format.ts';
import { useActiveLocation } from '../lib/session.ts';
import {
  assignmentLines,
  isVersionConflict,
  lastAccessLabel,
  roleSummary,
  STATUS_LABELS,
  statusOf,
  userActionMessage,
  userCounts,
  withoutClinicalAccess,
  type UserStatus,
} from '../lib/users.ts';

// S-ADM-02 Usuarios (Stitch: design/stitch/admin/S-ADM-02_usuarios). Se toma
// la distribución: encabezado con «Invitar usuario», tarjetas de totales
// (conteos reales de la lista), una fila de filtros sin etiquetas visibles y
// la tabla con avatar, roles bajo el nombre, correo, roles por sede,
// verificación en dos pasos, estado («Reenviar» en las invitaciones) y
// último acceso. La fila del Propietario va resaltada y las deshabilitadas,
// atenuadas. No se construye lo que el sistema no tiene («Activos en línea»
// y porcentajes, «Registro de actividad», «Exportar», búsqueda por cédula,
// filtro de 2FA, títulos y especialidades, LDAP, cifrado, IPs, paginación,
// avisos de HIPAA). Las acciones de cada fila dependen del estado y de la
// regla escalonada que calcula el servidor (`manageable`).

const USERS_KEY = ['users'] as const;

type StatusFilter = 'all' | UserStatus;
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'invited', label: 'Invitado' },
  { value: 'active', label: 'Activo' },
  { value: 'disabled', label: 'Deshabilitado' },
];

const STATUS_TONE = { invited: 'info', active: 'success' } as const;

const ROLE_ICONS: Record<Role, LucideIcon> = {
  propietario: Building2,
  administrador: Building2,
  recepcion: ConciergeBell,
  enfermeria: HeartPulse,
  proveedor: Stethoscope,
};

type Dialogs =
  | { kind: 'invite' }
  | { kind: 'name'; row: MemberRow }
  | { kind: 'roles' | 'locations'; row: MemberRow }
  | { kind: 'disable' | 'reactivate' | 'password'; row: MemberRow }
  | { kind: 'mfa'; row: MemberRow }
  | { kind: 'revoke'; row: InvitationRow }
  | null;

export function AdminUsersPage() {
  const users = useQuery<UsersList, ApiError>({ queryKey: USERS_KEY, queryFn: api.users, staleTime: 0 });
  const timeZone = useActiveLocation()?.timezone ?? 'America/Chicago';
  const snackbar = useSnackbar();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [secret, setSecret] = useState<Secret | null>(null);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [role, setRole] = useState<Role | 'all'>('all');
  const [location, setLocation] = useState<string>('all');
  const [search, setSearch] = useState('');

  const reload = () => void users.refetch();
  const closeDialog = () => { setDialog(null); };
  const saved = (message?: string) => {
    setDialog(null);
    reload();
    if (message) snackbar({ message });
  };
  const conflict = () => {
    setDialog(null);
    snackbar({ message: 'Este registro fue actualizado por otro usuario. Actualice para continuar.', action: { label: 'Actualizar', onClick: reload } });
  };
  const failed = (error: unknown) => {
    if (isVersionConflict(error)) conflict();
    else snackbar({ message: userActionMessage(error) });
  };
  const resend = async (row: InvitationRow) => {
    try {
      const created = await api.resendInvitation(row.invitationId);
      reload();
      setSecret({ kind: 'resent', name: row.name, email: row.email, ...created });
    } catch (error) {
      reload();
      failed(error);
    }
  };

  return (
    <section aria-labelledby="page-title" className="mx-auto flex w-full max-w-7xl flex-col gap-space-lg">
      <header className="flex flex-wrap items-end justify-between gap-space-md">
        <div className="flex min-w-0 flex-col gap-space-xs">
          <h1 id="page-title" className="text-display-md text-on-surface">
            Usuarios
          </h1>
          <p className="text-body-lg text-on-surface-variant">Cuentas del personal por invitación, roles y sedes.</p>
        </div>
        <div className="flex items-center gap-space-sm">
          <Button variant="elevated" aria-label="Actualizar" title="Actualizar" className="px-3" onClick={reload}>
            <RefreshCw aria-hidden className="size-5" />
          </Button>
          <Button disabled={!users.data} onClick={() => { setDialog({ kind: 'invite' }); }}>
            <UserPlus aria-hidden className="size-5" /> Invitar usuario
          </Button>
        </div>
      </header>

      <AsyncView source={users} loading="skeleton">
        {(list) => (
          <UsersContent
            list={list}
            loadedAt={users.dataUpdatedAt}
            filters={{ status, role, location, search }}
            setFilters={{ setStatus, setRole, setLocation, setSearch }}
            timeZone={timeZone}
            onAction={setDialog}
            onResend={resend}
          />
        )}
      </AsyncView>

      {users.data && dialog?.kind === 'invite' ? (
        <InviteDialog
          open
          onOpenChange={(open) => { if (!open) closeDialog(); }}
          list={users.data}
          onCreated={(created) => {
            reload();
            setSecret(created);
          }}
        />
      ) : null}
      {dialog?.kind === 'name' ? <EditNameDialog row={dialog.row} onClose={closeDialog} onSaved={() => { saved(); }} onConflict={conflict} /> : null}
      {users.data && (dialog?.kind === 'roles' || dialog?.kind === 'locations') ? (
        <EditAssignmentsDialog
          row={dialog.row}
          mode={dialog.kind}
          list={users.data}
          onClose={closeDialog}
          onSaved={() => { saved(); }}
          onConflict={conflict}
        />
      ) : null}
      {dialog?.kind === 'disable' ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) closeDialog(); }}
          destructive
          icon={<UserRoundX className="size-7" />}
          title={`¿Deshabilitar a ${dialog.row.name}?`}
          description="Sus sesiones en esta organización se cierran de inmediato y ya no podrá entrar en ella."
          confirmLabel="Deshabilitar"
          reason={{ label: 'Motivo', hint: 'Se guarda en la auditoría y lo ven los administradores: no incluya información de pacientes.' }}
          onConfirm={async (reason) => {
            try {
              await api.deactivateMember(dialog.row.membershipId, reason ?? '', dialog.row.version);
              saved();
            } catch (error) {
              failed(error);
            }
          }}
        />
      ) : null}
      {dialog?.kind === 'reactivate' ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) closeDialog(); }}
          dismissible={false}
          fullScreenOnPhone
          icon={<UserCheck className="size-7" />}
          title={`¿Reactivar a ${dialog.row.name}?`}
          description="La cuenta vuelve a estar activa en esta organización con sus roles y sedes."
          confirmLabel="Reactivar"
          reason={{
            label: 'Motivo',
            hint: 'Obligatorio (por ejemplo, recontratación). Se guarda en la auditoría y lo ven los administradores: no incluya información de pacientes.',
          }}
          onConfirm={async (reason) => {
            try {
              await api.reactivateMember(dialog.row.membershipId, reason ?? '', dialog.row.version);
              saved(`La cuenta de ${dialog.row.name} vuelve a estar activa.`);
            } catch (error) {
              failed(error);
            }
          }}
        />
      ) : null}
      {dialog?.kind === 'password' ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) closeDialog(); }}
          icon={<KeyRound className="size-7" />}
          title={`¿Crear un restablecimiento de contraseña para ${dialog.row.name}?`}
          description="Se genera un enlace de un solo uso para que fije una contraseña nueva. Cualquier enlace anterior deja de funcionar."
          confirmLabel="Crear restablecimiento"
          reason={{ label: 'Motivo', hint: 'Se guarda en la auditoría y lo ven los administradores: no incluya información de pacientes.' }}
          onConfirm={async (reason) => {
            try {
              const link = await api.createPasswordReset(dialog.row.membershipId, reason ?? '');
              saved();
              setSecret({ kind: 'password', name: dialog.row.name, link: link.link, expiresAt: link.expiresAt });
            } catch (error) {
              failed(error);
            }
          }}
        />
      ) : null}
      {dialog?.kind === 'revoke' ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) closeDialog(); }}
          destructive
          icon={<Ban className="size-7" />}
          title={`¿Revocar la invitación de ${dialog.row.name}?`}
          description="El enlace de invitación dejará de funcionar. Podrá invitar a la persona de nuevo más tarde."
          confirmLabel="Revocar invitación"
          reason={{ label: 'Motivo', hint: 'Se guarda en la auditoría y lo ven los administradores: no incluya información de pacientes.' }}
          onConfirm={async (reason) => {
            try {
              await api.revokeInvitation(dialog.row.invitationId, reason ?? '');
              saved('Invitación revocada.');
            } catch (error) {
              failed(error);
            }
          }}
        />
      ) : null}
      {dialog?.kind === 'mfa' ? (
        <MfaResetDialog
          row={dialog.row}
          timeZone={timeZone}
          onClose={closeDialog}
          onDone={(link, message) => {
            saved(message ?? undefined);
            if (link) setSecret(link);
          }}
        />
      ) : null}
      <SecretDialog secret={secret} timeZone={timeZone} onClose={() => { setSecret(null); }} />
    </section>
  );
}

interface Filters {
  status: StatusFilter;
  role: Role | 'all';
  location: string;
  search: string;
}

function UsersContent({
  list,
  loadedAt,
  filters,
  setFilters,
  timeZone,
  onAction,
  onResend,
}: {
  list: UsersList;
  /** Cuándo se cargó la lista: referencia de «Hoy» y «Ayer» en «Último acceso». */
  loadedAt: number;
  filters: Filters;
  setFilters: {
    setStatus: (v: StatusFilter) => void;
    setRole: (v: Role | 'all') => void;
    setLocation: (v: string) => void;
    setSearch: (v: string) => void;
  };
  timeZone: string;
  onAction: (dialog: Dialogs) => void;
  onResend: (row: InvitationRow) => Promise<void>;
}) {
  const rows = useMemo(() => {
    const needle = filters.search.trim().toLocaleLowerCase('es');
    return list.rows.filter(
      (row) =>
        (filters.status === 'all' || statusOf(row) === filters.status) &&
        (filters.role === 'all' || row.assignments.some((a) => a.role === filters.role)) &&
        (filters.location === 'all' || row.assignments.some((a) => a.locationId === filters.location || a.locationId === null)) &&
        (needle === '' || row.name.toLocaleLowerCase('es').includes(needle) || row.email.includes(needle)),
    );
  }, [list.rows, filters]);
  const counts = userCounts(list.rows);
  const filtered = rows.length !== list.rows.length;

  const columns: Column<UserRow>[] = [
    { key: 'user', header: 'Usuario', primary: true, cell: (row) => <UserCell row={row} /> },
    {
      key: 'email',
      header: 'Correo electrónico',
      // Entre 1025 y 1279 px no cabe: el correo va bajo el nombre (UserCell).
      className: 'hidden min-[80rem]:table-cell',
      cell: (row) => (
        <span className={`font-mono text-code-sm whitespace-nowrap ${statusOf(row) === 'disabled' ? 'text-on-surface-variant' : ''}`}>{row.email}</span>
      ),
    },
    { key: 'roles', header: 'Roles por sede', cell: (row) => <RolesCell row={row} list={list} /> },
    { key: 'mfa', header: 'Verificación 2FA', cell: (row) => <MfaChip row={row} /> },
    { key: 'status', header: 'Estado de cuenta', cell: (row) => <StatusCell row={row} timeZone={timeZone} onResend={onResend} /> },
    {
      key: 'last',
      header: 'Último acceso',
      cell: (row) =>
        row.kind === 'member' ? (
          <span className="text-body-md whitespace-nowrap text-on-surface-variant">{lastAccessLabel(row.lastSignInAt, loadedAt, timeZone)}</span>
        ) : (
          <span className="text-on-surface-variant">
            <span aria-hidden>—</span>
            <span className="sr-only">Sin cuenta todavía</span>
          </span>
        ),
    },
    { key: 'actions', header: 'Acciones', hideHeader: true, align: 'end', cell: (row) => <RowActions row={row} onAction={onAction} onResend={onResend} /> },
  ];

  return (
    <div className="flex flex-col gap-space-md">
      <div className="grid grid-cols-2 gap-space-sm desk:grid-cols-4 desk:gap-space-md">
        <StatCard label="Total registrados" value={counts.total} icon={IdCard} />
        <StatCard label="Activos" value={counts.active} icon={UserRoundCheck} />
        <StatCard label="Invitaciones pendientes" value={counts.invited} icon={MailPlus} tone="info" />
        <StatCard label="Deshabilitados" value={counts.disabled} icon={UserRoundX} tone="neutral" />
      </div>

      <div
        role="search"
        aria-label="Filtrar usuarios"
        className="grid gap-space-sm rounded-lg bg-surface-container-lowest p-space-md shadow-level-1 tab:grid-cols-2 desk:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] dark:bg-surface-container-low"
      >
        <Field
          label="Buscar"
          hideLabel
          type="search"
          placeholder="Buscar por nombre o correo"
          icon={<Search className="size-5" />}
          value={filters.search}
          onChange={(e) => { setFilters.setSearch(e.target.value); }}
        />
        <SelectField label="Rol" hideLabel value={filters.role} onChange={(e) => { setFilters.setRole(e.target.value as Role | 'all'); }}>
          <option value="all">Todos los roles</option>
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Sede" hideLabel value={filters.location} onChange={(e) => { setFilters.setLocation(e.target.value); }}>
          <option value="all">Todas las sedes</option>
          {list.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.code})
            </option>
          ))}
        </SelectField>
        <SelectField label="Estado" hideLabel value={filters.status} onChange={(e) => { setFilters.setStatus(e.target.value as StatusFilter); }}>
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </SelectField>
      </div>

      <p className="flex items-center gap-space-xs text-body-md text-on-surface-variant" aria-live="polite">
        <Users aria-hidden className="size-[18px] text-primary" />
        {filtered ? `Mostrando ${String(rows.length)} de ${String(list.rows.length)} usuarios` : `${String(list.rows.length)} usuarios`}
      </p>
      {rows.length === 0 ? (
        <EmptyState icon={Users} title="Sin resultados" description="Ningún usuario coincide con este filtro." />
      ) : (
        <DataTable
          caption="Usuarios"
          columns={columns}
          rows={rows}
          rowKey={(row) => (row.kind === 'member' ? row.membershipId : row.invitationId)}
          density="compact"
          cardsBelow="desk"
          rowClassName={(row) =>
            isOwner(row)
              ? 'bg-status-checkout-container/60 hover:bg-status-checkout-container dark:bg-status-checkout-container/30 dark:hover:bg-status-checkout-container/50'
              : statusOf(row) === 'disabled'
                ? // Atenuada en los dos temas: fondo hundido y barra gris a la izquierda.
                  'bg-surface-container-low/60 shadow-[inset_4px_0_0_var(--color-outline-variant)] dark:bg-surface-container-lowest dark:hover:bg-surface-container-lowest'
                : undefined
          }
        />
      )}
    </div>
  );
}

function isOwner(row: UserRow): boolean {
  return row.kind === 'member' && row.assignments.some((a) => a.role === 'propietario');
}

function UserCell({ row }: { row: UserRow }) {
  const muted = statusOf(row) === 'disabled';
  const owner = isOwner(row);
  // El Propietario ya lleva su etiqueta junto al nombre.
  const subtitle = roleSummary(owner ? row.assignments.filter((a) => a.role !== 'propietario') : row.assignments);
  return (
    <span className="flex min-w-0 items-center gap-space-sm tab:min-w-44">
      <span
        aria-hidden
        className={
          muted
            ? 'flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-body-md-medium text-on-surface-variant'
            : owner
              ? 'flex size-10 shrink-0 items-center justify-center rounded-full bg-status-checkout-border text-body-md-medium text-on-surface'
              : 'flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-container text-body-md-medium text-primary dark:bg-surface-container-high'
        }
      >
        {initials(row.name)}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="flex flex-wrap items-center gap-x-space-xs">
          <span className={muted ? 'text-body-lg-medium text-on-surface-variant' : 'text-body-lg-medium text-on-surface'}>
            {row.name}
            {row.kind === 'member' && row.self ? <span className="text-body-md text-on-surface-variant"> (usted)</span> : null}
          </span>
          {owner ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-status-checkout-border bg-status-checkout-container px-2 py-0.5 text-caption font-semibold tracking-wider text-status-checkout uppercase">
              <Award aria-hidden className="size-3.5" /> Propietario
            </span>
          ) : null}
        </span>
        <span className="hidden font-mono text-code-sm break-all text-on-surface-variant desk:block min-[80rem]:hidden">{row.email}</span>
        {subtitle ? <span className="text-caption text-on-surface-variant">{subtitle}</span> : null}
        {withoutClinicalAccess(row.assignments) ? (
          <span className="flex items-center gap-1 text-caption text-on-surface-variant">
            <LockKeyhole aria-hidden className="size-3.5" /> Sin acceso clínico
          </span>
        ) : null}
      </span>
    </span>
  );
}

function RolesCell({ row, list }: { row: UserRow; list: UsersList }) {
  const lines = assignmentLines(row.assignments, list.locations);
  const muted = statusOf(row) === 'disabled';
  if (lines.length === 0) return <span className="text-on-surface-variant">Sin roles</span>;
  return (
    <ul className="flex flex-col items-start gap-1">
      {lines.map((line) => {
        const Icon = ROLE_ICONS[line.role];
        return (
          <li
            key={line.role}
            className={`inline-flex items-center gap-1.5 rounded-full px-space-sm py-1 text-caption whitespace-nowrap ${
              muted ? 'bg-surface-container-high text-on-surface-variant' : 'bg-surface-container text-on-surface dark:bg-surface-container-high'
            }`}
          >
            <Icon aria-hidden className={`size-4 shrink-0 ${muted ? '' : 'text-primary'}`} />
            {ORG_WIDE_ROLES.includes(line.role) ? (
              // Como en Stitch: el rol ya va bajo el nombre; el chip dice el alcance.
              <span>
                <span className="sr-only">{line.label} · </span>
                {line.where}
              </span>
            ) : (
              <span>
                {line.label} · {line.where}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function MfaChip({ row }: { row: UserRow }) {
  if (row.kind === 'invitation') return <StatusChip tone="registered" icon={Clock} label="Pendiente" className="whitespace-nowrap" />;
  if (row.mfaResetPending) return <StatusChip tone="waiting" icon={ShieldAlert} label="Restablecida" className="whitespace-nowrap" />;
  if (row.mfa === 'locked') return <StatusChip tone="danger" icon={Lock} label="Bloqueada" className="whitespace-nowrap" />;
  if (row.mfa === 'enabled' && row.status === 'active') return <StatusChip tone="completed" icon={ShieldCheck} label="Activa" className="whitespace-nowrap" />;
  if (row.mfa === 'enabled') return <StatusChip tone="departed" icon={ShieldCheck} label="Activa" className="whitespace-nowrap" />;
  return <StatusChip tone="departed" icon={ShieldOff} label="Desactivada" className="whitespace-nowrap" />;
}

function StatusCell({ row, timeZone, onResend }: { row: UserRow; timeZone: string; onResend: (row: InvitationRow) => Promise<void> }) {
  const status = statusOf(row);
  const [busy, setBusy] = useState(false);
  if (status === 'disabled') return <StatusChip tone="departed" icon={Ban} label={STATUS_LABELS.disabled} className="whitespace-nowrap" />;
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="flex flex-wrap items-center gap-space-xs">
        <SemanticChip tone={STATUS_TONE[status]} label={STATUS_LABELS[status]} className="whitespace-nowrap" />
        {row.kind === 'invitation' && row.manageable ? (
          <Button
            variant="tonal"
            className="px-3 text-body-md-medium"
            aria-label={`Reenviar la invitación a ${row.name}`}
            loading={busy}
            loadingText="Reenviando…"
            onClick={() => {
              setBusy(true);
              void onResend(row).finally(() => { setBusy(false); });
            }}
          >
            Reenviar
          </Button>
        ) : null}
        {row.kind === 'invitation' && row.mailStatus === 'failed' ? (
          // El worker agotó los intentos de entrega (T-008): se audita como mail.failed.
          <StatusChip tone="danger" icon={MailX} label="Correo no entregado" className="whitespace-nowrap" />
        ) : null}
      </span>
      {row.kind === 'invitation' ? (
        <span className="text-caption whitespace-nowrap text-on-surface-variant">
          {row.expired ? 'Venció el ' : 'Vence el '}
          <DateTimeText value={row.expiresAt} timeZone={timeZone} format="date" />
        </span>
      ) : null}
    </span>
  );
}

/** Por qué una fila no tiene acciones (nota de rediseño de S-ADM-02: explicar en vez de fallar). */
function unavailableReason(row: UserRow): string | null {
  if (row.kind === 'member' && row.self) return 'Es su propia cuenta.';
  if (!row.manageable) return 'Su rol no permite gestionar a esta persona.';
  return null;
}

function RowActions({ row, onAction, onResend }: { row: UserRow; onAction: (dialog: Dialogs) => void; onResend: (row: InvitationRow) => Promise<void> }) {
  const reason = unavailableReason(row);
  const label = `Más acciones para ${row.name}`;
  if (reason) {
    return (
      <span className="inline-flex items-center gap-space-xs">
        <span className="sr-only">{`${label}: no disponibles. ${reason}`}</span>
        <button
          type="button"
          disabled
          aria-hidden
          tabIndex={-1}
          title={reason}
          className="flex size-12 items-center justify-center rounded-md text-on-surface-variant opacity-40"
        >
          <MoreVertical className="size-5" />
        </button>
      </span>
    );
  }
  return (
    <DropdownMenu>
      <DropdownTrigger
        aria-label={label}
        className="flex size-12 items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-container"
      >
        <MoreVertical aria-hidden className="size-5" />
      </DropdownTrigger>
      <DropdownContent>
        {row.kind === 'invitation' ? (
          <>
            <DropdownItem onSelect={() => { void onResend(row); }}>
              <Send aria-hidden className="size-5" /> Reenviar invitación
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem className="text-error" onSelect={() => { onAction({ kind: 'revoke', row }); }}>
              <Ban aria-hidden className="size-5" /> Revocar invitación
            </DropdownItem>
          </>
        ) : (
          <MemberActions row={row} onAction={onAction} />
        )}
      </DropdownContent>
    </DropdownMenu>
  );
}

function MemberActions({ row, onAction }: { row: MemberRow; onAction: (dialog: Dialogs) => void }) {
  const active = row.status === 'active';
  const hasClinical = !withoutClinicalAccess(row.assignments);
  const shared = row.sharedAccount;
  return (
    <>
      <DropdownItem disabled={shared} onSelect={() => { onAction({ kind: 'name', row }); }}>
        <Pencil aria-hidden className="size-5" /> Editar nombre
      </DropdownItem>
      <DropdownItem onSelect={() => { onAction({ kind: 'roles', row }); }}>
        <UserCog aria-hidden className="size-5" /> Editar roles
      </DropdownItem>
      <DropdownItem disabled={!hasClinical} onSelect={() => { onAction({ kind: 'locations', row }); }}>
        <MapPin aria-hidden className="size-5" /> Editar sedes
      </DropdownItem>
      {active ? (
        <DropdownItem
          disabled={shared}
          onSelect={() => { onAction(row.mfaResetPending ? { kind: 'mfa', row } : { kind: 'password', row }); }}
        >
          <KeyRound aria-hidden className="size-5" /> Crear restablecimiento de contraseña
        </DropdownItem>
      ) : null}
      <DropdownSeparator />
      <DropdownItem
        className="text-error"
        disabled={shared || (row.mfa === 'disabled' && !row.mfaResetPending)}
        onSelect={() => { onAction({ kind: 'mfa', row }); }}
      >
        <ShieldAlert aria-hidden className="size-5" /> Restablecer la verificación en dos pasos
      </DropdownItem>
      {active ? (
        <DropdownItem className="text-error" onSelect={() => { onAction({ kind: 'disable', row }); }}>
          <UserRoundX aria-hidden className="size-5" /> Deshabilitar
        </DropdownItem>
      ) : (
        <DropdownItem onSelect={() => { onAction({ kind: 'reactivate', row }); }}>
          <UserCheck aria-hidden className="size-5" /> Reactivar
        </DropdownItem>
      )}
      {shared ? (
        <DropdownLabel className="max-w-72 px-space-sm py-space-xs text-caption text-on-surface-variant">
          La cuenta también se usa en otra organización: el nombre, la contraseña y la verificación en dos pasos los cambia el soporte de Clinic System.
        </DropdownLabel>
      ) : null}
      {!hasClinical ? (
        <DropdownLabel className="max-w-72 px-space-sm py-space-xs text-caption text-on-surface-variant">
          Los roles administrativos valen para toda la organización: no llevan sedes.
        </DropdownLabel>
      ) : null}
    </>
  );
}
