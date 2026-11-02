import { createTenantDb, nextCode, patients } from '@clinic/db';
import type { ArrivalResult, EncounterDetail, NursingQueue, NursingSaved, NursingSection } from '@clinic/shared';
import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { FixedClock } from '../src/clock.ts';
import { createStaff, NORTE, readAudit, signedInWithContext, startApp, type Client, type TestApp } from './support.ts';

// T-022: enfermería (S-CLI-01, S-CLI-13 a 16), con el reloj fijado.
//  - Cola: Esperando enfermería y Con enfermería, y Procedimiento pendiente de
//    rutas directas; «Alerta» / «Crítico» solo en Esperando enfermería (ADR 0039).
//  - Signos vitales (Enfermería y Proveedor) y valoración (solo Enfermería):
//    versión propia, rangos, IMC del servidor; el primer guardado de
//    Enfermería inicia la enfermería.
//  - «Enviar al proveedor» exige peso o presión (ADR 0003); la excepción, con
//    motivo, del Propietario o el Administrador con rol clínico (ADR 0033).
//  - Recepción: vista limitada y sin aviso de alergias.
//  - Alergias del paciente en la visita siguiente, con sus tres estados (ADR 0040).
//  - La auditoría no contiene ningún valor clínico; los textos van cifrados.

/** 5 nov 2026, 10:00 a. m. en Chicago. */
const NOW = '2026-11-05T16:00:00Z';
const at = (minutes: number, seconds = 0) => new Date(new Date(NOW).getTime() + minutes * 60_000 + seconds * 1000).toISOString();

// Valores ficticios fáciles de buscar en la auditoría.
const WEIGHT = 187.35;
const ALLERGY = 'Alergia ficticia a la lavanda';
const SYMPTOMS = 'Síntoma ficticio de prueba zeta';
const NOTES = 'Nota ficticia de enfermería omega';

