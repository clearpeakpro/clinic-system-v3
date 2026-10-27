import { createHmac } from 'node:crypto';
import { auditLog, type TenantDb } from '@clinic/db';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';

export interface AuditEvent {
  action: string;
  actorType: 'user' | 'kiosk' | 'anonymous';
  actorId?: string | undefined;
  locationId?: string | undefined;
  entityType?: string | undefined;
  entityId?: string | undefined;
  ip: string | null;
  /** Solo ids, códigos de motivo y hashes. Nunca contraseñas, tokens, códigos ni PHI. */
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

  /** HMAC-SHA256 del correo normalizado, con clave secreta de configuración. */
  hmacEmail(email: string): string {
    return createHmac('sha256', this.#hmacKey).update(email.trim().toLowerCase()).digest('hex');
  }

  /**
   * Evento sin organización (p. ej. inicio de sesión). Solo lo lee el operador
   * de la plataforma: clinic_app solo tiene INSERT y ninguna organización lo ve.
   */
  async platform(event: AuditEvent): Promise<void> {
    await this.#plain.insert(auditLog).values(this.#row(event, null));
  }

  /** Evento de una organización, dentro de su contexto RLS. */
  async organization(organizationId: string, event: AuditEvent): Promise<void> {
    await this.#tenantDb.withTenant(organizationId, (tx) =>
      tx.insert(auditLog).values(this.#row(event, organizationId)),
    );
  }

  #row(event: AuditEvent, organizationId: string | null) {
    return {
      organizationId,
      locationId: event.locationId ?? null,
      actorType: event.actorType,
      actorId: event.actorId ?? null,
      action: event.action,
      entityType: event.entityType ?? null,
      entityId: event.entityId ?? null,
      ip: event.ip,
      metadata: event.metadata ?? null,
    };
  }
}
