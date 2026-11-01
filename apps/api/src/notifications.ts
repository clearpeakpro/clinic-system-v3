import { locations, notifications, notifyRealtime, type TenantDb, type Tx } from '@clinic/db';
import { appointmentWhenLabel, isAppointmentNotification, isNotificationKind, permissionsFor, type NotificationKind } from '@clinic/shared';
import { and, count, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { rolesAt, type Principal } from './principal.ts';
import { HttpError, requireContext } from './services.ts';

// Centro de notificaciones (S-GEN-15, ADR 0008; T-009). Cada persona ve solo
// sus avisos de la organización activa, de los últimos 30 días. Marcar como
// leído y «Borrar» (ocultar) no se auditan: es el estado personal de la
// bandeja, sin datos del negocio ni de pacientes. Tras cada cambio se avisa a
// los demás sockets de la persona (otras pestañas o equipos).

/** Las más nuevas primero; el manual limita la lista a 100. */
export const NOTIFICATIONS_LIMIT = 100;

export interface NotificationRow {
  id: string;
  kind: NotificationKind;
  code: string | null;
  /** Avisos de citas (T-015): fecha y hora de la cita en su sede, «3 nov, 9:00 a. m.». */
  when: string | null;
  /** Avisos de citas: día de la cita en su sede (`AAAA-MM-DD`), para abrir la agenda de ese día. */
  day: string | null;
  /** Avisos de citas: ¿tiene hoy acceso a Citas en esa sede? Si no, al tocarlo solo se marca como leído. */
  canOpen: boolean;
  locationId: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  read: boolean;
}

export interface NotificationsList {
  rows: NotificationRow[];
  unread: number;
}

/** Día calendario de un instante en una zona horaria (`AAAA-MM-DD`). */
const localDate = (value: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);

const visible = (userId: string) =>
  and(eq(notifications.userId, userId), isNull(notifications.dismissedAt), gt(notifications.createdAt, sql`now() - interval '30 days'`));

export class NotificationService {
  readonly #tenantDb: TenantDb;

  constructor(tenantDb: TenantDb) {
    this.#tenantDb = tenantDb;
  }

  async list(actor: Principal): Promise<NotificationsList> {
    const ctx = requireContext(actor);
    return this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      const rows = await tx
        .select({ n: notifications, timezone: locations.timezone })
        .from(notifications)
        .leftJoin(locations, eq(locations.id, notifications.locationId))
        .where(visible(actor.userId))
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(NOTIFICATIONS_LIMIT);
      const [unread] = await tx
        .select({ n: count() })
        .from(notifications)
        .where(and(visible(actor.userId), isNull(notifications.readAt)));
      return {
        rows: rows.flatMap(({ n: r, timezone }) =>
          isNotificationKind(r.kind)
            ? [
                {
                  id: r.id,
                  kind: r.kind,
                  code: r.code,
                  when: r.startsAt && timezone ? appointmentWhenLabel(r.startsAt, timezone) : null,
                  day: r.startsAt && timezone ? localDate(r.startsAt, timezone) : null,
                  canOpen:
                    isAppointmentNotification(r.kind) &&
                    r.locationId !== null &&
                    permissionsFor(rolesAt(actor.assignments, ctx.organizationId, r.locationId)).has('appointments.access'),
                  locationId: r.locationId,
                  entityType: r.entityType,
                  entityId: r.entityId,
                  createdAt: r.createdAt.toISOString(),
                  read: r.readAt !== null,
                },
              ]
            : [],
        ),
        unread: unread?.n ?? 0,
      };
    });
  }

  /** Tocar un aviso lo marca como leído. 404 si no es suyo o ya no está. */
  async markRead(actor: Principal, notificationId: string): Promise<void> {
    await this.#change(actor, async (tx) => {
      const updated = await tx
        .update(notifications)
        .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
        .where(and(eq(notifications.id, notificationId), visible(actor.userId)))
        .returning({ id: notifications.id });
      if (updated.length === 0) throw new HttpError(404, 'notification_not_found');
    });
  }

  /** «Marcar todo como leído». */
  async markAllRead(actor: Principal): Promise<void> {
    await this.#change(actor, (tx) =>
      tx
        .update(notifications)
        .set({ readAt: sql`now()` })
        .where(and(visible(actor.userId), isNull(notifications.readAt))),
    );
  }

  /** «Borrar»: las oculta para la persona; las filas se van con la purga de 30 días. */
  async clear(actor: Principal): Promise<void> {
    await this.#change(actor, (tx) => tx.update(notifications).set({ dismissedAt: sql`now()` }).where(visible(actor.userId)));
  }

  async #change(actor: Principal, fn: (tx: Tx) => Promise<unknown>): Promise<void> {
    const ctx = requireContext(actor);
    await this.#tenantDb.withTenant(ctx.organizationId, async (tx) => {
      await fn(tx);
      await notifyRealtime(tx, { t: 'notifications', org: ctx.organizationId, user: actor.userId });
    });
  }
}
