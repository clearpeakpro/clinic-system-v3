import type { Permission, Role } from '@clinic/shared';

// Cliente de la API (mismo origen: /api). Las cookies de sesión son httpOnly:
// la web nunca ve ni guarda tokens. Nada de lo que devuelve se persiste
// (ADR 0014): vive solo en la caché en memoria de TanStack Query.

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Segundos de Retry-After (respuestas 429), para el mensaje de S-GEN-28. */
  readonly retryAfterSeconds: number | undefined;
  constructor(status: number, code: string, retryAfterSeconds?: number) {
    super(code);
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
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
  const data: unknown = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const code = (data as { code?: unknown } | null)?.code;
    const retryAfter = Number(response.headers.get('retry-after'));
    throw new ApiError(
      response.status,
      typeof code === 'string' ? code : `http_${String(response.status)}`,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
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
}

export type UserRow = MemberRow | InvitationRow;

export interface UsersList {
  rows: UserRow[];
  locations: { id: string; code: string; name: string }[];
  assignableRoles: Role[];
}

export interface MfaStatus {
  enrolled: boolean;
  lockedUntil: string | null;
  backupCodesLeft: number | null;
  resetPendingSince: string | null;
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

  // Administración › Usuarios
  users: () => request<UsersList>('GET', '/api/users'),
  invite: (input: { email: string; name: string; roles: Role[]; locationIds: string[] }) =>
    request<OneTimeLink & { invitationId: string; mailSent: boolean }>('POST', '/api/invitations', input),
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
