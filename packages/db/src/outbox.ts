import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { outbox } from './ops-schema.ts';
import type { Tx } from './with-tenant.ts';

// Outbox transaccional (ADR 0019, T-008). Quien escribe el evento lo hace en
// la misma transacción que el cambio; el worker lo entrega al menos una vez.
// El payload puede llevar secretos (el enlace de una invitación lleva su
// token), así que va cifrado con AES-256-GCM y una clave propia (OUTBOX_KEY),
// atado a su evento y a su organización, y se borra al entregarse.

/** Canal de LISTEN/NOTIFY: el aviso solo sale al confirmarse la transacción. */
export const OUTBOX_CHANNEL = 'clinic_outbox';

export interface MailPayload {
  to: string;
  subject: string;
  text: string;
}

/** Tipo del outbox de las notificaciones guardadas (T-009). */
export const NOTIFICATION_EVENT = 'notification';

/** Aviso para una persona (ADR 0008). Sin PHI: tipo, entidad y código humano. */
export interface NotificationPayload {
  userId: string;
  locationId: string | null;
  kind: string;
  entityType: string | null;
  entityId: string | null;
  code: string | null;
  /** Avisos de citas (T-015): inicio de la cita, ISO. Ausente en los anteriores. */
  startsAt?: string | null;
}

function keyFrom(secret: string): Buffer {
  if (secret.length < 32) throw new Error('OUTBOX_KEY debe tener al menos 32 caracteres');
  return createHash('sha256').update(`clinic-outbox-v1:${secret}`).digest();
}

const aad = (organizationId: string, eventId: string) => Buffer.from(`${organizationId}:${eventId}`);

/** «v1.<iv>.<tag>.<cifrado>» en base64url. */
export function encryptPayload(secret: string, ids: { organizationId: string; eventId: string }, payload: MailPayload | NotificationPayload): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  cipher.setAAD(aad(ids.organizationId, ids.eventId));
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

function openPayload(secret: string, ids: { organizationId: string; eventId: string }, sealed: string): unknown {
  const [version, iv, tag, data, ...rest] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !data || rest.length > 0) throw new Error('payload del outbox con formato desconocido');
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(iv, 'base64url'));
  decipher.setAAD(aad(ids.organizationId, ids.eventId));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const json = Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  return JSON.parse(json);
}

export function decryptPayload(secret: string, ids: { organizationId: string; eventId: string }, sealed: string): MailPayload {
  return openPayload(secret, ids, sealed) as MailPayload;
}

export function decryptNotificationPayload(secret: string, ids: { organizationId: string; eventId: string }, sealed: string): NotificationPayload {
  return openPayload(secret, ids, sealed) as NotificationPayload;
}

/**
 * Escribe un correo en el outbox dentro de la transacción `tx` (con su
 * withTenant) y avisa al worker al confirmarse. Devuelve el id del evento.
 */
export async function enqueueMail(
  tx: Tx,
  secret: string,
  event: { organizationId: string; kind: string; entityType?: string; entityId?: string; mail: MailPayload },
): Promise<string> {
  const id = uuidv7();
  await tx.insert(outbox).values({
    id,
    organizationId: event.organizationId,
    kind: event.kind,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    payload: encryptPayload(secret, { organizationId: event.organizationId, eventId: id }, event.mail),
  });
  await tx.execute(sql`select pg_notify(${OUTBOX_CHANNEL}, '')`);
  return id;
}

/**
 * Escribe un aviso para una persona en el outbox, dentro de la transacción
 * `tx` (con su withTenant). El worker lo guarda en `notifications` y avisa a
 * sus sockets (T-009). Devuelve el id del evento.
 */
export async function enqueueNotification(
  tx: Tx,
  secret: string,
  event: {
    organizationId: string;
    userId: string;
    kind: string;
    locationId?: string;
    entityType?: string;
    entityId?: string;
    code?: string;
    startsAt?: Date;
  },
): Promise<string> {
  const id = uuidv7();
  const payload: NotificationPayload = {
    userId: event.userId,
    locationId: event.locationId ?? null,
    kind: event.kind,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    code: event.code ?? null,
    startsAt: event.startsAt ? event.startsAt.toISOString() : null,
  };
  await tx.insert(outbox).values({
    id,
    organizationId: event.organizationId,
    kind: NOTIFICATION_EVENT,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    payload: encryptPayload(secret, { organizationId: event.organizationId, eventId: id }, payload),
  });
  await tx.execute(sql`select pg_notify(${OUTBOX_CHANNEL}, '')`);
  return id;
}
