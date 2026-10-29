import { auditLog, decryptPayload, outbox, type TenantDb } from '@clinic/db';
import { eq, sql } from 'drizzle-orm';
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

    const mail = decryptPayload(deps.outboxKey, { organizationId: row.organizationId, eventId: row.id }, row.payload);
    deps.hooks?.beforeSend?.();
    try {
      await deps.mailer.send({ ...mail, messageId: row.id });
    } catch {
      const attempts = row.attempts + 1;
      if (attempts >= deps.maxAttempts) {
        await tx
          .update(outbox)
          .set({ status: 'failed', attempts, payload: null, lastError: 'smtp_error' })
          .where(eq(outbox.id, row.id));
        await tx.insert(auditLog).values({
          id: uuidv7(),
          organizationId: row.organizationId,
          actorType: 'system',
          action: 'mail.failed',
          entityType: row.entityType,
          entityId: row.entityId,
          ip: null,
          metadata: { outboxEventId: row.id, kind: row.kind, attempts },
        });
        return 'failed';
      }
      await tx
        .update(outbox)
        .set({ attempts, lastError: 'smtp_error', nextAttemptAt: sql`now() + make_interval(secs => ${backoffSeconds(attempts)})` })
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
