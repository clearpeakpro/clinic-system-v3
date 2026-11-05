import { sql } from 'drizzle-orm';
import { check, foreignKey, integer, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { encounters } from './encounters-schema.ts';
import { appSchema, locations, organizations } from './schema.ts';

// Estado de cuenta de la visita (T-027; S-CAJ-07). RLS, FORCE y GRANT en
// migrations/0044_billing_statements_rls.sql.
//  - Una fila por visita, con `version` (concurrencia optimista, regla 7) y
//    bloqueo FOR UPDATE para los cobros de T-028.
//  - No guarda importes: los totales los calcula siempre el servidor a partir
//    de los cargos activos y los pagos registrados (computeStatement() de
//    @clinic/shared). La versión sube con cada cambio de importes: un cargo
//    creado o anulado, un cambio de beneficios o de cobertura y, desde T-028,
//    cada pago.
//  - Se crea cuando la visita la necesita por primera vez (touchStatement /
//    ensureStatement). Nunca se borra.

export const billingStatements = appSchema.table(
  'billing_statements',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    locationId: uuid('location_id').notNull(),
    encounterId: uuid('encounter_id').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    unique('billing_statements_organization_id_id_key').on(t.organizationId, t.id),
    // Un estado de cuenta por visita.
    unique('billing_statements_organization_id_encounter_id_key').on(t.organizationId, t.encounterId),
    foreignKey({ name: 'billing_statements_location_fk', columns: [t.organizationId, t.locationId], foreignColumns: [locations.organizationId, locations.id] }),
    foreignKey({ name: 'billing_statements_encounter_fk', columns: [t.organizationId, t.encounterId], foreignColumns: [encounters.organizationId, encounters.id] }),
    check('billing_statements_version_check', sql`${t.version} >= 1`),
  ],
);
