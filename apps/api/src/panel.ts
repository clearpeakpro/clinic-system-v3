import {
  appointments,
  appointmentTypes,
  encounterEvents,
  encounters,
  locations,
  membershipRoles,
  memberships,
  organizations,
  patients,
  user as userTable,
  type TenantDb,
  type Tx,
} from '@clinic/db';
import {
  CLOSED_VISIT_STATUSES,
  waitLevel,
  type EncounterProvider,
  type PanelMetrics,
  type PanelRow,
  type PanelSnapshot,
  type VisitRoute,
  type VisitStatus,
  type WaitThresholds,
} from '@clinic/shared';
import { and, asc, eq, gte, inArray, lt, notInArray, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import type { AuditService } from './audit.ts';
import type { Clock } from './clock.ts';
import type { Principal } from './principal.ts';
import { HttpError, requireContext, type RequestMeta } from './services.ts';

// Panel en vivo de la sede activa (T-019; S-REC-01 a 05).
//  - Una sola foto por petición: métricas, filas, «N citas hoy», proveedores y
//    los minutos de «Alerta» y «Crítico» de la organización (ADR 0039).
//  - «Hoy» es el día de la sede con la hora del reloj inyectable (reglas de la
//    fase 3); los límites del día los calcula Postgres con la zona de la sede,
//    también en los días con cambio de horario.
//  - Filas: las abiertas de cualquier día y las completadas hoy por su hora de
//    cierre (decisión del 2026-11-01), para que coincidan la tarjeta y el chip
//    «Completados hoy». Las cerradas como Se retiró o Cancelada no aparecen en
//    ningún filtro (manual), así que no se envían.
//  - Mínimo necesario: del paciente solo nombre y código. Lectura auditada
//    (`encounter.queue_list`) con el número de filas, nunca con nombres.

const OPEN_ONLY = notInArray(encounters.status, [...CLOSED_VISIT_STATUSES]);

/** Recuento de cada tarjeta por estado (el resto de tarjetas, aparte). */
const STATUS_METRIC: Partial<Record<VisitStatus, keyof PanelMetrics>> = {
  CHECKED_IN: 'waiting',
  WAITING_FOR_NURSE: 'waiting',
  WITH_NURSE: 'withNurse',
  WAITING_FOR_PROVIDER: 'waitingForProvider',
  WITH_PROVIDER: 'withProvider',
  PROCEDURE_PENDING: 'procedurePending',
  READY_FOR_CHECKOUT: 'readyForCheckout',
  CHECKOUT: 'checkout',
  COMPLETED: 'completedToday',
};

export class PanelService {
  readonly #tenantDb: TenantDb;
  readonly #plain;
  readonly #audit: AuditService;
  readonly #clock: Clock;

  constructor(pool: pg.Pool, tenantDb: TenantDb, audit: AuditService, clock: Clock) {
    this.#tenantDb = tenantDb;
    this.#plain = drizzle({ client: pool });
    this.#audit = audit;
    this.#clock = clock;
  }

  async snapshot(actor: Principal, meta: RequestMeta): Promise<PanelSnapshot> {
    const ctx = requireContext(actor);
    const now = this.#clock.now();
    const data = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [site] = await tx
        .select({ id: locations.id, code: locations.code, name: locations.name, timezone: locations.timezone })
        .from(locations)
        .where(eq(locations.id, ctx.locationId));
      if (!site) throw new HttpError(403, 'no_active_context');
      const [org] = await tx
        .select({ alertMinutes: organizations.waitAlertMinutes, criticalMinutes: organizations.waitCriticalMinutes })
        .from(organizations)
        .where(eq(organizations.id, ctx.organizationId));
      if (!org) throw new HttpError(403, 'no_active_context');
      const today = dayIn(now, site.timezone);
      const start = sql`(${today}::date::timestamp at time zone ${site.timezone})`;
      const end = sql`((${today}::date + 1)::timestamp at time zone ${site.timezone})`;

      const rows = await tx
        .select({
          id: encounters.id,
          code: encounters.code,
          status: encounters.status,
          route: encounters.route,
          arrivedAt: encounters.arrivedAt,
          closedAt: encounters.closedAt,
          providerMembershipId: encounters.providerMembershipId,
          statusSince: sql<Date | string | null>`(select ${encounterEvents.occurredAt} from ${encounterEvents} where ${encounterEvents.encounterId} = ${encounters.id} order by ${encounterEvents.encounterVersion} desc, ${encounterEvents.occurredAt} desc limit 1)`,
          patientId: patients.id,
          patientCode: patients.code,
          firstName: patients.firstName,
          lastName: patients.lastName,
          typeName: appointmentTypes.name,
        })
        .from(encounters)
        .innerJoin(patients, eq(patients.id, encounters.patientId))
        .leftJoin(appointmentTypes, eq(appointmentTypes.id, encounters.appointmentTypeId))
        .where(
          and(
            eq(encounters.locationId, ctx.locationId),
            or(OPEN_ONLY, and(eq(encounters.status, 'COMPLETED'), gte(encounters.closedAt, start), lt(encounters.closedAt, end))),
          ),
        )
        .orderBy(asc(encounters.arrivedAt), asc(encounters.code));

      const [arrivals] = await tx
        .select({ n: sql<number>`count(distinct ${encounters.patientId})::int` })
        .from(encounters)
        .where(and(eq(encounters.locationId, ctx.locationId), gte(encounters.arrivedAt, start), lt(encounters.arrivedAt, end)));
      const [booked] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(appointments)
        .where(
          and(
            eq(appointments.locationId, ctx.locationId),
            gte(appointments.startsAt, start),
            lt(appointments.startsAt, end),
            notInArray(appointments.status, ['CANCELLED', 'NO_SHOW']),
          ),
        );

      // Proveedores activos de la sede (el menú) y los asignados a estas filas.
      const active = await tx
        .selectDistinct({ id: memberships.id, userId: memberships.userId })
        .from(memberships)
        .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
        .where(and(eq(memberships.status, 'active'), eq(membershipRoles.role, 'proveedor'), eq(membershipRoles.locationId, ctx.locationId)));
      const assignedIds = [...new Set(rows.map((r) => r.providerMembershipId).filter((id): id is string => id !== null))];
      const assigned =
        assignedIds.length > 0 ? await tx.select({ id: memberships.id, userId: memberships.userId }).from(memberships).where(inArray(memberships.id, assignedIds)) : [];
      const me = await this.#myMembership(tx, actor.userId);

      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'encounter.queue_list',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'encounter',
        ...meta,
        metadata: { today, results: rows.length },
      });
      return { site, org, today, rows, arrivals: arrivals?.n ?? 0, booked: booked?.n ?? 0, active, assigned, me };
    });

    const names = await this.#names([...data.active, ...data.assigned].map((m) => m.userId));
    const memberName = new Map([...data.active, ...data.assigned].map((m) => [m.id, names.get(m.userId) ?? '']));
    const thresholds: WaitThresholds = { alertMinutes: data.org.alertMinutes, criticalMinutes: data.org.criticalMinutes };
    const metrics: PanelMetrics = {
      patientsToday: data.arrivals,
      waiting: 0,
      withNurse: 0,
      waitingForProvider: 0,
      withProvider: 0,
      procedurePending: 0,
      readyForCheckout: 0,
      checkout: 0,
      completedToday: 0,
    };
    const rows = data.rows.map((r): PanelRow => {
      const status = r.status as VisitStatus;
      const metric = STATUS_METRIC[status];
      if (metric) metrics[metric] += 1;
      const statusSince = (r.statusSince ? new Date(r.statusSince) : r.arrivedAt).toISOString();
      return {
        id: r.id,
        code: r.code,
        status,
        route: r.route as VisitRoute,
        arrivedAt: r.arrivedAt.toISOString(),
        statusSince,
        closedAt: r.closedAt ? r.closedAt.toISOString() : null,
        patient: { id: r.patientId, code: r.patientCode, firstName: r.firstName, lastName: r.lastName },
        provider: r.providerMembershipId ? { membershipId: r.providerMembershipId, name: memberName.get(r.providerMembershipId) ?? '' } : null,
        appointmentType: r.typeName,
        waitLevel: waitLevel({ status, statusSince }, now.getTime(), thresholds),
      };
    });
    const providers: EncounterProvider[] = data.active
      .filter((m) => m.id !== data.me)
      .map((m) => ({ membershipId: m.id, name: memberName.get(m.id) ?? '' }))
      .filter((p) => p.name !== '')
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    return {
      serverNow: now.toISOString(),
      today: data.today,
      timeZone: data.site.timezone,
      location: { id: data.site.id, code: data.site.code, name: data.site.name },
      appointmentsToday: data.booked,
      metrics,
      rows,
      providers,
      myMembershipId: data.me,
      waitThresholds: thresholds,
    };
  }

  async #myMembership(tx: Tx, userId: string): Promise<string> {
    const [mine] = await tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, userId));
    if (!mine) throw new HttpError(403, 'forbidden');
    return mine.id;
  }

  async #names(userIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Map();
    const rows = await this.#plain.select({ id: userTable.id, name: userTable.name }).from(userTable).where(inArray(userTable.id, unique));
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}

/** AAAA-MM-DD de `instant` en la zona de la sede. */
function dayIn(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}
