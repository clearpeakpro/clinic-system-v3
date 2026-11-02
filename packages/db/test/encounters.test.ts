import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { appointments } from '../src/appointments-schema.ts';
import { appointmentTypes } from '../src/catalog-schema.ts';
import { nextEncounterCode } from '../src/codes.ts';
import { coverages, encounterEvents, encounters } from '../src/encounters-schema.ts';
import { DEMO } from '../src/seed.ts';
import { createTenantDb, type TenantDb } from '../src/with-tenant.ts';
import { expectPgError, SQLSTATE } from './helpers.ts';

// T-017: visitas, historial y cobertura. Aislamiento con el rol real
// (clinic_app) y un pool: cada organización ve y escribe solo lo suyo, y
// nada apunta a otra organización. Una visita abierta por paciente y sede, y
// por cita. El historial es append-only. Datos ficticios.

const NORTE = DEMO.norte;
const SUR = DEMO.sur;
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

type Org = typeof NORTE | typeof SUR;

describe('visitas', () => {
  let pool: pg.Pool;
  let db: TenantDb;
  // Cada prueba usa su propio paciente para no chocar con «una visita abierta».
  let nextPatient = 0;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 10 });
    db = createTenantDb(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  const patientOf = (org: Org) => {
    const patient = org.patients[nextPatient++ % org.patients.length];
    if (!patient) throw new Error('sin paciente');
    return patient.id;
  };

  const encounter = (org: Org, extra: Partial<typeof encounters.$inferInsert> = {}): typeof encounters.$inferInsert => ({
    organizationId: org.id,
    locationId: org.locations[0].id,
    patientId: patientOf(org),
    code: `${org.locations[0].code}-V-9${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`,
    source: 'walk_in',
    route: 'STANDARD',
    arrivedAt: new Date('2026-11-02T15:00:00Z'),
    ...extra,
  });

  async function create(org: Org, extra: Partial<typeof encounters.$inferInsert> = {}): Promise<string> {
    const [row] = await db.withTenant(org.id, (tx) => tx.insert(encounters).values(encounter(org, extra)).returning({ id: encounters.id }));
    if (!row) throw new Error('No se creó la visita');
    return row.id;
  }

  /** Cierra la visita para liberar al paciente en las pruebas que reutilizan. */
  const close = (org: Org, id: string) =>
    db.withTenant(org.id, (tx) => tx.update(encounters).set({ status: 'CANCELLED', closedAt: new Date() }).where(eq(encounters.id, id)));

  it('cada organización ve solo sus visitas, historial y coberturas; sin contexto no se ve nada', async () => {
    const id = await create(NORTE);
    await db.withTenant(NORTE.id, async (tx) => {
      await tx.insert(encounterEvents).values({
        organizationId: NORTE.id,
        encounterId: id,
        locationId: NORTE.locations[0].id,
        action: 'check_in',
        toStatus: 'CHECKED_IN',
        actorType: 'system',
        encounterVersion: 1,
        occurredAt: new Date(),
      });
      await tx.insert(coverages).values({ organizationId: NORTE.id, encounterId: id, type: 'self_pay' });
    });
    for (const table of [encounters, encounterEvents, coverages] as const) {
      const column = table === encounters ? encounters.id : table === encounterEvents ? encounterEvents.encounterId : coverages.encounterId;
      expect(await db.withTenant(NORTE.id, (tx) => tx.select().from(table).where(eq(column, id)))).toHaveLength(1);
      expect(await db.withTenant(SUR.id, (tx) => tx.select().from(table).where(eq(column, id)))).toEqual([]);
    }
    for (const name of ['encounters', 'encounter_events', 'coverages']) {
      expect((await pool.query(`select * from app.${name}`)).rows).toEqual([]);
    }
    const updated = await db.withTenant(SUR.id, (tx) => tx.update(encounters).set({ status: 'WITH_NURSE' }).where(eq(encounters.id, id)).returning({ id: encounters.id }));
    expect(updated).toEqual([]);
  });

  it('no se escribe en otra organización ni se apunta a sus sedes, pacientes, citas, tipos o membresías', async () => {
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(encounters).values(encounter(SUR))), SQLSTATE.insufficientPrivilege);
    const foreign: Partial<typeof encounters.$inferInsert>[] = [
      { locationId: SUR.locations[0].id },
      { patientId: SUR.patients[0].id },
      { appointmentTypeId: randomUUID() },
      { providerMembershipId: randomUUID() },
      { source: 'appointment', appointmentId: randomUUID() },
    ];
    for (const extra of foreign) {
      await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(encounters).values(encounter(NORTE, extra))), SQLSTATE.foreignKeyViolation);
    }
    const id = await create(NORTE);
    // Historial y cobertura de Norte con el contexto de Sur, o apuntando a una visita de Norte desde Sur.
    await expectPgError(
      db.withTenant(SUR.id, (tx) => tx.insert(coverages).values({ organizationId: SUR.id, encounterId: id, type: 'self_pay' })),
      SQLSTATE.foreignKeyViolation,
    );
    await expectPgError(
      db.withTenant(SUR.id, (tx) => tx.insert(coverages).values({ organizationId: NORTE.id, encounterId: id, type: 'self_pay' })),
      SQLSTATE.insufficientPrivilege,
    );
    await expectPgError(
      db.withTenant(SUR.id, (tx) =>
        tx.insert(encounterEvents).values({
          organizationId: SUR.id,
          encounterId: id,
          locationId: SUR.locations[0].id,
          action: 'check_in',
          toStatus: 'CHECKED_IN',
          actorType: 'system',
          encounterVersion: 1,
          occurredAt: new Date(),
        }),
      ),
      SQLSTATE.foreignKeyViolation,
    );
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.update(encounters).set({ organizationId: SUR.id }).where(eq(encounters.id, id))),
      SQLSTATE.insufficientPrivilege,
    );
    await close(NORTE, id);
  });

  it('clinic_app no borra visitas ni coberturas, y no cambia ni borra el historial', async () => {
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.delete(encounters).where(eq(encounters.organizationId, NORTE.id))), SQLSTATE.insufficientPrivilege);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.delete(coverages).where(eq(coverages.organizationId, NORTE.id))), SQLSTATE.insufficientPrivilege);
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.delete(encounterEvents).where(eq(encounterEvents.organizationId, NORTE.id))),
      SQLSTATE.insufficientPrivilege,
    );
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.update(encounterEvents).set({ forced: true }).where(eq(encounterEvents.organizationId, NORTE.id))),
      SQLSTATE.insufficientPrivilege,
    );
  });

  it('una sola visita abierta por paciente y sede, y por cita; cerrada, libera', async () => {
    const patientId = patientOf(NORTE);
    const first = await create(NORTE, { patientId });
    await expectPgError(create(NORTE, { patientId }), UNIQUE_VIOLATION);
    // En la otra sede sí puede tener su visita.
    const other = await create(NORTE, { patientId, locationId: NORTE.locations[1].id, code: `NOR2-V-9${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}` });
    await close(NORTE, first);
    await close(NORTE, other);
    const again = await create(NORTE, { patientId });
    await close(NORTE, again);

    const appointment = await db.withTenant(NORTE.id, async (tx) => {
      const [type] = await tx.select({ id: appointmentTypes.id }).from(appointmentTypes).limit(1);
      if (!type) throw new Error('La semilla no tiene tipos de cita');
      const [row] = await tx
        .insert(appointments)
        .values({
          organizationId: NORTE.id,
          locationId: NORTE.locations[0].id,
          patientId: patientOf(NORTE),
          appointmentTypeId: type.id,
          code: `NOR1-A-9${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`,
          startsAt: new Date('2026-11-02T15:00:00Z'),
          durationMinutes: 20,
        })
        .returning({ id: appointments.id });
      if (!row) throw new Error('sin cita');
      return row;
    });
    const a = await create(NORTE, { source: 'appointment', appointmentId: appointment.id });
    await expectPgError(create(NORTE, { source: 'appointment', appointmentId: appointment.id }), UNIQUE_VIOLATION);
    await close(NORTE, a);
  });

  it('reglas: código, estado, ruta, origen, cierre y cobertura con un solo término', async () => {
    const insert = (extra: Partial<typeof encounters.$inferInsert>) => db.withTenant(NORTE.id, (tx) => tx.insert(encounters).values(encounter(NORTE, extra)));
    await expectPgError(insert({ code: 'NOR1-E-000001' }), CHECK_VIOLATION);
    await expectPgError(insert({ status: 'Registrado' }), CHECK_VIOLATION);
    await expectPgError(insert({ route: 'EXPRESS' }), CHECK_VIOLATION);
    await expectPgError(insert({ source: 'appointment' }), CHECK_VIOLATION);
    await expectPgError(insert({ status: 'COMPLETED' }), CHECK_VIOLATION);
    await expectPgError(insert({ closedAt: new Date() }), CHECK_VIOLATION);

    const id = await create(NORTE);
    const cover = (values: Partial<typeof coverages.$inferInsert>) =>
      db.withTenant(NORTE.id, (tx) => tx.insert(coverages).values({ organizationId: NORTE.id, encounterId: id, type: 'insurance', ...values }));
    // Seguro sin nombre, sin término, con dos valores o con el valor que no corresponde.
    await expectPgError(cover({ term: 'copay', amountCents: 2500 }), CHECK_VIOLATION);
    await expectPgError(cover({ insurerNameEnc: 'v1:local:x', amountCents: 2500 }), CHECK_VIOLATION);
    await expectPgError(cover({ insurerNameEnc: 'v1:local:x', term: 'copay', amountCents: 2500, coinsuranceBp: 2000 }), CHECK_VIOLATION);
    await expectPgError(cover({ insurerNameEnc: 'v1:local:x', term: 'coinsurance', amountCents: 2000 }), CHECK_VIOLATION);
    await expectPgError(cover({ insurerNameEnc: 'v1:local:x', term: 'coinsurance', coinsuranceBp: 10001 }), CHECK_VIOLATION);
    await expectPgError(cover({ insurerNameEnc: 'v1:local:x', term: 'deductible', amountCents: -1 }), CHECK_VIOLATION);
    // Pago directo sin datos del seguro.
    await expectPgError(cover({ type: 'self_pay', insurerNameEnc: 'v1:local:x' }), CHECK_VIOLATION);
    await cover({ insurerNameEnc: 'v1:local:x', term: 'coinsurance', coinsuranceBp: 2000 });
    // Una sola cobertura por visita.
    await expectPgError(cover({ type: 'self_pay' }), UNIQUE_VIOLATION);
    await close(NORTE, id);
  });

  it('el código de la visita lleva la sede y un contador propio por sede, sin repetir con altas a la vez', async () => {
    const [n1, n2] = NORTE.locations;
    const codes = await Promise.all(Array.from({ length: 10 }, () => db.withTenant(NORTE.id, (tx) => nextEncounterCode(tx, NORTE.id, n1))));
    const numbers = codes.map((c) => Number(c.slice('NOR1-V-'.length))).sort((a, b) => a - b);
    expect(codes.every((c) => /^NOR1-V-\d{6}$/.test(c))).toBe(true);
    expect(new Set(numbers).size).toBe(10);
    expect((numbers.at(-1) ?? 0) - (numbers[0] ?? 0)).toBe(9);
    const before = await db.withTenant(NORTE.id, (tx) => nextEncounterCode(tx, NORTE.id, n2));
    const after = await db.withTenant(NORTE.id, (tx) => nextEncounterCode(tx, NORTE.id, n2));
    expect(Number(after.slice(7)) - Number(before.slice(7))).toBe(1);
    expect(before.startsWith('NOR2-V-')).toBe(true);
  });
});
