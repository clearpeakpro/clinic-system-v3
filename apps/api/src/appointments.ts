import {
  appointments,
  appointmentTypes,
  locations,
  membershipRoles,
  memberships,
  patients,
  user as userTable,
  type FieldCipher,
  type TenantDb,
  type Tx,
} from '@clinic/db';
import {
  agendaDate,
  permissionsFor,
  PATIENT_APPOINTMENTS_PAGE_SIZE,
  type AgendaAppointment,
  type AgendaColor,
  type AgendaDay,
  type AppointmentDetail,
  type AppointmentProvider,
  type AppointmentStatus,
  type PatientAppointmentRow,
  type PatientAppointments,
} from '@clinic/shared';
import { and, asc, desc, eq, gte, inArray, notInArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import type { AuditService } from './audit.ts';
import { rolesAt, type Principal } from './principal.ts';
import { HttpError, requireContext, type RequestMeta } from './services.ts';

// Citas (T-014; S-REC-06 a 09, S-PAC-07 y el subtítulo del Panel). Solo
// lectura en esta tarea: las acciones llegan con T-015.
//  - Todo va con withTenant y la organización y la sede de la sesión, nunca
//    las que mande el cliente. La agenda y el detalle son de la sede activa.
//  - El día se calcula en la zona horaria de la sede, en SQL: un día con
//    cambio de horario dura 23 o 25 horas y no pierde ni repite citas.
//  - La agenda, el detalle y la pestaña del perfil se auditan como lectura de
//    PHI; la auditoría lleva ids y fechas, nunca nombres ni notas.
//  - Notas y motivo de cancelación se guardan cifrados (FieldCipher) y solo
//    se descifran en el detalle.

const fieldContext = (organizationId: string, recordId: string, column: 'notes' | 'cancel_reason') => ({
  organizationId,
  table: 'appointments',
  column,
  recordId,
});

/** Columnas de una cita con su paciente y su tipo. */
const columns = {
  id: appointments.id,
  code: appointments.code,
  startsAt: appointments.startsAt,
  durationMinutes: appointments.durationMinutes,
  status: appointments.status,
  providerMembershipId: appointments.providerMembershipId,
  patientId: patients.id,
  patientCode: patients.code,
  firstName: patients.firstName,
  lastName: patients.lastName,
  typeId: appointmentTypes.id,
  typeCode: appointmentTypes.code,
  typeName: appointmentTypes.name,
  typeActive: appointmentTypes.active,
  typeColor: appointmentTypes.color,
};

interface Row {
  id: string;
  code: string;
  startsAt: Date;
  durationMinutes: number;
  status: string;
  providerMembershipId: string | null;
  patientId: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  typeId: string;
  typeCode: string;
  typeName: string;
  typeActive: boolean;
  typeColor: string;
}

/** Un día de la sede en su zona horaria: [inicio, inicio del día siguiente). */
const dayRange = (date: string, timeZone: string) =>
  and(
    gte(appointments.startsAt, sql`(${date}::date::timestamp at time zone ${timeZone})`),
    sql`${appointments.startsAt} < ((${date}::date + 1)::timestamp at time zone ${timeZone})`,
  );

export class AppointmentService {
  readonly #tenantDb: TenantDb;
  readonly #plain;
  readonly #audit: AuditService;
  readonly #cipher: FieldCipher;

  constructor(pool: pg.Pool, tenantDb: TenantDb, audit: AuditService, cipher: FieldCipher) {
    this.#tenantDb = tenantDb;
    this.#plain = drizzle({ client: pool });
    this.#audit = audit;
    this.#cipher = cipher;
  }

  /** S-REC-06: las citas de un día de la sede activa, con los proveedores para el filtro. */
  async day(actor: Principal, requested: string | undefined, meta: RequestMeta): Promise<AgendaDay> {
    const ctx = requireContext(actor);
    const data = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const site = await this.#site(tx, ctx.locationId);
      const date = agendaDate(requested, site.today);
      const rows = await tx
        .select(columns)
        .from(appointments)
        .innerJoin(patients, eq(patients.id, appointments.patientId))
        .innerJoin(appointmentTypes, eq(appointmentTypes.id, appointments.appointmentTypeId))
        .where(and(eq(appointments.locationId, ctx.locationId), dayRange(date, site.timezone)))
        .orderBy(asc(appointments.startsAt), asc(appointments.code));
      // Proveedores activos de la sede (el filtro) y los asignados a estas citas.
      const active = await tx
        .selectDistinct({ id: memberships.id, userId: memberships.userId })
        .from(memberships)
        .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
        .where(and(eq(memberships.status, 'active'), eq(membershipRoles.role, 'proveedor'), eq(membershipRoles.locationId, ctx.locationId)));
      const assigned = await this.#membershipUsers(tx, rows.map((r) => r.providerMembershipId));
      const [mine] = await tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, actor.userId));
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'appointment.list',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'appointment',
        ...meta,
        metadata: { date, results: rows.length },
      });
      return { site, date, rows, active, assigned, myMembershipId: mine?.id ?? '' };
    });
    const names = await this.#names([...data.active, ...data.assigned].map((m) => m.userId));
    const nameOf = new Map([...data.active, ...data.assigned].map((m) => [m.id, names.get(m.userId) ?? null]));
    return {
      date: data.date,
      today: data.site.today,
      timeZone: data.site.timezone,
      appointments: data.rows.map((r) => agendaItem(r, providerOf(r.providerMembershipId, nameOf))),
      providers: data.active
        .filter((m) => m.id !== data.myMembershipId)
        .map((m) => ({ membershipId: m.id, name: names.get(m.userId) ?? '' }))
        .filter((p) => p.name !== '')
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
      myMembershipId: data.myMembershipId,
    };
  }

  /** S-REC-09 Detalle de una cita de la sede activa. Lectura auditada (appointment.view). */
  async get(actor: Principal, appointmentId: string, meta: RequestMeta): Promise<AppointmentDetail> {
    const ctx = requireContext(actor);
    const data = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [found] = await tx
        .select({
          ...columns,
          notesEnc: appointments.notesEnc,
          cancelReasonEnc: appointments.cancelReasonEnc,
          createdAt: appointments.createdAt,
          version: appointments.version,
        })
        .from(appointments)
        .innerJoin(patients, eq(patients.id, appointments.patientId))
        .innerJoin(appointmentTypes, eq(appointmentTypes.id, appointments.appointmentTypeId))
        .where(and(eq(appointments.id, appointmentId), eq(appointments.locationId, ctx.locationId)));
      if (!found) throw new HttpError(404, 'appointment_not_found');
      const site = await this.#site(tx, ctx.locationId);
      const assigned = await this.#membershipUsers(tx, [found.providerMembershipId]);
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'appointment.view',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'appointment',
        entityId: appointmentId,
        ...meta,
      });
      return { found, site, assigned };
    });
    const { found, site } = data;
    const names = await this.#names(data.assigned.map((m) => m.userId));
    const nameOf = new Map(data.assigned.map((m) => [m.id, names.get(m.userId) ?? null]));
    return {
      ...agendaItem(found, providerOf(found.providerMembershipId, nameOf)),
      location: { id: ctx.locationId, code: site.code, name: site.name },
      timeZone: site.timezone,
      notes: found.notesEnc ? await this.#cipher.decrypt(found.notesEnc, fieldContext(ctx.organizationId, found.id, 'notes')) : null,
      cancelReason: found.cancelReasonEnc
        ? await this.#cipher.decrypt(found.cancelReasonEnc, fieldContext(ctx.organizationId, found.id, 'cancel_reason'))
        : null,
      createdAt: found.createdAt.toISOString(),
      version: found.version,
    };
  }

  /** Subtítulo del Panel: citas de hoy en la sede menos Canceladas y No se presentó (S-REC-01). Sin PHI. */
  async todayCount(actor: Principal): Promise<{ count: number; today: string }> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const site = await this.#site(tx, ctx.locationId);
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(appointments)
        .where(
          and(eq(appointments.locationId, ctx.locationId), dayRange(site.today, site.timezone), notInArray(appointments.status, ['CANCELLED', 'NO_SHOW'])),
        );
      return { count: row?.n ?? 0, today: site.today };
    });
  }

  /**
   * S-PAC-07 Pestaña Citas del perfil: las del paciente en las sedes donde
   * quien llama tiene acceso a Citas, de la más reciente a la más antigua, de
   * 50 en 50; en la primera página, además, la próxima cita (Resumen).
   */
  async forPatient(actor: Principal, patientId: string, offset: number, meta: RequestMeta): Promise<PatientAppointments> {
    const ctx = requireContext(actor);
    const data = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [patient] = await tx.select({ id: patients.id }).from(patients).where(eq(patients.id, patientId));
      if (!patient) throw new HttpError(404, 'patient_not_found');
      const sites = await tx.select({ id: locations.id, code: locations.code, name: locations.name }).from(locations);
      const allowed = sites.filter((s) => permissionsFor(rolesAt(actor.assignments, ctx.organizationId, s.id)).has('appointments.access'));
      const site = await this.#site(tx, ctx.locationId);
      const select = () =>
        tx
          .select({ ...columns, locationId: appointments.locationId })
          .from(appointments)
          .innerJoin(patients, eq(patients.id, appointments.patientId))
          .innerJoin(appointmentTypes, eq(appointmentTypes.id, appointments.appointmentTypeId));
      const inAllowed = allowed.length > 0 ? inArray(appointments.locationId, allowed.map((s) => s.id)) : sql`false`;
      const rows = await select()
        .where(and(eq(appointments.patientId, patientId), inAllowed))
        .orderBy(desc(appointments.startsAt), desc(appointments.code))
        .limit(PATIENT_APPOINTMENTS_PAGE_SIZE + 1)
        .offset(offset);
      const [upcoming] =
        offset === 0
          ? await select()
              .where(
                and(
                  eq(appointments.patientId, patientId),
                  inAllowed,
                  gte(appointments.startsAt, sql`now()`),
                  inArray(appointments.status, ['SCHEDULED', 'CONFIRMED']),
                ),
              )
              .orderBy(asc(appointments.startsAt), asc(appointments.code))
              .limit(1)
          : [];
      const page = rows.slice(0, PATIENT_APPOINTMENTS_PAGE_SIZE);
      const assigned = await this.#membershipUsers(tx, [...page, ...(upcoming ? [upcoming] : [])].map((r) => r.providerMembershipId));
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'patient.appointments_read',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'patient',
        entityId: patientId,
        ...meta,
        metadata: { offset, results: page.length },
      });
      return { page, more: rows.length > page.length, upcoming, sites, assigned, today: site.today };
    });
    const names = await this.#names(data.assigned.map((m) => m.userId));
    const nameOf = new Map(data.assigned.map((m) => [m.id, names.get(m.userId) ?? null]));
    const siteOf = new Map(data.sites.map((s) => [s.id, s]));
    const toRow = (r: Row & { locationId: string }): PatientAppointmentRow => {
      const item = agendaItem(r, providerOf(r.providerMembershipId, nameOf));
      const site = siteOf.get(r.locationId);
      return {
        id: item.id,
        code: item.code,
        startsAt: item.startsAt,
        durationMinutes: item.durationMinutes,
        status: item.status,
        location: { id: r.locationId, code: site?.code ?? '', name: site?.name ?? '' },
        type: { code: item.type.code, name: item.type.name, active: item.type.active, color: item.type.color },
        provider: item.provider,
      };
    };
    return {
      appointments: data.page.map(toRow),
      nextOffset: data.more ? offset + data.page.length : null,
      upcoming: data.upcoming ? toRow(data.upcoming) : null,
      today: data.today,
    };
  }

  /** Sede activa: código, nombre, zona horaria y hoy (`AAAA-MM-DD`). */
  async #site(tx: Tx, locationId: string) {
    const [row] = await tx
      .select({
        code: locations.code,
        name: locations.name,
        timezone: locations.timezone,
        today: sql<string>`((now() at time zone ${locations.timezone})::date)::text`,
      })
      .from(locations)
      .where(eq(locations.id, locationId));
    if (!row) throw new HttpError(403, 'no_active_context');
    return row;
  }

  /** Personas de las membresías indicadas (los proveedores asignados). */
  async #membershipUsers(tx: Tx, ids: (string | null)[]): Promise<{ id: string; userId: string }[]> {
    const unique = [...new Set(ids.filter((id): id is string => id !== null))];
    if (unique.length === 0) return [];
    return tx.select({ id: memberships.id, userId: memberships.userId }).from(memberships).where(inArray(memberships.id, unique));
  }

  /** Nombres de las personas (cuentas globales, fuera de RLS; solo las ya filtradas por organización). */
  async #names(userIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Map();
    const rows = await this.#plain.select({ id: userTable.id, name: userTable.name }).from(userTable).where(inArray(userTable.id, unique));
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}

function providerOf(membershipId: string | null, nameOf: Map<string, string | null>): AppointmentProvider | null {
  if (!membershipId) return null;
  return { membershipId, name: nameOf.get(membershipId) ?? '' };
}

function agendaItem(r: Row, provider: AppointmentProvider | null): AgendaAppointment {
  return {
    id: r.id,
    code: r.code,
    startsAt: r.startsAt.toISOString(),
    durationMinutes: r.durationMinutes,
    status: r.status as AppointmentStatus,
    patient: { id: r.patientId, code: r.patientCode, firstName: r.firstName, lastName: r.lastName },
    type: { id: r.typeId, code: r.typeCode, name: r.typeName, active: r.typeActive, color: r.typeColor as AgendaColor },
    provider,
  };
}
