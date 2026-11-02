import {
  appointments,
  appointmentTypes,
  coverages,
  encounterEvents,
  encounters,
  enqueueNotification,
  locations,
  membershipRoles,
  memberships,
  nextEncounterCode,
  notifyRealtime,
  patients,
  user as userTable,
  type FieldCipher,
  type TenantDb,
  type Tx,
} from '@clinic/db';
import {
  arrivalSchema,
  assignProviderSchema,
  closeAction,
  closeEncounterSchema,
  encounterAbilities,
  encounterTransitionSchema,
  FORCE_ACTION,
  forceEncounterSchema,
  isOpenVisitStatus,
  PATIENT_ENCOUNTERS_PAGE_SIZE,
  permissionsFor,
  reopens,
  updateCoverageSchema,
  visitForce,
  visitTransition,
  type EncounterCoverage,
  type EncounterDetail,
  type EncounterEventAction,
  type EncounterProvider,
  type EncounterSaved,
  type EncounterTimelineEntry,
  type InsuranceTerm,
  type PatientEncounterRow,
  type PatientEncounters,
  type AppointmentStatus,
  type ArrivalAppointmentType,
  type ArrivalContext,
  type ArrivalData,
  type ArrivalInput,
  type ArrivalPatient,
  type ArrivalResult,
  type ArrivalSite,
  type CoverageType,
  type PatientStatus,
  type VisitRoute,
  type VisitStatus,
} from '@clinic/shared';
import { and, asc, desc, eq, inArray, ne, notInArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import type { AuditService } from './audit.ts';
import type { Clock } from './clock.ts';
import type { IdempotencyService } from './idempotency.ts';
import { rolesAt, type Principal } from './principal.ts';
import { HttpError, requireContext, type RequestMeta } from './services.ts';

// Llegada con cita y sin cita (T-017; S-REC-18 a 27).
//  - Todo va con withTenant y la organización y la sede de la sesión: la
//    visita se abre siempre en la sede activa (S-REC-22).
//  - Una sola transacción con Idempotency-Key (ADR 0019): código NOR1-V-…,
//    visita en «Registrado» por la máquina de estados compartida, primer
//    evento del historial, cobertura (cifrada, ADR 0026), cita en «Llegó»,
//    auditoría y eventos en vivo. Si algo falla se deshace todo: no existe la
//    «visita abierta sin cobertura» del manual.
//  - Registros simultáneos del mismo paciente: el paciente se bloquea
//    (FOR UPDATE) y los índices únicos parciales de la base son la red final.
//  - La hora sale del reloj inyectable (reglas de la fase 3).
//  - Los eventos en vivo llevan ids y estado; la auditoría, códigos, ruta y
//    tipo de cobertura. Nunca nombres ni datos del seguro.

const CLOSED: VisitStatus[] = ['COMPLETED', 'LEFT_EARLY', 'CANCELLED'];

const coverageContext = (organizationId: string, recordId: string, column: 'insurer_name' | 'member_id') => ({
  organizationId,
  table: 'coverages',
  column,
  recordId,
});

/** Motivo de un cambio del historial (cerrar o forzar), cifrado con su fila. */
const reasonContext = (organizationId: string, recordId: string) => ({ organizationId, table: 'encounter_events', column: 'reason', recordId });

/** La visita bloqueada para un cambio. */
interface Current {
  id: string;
  organizationId: string;
  locationId: string;
  patientId: string;
  code: string;
  status: VisitStatus;
  route: VisitRoute;
  version: number;
  closedAt: Date | null;
  providerMembershipId: string | null;
}

/** Violación de un índice único de la base, con el nombre de la restricción. */
function uniqueViolation(error: unknown): string | null {
  const pgError = ((error as { cause?: unknown }).cause ?? error) as { code?: string; constraint?: string };
  return pgError.code === '23505' ? (pgError.constraint ?? '') : null;
}

export class EncounterService {
  readonly #tenantDb: TenantDb;
  readonly #plain;
  readonly #audit: AuditService;
  readonly #cipher: FieldCipher;
  readonly #idempotency: IdempotencyService;
  readonly #clock: Clock;
  readonly #outboxKey: string;

  constructor(
    pool: pg.Pool,
    tenantDb: TenantDb,
    audit: AuditService,
    cipher: FieldCipher,
    idempotency: IdempotencyService,
    clock: Clock,
    outboxKey: string,
  ) {
    this.#tenantDb = tenantDb;
    this.#plain = drizzle({ client: pool });
    this.#outboxKey = outboxKey;
    this.#audit = audit;
    this.#cipher = cipher;
    this.#idempotency = idempotency;
    this.#clock = clock;
  }

  /** S-REC-18: la cita de la sede activa, su paciente y la sede. Lectura auditada. */
  async appointmentContext(actor: Principal, appointmentId: string, meta: RequestMeta): Promise<ArrivalContext> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const site = await this.#site(tx, ctx.locationId);
      const [row] = await tx
        .select({
          id: appointments.id,
          code: appointments.code,
          status: appointments.status,
          version: appointments.version,
          startsAt: appointments.startsAt,
          patientId: appointments.patientId,
          typeId: appointmentTypes.id,
          typeName: appointmentTypes.name,
          typeRoute: appointmentTypes.suggestedRoute,
        })
        .from(appointments)
        .innerJoin(appointmentTypes, eq(appointmentTypes.id, appointments.appointmentTypeId))
        .where(and(eq(appointments.id, appointmentId), eq(appointments.locationId, ctx.locationId)));
      if (!row) throw new HttpError(404, 'appointment_not_found');
      const patient = await this.#patient(tx, row.patientId);
      await this.#auditRead(tx, actor, 'appointment', row.id, meta);
      return {
        site: site.info,
        patient,
        appointment: {
          id: row.id,
          code: row.code,
          status: row.status as AppointmentStatus,
          version: row.version,
          startsAt: row.startsAt.toISOString(),
          isToday: this.#isToday(row.startsAt, site.info.timezone),
          appointmentType: { id: row.typeId, name: row.typeName, suggestedRoute: row.typeRoute as VisitRoute | null },
        },
        appointmentTypes: [],
      };
    });
  }

  /** S-REC-19: el paciente elegido, la sede y los tipos de cita activos. Lectura auditada. */
  async walkInContext(actor: Principal, patientId: string, meta: RequestMeta): Promise<ArrivalContext> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const site = await this.#site(tx, ctx.locationId);
      const patient = await this.#patient(tx, patientId);
      const types = await tx
        .select({ id: appointmentTypes.id, name: appointmentTypes.name, suggestedRoute: appointmentTypes.suggestedRoute })
        .from(appointmentTypes)
        .where(eq(appointmentTypes.active, true))
        .orderBy(sql`${appointmentTypes.sortOrder} asc nulls last`, asc(appointmentTypes.code));
      await this.#auditRead(tx, actor, 'patient', patientId, meta);
      return {
        site: site.info,
        patient,
        appointment: null,
        appointmentTypes: types.map((t): ArrivalAppointmentType => ({ ...t, suggestedRoute: t.suggestedRoute as VisitRoute | null })),
      };
    });
  }

  /** «Registrar llegada» o «Iniciar visita sin cita» (S-REC-26), con Idempotency-Key. */
  async arrive(actor: Principal, raw: ArrivalInput, idempotencyKey: string, meta: RequestMeta): Promise<ArrivalResult> {
    const ctx = requireContext(actor);
    const input: ArrivalData = arrivalSchema.parse(raw);
    // La apertura es un paso de Recepción en la máquina de estados (ADR 0027:
    // Propietario y Administrador, solo con ese rol en la sede).
    const opening = visitTransition(null, 'check_in', { route: input.route, roles: actor.roles });
    if (!opening.ok) throw new HttpError(403, 'forbidden');
    try {
      const result = await this.#idempotency.run(
        ctx.organizationId,
        idempotencyKey,
        { method: 'POST', path: '/api/encounters', body: raw },
        async (tx) => {
          const now = this.#clock.now();
          const site = await this.#site(tx, ctx.locationId);
          if (!site.info.active) throw new HttpError(409, 'location_inactive');

          let patientId: string;
          let appointmentTypeId: string | null;
          let appointment: { id: string; code: string; version: number } | null = null;
          if (input.source === 'appointment') {
            const [row] = await tx
              .select({
                id: appointments.id,
                code: appointments.code,
                status: appointments.status,
                version: appointments.version,
                startsAt: appointments.startsAt,
                patientId: appointments.patientId,
                appointmentTypeId: appointments.appointmentTypeId,
              })
              .from(appointments)
              .where(and(eq(appointments.id, input.appointmentId), eq(appointments.locationId, ctx.locationId)))
              .for('update');
            if (!row) throw new HttpError(404, 'appointment_not_found');
            // El estado antes que la versión: si otro puesto ya registró la
            // llegada, el motivo útil es ese, no el conflicto de versión.
            if (row.status === 'ARRIVED') throw new HttpError(409, 'appointment_already_checked_in');
            if (row.status !== 'SCHEDULED' && row.status !== 'CONFIRMED') throw new HttpError(409, 'invalid_appointment_transition');
            if (row.version !== input.expectedVersion) throw new HttpError(409, 'version_conflict');
            if (!this.#isToday(row.startsAt, site.info.timezone)) throw new HttpError(409, 'appointment_not_today');
            patientId = row.patientId;
            appointmentTypeId = row.appointmentTypeId;
            appointment = { id: row.id, code: row.code, version: row.version };
          } else {
            patientId = input.patientId;
            appointmentTypeId = input.appointmentTypeId;
            if (appointmentTypeId) {
              const [type] = await tx.select({ active: appointmentTypes.active }).from(appointmentTypes).where(eq(appointmentTypes.id, appointmentTypeId));
              if (!type) throw new HttpError(400, 'appointment_type_not_found');
              if (!type.active) throw new HttpError(409, 'appointment_type_inactive');
            }
          }

          // El paciente bloqueado serializa los registros simultáneos en la sede.
          const [patient] = await tx
            .select({ status: patients.status, mergedInto: patients.mergedInto })
            .from(patients)
            .where(eq(patients.id, patientId))
            .for('update');
          if (!patient) throw new HttpError(404, 'patient_not_found');
          if (patient.mergedInto) throw new HttpError(409, 'patient_merged', { principalId: patient.mergedInto });
          if (patient.status !== 'active') throw new HttpError(409, 'patient_inactive', { patientId });
          const [open] = await tx
            .select({ id: encounters.id })
            .from(encounters)
            .where(and(eq(encounters.patientId, patientId), eq(encounters.locationId, ctx.locationId), notInArray(encounters.status, CLOSED)));
          if (open) throw new HttpError(409, 'encounter_already_open', { encounterId: open.id });

          const me = await this.#myMembership(tx, actor.userId);
          const code = await nextEncounterCode(tx, ctx.organizationId, { id: ctx.locationId, code: site.info.code });
          const encounterId = uuidv7();
          await tx.insert(encounters).values({
            id: encounterId,
            organizationId: ctx.organizationId,
            locationId: ctx.locationId,
            patientId,
            appointmentId: appointment?.id ?? null,
            appointmentTypeId,
            code,
            source: input.source,
            route: input.route,
            status: opening.to,
            arrivedAt: now,
          });
          await tx.insert(encounterEvents).values({
            organizationId: ctx.organizationId,
            encounterId,
            locationId: ctx.locationId,
            action: 'check_in',
            fromStatus: null,
            toStatus: opening.to,
            actorType: 'user',
            actorMembershipId: me,
            encounterVersion: 1,
            occurredAt: now,
          });
          await this.#insertCoverage(tx, ctx.organizationId, encounterId, input.coverage);
          if (appointment) {
            await tx
              .update(appointments)
              .set({ status: 'ARRIVED', version: appointment.version + 1, updatedAt: now })
              .where(eq(appointments.id, appointment.id));
          }

          const base = { actorType: 'user' as const, actorId: actor.userId, locationId: ctx.locationId, ...meta };
          await this.#audit.inTx(tx, ctx.organizationId, {
            action: 'encounter.checked_in',
            ...base,
            entityType: 'encounter',
            entityId: encounterId,
            metadata: {
              code,
              source: input.source,
              route: input.route,
              coverage: input.coverage.type,
              ...(appointment ? { appointmentCode: appointment.code } : {}),
            },
          });
          if (appointment) {
            await this.#audit.inTx(tx, ctx.organizationId, {
              action: 'appointment.arrived',
              ...base,
              entityType: 'appointment',
              entityId: appointment.id,
              metadata: { code: appointment.code, encounterCode: code, version: appointment.version + 1 },
            });
            await notifyRealtime(tx, {
              t: 'event',
              org: ctx.organizationId,
              loc: ctx.locationId,
              name: 'appointment.changed',
              ids: { appointment: appointment.id },
              status: 'ARRIVED',
            });
          }
          await notifyRealtime(tx, {
            t: 'event',
            org: ctx.organizationId,
            loc: ctx.locationId,
            name: 'encounter.changed',
            ids: { encounter: encounterId },
            status: opening.to,
          });
          return { status: 201, resourceIds: [encounterId] };
        },
        (ids) => this.#result(actor, ids[0] ?? ''),
      );
      return result.body;
    } catch (error) {
      // Red final: dos registros a la vez que se cruzaron fuera del bloqueo.
      const constraint = uniqueViolation(error);
      if (constraint === 'encounters_open_patient_location_key') throw new HttpError(409, 'encounter_already_open');
      if (constraint === 'encounters_open_appointment_key') throw new HttpError(409, 'appointment_already_checked_in');
      throw error;
    }
  }

  // --- Pantalla de la visita (T-018; S-CLI-04 a 12, S-CLI-24) ---------------

  /**
   * S-CLI-04: la visita de la sede activa con su paciente, su cobertura
   * (descifrada), su historial y lo que puede hacer quien la abre. Una sola
   * lectura auditada (`encounter.view`): el historial viene en la misma respuesta.
   */
  async detail(actor: Principal, encounterId: string, meta: RequestMeta): Promise<EncounterDetail> {
    const ctx = requireContext(actor);
    const data = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [row] = await tx
        .select({
          id: encounters.id,
          code: encounters.code,
          status: encounters.status,
          route: encounters.route,
          version: encounters.version,
          arrivedAt: encounters.arrivedAt,
          closedAt: encounters.closedAt,
          providerMembershipId: encounters.providerMembershipId,
          patientId: patients.id,
          patientCode: patients.code,
          firstName: patients.firstName,
          lastName: patients.lastName,
          birthDate: patients.birthDate,
          locationId: locations.id,
          locationCode: locations.code,
          locationName: locations.name,
          timezone: locations.timezone,
          typeId: appointmentTypes.id,
          typeName: appointmentTypes.name,
        })
        .from(encounters)
        .innerJoin(patients, eq(patients.id, encounters.patientId))
        .innerJoin(locations, eq(locations.id, encounters.locationId))
        .leftJoin(appointmentTypes, eq(appointmentTypes.id, encounters.appointmentTypeId))
        .where(and(eq(encounters.id, encounterId), eq(encounters.locationId, ctx.locationId)));
      if (!row) throw new HttpError(404, 'encounter_not_found');
      const [coverage] = await tx.select().from(coverages).where(eq(coverages.encounterId, row.id));
      const events = await tx
        .select()
        .from(encounterEvents)
        .where(eq(encounterEvents.encounterId, row.id))
        .orderBy(desc(encounterEvents.encounterVersion), desc(encounterEvents.occurredAt), desc(encounterEvents.id));
      const memberIds = [...events.map((e) => e.actorMembershipId), row.providerMembershipId].filter((id): id is string => id !== null);
      const members = memberIds.length > 0 ? await tx.select({ id: memberships.id, userId: memberships.userId }).from(memberships).where(inArray(memberships.id, [...new Set(memberIds)])) : [];
      const me = await this.#myMembership(tx, actor.userId);
      await this.#auditRead(tx, actor, 'encounter', row.id, meta);
      return { row, coverage, events, members, me };
    });
    const { row, coverage, events, members, me } = data;
    const names = await this.#names(members.map((m) => m.userId));
    const nameOf = (membershipId: string | null) => {
      const member = members.find((m) => m.id === membershipId);
      return member ? (names.get(member.userId) ?? null) : null;
    };
    const status = row.status as VisitStatus;
    const route = row.route as VisitRoute;
    const timeline: EncounterTimelineEntry[] = await Promise.all(
      events.map(async (e) => ({
        id: e.id,
        action: e.action as EncounterEventAction,
        fromStatus: e.fromStatus as VisitStatus | null,
        toStatus: e.toStatus as VisitStatus,
        forced: e.forced,
        reason: e.reasonEnc ? await this.#cipher.decrypt(e.reasonEnc, reasonContext(ctx.organizationId, e.id)) : null,
        occurredAt: e.occurredAt.toISOString(),
        version: e.encounterVersion,
        actor:
          e.actorType === 'user'
            ? e.actorMembershipId === me
              ? { kind: 'me' as const, name: null }
              : { kind: 'user' as const, name: nameOf(e.actorMembershipId) }
            : { kind: e.actorType as 'kiosk' | 'system', name: null },
      })),
    );
    const latest = timeline[0];
    const closed = !isOpenVisitStatus(status);
    return {
      id: row.id,
      code: row.code,
      status,
      route,
      version: row.version,
      arrivedAt: row.arrivedAt.toISOString(),
      closedAt: row.closedAt ? row.closedAt.toISOString() : null,
      statusSince: latest?.occurredAt ?? row.arrivedAt.toISOString(),
      closeReason: closed && latest?.toStatus === status ? latest.reason : null,
      serverNow: this.#clock.now().toISOString(),
      today: this.#day(this.#clock.now(), row.timezone),
      patient: { id: row.patientId, code: row.patientCode, firstName: row.firstName, lastName: row.lastName, birthDate: row.birthDate },
      location: { id: row.locationId, code: row.locationCode, name: row.locationName, timezone: row.timezone },
      appointmentType: row.typeId && row.typeName ? { id: row.typeId, name: row.typeName } : null,
      provider: row.providerMembershipId ? { membershipId: row.providerMembershipId, name: nameOf(row.providerMembershipId) ?? '' } : null,
      myMembershipId: me,
      coverage: coverage ? await this.#coverageView(ctx.organizationId, coverage) : null,
      timeline,
      abilities: encounterAbilities({
        status,
        route,
        roles: actor.roles,
        canManage: actor.permissions.has('visits.manage'),
        canForce: this.#canForce(actor),
        isMine: row.providerMembershipId !== null && row.providerMembershipId === me,
      }),
    };
  }

  /** S-CLI-07: un paso regular de la máquina de estados (ni la apertura ni los cierres). */
  async transition(actor: Principal, encounterId: string, raw: unknown, meta: RequestMeta): Promise<EncounterSaved> {
    const input = encounterTransitionSchema.parse(raw);
    return this.#change(actor, encounterId, async (tx, current, me, now) => {
      this.#requireVersion(current, input.expectedVersion);
      if (!isOpenVisitStatus(current.status)) throw new HttpError(409, 'encounter_closed');
      const result = visitTransition(current.status, input.action, { route: current.route, roles: actor.roles, hasOpenOrders: false });
      if (!result.ok) throw this.#transitionError(result.reason);
      await this.#move(tx, actor, current, me, now, meta, { action: input.action, to: result.to, forced: false, reason: null, audit: 'encounter.transitioned' });
    });
  }

  /** S-CLI-09 «Cerrar visita»: «Se retiró antes» o «Cancelada», con motivo obligatorio (paso de Recepción). */
  async close(actor: Principal, encounterId: string, raw: unknown, meta: RequestMeta): Promise<EncounterSaved> {
    const input = closeEncounterSchema.parse(raw);
    return this.#change(actor, encounterId, async (tx, current, me, now) => {
      this.#requireVersion(current, input.expectedVersion);
      if (!isOpenVisitStatus(current.status)) throw new HttpError(409, 'encounter_closed');
      const action = closeAction(input.outcome);
      const result = visitTransition(current.status, action, { route: current.route, roles: actor.roles });
      if (!result.ok) throw this.#transitionError(result.reason);
      await this.#move(tx, actor, current, me, now, meta, { action, to: result.to, forced: false, reason: input.reason, audit: 'encounter.closed' });
    });
  }

  /**
   * S-CLI-10 «Forzar estado…» (ADR 0033): Propietario o Administrador con un
   * rol clínico en la sede. Destinos del manual (forceTargets); puede reabrir
   * una visita cerrada si el paciente no tiene otra abierta en la sede.
   */
  async force(actor: Principal, encounterId: string, raw: unknown, meta: RequestMeta): Promise<EncounterSaved> {
    const input = forceEncounterSchema.parse(raw);
    if (!this.#canForce(actor)) throw new HttpError(403, 'forbidden');
    return this.#change(actor, encounterId, async (tx, current, me, now) => {
      this.#requireVersion(current, input.expectedVersion);
      const result = visitForce(current.status, input.status, current.route);
      if (!result.ok) throw new HttpError(409, 'invalid_transition');
      if (reopens(current.status, result.to)) {
        const [other] = await tx
          .select({ id: encounters.id })
          .from(encounters)
          .where(
            and(
              eq(encounters.patientId, current.patientId),
              eq(encounters.locationId, current.locationId),
              ne(encounters.id, current.id),
              notInArray(encounters.status, CLOSED),
            ),
          );
        if (other) throw new HttpError(409, 'encounter_already_open', { encounterId: other.id });
      }
      await this.#move(tx, actor, current, me, now, meta, { action: FORCE_ACTION, to: result.to, forced: true, reason: input.reason, audit: 'encounter.forced' });
    });
  }

  /**
   * S-CLI-05/06: asignar proveedor (Recepción) o «Asignarme» (rol Proveedor).
   * El proveedor debe estar activo con el rol Proveedor en la sede. Volver a
   * elegir el mismo no escribe nada. El aviso «Paciente asignado a usted» va
   * por el outbox con el código de la visita; nadie se avisa a sí mismo.
   */
  async assignProvider(actor: Principal, encounterId: string, raw: unknown, meta: RequestMeta): Promise<EncounterSaved> {
    const input = assignProviderSchema.parse(raw);
    return this.#change(actor, encounterId, async (tx, current, me, now) => {
      const self = input.providerMembershipId === me;
      if (!actor.permissions.has('visits.manage') && !(self && actor.roles.includes('proveedor'))) throw new HttpError(403, 'assign_not_allowed');
      if (current.providerMembershipId === input.providerMembershipId) return;
      this.#requireVersion(current, input.expectedVersion);
      if (!isOpenVisitStatus(current.status)) throw new HttpError(409, 'encounter_closed');
      const [provider] = await tx
        .selectDistinct({ id: memberships.id, userId: memberships.userId })
        .from(memberships)
        .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
        .where(
          and(
            eq(memberships.id, input.providerMembershipId),
            eq(memberships.status, 'active'),
            eq(membershipRoles.role, 'proveedor'),
            eq(membershipRoles.locationId, current.locationId),
          ),
        );
      if (!provider) throw new HttpError(400, 'invalid_provider');
      const version = current.version + 1;
      await tx.update(encounters).set({ providerMembershipId: provider.id, version, updatedAt: now }).where(eq(encounters.id, current.id));
      await this.#audit.inTx(tx, current.organizationId, {
        action: 'encounter.provider_assigned',
        ...this.#auditBase(actor, current, meta),
        metadata: { code: current.code, version, self, reassigned: current.providerMembershipId !== null },
      });
      if (provider.userId !== actor.userId) {
        await enqueueNotification(tx, this.#outboxKey, {
          organizationId: current.organizationId,
          userId: provider.userId,
          kind: 'encounter.provider_assigned',
          locationId: current.locationId,
          entityType: 'encounter',
          entityId: current.id,
          code: current.code,
        });
      }
      await this.#changed(tx, current, current.status);
    });
  }

  /** S-CLI-06: proveedores activos de la sede activa, por nombre. */
  async providers(actor: Principal): Promise<EncounterProvider[]> {
    const ctx = requireContext(actor);
    const rows = await this.#tenantDb.withTenant(ctx.organizationId, (tx) =>
      tx
        .selectDistinct({ id: memberships.id, userId: memberships.userId })
        .from(memberships)
        .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
        .where(and(eq(memberships.status, 'active'), eq(membershipRoles.role, 'proveedor'), eq(membershipRoles.locationId, ctx.locationId))),
    );
    const names = await this.#names(rows.map((r) => r.userId));
    return rows
      .map((r) => ({ membershipId: r.id, name: names.get(r.userId) ?? '' }))
      .filter((p) => p.name !== '')
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  /**
   * S-CLI-12: corregir la cobertura con la visita abierta (Recepción), con la
   * versión de la cobertura. La auditoría guarda solo los nombres de los
   * campos cambiados (ADR 0018); los datos del seguro van cifrados (ADR 0026).
   */
  async updateCoverage(actor: Principal, encounterId: string, raw: unknown, meta: RequestMeta): Promise<EncounterSaved> {
    const input = updateCoverageSchema.parse(raw);
    return this.#change(actor, encounterId, async (tx, current) => {
      if (!isOpenVisitStatus(current.status)) throw new HttpError(409, 'encounter_closed');
      const [row] = await tx.select().from(coverages).where(eq(coverages.encounterId, current.id)).for('update');
      if (!row) throw new HttpError(404, 'coverage_not_found');
      if (row.version !== input.expectedVersion) throw new HttpError(409, 'version_conflict');
      const before = await this.#coverageView(current.organizationId, row);
      const next = input.coverage;
      const after = {
        type: next.type,
        insurerName: next.type === 'insurance' ? next.insurerName : null,
        memberId: next.type === 'insurance' ? next.memberId : null,
        term: next.type === 'insurance' ? next.term : null,
        amountCents: next.type === 'insurance' ? next.amountCents : null,
        coinsuranceBp: next.type === 'insurance' ? next.coinsuranceBp : null,
      };
      const fields = (['type', 'insurerName', 'memberId', 'term', 'amountCents', 'coinsuranceBp'] as const).filter((f) => before[f] !== after[f]);
      if (fields.length === 0) return;
      const version = row.version + 1;
      await tx
        .update(coverages)
        .set({
          type: after.type,
          insurerNameEnc: after.insurerName ? await this.#cipher.encrypt(after.insurerName, coverageContext(current.organizationId, row.id, 'insurer_name')) : null,
          memberIdEnc: after.memberId ? await this.#cipher.encrypt(after.memberId, coverageContext(current.organizationId, row.id, 'member_id')) : null,
          term: after.term,
          amountCents: after.amountCents,
          coinsuranceBp: after.coinsuranceBp,
          version,
          updatedAt: this.#clock.now(),
        })
        .where(eq(coverages.id, row.id));
      await this.#audit.inTx(tx, current.organizationId, {
        action: 'encounter.coverage_updated',
        ...this.#auditBase(actor, current, meta),
        // Solo los nombres de los campos, nunca los valores (ADR 0018).
        metadata: { code: current.code, fields: fields.join(','), coverage: after.type, version },
      });
      await this.#changed(tx, current, current.status);
    });
  }

  /**
   * S-PAC-08 Pestaña Visitas y «Última visita» del perfil: visitas del
   * paciente en las sedes donde quien mira tiene un rol clínico (decisión del
   * 2026-11-01), de la más reciente a la más antigua, de 50 en 50. Auditada.
   */
  async forPatient(actor: Principal, patientId: string, offset: number, meta: RequestMeta): Promise<PatientEncounters> {
    const ctx = requireContext(actor);
    const data = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [patient] = await tx.select({ id: patients.id }).from(patients).where(eq(patients.id, patientId));
      if (!patient) throw new HttpError(404, 'patient_not_found');
      const sites = await tx.select({ id: locations.id, code: locations.code, name: locations.name }).from(locations);
      const allowed = sites.filter((s) => permissionsFor(rolesAt(actor.assignments, ctx.organizationId, s.id)).has('patients.access'));
      const rows =
        allowed.length === 0
          ? []
          : await tx
              .select({
                id: encounters.id,
                code: encounters.code,
                arrivedAt: encounters.arrivedAt,
                status: encounters.status,
                route: encounters.route,
                locationId: encounters.locationId,
                providerMembershipId: encounters.providerMembershipId,
              })
              .from(encounters)
              .where(and(eq(encounters.patientId, patientId), inArray(encounters.locationId, allowed.map((s) => s.id))))
              .orderBy(desc(encounters.arrivedAt), desc(encounters.code))
              .limit(PATIENT_ENCOUNTERS_PAGE_SIZE + 1)
              .offset(offset);
      const page = rows.slice(0, PATIENT_ENCOUNTERS_PAGE_SIZE);
      const providerIds = [...new Set(page.map((r) => r.providerMembershipId).filter((id): id is string => id !== null))];
      const members = providerIds.length > 0 ? await tx.select({ id: memberships.id, userId: memberships.userId }).from(memberships).where(inArray(memberships.id, providerIds)) : [];
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'patient.encounters_read',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'patient',
        entityId: patientId,
        ...meta,
        metadata: { offset, results: page.length },
      });
      return { page, more: rows.length > page.length, sites, members };
    });
    const names = await this.#names(data.members.map((m) => m.userId));
    const siteOf = new Map(data.sites.map((s) => [s.id, s]));
    return {
      encounters: data.page.map((r): PatientEncounterRow => {
        const site = siteOf.get(r.locationId);
        const member = data.members.find((m) => m.id === r.providerMembershipId);
        return {
          id: r.id,
          code: r.code,
          arrivedAt: r.arrivedAt.toISOString(),
          status: r.status as VisitStatus,
          route: r.route as VisitRoute,
          location: { id: r.locationId, code: site?.code ?? '', name: site?.name ?? '' },
          provider: r.providerMembershipId ? { membershipId: r.providerMembershipId, name: member ? (names.get(member.userId) ?? '') : '' } : null,
        };
      }),
      nextOffset: data.more ? offset + data.page.length : null,
    };
  }

  // --- Cambios de la visita ----------------------------------------------------

  /**
   * Un cambio de la visita de la sede activa, en una transacción: la visita
   * se bloquea (FOR UPDATE) y la respuesta lleva su estado y su versión
   * (sin datos del paciente). 404 si es de otra sede o no existe.
   */
  async #change(actor: Principal, encounterId: string, work: (tx: Tx, current: Current, me: string, now: Date) => Promise<void>): Promise<EncounterSaved> {
    const ctx = requireContext(actor);
    try {
      return await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
        const [row] = await tx
          .select({
            id: encounters.id,
            organizationId: encounters.organizationId,
            locationId: encounters.locationId,
            patientId: encounters.patientId,
            code: encounters.code,
            status: encounters.status,
            route: encounters.route,
            version: encounters.version,
            closedAt: encounters.closedAt,
            providerMembershipId: encounters.providerMembershipId,
          })
          .from(encounters)
          .where(and(eq(encounters.id, encounterId), eq(encounters.locationId, ctx.locationId)))
          .for('update');
        if (!row) throw new HttpError(404, 'encounter_not_found');
        const current: Current = { ...row, status: row.status as VisitStatus, route: row.route as VisitRoute };
        const me = await this.#myMembership(tx, actor.userId);
        await work(tx, current, me, this.#clock.now());
        const [saved] = await tx.select({ status: encounters.status, version: encounters.version }).from(encounters).where(eq(encounters.id, current.id));
        return { id: current.id, status: (saved?.status ?? current.status) as VisitStatus, version: saved?.version ?? current.version };
      });
    } catch (error) {
      // Red final al reabrir: otra visita del paciente se abrió a la vez.
      if (uniqueViolation(error) === 'encounters_open_patient_location_key') throw new HttpError(409, 'encounter_already_open');
      throw error;
    }
  }

  #requireVersion(current: Current, expectedVersion: number): void {
    if (current.version !== expectedVersion) throw new HttpError(409, 'version_conflict');
  }

  #transitionError(reason: 'invalid_transition' | 'forbidden' | 'open_orders'): HttpError {
    if (reason === 'forbidden') return new HttpError(403, 'transition_not_owned');
    return new HttpError(409, reason);
  }

  /** Forzar exige visits.force_state y además patients.access, es decir, un rol clínico en la sede (ADR 0033). */
  #canForce(actor: Principal): boolean {
    return actor.permissions.has('visits.force_state') && actor.permissions.has('patients.access');
  }

  /**
   * Cambio de estado: la visita (versión + 1, `closed_at` según el destino),
   * su fila del historial (con el motivo cifrado), la auditoría y el evento
   * en vivo, todo en la transacción del cambio.
   */
  async #move(
    tx: Tx,
    actor: Principal,
    current: Current,
    me: string,
    now: Date,
    meta: RequestMeta,
    step: { action: EncounterEventAction; to: VisitStatus; forced: boolean; reason: string | null; audit: string },
  ): Promise<void> {
    const version = current.version + 1;
    const toClosed = !isOpenVisitStatus(step.to);
    const closedAt = toClosed ? (isOpenVisitStatus(current.status) ? now : current.closedAt) : null;
    await tx.update(encounters).set({ status: step.to, version, closedAt, updatedAt: now }).where(eq(encounters.id, current.id));
    const eventId = uuidv7();
    await tx.insert(encounterEvents).values({
      id: eventId,
      organizationId: current.organizationId,
      encounterId: current.id,
      locationId: current.locationId,
      action: step.action,
      fromStatus: current.status,
      toStatus: step.to,
      actorType: 'user',
      actorMembershipId: me,
      reasonEnc: step.reason ? await this.#cipher.encrypt(step.reason, reasonContext(current.organizationId, eventId)) : null,
      forced: step.forced,
      encounterVersion: version,
      occurredAt: now,
    });
    await this.#audit.inTx(tx, current.organizationId, {
      action: step.audit,
      ...this.#auditBase(actor, current, meta),
      ...(step.reason ? { reason: step.reason } : {}),
      metadata: {
        code: current.code,
        action: step.action,
        from: current.status,
        to: step.to,
        version,
        ...(step.forced ? { forced: true, reopened: reopens(current.status, step.to) } : {}),
      },
    });
    await this.#changed(tx, current, step.to);
  }

  /** Evento en vivo de la sede: solo el id y el estado. */
  async #changed(tx: Tx, current: Current, status: VisitStatus): Promise<void> {
    await notifyRealtime(tx, {
      t: 'event',
      org: current.organizationId,
      loc: current.locationId,
      name: 'encounter.changed',
      ids: { encounter: current.id },
      status,
    });
  }

  #auditBase(actor: Principal, current: Current, meta: RequestMeta) {
    return { actorType: 'user' as const, actorId: actor.userId, locationId: current.locationId, entityType: 'encounter', entityId: current.id, ...meta };
  }

  /** Cobertura descifrada (S-CLI-11). */
  async #coverageView(organizationId: string, row: typeof coverages.$inferSelect): Promise<EncounterCoverage> {
    return {
      type: row.type as CoverageType,
      insurerName: row.insurerNameEnc ? await this.#cipher.decrypt(row.insurerNameEnc, coverageContext(organizationId, row.id, 'insurer_name')) : null,
      memberId: row.memberIdEnc ? await this.#cipher.decrypt(row.memberIdEnc, coverageContext(organizationId, row.id, 'member_id')) : null,
      term: row.term as InsuranceTerm | null,
      amountCents: row.amountCents,
      coinsuranceBp: row.coinsuranceBp,
      version: row.version,
    };
  }

  /** Nombres del personal (cuentas globales, fuera de RLS; solo las ya filtradas por organización). */
  async #names(userIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Map();
    const rows = await this.#plain.select({ id: userTable.id, name: userTable.name }).from(userTable).where(inArray(userTable.id, unique));
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  /** AAAA-MM-DD de `instant` en la zona de la sede. */
  #day(instant: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
  }

  // --- Ayudas ----------------------------------------------------------------

  /** Respuesta de la llegada (y de cada repetición): sin datos del seguro ni del paciente. */
  async #result(actor: Principal, encounterId: string): Promise<ArrivalResult> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [row] = await tx
        .select({
          id: encounters.id,
          code: encounters.code,
          status: encounters.status,
          route: encounters.route,
          version: encounters.version,
          coverageType: coverages.type,
          appointmentId: appointments.id,
          appointmentStatus: appointments.status,
          appointmentVersion: appointments.version,
        })
        .from(encounters)
        .innerJoin(coverages, eq(coverages.encounterId, encounters.id))
        .leftJoin(appointments, eq(appointments.id, encounters.appointmentId))
        .where(and(eq(encounters.id, encounterId), eq(encounters.locationId, ctx.locationId)));
      if (!row) throw new HttpError(404, 'encounter_not_found');
      return {
        encounter: { id: row.id, code: row.code, status: row.status as VisitStatus, route: row.route as VisitRoute, version: row.version },
        coverageType: row.coverageType as CoverageType,
        appointment:
          row.appointmentId && row.appointmentStatus && row.appointmentVersion !== null
            ? { id: row.appointmentId, status: row.appointmentStatus as AppointmentStatus, version: row.appointmentVersion }
            : null,
      };
    });
  }

  async #insertCoverage(tx: Tx, organizationId: string, encounterId: string, coverage: ArrivalData['coverage']): Promise<void> {
    const id = uuidv7();
    if (coverage.type === 'self_pay') {
      await tx.insert(coverages).values({ id, organizationId, encounterId, type: 'self_pay' });
      return;
    }
    await tx.insert(coverages).values({
      id,
      organizationId,
      encounterId,
      type: 'insurance',
      insurerNameEnc: await this.#cipher.encrypt(coverage.insurerName, coverageContext(organizationId, id, 'insurer_name')),
      memberIdEnc: coverage.memberId ? await this.#cipher.encrypt(coverage.memberId, coverageContext(organizationId, id, 'member_id')) : null,
      term: coverage.term,
      amountCents: coverage.amountCents,
      coinsuranceBp: coverage.coinsuranceBp,
    });
  }

  async #patient(tx: Tx, patientId: string): Promise<ArrivalPatient> {
    const [row] = await tx
      .select({
        id: patients.id,
        code: patients.code,
        firstName: patients.firstName,
        lastName: patients.lastName,
        birthDate: patients.birthDate,
        phone: patients.phone,
        status: patients.status,
        mergedInto: patients.mergedInto,
      })
      .from(patients)
      .where(eq(patients.id, patientId));
    if (!row) throw new HttpError(404, 'patient_not_found');
    return { ...row, status: row.status as PatientStatus };
  }

  /** ¿Cae `instant` en el día de hoy de la sede, según el reloj? */
  #isToday(instant: Date, timeZone: string): boolean {
    return this.#day(instant, timeZone) === this.#day(this.#clock.now(), timeZone);
  }

  async #site(tx: Tx, locationId: string): Promise<{ info: ArrivalSite }> {
    const [row] = await tx
      .select({ id: locations.id, code: locations.code, name: locations.name, timezone: locations.timezone, active: locations.active })
      .from(locations)
      .where(eq(locations.id, locationId));
    if (!row) throw new HttpError(403, 'no_active_context');
    return { info: row };
  }

  async #myMembership(tx: Tx, userId: string): Promise<string> {
    const [mine] = await tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, userId));
    if (!mine) throw new HttpError(403, 'forbidden');
    return mine.id;
  }

  async #auditRead(tx: Tx, actor: Principal, entityType: 'appointment' | 'patient' | 'encounter', entityId: string, meta: RequestMeta): Promise<void> {
    const ctx = requireContext(actor);
    await this.#audit.inTx(tx, ctx.organizationId, {
      action: entityType === 'encounter' ? 'encounter.view' : 'arrival.view',
      actorType: 'user',
      actorId: actor.userId,
      locationId: ctx.locationId,
      entityType,
      entityId,
      ...meta,
    });
  }
}
