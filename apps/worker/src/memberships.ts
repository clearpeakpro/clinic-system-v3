import { patientMemberships, settleMembership, type TenantDb } from '@clinic/db';
import { asc, ne } from 'drizzle-orm';
import type pg from 'pg';

// Trabajo de membresías (T-026b parte B; ADR 0034): cada hora, con el reloj
// inyectable, deja guardado el estado de cada membresía no cancelada de cada
// organización (settleMembership, la misma función que usa la API):
//  - crea las mensualidades 14 días antes de vencer;
//  - suspende a las 12:00 a. m. de D+1 (hora de la sede) si la del día D no
//    se pagó, y cancela a las 12:00 a. m. de D+30 sin dejar deuda;
//  - cancela la «Pendiente de pago» a los 30 días de la inscripción;
//  - aplica el fin de beneficios de una cancelación avisada.
// Los beneficios no esperan a este trabajo: la API calcula el estado con el
// reloj al momento. Una transacción por membresía; solo devuelve conteos.

export interface MembershipsRun {
  organizations: number;
  memberships: number;
  changed: number;
  feesCreated: number;
}

export async function runMemberships(pool: pg.Pool, tenantDb: TenantDb, now: Date): Promise<MembershipsRun> {
  const { rows } = await pool.query<{ organization_id: string }>('select organization_id from app.membership_organizations()');
  const result: MembershipsRun = { organizations: rows.length, memberships: 0, changed: 0, feesCreated: 0 };
  for (const { organization_id: organizationId } of rows) {
    const ids = await tenantDb.withTenant(organizationId, (tx) =>
      tx.select({ id: patientMemberships.id }).from(patientMemberships).where(ne(patientMemberships.status, 'cancelled')).orderBy(asc(patientMemberships.id)),
    );
    for (const { id } of ids) {
      const settled = await tenantDb.withTenant(organizationId, (tx) => settleMembership(tx, id, now));
      result.memberships += 1;
      if (settled?.changed) result.changed += 1;
      result.feesCreated += settled?.feesCreated ?? 0;
    }
  }
  return result;
}
