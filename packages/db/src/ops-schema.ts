import { sql } from 'drizzle-orm';
import { check, integer, jsonb, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { appSchema, organizations } from './schema.ts';

// Operaciones críticas (ADR 0019, T-008): outbox transaccional y claves de
// idempotencia. RLS, FORCE y GRANT en migrations/0013_worker_outbox_audit.sql.

/**
 * Eventos que deben entregarse (por ahora, correos de invitación). Se
 * escriben en la misma transacción que el cambio; el worker los entrega al
 * menos una vez. El payload va cifrado (OUTBOX_KEY) y se borra al entregarse.
 */
export const outbox = appSchema.table(
  'outbox',
  {
    /** Id del evento (uuid v7): también el Message-ID del correo y la clave de pg-boss. */
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    kind: text('kind').notNull(),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().default(sql`now()`),
    /** AES-256-GCM (ver outbox.ts). Nulo una vez entregado o descartado. */
    payload: text('payload'),
    /** Solo un código («smtp_error»…), nunca el mensaje del servidor de correo. */
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [
    unique('outbox_organization_id_id_key').on(t.organizationId, t.id),
    check('outbox_status_check', sql`${t.status} in ('pending', 'sent', 'failed')`),
  ],
);

/**
 * Idempotency-Key (ADR 0019): guarda solo el estado y los ids del recurso
 * creado, nunca la respuesta. Ante una repetición, la API vuelve a leer el
 * recurso con las mismas comprobaciones de permisos. Vence a las 24 h.
 */
export const idempotencyKeys = appSchema.table(
  'idempotency_keys',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    key: text('key').notNull(),
    /** sha256 de método, ruta y cuerpo canónico. */
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status').notNull(),
    resourceIds: jsonb('resource_ids').$type<string[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    unique('idempotency_keys_organization_id_id_key').on(t.organizationId, t.id),
    unique('idempotency_keys_organization_id_key_key').on(t.organizationId, t.key),
  ],
);
