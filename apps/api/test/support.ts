import { randomBytes, randomUUID } from 'node:crypto';
import { createTenantDb, decryptPayload, DEMO, membershipRoles, memberships } from '@clinic/db';
import { eq } from 'drizzle-orm';
import type { Role } from '@clinic/shared';
import { generate } from 'otplib';
import pg from 'pg';
import { inject } from 'vitest';
import { createApp, type ClinicApp } from '../src/app.ts';
import { DEFAULTS, type AppConfig } from '../src/config.ts';
import { MemoryLogSink } from '../src/logging.ts';
import { createOrganization } from '../src/platform.ts';

export const NORTE = DEMO.norte;
export const SUR = DEMO.sur;

export interface TestApp extends ClinicApp {
  logs: MemoryLogSink;
  config: AppConfig;
}

export async function startApp(overrides: Partial<AppConfig> = {}): Promise<TestApp> {
  const config: AppConfig = {
    databaseUrl: inject('appUrl'),
    baseURL: 'http://localhost:3000',
    trustedOrigins: [],
    authSecret: randomBytes(32).toString('hex'),
    auditHmacKey: randomBytes(32).toString('hex'),
    secureCookies: false,
    trustProxy: false,
    outboxKey: randomBytes(32).toString('hex'),
    ...DEFAULTS,
    ...overrides,
  };
  const logs = new MemoryLogSink();
  const app = await createApp({ config, logs });
  return { ...app, logs, config };
}

export function randomTestIp(): string {
  const byte = () => String(Math.floor(Math.random() * 254) + 1);
  return `198.${String(18 + Math.floor(Math.random() * 2))}.${byte()}.${byte()}`;
}

/** Cliente HTTP con cookies, sobre fastify.inject (sin red). */
export class Client {
  readonly cookies = new Map<string, string>();
  readonly #app: TestApp;
  readonly ip: string;

  /**
   * Cada cliente tiene su propia IP (198.18.0.0/15, reservada para pruebas):
   * el límite por IP de Better Auth está activo en todos los entornos.
   */
  constructor(app: TestApp, ip = randomTestIp()) {
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
  return client.post('/api/context', { organizationId: org.id, locationId: org.locations[location].id });
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
      reason: string | null;
      request_id: string | null;
      metadata: Record<string, unknown> | null;
      created_at: Date;
    }>(`select * from app.audit_log where ${where} order by created_at`, params);
    return rows;
  } finally {
    await operator.end();
  }
}

/** Id de la membresía de una persona en una organización (leída con withTenant). */
export async function membershipIdOf(app: TestApp, org: typeof NORTE | typeof SUR, userId: string): Promise<string> {
  const id = await createTenantDb(app.pool).withTenant(org.id, (tx) =>
    tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.userId, userId))
      .then((r) => r[0]?.id),
  );
  if (!id) throw new Error('sin membresía');
  return id;
}

/** Inicia sesión, inscribe TOTP si hace falta y elige el contexto. */
export async function signedInWithContext(
  app: TestApp,
  staff: Staff,
  org: typeof NORTE | typeof SUR,
  location: 0 | 1 = 0,
  options: { mfa?: boolean } = {},
): Promise<Client> {
  const client = new Client(app);
  await signIn(client, staff);
  if (options.mfa) await enrollTotp(client, staff);
  const response = await selectContext(client, org, location);
  if (response.statusCode !== 204) throw new Error(`contexto ${String(response.statusCode)} ${response.body}`);
  return client;
}

export interface QueuedMail {
  eventId: string;
  status: string;
  entityId: string | null;
  to: string;
  subject: string;
  text: string;
}

/**
 * Correos que la API dejó en el outbox (T-008), descifrados con la clave de
 * la prueba, del más reciente al más antiguo. Se leen con el superusuario de
 * la base desechable; los entrega el worker (sus pruebas, en apps/worker).
 */
