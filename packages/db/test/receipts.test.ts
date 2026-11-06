import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { nextReceiptCode } from '../src/codes.ts';
import { encounters } from '../src/encounters-schema.ts';
import { memberships } from '../src/identity-schema.ts';
import { receiptPrints, receipts } from '../src/receipts-schema.ts';
import { DEMO } from '../src/seed.ts';
import { createTenantDb, type TenantDb } from '../src/with-tenant.ts';
import { expectPgError, SQLSTATE } from './helpers.ts';

// T-029: recibos. Aislamiento con el rol real (clinic_app) y un pool: cada
// organización ve y escribe solo lo suyo. Instantáneas inmutables: ni UPDATE
// ni DELETE, tampoco en las impresiones. Código por sede y año, sin huecos.

const NORTE = DEMO.norte;
const SUR = DEMO.sur;
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

type Org = typeof NORTE | typeof SUR;

describe('recibos', () => {
  let pool: pg.Pool;
  let db: TenantDb;
  let nextPatient = 0;
  const member: Record<string, string> = {};

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 10 });
    db = createTenantDb(pool);
    for (const org of [NORTE, SUR]) {
      const userId = randomUUID();
      await pool.query(
        `insert into auth."user" (id, name, email, email_verified, created_at, updated_at) values ($1, $2, $3, true, now(), now())`,
        [userId, 'Recepción ficticia', `rec.${userId}@example.test`],
      );
      const id = randomUUID();
      await db.withTenant(org.id, (tx) => tx.insert(memberships).values({ id, organizationId: org.id, userId }));
      member[org.id] = id;
    }
  });
  afterAll(async () => {
    await pool.end();
  });

  const now = new Date('2026-11-05T15:30:00Z');

  async function visit(org: Org): Promise<{ encounterId: string; patientId: string }> {
    const patient = org.patients[(nextPatient += 1) % org.patients.length];
    if (!patient) throw new Error('sin paciente');
    const [row] = await db.withTenant(org.id, (tx) =>
      tx
        .insert(encounters)
        .values({
          organizationId: org.id,
          locationId: org.locations[0].id,
          patientId: patient.id,
          code: `${org.locations[0].code}-V-7${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`,
          source: 'walk_in',
          route: 'STANDARD',
          status: 'COMPLETED',
          arrivedAt: now,
          closedAt: now,
        })
        .returning({ id: encounters.id }),
    );
    if (!row) throw new Error('sin visita');
    return { encounterId: row.id, patientId: patient.id };
  }

  let codeSeq = 0;
  const receipt = (org: Org, v: { encounterId: string; patientId: string }, extra: Partial<typeof receipts.$inferInsert> = {}): typeof receipts.$inferInsert => ({
    organizationId: org.id,
    locationId: org.locations[0].id,
    patientId: v.patientId,
    encounterId: v.encounterId,
    code: `${org.locations[0].code}-R-2099-${String(900000 + (codeSeq += 1))}`,
    year: 2099,
    snapshotEnc: 'cifrado',
    issuedByMembershipId: member[org.id] ?? '',
    issuedAt: now,
    ...extra,
  });

  it('cada organización ve solo sus recibos y sus impresiones, y no escribe en la otra', async () => {
    const v = await visit(NORTE);
    const surVisit = await visit(SUR);
    const [row] = await db.withTenant(NORTE.id, (tx) => tx.insert(receipts).values(receipt(NORTE, v)).returning({ id: receipts.id }));
    const id = row?.id ?? '';
    await db.withTenant(NORTE.id, (tx) =>
      tx.insert(receiptPrints).values({ organizationId: NORTE.id, locationId: NORTE.locations[0].id, receiptId: id, language: 'es', printedByMembershipId: member[NORTE.id] ?? '', printedAt: now }),
    );
    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(receipts).where(eq(receipts.id, id)))).toEqual([]);
    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(receiptPrints).where(eq(receiptPrints.receiptId, id)))).toEqual([]);
    expect((await pool.query('select * from app.receipts')).rows).toEqual([]);
    expect((await pool.query('select * from app.receipt_prints')).rows).toEqual([]);
    // Otra organización en la fila: RLS. La visita de otra organización: clave foránea.
    await expectPgError(db.withTenant(SUR.id, (tx) => tx.insert(receipts).values(receipt(NORTE, surVisit))), SQLSTATE.insufficientPrivilege);
    await expectPgError(db.withTenant(SUR.id, (tx) => tx.insert(receipts).values(receipt(SUR, { ...surVisit, encounterId: v.encounterId }))), SQLSTATE.foreignKeyViolation);
    await expectPgError(
      db.withTenant(SUR.id, (tx) =>
        tx.insert(receiptPrints).values({ organizationId: SUR.id, locationId: SUR.locations[0].id, receiptId: id, language: 'es', printedByMembershipId: member[SUR.id] ?? '', printedAt: now }),
      ),
      SQLSTATE.foreignKeyViolation,
    );
  });

  it('inmutables: ni UPDATE ni DELETE en recibos ni en impresiones; el código es único', async () => {
    const v = await visit(NORTE);
    const values = receipt(NORTE, v);
    const [row] = await db.withTenant(NORTE.id, (tx) => tx.insert(receipts).values(values).returning({ id: receipts.id }));
    const id = row?.id ?? '';
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.update(receipts).set({ snapshotEnc: 'otro' }).where(eq(receipts.id, id))), SQLSTATE.insufficientPrivilege);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.delete(receipts).where(eq(receipts.id, id))), SQLSTATE.insufficientPrivilege);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.update(receiptPrints).set({ language: 'en' })), SQLSTATE.insufficientPrivilege);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.delete(receiptPrints)), SQLSTATE.insufficientPrivilege);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(receipts).values({ ...values, id: randomUUID() })), UNIQUE_VIOLATION);
  });

  it('un destino (visita o cuota), un código con formato y un idioma conocido', async () => {
    const v = await visit(NORTE);
    for (const bad of [{ encounterId: null }, { code: 'NOR1-R-000045' }, { year: 1999 }]) {
      await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(receipts).values(receipt(NORTE, v, bad))), CHECK_VIOLATION);
    }
  });

  it('el código sigue por sede y año, y una transacción deshecha no deja hueco', async () => {
    const location = NORTE.locations[1];
    const code = () => db.withTenant(NORTE.id, (tx) => nextReceiptCode(tx, NORTE.id, location, 2098));
    const first = await code();
    await expect(
      db.withTenant(NORTE.id, async (tx) => {
        await nextReceiptCode(tx, NORTE.id, location, 2098);
        throw new Error('falla a propósito');
      }),
    ).rejects.toThrow('falla a propósito');
    const second = await code();
    const n = (c: string) => Number(c.split('-').at(-1));
    expect(second).toBe(`${location.code}-R-2098-${String(n(first) + 1).padStart(6, '0')}`);
    // Otro año empieza en 000001; la otra sede tiene su propio contador.
    expect(await db.withTenant(NORTE.id, (tx) => nextReceiptCode(tx, NORTE.id, location, 2097))).toBe(`${location.code}-R-2097-000001`);
    const other = NORTE.locations[0];
    expect(await db.withTenant(NORTE.id, (tx) => nextReceiptCode(tx, NORTE.id, other, 2097))).toBe(`${other.code}-R-2097-000001`);
  });
});
