import { createHmac } from 'node:crypto';
import { auditLog, type TenantDb, type Tx } from '@clinic/db';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';

export interface AuditEvent {
  action: string;
  actorType: 'user' | 'anonymous';
  actorId?: string | undefined;
  locationId?: string | undefined;
  entityType?: string | undefined;
  entityId?: string | undefined;
  ip: string | null;
  requestId?: string | undefined;
  /** Motivo, obligatorio en escrituras administrativas. Texto libre del personal, sin PHI. */
  reason?: string | undefined;
  /** Solo ids, códigos y hashes. Nunca contraseñas, tokens, códigos de MFA ni PHI. */
  metadata?: Record<string, string | number | boolean>;
}

export class AuditService {
  readonly #plain;
  readonly #tenantDb: TenantDb;
  readonly #hmacKey: string;

  constructor(pool: pg.Pool, tenantDb: TenantDb, hmacKey: string) {
    if (hmacKey.length < 32) throw new Error('auditHmacKey debe tener al menos 32 caracteres');
    this.#plain = drizzle({ client: pool });
    this.#tenantDb = tenantDb;
    this.#hmacKey = hmacKey;
  }

  /** HMAC-SHA256 del correo normalizado, con clave secreta de configuración (ADR 0023). */
  hmacEmail(email: string): string {
    return createHmac('sha256', this.#hmacKey).update(email.trim().toLowerCase()).digest('hex');
  }

  /**
   * Evento sin organización (inicio de sesión, MFA, desactivación global).
   * Solo lo lee el operador de la plataforma: clinic_app solo tiene INSERT.
   */
  async platform(event: AuditEvent): Promise<void> {
    await this.#plain.insert(auditLog).values(row(event, null));
  }

  /** Evento de una organización, en su propia transacción. */
  async organization(organizationId: string, event: AuditEvent): Promise<void> {
    await this.#tenantDb.withTenant(organizationId, (tx) => this.inTx(tx, organizationId, event));
  }

  /**
   * Evento de una organización dentro de la transacción del cambio: si el
   * cambio se deshace, el evento también (CLAUDE.md, regla 6).
   */
  async inTx(tx: Tx, organizationId: string, event: AuditEvent): Promise<void> {
    await tx.insert(auditLog).values(row(event, organizationId));
  }
}

function row(event: AuditEvent, organizationId: string | null) {
  return {
    organizationId,
    locationId: event.locationId ?? null,
    actorType: event.actorType,
    actorId: event.actorId ?? null,
    action: event.action,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    ip: event.ip,
    requestId: event.requestId ?? null,
    reason: event.reason ?? null,
    metadata: event.metadata ?? null,
  };
}
