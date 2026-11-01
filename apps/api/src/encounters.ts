import {
  appointments,
  appointmentTypes,
  coverages,
  encounterEvents,
  encounters,
  locations,
  memberships,
  nextEncounterCode,
  notifyRealtime,
  patients,
  type FieldCipher,
  type TenantDb,
  type Tx,
} from '@clinic/db';
import {
  arrivalSchema,
  visitTransition,
  type AppointmentStatus,
  type ArrivalAppointmentType,
  type ArrivalContext,
  type ArrivalData,
  type ArrivalInput,
  type ArrivalPatient,
  type ArrivalResult,
  type ArrivalSite,
  type CoverageType,
  type EncounterSummary,
  type PatientStatus,
  type VisitRoute,
  type VisitStatus,
} from '@clinic/shared';
import { and, asc, eq, notInArray, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { AuditService } from './audit.ts';
import type { Clock } from './clock.ts';
import type { IdempotencyService } from './idempotency.ts';
import type { Principal } from './principal.ts';
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

/** Violación de un índice único de la base, con el nombre de la restricción. */
function uniqueViolation(error: unknown): string | null {
  const pgError = ((error as { cause?: unknown }).cause ?? error) as { code?: string; constraint?: string };
  return pgError.code === '23505' ? (pgError.constraint ?? '') : null;
}

export class EncounterService {
  readonly #tenantDb: TenantDb;
  readonly #audit: AuditService;
  readonly #cipher: FieldCipher;
  readonly #idempotency: IdempotencyService;
  readonly #clock: Clock;

  constructor(tenantDb: TenantDb, audit: AuditService, cipher: FieldCipher, idempotency: IdempotencyService, clock: Clock) {
    this.#tenantDb = tenantDb;
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

  /** Visita mínima de la sede activa (`/visitas/<id>` hasta T-018). Lectura auditada. */
  async summary(actor: Principal, encounterId: string, meta: RequestMeta): Promise<EncounterSummary> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [row] = await tx
        .select({ id: encounters.id, code: encounters.code, status: encounters.status, route: encounters.route, version: encounters.version })
        .from(encounters)
        .where(and(eq(encounters.id, encounterId), eq(encounters.locationId, ctx.locationId)));
      if (!row) throw new HttpError(404, 'encounter_not_found');
      await this.#auditRead(tx, actor, 'encounter', row.id, meta);
      return { ...row, status: row.status as VisitStatus, route: row.route as VisitRoute };
    });
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
    const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    return day(instant) === day(this.#clock.now());
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
