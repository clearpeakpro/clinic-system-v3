import { randomUUID } from 'node:crypto';
import { appointments, appointmentTypes, consultations, createTenantDb, encounters, membershipPlans, nextAppointmentCode, nextCode, patients, receipts } from '@clinic/db';
import type {
  ArrivalResult,
  BillingStatement,
  EncounterDetail,
  MergePreview,
  PatientBalances,
  PatientMembershipCard,
  PatientProfile,
  PatientSearchResult,
  PaymentRecorded,
  ReceiptDocument,
  ReceiptGenerated,
} from '@clinic/shared';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixedClock } from '../src/clock.ts';
import { MERGE_PATIENT_TABLES } from '../src/patient-merge.ts';
import { createStaff, NORTE, readAudit, signedInWithContext, SUR, type Client, type TestApp, startApp } from './support.ts';

// T-030: fusionar pacientes (S-PAC-13 y 14; ADR 0032 y sus precisiones del
// 2026-11-07), con el reloj fijado. Cada prueba crea sus propios pacientes
// ficticios.

/** 5 nov 2026, 10:00 a. m. en Chicago (NOR1). */
const NOW = '2026-11-05T16:00:00Z';
const REASON = 'Mismo paciente ficticio registrado dos veces';
const ALLERGY = 'Penicilina ficticia';