export async function queuedMails(app: TestApp, to?: string): Promise<QueuedMail[]> {
  const client = new pg.Client({ connectionString: inject('operatorUrl') });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string; organization_id: string; status: string; entity_id: string | null; payload: string | null }>(
      'select id, organization_id, status, entity_id, payload from app.outbox where payload is not null order by created_at desc, id desc',
    );
    // Cada TestApp tiene su propia OUTBOX_KEY: los correos de otras pruebas
    // (misma base) no se pueden descifrar con esta y se descartan.
    return rows
      .flatMap((r) => {
        try {
          const mail = decryptPayload(app.config.outboxKey, { organizationId: r.organization_id, eventId: r.id }, r.payload ?? '');
          return [{ eventId: r.id, status: r.status, entityId: r.entity_id, ...mail }];
        } catch {
          return [];
        }
      })
      .filter((m) => to === undefined || m.to === to);
  } finally {
    await client.end();
  }
}

/** Payload tal como está guardado (cifrado). */
export async function readOutboxRaw(eventId: string): Promise<string> {
  const client = new pg.Client({ connectionString: inject('operatorUrl') });
  await client.connect();
  try {
    const { rows } = await client.query<{ payload: string | null }>('select payload from app.outbox where id = $1', [eventId]);
    return rows[0]?.payload ?? '';
  } finally {
    await client.end();
  }
}

/** Enlace de invitación del último correo en el outbox para `to`. */
export async function lastInvitationLink(app: TestApp, to?: string): Promise<URL> {
  const [mail] = await queuedMails(app, to);
  const match = mail?.text.match(/https?:\/\/\S+/);
  if (!match) throw new Error('sin enlace de invitación');
  return new URL(match[0]);
}

/** Token de un enlace /invitacion/<token> (o /restablecer/<token>). */
export function tokenOf(link: string | URL): string {
  const token = new URL(link).pathname.split('/').at(-1);
  if (!token) throw new Error('enlace sin token');
  return token;
}

/** Versión actual de una membresía (concurrencia optimista). */
export async function versionOf(app: TestApp, org: typeof NORTE | typeof SUR, membershipId: string): Promise<number> {
  const version = await createTenantDb(app.pool).withTenant(org.id, (tx) =>
    tx
      .select({ version: memberships.version })
      .from(memberships)
      .where(eq(memberships.id, membershipId))
      .then((r) => r[0]?.version),
  );
  if (version === undefined) throw new Error('sin membresía');
  return version;
}

/** Quita (deshabilita) una membresía con la versión actual. */
export async function deactivateVia(client: Client, app: TestApp, org: typeof NORTE | typeof SUR, membershipId: string, reason = 'Prueba') {
  return client.post(`/api/memberships/${membershipId}/deactivate`, { reason, expectedVersion: await versionOf(app, org, membershipId) });
}

/**
 * Organización nueva para una prueba (T-007), creada como en producción: el
 * operador (clinic_operator) con org:create, y su Propietario acepta la
 * invitación, configura el MFA y elige la primera sede. Así las pruebas que
 * cambian sedes no tocan las dos organizaciones ficticias de la semilla.
 */
export async function newOrganization(app: TestApp, code: string): Promise<{ org: typeof NORTE; owner: Client }> {
  const operator = new pg.Pool({ connectionString: inject('platformOperatorUrl'), max: 1 });
  try {
    const email = `propietario.${code.toLowerCase()}.${randomUUID().slice(0, 8)}@example.test`;
    const created = await createOrganization(
      operator,
      {
        organizationName: `Organización ${code} (ficticia)`,
        ownerEmail: email,
        ownerName: `Propietario ${code}`,
        location: { code, name: `Sede ${code}`, timezone: 'America/Chicago', address: null, phone: null },
      },
      { baseURL: app.config.baseURL, invitationTtlSeconds: 3600, outboxKey: app.config.outboxKey },
    );
    const owner = new Client(app);
    const password = `Ficticia-${randomBytes(9).toString('base64url')}`;
    const accepted = await owner.post('/api/invitations/accept', { token: tokenOf(created.link), name: `Propietario ${code}`, password });
    if (accepted.statusCode !== 201) throw new Error(`aceptar ${String(accepted.statusCode)}`);
    await enrollTotp(owner, { userId: '', email, password });
    const context = await owner.post('/api/context', { organizationId: created.organizationId, locationId: created.locationId });
    if (context.statusCode !== 204) throw new Error(`contexto ${String(context.statusCode)}`);
    const org = { id: created.organizationId, name: `Organización ${code}`, locations: [{ id: created.locationId, code }] } as unknown as typeof NORTE;
    return { org, owner };
  } finally {
    await operator.end();
  }
}
