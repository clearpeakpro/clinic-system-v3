import type { AddressInfo } from 'node:net';
import {
  appointments,
  appointmentTypes,
  coverages,
  createLocalFieldCipher,
  createTenantDb,
  ENCOUNTER_SOURCE_VALUES,
  encounterEvents,
  encounters,
  nextCode,
  patients,
  COVERAGE_TYPE_VALUES,
  INSURANCE_TERM_VALUES,
  VISIT_STATUS_VALUES,
} from '@clinic/db';
import { COVERAGE_TYPES, INSURANCE_TERMS, VISIT_STATUSES, type ArrivalContext, type ArrivalResult, type EncounterDetail } from '@clinic/shared';
import { eq } from 'drizzle-orm';
import { io, type Socket } from 'socket.io-client';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixedClock } from '../src/clock.ts';
import { SOCKET_PATH } from '../src/realtime.ts';
import { createStaff, NORTE, readAudit, signedInWithContext, startApp, SUR, type Client, type TestApp } from './support.ts';

// T-017: llegada con cita y sin cita (S-REC-18 a 27). Una transacción con
// Idempotency-Key, una visita abierta por paciente y sede, la cobertura
// cifrada, la cita en «Llegó», auditoría sin PHI, eventos en vivo con solo ids
// y estado, y «hoy» según el reloj fijado y la zona de la sede (America/Chicago).
// Cada prueba crea sus pacientes y citas ficticios para no chocar con otras.

/** 4 nov 2026, 11:00 a. m. en Chicago (CST, UTC−6). */
const NOW = '2026-11-04T17:00:00Z';

