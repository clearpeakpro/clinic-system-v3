import { appointments, kioskCheckins, locations, memberships, notifyRealtime, patients, type FieldCipher, type TenantDb, type Tx } from '@clinic/db';
import {
  discardKioskArrivalSchema,
  kioskCheckinSchema,
  type KioskArrival,
  type KioskArrivalDetail,
  type KioskArrivals,
  type KioskCheckinData,
  type KioskMatch,
} from '@clinic/shared';
import { and, asc, eq, gt, inArray, or, sql } from 'drizzle-orm';
import type { AuditService } from './audit.ts';
import type { Clock } from './clock.ts';
import { DUPLICATE_SIMILARITY } from './patients.ts';
import type { Principal } from './principal.ts';
import { HttpError, requireContext, type RequestMeta } from './services.ts';

// Llegadas del kiosco en Recepción (T-021; S-REC-28, ADR 0014 y 0031).
//  - La bandeja: los registros pendientes de la sede activa que no han vencido
//    (con el reloj inyectable), descifrados, el más antiguo primero.
//  - Un registro con sus coincidencias para «Ya soy paciente»: nombre
//    parecido (el umbral de los duplicados), fecha de nacimiento y teléfono.
//  - La cita de hoy de un paciente en la sede (el asistente pasa a modo cita).
//  - Descartar con motivo: el contenido se borra en la misma transacción.
//  - Confirmar va por la llegada (EncounterService.arrive con kioskCheckinId).
//  - Lecturas auditadas sin datos; el evento en vivo `kiosk.checkin` lleva solo el id.

/** Descifra el contenido de un registro (el mismo contexto con el que lo cifró el kiosco, T-020). */
export async function kioskContent(cipher: FieldCipher, organizationId: string, id: string, contentEnc: string): Promise<KioskCheckinData> {
  const plain = await cipher.decrypt(contentEnc, { organizationId, table: 'kiosk_checkins', column: 'content', recordId: id });
  return kioskCheckinSchema.parse(JSON.parse(plain));
}

/** Aviso en vivo para la sala de la sede: solo el id del registro. */
export async function notifyKioskCheckin(tx: Tx, organizationId: string, locationId: string, id: string): Promise<void> {
  await notifyRealtime(tx, { t: 'event', org: organizationId, loc: locationId, name: 'kiosk.checkin', ids: { kioskCheckin: id } });
}

const dayIn = (instant: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);

export class KioskArrivalService {
  readonly #tenantDb: TenantDb;
  readonly #audit: AuditService;
  readonly #cipher: FieldCipher;
  readonly #clock: Clock;

  constructor(tenantDb: TenantDb, audit: AuditService, cipher: FieldCipher, clock: Clock) {
    this.#tenantDb = tenantDb;
    this.#audit = audit;
    this.#cipher = cipher;
    this.#clock = clock;
  }

