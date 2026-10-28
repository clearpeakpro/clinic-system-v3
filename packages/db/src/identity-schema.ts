import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  jsonb,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { user } from './auth-schema.ts';
import { appSchema, locations, organizations } from './schema.ts';

// Identidad por organización (ADR 0002, 0023). RLS, FORCE y GRANT en
// migrations/0003_identity_rls.sql (escrita a mano).

const id = () => uuid('id').primaryKey().$defaultFn(() => uuidv7());
const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`);
const organizationId = () =>
  uuid('organization_id')
    .notNull()
    .references(() => organizations.id);

// Debe coincidir con ROLES de packages/shared/src/permissions.ts.
const ROLE_CHECK = sql`role in ('propietario', 'administrador', 'recepcion', 'enfermeria', 'proveedor')`;

export const memberships = appSchema.table(
  'memberships',
  {
    id: id(),
    organizationId: organizationId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    status: text('status').notNull().default('active'),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    unique('memberships_organization_id_id_key').on(t.organizationId, t.id),
    unique('memberships_organization_id_user_id_key').on(t.organizationId, t.userId),
    check('memberships_status_check', sql`${t.status} in ('active', 'inactive')`),
  ],
);

export const membershipRoles = appSchema.table(
  'membership_roles',
  {
    id: id(),
    organizationId: organizationId(),
    membershipId: uuid('membership_id').notNull(),
    // Nulo = toda la organización; solo para roles administrativos.
    locationId: uuid('location_id'),
    role: text('role').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('membership_roles_organization_id_id_key').on(t.organizationId, t.id),
    unique('membership_roles_assignment_key')
      .on(t.membershipId, t.locationId, t.role)
      .nullsNotDistinct(),
    foreignKey({
      name: 'membership_roles_membership_fk',
      columns: [t.organizationId, t.membershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    foreignKey({
      name: 'membership_roles_location_fk',
      columns: [t.organizationId, t.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }),
    check('membership_roles_role_check', ROLE_CHECK),
    check(
      'membership_roles_org_wide_check',
      sql`${t.locationId} is not null or ${t.role} in ('propietario', 'administrador')`,
    ),
  ],
);

export const invitations = appSchema.table(
  'invitations',
  {
    id: id(),
    organizationId: organizationId(),
    email: text('email').notNull(),
    role: text('role').notNull(),
    locationId: uuid('location_id'),
    // sha256 del secreto del enlace, en hexadecimal. El secreto no se guarda.
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedByUserId: uuid('accepted_by_user_id'),
    createdByUserId: uuid('created_by_user_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('invitations_organization_id_id_key').on(t.organizationId, t.id),
    foreignKey({
      name: 'invitations_location_fk',
      columns: [t.organizationId, t.locationId],
      foreignColumns: [locations.organizationId, locations.id],
    }),
    check('invitations_role_check', ROLE_CHECK),
    check(
      'invitations_org_wide_check',
      sql`${t.locationId} is not null or ${t.role} in ('propietario', 'administrador')`,
    ),
  ],
);

export const auditLog = appSchema.table(
  'audit_log',
  {
    id: id(),
    // Nulo solo en eventos previos a elegir organización (p. ej. un inicio de
    // sesión fallido). Solo los lee el operador de la plataforma (ADR 0023).
    organizationId: uuid('organization_id').references(() => organizations.id),
    locationId: uuid('location_id'),
    actorType: text('actor_type').notNull(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    ip: text('ip'),
    requestId: text('request_id'),
    /** Motivo de la acción (obligatorio en escrituras administrativas, ADR 0018). */
    reason: text('reason'),
    // Nunca contraseñas, tokens, códigos ni datos de pacientes.
    metadata: jsonb('metadata').$type<Record<string, string | number | boolean>>(),
    createdAt: createdAt(),
  },
  (t) => [
    check('audit_log_actor_type_check', sql`${t.actorType} in ('user', 'kiosk', 'anonymous')`),
  ],
);
