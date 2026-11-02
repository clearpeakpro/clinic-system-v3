import { appointmentTypes, encounterEvents, encounters, locations, memberships, organizations, patients, user as userTable, type FieldCipher, type TenantDb } from '@clinic/db';
import {
  compareProviderQueue,
  PROVIDER_QUEUE_STATUSES,
  waitLevel,
  type ProviderQueue,
  type ProviderQueueRow,
  type ProviderQueueStatus,
  type VisitRoute,
} from '@clinic/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import type { AuditService } from './audit.ts';
import type { Clock } from './clock.ts';
import { allergyNotice, latestHistory } from './nursing.ts';
import type { Principal } from './principal.ts';
import { HttpError, requireContext, type RequestMeta } from './services.ts';

// Cola de proveedor (T-023; S-CLI-02).
//  - «Esperando proveedor», «Con proveedor» y «Procedimiento pendiente» de
//    cualquier ruta, en la sede activa; por grupo y la mayor espera primero.
//  - La espera cuenta desde que terminó enfermería («Enfermería lista»: el
//    último «Enviar al proveedor») o, si no hubo, desde la llegada.
//  - «Alerta» / «Crítico» solo en «Esperando proveedor», desde el estado
//    actual y con los minutos de la organización (ADR 0039).
//  - Aviso de alergias en cada tarjeta (ADR 0040), solo con nursing.view.
//  - Hora del reloj inyectable. Lectura auditada con el número de filas.

export class ProviderService {
  readonly #tenantDb: TenantDb;
  readonly #plain;
  readonly #audit: AuditService;
  readonly #cipher: FieldCipher;
  readonly #clock: Clock;

  constructor(pool: pg.Pool, tenantDb: TenantDb, audit: AuditService, cipher: FieldCipher, clock: Clock) {
    this.#tenantDb = tenantDb;
    this.#plain = drizzle({ client: pool });
    this.#audit = audit;
    this.#cipher = cipher;
    this.#clock = clock;
  }

  async queue(actor: Principal, meta: RequestMeta): Promise<ProviderQueue> {
    const ctx = requireContext(actor);
    const now = this.#clock.now();
    const withAllergies = actor.permissions.has('nursing.view');
    const data = await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const [site] = await tx.select({ timezone: locations.timezone }).from(locations).where(eq(locations.id, ctx.locationId));
      const [org] = await tx
        .select({ alertMinutes: organizations.waitAlertMinutes, criticalMinutes: organizations.waitCriticalMinutes })
        .from(organizations)
        .where(eq(organizations.id, ctx.organizationId));
      if (!site || !org) throw new HttpError(403, 'no_active_context');
      const rows = await tx
        .select({
          id: encounters.id,
          code: encounters.code,
          status: encounters.status,
          route: encounters.route,
          version: encounters.version,
          arrivedAt: encounters.arrivedAt,
          providerMembershipId: encounters.providerMembershipId,
          statusSince: sql<Date | string | null>`(select ${encounterEvents.occurredAt} from ${encounterEvents} where ${encounterEvents.encounterId} = ${encounters.id} order by ${encounterEvents.encounterVersion} desc, ${encounterEvents.occurredAt} desc limit 1)`,
          nurseReadyAt: sql<Date | string | null>`(select ${encounterEvents.occurredAt} from ${encounterEvents} where ${encounterEvents.encounterId} = ${encounters.id} and ${encounterEvents.action} = 'send_to_provider' order by ${encounterEvents.encounterVersion} desc limit 1)`,
          patientId: patients.id,
          patientCode: patients.code,
          firstName: patients.firstName,
          lastName: patients.lastName,
          typeName: appointmentTypes.name,
        })
        .from(encounters)
        .innerJoin(patients, eq(patients.id, encounters.patientId))
        .leftJoin(appointmentTypes, eq(appointmentTypes.id, encounters.appointmentTypeId))
        .where(and(eq(encounters.locationId, ctx.locationId), inArray(encounters.status, [...PROVIDER_QUEUE_STATUSES])));
      const providerIds = [...new Set(rows.map((r) => r.providerMembershipId).filter((id): id is string => id !== null))];
      const providers = providerIds.length > 0 ? await tx.select({ id: memberships.id, userId: memberships.userId }).from(memberships).where(inArray(memberships.id, providerIds)) : [];
      const [mine] = await tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, actor.userId));
      const allergies = new Map<string, ProviderQueueRow['allergies']>();
      if (withAllergies) {
        for (const patientId of new Set(rows.map((r) => r.patientId))) {
          allergies.set(patientId, allergyNotice(await latestHistory(tx, this.#cipher, ctx.organizationId, patientId)));
        }
      }
      await this.#audit.inTx(tx, ctx.organizationId, {
        action: 'encounter.provider_queue',
        actorType: 'user',
        actorId: actor.userId,
        locationId: ctx.locationId,
        entityType: 'encounter',
        ...meta,
        metadata: { results: rows.length, allergies: withAllergies },
      });
      return { site, org, rows, providers, me: mine?.id ?? '', allergies };
    });
    const names = await this.#names(data.providers.map((m) => m.userId));
    const thresholds = { alertMinutes: data.org.alertMinutes, criticalMinutes: data.org.criticalMinutes };
    const rows = data.rows.map((r): ProviderQueueRow => {
      const status = r.status as ProviderQueueStatus;
      const statusSince = (r.statusSince ? new Date(r.statusSince) : r.arrivedAt).toISOString();
      const nurseReadyAt = r.nurseReadyAt ? new Date(r.nurseReadyAt).toISOString() : null;
      const member = data.providers.find((m) => m.id === r.providerMembershipId);
      return {
        id: r.id,
        code: r.code,
        status,
        route: r.route as VisitRoute,
        version: r.version,
        arrivedAt: r.arrivedAt.toISOString(),
        statusSince,
        nurseReadyAt,
        waitingSince: nurseReadyAt ?? r.arrivedAt.toISOString(),
        patient: { id: r.patientId, code: r.patientCode, firstName: r.firstName, lastName: r.lastName },
        provider: r.providerMembershipId ? { membershipId: r.providerMembershipId, name: member ? (names.get(member.userId) ?? '') : '' } : null,
        appointmentType: r.typeName,
        allergies: data.allergies.get(r.patientId) ?? null,
        // ADR 0039: en la cola, la marca solo en «Esperando proveedor».
        waitLevel: status === 'WAITING_FOR_PROVIDER' ? waitLevel({ status, statusSince }, now.getTime(), thresholds) : 'none',
      };
    });
    return {
      serverNow: now.toISOString(),
      timeZone: data.site.timezone,
      myMembershipId: data.me,
      waitThresholds: thresholds,
      canStart: actor.roles.includes('proveedor'),
      rows: rows.sort(compareProviderQueue),
    };
  }

  async #names(userIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Map();
    const rows = await this.#plain.select({ id: userTable.id, name: userTable.name }).from(userTable).where(inArray(userTable.id, unique));
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}
