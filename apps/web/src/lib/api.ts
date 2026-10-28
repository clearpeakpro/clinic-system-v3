import type { Permission, Role } from '@clinic/shared';

// Cliente de la API (mismo origen: /api). Las cookies de sesión son httpOnly:
// la web nunca ve ni guarda tokens. Nada de lo que devuelve se persiste
// (ADR 0014): vive solo en la caché en memoria de TanStack Query.

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
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
    throw new ApiError(response.status, typeof code === 'string' ? code : `http_${String(response.status)}`);
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

export const api = {
  me: () => request<Me>('GET', '/api/me'),
  locations: () => request<LocationChoice[]>('GET', '/api/me/locations'),
  selectContext: (organizationId: string, locationId: string) =>
    request<null>('POST', '/api/context', { organizationId, locationId }),
  idleLogout: () => request<null>('POST', '/api/me/idle-logout', {}),

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