describe('T-030 fusionar pacientes', () => {
  const clock = new FixedClock(NOW);
  let app: TestApp;
  let recepcion: Client;
  let recepcionNor2: Client;
  let enfermeria: Client;
  let adminConRol: Client;
  let ownerConRol: Client;
  let adminSinRol: Client;
  let recepcionSur: Client;
  let counter = 0;
  let consultId = '';
  let planId = '';
  let typeId = '';
  const db = () => createTenantDb(app.pool);

  beforeAll(async () => {
    app = await startApp({}, { clock });
    recepcion = await signedInWithContext(app, await createStaff(app, 'merge-rec', [{ org: NORTE, location: 0, role: 'recepcion' }]), NORTE, 0);
    recepcionNor2 = await signedInWithContext(app, await createStaff(app, 'merge-rec2', [{ org: NORTE, location: 1, role: 'recepcion' }]), NORTE, 1);
    enfermeria = await signedInWithContext(app, await createStaff(app, 'merge-enf', [{ org: NORTE, location: 0, role: 'enfermeria' }]), NORTE, 0);
    adminConRol = await signedInWithContext(
      app,
      await createStaff(app, 'merge-admin-rec', [
        { org: NORTE, location: null, role: 'administrador' },
        { org: NORTE, location: 0, role: 'recepcion' },
      ]),
      NORTE,
      0,
      { mfa: true },
    );
    ownerConRol = await signedInWithContext(
      app,
      await createStaff(app, 'merge-owner-enf', [
        { org: NORTE, location: null, role: 'propietario' },
        { org: NORTE, location: 0, role: 'enfermeria' },
      ]),
      NORTE,
      0,
      { mfa: true },
    );
    adminSinRol = await signedInWithContext(app, await createStaff(app, 'merge-admin', [{ org: NORTE, location: null, role: 'administrador' }]), NORTE, 0, { mfa: true });
    recepcionSur = await signedInWithContext(app, await createStaff(app, 'merge-rec-sur', [{ org: SUR, location: 0, role: 'recepcion' }]), SUR, 0);
    await db().withTenant(NORTE.id, async (tx) => {
      consultId = (await tx.select({ id: consultations.id }).from(consultations).where(eq(consultations.code, 'CONS-INICIAL')))[0]?.id ?? '';
      planId = (await tx.select({ id: membershipPlans.id }).from(membershipPlans).where(eq(membershipPlans.code, 'ESENCIAL')))[0]?.id ?? '';
      typeId = (await tx.select({ id: appointmentTypes.id }).from(appointmentTypes).where(eq(appointmentTypes.code, 'CONSULTA')))[0]?.id ?? '';
    });
  });
  afterAll(async () => {
    await app.close();
  });

  const key = () => `fusion-${randomUUID()}`;
  const code = (response: { json: () => unknown }) => (response.json() as { code: string }).code;

  async function newPatient(lastName = `Fusión Ficticia ${String((counter += 1))}`): Promise<{ id: string; code: string; lastName: string }> {
    return db().withTenant(NORTE.id, async (tx) => {
      const id = uuidv7();
      const patientCode = await nextCode(tx, NORTE.id, 'patient');
      await tx.insert(patients).values({ id, organizationId: NORTE.id, registeredLocationId: NORTE.locations[0].id, code: patientCode, firstName: 'Ana', lastName, birthDate: '1985-03-04' });
      return { id, code: patientCode, lastName };
    });
  }
  async function appointmentFor(patientId: string): Promise<string> {
    return db().withTenant(NORTE.id, async (tx) => {
      const id = uuidv7();
      await tx.insert(appointments).values({
        id,
        organizationId: NORTE.id,
        locationId: NORTE.locations[0].id,
        patientId,
        appointmentTypeId: typeId,
        code: await nextAppointmentCode(tx, NORTE.id, NORTE.locations[0]),
        startsAt: new Date('2026-11-20T16:00:00Z'),
        durationMinutes: 20,
      });
      return id;
    });
  }
  async function arrive(patientId: string, route = 'LAB_ONLY', client = recepcion): Promise<string> {
    const response = await client.post('/api/encounters', { source: 'walk_in', patientId, appointmentTypeId: null, route, coverage: { type: 'self_pay' } }, { 'idempotency-key': key() });
    expect(response.statusCode, response.body).toBe(201);
    return response.json<ArrivalResult>().encounter.id;
  }
  const detail = async (encounterId: string, client = recepcion) => {
    const response = await client.get(`/api/encounters/${encounterId}`);
    expect(response.statusCode, response.body).toBe(200);
    return response.json<EncounterDetail>();
  };
  const statement = async (encounterId: string) => (await recepcion.get(`/api/encounters/${encounterId}/statement`)).json<BillingStatement>();
  /** Visita con la consulta inicial ($60.00), $10.00 pagados y su recibo; se cierra como «Se retiró» (saldo $50.00). */
  async function visitWithBalance(patientId: string): Promise<{ encounterId: string; receiptId: string }> {
    const encounterId = await arrive(patientId);
    const charge = await recepcion.post(
      `/api/encounters/${encounterId}/charges`,
      { item: { kind: 'consultation', id: consultId }, quantity: 1, expectedVersion: (await statement(encounterId)).statementVersion },
      { 'idempotency-key': key() },
    );
    expect(charge.statusCode, charge.body).toBe(201);
    const payment = await recepcion.post(
      `/api/encounters/${encounterId}/payments`,
      { method: 'cash', amountCents: 1000, expectedVersion: (await statement(encounterId)).statementVersion },
      { 'idempotency-key': key() },
    );
    expect(payment.statusCode, payment.body).toBe(201);
    const receipt = await recepcion.post(`/api/encounters/${encounterId}/receipts`, { paymentId: payment.json<PaymentRecorded>().paymentId }, { 'idempotency-key': key() });
    expect(receipt.statusCode, receipt.body).toBe(201);
    const closed = await recepcion.post(`/api/encounters/${encounterId}/close`, { outcome: 'LEFT_EARLY', reason: 'Prueba', expectedVersion: (await detail(encounterId)).version });
    expect(closed.statusCode, closed.body).toBe(200);
    return { encounterId, receiptId: receipt.json<ReceiptGenerated>().id };
  }
  /** Visita «Estándar» en NOR1 con la historia que guarda Enfermería. */
  async function withHistory(patientId: string, body: Record<string, unknown>, close = false): Promise<string> {
    const encounterId = await arrive(patientId, 'STANDARD');
    expect((await recepcion.post(`/api/encounters/${encounterId}/transition`, { action: 'send_to_nurse', expectedVersion: 1 })).statusCode).toBe(200);
    const saved = await enfermeria.put(`/api/encounters/${encounterId}/assessment`, { history: {}, visit: {}, historyVersion: 0, assessmentVersion: 0, ...body });
    expect(saved.statusCode, saved.body).toBe(200);
    if (close) {
      const closed = await recepcion.post(`/api/encounters/${encounterId}/close`, { outcome: 'LEFT_EARLY', reason: 'Prueba', expectedVersion: (await detail(encounterId)).version });
      expect(closed.statusCode, closed.body).toBe(200);
    }
    return encounterId;
  }
  async function enroll(patientId: string) {
    const response = await recepcion.post(
      `/api/patients/${patientId}/membership`,
      { planId, startDate: '2026-11-05', billingDay: 15, affiliatePatientIds: [], identityVerified: true },
      { 'idempotency-key': key() },
    );
    expect(response.statusCode, response.body).toBe(201);
  }
  const profile = async (patientId: string, client = adminConRol) => (await client.get(`/api/patients/${patientId}`)).json<PatientProfile>();
  const merge = async (duplicateId: string, principalId: string, extra: Record<string, unknown> = {}, client = adminConRol, idempotencyKey = key()) =>
    client.post(
      `/api/patients/${duplicateId}/merge`,
      {
        principalId,
        principalVersion: (await profile(principalId)).version,
        duplicateVersion: (await profile(duplicateId)).version,
        reason: REASON,
        confirm: 'FUSIONAR',
        ...extra,
      },
      { 'idempotency-key': idempotencyKey },
    );

  it('cada tabla con referencia a un paciente está en la fusión (ADR 0032)', async () => {
    const { rows } = await app.pool.query<{ table: string }>(
      `select distinct c.conrelid::regclass::text as table from pg_constraint c where c.contype = 'f' and c.confrelid = 'app.patients'::regclass order by 1`,
    );
    expect(rows.map((r) => r.table.replace(/^app\./, '').replaceAll('"', ''))).toEqual(Object.keys(MERGE_PATIENT_TABLES).sort());
  });

  it('todo pasa al principal: citas, visitas, saldos, recibos, membresía e historia combinada', async () => {
    clock.set(NOW);
    const principal = await newPatient();
    const duplicate = await newPatient();
    // El principal: «Sin alergias conocidas» y una visita abierta en otra sede (no bloquea).
    await withHistory(principal.id, { allergyStatus: 'none_known', history: { personalHistory: 'Hipertensión ficticia' } }, true);
    const principalOpen = await arrive(principal.id, 'LAB_ONLY', recepcionNor2);
    // El duplicado: una cita, una visita con saldo y recibo, una visita abierta con alergias y una membresía.
    await appointmentFor(duplicate.id);
    const { encounterId: owed, receiptId } = await visitWithBalance(duplicate.id);
    const open = await withHistory(duplicate.id, { allergyStatus: 'recorded', history: { allergies: ALLERGY, personalHistory: 'Asma ficticia' } });
    await enroll(duplicate.id);

    const previewResponse = await adminConRol.get(`/api/patients/${duplicate.id}/merge-preview?with=${principal.id}`);
    expect(previewResponse.statusCode, previewResponse.body).toBe(200);
    const preview = previewResponse.json<MergePreview>();
    expect(preview.blockers).toEqual([]);
    expect(preview.patients[0]).toMatchObject({ id: duplicate.id, appointments: 1, encounters: 2, openVisitLocations: ['NOR1'], membership: { role: 'holder', status: 'pending_payment' } });
    expect(preview.patients[1]).toMatchObject({ id: principal.id, encounters: 2, openVisitLocations: ['NOR2'], membership: null });

    const idempotencyKey = key();
    const response = await merge(duplicate.id, principal.id, {}, adminConRol, idempotencyKey);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ principalId: principal.id });

    // El duplicado queda «Fusionado» y su código lleva al principal.
    expect((await profile(duplicate.id)).mergedInto).toEqual({ id: principal.id, code: principal.code });
    expect((await profile(principal.id)).mergedInto).toBeNull();
    const found = (await recepcion.post('/api/patients/search', { q: duplicate.code, offset: 0, includeInactive: false })).json<PatientSearchResult>();
    expect(found.patients.map((p) => p.id)).toEqual([principal.id]);

    // Visitas y citas.
    const left = await db().withTenant(NORTE.id, async (tx) => ({
      encounters: await tx.select({ id: encounters.id }).from(encounters).where(eq(encounters.patientId, duplicate.id)),
      appointments: await tx.select({ id: appointments.id }).from(appointments).where(eq(appointments.patientId, duplicate.id)),
    }));
    expect(left).toEqual({ encounters: [], appointments: [] });
    expect((await detail(open)).patient.id).toBe(principal.id);
    expect((await detail(principalOpen, recepcionNor2)).patient.id).toBe(principal.id);
    // Saldos: la visita del duplicado aparece en el principal, sin compensarse.
    const balances = (await recepcion.get(`/api/patients/${principal.id}/balances`)).json<PatientBalances>();
    expect(balances.visits.map((v) => [v.encounterId, v.balanceCents])).toEqual([[owed, 5000]]);
    // La membresía pasa con su titular y su cuota pendiente.
    const card = (await recepcion.get(`/api/patients/${principal.id}/membership`)).json<PatientMembershipCard>();
    expect(card.membership).toMatchObject({ status: 'pending_payment' });
    expect(balances.fees).toHaveLength(1);
    // El recibo pasa al principal, pero su instantánea no cambia.
    const [row] = await db().withTenant(NORTE.id, (tx) => tx.select({ patientId: receipts.patientId }).from(receipts).where(eq(receipts.id, receiptId)));
    expect(row?.patientId).toBe(principal.id);
    expect((await recepcion.get(`/api/receipts/${receiptId}?lang=es`)).json<ReceiptDocument>().text).toContain(`(${duplicate.code})`);
    // Historia combinada: la alergia registrada gana a «Sin alergias conocidas»; los antecedentes, los dos.
    const nursing = await detail(open, enfermeria);
    expect(nursing.allergies).toEqual({ status: 'recorded', text: ALLERGY });

    // Auditoría con conteos, ids y motivo, sin nombres.
    const [audit] = await readAudit(`action = 'patient.merge' and entity_id = $1`, [duplicate.id]);
    expect(audit?.reason).toBe(REASON);
    expect(audit?.metadata).toEqual({
      principal: principal.id,
      duplicate: duplicate.id,
      appointments: 1,
      encounters: 2,
      orders: 0,
      charges: 1,
      payments: 1,
      receipts: 1,
      memberships: 1,
      kioskCheckins: 0,
      history: 1,
    });
    const [history] = await readAudit(`action = 'patient.history_saved' and entity_id = $1 and metadata->>'merge' = 'true'`, [principal.id]);
    expect(history?.metadata).toMatchObject({ fields: 'allergies,personalHistory,allergyStatus', version: 2 });
    const named = await readAudit(`(metadata::text like $1 or metadata::text like $2 or coalesce(reason, '') like $1) and action like 'patient.%'`, [`%${duplicate.lastName}%`, `%${ALLERGY}%`]);
    expect(named).toEqual([]);

    // Repetir con la misma clave: mismo resultado; con otro contenido, 409.
    const again = await adminConRol.post(
      `/api/patients/${duplicate.id}/merge`,
      { principalId: principal.id, principalVersion: preview.patients[1].version, duplicateVersion: preview.patients[0].version, reason: REASON, confirm: 'FUSIONAR' },
      { 'idempotency-key': idempotencyKey },
    );
    expect([again.statusCode, again.json()]).toEqual([200, { principalId: principal.id }]);
    expect((await readAudit(`action = 'patient.merge' and entity_id = $1`, [duplicate.id])).length).toBe(1);
    // Un registro fusionado no se vuelve a fusionar.
    const twice = await merge(duplicate.id, principal.id);
    expect([twice.statusCode, code(twice)]).toEqual([409, 'patient_merged']);
  });

  it('se bloquea con visitas abiertas en la misma sede o con los dos en una membresía', async () => {
    clock.set(NOW);
    const a = await newPatient();
    const b = await newPatient();
    await arrive(a.id);
    await arrive(b.id);
    const preview = (await adminConRol.get(`/api/patients/${a.id}/merge-preview?with=${b.id}`)).json<MergePreview>();
    expect(preview.blockers).toEqual(['open_visits_same_location']);
    const blocked = await merge(a.id, b.id);
    expect([blocked.statusCode, blocked.json()]).toEqual([409, { code: 'open_visits_same_location', locations: ['NOR1'] }]);

    const c = await newPatient();
    const d = await newPatient();
    await enroll(c.id);
    await enroll(d.id);
    expect((await adminConRol.get(`/api/patients/${c.id}/merge-preview?with=${d.id}`)).json<MergePreview>().blockers).toEqual(['both_in_membership']);
    const both = await merge(c.id, d.id);
    expect([both.statusCode, code(both)]).toEqual([409, 'both_in_membership']);
    // Nada se movió ni quedó fusionado.
    expect((await profile(a.id)).mergedInto).toBeNull();
    expect((await profile(c.id)).mergedInto).toBeNull();
  });

  it('los dos activos, distintos, con su versión, el motivo y «FUSIONAR»', async () => {
    clock.set(NOW);
    const a = await newPatient();
    const b = await newPatient();
    const same = await merge(a.id, a.id);
    expect([same.statusCode, code(same)]).toEqual([409, 'same_patient']);
    const stale = await merge(a.id, b.id, { principalVersion: 99 });
    expect([stale.statusCode, code(stale)]).toEqual([409, 'version_conflict']);
    for (const extra of [{ confirm: 'MERGE' }, { reason: ' ' }]) expect((await merge(a.id, b.id, extra)).statusCode).toBe(400);
    const deactivated = await adminConRol.post(`/api/patients/${b.id}/deactivate`, { expectedVersion: (await profile(b.id)).version, reason: 'Prueba' });
    expect(deactivated.statusCode, deactivated.body).toBe(204);
    const inactive = await merge(a.id, b.id);
    expect([inactive.statusCode, code(inactive)]).toEqual([409, 'patient_not_active']);
  });

  it('fusionan el Propietario o el Administrador con un rol clínico; nadie más, ni desde otra organización', async () => {
    clock.set(NOW);
    const a = await newPatient();
    const b = await newPatient();
    for (const client of [recepcion, enfermeria, adminSinRol]) {
      expect((await client.get(`/api/patients/${a.id}/merge-preview?with=${b.id}`)).statusCode).toBe(403);
      expect((await client.post(`/api/patients/${a.id}/merge`, { principalId: b.id, principalVersion: 1, duplicateVersion: 1, reason: REASON, confirm: 'FUSIONAR' }, { 'idempotency-key': key() })).statusCode).toBe(403);
    }
    // Recepción de Sur no tiene el permiso; aun con él, no vería a los pacientes de Norte (RLS).
    expect((await recepcionSur.get(`/api/patients/${a.id}/merge-preview?with=${b.id}`)).statusCode).toBe(403);
    const preview = await ownerConRol.get(`/api/patients/${a.id}/merge-preview?with=${b.id}`);
    expect(preview.statusCode, preview.body).toBe(200);
    const done = await merge(a.id, b.id, {}, ownerConRol);
    expect(done.statusCode, done.body).toBe(200);
    // Sin Idempotency-Key: 400.
    expect((await ownerConRol.post(`/api/patients/${b.id}/merge`, { principalId: a.id, principalVersion: 1, duplicateVersion: 1, reason: REASON, confirm: 'FUSIONAR' })).statusCode).toBe(400);
  });
});