  /** S-REC-28: la bandeja de la sede activa. */
  async list(actor: Principal, meta: RequestMeta): Promise<KioskArrivals> {
    const ctx = requireContext(actor);
    const now = this.#clock.now();
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const site = await this.#site(tx, ctx.locationId);
      const rows = await tx
        .select({ id: kioskCheckins.id, createdAt: kioskCheckins.createdAt, contentEnc: kioskCheckins.contentEnc })
        .from(kioskCheckins)
        .where(and(eq(kioskCheckins.locationId, ctx.locationId), eq(kioskCheckins.status, 'pending'), gt(kioskCheckins.expiresAt, now)))
        .orderBy(asc(kioskCheckins.createdAt), asc(kioskCheckins.id));
      const arrivals: KioskArrival[] = [];
      for (const row of rows) {
        if (!row.contentEnc) continue;
        arrivals.push(this.#view(row.id, row.createdAt, await kioskContent(this.#cipher, ctx.organizationId, row.id, row.contentEnc)));
      }
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'kiosk.arrivals_list',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'kiosk_checkin',
        ...meta,
        metadata: { results: arrivals.length },
      });
      return { serverNow: now.toISOString(), timeZone: site.timezone, today: dayIn(now, site.timezone), rows: arrivals };
    });
  }

  /** Un registro pendiente con sus coincidencias (hasta 5, las de más datos coincidentes primero). */
  async detail(actor: Principal, id: string, meta: RequestMeta): Promise<KioskArrivalDetail> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const row = await this.#pending(tx, ctx.locationId, id, false);
      const content = await kioskContent(this.#cipher, ctx.organizationId, row.id, row.contentEnc);
      const fullName = sql`app.search_text(${patients.firstName} || ' ' || ${patients.lastName})`;
      const similarity = sql<number>`ext.similarity(${fullName}, app.search_text(${`${content.firstName} ${content.lastName}`}))`;
      const found = await tx
        .select({
          id: patients.id,
          code: patients.code,
          firstName: patients.firstName,
          lastName: patients.lastName,
          birthDate: patients.birthDate,
          phone: patients.phone,
          status: patients.status,
          similarity: sql<number>`${similarity}`.mapWith(Number),
        })
        .from(patients)
        .where(
          and(
            sql`${patients.mergedInto} is null`,
            or(eq(patients.phone, content.phone), sql`${similarity} >= ${DUPLICATE_SIMILARITY}`, and(eq(patients.birthDate, content.birthDate), sql`${similarity} >= 0.3`)),
          ),
        )
        .orderBy(sql`${similarity} desc`, asc(patients.code))
        .limit(25);
      const candidates: KioskMatch[] = found
        .map((p) => ({
          patient: { id: p.id, code: p.code, firstName: p.firstName, lastName: p.lastName, birthDate: p.birthDate, phone: p.phone, status: p.status as 'active' | 'inactive' },
          matches: { name: p.similarity >= DUPLICATE_SIMILARITY, birthDate: p.birthDate === content.birthDate, phone: p.phone === content.phone },
          score: p.similarity,
        }))
        .filter((c) => c.matches.name || c.matches.birthDate || c.matches.phone)
        .sort((a, b) => count(b.matches) - count(a.matches) || b.score - a.score)
        .slice(0, 5)
        .map(({ patient, matches }) => ({ patient, matches }));
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'kiosk.arrival_view',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'kiosk_checkin',
        entityId: row.id,
        ...meta,
        metadata: { candidates: candidates.length },
      });
      return { arrival: this.#view(row.id, row.createdAt, content), candidates };
    });
  }

  /** La cita de hoy del paciente en la sede (programada o confirmada), para registrar su llegada con el registro del kiosco. */
  async todayAppointment(actor: Principal, patientId: string): Promise<{ appointmentId: string | null }> {
    const ctx = requireContext(actor);
    const now = this.#clock.now();
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const site = await this.#site(tx, ctx.locationId);
      const today = dayIn(now, site.timezone);
      const [row] = await tx
        .select({ id: appointments.id })
        .from(appointments)
        .where(
          and(
            eq(appointments.patientId, patientId),
            eq(appointments.locationId, ctx.locationId),
            inArray(appointments.status, ['SCHEDULED', 'CONFIRMED']),
            sql`${appointments.startsAt} >= (${today}::date::timestamp at time zone ${site.timezone})`,
            sql`${appointments.startsAt} < ((${today}::date + 1)::timestamp at time zone ${site.timezone})`,
          ),
        )
        .orderBy(asc(appointments.startsAt))
        .limit(1);
      return { appointmentId: row?.id ?? null };
    });
  }

  /** «Descartar» con motivo (un envío de prueba, un duplicado). El contenido se borra; el motivo queda en la auditoría. */
  async discard(actor: Principal, id: string, raw: unknown, meta: RequestMeta): Promise<{ discarded: true }> {
    const parsed = discardKioskArrivalSchema.safeParse(raw);
    if (!parsed.success) throw new HttpError(400, 'invalid_request');
    const ctx = requireContext(actor);
    const now = this.#clock.now();
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const row = await this.#pending(tx, ctx.locationId, id, true);
      const [me] = await tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, actor.userId));
      if (!me) throw new HttpError(403, 'no_active_context');
      await tx
        .update(kioskCheckins)
        .set({
          status: 'discarded',
          contentEnc: null,
          contentPurgedAt: now,
          resolvedByMembershipId: me.id,
          resolvedAt: now,
          updatedAt: now,
          version: sql`${kioskCheckins.version} + 1`,
        })
        .where(eq(kioskCheckins.id, row.id));
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'kiosk.checkin_discarded',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'kiosk_checkin',
        entityId: row.id,
        reason: parsed.data.reason,
        ...meta,
      });
      await notifyKioskCheckin(tx, ctx.organizationId, ctx.locationId, row.id);
      return { discarded: true as const };
    });
  }

  /** Registro pendiente y sin vencer de la sede; si no, 404 (otra sede o inexistente) o 409 (ya resuelto o vencido). */
  async #pending(tx: Tx, locationId: string, id: string, lock: boolean) {
    const query = tx
      .select({ id: kioskCheckins.id, status: kioskCheckins.status, expiresAt: kioskCheckins.expiresAt, createdAt: kioskCheckins.createdAt, contentEnc: kioskCheckins.contentEnc })
      .from(kioskCheckins)
      .where(and(eq(kioskCheckins.id, id), eq(kioskCheckins.locationId, locationId)));
    const [row] = lock ? await query.for('update') : await query;
    if (!row) throw new HttpError(404, 'kiosk_checkin_not_found');
    if (row.status !== 'pending' || !row.contentEnc) throw new HttpError(409, 'kiosk_checkin_resolved');
    if (row.expiresAt.getTime() <= this.#clock.now().getTime()) throw new HttpError(409, 'kiosk_checkin_expired');
    return { ...row, contentEnc: row.contentEnc };
  }

  async #site(tx: Tx, locationId: string) {
    const [site] = await tx.select({ timezone: locations.timezone }).from(locations).where(eq(locations.id, locationId));
    if (!site) throw new HttpError(403, 'no_active_context');
    return site;
  }

  #view(id: string, createdAt: Date, c: KioskCheckinData): KioskArrival {
    return {
      id,
      createdAt: createdAt.toISOString(),
      firstName: c.firstName,
      lastName: c.lastName,
      birthDate: c.birthDate,
      phone: c.phone,
      firstVisit: c.firstVisit,
      reason: c.reason,
      symptoms: c.symptoms,
    };
  }
}

function count(m: KioskMatch['matches']): number {
  return Number(m.name) + Number(m.birthDate) + Number(m.phone);
}
