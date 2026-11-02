import { createHash, randomBytes, randomInt } from 'node:crypto';
import { kioskCheckins, kioskDevices, locations, memberships, type FieldCipher, type TenantDb, type Tx } from '@clinic/db';
import {
  createKioskPairingSchema,
  KIOSK_CODE_ALPHABET,
  KIOSK_PAIRING_MINUTES,
  KIOSK_TOKEN_DAYS,
  kioskBirthDateError,
  kioskCheckinSchema,
  kioskLinkSchema,
  normalizeKioskCode,
  regenerateKioskCodeSchema,
  revokeKioskSchema,
  type KioskCheckinReceipt,
  type KioskDeviceStatus,
  type KioskDeviceView,
  type KioskPairing,
  type KioskSession,
} from '@clinic/shared';
import { and, count, desc, eq, gt, sql } from 'drizzle-orm';
import type pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import type { AuditService } from './audit.ts';
import type { Clock } from './clock.ts';
import { notifyKioskCheckin } from './kiosk-arrivals.ts';
import type { IdempotencyService } from './idempotency.ts';
import type { Principal } from './principal.ts';
import { HttpError, requireContext, type RequestMeta } from './services.ts';

// Kiosco de autorregistro (T-020; ADR 0014, 0019, 0023 y 0031).
//  - Sedes (S-ADM-10), con kiosks.manage: generar el código de vinculación
//    (10 min, un solo uso; se guarda solo su hash), generar otro y revocar.
//  - La tableta (sin sesión del personal): vincularse con el código y recibir
//    su token (90 días, renovable; solo su hash en la base). Con el token solo
//    puede renovar su sesión (que devuelve el código y el nombre de su sede) y
//    enviar registros: ningún endpoint de lectura lo acepta.
//  - Registro: validado en el servidor, con Idempotency-Key, límite de envíos
//    por tableta, contenido cifrado, vencimiento al cierre del día de la sede
//    y vaciado a las 24 h (el worker). Auditoría con actor «kiosk», sin datos.
//  - Toda hora sale del reloj inyectable.

const TOKEN_MS = KIOSK_TOKEN_DAYS * 24 * 60 * 60 * 1000;
const PAIRING_MS = KIOSK_PAIRING_MINUTES * 60 * 1000;
const PURGE_MS = 24 * 60 * 60 * 1000;

export const KIOSK_COOKIE = 'clinic_kiosk';

export interface KioskLimits {
  /** Envíos por tableta en la ventana (decisión del 2026-11-02: 20 cada 10 min). */
  submitMax: number;
  submitWindowSeconds: number;
  /** Intentos de vinculación fallidos por IP en la ventana. */
  linkMaxFailures: number;
  linkWindowSeconds: number;
}

export const DEFAULT_KIOSK_LIMITS: KioskLimits = { submitMax: 20, submitWindowSeconds: 600, linkMaxFailures: 10, linkWindowSeconds: 600 };

/** Validación en el servidor: un cuerpo inválido es 400, nunca un error interno. */
function parseOr400<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new HttpError(400, 'invalid_request');
  return result.data;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function newCode(): string {
  let code = '';
  for (let i = 0; i < 6; i += 1) code += KIOSK_CODE_ALPHABET.charAt(randomInt(KIOSK_CODE_ALPHABET.length));
  return code;
}

