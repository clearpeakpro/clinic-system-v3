import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

// Las políticas RLS, FORCE y los GRANT están en migrations/0001_rls.sql.
// Pacientes y contadores de códigos: patients-schema.ts (T-012).

export const appSchema = pgSchema('app');

const id = () => uuid('id').primaryKey().$defaultFn(() => uuidv7());
const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`);

export const organizations = appSchema.table('organizations', {
  id: id(),
  name: text('name').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: createdAt(),
});

export const locations = appSchema.table(
  'locations',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    timezone: text('timezone').notNull(),
    /** Dirección postal de la sede (opcional; se muestra en S-GEN-11). */
    address: text('address'),
    /** Teléfono de contacto (S-ADM-11): opcional, sin formato validado. */
    phone: text('phone'),
    /** Una sede inactiva no se puede elegir ni operar; nunca se borra (T-007). */
    active: boolean('active').notNull().default(true),
    /** Concurrencia optimista (regla 7). */
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    unique('locations_organization_id_id_key').on(t.organizationId, t.id),
    unique('locations_organization_id_code_key').on(t.organizationId, t.code),
    // De 2 a 8 caracteres, empieza por letra, solo A–Z y dígitos (decisión de T-007).
    check('locations_code_format', sql`${t.code} ~ '^[A-Z][A-Z0-9]{1,7}$'`),
  ],
);
