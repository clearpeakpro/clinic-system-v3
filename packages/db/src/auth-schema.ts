import { boolean, index, integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Tablas de identidad global de Better Auth 1.7.14 (núcleo + plugin twoFactor),
// según `getAuthTables` de better-auth/db. Sin RLS de organización (ADR 0002:
// `users` es global). Los nombres de las propiedades deben coincidir con los
// campos de Better Auth; las columnas van en snake_case. Ids: UUID v7 generados
// por la API (advanced.database.generateId).

export const authSchema = pgSchema('auth');

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const user = authSchema.table('user', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
  twoFactorEnabled: boolean('two_factor_enabled').default(false),
  // Campo nuestro (user.additionalFields): desactivación por la organización.
  disabledAt: ts('disabled_at'),
});

export const session = authSchema.table(
  'session',
  {
    id: uuid('id').primaryKey(),
    expiresAt: ts('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Campos nuestros (session.additionalFields, input: false): contexto activo.
    // Solo los cambia POST /context después de validar la membresía.
    activeOrganizationId: uuid('active_organization_id'),
    activeLocationId: uuid('active_location_id'),
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
);

export const account = authSchema.table(
  'account',
  {
    id: uuid('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: ts('access_token_expires_at'),
    refreshTokenExpiresAt: ts('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
);

export const verification = authSchema.table(
  'verification',
  {
    id: uuid('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: ts('expires_at').notNull(),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

export const twoFactor = authSchema.table(
  'two_factor',
  {
    id: uuid('id').primaryKey(),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    verified: boolean('verified'),
    failedVerificationCount: integer('failed_verification_count'),
    lockedUntil: ts('locked_until'),
  },
  (t) => [index('two_factor_secret_idx').on(t.secret), index('two_factor_user_id_idx').on(t.userId)],
);
