import type {
  CatalogKind,
  CatalogList,
  CreateLabProviderInput,
  CreatedPatient,
  CreatePatientInput,
  OwnClinicalRolesInput,
  PatientSearchResult,
  PatientSummary,
  GeneralPriceInput,
  LabCostChange,
  LocationPriceInput,
  NotificationKind,
  Permission,
  Role,
} from '@clinic/shared';

// Cliente de la API (mismo origen: /api). Las cookies de sesión son httpOnly:
// la web nunca ve ni guarda tokens. Nada de lo que devuelve se persiste
// (ADR 0014): vive solo en la caché en memoria de TanStack Query.

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Segundos de Retry-After (respuestas 429), para el mensaje de S-GEN-28. */
  readonly retryAfterSeconds: number | undefined;
  /** El resto del cuerpo del error (p. ej. los candidatos de un posible duplicado, S-PAC-03). */
  readonly details: Record<string, unknown>;
  constructor(status: number, code: string, retryAfterSeconds?: number, details: Record<string, unknown> = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.details = details;
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  // Un 5xx del proxy (API caída) puede traer texto plano o nada.
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    if (response.ok) throw new ApiError(502, 'invalid_response');
  }
  if (!response.ok) {
    const code = (data as { code?: unknown } | null)?.code;
    const retryAfter = Number(response.headers.get('retry-after'));
    throw new ApiError(
      response.status,
      typeof code === 'string' ? code : `http_${String(response.status)}`,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
      data && typeof data === 'object' ? (data as Record<string, unknown>) : {},
    );
  }
  return data as T;
}

export interface Me {
  userId: string;
  name: string;
  email: string;
  idleTimeoutSeconds: number;
  twoFactorEnabled: boolean;
  mfaRequired: boolean;
  context: { organizationId: string; locationId: string } | null;
  /** Roles en la sede activa (vacío sin contexto). */
  roles: Role[];
  /** Perfil: sus roles por sede en la organización activa (sede nula = toda la organización). */
  assignments: { role: Role; locationId: string | null }[];
  permissions: Permission[];
}

export interface LocationChoice {
  organizationId: string;
  organizationName: string;
  locations: { id: string; code: string; name: string; timezone: string; address: string | null }[];
}

// Administración › Usuarios (T-006a). Tipos de apps/api/src/users.ts.
export interface Assignment {
  role: Role;
  locationId: string | null;
}

export interface MemberRow {
  kind: 'member';
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  status: 'active' | 'inactive';
  version: number;
  assignments: Assignment[];
  mfa: 'enabled' | 'disabled' | 'locked';
  mfaResetPending: boolean;
  self: boolean;
  manageable: boolean;
  sharedAccount: boolean;
  /** Último inicio de sesión (auditoría, sin IP). null: nunca. */
  lastSignInAt: string | null;
}

export interface InvitationRow {
  kind: 'invitation';
  invitationId: string;
  name: string;
  email: string;
  assignments: Assignment[];
  expiresAt: string;
  expired: boolean;
  manageable: boolean;
  /** Estado de su correo en el outbox (T-008). «failed»: «Correo no entregado». */
  mailStatus: 'pending' | 'sent' | 'failed' | null;
}

export type UserRow = MemberRow | InvitationRow;

export interface UsersList {
  rows: UserRow[];
  locations: { id: string; code: string; name: string; active: boolean }[];
  assignableRoles: Role[];
}

export interface MfaStatus {
  enrolled: boolean;
  lockedUntil: string | null;
  backupCodesLeft: number | null;
  resetPendingSince: string | null;
}

/** Administración › Sedes (S-ADM-10). Tipos de apps/api/src/locations.ts. */
export interface LocationRow {
  id: string;
  code: string;
  name: string;
  timezone: string;
  address: string | null;
  phone: string | null;
  active: boolean;
  version: number;
}

export interface LocationInput {
  name: string;
  timezone: string;
  address: string | null;
  phone: string | null;
}

/** S-GEN-22: estado del propio factor. */
export interface OwnMfaStatus {
  enrolled: boolean;
  /** Alguno de sus roles lo exige: no se puede desactivar. */
  required: boolean;
  lockedUntil: string | null;
  backupCodesLeft: number | null;
}

