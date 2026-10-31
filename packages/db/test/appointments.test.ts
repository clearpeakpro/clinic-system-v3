import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { appointments } from '../src/appointments-schema.ts';
import { appointmentTypes } from '../src/catalog-schema.ts';
import { nextAppointmentCode } from '../src/codes.ts';
import { patients } from '../src/patients-schema.ts';
import { DEMO } from '../src/seed.ts';
import { createTenantDb, type TenantDb } from '../src/with-tenant.ts';
import { expectPgError, SQLSTATE } from './helpers.ts';

// T-014: citas. Aislamiento con el rol real (clinic_app) y un pool: cada
// organización ve y escribe solo sus citas, y una cita no puede apuntar a
// una sede, un paciente, un tipo ni un proveedor de otra organización.
// Código por sede con code_counters (ADR 0019). Datos ficticios.

const NORTE = DEMO.norte;
const SUR = DEMO.sur;
const CHECK_VIOLATION = '23514';

describe('citas', () => {
  let pool: pg.Pool;
  let db: TenantDb;
  const typeOf: Record<string, string> = {};

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 10 });
    db = createTenantDb(pool);
    for (const org of [NORTE, SUR]) {
      const [type] = await db.withTenant(org.id, (tx) => tx.select({ id: appointmentTypes.id }).from(appointmentTypes).limit(1));
      if (!type) throw new Error('La semilla no tiene tipos de cita');
      typeOf[org.id] = type.id;
    }
  });
  afterAll(async () => {
    await pool.end();
  });

  const base = (org: typeof NORTE | typeof SUR, extra: Partial<typeof appointments.$inferInsert> = {}): typeof appointments.$inferInsert => ({
    organizationId: org.id,
    locationId: org.locations[0].id,
    patientId: org.patients[0].id,
    appointmentTypeId: typeOf[org.id] ?? '',
    code: `${org.locations[0].code}-A-9${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`,
    startsAt: new Date('2026-11-02T15:00:00Z'),
    durationMinutes: 20,
    ...extra,
  });

  it('cada organización ve solo sus citas; sin contexto no se ve nada', async () => {
    const [created] = await db.withTenant(NORTE.id, (tx) => tx.insert(appointments).values(base(NORTE)).returning({ id: appointments.id }));
    if (!created) throw new Error('No se creó la cita');
    expect(await db.withTenant(NORTE.id, (tx) => tx.select().from(appointments).where(eq(appointments.id, created.id)))).toHaveLength(1);
    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(appointments).where(eq(appointments.id, created.id)))).toEqual([]);
    const sur = await db.withTenant(SUR.id, (tx) => tx.select({ org: appointments.organizationId }).from(appointments));
    expect(sur.every((r) => r.org === SUR.id)).toBe(true);
    expect((await pool.query('select * from app.appointments')).rows).toEqual([]);
    // Desde Sur no se puede cambiar una cita de Norte: la fila no existe para Sur.
    const updated = await db.withTenant(SUR.id, (tx) =>
      tx.update(appointments).set({ status: 'CANCELLED' }).where(eq(appointments.id, created.id)).returning({ id: appointments.id }),
    );
    expect(updated).toEqual([]);
  });

  it('no se escribe en otra organización ni se apunta a sus sedes, pacientes, tipos o proveedores', async () => {
    // Fila de Sur escrita con el contexto de Norte: la política lo impide.
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(appointments).values(base(SUR))), SQLSTATE.insufficientPrivilege);
    // Referencias de Sur en una cita de Norte: las claves compuestas lo impiden.
    const foreign = [
      { locationId: SUR.locations[0].id },
      { patientId: SUR.patients[0].id },
      { appointmentTypeId: typeOf[SUR.id] ?? '' },
      { providerMembershipId: randomUUID() },
    ];
    for (const extra of foreign) {
      await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(appointments).values(base(NORTE, extra))), SQLSTATE.foreignKeyViolation);
    }
    // Mover una cita propia a otra organización tampoco.
    const [own] = await db.withTenant(NORTE.id, (tx) => tx.insert(appointments).values(base(NORTE)).returning({ id: appointments.id }));
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.update(appointments).set({ organizationId: SUR.id }).where(eq(appointments.id, own?.id ?? ''))),
      SQLSTATE.insufficientPrivilege,
    );
  });

  it('clinic_app no borra citas', async () => {
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.delete(appointments).where(eq(appointments.organizationId, NORTE.id))),
      SQLSTATE.insufficientPrivilege,
    );
  });

  it('reglas: código, duración, estado y motivo solo en canceladas', async () => {
    const insert = (extra: Partial<typeof appointments.$inferInsert>) => db.withTenant(NORTE.id, (tx) => tx.insert(appointments).values(base(NORTE, extra)));
    await expectPgError(insert({ code: 'A-000001' }), CHECK_VIOLATION);
    await expectPgError(insert({ durationMinutes: 4 }), CHECK_VIOLATION);
    await expectPgError(insert({ durationMinutes: 481 }), CHECK_VIOLATION);
    await expectPgError(insert({ status: 'Programada' }), CHECK_VIOLATION);
    await expectPgError(insert({ cancelReasonEnc: 'v1:local:x' }), CHECK_VIOLATION);
    await insert({ status: 'CANCELLED', cancelReasonEnc: 'v1:local:x' });
  });

  it('el código de la cita lleva la sede y un contador propio por sede, sin repetir con altas a la vez', async () => {
    const [n1, n2] = NORTE.locations;
    const codes = await Promise.all(Array.from({ length: 10 }, () => db.withTenant(NORTE.id, (tx) => nextAppointmentCode(tx, NORTE.id, n1))));
    const numbers = codes.map((c) => Number(c.slice('NOR1-A-'.length))).sort((a, b) => a - b);
    expect(codes.every((c) => /^NOR1-A-\d{6}$/.test(c))).toBe(true);
    expect(new Set(numbers).size).toBe(10);
    expect((numbers.at(-1) ?? 0) - (numbers[0] ?? 0)).toBe(9);
    // NOR2 lleva su propia cuenta.
    const before = await db.withTenant(NORTE.id, (tx) => nextAppointmentCode(tx, NORTE.id, n2));
    const after = await db.withTenant(NORTE.id, (tx) => nextAppointmentCode(tx, NORTE.id, n2));
    expect(Number(after.slice(7)) - Number(before.slice(7))).toBe(1);
    expect(before.startsWith('NOR2-A-')).toBe(true);
  });

  it('una cita de un paciente inexistente no se crea', async () => {
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(appointments).values(base(NORTE, { patientId: randomUUID() }))), SQLSTATE.foreignKeyViolation);
    const [row] = await db.withTenant(NORTE.id, (tx) => tx.select({ id: patients.id }).from(patients).limit(1));
    expect(row).toBeDefined();
  });
});