describe('T-017 llegada', () => {
  const clock = new FixedClock(NOW);
  let app: TestApp;
  let url: string;
  let recepcion: Client;
  let recepcionNor2: Client;
  let enfermeria: Client;
  let adminSinRol: Client;
  let adminConRecepcion: Client;
  let surRecepcion: Client;
  let consulta: string;
  let inyeccion: string;
  const sockets: Socket[] = [];
  const db = () => createTenantDb(app.pool);

  beforeAll(async () => {
    app = await startApp({}, { clock });
    await app.app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${String((app.app.getHttpServer().address() as AddressInfo).port)}`;
    recepcion = await signedInWithContext(app, await createStaff(app, 'll-rec', [{ org: NORTE, location: 0, role: 'recepcion' }]), NORTE, 0);
    recepcionNor2 = await signedInWithContext(app, await createStaff(app, 'll-rec2', [{ org: NORTE, location: 1, role: 'recepcion' }]), NORTE, 1);
    enfermeria = await signedInWithContext(app, await createStaff(app, 'll-enf', [{ org: NORTE, location: 0, role: 'enfermeria' }]), NORTE, 0);
    adminSinRol = await signedInWithContext(app, await createStaff(app, 'll-admin', [{ org: NORTE, location: null, role: 'administrador' }]), NORTE, 0, { mfa: true });
    adminConRecepcion = await signedInWithContext(
      app,
      await createStaff(app, 'll-admin-rec', [
        { org: NORTE, location: null, role: 'administrador' },
        { org: NORTE, location: 0, role: 'recepcion' },
      ]),
      NORTE,
      0,
      { mfa: true },
    );
    surRecepcion = await signedInWithContext(app, await createStaff(app, 'll-sur', [{ org: SUR, location: 0, role: 'recepcion' }]), SUR, 0);
    const types = await db().withTenant(NORTE.id, (tx) => tx.select({ id: appointmentTypes.id, code: appointmentTypes.code, route: appointmentTypes.suggestedRoute }).from(appointmentTypes));
    consulta = types.find((t) => t.code === 'CONSULTA')?.id ?? '';
    inyeccion = types.find((t) => t.route === 'INJECTION_ONLY')?.id ?? consulta;
    expect(consulta).not.toBe('');
  });
  afterAll(async () => {
    for (const socket of sockets) socket.close();
    await app.close();
  });

  let keyCounter = 0;
  const key = () => `ll-${String(Date.now())}-${String((keyCounter += 1))}`;

  /** Paciente ficticio nuevo de Norte. */
  async function newPatient(extra: Partial<typeof patients.$inferInsert> = {}): Promise<string> {
    return db().withTenant(NORTE.id, async (tx) => {
      const id = uuidv7();
      await tx.insert(patients).values({
        id,
        organizationId: NORTE.id,
        registeredLocationId: NORTE.locations[0].id,
        code: await nextCode(tx, NORTE.id, 'patient'),
        firstName: 'Prueba',
        lastName: `Llegada ${String(keyCounter)}`,
        birthDate: '1990-01-01',
        ...extra,
      });
      return id;
    });
  }

  /** Cita de NOR1 (por defecto, hoy a las 3 p. m. en la sede). */
  async function newAppointment(patientId: string, extra: Partial<typeof appointments.$inferInsert> = {}): Promise<{ id: string; version: number }> {
    return db().withTenant(NORTE.id, async (tx) => {
      const id = uuidv7();
      await tx.insert(appointments).values({
        id,
        organizationId: NORTE.id,
        locationId: NORTE.locations[0].id,
        patientId,
        appointmentTypeId: consulta,
        code: `NOR1-A-8${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`,
        startsAt: new Date('2026-11-04T21:00:00Z'),
        durationMinutes: 20,
        ...extra,
      });
      return { id, version: 1 };
    });
  }

  const arrive = (client: Client, body: Record<string, unknown>, k = key()) => client.post('/api/encounters', body, { 'idempotency-key': k });
  const withAppointment = (a: { id: string; version: number }, over: Record<string, unknown> = {}) => ({
    source: 'appointment',
    appointmentId: a.id,
    expectedVersion: a.version,
    route: 'STANDARD',
    coverage: { type: 'self_pay' },
    ...over,
  });
  const walkIn = (patientId: string, over: Record<string, unknown> = {}) => ({
    source: 'walk_in',
    patientId,
    appointmentTypeId: null,
    route: 'STANDARD',
    coverage: { type: 'self_pay' },
    ...over,
  });

  it('los valores de la base son los de @clinic/shared', () => {
    expect([...VISIT_STATUSES]).toEqual([...VISIT_STATUS_VALUES]);
    expect([...COVERAGE_TYPES]).toEqual([...COVERAGE_TYPE_VALUES]);
    expect([...INSURANCE_TERMS]).toEqual([...INSURANCE_TERM_VALUES]);
    expect([...ENCOUNTER_SOURCE_VALUES]).toEqual(['appointment', 'walk_in', 'kiosk']);
  });

  it('con cita: una transacción abre la visita en «Registrado», guarda la ruta elegida y pasa la cita a «Llegó»', async () => {
    const patientId = await newPatient();
    const appointment = await newAppointment(patientId);
    const context = await recepcion.get(`/api/arrivals/appointments/${appointment.id}`);
    expect(context.statusCode, context.body).toBe(200);
    const ctx = context.json<ArrivalContext>();
    expect(ctx.appointment).toMatchObject({ id: appointment.id, status: 'SCHEDULED', isToday: true, version: 1 });
    expect(ctx.site).toMatchObject({ code: 'NOR1', timezone: 'America/Chicago', active: true });
    expect(ctx.patient).toMatchObject({ id: patientId, status: 'active', mergedInto: null });

    // Recepción cambia la ruta sugerida (ADR 0005): se guarda.
    const response = await arrive(recepcion, withAppointment(appointment, { route: 'LAB_ONLY' }));
    expect(response.statusCode, response.body).toBe(201);
    const result = response.json<ArrivalResult>();
    expect(result.encounter).toMatchObject({ status: 'CHECKED_IN', route: 'LAB_ONLY', version: 1 });
    expect(result.encounter.code).toMatch(/^NOR1-V-\d{6}$/);
    expect(result.coverageType).toBe('self_pay');
    expect(result.appointment).toEqual({ id: appointment.id, status: 'ARRIVED', version: 2 });

    const [row] = await db().withTenant(NORTE.id, (tx) => tx.select().from(encounters).where(eq(encounters.id, result.encounter.id)));
    expect(row).toMatchObject({ source: 'appointment', appointmentId: appointment.id, appointmentTypeId: consulta, patientId, arrivedAt: new Date(NOW) });
    const events = await db().withTenant(NORTE.id, (tx) => tx.select().from(encounterEvents).where(eq(encounterEvents.encounterId, result.encounter.id)));
    expect(events).toMatchObject([{ action: 'check_in', fromStatus: null, toStatus: 'CHECKED_IN', actorType: 'user', forced: false, occurredAt: new Date(NOW) }]);
    const audit = await readAudit(`action in ('encounter.checked_in', 'appointment.arrived') and entity_id in ($1, $2)`, [result.encounter.id, appointment.id]);
    expect(audit.map((a) => a.action).sort()).toEqual(['appointment.arrived', 'encounter.checked_in']);
    expect(audit.find((a) => a.action === 'encounter.checked_in')?.metadata).toMatchObject({ code: result.encounter.code, source: 'appointment', route: 'LAB_ONLY', coverage: 'self_pay' });
    expect(JSON.stringify(audit)).not.toMatch(/Prueba|Llegada/);
    expect((await readAudit(`action = 'arrival.view' and entity_id = $1`, [appointment.id])).length).toBe(1);
  });

  it('sin cita: paciente nuevo, tipo opcional y seguro con su dato cifrado en la base', async () => {
    const patientId = await newPatient();
    const context = await recepcion.get(`/api/arrivals/patients/${patientId}`);
    expect(context.statusCode, context.body).toBe(200);
    expect(context.json<ArrivalContext>().appointmentTypes.length).toBeGreaterThan(0);
    const response = await arrive(
      recepcion,
      walkIn(patientId, {
        appointmentTypeId: inyeccion,
        route: 'INJECTION_ONLY',
        coverage: { type: 'insurance', insurerName: 'Aseguradora Ficticia Uno', memberId: 'MBR-778899', term: 'copay', value: '25.50' },
      }),
    );
    expect(response.statusCode, response.body).toBe(201);
    const result = response.json<ArrivalResult>();
    expect(result).toMatchObject({ coverageType: 'insurance', appointment: null, encounter: { route: 'INJECTION_ONLY', status: 'CHECKED_IN' } });
    expect(response.body).not.toMatch(/Aseguradora|MBR-778899/);

    const [coverage] = await db().withTenant(NORTE.id, (tx) => tx.select().from(coverages).where(eq(coverages.encounterId, result.encounter.id)));
    if (!coverage) throw new Error('sin cobertura');
    expect(coverage).toMatchObject({ type: 'insurance', term: 'copay', amountCents: 2550, coinsuranceBp: null });
    expect(coverage.insurerNameEnc).toMatch(/^v1:local:/);
    expect(coverage.memberIdEnc).toMatch(/^v1:local:/);
    expect(JSON.stringify(coverage)).not.toMatch(/Aseguradora|MBR-778899/);
    const cipher = createLocalFieldCipher(app.config.fieldEncryptionKey);
    const context2 = { organizationId: NORTE.id, table: 'coverages', recordId: coverage.id };
    expect(await cipher.decrypt(coverage.insurerNameEnc ?? '', { ...context2, column: 'insurer_name' })).toBe('Aseguradora Ficticia Uno');
    expect(await cipher.decrypt(coverage.memberIdEnc ?? '', { ...context2, column: 'member_id' })).toBe('MBR-778899');
  });

  it('coaseguro en centésimas de punto; valores inválidos o membresía (3A) → 400 sin crear nada', async () => {
    const patientId = await newPatient();
    for (const coverage of [
      { type: 'membership' },
      { type: 'insurance', insurerName: '', term: 'copay', value: '10' },
      { type: 'insurance', insurerName: 'Seguro', term: 'coinsurance', value: '101' },
      { type: 'insurance', insurerName: 'Seguro', term: 'deductible', value: '10,5' },
    ]) {
      const response = await arrive(recepcion, walkIn(patientId, { coverage }));
      expect(response.statusCode, JSON.stringify(coverage)).toBe(400);
    }
    const ok = await arrive(recepcion, walkIn(patientId, { coverage: { type: 'insurance', insurerName: 'Seguro', term: 'coinsurance', value: '20.5' } }));
    expect(ok.statusCode, ok.body).toBe(201);
    const [coverage] = await db().withTenant(NORTE.id, (tx) => tx.select().from(coverages).where(eq(coverages.encounterId, ok.json<ArrivalResult>().encounter.id)));
    expect(coverage).toMatchObject({ term: 'coinsurance', coinsuranceBp: 2050, amountCents: null, memberIdEnc: null });
  });

  it('Idempotency-Key: misma clave → la misma visita; otro contenido → 409; sin clave → 400', async () => {
    const patientId = await newPatient();
    const k = key();
    const first = await arrive(recepcion, walkIn(patientId), k);
    const again = await arrive(recepcion, walkIn(patientId), k);
    expect(first.statusCode).toBe(201);
    expect(again.statusCode).toBe(201);
    expect(again.json<ArrivalResult>().encounter.id).toBe(first.json<ArrivalResult>().encounter.id);
    const other = await arrive(recepcion, walkIn(patientId, { route: 'LAB_ONLY' }), k);
    expect(other.statusCode).toBe(409);
    expect(other.json<{ code: string }>().code).toBe('idempotency_key_reused');
    const missing = await recepcion.post('/api/encounters', walkIn(patientId));
    expect(missing.statusCode).toBe(400);
    expect(missing.json<{ code: string }>().code).toBe('idempotency_key_required');
    const open = await db().withTenant(NORTE.id, (tx) => tx.select({ id: encounters.id }).from(encounters).where(eq(encounters.patientId, patientId)));
    expect(open).toHaveLength(1);
  });

  it('una visita abierta por paciente y sede: el segundo registro se rechaza con el id de la existente, también a la vez', async () => {
    const patientId = await newPatient();
    const first = await arrive(recepcion, walkIn(patientId));
    expect(first.statusCode).toBe(201);
    const second = await arrive(recepcion, walkIn(patientId));
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ code: 'encounter_already_open', encounterId: first.json<ArrivalResult>().encounter.id });
    // Con una cita del mismo paciente, tampoco; y la cita no cambia.
    const appointment = await newAppointment(patientId);
    const withAppt = await arrive(recepcion, withAppointment(appointment));
    expect(withAppt.json<{ code: string }>().code).toBe('encounter_already_open');
    const [appt] = await db().withTenant(NORTE.id, (tx) => tx.select({ status: appointments.status, version: appointments.version }).from(appointments).where(eq(appointments.id, appointment.id)));
    expect(appt).toEqual({ status: 'SCHEDULED', version: 1 });
    // En la otra sede de la organización sí puede abrir su visita.
    const nor2 = await arrive(recepcionNor2, walkIn(patientId));
    expect(nor2.statusCode, nor2.body).toBe(201);
    expect(nor2.json<ArrivalResult>().encounter.code).toMatch(/^NOR2-V-/);

    // Dos puestos a la vez, con claves distintas: solo uno abre.
    const racer = await newPatient();
    const results = await Promise.all([arrive(recepcion, walkIn(racer)), arrive(adminConRecepcion, walkIn(racer)), arrive(recepcion, walkIn(racer))]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409, 409]);
    for (const r of results.filter((x) => x.statusCode === 409)) expect(r.json<{ code: string }>().code).toBe('encounter_already_open');
  });

  it('la cita: solo Programada o Confirmada, de hoy en la sede, de la sede activa y con su versión', async () => {
    const patientId = await newPatient();
    const appointment = await newAppointment(patientId);
    const stale = await arrive(recepcion, withAppointment({ ...appointment, version: 7 }));
    expect(stale.json<{ code: string }>().code).toBe('version_conflict');
    const otherSite = await arrive(recepcionNor2, withAppointment(appointment));
    expect(otherSite.statusCode).toBe(404);
    expect((await recepcionNor2.get(`/api/arrivals/appointments/${appointment.id}`)).statusCode).toBe(404);
    expect((await surRecepcion.get(`/api/arrivals/appointments/${appointment.id}`)).statusCode).toBe(404);

    expect((await arrive(recepcion, withAppointment(appointment))).statusCode).toBe(201);
    // Ya registrada (otro puesto se adelantó, con la versión que tenía): el motivo útil.
    const twice = await arrive(recepcion, withAppointment(appointment));
    expect(twice.json<{ code: string }>().code).toBe('appointment_already_checked_in');

    for (const status of ['CANCELLED', 'NO_SHOW'] as const) {
      const a = await newAppointment(await newPatient(), { status, ...(status === 'CANCELLED' ? { cancelReasonEnc: 'v1:local:x' } : {}) });
      expect((await arrive(recepcion, withAppointment(a))).json<{ code: string }>().code).toBe('invalid_appointment_transition');
    }
    const tomorrow = await newAppointment(await newPatient(), { startsAt: new Date('2026-11-05T15:00:00Z') });
    const notToday = await arrive(recepcion, withAppointment(tomorrow));
    expect(notToday.json<{ code: string }>().code).toBe('appointment_not_today');
    expect((await recepcion.get(`/api/arrivals/appointments/${tomorrow.id}`)).json<ArrivalContext>().appointment?.isToday).toBe(false);
  });

  it('«hoy» es el día de la sede: a las 11:59 p. m. sí, a las 12:01 a. m. ya no, y en el día del cambio de horario', async () => {
    try {
      // 23:30 del 4 nov en Chicago = 05:30Z del 5 nov.
      const late = await newAppointment(await newPatient(), { startsAt: new Date('2026-11-05T05:30:00Z') });
      clock.set('2026-11-05T05:59:00Z'); // 11:59 p. m. del 4 nov
      expect((await recepcion.get(`/api/arrivals/appointments/${late.id}`)).json<ArrivalContext>().appointment?.isToday).toBe(true);
      clock.set('2026-11-05T06:01:00Z'); // 12:01 a. m. del 5 nov
      expect((await arrive(recepcion, withAppointment(late))).json<{ code: string }>().code).toBe('appointment_not_today');
      clock.set('2026-11-05T05:59:00Z');
      expect((await arrive(recepcion, withAppointment(late))).statusCode).toBe(201);

      // 1 nov 2026: fin del horario de verano (CDT → CST a las 2:00 a. m.).
      // Cita a las 11:30 p. m. CST (05:30Z del 2 nov); reloj a las 12:30 a. m. CDT (05:30Z del 1 nov).
      const dst = await newAppointment(await newPatient(), { startsAt: new Date('2026-11-02T05:30:00Z') });
      clock.set('2026-11-01T05:30:00Z');
      expect((await recepcion.get(`/api/arrivals/appointments/${dst.id}`)).json<ArrivalContext>().appointment?.isToday).toBe(true);
      clock.set('2026-11-02T06:01:00Z'); // 12:01 a. m. CST del 2 nov
      expect((await recepcion.get(`/api/arrivals/appointments/${dst.id}`)).json<ArrivalContext>().appointment?.isToday).toBe(false);
    } finally {
      clock.set(NOW);
    }
  });

  it('paciente inactivo o fusionado: 409 con lo necesario para resolverlo; tipo inactivo o inexistente', async () => {
    const inactive = await newPatient({ status: 'inactive' });
    const r1 = await arrive(recepcion, walkIn(inactive));
    expect(r1.json()).toEqual({ code: 'patient_inactive', patientId: inactive });
    const appointment = await newAppointment(inactive);
    expect((await arrive(recepcion, withAppointment(appointment))).json<{ code: string }>().code).toBe('patient_inactive');

    const principal = await newPatient();
    const merged = await newPatient({ mergedInto: principal });
    expect((await arrive(recepcion, walkIn(merged))).json()).toEqual({ code: 'patient_merged', principalId: principal });

    const unknownType = await arrive(recepcion, walkIn(await newPatient(), { appointmentTypeId: uuidv7() }));
    expect(unknownType.json<{ code: string }>().code).toBe('appointment_type_not_found');
  });

  it('permisos: Enfermería y el Administrador sin rol clínico reciben 403; con Recepción sí registra', async () => {
    const patientId = await newPatient();
    for (const client of [enfermeria, adminSinRol]) {
      expect((await arrive(client, walkIn(patientId))).statusCode).toBe(403);
      expect((await client.get(`/api/arrivals/patients/${patientId}`)).statusCode).toBe(403);
    }
    expect((await arrive(adminConRecepcion, walkIn(patientId))).statusCode).toBe(201);
    // Otra organización no ve al paciente.
    expect((await surRecepcion.get(`/api/arrivals/patients/${patientId}`)).statusCode).toBe(404);
    expect((await arrive(surRecepcion, walkIn(patientId))).statusCode).toBe(404);
  });

  it('la visita: código, estado y ruta, para cualquier rol clínico de la sede; lectura auditada', async () => {
    const patientId = await newPatient();
    const created = (await arrive(recepcion, walkIn(patientId))).json<ArrivalResult>();
    const response = await enfermeria.get(`/api/encounters/${created.encounter.id}`);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json<EncounterDetail>()).toMatchObject({ id: created.encounter.id, code: created.encounter.code, status: 'CHECKED_IN', route: 'STANDARD', version: 1 });
    expect((await recepcionNor2.get(`/api/encounters/${created.encounter.id}`)).statusCode).toBe(404);
    expect((await adminSinRol.get(`/api/encounters/${created.encounter.id}`)).statusCode).toBe(403);
    expect((await readAudit(`action = 'encounter.view' and entity_id = $1`, [created.encounter.id])).length).toBe(1);
  });

  it('eventos en vivo a la sala de la sede: encounter.changed y appointment.changed, solo ids y estado', async () => {
    const connect = (client: Client) =>
      new Promise<{ events: { name: string; payload: unknown }[] }>((resolve, reject) => {
        const socket = io(url, { path: SOCKET_PATH, transports: ['websocket'], reconnection: false, forceNew: true, extraHeaders: { origin: 'http://localhost:3000', cookie: client.cookieHeader } });
        sockets.push(socket);
        const events: { name: string; payload: unknown }[] = [];
        socket.onAny((name: string, payload: unknown) => {
          events.push({ name, payload });
        });
        socket.once('connect', () => {
          resolve({ events });
        });
        socket.once('connect_error', reject);
      });
    const nor1 = await connect(enfermeria);
    const sur = await connect(surRecepcion);
    const appointment = await newAppointment(await newPatient());
    const result = (
      await arrive(recepcion, withAppointment(appointment, { coverage: { type: 'insurance', insurerName: 'Seguro Que No Viaja', term: 'copay', value: '5' } }))
    ).json<ArrivalResult>();
    await expect
      .poll(() => nor1.events.filter((e) => e.name === 'event').map((e) => e.payload))
      .toEqual([
        { name: 'appointment.changed', ids: { appointment: appointment.id }, status: 'ARRIVED' },
        { name: 'encounter.changed', ids: { encounter: result.encounter.id }, status: 'CHECKED_IN' },
      ]);
    expect(JSON.stringify(nor1.events)).not.toMatch(/Prueba|Llegada|No Viaja/);
    expect(sur.events.filter((e) => e.name === 'event')).toEqual([]);
  });
});
