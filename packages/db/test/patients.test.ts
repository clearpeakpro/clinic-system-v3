import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { referralSources } from '../src/catalog-schema.ts';
import { nextCode } from '../src/codes.ts';
import { createLocalFieldCipher } from '../src/field-cipher.ts';
import { codeCounters, patients } from '../src/patients-schema.ts';
import { organizations } from '../src/schema.ts';
import { DEMO } from '../src/seed.ts';
import { createTenantDb, type TenantDb } from '../src/with-tenant.ts';
import { expectPgError, SQLSTATE } from './helpers.ts';

// T-012: pacientes, códigos con code_counters (ADR 0019), búsqueda sin tildes
// (ADR 0007, 0026 y 0030) y cifrado de campos. Aislamiento con el rol real y
// un pool. Datos ficticios.

const NORTE = DEMO.norte;
const SUR = DEMO.sur;
const CHECK_VIOLATION = '23514';

describe('pacientes', () => {
  let pool: pg.Pool;
  let db: TenantDb;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 10 });
    db = createTenantDb(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  const base = (orgId: string, locationId: string) => ({
    organizationId: orgId,
    registeredLocationId: locationId,
    code: `P-8${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`,
    firstName: 'Paciente',
    lastName: 'De Prueba',
    birthDate: '2000-01-01',
  });

  it('la semilla deja 20 pacientes por clínica, con códigos P-000001… sin repetir', async () => {
    for (const org of [NORTE, SUR]) {
      const rows = await db.withTenant(org.id, (tx) => tx.select().from(patients).where(eq(patients.organizationId, org.id)));
      const seeded = rows.filter((r) => org.patients.some((p) => p.id === r.id));
      expect(seeded).toHaveLength(20);
      const codes = seeded.map((r) => r.code).sort();
      expect(codes[0]).toBe('P-000001');
      expect(new Set(codes).size).toBe(20);
      expect(seeded.every((r) => r.status === 'active')).toBe(true);
    }
  });

  it('cada organización ve solo sus pacientes y su contador; sin contexto no se ve nada', async () => {
    const norte = NORTE.patients[0].id;
    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(patients).where(eq(patients.id, norte)))).toEqual([]);
    const counters = await db.withTenant(SUR.id, (tx) => tx.select().from(codeCounters));
    expect(counters.every((c) => c.organizationId === SUR.id)).toBe(true);
    for (const table of ['patients', 'code_counters']) expect((await pool.query(`select * from app.${table}`)).rows, table).toEqual([]);
  });

  it('el contador da números seguidos y sin repetir, también con altas a la vez; si se deshace, no se gasta', async () => {
    const org = randomUUID();
    const operator = new pg.Pool({ connectionString: inject('operatorUrl'), max: 1 });
    await createTenantDb(operator).withTenant(org, (tx) => tx.insert(organizations).values({ id: org, name: 'Organización de prueba' }));
    await operator.end();
    const codes = await Promise.all(Array.from({ length: 15 }, () => db.withTenant(org, (tx) => nextCode(tx, org, 'patient'))));
    expect(codes.sort()).toEqual(Array.from({ length: 15 }, (_, i) => `P-${String(i + 1).padStart(6, '0')}`));
    await expect(
      db.withTenant(org, async (tx) => {
        await nextCode(tx, org, 'patient');
        throw new Error('se deshace');
      }),
    ).rejects.toThrow('se deshace');
    expect(await db.withTenant(org, (tx) => nextCode(tx, org, 'patient'))).toBe('P-000016');
  });

  it('reglas: código, teléfono, fecha, estado y detalles solo con fuente', async () => {
    const insert = (values: Partial<typeof patients.$inferInsert>) =>
      db.withTenant(NORTE.id, (tx) => tx.insert(patients).values({ ...base(NORTE.id, NORTE.locations[0].id), ...values }));
    await expectPgError(insert({ code: 'P-12' }), CHECK_VIOLATION);
    await expectPgError(insert({ phone: '555-0101' }), CHECK_VIOLATION);
    await expectPgError(insert({ phone: '123456' }), CHECK_VIOLATION);
    await expectPgError(insert({ birthDate: '1899-12-31' }), CHECK_VIOLATION);
    await expectPgError(insert({ status: 'borrado' }), CHECK_VIOLATION);
    await expectPgError(insert({ firstName: '' }), CHECK_VIOLATION);
    await expectPgError(insert({ referralDetailsEnc: 'v1:local:x' }), CHECK_VIOLATION);
    await insert({ phone: '2145550100' });
  });

  it('una fuente de referido o una fusión de otra organización no se aceptan', async () => {
    const [surSource] = await db.withTenant(SUR.id, (tx) => tx.select({ id: referralSources.id }).from(referralSources).limit(1));
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.insert(patients).values({ ...base(NORTE.id, NORTE.locations[0].id), referralSourceId: surSource?.id })),
      SQLSTATE.foreignKeyViolation,
    );
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.insert(patients).values({ ...base(NORTE.id, NORTE.locations[0].id), mergedInto: SUR.patients[0].id })),
      SQLSTATE.foreignKeyViolation,
    );
  });

  it('los pacientes y los contadores no se borran', async () => {
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.delete(patients)), SQLSTATE.insufficientPrivilege);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.delete(codeCounters)), SQLSTATE.insufficientPrivilege);
  });

  it('los detalles del referido no están en claro en la base y solo se descifran en su fila', async () => {
    const cipher = createLocalFieldCipher(inject('fieldKey'));
    const maria = NORTE.patients[0];
    const [row] = await db.withTenant(NORTE.id, (tx) => tx.select({ enc: patients.referralDetailsEnc }).from(patients).where(eq(patients.id, maria.id)));
    expect(row?.enc).toMatch(/^v1:local:/);
    expect(row?.enc).not.toContain('vecina');
    const context = { organizationId: NORTE.id, table: 'patients', column: 'referral_details', recordId: maria.id };
    expect(await cipher.decrypt(row?.enc ?? '', context)).toBe('Recomendada por una vecina');
    // En otra fila u otra organización no se descifra.
    await expect(cipher.decrypt(row?.enc ?? '', { ...context, recordId: NORTE.patients[1].id })).rejects.toThrow('no se pudo descifrar');
    await expect(cipher.decrypt(row?.enc ?? '', { ...context, organizationId: SUR.id })).rejects.toThrow('no se pudo descifrar');
    // Con otra clave tampoco.
    await expect(createLocalFieldCipher('x'.repeat(32)).decrypt(row?.enc ?? '', context)).rejects.toThrow();
  });

  it('app.search_text quita tildes y mayúsculas, y clinic_app puede usar los trigramas', async () => {
    const { rows } = await pool.query<{ text: string; dup: number; family: number }>(
      `select app.search_text('MARÍA López') as text,
              ext.similarity(app.search_text('Maria Lopez'), app.search_text('María López García')) as dup,
              ext.similarity(app.search_text('Mateo Hernández Díaz'), app.search_text('Lucía Hernández Díaz')) as family`,
    );
    expect(rows[0]?.text).toBe('maria lopez');
    // Umbral del ADR 0030: 0.6.
    expect(rows[0]?.dup).toBeGreaterThanOrEqual(0.6);
    expect(rows[0]?.family).toBeLessThan(0.6);
  });
});
