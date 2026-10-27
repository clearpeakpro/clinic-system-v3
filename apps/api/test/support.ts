import { randomBytes, randomUUID } from 'node:crypto';
import { createTenantDb, DEMO, membershipRoles, memberships } from '@clinic/db';
import type { Role } from '@clinic/shared';
import { generate } from 'otplib';
import pg from 'pg';
import { inject } from 'vitest';
import { createApp, type ClinicApp } from '../src/app.ts';
import { DEFAULTS, type AppConfig } from '../src/config.ts';
import { MemoryLogSink } from '../src/logging.ts';
import { MemoryMailer } from '../src/mailer.ts';

export const NORTE = DEMO.norte;
export const SUR = DEMO.sur;

export interface TestApp extends ClinicApp {
  mailer: MemoryMailer;
  logs: MemoryLogSink;
  config: AppConfig;
}

export async function startApp(
  overrides: Partial<AppConfig> = {},
  options: { disableSignUp?: boolean } = {},
): Promise<TestApp> {
  const config: AppConfig = {
    databaseUrl: inject('appUrl'),
    baseURL: 'http://localhost:3000',
    authSecret: randomBytes(32).toString('hex'),
    auditHmacKey: randomBytes(32).toString('hex'),
    secureCookies: false,
    ...DEFAULTS,
    ...overrides,
  };
  const mailer = new MemoryMailer();
  const logs = new MemoryLogSink();
  const app = await createApp({ config, mailer, logs, ...options });
  return { ...app, mailer, logs, config };
}

/** Cliente HTTP con cookies, sobre fastify.inject (sin red). */
export class Client {
  readonly cookies = new Map<string, string>();
  readonly #app: TestApp;
  readonly ip: string;

  constructor(app: TestApp, ip = '203.0.113.10') {
    this.#app = app;
    this.ip = ip;
  }

  get cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async request(method: 'GET' | 'POST', url: string, body?: unknown, headers: Record<string, string> = {}) {
    const response = await this.#app.fastify.inject({
      method,
      url,
      remoteAddress: this.ip,
      headers: {
        ...(this.cookies.size > 0 ? { cookie: this.cookieHeader } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        origin: 'http://localhost:3000',
        ...headers,
      },
      ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
    });
    for (const cookie of response.cookies) {
      const expired = cookie.maxAge === 0 || (cookie.expires !== undefined && cookie.expires.getTime() <= Date.now());
      if (expired || cookie.value === '') this.cookies.delete(cookie.name);
      else this.cookies.set(cookie.name, cookie.value);
    }
    return response;
  }

  get(url: string, headers?: Record<string, string>) {
    return this.request('GET', url, undefined, headers);
  }

  post(url: string, body: unknown = {}, headers?: Record<string, string>) {
    return this.request('POST', url, body, headers);
  }
}

export interface Assignment {
  org: typeof NORTE | typeof SUR;
  /** Índice de la sede, o null para toda la organización. */
  location: 0 | 1 | null;
  role: Role;
}

export interface Staff {
  userId: string;
  email: string;
  password: string;
}

/** Crea una persona (cuenta de Better Auth) y sus membresías. Datos ficticios. */
export async function createStaff(app: TestApp, label: string, assignments: Assignment[]): Promise<Staff> {
  const email = `${label}.${randomUUID().slice(0, 8)}@example.test`;
  const password = `Ficticia-${randomBytes(9).toString('base64url')}`;
  const { user } = await app.auth.api.signUpEmail({ body: { name: `Persona ${label}`, email, password } });
  const tenantDb = createTenantDb(app.pool);
  for (const assignment of assignments) {
    const orgId = assignment.org.id;
    await tenantDb.withTenant(orgId, async (tx) => {
      const [membership] = await tx
        .insert(memberships)
        .values({ organizationId: orgId, userId: user.id })
        .onConflictDoUpdate({ target: [memberships.organizationId, memberships.userId], set: { status: 'active' } })
        .returning({ id: memberships.id });
      if (!membership) throw new Error('membresía no creada');
      await tx.insert(membershipRoles).values({
        organizationId: orgId,
        membershipId: membership.id,
        locationId: assignment.location === null ? null : assignment.org.locations[assignment.location].id,
        role: assignment.role,
      });
    });
  }
  return { userId: user.id, email, password };
}

export async function signIn(client: Client, staff: Staff) {
  return client.post('/api/auth/sign-in/email', { email: staff.email, password: staff.password });
}

export async function selectContext(client: Client, org: typeof NORTE | typeof SUR, location: 0 | 1 = 0) {
  return client.post('/context', { organizationId: org.id, locationId: org.locations[location].id });
}

export function totpSecretFrom(uri: string): string {
  const secret = new URL(uri).searchParams.get('secret');
  if (!secret) throw new Error('URI sin secreto');
  return secret;
}

export function totp(secret: string): Promise<string> {
  return generate({ secret });
}

/** Inscribe TOTP con sesión abierta y devuelve el secreto y los códigos de recuperación. */
export async function enrollTotp(client: Client, staff: Staff) {
  const enable = await client.post('/api/auth/two-factor/enable', { password: staff.password });
  if (enable.statusCode !== 200) throw new Error(`enable ${String(enable.statusCode)} ${enable.body}`);
  const { totpURI, backupCodes } = enable.json<{ totpURI: string; backupCodes: string[] }>();
  const secret = totpSecretFrom(totpURI);
  const verify = await client.post('/api/auth/two-factor/verify-totp', { code: await totp(secret) });
  if (verify.statusCode !== 200) throw new Error(`verify ${String(verify.statusCode)} ${verify.body}`);
  return { secret, backupCodes };
}

/** Lee audit_log como el operador de la plataforma (clinic_app no puede leerlo). */
export async function readAudit(where = 'true', params: unknown[] = []) {
  const operator = new pg.Client({ connectionString: inject('operatorUrl') });
  await operator.connect();
  try {
    const { rows } = await operator.query<{
      organization_id: string | null;
      actor_type: string;
      actor_id: string | null;
      action: string;
      ip: string | null;
      metadata: Record<string, unknown> | null;
      created_at: Date;
    }>(`select * from app.audit_log where ${where} order by created_at`, params);
    return rows;
  } finally {
    await operator.end();
  }
}
