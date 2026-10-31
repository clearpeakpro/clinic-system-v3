import {
  appointments,
  appointmentTypes,
  enqueueNotification,
  locations,
  membershipRoles,
  memberships,
  nextAppointmentCode,
  notifyRealtime,
  patients,
  user as userTable,
  type FieldCipher,
  type TenantDb,
  type Tx,
} from '@clinic/db';
import {
  appointmentActions,
  appointmentScope,
  isBookableDay,
  type AppointmentAction,
  type AppointmentFormOptions,
  type AppointmentOverlap,
  type AppointmentSaved,
  type AppointmentScope,
  type AppointmentStatus,
  type AppointmentWarning,
  type CreateAppointmentInput,
  type NotificationKind,
  type RescheduleAppointmentInput,
  type UpdateAppointmentInput,
  createAppointmentSchema,
  rescheduleAppointmentSchema,
  updateAppointmentSchema,
} from '@clinic/shared';
import { and, asc, eq, inArray, ne, notInArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import type { z } from 'zod';
import type { AuditService } from './audit.ts';
import type { IdempotencyService } from './idempotency.ts';
import type { Principal } from './principal.ts';
import { HttpError, requireContext, type RequestMeta } from './services.ts';

// Gestión de citas (T-015; S-REC-09 a 17).
//  - Todo va con withTenant y la organización y la sede de la sesión. Solo se
//    gestionan citas de la sede activa (location_mismatch → 404).
//  - Alcance (ADR 0027): Recepción, cualquier cita; Proveedor, solo las suyas
//    y solo para sí mismo (provider_scope). La matriz estado × rol es la de
//    @clinic/shared (appointmentActions), la misma que usa la web.
//  - Concurrencia optimista: cada cambio trae la versión leída (409
//    version_conflict). Solo desde hoy en la sede (appointment_in_past).
//  - El solapamiento del proveedor es un aviso: nunca bloquea. Se calcula
//    igual al crear, editar y reprogramar, y antes de guardar (overlap).
//  - En la misma transacción: auditoría (solo nombres de campos; el motivo de
//    cancelación, que es operativo), el evento en vivo de la sede (ids y
//    estado) y los avisos de la campana por el outbox (código y hora, nunca
//    nombres de pacientes).

const notesContext = (organizationId: string, recordId: string) => ({ organizationId, table: 'appointments', column: 'notes', recordId });
const reasonContext = (organizationId: string, recordId: string) => ({
  organizationId,
  table: 'appointments',
  column: 'cancel_reason',
  recordId,
});

type CreateData = z.output<typeof createAppointmentSchema>;
type UpdateData = z.output<typeof updateAppointmentSchema>;
type RescheduleData = z.output<typeof rescheduleAppointmentSchema>;

interface Current {
  id: string;
  code: string;
  locationId: string;
  startsAt: Date;
  durationMinutes: number;
  status: AppointmentStatus;
  providerMembershipId: string | null;
  appointmentTypeId: string;
  notesEnc: string | null;
  version: number;
  isToday: boolean;
}

/** Inicio en UTC de una fecha y una hora locales de la sede (lo resuelve Postgres con su zona). */
const localStart = (date: string, time: string, timeZone: string) => sql`((${date}::date + ${time}::time)::timestamp at time zone ${timeZone})`;

export class AppointmentCommands {
  readonly #tenantDb: TenantDb;
  readonly #plain;
  readonly #audit: AuditService;
  readonly #cipher: FieldCipher;
  readonly #idempotency: IdempotencyService;
  readonly #outboxKey: string;

  constructor(pool: pg.Pool, tenantDb: TenantDb, audit: AuditService, cipher: FieldCipher, idempotency: IdempotencyService, outboxKey: string) {
    this.#tenantDb = tenantDb;
    this.#plain = drizzle({ client: pool });
    this.#audit = audit;
    this.#cipher = cipher;
    this.#idempotency = idempotency;
    this.#outboxKey = outboxKey;
  }

  /** Proveedores del formulario (S-REC-10): activos con rol Proveedor en la sede activa. */
  async formOptions(actor: Principal): Promise<AppointmentFormOptions> {
    const ctx = requireContext(actor);
    const data = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const site = await this.#site(tx, ctx.locationId);
      const providers = await this.#activeProviders(tx, ctx.locationId);
      const me = await this.#myMembership(tx, actor.userId);
      return { site, providers, me };
    });
    const names = await this.#names(data.providers.map((p) => p.userId));
    return {
      providers: data.providers
        .map((p) => ({ membershipId: p.id, name: names.get(p.userId) ?? '' }))
        .filter((p) => p.name !== '')
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
      myMembershipId: data.me,
      iAmProvider: actor.roles.includes('proveedor'),
      scope: appointmentScope(actor.roles),
      today: data.site.today,
      timeZone: data.site.timezone,
    };
  }

  /** Solapamiento antes de guardar (decisión de T-015). Sin datos del paciente; no se audita. */
  async overlap(actor: Principal, input: { providerMembershipId: string; date: string; time: string; durationMinutes: number; appointmentId?: string | undefined }): Promise<AppointmentOverlap> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const site = await this.#site(tx, ctx.locationId);
      const [start] = await tx.execute<{ s: Date }>(sql`select ${localStart(input.date, input.time, site.timezone)} as s`).then((r) => r.rows);
      if (!start) throw new Error('sin inicio');
      const conflict = await this.#conflict(tx, input.providerMembershipId, new Date(start.s), input.durationMinutes, input.appointmentId ?? null);
      return { overlap: conflict !== null, conflictStartsAt: conflict?.toISOString() ?? null };
    });
  }

  /** S-REC-10 «Crear cita», con Idempotency-Key (un doble toque no crea dos citas). */
  async create(actor: Principal, raw: CreateAppointmentInput, idempotencyKey: string, meta: RequestMeta): Promise<AppointmentSaved> {
    const ctx = requireContext(actor);
    const input: CreateData = createAppointmentSchema.parse(raw);
    const scope = this.#requireScope(actor);
    const result = await this.#idempotency.run(
      ctx.organizationId,
      idempotencyKey,
      { method: 'POST', path: '/api/appointments', body: raw },
      async (tx) => {
        const site = await this.#site(tx, ctx.locationId);
        if (!site.active) throw new HttpError(409, 'location_inactive');
        if (!isBookableDay(input.date, site.today)) throw new HttpError(400, 'appointment_in_past');
        const me = await this.#myMembership(tx, actor.userId);
        if (scope === 'own' && input.providerMembershipId !== me) throw new HttpError(403, 'provider_scope');
        const [patient] = await tx
          .select({ status: patients.status, mergedInto: patients.mergedInto })
          .from(patients)
          .where(eq(patients.id, input.patientId));
        if (!patient) throw new HttpError(404, 'patient_not_found');
        if (patient.mergedInto) throw new HttpError(409, 'patient_merged');
        if (patient.status !== 'active') throw new HttpError(409, 'patient_inactive');
        await this.#requireActiveType(tx, input.appointmentTypeId);
        if (input.providerMembershipId) await this.#requireProvider(tx, input.providerMembershipId, ctx.locationId);

        const code = await nextAppointmentCode(tx, ctx.organizationId, { id: ctx.locationId, code: site.code });
        const [startRow] = await tx.execute<{ s: Date }>(sql`select ${localStart(input.date, input.time, site.timezone)} as s`).then((r) => r.rows);
        if (!startRow) throw new Error('sin inicio');
        const startsAt = new Date(startRow.s);
        const [created] = await tx
          .insert(appointments)
          .values({
            organizationId: ctx.organizationId,
            locationId: ctx.locationId,
            patientId: input.patientId,
            appointmentTypeId: input.appointmentTypeId,
            providerMembershipId: input.providerMembershipId,
            code,
            startsAt,
            durationMinutes: input.durationMinutes,
          })
          .returning({ id: appointments.id });
        if (!created) throw new Error('sin cita');
        if (input.notes) {
          await tx
            .update(appointments)
            .set({ notesEnc: await this.#cipher.encrypt(input.notes, notesContext(ctx.organizationId, created.id)) })
            .where(eq(appointments.id, created.id));
        }
        const overlap = input.providerMembershipId
          ? (await this.#conflict(tx, input.providerMembershipId, startsAt, input.durationMinutes, created.id)) !== null
          : false;
        await this.#audit.inTx(tx, ctx.organizationId, {
          action: 'appointment.created',
          ...this.#auditBase(actor, ctx.locationId, created.id, meta),
          metadata: { code, patientId: input.patientId, provider: input.providerMembershipId !== null, overlap },
        });
        await this.#after(tx, actor, {
          appointment: { id: created.id, code, locationId: ctx.locationId, startsAt, status: 'SCHEDULED' },
          before: null,
          after: input.providerMembershipId,
        });
        return { status: 201, resourceIds: [created.id] };
      },
      (ids) => this.#saved(actor, ids[0] ?? ''),
    );
    return result.body;
  }

  /** S-REC-10 «Editar cita»: tipo, duración, proveedor y notas. Sin cambios, devuelve la cita tal cual. */
  async update(actor: Principal, appointmentId: string, raw: UpdateAppointmentInput, meta: RequestMeta): Promise<AppointmentSaved> {
    const ctx = requireContext(actor);
    const input: UpdateData = updateAppointmentSchema.parse(raw);
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const current = await this.#current(tx, ctx.locationId, appointmentId);
      const me = await this.#myMembership(tx, actor.userId);
      this.#requireAction(actor, current, me, 'edit', input.expectedVersion);

      const changes: Partial<typeof appointments.$inferInsert> = {};
      const fields: string[] = [];
      if (input.appointmentTypeId !== undefined && input.appointmentTypeId !== current.appointmentTypeId) {
        await this.#requireActiveType(tx, input.appointmentTypeId);
        changes.appointmentTypeId = input.appointmentTypeId;
        fields.push('appointmentType');
      }
      if (input.durationMinutes !== undefined && input.durationMinutes !== current.durationMinutes) {
        changes.durationMinutes = input.durationMinutes;
        fields.push('duration');
      }
      if (input.providerMembershipId !== undefined && input.providerMembershipId !== current.providerMembershipId) {
        // El Proveedor no reasigna: su campo es fijo («Yo ·»).
        if (appointmentScope(actor.roles) === 'own') throw new HttpError(403, 'provider_scope');
        if (input.providerMembershipId) await this.#requireProvider(tx, input.providerMembershipId, ctx.locationId);
        changes.providerMembershipId = input.providerMembershipId;
        fields.push('provider');
      }
      if (input.notes !== undefined) {
        const before = current.notesEnc ? await this.#cipher.decrypt(current.notesEnc, notesContext(ctx.organizationId, current.id)) : null;
        if (input.notes !== before) {
          changes.notesEnc = input.notes ? await this.#cipher.encrypt(input.notes, notesContext(ctx.organizationId, current.id)) : null;
          fields.push('notes');
        }
      }
      if (fields.length === 0) return;

      const version = current.version + 1;
      await tx
        .update(appointments)
        .set({ ...changes, version, updatedAt: sql`now()` })
        .where(eq(appointments.id, current.id));
      const provider = changes.providerMembershipId !== undefined ? changes.providerMembershipId : current.providerMembershipId;
      const duration = changes.durationMinutes ?? current.durationMinutes;
      const overlap = provider ? (await this.#conflict(tx, provider, current.startsAt, duration, current.id)) !== null : false;
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'appointment.updated',
        ...this.#auditBase(actor, ctx.locationId, current.id, meta),
        // Solo los nombres de los campos (ADR 0018).
        metadata: { code: current.code, fields: fields.join(','), version, overlap },
      });
      await this.#after(tx, actor, {
        appointment: { id: current.id, code: current.code, locationId: ctx.locationId, startsAt: current.startsAt, status: current.status },
        before: current.providerMembershipId,
        after: provider,
      });
    });
    return this.#saved(actor, appointmentId);
  }

  /** S-REC-13 Reprogramar: fecha, hora y duración. La cita conserva tipo, proveedor y notas. */
  async reschedule(actor: Principal, appointmentId: string, raw: RescheduleAppointmentInput, meta: RequestMeta): Promise<AppointmentSaved> {
    const ctx = requireContext(actor);
    const input: RescheduleData = rescheduleAppointmentSchema.parse(raw);
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const current = await this.#current(tx, ctx.locationId, appointmentId);
      const me = await this.#myMembership(tx, actor.userId);
      this.#requireAction(actor, current, me, 'reschedule', input.expectedVersion);
      const site = await this.#site(tx, ctx.locationId);
      if (!site.active) throw new HttpError(409, 'location_inactive');
      if (!isBookableDay(input.date, site.today)) throw new HttpError(400, 'appointment_in_past');
      const [startRow] = await tx.execute<{ s: Date }>(sql`select ${localStart(input.date, input.time, site.timezone)} as s`).then((r) => r.rows);
      if (!startRow) throw new Error('sin inicio');
      const startsAt = new Date(startRow.s);
      const version = current.version + 1;
      await tx
        .update(appointments)
        .set({ startsAt, durationMinutes: input.durationMinutes, version, updatedAt: sql`now()` })
        .where(eq(appointments.id, current.id));
      const overlap = current.providerMembershipId
        ? (await this.#conflict(tx, current.providerMembershipId, startsAt, input.durationMinutes, current.id)) !== null
        : false;
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'appointment.rescheduled',
        ...this.#auditBase(actor, ctx.locationId, current.id, meta),
        metadata: { code: current.code, version, overlap },
      });
      await this.#after(tx, actor, {
        appointment: { id: current.id, code: current.code, locationId: ctx.locationId, startsAt, status: current.status },
        before: current.providerMembershipId,
        after: current.providerMembershipId,
      });
    });
    return this.#saved(actor, appointmentId);
  }

  /** Confirmar, cancelar (motivo obligatorio) o marcar no presentado (desde la hora de inicio). */
  async transition(
    actor: Principal,
    appointmentId: string,
    action: 'confirm' | 'cancel' | 'no_show',
    input: { expectedVersion: number; reason?: string },
    meta: RequestMeta,
  ): Promise<AppointmentSaved> {
    const ctx = requireContext(actor);
    const target: Record<typeof action, AppointmentStatus> = { confirm: 'CONFIRMED', cancel: 'CANCELLED', no_show: 'NO_SHOW' };
    const auditAction = { confirm: 'appointment.confirmed', cancel: 'appointment.cancelled', no_show: 'appointment.no_show' }[action];
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const current = await this.#current(tx, ctx.locationId, appointmentId);
      const me = await this.#myMembership(tx, actor.userId);
      if (action === 'no_show' && current.startsAt.getTime() > Date.now()) {
        // Alcance, versión y estado primero; después, la hora (decisión de T-015).
        this.#requireAction(actor, current, me, 'cancel', input.expectedVersion);
        throw new HttpError(409, 'no_show_before_start');
      }
      this.#requireAction(actor, current, me, action, input.expectedVersion);
      if (action === 'cancel' && !input.reason) throw new HttpError(400, 'missing_reason');
      const status = target[action];
      const version = current.version + 1;
      await tx
        .update(appointments)
        .set({
          status,
          version,
          updatedAt: sql`now()`,
          ...(action === 'cancel' && input.reason
            ? { cancelReasonEnc: await this.#cipher.encrypt(input.reason, reasonContext(ctx.organizationId, current.id)) }
            : {}),
        })
        .where(eq(appointments.id, current.id));
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: auditAction,
        ...this.#auditBase(actor, ctx.locationId, current.id, meta),
        ...(action === 'cancel' ? { reason: input.reason } : {}),
        metadata: { code: current.code, from: current.status, to: status, version },
      });
      await this.#after(tx, actor, {
        appointment: { id: current.id, code: current.code, locationId: ctx.locationId, startsAt: current.startsAt, status },
        before: current.providerMembershipId,
        after: current.providerMembershipId,
      });
    });
    return this.#saved(actor, appointmentId);
  }

  // --- Ayudas ----------------------------------------------------------------

  #requireScope(actor: Principal): AppointmentScope {
    const scope = appointmentScope(actor.roles);
    if (scope === 'none') throw new HttpError(403, 'forbidden');
    return scope;
  }

  /**
   * La acción está en la matriz para el estado, el rol y la versión. Si la
   * cita es final: 409 (appointment_not_editable o invalid_appointment_transition).
   * Si no es suya y quien llama es Proveedor: 403 provider_scope.
   */
  #requireAction(actor: Principal, current: Current, me: string, action: AppointmentAction, expectedVersion: number): void {
    const scope = this.#requireScope(actor);
    if (scope === 'own' && current.providerMembershipId !== me) throw new HttpError(403, 'provider_scope');
    if (current.version !== expectedVersion) throw new HttpError(409, 'version_conflict');
    const allowed = appointmentActions({
      status: current.status,
      scope,
      isOwn: current.providerMembershipId === me,
      canCheckIn: actor.permissions.has('appointments.check_in'),
      startsAt: current.startsAt.toISOString(),
      now: new Date(),
      isToday: current.isToday,
    });
    if (!allowed.includes(action)) {
      throw new HttpError(409, action === 'edit' || action === 'reschedule' ? 'appointment_not_editable' : 'invalid_appointment_transition');
    }
  }

  /** La cita de la sede activa, bloqueada para el cambio. 404 si es de otra sede o no existe. */
  async #current(tx: Tx, locationId: string, appointmentId: string): Promise<Current> {
    const [row] = await tx
      .select({
        id: appointments.id,
        code: appointments.code,
        locationId: appointments.locationId,
        startsAt: appointments.startsAt,
        durationMinutes: appointments.durationMinutes,
        status: appointments.status,
        providerMembershipId: appointments.providerMembershipId,
        appointmentTypeId: appointments.appointmentTypeId,
        notesEnc: appointments.notesEnc,
        version: appointments.version,
        // ¿Es de hoy en la sede? (Para «Registrar llegada».)
        isToday: sql<boolean>`((${appointments.startsAt} at time zone (select l.timezone from app.locations l where l.id = ${appointments.locationId}))::date = (now() at time zone (select l.timezone from app.locations l where l.id = ${appointments.locationId}))::date)`,
      })
      .from(appointments)
      .where(and(eq(appointments.id, appointmentId), eq(appointments.locationId, locationId)))
      .for('update');
    if (!row) throw new HttpError(404, 'appointment_not_found');
    return { ...row, status: row.status as AppointmentStatus };
  }

  /** Primera cita del proveedor que se cruza con [inicio, inicio + duración), en toda la organización. */
  async #conflict(tx: Tx, providerMembershipId: string, startsAt: Date, durationMinutes: number, excludeId: string | null): Promise<Date | null> {
    const end = new Date(startsAt.getTime() + durationMinutes * 60_000);
    const [row] = await tx
      .select({ startsAt: appointments.startsAt })
      .from(appointments)
      .where(
        and(
          eq(appointments.providerMembershipId, providerMembershipId),
          notInArray(appointments.status, ['CANCELLED', 'NO_SHOW']),
          excludeId ? ne(appointments.id, excludeId) : undefined,
          sql`${appointments.startsAt} < ${end.toISOString()}::timestamptz`,
          sql`${appointments.startsAt} + make_interval(mins => ${appointments.durationMinutes}) > ${startsAt.toISOString()}::timestamptz`,
        ),
      )
      .orderBy(asc(appointments.startsAt))
      .limit(1);
    return row ? row.startsAt : null;
  }

  async #requireActiveType(tx: Tx, typeId: string): Promise<void> {
    const [type] = await tx.select({ active: appointmentTypes.active }).from(appointmentTypes).where(eq(appointmentTypes.id, typeId));
    if (!type) throw new HttpError(400, 'appointment_type_not_found');
    if (!type.active) throw new HttpError(409, 'appointment_type_inactive');
  }

  /** Proveedor activo con rol Proveedor en la sede; si no, 400 invalid_provider. */
  async #requireProvider(tx: Tx, membershipId: string, locationId: string): Promise<void> {
    const providers = await this.#activeProviders(tx, locationId);
    if (!providers.some((p) => p.id === membershipId)) throw new HttpError(400, 'invalid_provider');
  }

  async #activeProviders(tx: Tx, locationId: string): Promise<{ id: string; userId: string }[]> {
    return tx
      .selectDistinct({ id: memberships.id, userId: memberships.userId })
      .from(memberships)
      .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
      .where(and(eq(memberships.status, 'active'), eq(membershipRoles.role, 'proveedor'), eq(membershipRoles.locationId, locationId)));
  }

  async #myMembership(tx: Tx, userId: string): Promise<string> {
    const [mine] = await tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, userId));
    return mine?.id ?? '';
  }

  async #site(tx: Tx, locationId: string) {
    const [row] = await tx
      .select({
        code: locations.code,
        timezone: locations.timezone,
        active: locations.active,
        today: sql<string>`((now() at time zone ${locations.timezone})::date)::text`,
      })
      .from(locations)
      .where(eq(locations.id, locationId));
    if (!row) throw new HttpError(403, 'no_active_context');
    return row;
  }

  #auditBase(actor: Principal, locationId: string, appointmentId: string, meta: RequestMeta) {
    return { actorType: 'user' as const, actorId: actor.userId, locationId, entityType: 'appointment', entityId: appointmentId, ...meta };
  }

  /**
   * Después de cada cambio, en la misma transacción:
   *  - el evento en vivo de la sede (`appointment.changed`, id y estado);
   *  - los avisos de la campana: «Cita asignada a usted» al proveedor nuevo,
   *    «Cita reasignada» al anterior y «Cita actualizada» al de siempre.
   *    Nadie recibe un aviso por lo que hizo él mismo.
   */
  async #after(
    tx: Tx,
    actor: Principal,
    change: {
      appointment: { id: string; code: string; locationId: string; startsAt: Date; status: AppointmentStatus };
      before: string | null;
      after: string | null;
    },
  ): Promise<void> {
    const ctx = requireContext(actor);
    const { appointment, before, after } = change;
    await notifyRealtime(tx, {
      t: 'event',
      org: ctx.organizationId,
      loc: appointment.locationId,
      name: 'appointment.changed',
      ids: { appointment: appointment.id },
      status: appointment.status,
    });
    const recipients: { membershipId: string; kind: NotificationKind }[] = [];
    if (after && after !== before) recipients.push({ membershipId: after, kind: 'appointment.assigned' });
    if (before && before !== after) recipients.push({ membershipId: before, kind: 'appointment.reassigned' });
    if (after && after === before) recipients.push({ membershipId: after, kind: 'appointment.changed' });
    if (recipients.length === 0) return;
    const users = await tx
      .select({ id: memberships.id, userId: memberships.userId })
      .from(memberships)
      .where(and(inArray(memberships.id, recipients.map((r) => r.membershipId)), eq(memberships.status, 'active')));
    const userOf = new Map(users.map((u) => [u.id, u.userId]));
    for (const recipient of recipients) {
      const userId = userOf.get(recipient.membershipId);
      if (!userId || userId === actor.userId) continue;
      await enqueueNotification(tx, this.#outboxKey, {
        organizationId: ctx.organizationId,
        userId,
        kind: recipient.kind,
        locationId: appointment.locationId,
        entityType: 'appointment',
        entityId: appointment.id,
        code: appointment.code,
        startsAt: appointment.startsAt,
      });
    }
  }

  /** Respuesta de cada cambio: ids, estado, versión y el aviso de solapamiento. Sin datos del paciente. */
  async #saved(actor: Principal, appointmentId: string): Promise<AppointmentSaved> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [row] = await tx
        .select({
          id: appointments.id,
          code: appointments.code,
          status: appointments.status,
          version: appointments.version,
          startsAt: appointments.startsAt,
          durationMinutes: appointments.durationMinutes,
          providerMembershipId: appointments.providerMembershipId,
        })
        .from(appointments)
        .where(and(eq(appointments.id, appointmentId), eq(appointments.locationId, ctx.locationId)));
      if (!row) throw new HttpError(404, 'appointment_not_found');
      const status = row.status as AppointmentStatus;
      const overlap =
        row.providerMembershipId && (status === 'SCHEDULED' || status === 'CONFIRMED')
          ? (await this.#conflict(tx, row.providerMembershipId, row.startsAt, row.durationMinutes, row.id)) !== null
          : false;
      const warnings: AppointmentWarning[] = overlap ? ['provider_overlap'] : [];
      return { id: row.id, code: row.code, status, version: row.version, warnings };
    });
  }

  /** Nombres de las personas (cuentas globales, fuera de RLS; solo las ya filtradas por organización). */
  async #names(userIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Map();
    const rows = await this.#plain.select({ id: userTable.id, name: userTable.name }).from(userTable).where(inArray(userTable.id, unique));
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}
