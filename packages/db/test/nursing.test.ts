import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { encounters } from '../src/encounters-schema.ts';
import { memberships } from '../src/identity-schema.ts';
import { encounterAssessments, encounterVitals, patientHistories } from '../src/nursing-schema.ts';
import { DEMO } from '../src/seed.ts';
import { createTenantDb, type TenantDb } from '../src/with-tenant.ts';
import { expectPgError, SQLSTATE } from './helpers.ts';

// T-022: signos vitales, historia del paciente y valoración de la visita.
// Aislamiento con el rol real (clinic_app) y un pool: cada organización ve y
// escribe solo lo suyo y nada apunta a otra. La historia es append-only.
// Reglas de la base: rangos, presión, IMC y estado de las alergias (ADR 0040).
// Los valores cifrados son texto ficticio: aquí solo importa la forma.

const NORTE = DEMO.norte;
const SUR = DEMO.sur;
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

type Org = typeof NORTE | typeof SUR;

describe('enfermería', () => {
  let pool: pg.Pool;
  let db: TenantDb;
  let nextPatient = 0;
  const member: Record<string, string> = {};

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 10 });
    db = createTenantDb(pool);
    // Una enfermera ficticia en cada organización (quien registra).
    for (const org of [NORTE, SUR]) {
      const userId = randomUUID();
      await pool.query(
        `insert into auth."user" (id, name, email, email_verified, created_at, updated_at) values ($1, $2, $3, true, now(), now())`,
        [userId, 'Enfermera ficticia', `enf.${userId}@example.test`],
      );
      const id = randomUUID();
      await db.withTenant(org.id, (tx) => tx.insert(memberships).values({ id, organizationId: org.id, userId }));
      member[org.id] = id;
    }
  });
  afterAll(async () => {
    await pool.end();
  });

  const by = (org: Org) => member[org.id] ?? '';

  /** Una visita cerrada (no ocupa «una visita abierta por paciente») de un paciente de la semilla. */
  async function visit(org: Org): Promise<{ id: string; patientId: string }> {
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
          status: 'CANCELLED',
          arrivedAt: new Date('2026-11-02T15:00:00Z'),
          closedAt: new Date('2026-11-02T16:00:00Z'),
        })
        .returning({ id: encounters.id }),
    );
    if (!row) throw new Error('sin visita');
    return { id: row.id, patientId: patient.id };
  }

  const now = new Date('2026-11-02T15:30:00Z');
  const vitals = (org: Org, encounterId: string, extra: Partial<typeof encounterVitals.$inferInsert> = {}): typeof encounterVitals.$inferInsert => ({
    organizationId: org.id,
    encounterId,
    weightLbX100: 15200,
    systolic: 120,
    diastolic: 80,
    recordedByMembershipId: by(org),
    recordedAt: now,
    updatedByMembershipId: by(org),
    updatedAt: now,
    ...extra,
  });
  const history = (org: Org, v: { id: string; patientId: string }, extra: Partial<typeof patientHistories.$inferInsert> = {}): typeof patientHistories.$inferInsert => ({
    organizationId: org.id,
    patientId: v.patientId,
    version: 1,
    allergyStatus: 'none_known',
    encounterId: v.id,
    locationId: org.locations[0].id,
    recordedByMembershipId: by(org),
    recordedAt: now,
    ...extra,
  });
  const assessment = (org: Org, encounterId: string): typeof encounterAssessments.$inferInsert => ({
    organizationId: org.id,
    encounterId,
    symptomsEnc: 'cifrado-ficticio',
    recordedByMembershipId: by(org),
    recordedAt: now,
    updatedByMembershipId: by(org),
    updatedAt: now,
  });

  it('cada organización ve solo sus signos vitales, historias y valoraciones; sin contexto no se ve nada', async () => {
    const v = await visit(NORTE);
    await db.withTenant(NORTE.id, async (tx) => {
      await tx.insert(encounterVitals).values(vitals(NORTE, v.id));
      await tx.insert(patientHistories).values(history(NORTE, v, { version: 9001 }));
      await tx.insert(encounterAssessments).values(assessment(NORTE, v.id));
    });
    expect(await db.withTenant(NORTE.id, (tx) => tx.select().from(encounterVitals).where(eq(encounterVitals.encounterId, v.id)))).toHaveLength(1);
    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(encounterVitals).where(eq(encounterVitals.encounterId, v.id)))).toEqual([]);
    expect(await db.withTenant(NORTE.id, (tx) => tx.select().from(patientHistories).where(eq(patientHistories.encounterId, v.id)))).toHaveLength(1);
    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(patientHistories).where(eq(patientHistories.encounterId, v.id)))).toEqual([]);
    expect(await db.withTenant(NORTE.id, (tx) => tx.select().from(encounterAssessments).where(eq(encounterAssessments.encounterId, v.id)))).toHaveLength(1);
    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(encounterAssessments).where(eq(encounterAssessments.encounterId, v.id)))).toEqual([]);
    for (const name of ['encounter_vitals', 'patient_histories', 'encounter_assessments']) {
      expect((await pool.query(`select * from app.${name}`)).rows).toEqual([]);
    }
    const updated = await db.withTenant(SUR.id, (tx) => tx.update(encounterVitals).set({ pulse: 70 }).where(eq(encounterVitals.encounterId, v.id)).returning({ id: encounterVitals.id }));
    expect(updated).toEqual([]);
  });

  it('no se escribe en otra organización ni se apunta a sus visitas, pacientes o membresías', async () => {
    const norte = await visit(NORTE);
    // Con el contexto de Sur: fila de Norte (RLS) o fila de Sur que apunta a Norte (clave compuesta).
    await expectPgError(db.withTenant(SUR.id, (tx) => tx.insert(encounterVitals).values(vitals(NORTE, norte.id))), SQLSTATE.insufficientPrivilege);
    await expectPgError(db.withTenant(SUR.id, (tx) => tx.insert(encounterVitals).values(vitals(SUR, norte.id))), SQLSTATE.foreignKeyViolation);
    await expectPgError(db.withTenant(SUR.id, (tx) => tx.insert(encounterAssessments).values(assessment(SUR, norte.id))), SQLSTATE.foreignKeyViolation);
    await expectPgError(
      db.withTenant(SUR.id, (tx) => tx.insert(patientHistories).values(history(SUR, norte, { locationId: SUR.locations[0].id }))),
      SQLSTATE.foreignKeyViolation,
    );
    const sur = await visit(SUR);
    await expectPgError(
      db.withTenant(SUR.id, (tx) => tx.insert(encounterVitals).values(vitals(SUR, sur.id, { recordedByMembershipId: by(NORTE) }))),
      SQLSTATE.foreignKeyViolation,
    );
  });

  it('clinic_app no borra signos vitales ni valoraciones, y no cambia ni borra la historia del paciente', async () => {
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.delete(encounterVitals).where(eq(encounterVitals.organizationId, NORTE.id))), SQLSTATE.insufficientPrivilege);
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.delete(encounterAssessments).where(eq(encounterAssessments.organizationId, NORTE.id))),
      SQLSTATE.insufficientPrivilege,
    );
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.delete(patientHistories).where(eq(patientHistories.organizationId, NORTE.id))), SQLSTATE.insufficientPrivilege);
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.update(patientHistories).set({ allergyStatus: 'not_recorded' }).where(eq(patientHistories.organizationId, NORTE.id))),
      SQLSTATE.insufficientPrivilege,
    );
  });

  it('reglas: rangos, diastólica menor que sistólica, IMC con peso y estatura, un registro por visita', async () => {
    const v = await visit(NORTE);
    const bad: Partial<typeof encounterVitals.$inferInsert>[] = [
      { weightLbX100: 99 },
      { systolic: 120, diastolic: 120 },
      { pain: 11 },
      { spo2: 101 },
      { temperatureFX10: 1151 },
      { bmiX10: 245 }, // IMC sin estatura
      { heightInX100: 6800 }, // estatura y peso sin IMC
    ];
    for (const extra of bad) {
      await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(encounterVitals).values(vitals(NORTE, v.id, extra))), CHECK_VIOLATION);
    }
    await db.withTenant(NORTE.id, (tx) => tx.insert(encounterVitals).values(vitals(NORTE, v.id, { heightInX100: 6800, bmiX10: 231 })));
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(encounterVitals).values(vitals(NORTE, v.id))), UNIQUE_VIOLATION);
  });

  it('alergias (ADR 0040): «registradas» con texto; «sin alergias conocidas» y «no registradas» sin texto; versiones únicas por paciente', async () => {
    const v = await visit(NORTE);
    const base = 9100 + Math.floor(Math.random() * 800);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(patientHistories).values(history(NORTE, v, { version: base, allergyStatus: 'recorded' }))), CHECK_VIOLATION);
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.insert(patientHistories).values(history(NORTE, v, { version: base, allergyStatus: 'none_known', allergiesEnc: 'cifrado-ficticio' }))),
      CHECK_VIOLATION,
    );
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(patientHistories).values(history(NORTE, v, { version: base, allergyStatus: 'otra' }))), CHECK_VIOLATION);
    await db.withTenant(NORTE.id, (tx) => tx.insert(patientHistories).values(history(NORTE, v, { version: base, allergyStatus: 'recorded', allergiesEnc: 'cifrado-ficticio' })));
    await db.withTenant(NORTE.id, (tx) => tx.insert(patientHistories).values(history(NORTE, v, { version: base + 1, allergyStatus: 'not_recorded' })));
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(patientHistories).values(history(NORTE, v, { version: base }))), UNIQUE_VIOLATION);
  });
});
