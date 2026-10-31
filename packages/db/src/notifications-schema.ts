import { sql } from 'drizzle-orm';
import { foreignKey, index, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth-schema.ts';
import { appSchema, locations, organizations } from './schema.ts';

// Notificaciones guardadas (ADR 0008, T-009): 30 días en la base de datos.
// Llegan por el outbox: quien genera un aviso lo escribe en la misma
// transacción que su cambio (enqueueNotification) y el worker lo guarda aquí.
// Sin PHI: solo tipo, entidad y código humano («LAN-V-000123»), nunca nombres.
// RLS, FORCE, GRANT y la purga en migrations/0016_notifications_realtime.sql.

export const notifications = appSchema.table(
  'notifications',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    /** Destinatario. */
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    /** Sede del evento: el enlace la usa si la persona la tiene asignada. */
    locationId: uuid('location_id'),
    /** Tipo del catálogo de @clinic/shared (notifications.ts). */
    kind: text('kind').notNull(),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    /** Código humano de la entidad, sin datos del paciente. */
    code: text('code'),
    /** Avisos de citas (T-015): su inicio, que se muestra en la hora de la sede («3 nov, 9:00 a. m.»). */
    startsAt: timestamp('starts_at', { withTimezone: true }),
    /** Último evento del outbox entregado en esta fila (un aviso no leído se reemplaza). */
    eventId: uuid('event_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    readAt: timestamp('read_at', { withTimezone: true }),
    /** «Borrar» la oculta para la persona; la fila se va con la purga de 30 días. */
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  },
  (t) => [
    unique('notifications_organization_id_id_key').on(t.organizationId, t.id),
    unique('notifications_organization_id_event_id_key').on(t.organizationId, t.eventId),
    foreignKey({
      name: 'notifications_location_fk',
      columns: [t.organizationId, t.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }),
    index('notifications_recipient_idx').on(t.organizationId, t.userId, t.createdAt),
  ],
);
