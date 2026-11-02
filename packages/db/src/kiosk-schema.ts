import { sql } from 'drizzle-orm';
import { check, date, foreignKey, index, integer, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { encounters } from './encounters-schema.ts';
import { memberships } from './identity-schema.ts';
import { patients } from './patients-schema.ts';
import { appSchema, locations, organizations } from './schema.ts';

// Kiosco de autorregistro (T-020; ADR 0014 y 0031). RLS, FORCE, GRANT y las
// funciones SECURITY DEFINER en migrations/0034_kiosk_rls.sql.
//  - kiosk_devices: tabletas de una sede. Se crean al generar el código de
//    vinculación (10 min, un solo uso; solo su hash) y pasan a activas al
//    vincularse: entonces guardan el hash del token del dispositivo (90 días,
//    renovable). Revocar corta al instante. Nunca se borran.
//  - kiosk_checkins: registros enviados por el kiosco. Contenido cifrado con
//    FieldCipher; vence al cierre del día de la sede y se vacía a las 24 h
//    (el worker). Al vaciarse quedan solo los metadatos.
//    Desde T-021: Recepción lo confirma (paciente y visita creada) o lo
//    descarta con motivo; en los dos casos el contenido se borra en la misma
//    transacción y quedan solo los metadatos.

export const KIOSK_DEVICE_STATUS_VALUES = ['pending', 'active', 'revoked'] as const;
export const KIOSK_CHECKIN_STATUS_VALUES = ['pending', 'expired', 'confirmed', 'discarded'] as const;

export const kioskDevices = appSchema.table(
  'kiosk_devices',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    locationId: uuid('location_id').notNull(),
    /** Nombre que pone la Administración («Tableta recepción 1»). No es PHI. */
    name: text('name').notNull(),
    status: text('status').notNull().default('pending'),
    /** sha256 del código de vinculación; nulo al vincular o al anularse. */
    pairingCodeHash: text('pairing_code_hash'),
    pairingExpiresAt: timestamp('pairing_expires_at', { withTimezone: true }),
    /** sha256 del token del dispositivo (la cookie); nunca el token. */
    tokenHash: text('token_hash'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    linkedAt: timestamp('linked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByMembershipId: uuid('revoked_by_membership_id'),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    version: integer('version').notNull().default(1),
  },
  (t) => [
    unique('kiosk_devices_organization_id_id_key').on(t.organizationId, t.id),
    unique('kiosk_devices_token_hash_key').on(t.tokenHash),
    unique('kiosk_devices_pairing_code_hash_key').on(t.pairingCodeHash),
    foreignKey({ name: 'kiosk_devices_location_fk', columns: [t.organizationId, t.locationId], foreignColumns: [locations.organizationId, locations.id] }),
    foreignKey({
      name: 'kiosk_devices_created_by_fk',
      columns: [t.organizationId, t.createdByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    foreignKey({
      name: 'kiosk_devices_revoked_by_fk',
      columns: [t.organizationId, t.revokedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    check('kiosk_devices_status_check', sql`${t.status} in ('pending', 'active', 'revoked')`),
    check('kiosk_devices_name_length', sql`char_length(${t.name}) between 1 and 60`),
    check('kiosk_devices_active_token', sql`${t.status} <> 'active' or (${t.tokenHash} is not null and ${t.tokenExpiresAt} is not null and ${t.linkedAt} is not null)`),
    check('kiosk_devices_pending_code', sql`${t.status} <> 'pending' or ${t.tokenHash} is null`),
    check('kiosk_devices_revoked', sql`(${t.status} = 'revoked') = (${t.revokedAt} is not null)`),
    check('kiosk_devices_revoked_clean', sql`${t.status} <> 'revoked' or (${t.tokenHash} is null and ${t.pairingCodeHash} is null)`),
    index('kiosk_devices_location_idx').on(t.organizationId, t.locationId),
  ],
);

export const kioskCheckins = appSchema.table(
  'kiosk_checkins',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    locationId: uuid('location_id').notNull(),
    deviceId: uuid('device_id').notNull(),
    /** Todo lo que envió el paciente, cifrado (JSON). Nulo cuando se vació. */
    contentEnc: text('content_enc'),
    status: text('status').notNull().default('pending'),
    /** Día de la sede en que se envió. */
    serviceDate: date('service_date').notNull(),
    /** Cierre del día de la sede: después ya no se puede confirmar. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** 24 h después del envío: el worker vacía el contenido. */
    purgeAt: timestamp('purge_at', { withTimezone: true }).notNull(),
    contentPurgedAt: timestamp('content_purged_at', { withTimezone: true }),
    /** T-021: paciente elegido o creado por Recepción y visita abierta al confirmar. */
    patientId: uuid('patient_id'),
    encounterId: uuid('encounter_id'),
    /** Quién lo confirmó o descartó, y cuándo. */
    resolvedByMembershipId: uuid('resolved_by_membership_id'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    version: integer('version').notNull().default(1),
  },
  (t) => [
    unique('kiosk_checkins_organization_id_id_key').on(t.organizationId, t.id),
    foreignKey({ name: 'kiosk_checkins_location_fk', columns: [t.organizationId, t.locationId], foreignColumns: [locations.organizationId, locations.id] }),
    foreignKey({ name: 'kiosk_checkins_device_fk', columns: [t.organizationId, t.deviceId], foreignColumns: [kioskDevices.organizationId, kioskDevices.id] }),
    foreignKey({ name: 'kiosk_checkins_patient_fk', columns: [t.organizationId, t.patientId], foreignColumns: [patients.organizationId, patients.id] }),
    foreignKey({ name: 'kiosk_checkins_encounter_fk', columns: [t.organizationId, t.encounterId], foreignColumns: [encounters.organizationId, encounters.id] }),
    foreignKey({
      name: 'kiosk_checkins_resolved_by_fk',
      columns: [t.organizationId, t.resolvedByMembershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    // Confirmado: con paciente y visita. Confirmado o descartado: sin contenido y con quién y cuándo.
    check('kiosk_checkins_confirmed', sql`${t.status} <> 'confirmed' or (${t.patientId} is not null and ${t.encounterId} is not null)`),
    check(
      'kiosk_checkins_resolved',
      sql`(${t.status} in ('confirmed', 'discarded')) = (${t.resolvedAt} is not null and ${t.resolvedByMembershipId} is not null)`,
    ),
    check('kiosk_checkins_resolved_purged', sql`${t.status} not in ('confirmed', 'discarded') or ${t.contentEnc} is null`),
    check('kiosk_checkins_status_check', sql`${t.status} in ('pending', 'expired', 'confirmed', 'discarded')`),
    check('kiosk_checkins_content', sql`(${t.contentEnc} is null) = (${t.contentPurgedAt} is not null)`),
    check('kiosk_checkins_expiry_order', sql`${t.expiresAt} > ${t.createdAt} and ${t.purgeAt} > ${t.createdAt}`),
    index('kiosk_checkins_location_status_idx').on(t.organizationId, t.locationId, t.status, t.createdAt),
    index('kiosk_checkins_device_created_idx').on(t.organizationId, t.deviceId, t.createdAt),
  ],
);
