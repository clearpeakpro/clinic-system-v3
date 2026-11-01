import {
  auditLog,
  decryptNotificationPayload,
  decryptPayload,
  NOTIFICATION_EVENT,
  notifications,
  notifyRealtime,
  outbox,
  type NotificationPayload,
  type TenantDb,
  type Tx,
} from '@clinic/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { Mailer } from './mailer.ts';

// Entrega de un evento del outbox (ADR 0019, T-008), dentro de withTenant de
// su organización:
//  - bloquea la fila (FOR UPDATE SKIP LOCKED): si otro worker la tiene, no hace nada;
//  - si ya no está pendiente, no hace nada: un evento repetido no se procesa dos veces;
//  - envía y la marca como entregada, borrando el payload, en la misma transacción.
// Si el proceso se cae antes del commit, la fila sigue pendiente y se
// reintenta. Límite de «al menos una vez»: si se cae después de que el
// servidor de correo acepte el mensaje, el correo puede llegar dos veces (con
// el mismo Message-ID, el id del evento).
//
// Notificaciones (T-009): se guardan en `notifications` y se avisa a los
// sockets de la persona, todo en la misma transacción que marca el evento.
// Sin efectos fuera de la base de datos, así que se entregan una sola vez.

export interface DeliverDeps {
  tenantDb: TenantDb;
  mailer: Mailer;
  outboxKey: string;
  maxAttempts: number;
  /** Solo pruebas: simula que el proceso se cae antes o después de enviar. */
  hooks?: { beforeSend?: () => void; afterSend?: () => void };
}

export type DeliveryResult = 'sent' | 'skipped' | 'retry' | 'failed';

/** Espera antes del siguiente intento: 30 s, 1 min, 2 min… hasta 1 h. */
export function backoffSeconds(attempts: number): number {
  return Math.min(30 * 2 ** Math.max(attempts - 1, 0), 3600);
}

export async function deliverEvent(deps: DeliverDeps, ref: { organizationId: string; id: string }): Promise<DeliveryResult> {
  return deps.tenantDb.withTenant(ref.organizationId, async (tx) => {
    const [row] = await tx
      .select()
      .from(outbox)
      .where(eq(outbox.id, ref.id))
      .for('update', { skipLocked: true });
    if (!row || row.status !== 'pending' || !row.payload) return 'skipped';
    if (row.nextAttemptAt.getTime() > Date.now()) return 'skipped';

    const ids = { organizationId: row.organizationId, eventId: row.id };
    const isNotification = row.kind === NOTIFICATION_EVENT;
    deps.hooks?.beforeSend?.();
    try {
      if (isNotification) {
        const payload = decryptNotificationPayload(deps.outboxKey, ids, row.payload);
        // Punto de guardado: si guardar falla, la transacción sigue y se anota el reintento.
        await tx.transaction((sp) => storeNotification(sp, row.organizationId, row.id, payload));
      } else {
        await deps.mailer.send({ ...decryptPayload(deps.outboxKey, ids, row.payload), messageId: row.id });
      }
    } catch {
      const attempts = row.attempts + 1;
      const lastError = isNotification ? 'store_error' : 'smtp_error';
      if (attempts >= deps.maxAttempts) {
        await tx
          .update(outbox)
          .set({ status: 'failed', attempts, payload: null, lastError })
          .where(eq(outbox.id, row.id));
        await tx.insert(auditLog).values({
          id: uuidv7(),
          organizationId: row.organizationId,
          actorType: 'system',
          action: isNotification ? 'notification.failed' : 'mail.failed',
          entityType: row.entityType,
          entityId: row.entityId,
          ip: null,
          metadata: { outboxEventId: row.id, kind: row.kind, attempts },
        });
        return 'failed';
      }
      await tx
        .update(outbox)
        .set({ attempts, lastError, nextAttemptAt: sql`now() + make_interval(secs => ${backoffSeconds(attempts)})` })
        .where(eq(outbox.id, row.id));
      return 'retry';
    }
    deps.hooks?.afterSend?.();
    await tx
      .update(outbox)
      .set({ status: 'sent', attempts: row.attempts + 1, payload: null, lastError: null, sentAt: sql`now()` })
      .where(eq(outbox.id, row.id));
    return 'sent';
  });
}

/**
 * Guarda el aviso. Regla del manual (S-GEN-15): un aviso no leído sobre la
 * misma entidad y del mismo tipo se reemplaza por el nuevo. Después avisa a
 * los sockets de la persona (sale al confirmarse la transacción).
 */
async function storeNotification(tx: Tx, organizationId: string, eventId: string, payload: NotificationPayload): Promise<void> {
  const values = {
    locationId: payload.locationId,
    code: payload.code,
    startsAt: payload.startsAt ? new Date(payload.startsAt) : null,
    eventId,
    createdAt: sql`now()`,
  };
  const replaced =
    payload.entityId === null
      ? []
      : await tx
          .update(notifications)
          .set(values)
          .where(
            and(
              eq(notifications.userId, payload.userId),
              eq(notifications.kind, payload.kind),
              eq(notifications.entityId, payload.entityId),
              payload.entityType === null ? isNull(notifications.entityType) : eq(notifications.entityType, payload.entityType),
              isNull(notifications.readAt),
              isNull(notifications.dismissedAt),
            ),
          )
          .returning({ id: notifications.id });
  if (replaced.length === 0) {
    await tx.insert(notifications).values({
      id: eventId,
      organizationId,
      userId: payload.userId,
      kind: payload.kind,
      entityType: payload.entityType,
      entityId: payload.entityId,
      ...values,
    });
  }
  await notifyRealtime(tx, { t: 'notifications', org: organizationId, user: payload.userId });
}
