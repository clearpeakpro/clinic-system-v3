import { createTenantDb, nextCode, patients } from '@clinic/db';
import type { ArrivalResult, EncounterDetail, EncounterSaved, ProviderQueue } from '@clinic/shared';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixedClock } from '../src/clock.ts';
import { createStaff, NORTE, readAudit, signedInWithContext, startApp, type Client, type TestApp } from './support.ts';

// T-023: proveedor (S-CLI-02, S-CLI-07, S-CLI-14), con el reloj fijado.
//  - Cola: Esperando proveedor, Con proveedor y Procedimiento pendiente, por
//    grupo y mayor espera; «Enfermería lista»; «Alerta» / «Crítico» solo en
//    Esperando proveedor (ADR 0039); aviso de alergias (ADR 0040).
//  - «Iniciar consulta» se autoasigna sin proveedor, en una transacción; la de
//    otro proveedor se rechaza; dos a la vez: el segundo recibe 409.
//  - «Enviar a procedimiento» y «Listo para caja» desde «Con proveedor».
//  - El Proveedor corrige signos vitales; la valoración no la edita.

/** 5 nov 2026, 10:00 a. m. en Chicago. */
const NOW = '2026-11-05T16:00:00Z';
const at = (minutes: number, seconds = 0) => new Date(new Date(NOW).getTime() + minutes * 60_000 + seconds * 1000).toISOString();

