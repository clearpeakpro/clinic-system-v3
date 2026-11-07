import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { encounters } from '../src/encounters-schema.ts';
import { memberships } from '../src/identity-schema.ts';
import { patientHistories } from '../src/nursing-schema.ts';
import { patients } from '../src/patients-schema.ts';
import { receipts } from '../src/receipts-schema.ts';
import { DEMO } from '../src/seed.ts';
import { createTenantDb, type TenantDb } from '../src/with-tenant.ts';
import { expectPgError, SQLSTATE } from './helpers.ts';

// T-030: fusionar pacientes (ADR 0032). La función app.merge_patient_rows()
// cambia la columna del paciente en las tablas que la aplicación no puede
// cambiar, solo de un duplicado ya fusionado con ese principal y en la
// organización del contexto RLS. La historia combinada es la única versión
// sin visita (source = 'merge'). Con el rol real (clinic_app) y un pool.

const NORTE = DEMO.norte;
const SUR = DEMO.sur;
const CHECK_VIOLATION = '23514';

type Org = typeof NORTE | typeof SUR;

describe('fusionar pacientes', () => {
  let pool: pg.Pool;
  let db: TenantDb;
  const member: Record<string, string> = {};
  let seq = 0;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 10 });
    db = createTenantDb(pool);
    for (const org of [NORTE, SUR]) {
      const userId = randomUUID();
      await pool.query(
        `insert into auth."user" (id, name, email, email_verified, created_at, updated_at) values ($1, $2, $3, true, now(), now())`,
        [userId, 'Administración ficticia', `adm.${userId}@example.test`],
      );
      const id = randomUUID();
      await db.withTenant(org.id, (tx) => tx.insert(memberships).values({ id, organizationId: org.id, userId }));
      member[org.id] = id;
    }
  });
  afterAll(async () => {
    await pool.end();
  });

  const now = new Date('2026-11-07T15:30:00Z');

  async function patient(org: Org): Promise<string> {
    const id = randomUUID();
    seq += 1;
    await db.withTenant(org.id, (tx) =>
      tx.insert(patients).values({
        id,
        organizationId: org.id,
        registeredLocationId: org.locations[0].id,
        code: `P-8${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}${String(seq)}`,
        firstName: 'Ana',
        lastName: 'Ficticia Fusión',
        birthDate: '1990-01-01',
      }),
    );
    return id;
  }

  async function receiptFor(org: Org, patientId: string): Promise<string> {
    const [visit] = await db.withTenant(org.id, (tx) =>
      tx
        .insert(encounters)
        .values({
          organizationId: org.id,
          locationId: org.locations[0].id,
          patientId,
          code: `${org.locations[0].code}-V-8${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`,
          source: 'walk_in',
          route: 'STANDARD',
          status: 'COMPLETED',
          arrivedAt: now,
          closedAt: now,
        })
        .returning({ id: encounters.id }),
    );
    const [row] = await db.withTenant(org.id, (tx) =>
      tx
        .insert(receipts)
        .values({
          organizationId: org.id,
          locationId: org.locations[0].id,
          patientId,
          encounterId: visit?.id ?? '',
          code: `${org.locations[0].code}-R-2098-${String(800000 + (seq += 1))}`,
          year: 2098,
          snapshotEnc: 'cifrado',
          issuedByMembershipId: member[org.id] ?? '',
          issuedAt: now,
        })
        .returning({ id: receipts.id }),
    );
    return row?.id ?? '';
  }

  const merge = (org: Org, from: string, to: string) =>
    db.withTenant(org.id, async (tx) => {
      const result = await tx.execute<{ moved: Record<string, number> }>(sql`select app.merge_patient_rows(${from}::uuid, ${to}::uuid) as moved`);
      return result.rows[0]?.moved;
    });

  it('corre con search_path vacío y como SECURITY DEFINER de clinic_owner', async () => {
    const { rows } = await pool.query<{ owner: string; definer: boolean; config: string[] }>(
      `select pg_get_userbyid(p.proowner) as owner, p.prosecdef as definer, p.proconfig as config
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app' and p.proname = 'merge_patient_rows'`,
    );
    expect(rows).toEqual([{ owner: 'clinic_owner', definer: true, config: ['search_path=""'] }]);
  });

  it('solo mueve las filas de un duplicado ya fusionado con ese principal', async () => {
    const principal = await patient(NORTE);
    const duplicate = await patient(NORTE);
    const receiptId = await receiptFor(NORTE, duplicate);
    // Sin fusionar todavía: se rechaza.
    await expectPgError(merge(NORTE, duplicate, principal), SQLSTATE.insufficientPrivilege);
    await db.withTenant(NORTE.id, (tx) => tx.update(patients).set({ mergedInto: principal }).where(eq(patients.id, duplicate)));
    // Con otro principal distinto del de merged_into: también.
    await expectPgError(merge(NORTE, duplicate, await patient(NORTE)), SQLSTATE.insufficientPrivilege);
    // La aplicación sigue sin poder cambiar el paciente de un recibo.
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.update(receipts).set({ patientId: principal }).where(eq(receipts.id, receiptId))), SQLSTATE.insufficientPrivilege);

    expect(await merge(NORTE, duplicate, principal)).toEqual({ payments: 0, receipts: 1, membershipHolders: 0, membershipMembers: 0, membershipEvents: 0 });
    const [moved] = await db.withTenant(NORTE.id, (tx) => tx.select({ patientId: receipts.patientId }).from(receipts).where(eq(receipts.id, receiptId)));
    expect(moved?.patientId).toBe(principal);
  });

  it('no toca otra organización ni funciona sin contexto', async () => {
    const principal = await patient(NORTE);
    const duplicate = await patient(NORTE);
    await receiptFor(NORTE, duplicate);
    await db.withTenant(NORTE.id, (tx) => tx.update(patients).set({ mergedInto: principal }).where(eq(patients.id, duplicate)));
    // Desde Sur, los pacientes de Norte no existen.
    await expectPgError(merge(SUR, duplicate, principal), SQLSTATE.insufficientPrivilege);
    await expectPgError(pool.query('select app.merge_patient_rows($1, $2)', [duplicate, principal]), SQLSTATE.insufficientPrivilege);
    // Un principal ya fusionado tampoco vale.
    const other = await patient(NORTE);
    await db.withTenant(NORTE.id, (tx) => tx.update(patients).set({ mergedInto: other }).where(eq(patients.id, principal)));
    await expectPgError(merge(NORTE, duplicate, principal), SQLSTATE.insufficientPrivilege);
  });

  it('la historia combinada es la única versión sin visita', async () => {
    const patientId = await patient(SUR);
    const base = {
      organizationId: SUR.id,
      patientId,
      allergyStatus: 'none_known',
      locationId: SUR.locations[0].id,
      recordedByMembershipId: member[SUR.id] ?? '',
      recordedAt: now,
    };
    await db.withTenant(SUR.id, (tx) => tx.insert(patientHistories).values({ ...base, version: 1, source: 'merge', encounterId: null }));
    await expectPgError(db.withTenant(SUR.id, (tx) => tx.insert(patientHistories).values({ ...base, version: 2, encounterId: null })), CHECK_VIOLATION);
    await expectPgError(db.withTenant(SUR.id, (tx) => tx.insert(patientHistories).values({ ...base, version: 2, source: 'otra', encounterId: null })), CHECK_VIOLATION);
  });
});
