import { randomBytes, randomUUID } from 'node:crypto';
import { auditLog, createTenantDb, enqueueMail, invitationRoles, invitations, locations, organizations } from '@clinic/db';
import { createLocationSchema, displayNameSchema } from '@clinic/shared';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { z } from 'zod';
import { encodeInvitationToken, invitationMail } from './invitations.ts';
import { sha256Hex } from './principal.ts';

// Operador de la plataforma (ADR 0024). Lo usan los comandos
// `pnpm org:create` y `pnpm audit:platform` (apps/api/scripts), conectados
// como clinic_operator: nunca como clinic_app ni clinic_migrator. En V1 no
// hay pantalla.

/** Rechaza cualquier conexión que no sea la del operador. */
export function assertOperatorUrl(databaseUrl: string): void {
  if (new URL(databaseUrl).username !== 'clinic_operator') {
    throw new Error('Configuración inválida: el operador solo se conecta como clinic_operator (DATABASE_OPERATOR_URL)');
  }
}

/** Código de un error de Postgres o de red (drizzle lo envuelve en `cause`; en Windows llega como AggregateError). */
function errorCode(error: unknown): string | undefined {
  const e = error as { cause?: unknown; code?: unknown; errors?: unknown[] } | null;
  if (!e) return undefined;
  if (typeof e.code === 'string') return e.code;
  if (e.cause) return errorCode(e.cause);
  if (Array.isArray(e.errors) && e.errors.length > 0) return errorCode(e.errors[0]);
  return undefined;
}

const OPERATOR_ERRORS: Record<string, string> = {
  '28P01': 'La contraseña del operador en .env no coincide con la de la base de datos; ejecute pnpm db:bootstrap y vuelva a intentarlo.',
  '28000': 'El usuario clinic_operator no existe o no puede conectarse; ejecute pnpm db:bootstrap y vuelva a intentarlo.',
  '3D000': 'La base de datos no existe; ejecute pnpm demo:reset (o pnpm dev) y vuelva a intentarlo.',
  ECONNREFUSED: 'No se pudo conectar con la base de datos: abra Docker Desktop, ejecute pnpm dev y vuelva a intentarlo.',
  '42P01': 'Faltan migraciones en la base de datos; ejecute pnpm db:migrate y vuelva a intentarlo.',
  '42883': 'Faltan migraciones en la base de datos; ejecute pnpm db:migrate y vuelva a intentarlo.',
  '42501': 'El operador no tiene permiso para esta operación; ejecute pnpm db:bootstrap y pnpm db:migrate y vuelva a intentarlo.',
  '23505': 'Ya existe un registro con esos datos; revise los valores y vuelva a intentarlo.',
  '23514': 'Algún dato no es válido; revise los valores y vuelva a intentarlo.',
};

/**
 * Mensaje claro para los comandos del operador (org:create, audit:platform).
 * Nunca repite el mensaje de Postgres, que podría llevar los datos: solo
 * explica qué hacer, con el código al final para soporte.
 */
export function operatorErrorMessage(error: unknown, action: string): string {
  const code = errorCode(error);
  const advice = code ? OPERATOR_ERRORS[code] : undefined;
  const suffix = code ? ` (código ${code})` : '';
  return advice ? `No se pudo ${action}. ${advice}${suffix}` : `No se pudo ${action}. Inténtelo de nuevo; si se repite, avise al soporte${suffix}.`;
}

export const createOrganizationSchema = z.object({
  organizationName: z.string().trim().min(1).max(120),
  ownerEmail: z.email().max(254).transform((v) => v.trim().toLowerCase()),
  ownerName: displayNameSchema,
  location: createLocationSchema,
});

export type CreateOrganizationInput = z.input<typeof createOrganizationSchema>;

export interface CreatedOrganization {
  organizationId: string;
  locationId: string;
  invitationId: string;
  /** Enlace /invitacion/<token> del Propietario. Se muestra una sola vez; solo se guarda su hash. */
  link: string;
  expiresAt: string;
}

/**
 * `pnpm org:create`: la organización, su primera sede y la invitación de su
 * Propietario (rol de toda la organización), en una transacción y bajo la RLS
 * de la organización nueva, con el correo en el outbox. El Propietario la
 * acepta en /invitacion/<token>
 * (S-GEN-09) y configura su MFA al entrar.
 */
export async function createOrganization(
  pool: pg.Pool,
  rawInput: CreateOrganizationInput,
  options: { baseURL: string; invitationTtlSeconds: number; outboxKey: string },
): Promise<CreatedOrganization> {
  const input = createOrganizationSchema.parse(rawInput);
  const organizationId = randomUUID();
  const secret = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + options.invitationTtlSeconds * 1000);
  const link = `${options.baseURL}/invitacion/${encodeInvitationToken(organizationId, secret)}`;

  const ids = await createTenantDb(pool).withTenant(organizationId, async (tx) => {
    await tx.insert(organizations).values({ id: organizationId, name: input.organizationName });
    const [location] = await tx
      .insert(locations)
      .values({
        organizationId,
        code: input.location.code,
        name: input.location.name,
        timezone: input.location.timezone,
        address: input.location.address,
        phone: input.location.phone,
      })
      .returning({ id: locations.id });
    const [invitation] = await tx
      .insert(invitations)
      .values({
        organizationId,
        email: input.ownerEmail,
        name: input.ownerName,
        tokenHash: sha256Hex(secret),
        expiresAt,
        createdByUserId: null,
      })
      .returning({ id: invitations.id });
    if (!location || !invitation) throw new Error('No se creó la organización');
    const { rows: who } = await tx.execute<{ name: string }>(sql`select session_user::text as name`);
    await tx.insert(invitationRoles).values({ organizationId, invitationId: invitation.id, locationId: null, role: 'propietario' });
    await tx.insert(auditLog).values({
      id: randomUUID(),
      organizationId,
      locationId: location.id,
      actorType: 'operator',
      action: 'organization.created',
      entityType: 'organization',
      entityId: organizationId,
      // Sin el correo del Propietario: solo ids y el código de la sede.
      metadata: { locationCode: input.location.code, invitationId: invitation.id, dbUser: who[0]?.name ?? '' },
    });
    // El correo del Propietario va al outbox en la misma transacción (T-008).
    await enqueueMail(tx, options.outboxKey, {
      organizationId,
      kind: 'mail.invitation',
      entityType: 'invitation',
      entityId: invitation.id,
      mail: invitationMail(input.ownerEmail, link, options.invitationTtlSeconds, input.organizationName),
    });
    return { locationId: location.id, invitationId: invitation.id };
  });

  return { organizationId, ...ids, link, expiresAt: expiresAt.toISOString() };
}

export interface PlatformAuditEvent {
  id: string;
  created_at: Date;
  actor_type: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  ip: string | null;
  request_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
}

/** `pnpm audit:platform`: eventos sin organización. La función de la base de datos registra cada lectura. */
export async function readPlatformAudit(
  pool: pg.Pool,
  filters: { since: Date; until?: Date | undefined; action?: string | undefined; limit?: number | undefined },
): Promise<PlatformAuditEvent[]> {
  const { rows } = await pool.query<PlatformAuditEvent>('select * from app.read_platform_audit($1, $2, $3, $4)', [
    filters.since,
    filters.until ?? null,
    filters.action ?? null,
    filters.limit ?? 500,
  ]);
  return rows;
}