describe('T-023 proveedor', () => {
  const clock = new FixedClock(NOW);
  let app: TestApp;
  let recepcion: Client;
  let enfermeria: Client;
  let proveedor: Client;
  let proveedora: Client;
  let adminConRecepcion: Client;
  let counter = 0;
  const db = () => createTenantDb(app.pool);

  beforeAll(async () => {
    app = await startApp({}, { clock });
    recepcion = await signedInWithContext(app, await createStaff(app, 'pv-rec', [{ org: NORTE, location: 0, role: 'recepcion' }]), NORTE, 0);
    enfermeria = await signedInWithContext(app, await createStaff(app, 'pv-enf', [{ org: NORTE, location: 0, role: 'enfermeria' }]), NORTE, 0);
    proveedor = await signedInWithContext(app, await createStaff(app, 'pv-prov', [{ org: NORTE, location: 0, role: 'proveedor' }]), NORTE, 0);
    proveedora = await signedInWithContext(app, await createStaff(app, 'pv-prov2', [{ org: NORTE, location: 0, role: 'proveedor' }]), NORTE, 0);
    adminConRecepcion = await signedInWithContext(
      app,
      await createStaff(app, 'pv-admin-rec', [
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
        lastName: `Proveedor ${String((counter += 1))}`,
        birthDate: '1990-11-05',
      });
      return id;
    });
  }

  /** Visita sin cita enviada a su circuito: Estándar → Esperando enfermería; directa → Procedimiento pendiente. */
  async function arrive(route = 'STANDARD'): Promise<string> {
    const response = await recepcion.post(
      '/api/encounters',
      { source: 'walk_in', patientId: await newPatient(), appointmentTypeId: null, route, coverage: { type: 'self_pay' } },
      { 'idempotency-key': `pv-${String(Date.now())}-${String((counter += 1))}` },
    );
    expect(response.statusCode, response.body).toBe(201);
    const id = response.json<ArrivalResult>().encounter.id;
    const sent = await recepcion.post(`/api/encounters/${id}/transition`, { action: route === 'STANDARD' ? 'send_to_nurse' : 'send_to_procedure', expectedVersion: 1 });
    expect(sent.statusCode, sent.body).toBe(200);
    return id;
  }

  const detail = async (client: Client, id: string) => {
    const response = await client.get(`/api/encounters/${id}`);
    expect(response.statusCode, response.body).toBe(200);
    return response.json<EncounterDetail>();
  };
  const code = (response: { json: () => unknown }) => (response.json() as { code: string }).code;

  /** Enfermería guarda el peso (inicia la enfermería) y la envía al proveedor a la hora `sentAt`. */
  async function toProvider(sentAt = NOW): Promise<{ id: string; version: number }> {
    const id = await arrive();
    const saved = await enfermeria.put(`/api/encounters/${id}/vitals`, { changes: { weightLb: 150 }, expectedVersion: 0 });
    expect(saved.statusCode, saved.body).toBe(200);
    clock.set(sentAt);
    const sent = await enfermeria.post(`/api/encounters/${id}/send-to-provider`, { expectedVersion: (await detail(enfermeria, id)).version });
    expect(sent.statusCode, sent.body).toBe(200);
    const d = await detail(proveedor, id);
    expect(d.status).toBe('WAITING_FOR_PROVIDER');
    return { id, version: d.version };
  }
  const start = (client: Client, id: string, expectedVersion: number) => client.post(`/api/encounters/${id}/start-consult`, { expectedVersion });

  it('cola de proveedor: por grupo y mayor espera, «Enfermería lista», alergias y «Alerta» / «Crítico» solo en Esperando proveedor', async () => {
    clock.set(NOW);
    const later = await toProvider(at(1));
    const first = await toProvider(at(0));
    const consult = await toProvider(at(0));
    expect((await start(proveedor, consult.id, consult.version)).statusCode).toBe(200);
    const injection = await arrive('INJECTION_ONLY');

    const queueAt = async (client: Client, instant: string) => {
      clock.set(instant);
      const response = await client.get('/api/provider/queue');
      expect(response.statusCode, response.body).toBe(200);
      return response.json<ProviderQueue>();
    };
    const q = await queueAt(proveedor, at(5, 59));
    const ids = q.rows.map((r) => r.id);
    // Esperando proveedor (mayor espera primero), luego Con proveedor, luego Procedimiento pendiente.
    expect(ids.indexOf(first.id)).toBeLessThan(ids.indexOf(later.id));
    expect(ids.indexOf(later.id)).toBeLessThan(ids.indexOf(consult.id));
    expect(ids.indexOf(consult.id)).toBeLessThan(ids.indexOf(injection));
    expect(q).toMatchObject({ canStart: true, serverNow: at(5, 59), waitThresholds: { alertMinutes: 5, criticalMinutes: 10 } });
    expect(q.rows.find((r) => r.id === later.id)).toMatchObject({
      status: 'WAITING_FOR_PROVIDER',
      nurseReadyAt: at(1),
      waitingSince: at(1),
      provider: null,
      allergies: { status: 'not_recorded', text: null },
      waitLevel: 'none',
    });
    expect(q.rows.find((r) => r.id === consult.id)).toMatchObject({ status: 'WITH_PROVIDER', provider: { membershipId: q.myMembershipId }, waitLevel: 'none' });
    // Ruta directa: sin enfermería, la espera cuenta desde la llegada.
    const direct = q.rows.find((r) => r.id === injection);
    expect(direct).toMatchObject({ status: 'PROCEDURE_PENDING', nurseReadyAt: null, waitLevel: 'none' });
    expect(direct?.waitingSince).toBe(direct?.arrivedAt);
    // Umbrales desde que entró en «Esperando proveedor» (minuto 1): 4:59 → nada; 5:00 → Alerta; 9:59 → Alerta; 10:00 → Crítico.
    expect((await queueAt(proveedor, at(6))).rows.find((r) => r.id === later.id)?.waitLevel).toBe('alert');
    expect((await queueAt(proveedor, at(10, 59))).rows.find((r) => r.id === later.id)?.waitLevel).toBe('alert');
    expect((await queueAt(proveedor, at(11))).rows.find((r) => r.id === later.id)?.waitLevel).toBe('critical');
    // Con proveedor nunca lleva marca.
    expect((await queueAt(proveedor, at(60))).rows.find((r) => r.id === consult.id)?.waitLevel).toBe('none');
    // Solo el rol Proveedor tiene la cola.
    expect((await recepcion.get('/api/provider/queue')).statusCode).toBe(403);
    expect((await enfermeria.get('/api/provider/queue')).statusCode).toBe(403);
    expect((await adminConRecepcion.get('/api/provider/queue')).statusCode).toBe(403);
    expect(await readAudit(`action = 'encounter.provider_queue' and organization_id = $1`, [NORTE.id])).not.toHaveLength(0);
    clock.set(NOW);
  });

  it('«Iniciar consulta» en una visita sin asignar: queda asignada a quien la inicia, en un solo cambio de versión', async () => {
    clock.set(NOW);
    const v = await toProvider();
    clock.set(at(3));
    const response = await start(proveedor, v.id, v.version);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json<EncounterSaved>()).toMatchObject({ status: 'WITH_PROVIDER', version: v.version + 1 });
    const d = await detail(proveedor, v.id);
    expect(d.provider?.membershipId).toBe(d.myMembershipId);
    expect(d.timeline.at(0)).toMatchObject({ action: 'start_consult', toStatus: 'WITH_PROVIDER', version: v.version + 1 });
    expect(d.abilities.actions).toEqual(['send_to_procedure', 'ready_for_checkout']);
    const assigned = await readAudit(`action = 'encounter.provider_assigned' and entity_id = $1`, [v.id]);
    expect(assigned).toHaveLength(1);
    expect(assigned[0]?.metadata).toMatchObject({ self: true, onConsultStart: true });
    clock.set(NOW);
  });

  it('si la visita ya es suya, solo se inicia; si es de otro proveedor, 409 y no cambia nada', async () => {
    clock.set(NOW);
    const mine = await toProvider();
    const me = (await detail(proveedor, mine.id)).myMembershipId;
    const assign = await proveedor.post(`/api/encounters/${mine.id}/provider`, { providerMembershipId: me, expectedVersion: mine.version });
    expect(assign.statusCode, assign.body).toBe(200);
    const started = await start(proveedor, mine.id, mine.version + 1);
    expect(started.statusCode, started.body).toBe(200);
    expect(await readAudit(`action = 'encounter.provider_assigned' and entity_id = $1`, [mine.id])).toHaveLength(1);

    const other = await toProvider();
    expect((await proveedora.post(`/api/encounters/${other.id}/provider`, { providerMembershipId: (await detail(proveedora, other.id)).myMembershipId, expectedVersion: other.version })).statusCode).toBe(200);
    const d = await detail(proveedor, other.id);
    // La barra no ofrece «Iniciar consulta» en la visita de otro proveedor; «Asignarme» sí.
    expect(d.abilities).toMatchObject({ actions: [], assignSelf: true });
    const rejected = await start(proveedor, other.id, d.version);
    expect(rejected.statusCode).toBe(409);
    expect(code(rejected)).toBe('assigned_to_other');
    expect(await detail(proveedor, other.id)).toMatchObject({ status: 'WAITING_FOR_PROVIDER', version: d.version });
  });

  it('dos proveedores la inician a la vez: uno la toma y el otro recibe 409', async () => {
    clock.set(NOW);
    const v = await toProvider();
    const [a, b] = await Promise.all([start(proveedor, v.id, v.version), start(proveedora, v.id, v.version)]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    const loser = a.statusCode === 409 ? a : b;
    expect(code(loser)).toBe('version_conflict');
    const winner = a.statusCode === 200 ? proveedor : proveedora;
    const d = await detail(winner, v.id);
    expect(d).toMatchObject({ status: 'WITH_PROVIDER', version: v.version + 1 });
    expect(d.provider?.membershipId).toBe(d.myMembershipId);
  });

  it('solo el rol Proveedor inicia la consulta, y nunca por /transition', async () => {
    clock.set(NOW);
    const v = await toProvider();
    const byTransition = await proveedor.post(`/api/encounters/${v.id}/transition`, { action: 'start_consult', expectedVersion: v.version });
    expect(byTransition.statusCode).toBe(400);
    for (const client of [enfermeria, recepcion, adminConRecepcion]) {
      const response = await start(client, v.id, v.version);
      expect(response.statusCode).toBe(403);
      expect(code(response)).toBe('transition_not_owned');
    }
    // Fuera de «Esperando proveedor»: transición inválida.
    const early = await arrive();
    const invalid = await start(proveedor, early, 2);
    expect(invalid.statusCode).toBe(409);
    expect(code(invalid)).toBe('invalid_transition');
    expect((await detail(proveedor, v.id)).status).toBe('WAITING_FOR_PROVIDER');
  });

  it('desde «Con proveedor»: «Listo para caja» la deja en Listo para caja y «Enviar a procedimiento» en Procedimiento pendiente', async () => {
    clock.set(NOW);
    const ready = await toProvider();
    expect((await start(proveedor, ready.id, ready.version)).statusCode).toBe(200);
    const done = await proveedor.post(`/api/encounters/${ready.id}/transition`, { action: 'ready_for_checkout', expectedVersion: ready.version + 1 });
    expect(done.statusCode, done.body).toBe(200);
    expect(done.json<EncounterSaved>().status).toBe('READY_FOR_CHECKOUT');

    const procedure = await toProvider();
    expect((await start(proveedor, procedure.id, procedure.version)).statusCode).toBe(200);
    const sent = await proveedor.post(`/api/encounters/${procedure.id}/transition`, { action: 'send_to_procedure', expectedVersion: procedure.version + 1 });
    expect(sent.statusCode, sent.body).toBe(200);
    expect(sent.json<EncounterSaved>().status).toBe('PROCEDURE_PENDING');
    // Desde Procedimiento pendiente, también «Listo para caja».
    const after = await proveedor.post(`/api/encounters/${procedure.id}/transition`, { action: 'ready_for_checkout', expectedVersion: procedure.version + 2 });
    expect(after.json<EncounterSaved>().status).toBe('READY_FOR_CHECKOUT');
  });

  it('el Proveedor corrige signos vitales en consulta (sin mover la visita); la valoración no la edita; en Caja, bloqueado', async () => {
    clock.set(NOW);
    const v = await toProvider();
    expect((await start(proveedor, v.id, v.version)).statusCode).toBe(200);
    const section = (await proveedor.get(`/api/encounters/${v.id}/nursing`)).json<{ abilities: { editVitals: boolean; editAssessment: boolean }; vitals: { version: number } }>();
    expect(section.abilities).toMatchObject({ editVitals: true, editAssessment: false });
    const corrected = await proveedor.put(`/api/encounters/${v.id}/vitals`, { changes: { weightLb: 151.5, systolic: 118, diastolic: 76 }, expectedVersion: section.vitals.version });
    expect(corrected.statusCode, corrected.body).toBe(200);
    expect(await detail(proveedor, v.id)).toMatchObject({ status: 'WITH_PROVIDER', version: v.version + 1 });
    const assessment = await proveedor.put(`/api/encounters/${v.id}/assessment`, { allergyStatus: 'not_recorded', history: {}, visit: { symptoms: 'Texto ficticio' }, historyVersion: 0, assessmentVersion: 0 });
    expect(assessment.statusCode).toBe(403);
    expect((await proveedor.post(`/api/encounters/${v.id}/transition`, { action: 'ready_for_checkout', expectedVersion: v.version + 1 })).statusCode).toBe(200);
    const locked = await proveedor.put(`/api/encounters/${v.id}/vitals`, { changes: { pulse: 70 }, expectedVersion: section.vitals.version + 1 });
    expect(locked.statusCode).toBe(409);
    expect(code(locked)).toBe('nursing_locked');
  });
});