describe('T-022 enfermería', () => {
  const clock = new FixedClock(NOW);
  let app: TestApp;
  let recepcion: Client;
  let enfermeria: Client;
  let proveedor: Client;
  let adminSinRol: Client;
  let adminConRecepcion: Client;
  let counter = 0;
  const db = () => createTenantDb(app.pool);

  beforeAll(async () => {
    app = await startApp({}, { clock });
    recepcion = await signedInWithContext(app, await createStaff(app, 'nu-rec', [{ org: NORTE, location: 0, role: 'recepcion' }]), NORTE, 0);
    enfermeria = await signedInWithContext(app, await createStaff(app, 'nu-enf', [{ org: NORTE, location: 0, role: 'enfermeria' }]), NORTE, 0);
    proveedor = await signedInWithContext(app, await createStaff(app, 'nu-prov', [{ org: NORTE, location: 0, role: 'proveedor' }]), NORTE, 0);
    adminSinRol = await signedInWithContext(app, await createStaff(app, 'nu-admin', [{ org: NORTE, location: null, role: 'administrador' }]), NORTE, 0, { mfa: true });
    adminConRecepcion = await signedInWithContext(
      app,
      await createStaff(app, 'nu-admin-rec', [
        { org: NORTE, location: null, role: 'administrador' },
        { org: NORTE, location: 0, role: 'recepcion' },
      ]),
      NORTE,
      0,
      { mfa: true },
    );
  });
  afterAll(async () => {
    await app.close();
  });

  async function newPatient(): Promise<string> {
    return db().withTenant(NORTE.id, async (tx) => {
      const id = uuidv7();
      await tx.insert(patients).values({
        id,
        organizationId: NORTE.id,
        registeredLocationId: NORTE.locations[0].id,
        code: await nextCode(tx, NORTE.id, 'patient'),
        firstName: 'Prueba',
        lastName: `Enfermería ${String((counter += 1))}`,
        birthDate: '1990-11-05',
      });
      return id;
    });
  }

  /** Abre una visita sin cita y la envía a su circuito: Estándar → Esperando enfermería; directa → Procedimiento pendiente. */
  async function arrive(options: { route?: string; patientId?: string } = {}): Promise<{ id: string; patientId: string; version: number }> {
    const patientId = options.patientId ?? (await newPatient());
    const route = options.route ?? 'STANDARD';
    const response = await recepcion.post(
      '/api/encounters',
      { source: 'walk_in', patientId, appointmentTypeId: null, route, coverage: { type: 'self_pay' } },
      { 'idempotency-key': `nu-${String(Date.now())}-${String((counter += 1))}` },
    );
    expect(response.statusCode, response.body).toBe(201);
    const id = response.json<ArrivalResult>().encounter.id;
    const action = route === 'STANDARD' ? 'send_to_nurse' : 'send_to_procedure';
    const sent = await recepcion.post(`/api/encounters/${id}/transition`, { action, expectedVersion: 1 });
    expect(sent.statusCode, sent.body).toBe(200);
    return { id, patientId, version: 2 };
  }

  const section = async (client: Client, id: string) => {
    const response = await client.get(`/api/encounters/${id}/nursing`);
    expect(response.statusCode, response.body).toBe(200);
    return response.json<NursingSection>();
  };
  const detail = async (client: Client, id: string) => (await client.get(`/api/encounters/${id}`)).json<EncounterDetail>();
  const vitals = (client: Client, id: string, changes: Record<string, number | null>, expectedVersion: number) =>
    client.put(`/api/encounters/${id}/vitals`, { changes, expectedVersion });
  const code = (response: { json: () => unknown }) => (response.json() as { code: string }).code;

  it('cola de enfermería: por espera, con «Procedimiento pendiente» de rutas directas y «Alerta» / «Crítico» solo en Esperando enfermería', async () => {
    clock.set(NOW);
    const standard = await arrive();
    clock.set(at(2));
    const injection = await arrive({ route: 'INJECTION_ONLY' });
    const queueAt = async (client: Client, instant: string) => {
      clock.set(instant);
      const response = await client.get('/api/nursing/queue');
      expect(response.statusCode, response.body).toBe(200);
      return response.json<NursingQueue>();
    };
    const q = await queueAt(enfermeria, at(4, 59));
    const ids = q.rows.map((r) => r.id);
    expect(ids.indexOf(standard.id)).toBeLessThan(ids.indexOf(injection.id));
    expect(q.rows.find((r) => r.id === standard.id)).toMatchObject({ status: 'WAITING_FOR_NURSE', waitLevel: 'none', version: 2, patient: { firstName: 'Prueba' } });
    expect(q.rows.find((r) => r.id === injection.id)).toMatchObject({ status: 'PROCEDURE_PENDING', route: 'INJECTION_ONLY', waitLevel: 'none' });
    expect(q).toMatchObject({ canStart: true, serverNow: at(4, 59), waitThresholds: { alertMinutes: 5, criticalMinutes: 10 } });
    expect((await queueAt(enfermeria, at(5))).rows.find((r) => r.id === standard.id)?.waitLevel).toBe('alert');
    expect((await queueAt(enfermeria, at(9, 59))).rows.find((r) => r.id === standard.id)?.waitLevel).toBe('alert');
    expect((await queueAt(enfermeria, at(10))).rows.find((r) => r.id === standard.id)?.waitLevel).toBe('critical');
    // Procedimiento pendiente nunca lleva marca.
    expect((await queueAt(enfermeria, at(30))).rows.find((r) => r.id === injection.id)?.waitLevel).toBe('none');
    // El Proveedor la ve, sin «Iniciar»; Recepción no.
    expect((await queueAt(proveedor, at(30))).canStart).toBe(false);
    expect((await recepcion.get('/api/nursing/queue')).statusCode).toBe(403);
    expect(await readAudit(`action = 'encounter.nursing_queue' and organization_id = $1`, [NORTE.id])).not.toHaveLength(0);
    clock.set(NOW);
  });

  it('signos vitales: el primer guardado de Enfermería inicia la enfermería; versión propia, rangos e IMC del servidor', async () => {
    clock.set(NOW);
    const v = await arrive();
    clock.set(at(3));
    const first = await vitals(enfermeria, v.id, { weightLb: 152, heightIn: 66, systolic: 120, diastolic: 80 }, 0);
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json<NursingSaved>()).toEqual({ version: 1, encounterStatus: 'WITH_NURSE', encounterVersion: 3, startedNursing: true });
    const d = await detail(enfermeria, v.id);
    expect(d.timeline[0]).toMatchObject({ action: 'start_nursing', toStatus: 'WITH_NURSE', occurredAt: at(3) });
    const s = await section(enfermeria, v.id);
    expect(s.vitals).toMatchObject({ values: { weightLb: 152, heightIn: 66, systolic: 120, diastolic: 80, pulse: null }, bmi: 24.5, version: 1, recordedAt: at(3) });
    expect(s).toMatchObject({ view: 'full', hasRequiredVitals: true, lock: null, abilities: { editVitals: true, editAssessment: true, sendToProvider: true, sendException: false } });
    // Solo lo cambiado; vaciar borra; el Proveedor también corrige signos vitales.
    clock.set(at(4));
    const second = await vitals(proveedor, v.id, { pulse: 72, heightIn: null }, 1);
    expect(second.json<NursingSaved>()).toMatchObject({ version: 2, encounterStatus: 'WITH_NURSE', startedNursing: false });
    expect((await section(proveedor, v.id)).vitals).toMatchObject({ values: { weightLb: 152, heightIn: null, pulse: 72 }, bmi: null, version: 2, updatedAt: at(4) });
    // Con la versión vieja: 409.
    const stale = await vitals(enfermeria, v.id, { pulse: 80 }, 1);
    expect(stale.statusCode).toBe(409);
    expect(code(stale)).toBe('version_conflict');
    // Rangos y presión.
    expect(code(await vitals(enfermeria, v.id, { spo2: 101 }, 2))).toBe('invalid_vitals');
    expect(code(await vitals(enfermeria, v.id, { diastolic: 125 }, 2))).toBe('invalid_vitals');
    expect(code(await vitals(enfermeria, v.id, { weightLb: 1500, heightIn: 10 }, 2))).toBe('invalid_vitals');
    // Recepción no guarda signos vitales.
    expect((await vitals(recepcion, v.id, { pulse: 70 }, 2)).statusCode).toBe(403);
    clock.set(NOW);
  });

  it('«Enviar al proveedor»: sin peso ni presión se rechaza; con ellos, desde «Esperando enfermería» son dos pasos', async () => {
    clock.set(NOW);
    const v = await arrive();
    // Sin signos vitales (y solo con la sistólica) el servidor rechaza.
    const none = await enfermeria.post(`/api/encounters/${v.id}/send-to-provider`, { expectedVersion: 2 });
    expect(none.statusCode).toBe(409);
    expect(code(none)).toBe('vitals_required');
    // El Proveedor guarda la sistólica: no inicia la enfermería (no es su paso).
    const partial = await vitals(proveedor, v.id, { systolic: 118 }, 0);
    expect(partial.json<NursingSaved>()).toMatchObject({ encounterStatus: 'WAITING_FOR_NURSE', startedNursing: false });
    expect(code(await enfermeria.post(`/api/encounters/${v.id}/send-to-provider`, { expectedVersion: 2 }))).toBe('vitals_required');
    await vitals(proveedor, v.id, { diastolic: 76 }, 1);
    // Recepción y el Proveedor no envían.
    expect(code(await recepcion.post(`/api/encounters/${v.id}/send-to-provider`, { expectedVersion: 2 }))).toBe('transition_not_owned');
    expect(code(await proveedor.post(`/api/encounters/${v.id}/send-to-provider`, { expectedVersion: 2 }))).toBe('transition_not_owned');
    clock.set(at(7));
    const sent = await enfermeria.post(`/api/encounters/${v.id}/send-to-provider`, { expectedVersion: 2 });
    expect(sent.statusCode, sent.body).toBe(200);
    expect(sent.json<NursingSaved>()).toMatchObject({ encounterStatus: 'WAITING_FOR_PROVIDER', encounterVersion: 4, startedNursing: true });
    const d = await detail(enfermeria, v.id);
    expect(d.timeline.slice(0, 2).map((e) => [e.version, e.action, e.toStatus, e.reason])).toEqual([
      [4, 'send_to_provider', 'WAITING_FOR_PROVIDER', null],
      [3, 'start_nursing', 'WITH_NURSE', null],
    ]);
    expect((await section(recepcion, v.id)).summary.completedAt).toBe(at(7));
    // Ya no se puede enviar otra vez; tampoco por la barra (/transition).
    expect(code(await enfermeria.post(`/api/encounters/${v.id}/send-to-provider`, { expectedVersion: 4 }))).toBe('not_with_nurse');
    expect((await enfermeria.post(`/api/encounters/${v.id}/transition`, { action: 'send_to_provider', expectedVersion: 4 })).statusCode).toBe(400);
    clock.set(NOW);
  });

  it('excepción (ADR 0033): con motivo, del Administrador con rol clínico; sin rol clínico o sin el permiso, 403', async () => {
    clock.set(NOW);
    const v = await arrive();
    const body = { expectedVersion: 2, reason: 'Báscula y tensiómetro fuera de servicio' };
    expect((await adminSinRol.post(`/api/encounters/${v.id}/send-to-provider`, body)).statusCode).toBe(403);
    expect((await enfermeria.post(`/api/encounters/${v.id}/send-to-provider`, body)).statusCode).toBe(403);
    expect((await adminConRecepcion.post(`/api/encounters/${v.id}/send-to-provider`, { expectedVersion: 2, reason: '  ' })).statusCode).toBe(400);
    const s = await section(adminConRecepcion, v.id);
    expect(s).toMatchObject({ view: 'limited', hasRequiredVitals: false, abilities: { sendToProvider: false, sendException: true, editVitals: false } });
    const sent = await adminConRecepcion.post(`/api/encounters/${v.id}/send-to-provider`, body);
    expect(sent.statusCode, sent.body).toBe(200);
    expect(sent.json<NursingSaved>().encounterStatus).toBe('WAITING_FOR_PROVIDER');
    const d = await detail(adminConRecepcion, v.id);
    expect(d.timeline[0]).toMatchObject({ action: 'send_to_provider', reason: body.reason, forced: false });
    const audit = await readAudit(`action = 'encounter.nursing_exception' and entity_id = $1`, [v.id]);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.reason).toBe(body.reason);
  });

  it('Recepción ve la vista limitada (solo fechas) y no ve el aviso de alergias; el Proveedor lee la valoración sin editarla', async () => {
    clock.set(NOW);
    const v = await arrive();
    await vitals(enfermeria, v.id, { weightLb: WEIGHT }, 0);
    const saved = await enfermeria.put(`/api/encounters/${v.id}/assessment`, {
      allergyStatus: 'recorded',
      history: { allergies: ALLERGY },
      visit: { symptoms: SYMPTOMS },
      historyVersion: 0,
      assessmentVersion: 0,
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const limited = await section(recepcion, v.id);
    expect(limited).toMatchObject({ view: 'limited', vitals: null, history: null, assessment: null, summary: { vitalsAt: at(0), assessmentAt: at(0), completedAt: null } });
    expect(JSON.stringify(limited)).not.toMatch(/lavanda|zeta|187/);
    expect((await detail(recepcion, v.id)).allergies).toBeNull();
    const provider = await section(proveedor, v.id);
    expect(provider).toMatchObject({ view: 'full', abilities: { editVitals: true, editAssessment: false, sendToProvider: false, sendException: false } });
    expect(provider.history?.fields.allergies).toBe(ALLERGY);
    expect(provider.assessment?.fields.symptoms).toBe(SYMPTOMS);
    expect((await detail(proveedor, v.id)).allergies).toEqual({ status: 'recorded', text: ALLERGY });
    const denied = await proveedor.put(`/api/encounters/${v.id}/assessment`, { allergyStatus: 'none_known', history: {}, visit: {}, historyVersion: 1, assessmentVersion: 1 });
    expect(denied.statusCode).toBe(403);
  });

  it('alergias del paciente (ADR 0040): no registradas, registradas y sin alergias conocidas, y aparecen en la visita siguiente', async () => {
    clock.set(NOW);
    const patientId = await newPatient();
    const first = await arrive({ patientId });
    expect((await detail(enfermeria, first.id)).allergies).toEqual({ status: 'not_recorded', text: null });
    const save = (id: string, body: Record<string, unknown>) => enfermeria.put(`/api/encounters/${id}/assessment`, { history: {}, visit: {}, ...body });
    const recorded = await save(first.id, { allergyStatus: 'recorded', history: { allergies: `  ${ALLERGY}  ` }, visit: { nursingNotes: NOTES }, historyVersion: 0, assessmentVersion: 0 });
    expect(recorded.json<NursingSaved>()).toMatchObject({ version: 1, historyVersion: 1, encounterStatus: 'WITH_NURSE', startedNursing: true });
    expect((await detail(enfermeria, first.id)).allergies).toEqual({ status: 'recorded', text: ALLERGY });
    // La visita termina (se cierra) y el paciente vuelve: la historia está ahí.
    expect((await recepcion.post(`/api/encounters/${first.id}/close`, { outcome: 'LEFT_EARLY', reason: 'Prueba', expectedVersion: 3 })).statusCode).toBe(200);
    const second = await arrive({ patientId });
    expect((await detail(enfermeria, second.id)).allergies).toEqual({ status: 'recorded', text: ALLERGY });
    const s = await section(enfermeria, second.id);
    expect(s.history).toMatchObject({ allergyStatus: 'recorded', version: 1 });
    // La valoración de la visita es de esa visita: no pasa a la siguiente.
    expect(s.assessment).toEqual({ fields: { symptoms: null, nursingNotes: null }, version: 0, updatedAt: null });
    // «Sin alergias conocidas»: estado explícito, sin texto.
    const none = await save(second.id, { allergyStatus: 'none_known', history: { allergies: null }, historyVersion: 1, assessmentVersion: 0 });
    expect(none.json<NursingSaved>()).toMatchObject({ historyVersion: 2 });
    expect((await detail(enfermeria, second.id)).allergies).toEqual({ status: 'none_known', text: null });
    // Otra ventana con la versión vieja de la historia: 409.
    const stale = await save(second.id, { allergyStatus: 'not_recorded', historyVersion: 1, assessmentVersion: 1 });
    expect(stale.statusCode).toBe(409);
    expect(code(stale)).toBe('version_conflict');
    // Sin cambios en la historia no se crea otra versión.
    const same = await save(second.id, { allergyStatus: 'none_known', visit: { symptoms: SYMPTOMS }, historyVersion: 2, assessmentVersion: 1 });
    expect(same.json<NursingSaved>()).toMatchObject({ historyVersion: 2, version: 2 });
  });

  it('bloqueo en Caja y con la visita cerrada', async () => {
    clock.set(NOW);
    const v = await arrive();
    await vitals(enfermeria, v.id, { weightLb: 150 }, 0);
    const force = await adminConRecepcion.post(`/api/encounters/${v.id}/force`, { status: 'READY_FOR_CHECKOUT', reason: 'Prueba de bloqueo', expectedVersion: 3 });
    expect(force.statusCode, force.body).toBe(200);
    const locked = await vitals(enfermeria, v.id, { pulse: 70 }, 1);
    expect(locked.statusCode).toBe(409);
    expect(code(locked)).toBe('nursing_locked');
    expect((await section(enfermeria, v.id))).toMatchObject({ lock: 'checkout', abilities: { editVitals: false, editAssessment: false } });
    expect((await recepcion.post(`/api/encounters/${v.id}/close`, { outcome: 'CANCELLED', reason: 'Prueba', expectedVersion: 4 })).statusCode).toBe(200);
    expect(code(await vitals(enfermeria, v.id, { pulse: 70 }, 1))).toBe('encounter_closed');
    expect(code(await enfermeria.put(`/api/encounters/${v.id}/assessment`, { allergyStatus: 'none_known', history: {}, visit: {}, historyVersion: 0, assessmentVersion: 0 }))).toBe('encounter_closed');
  });

  it('la auditoría no contiene ningún valor clínico, y los textos van cifrados en la base', async () => {
    const operator = new pg.Client({ connectionString: inject('operatorUrl') });
    await operator.connect();
    try {
      const { rows } = await operator.query<Record<string, unknown>>(
        `select * from app.audit_log where organization_id = $1 and action in ('encounter.vitals_saved', 'encounter.assessment_saved', 'patient.history_saved', 'encounter.nursing_view', 'encounter.transitioned')`,
        [NORTE.id],
      );
      expect(rows.length).toBeGreaterThan(5);
      const text = JSON.stringify(rows);
      for (const value of ['lavanda', 'zeta', 'omega', String(WEIGHT), String(Math.round(WEIGHT * 100)), 'Penicilina']) expect(text).not.toContain(value);
      const vitalsAudit = rows.find((r) => r.action === 'encounter.vitals_saved' && String((r.metadata as { fields?: string }).fields).includes('weightLb'));
      expect(vitalsAudit?.metadata).toMatchObject({ fields: expect.stringContaining('weightLb') as unknown });
      const history = await operator.query<Record<string, unknown>>('select * from app.patient_histories where organization_id = $1', [NORTE.id]);
      expect(history.rows.length).toBeGreaterThan(0);
      expect(JSON.stringify(history.rows)).not.toContain('lavanda');
      const assessments = await operator.query<Record<string, unknown>>('select * from app.encounter_assessments where organization_id = $1', [NORTE.id]);
      expect(JSON.stringify(assessments.rows)).not.toMatch(/zeta|omega/);
    } finally {
      await operator.end();
    }
  });
});