/** Día de la sede (aaaa-mm-dd) en su zona horaria. */
function dayIn(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

function deviceView(row: typeof kioskDevices.$inferSelect): KioskDeviceView {
  return {
    id: row.id,
    name: row.name,
    status: row.status as KioskDeviceStatus,
    linkedAt: row.linkedAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    tokenExpiresAt: row.tokenExpiresAt?.toISOString() ?? null,
    pairingExpiresAt: row.pairingExpiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    version: row.version,
  };
}

/** S-ADM-10, sección «Kioscos» de cada sede: Propietario y Administrador (kiosks.manage). */
export class KioskAdminService {
  readonly #tenantDb: TenantDb;
  readonly #audit: AuditService;
  readonly #clock: Clock;

  constructor(tenantDb: TenantDb, audit: AuditService, clock: Clock) {
    this.#tenantDb = tenantDb;
    this.#audit = audit;
    this.#clock = clock;
  }

  /** Las tabletas de una sede, las revocadas al final. Sin hashes. */
  async list(actor: Principal, locationId: string): Promise<KioskDeviceView[]> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      await this.#location(tx, locationId);
      const rows = await tx.select().from(kioskDevices).where(eq(kioskDevices.locationId, locationId)).orderBy(desc(kioskDevices.createdAt));
      const rank: Record<string, number> = { active: 0, pending: 1, revoked: 2 };
      return rows.map(deviceView).sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3));
    });
  }

  /** «Vincular kiosco»: tableta nueva con su nombre y un código de un solo uso. El código en claro solo sale aquí. */
  async createPairing(actor: Principal, locationId: string, raw: unknown, meta: RequestMeta): Promise<KioskPairing> {
    const input = parseOr400(createKioskPairingSchema, raw);
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const site = await this.#location(tx, locationId);
      if (!site.active) throw new HttpError(409, 'location_inactive');
      const now = this.#clock.now();
      const code = newCode();
      const [row] = await tx
        .insert(kioskDevices)
        .values({
          organizationId: ctx.organizationId,
          locationId,
          name: input.name,
          status: 'pending',
          pairingCodeHash: sha256(code),
          pairingExpiresAt: new Date(now.getTime() + PAIRING_MS),
          createdByMembershipId: await this.#me(tx, actor.userId),
          createdAt: now,
        })
        .returning();
      if (!row) throw new Error('sin tableta');
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'kiosk.pairing_created',
        actorType: 'user',
        actorId: actor.userId,
        locationId,
        entityType: 'kiosk_device',
        entityId: row.id,
        ...meta,
      });
      return { device: deviceView(row), code, expiresAt: (row.pairingExpiresAt ?? now).toISOString() };
    });
  }

  /** «Generar nuevo código»: anula el anterior. Solo en una tableta aún sin vincular. */
  async regenerateCode(actor: Principal, deviceId: string, raw: unknown, meta: RequestMeta): Promise<KioskPairing> {
    const input = parseOr400(regenerateKioskCodeSchema, raw);
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const current = await this.#lock(tx, deviceId, input.expectedVersion);
      if (current.status !== 'pending') throw new HttpError(409, 'kiosk_already_linked');
      const now = this.#clock.now();
      const code = newCode();
      const [row] = await tx
        .update(kioskDevices)
        .set({ pairingCodeHash: sha256(code), pairingExpiresAt: new Date(now.getTime() + PAIRING_MS), version: current.version + 1 })
        .where(eq(kioskDevices.id, deviceId))
        .returning();
      if (!row) throw new Error('sin tableta');
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'kiosk.pairing_regenerated',
        actorType: 'user',
        actorId: actor.userId,
        locationId: row.locationId,
        entityType: 'kiosk_device',
        entityId: row.id,
        ...meta,
      });
      return { device: deviceView(row), code, expiresAt: (row.pairingExpiresAt ?? now).toISOString() };
    });
  }

  /** «Revocar»: corta la tableta al instante (su token deja de valer en la siguiente petición). */
  async revoke(actor: Principal, deviceId: string, raw: unknown, meta: RequestMeta): Promise<KioskDeviceView> {
    const input = parseOr400(revokeKioskSchema, raw);
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const current = await this.#lock(tx, deviceId, input.expectedVersion);
      if (current.status === 'revoked') throw new HttpError(409, 'kiosk_revoked');
      const [row] = await tx
        .update(kioskDevices)
        .set({
          status: 'revoked',
          tokenHash: null,
          pairingCodeHash: null,
          revokedAt: this.#clock.now(),
          revokedByMembershipId: await this.#me(tx, actor.userId),
          version: current.version + 1,
        })
        .where(eq(kioskDevices.id, deviceId))
        .returning();
      if (!row) throw new Error('sin tableta');
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'kiosk.revoked',
        actorType: 'user',
        actorId: actor.userId,
        locationId: row.locationId,
        entityType: 'kiosk_device',
        entityId: row.id,
        reason: input.reason,
        ...meta,
      });
      return deviceView(row);
    });
  }

  async #location(tx: Tx, locationId: string) {
    const [site] = await tx.select({ id: locations.id, active: locations.active }).from(locations).where(eq(locations.id, locationId));
    if (!site) throw new HttpError(404, 'location_not_found');
    return site;
  }

  async #lock(tx: Tx, deviceId: string, expectedVersion: number) {
    const [row] = await tx.select().from(kioskDevices).where(eq(kioskDevices.id, deviceId)).for('update');
    if (!row) throw new HttpError(404, 'kiosk_not_found');
    if (row.version !== expectedVersion) throw new HttpError(409, 'version_conflict');
    return row;
  }

  async #me(tx: Tx, userId: string): Promise<string> {
    const [row] = await tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, userId));
    if (!row) throw new HttpError(403, 'no_active_context');
    return row.id;
  }
}

interface KioskDevice {
  organizationId: string;
  locationId: string;
  deviceId: string;
}