/** Centro de notificaciones (S-GEN-15). Tipos de apps/api/src/notifications.ts. */
export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  /** Código humano de la entidad («NOR1-V-000123»); nunca nombres. */
  code: string | null;
  locationId: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  read: boolean;
}

export interface NotificationsList {
  rows: NotificationItem[];
  unread: number;
}

/** Enlace de un solo uso (S-ADM-04). */
export interface OneTimeLink {
  link: string;
  expiresAt: string;
}

export const api = {
  me: () => request<Me>('GET', '/api/me'),
  locations: () => request<LocationChoice[]>('GET', '/api/me/locations'),
  selectContext: (organizationId: string, locationId: string) =>
    request<null>('POST', '/api/context', { organizationId, locationId }),
  idleLogout: () => request<null>('POST', '/api/me/idle-logout', {}),

  // Perfil (S-GEN-21 a 25)
  ownMfa: () => request<OwnMfaStatus>('GET', '/api/me/mfa'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ otherSessionsClosed: number }>('POST', '/api/me/password', { currentPassword, newPassword }),
  regenerateRecoveryCodes: (code: string) => request<{ backupCodes: string[] }>('POST', '/api/me/mfa/recovery-codes', { code }),
  disableOwnMfa: (code: string) => request<null>('POST', '/api/me/mfa/disable', { code }),

  // Administración › Usuarios
  users: () => request<UsersList>('GET', '/api/users'),
  invite: (input: { email: string; name: string; roles: Role[]; locationIds: string[] }) =>
    request<OneTimeLink & { invitationId: string }>('POST', '/api/invitations', input),
  resendInvitation: (invitationId: string) =>
    request<OneTimeLink & { invitationId: string }>('POST', `/api/invitations/${invitationId}/resend`, {}),
  revokeInvitation: (invitationId: string, reason: string) =>
    request<null>('POST', `/api/invitations/${invitationId}/revoke`, { reason }),
  renameMember: (membershipId: string, name: string, expectedVersion: number) =>
    request<null>('POST', `/api/memberships/${membershipId}/name`, { name, expectedVersion }),
  changeRoles: (membershipId: string, roles: Assignment[], reason: string, expectedVersion: number) =>
    request<null>('POST', `/api/memberships/${membershipId}/roles`, { roles, reason, expectedVersion }),
  deactivateMember: (membershipId: string, reason: string, expectedVersion: number) =>
    request<null>('POST', `/api/memberships/${membershipId}/deactivate`, { reason, expectedVersion }),
  reactivateMember: (membershipId: string, reason: string, expectedVersion: number) =>
    request<null>('POST', `/api/memberships/${membershipId}/reactivate`, { reason, expectedVersion }),
  mfaStatus: (membershipId: string) => request<MfaStatus>('GET', `/api/memberships/${membershipId}/mfa`),
  resetMfa: (membershipId: string, reason: string) =>
    request<{ reset: OneTimeLink | null }>('POST', `/api/memberships/${membershipId}/mfa-reset`, { reason }),
  createPasswordReset: (membershipId: string, reason: string) =>
    request<OneTimeLink>('POST', `/api/memberships/${membershipId}/password-reset`, { reason }),

  // Administración › Sedes
  adminLocations: () => request<LocationRow[]>('GET', '/api/locations'),
  createLocation: (input: LocationInput & { code: string }) => request<{ id: string }>('POST', '/api/locations', input),
  updateLocation: (locationId: string, input: LocationInput, expectedVersion: number) =>
    request<null>('POST', `/api/locations/${locationId}`, { ...input, expectedVersion }),
  setLocationActive: (locationId: string, active: boolean, expectedVersion: number) =>
    request<null>('POST', `/api/locations/${locationId}/${active ? 'activate' : 'deactivate'}`, { expectedVersion }),

  // Administración › Catálogos y precios (S-ADM-13 a 20)
  adminCatalog: (locationId: string) => request<CatalogList>('GET', `/api/admin/catalog?locationId=${encodeURIComponent(locationId)}`),
  createCatalogItem: (
    kind: CatalogKind,
    input: Record<string, unknown> & { code: string; generalPrice?: GeneralPriceInput; locationPrice?: LocationPriceInput; labCosts?: LabCostChange[] },
  ) =>
    request<{ id: string }>('POST', `/api/admin/catalog/${kind}`, input),
  updateCatalogItem: (
    kind: CatalogKind,
    id: string,
    input: Record<string, unknown> & { expectedVersion: number; generalPrice?: GeneralPriceInput; locationPrice?: LocationPriceInput; labCosts?: LabCostChange[] },
  ) =>
    request<null>('POST', `/api/admin/catalog/${kind}/${id}`, input),
  deactivateCatalogItem: (kind: CatalogKind, id: string, reason: string, expectedVersion: number) =>
    request<null>('POST', `/api/admin/catalog/${kind}/${id}/deactivate`, { reason, expectedVersion }),
  useGeneralPrice: (kind: CatalogKind, id: string, locationId: string, effectiveFrom: string) =>
    request<null>('POST', `/api/admin/catalog/${kind}/${id}/use-general`, { locationId, effectiveFrom }),
  reactivateCatalogItem: (kind: CatalogKind, id: string, expectedVersion: number) =>
    request<null>('POST', `/api/admin/catalog/${kind}/${id}/reactivate`, { expectedVersion }),
  // Proveedores de laboratorio (S-ADM-17, T-011b); la lista llega con adminCatalog.
  createLabProvider: (input: CreateLabProviderInput) => request<{ id: string }>('POST', '/api/admin/lab-providers', input),
  updateLabProvider: (id: string, input: CreateLabProviderInput, expectedVersion: number) =>
    request<null>('POST', `/api/admin/lab-providers/${id}`, { ...input, expectedVersion }),
  deactivateLabProvider: (id: string, reason: string, expectedVersion: number) =>
    request<null>('POST', `/api/admin/lab-providers/${id}/deactivate`, { reason, expectedVersion }),
  reactivateLabProvider: (id: string, expectedVersion: number) => request<null>('POST', `/api/admin/lab-providers/${id}/reactivate`, { expectedVersion }),

  // Catálogo activo para el personal (T-011): fuentes de referido del alta de paciente.
  catalog: () => request<CatalogList>('GET', '/api/catalog'),

  // Pacientes (S-PAC-01 a 05, T-012). La búsqueda va por POST: el criterio no queda en la URL.
  searchPatients: (q: string, offset: number) => request<PatientSearchResult>('POST', '/api/patients/search', { q, offset }),
  createPatient: (input: CreatePatientInput) => request<CreatedPatient>('POST', '/api/patients', input),
  patient: (id: string) => request<PatientSummary & { today: string }>('GET', `/api/patients/${id}`),
  openExistingPatient: (id: string) => request<null>('POST', `/api/patients/${id}/open-existing`, {}),
  // Excepción del ADR 0027: el Propietario se asigna roles clínicos.
  changeOwnClinicalRoles: (input: OwnClinicalRolesInput) => request<null>('POST', '/api/memberships/self/clinical-roles', input),

  // Centro de notificaciones (S-GEN-15)
  notifications: () => request<NotificationsList>('GET', '/api/notifications'),
  readNotification: (id: string) => request<null>('POST', `/api/notifications/${id}/read`, {}),
  readAllNotifications: () => request<null>('POST', '/api/notifications/read-all', {}),
  clearNotifications: () => request<null>('POST', '/api/notifications/clear', {}),

  // Páginas públicas
  acceptInvitation: (input: { token: string; name?: string; password?: string }) =>
    request<{ membershipId: string; signedIn: boolean }>('POST', '/api/invitations/accept', input),
  resetPassword: (token: string, newPassword: string) =>
    request<{ status: boolean }>('POST', '/api/auth/reset-password', { token, newPassword }),

  // Better Auth
  session: () => request<{ user: { id: string } } | null>('GET', '/api/auth/get-session'),
  signIn: (email: string, password: string) =>
    request<{ twoFactorRedirect?: boolean }>('POST', '/api/auth/sign-in/email', { email, password }),
  verifyTotp: (code: string) => request<unknown>('POST', '/api/auth/two-factor/verify-totp', { code }),
  verifyBackupCode: (code: string) => request<unknown>('POST', '/api/auth/two-factor/verify-backup-code', { code }),
  enableTotp: (password: string) =>
    request<{ totpURI: string; backupCodes: string[] }>('POST', '/api/auth/two-factor/enable', { password }),
  signOut: () => request<unknown>('POST', '/api/auth/sign-out', {}),
  signOutEverywhere: async () => {
    await request<unknown>('POST', '/api/auth/revoke-sessions', {});
  },
};
