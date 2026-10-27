import { sql } from 'drizzle-orm';
import {
  date,
  foreignKey,
  integer,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

// Las políticas RLS, FORCE y los GRANT están en migrations/0001_rls.sql.

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
    createdAt: createdAt(),
  },
  (t) => [
    unique('locations_organization_id_id_key').on(t.organizationId, t.id),
    unique('locations_organization_id_code_key').on(t.organizationId, t.code),
  ],
);

export const patients = appSchema.table(
  'patients',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    registeredLocationId: uuid('registered_location_id').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    birthDate: date('birth_date').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    unique('patients_organization_id_id_key').on(t.organizationId, t.id),
    // Compuesta: un paciente solo puede referenciar una sede de su organización.
    // Las comprobaciones de claves foráneas no pasan por RLS.
    foreignKey({
      name: 'patients_registered_location_fk',
      columns: [t.organizationId, t.registeredLocationId],
      foreignColumns: [locations.organizationId, locations.id],
    }),
  ],
);