/** La tableta: vincularse, renovar su sesión y enviar registros. Nunca lee datos. */
export class KioskService {
  readonly #pool: pg.Pool;
  readonly #tenantDb: TenantDb;
  readonly #audit: AuditService;
  readonly #cipher: FieldCipher;
  readonly #idempotency: IdempotencyService;
  readonly #clock: Clock;
  readonly #limits: KioskLimits;
  /** Fallos de vinculación por IP (en memoria: una instancia, entorno B). */
  readonly #linkFailures = new Map<string, number[]>();

  constructor(pool: pg.Pool, tenantDb: TenantDb, audit: AuditService, cipher: FieldCipher, idempotency: IdempotencyService, clock: Clock, limits: KioskLimits = DEFAULT_KIOSK_LIMITS) {
    this.#pool = pool;
    this.#tenantDb = tenantDb;
    this.#audit = audit;
    this.#cipher = cipher;
    this.#idempotency = idempotency;
    this.#clock = clock;
    this.#limits = limits;
  }

  /**
   * Vincular en `/kiosk/<SEDE>` con el código de un solo uso. Devuelve el
   * token (solo para la cookie) y la sede. Un código vencido, usado, de otra
   * sede o inexistente da el mismo 400, y cuenta para el límite por IP.
   */
  async link(raw: unknown, meta: RequestMeta): Promise<{ token: string; session: KioskSession }> {
    const input = parseOr400(kioskLinkSchema, raw);
    const now = this.#clock.now();
    const ip = meta.ip ?? 'unknown';
    if (this.#recentFailures(ip, now) >= this.#limits.linkMaxFailures) throw new HttpError(429, 'too_many_attempts');
    const fail = (): never => {
      this.#linkFailures.set(ip, [...(this.#linkFailures.get(ip) ?? []), now.getTime()]);
      throw new HttpError(400, 'invalid_kiosk_code');
    };
    const code = normalizeKioskCode(input.code);
    if (!code) return fail();
    const { rows } = await this.#pool.query<{ organization_id: string; location_id: string; device_id: string; pairing_expires_at: Date | null }>(
      'select * from app.kiosk_pairing_by_code($1)',
      [sha256(code)],
    );
    const found = rows[0];
    if (!found || !found.pairing_expires_at || found.pairing_expires_at.getTime() <= now.getTime()) return fail();
    const token = randomBytes(32).toString('base64url');
    const session = await this.#tenantDb.withTenant(found.organization_id, async (tx) => {
      const [site] = await tx
        .select({ code: locations.code, name: locations.name, active: locations.active })
        .from(locations)
        .where(eq(locations.id, found.location_id));
      if (site?.code.toUpperCase() !== input.locationCode.toUpperCase() || !site.active) return null;
      const [row] = await tx
        .update(kioskDevices)
        .set({
          status: 'active',
          pairingCodeHash: null,
          pairingExpiresAt: null,
          tokenHash: sha256(token),
          tokenExpiresAt: new Date(now.getTime() + TOKEN_MS),
          linkedAt: now,
          lastUsedAt: now,
          version: sql`${kioskDevices.version} + 1`,
        })
        .where(and(eq(kioskDevices.id, found.device_id), eq(kioskDevices.status, 'pending')))
        .returning({ id: kioskDevices.id });
      if (!row) return null;
      await this.#audit.inTx(tx, found.organization_id, {
        action: 'kiosk.linked',
        actorType: 'kiosk',
        actorId: found.device_id,
        locationId: found.location_id,
        entityType: 'kiosk_device',
        entityId: found.device_id,
        ...meta,
      });
      return { location: { code: site.code, name: site.name } };
    });
    if (!session) return fail();
    this.#linkFailures.delete(ip);
    return { token, session };
  }

  /** Renueva la sesión de la tableta (90 días más) y devuelve solo su sede. */
  async session(token: string | undefined): Promise<KioskSession> {
    const device = await this.#device(token);
    const now = this.#clock.now();
    return this.#tenantDb.withTenant(device.organizationId, async (tx) => {
      const [site] = await tx.select({ code: locations.code, name: locations.name, active: locations.active }).from(locations).where(eq(locations.id, device.locationId));
      if (!site?.active) throw new HttpError(401, 'kiosk_unauthorized');
      await tx
        .update(kioskDevices)
        .set({ tokenExpiresAt: new Date(now.getTime() + TOKEN_MS), lastUsedAt: now })
        .where(and(eq(kioskDevices.id, device.deviceId), eq(kioskDevices.status, 'active')));
      return { location: { code: site.code, name: site.name } };
    });
  }

  /** S-KIO-01 «Registrarme». Responde solo que se recibió. */
  async submit(token: string | undefined, raw: unknown, idempotencyKey: string, meta: RequestMeta): Promise<KioskCheckinReceipt> {
    const device = await this.#device(token);
    const input = parseOr400(kioskCheckinSchema, raw);
    await this.#idempotency.run(
      device.organizationId,
      `kiosk:${device.deviceId}:${idempotencyKey}`,
      { method: 'POST', path: '/api/kiosk/checkins', body: raw },
      async (tx) => {
        const now = this.#clock.now();
        const [site] = await tx.select({ timezone: locations.timezone, active: locations.active }).from(locations).where(eq(locations.id, device.locationId));
        if (!site?.active) throw new HttpError(401, 'kiosk_unauthorized');
        const today = dayIn(now, site.timezone);
        if (kioskBirthDateError(input.birthDate, today) !== null) throw new HttpError(400, 'invalid_request');
        // Límite por tableta, contado en la base (vale con varias instancias).
        const since = new Date(now.getTime() - this.#limits.submitWindowSeconds * 1000);
        const [recent] = await tx
          .select({ n: count() })
          .from(kioskCheckins)
          .where(and(eq(kioskCheckins.deviceId, device.deviceId), gt(kioskCheckins.createdAt, since)));
        if ((recent?.n ?? 0) >= this.#limits.submitMax) throw new HttpError(429, 'kiosk_rate_limited');
        const id = uuidv7();
        const content = await this.#cipher.encrypt(JSON.stringify(input), { organizationId: device.organizationId, table: 'kiosk_checkins', column: 'content', recordId: id });
        await tx.insert(kioskCheckins).values({
          id,
          organizationId: device.organizationId,
          locationId: device.locationId,
          deviceId: device.deviceId,
          contentEnc: content,
          serviceDate: today,
          // Cierre del día de la sede (medianoche siguiente, también con cambio de horario).
          expiresAt: sql`((${today}::date + 1)::timestamp at time zone ${site.timezone})`,
          purgeAt: new Date(now.getTime() + PURGE_MS),
          createdAt: now,
          updatedAt: now,
        });
        await tx.update(kioskDevices).set({ lastUsedAt: now }).where(eq(kioskDevices.id, device.deviceId));
        await this.#audit.inTx(tx, device.organizationId, {
          action: 'kiosk.checkin_submitted',
          actorType: 'kiosk',
          actorId: device.deviceId,
          locationId: device.locationId,
          entityType: 'kiosk_checkin',
          entityId: id,
          ...meta,
        });
        // T-021: la bandeja de Recepción lo ve al instante (solo el id).
        await notifyKioskCheckin(tx, device.organizationId, device.locationId, id);
        return { status: 201, resourceIds: [id] };
      },
      () => Promise.resolve(null),
    );
    return { received: true };
  }

  /** La tableta del token: activa y sin vencer. Si no, 401 (también revocada: al instante). */
  async #device(token: string | undefined): Promise<KioskDevice> {
    if (!token || token.length > 200) throw new HttpError(401, 'kiosk_unauthorized');
    const { rows } = await this.#pool.query<{ organization_id: string; location_id: string; device_id: string; token_expires_at: Date }>(
      'select * from app.kiosk_device_by_token($1)',
      [sha256(token)],
    );
    const row = rows[0];
    if (!row || row.token_expires_at.getTime() <= this.#clock.now().getTime()) throw new HttpError(401, 'kiosk_unauthorized');
    return { organizationId: row.organization_id, locationId: row.location_id, deviceId: row.device_id };
  }

  #recentFailures(ip: string, now: Date): number {
    const since = now.getTime() - this.#limits.linkWindowSeconds * 1000;
    const kept = (this.#linkFailures.get(ip) ?? []).filter((t) => t > since);
    if (kept.length === 0) this.#linkFailures.delete(ip);
    else this.#linkFailures.set(ip, kept);
    return kept.length;
  }
}

/** Cookie de la tableta: httpOnly, solo para /api/kiosk y separada de las sesiones del personal (ADR 0023, criterio 7). */
export function kioskCookie(token: string, secure: boolean): string {
  return [`${KIOSK_COOKIE}=${token}`, 'Path=/api/kiosk', `Max-Age=${String(KIOSK_TOKEN_DAYS * 24 * 60 * 60)}`, 'HttpOnly', 'SameSite=Strict', ...(secure ? ['Secure'] : [])].join('; ');
}

export function kioskTokenOf(cookieHeader: string | undefined): string | undefined {
  for (const part of (cookieHeader ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === KIOSK_COOKIE) return rest.join('=');
  }
  return undefined;
}
