import { coverages, createTenantDb, decryptNotificationPayload, encounterEvents, encounters, nextCode, NOTIFICATION_EVENT, patients, type NotificationPayload } from '@clinic/db';
import type { ArrivalResult, EncounterDetail, EncounterProvider, EncounterSaved, PatientEncounters } from '@clinic/shared';
import { and, eq } from 'drizzle-orm';
import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { FixedClock } from '../src/clock.ts';
import { createStaff, membershipIdOf, NORTE, readAudit, signedInWithContext, startApp, SUR, type Client, type TestApp } from './support.ts';

// T-018: pantalla de la visita y su circuito (S-CLI-04 a 12, S-CLI-24, S-PAC-08).
//  - Toda transición pasa por la máquina de estados y deja su fila en
//    encounter_events con actor, hora (reloj fijado), versión y motivo cifrado.
//  - Cerrar exige motivo; forzar es del Propietario o el Administrador con un
//    rol clínico en la sede (ADR 0033) y puede reabrir.
//  - Concurrencia optimista: la segunda ventana recibe 409.
//  - Asignar proveedor avisa por el outbox con el código de la visita, sin nombres.
//  - La cobertura se corrige con su versión; la auditoría guarda solo los nombres de los campos.
// Cada prueba crea sus pacientes ficticios para no chocar con otras.

/** 4 nov 2026, 11:00 a. m. en Chicago (CST, UTC−6). */
const NOW = '2026-11-04T17:00:00Z';

describe('T-018 pantalla de la visita', () => {
  const clock = new FixedClock(NOW);
  let app: TestApp;
  let recepcion: Client;
  let recepcionNor2: Client;
  let recepcionAmbas: Client;
  let enfermeria: Client;
  let proveedor: Client;
  let proveedorMembership: string;
  let proveedor2Membership: string;
  let recepcionMembership: string;
  let adminSinRol: Client;
  let adminConRecepcion: Client;
  let surRecepcion: Client;
  const db = () => createTenantDb(app.pool);

  beforeAll(async () => {
    app = await startApp({}, { clock });
    const recepcionStaff = await createStaff(app, 'vi-rec', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    recepcion = await signedInWithContext(app, recepcionStaff, NORTE, 0);
    recepcionMembership = await membershipIdOf(app, NORTE, recepcionStaff.userId);
    recepcionNor2 = await signedInWithContext(app, await createStaff(app, 'vi-rec2', [{ org: NORTE, location: 1, role: 'recepcion' }]), NORTE, 1);
    recepcionAmbas = await signedInWithContext(
      app,
      await createStaff(app, 'vi-rec-ambas', [
        { org: NORTE, location: 0, role: 'recepcion' },
        { org: NORTE, location: 1, role: 'enfermeria' },
      ]),
      NORTE,
      0,
    );
    enfermeria = await signedInWithContext(app, await createStaff(app, 'vi-enf', [{ org: NORTE, location: 0, role: 'enfermeria' }]), NORTE, 0);
    const proveedorStaff = await createStaff(app, 'vi-prov', [{ org: NORTE, location: 0, role: 'proveedor' }]);
    proveedor = await signedInWithContext(app, proveedorStaff, NORTE, 0);
    proveedorMembership = await membershipIdOf(app, NORTE, proveedorStaff.userId);
    const proveedor2Staff = await createStaff(app, 'vi-prov2', [{ org: NORTE, location: 0, role: 'proveedor' }]);
    proveedor2Membership = await membershipIdOf(app, NORTE, proveedor2Staff.userId);
    adminSinRol = await signedInWithContext(app, await createStaff(app, 'vi-admin', [{ org: NORTE, location: null, role: 'administrador' }]), NORTE, 0, { mfa: true });
    adminConRecepcion = await signedInWithContext(
      app,
      await createStaff(app, 'vi-admin-rec', [
        { org: NORTE, location: null, role: 'administrador' },
        { org: NORTE, location: 0, role: 'recepcion' },
      ]),
      NORTE,
      0,
      { mfa: true },
    );
    surRecepcion = await signedInWithContext(app, await createStaff(app, 'vi-sur', [{ org: SUR, location: 0, role: 'recepcion' }]), SUR, 0);
  });
  afterAll(async () => {
    await app.close();
  });

  let counter = 0;
  const key = () => `vi-${String(Date.now())}-${String((counter += 1))}`;

  async function newPatient(): Promise<string> {
    return db().withTenant(NORTE.id, async (tx) => {
      const id = uuidv7();
      await tx.insert(patients).values({
        id,
        organizationId: NORTE.id,
        registeredLocationId: NORTE.locations[0].id,
        code: await nextCode(tx, NORTE.id, 'patient'),
        firstName: 'Prueba',
        lastName: `Visita ${String((counter += 1))}`,
        birthDate: '1990-11-04',
      });
      return id;
    });
  }

  /** Abre una visita sin cita por la API (T-017) y devuelve su id. */
  async function open(options: { route?: string; coverage?: Record<string, unknown>; patientId?: string; client?: Client } = {}): Promise<{ id: string; patientId: string }> {
    const patientId = options.patientId ?? (await newPatient());
    const response = await (options.client ?? recepcion).post(
      '/api/encounters',
      { source: 'walk_in', patientId, appointmentTypeId: null, route: options.route ?? 'STANDARD', coverage: options.coverage ?? { type: 'self_pay' } },
      { 'idempotency-key': key() },
    );
    expect(response.statusCode, response.body).toBe(201);
    return { id: response.json<ArrivalResult>().encounter.id, patientId };
  }

  const detail = async (client: Client, id: string) => {
    const response = await client.get(`/api/encounters/${id}`);
    expect(response.statusCode, response.body).toBe(200);
    return response.json<EncounterDetail>();
  };
  const step = (client: Client, id: string, action: string, expectedVersion: number) => client.post(`/api/encounters/${id}/transition`, { action, expectedVersion });
  const code = (response: { json: () => unknown }) => (response.json() as { code: string }).code;

  const notificationsFor = async (encounterId: string): Promise<NotificationPayload[]> => {
    const operator = new pg.Client({ connectionString: inject('operatorUrl') });
    await operator.connect();
    try {
      const { rows } = await operator.query<{ id: string; payload: string }>(
        'select id, payload from app.outbox where kind = $1 and organization_id = $2 and entity_id = $3 and payload is not null order by created_at, id',
        [NOTIFICATION_EVENT, NORTE.id, encounterId],
      );
      return rows.map((r) => decryptNotificationPayload(app.config.outboxKey, { organizationId: NORTE.id, eventId: r.id }, r.payload));
    } finally {
      await operator.end();
    }
  };

  it('S-CLI-04: la visita con su paciente, su cobertura descifrada, su historial y las acciones de Recepción; lectura auditada', async () => {
    const { id, patientId } = await open({ coverage: { type: 'insurance', insurerName: 'Aseguradora Ficticia Dos', memberId: 'MBR-1234', term: 'coinsurance', value: '20' } });
    const d = await detail(recepcion, id);
    expect(d).toMatchObject({
      id,
      status: 'CHECKED_IN',
      route: 'STANDARD',
      version: 1,
      arrivedAt: new Date(NOW).toISOString(),
      closedAt: null,
      statusSince: new Date(NOW).toISOString(),
      closeReason: null,
      serverNow: new Date(NOW).toISOString(),
      today: '2026-11-04',
      patient: { id: patientId, firstName: 'Prueba', birthDate: '1990-11-04' },
      location: { code: 'NOR1', timezone: 'America/Chicago' },
      appointmentType: null,
      provider: null,
      coverage: { type: 'insurance', insurerName: 'Aseguradora Ficticia Dos', memberId: 'MBR-1234', term: 'coinsurance', coinsuranceBp: 2000, amountCents: null, version: 1 },
      abilities: { actions: ['send_to_nurse'], close: true, forceTargets: [], assignProvider: true, assignSelf: false, editCoverage: true },
    });
    expect(d.code).toMatch(/^NOR1-V-\d{6}$/);
    expect(d.timeline).toEqual([
      expect.objectContaining({ action: 'check_in', fromStatus: null, toStatus: 'CHECKED_IN', forced: false, reason: null, version: 1, actor: { kind: 'me', name: null } }),
    ]);
    // Enfermería la abre en solo lectura; quien registró aparece con su nombre.
    const nurse = await detail(enfermeria, id);
    expect(nurse.abilities).toEqual({ actions: [], close: false, forceTargets: [], assignProvider: false, assignSelf: false, editCoverage: false });
    expect(nurse.timeline[0]?.actor).toEqual({ kind: 'user', name: 'Persona vi-rec' });
    expect((await readAudit(`action = 'encounter.view' and entity_id = $1`, [id])).length).toBe(2);
    // Otra sede, otra organización o sin rol clínico: no la ven.
    expect((await recepcionNor2.get(`/api/encounters/${id}`)).statusCode).toBe(404);
    expect((await surRecepcion.get(`/api/encounters/${id}`)).statusCode).toBe(404);
    expect((await adminSinRol.get(`/api/encounters/${id}`)).statusCode).toBe(403);
  });

  it('circuito Estándar: cada rol da su paso, con historial, versiones, auditoría y la hora del reloj', async () => {
    const { id } = await open();
    const steps: [Client, string, string][] = [
      [recepcion, 'send_to_nurse', 'WAITING_FOR_NURSE'],
      [enfermeria, 'start_nursing', 'WITH_NURSE'],
      [enfermeria, 'send_to_provider', 'WAITING_FOR_PROVIDER'],
      [proveedor, 'start_consult', 'WITH_PROVIDER'],
      [proveedor, 'ready_for_checkout', 'READY_FOR_CHECKOUT'],
      [recepcion, 'start_checkout', 'CHECKOUT'],
      [recepcion, 'complete', 'COMPLETED'],
    ];
    let version = 1;
    try {
      for (const [client, action, to] of steps) {
        clock.set(new Date(new Date(NOW).getTime() + version * 60_000));
        const response = await step(client, id, action, version);
        expect(response.statusCode, `${action}: ${response.body}`).toBe(200);
        version += 1;
        expect(response.json<EncounterSaved>()).toEqual({ id, status: to, version });
      }
    } finally {
      clock.set(NOW);
    }
    const d = await detail(recepcion, id);
    expect(d).toMatchObject({ status: 'COMPLETED', version: 8, closedAt: '2026-11-04T17:07:00.000Z', statusSince: '2026-11-04T17:07:00.000Z', closeReason: null });
    expect(d.timeline.map((e) => [e.version, e.action, e.toStatus])).toEqual([
      [8, 'complete', 'COMPLETED'],
      [7, 'start_checkout', 'CHECKOUT'],
      [6, 'ready_for_checkout', 'READY_FOR_CHECKOUT'],
      [5, 'start_consult', 'WITH_PROVIDER'],
      [4, 'send_to_provider', 'WAITING_FOR_PROVIDER'],
      [3, 'start_nursing', 'WITH_NURSE'],
      [2, 'send_to_nurse', 'WAITING_FOR_NURSE'],
      [1, 'check_in', 'CHECKED_IN'],
    ]);
    expect(d.abilities).toMatchObject({ actions: [], close: false, assignProvider: false, editCoverage: false });
    const audit = await readAudit(`action = 'encounter.transitioned' and entity_id = $1`, [id]);
    expect(audit.map((a) => a.metadata?.to)).toEqual(['WAITING_FOR_NURSE', 'WITH_NURSE', 'WAITING_FOR_PROVIDER', 'WITH_PROVIDER', 'READY_FOR_CHECKOUT', 'CHECKOUT', 'COMPLETED']);
    expect(JSON.stringify(audit)).not.toMatch(/Prueba|Visita \d/);
    // Cerrada: sin más pasos.
    expect(code(await step(recepcion, id, 'send_to_nurse', 8))).toBe('encounter_closed');
  });

  it('ruta directa: «Solo inyección» va a procedimiento; fuera de orden, de otro rol o sin la acción correcta se rechaza', async () => {
    const { id } = await open({ route: 'INJECTION_ONLY' });
    // «Enviar a enfermería» no existe en una ruta directa.
    const wrongRoute = await step(recepcion, id, 'send_to_nurse', 1);
    expect(wrongRoute.statusCode).toBe(409);
    expect(code(wrongRoute)).toBe('invalid_transition');
    // Fuera de orden.
    expect(code(await step(recepcion, id, 'complete', 1))).toBe('invalid_transition');
    // Paso de otro rol.
    const notOwned = await step(enfermeria, id, 'send_to_procedure', 1);
    expect(notOwned.statusCode).toBe(403);
    expect(code(notOwned)).toBe('transition_not_owned');
    // Los cierres no van por aquí; tampoco la apertura.
    expect((await step(recepcion, id, 'close_cancelled', 1)).statusCode).toBe(400);
    expect((await step(recepcion, id, 'check_in', 1)).statusCode).toBe(400);
    const ok = await step(recepcion, id, 'send_to_procedure', 1);
    expect(ok.json<EncounterSaved>()).toEqual({ id, status: 'PROCEDURE_PENDING', version: 2 });
    // Enfermería ve «Listo para caja» en procedimiento pendiente.
    expect((await detail(enfermeria, id)).abilities.actions).toEqual(['ready_for_checkout']);
  });

  it('dos ventanas a la vez: la segunda recibe 409 version_conflict y la visita avanza una sola vez', async () => {
    const { id } = await open();
    const results = await Promise.all([step(recepcion, id, 'send_to_nurse', 1), step(adminConRecepcion, id, 'send_to_nurse', 1)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const conflict = results.find((r) => r.statusCode === 409);
    expect(conflict ? code(conflict) : null).toBe('version_conflict');
    const events = await db().withTenant(NORTE.id, (tx) => tx.select().from(encounterEvents).where(eq(encounterEvents.encounterId, id)));
    expect(events).toHaveLength(2);
    // Una versión vieja también: 409.
    expect(code(await step(enfermeria, id, 'start_nursing', 1))).toBe('version_conflict');
  });

  it('S-CLI-09 cerrar: motivo obligatorio, solo Recepción, motivo cifrado y visible en el historial y el banner', async () => {
    const { id, patientId } = await open();
    for (const body of [{ outcome: 'LEFT_EARLY', expectedVersion: 1 }, { outcome: 'LEFT_EARLY', reason: '   ', expectedVersion: 1 }, { outcome: 'LEFT_EARLY', reason: 'x'.repeat(501), expectedVersion: 1 }, { outcome: 'COMPLETED', reason: 'Motivo', expectedVersion: 1 }]) {
      expect((await recepcion.post(`/api/encounters/${id}/close`, body)).statusCode, JSON.stringify(body).slice(0, 60)).toBe(400);
    }
    const nurse = await enfermeria.post(`/api/encounters/${id}/close`, { outcome: 'CANCELLED', reason: 'Prueba', expectedVersion: 1 });
    expect(nurse.statusCode).toBe(403);
    expect(code(nurse)).toBe('transition_not_owned');

    const closed = await recepcion.post(`/api/encounters/${id}/close`, { outcome: 'LEFT_EARLY', reason: 'El paciente se fue antes de la consulta', expectedVersion: 1 });
    expect(closed.statusCode, closed.body).toBe(200);
    expect(closed.json<EncounterSaved>()).toEqual({ id, status: 'LEFT_EARLY', version: 2 });
    const [event] = await db().withTenant(NORTE.id, (tx) => tx.select().from(encounterEvents).where(and(eq(encounterEvents.action, 'close_left_early'), eq(encounterEvents.encounterId, id))));
    expect(event?.reasonEnc).toMatch(/^v1:local:/);
    const d = await detail(enfermeria, id);
    expect(d).toMatchObject({ status: 'LEFT_EARLY', closedAt: new Date(NOW).toISOString(), closeReason: 'El paciente se fue antes de la consulta' });
    expect(d.timeline[0]).toMatchObject({ action: 'close_left_early', fromStatus: 'CHECKED_IN', toStatus: 'LEFT_EARLY', reason: 'El paciente se fue antes de la consulta', version: 2 });
    const [audit] = await readAudit(`action = 'encounter.closed' and entity_id = $1`, [id]);
    expect(audit).toMatchObject({ reason: 'El paciente se fue antes de la consulta', metadata: { from: 'CHECKED_IN', to: 'LEFT_EARLY', version: 2 } });
    // Cerrar otra vez no se permite; el paciente puede volver a llegar.
    expect(code(await recepcion.post(`/api/encounters/${id}/close`, { outcome: 'CANCELLED', reason: 'Otra vez', expectedVersion: 2 }))).toBe('encounter_closed');
    await open({ patientId });
  });

  it('S-CLI-10 forzar (ADR 0033): solo Propietario o Administrador con rol clínico; motivo; destinos del manual; reabre si no hay otra visita abierta', async () => {
    const { id, patientId } = await open();
    const body = { status: 'WITH_NURSE', reason: 'Corrección de flujo', expectedVersion: 1 };
    for (const client of [adminSinRol, recepcion, enfermeria, proveedor]) {
      expect((await client.post(`/api/encounters/${id}/force`, body)).statusCode).toBe(403);
    }
    expect((await adminConRecepcion.post(`/api/encounters/${id}/force`, { ...body, reason: '' })).statusCode).toBe(400);
    // Un destino regular o un cierre no se fuerzan.
    expect(code(await adminConRecepcion.post(`/api/encounters/${id}/force`, { ...body, status: 'WAITING_FOR_NURSE' }))).toBe('invalid_transition');
    expect(code(await adminConRecepcion.post(`/api/encounters/${id}/force`, { ...body, status: 'CANCELLED' }))).toBe('invalid_transition');
    expect((await detail(adminConRecepcion, id)).abilities.forceTargets).toContain('WITH_NURSE');

    const forced = await adminConRecepcion.post(`/api/encounters/${id}/force`, body);
    expect(forced.statusCode, forced.body).toBe(200);
    expect(forced.json<EncounterSaved>()).toEqual({ id, status: 'WITH_NURSE', version: 2 });
    const d = await detail(recepcion, id);
    expect(d.timeline[0]).toMatchObject({ action: 'force', forced: true, fromStatus: 'CHECKED_IN', toStatus: 'WITH_NURSE', reason: 'Corrección de flujo', actor: { kind: 'user' } });
    const [audit] = await readAudit(`action = 'encounter.forced' and entity_id = $1`, [id]);
    expect(audit).toMatchObject({ reason: 'Corrección de flujo', metadata: { from: 'CHECKED_IN', to: 'WITH_NURSE', forced: true, reopened: false } });

    // Reabrir: cerrada → «Registrado».
    expect((await recepcion.post(`/api/encounters/${id}/close`, { outcome: 'CANCELLED', reason: 'Se canceló', expectedVersion: 2 })).statusCode).toBe(200);
    const reopened = await adminConRecepcion.post(`/api/encounters/${id}/force`, { status: 'CHECKED_IN', reason: 'Se canceló por error', expectedVersion: 3 });
    expect(reopened.json<EncounterSaved>()).toEqual({ id, status: 'CHECKED_IN', version: 4 });
    expect((await detail(recepcion, id)).closedAt).toBeNull();

    // Con otra visita abierta del paciente en la sede, no se reabre.
    expect((await recepcion.post(`/api/encounters/${id}/close`, { outcome: 'CANCELLED', reason: 'Se canceló', expectedVersion: 4 })).statusCode).toBe(200);
    const other = await open({ patientId });
    const blocked = await adminConRecepcion.post(`/api/encounters/${id}/force`, { status: 'CHECKED_IN', reason: 'Reabrir', expectedVersion: 5 });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toEqual({ code: 'encounter_already_open', encounterId: other.id });
  });

  it('S-CLI-05/06 asignar proveedor: Recepción elige, el proveedor se asigna a sí mismo y recibe el aviso sin el nombre del paciente', async () => {
    const providers = await recepcion.get('/api/encounters/providers');
    expect(providers.statusCode).toBe(200);
    expect(providers.json<EncounterProvider[]>().map((p) => p.membershipId)).toEqual(expect.arrayContaining([proveedorMembership, proveedor2Membership]));
    expect((await enfermeria.get('/api/encounters/providers')).statusCode).toBe(403);

    const { id } = await open();
    const assign = (client: Client, providerMembershipId: string, expectedVersion: number) =>
      client.post(`/api/encounters/${id}/provider`, { providerMembershipId, expectedVersion });
    // Quien no es Proveedor activo de la sede, no.
    expect(code(await assign(recepcion, recepcionMembership, 1))).toBe('invalid_provider');
    // Enfermería no asigna; el Proveedor solo a sí mismo.
    expect(code(await assign(enfermeria, proveedorMembership, 1))).toBe('assign_not_allowed');
    expect(code(await assign(proveedor, proveedor2Membership, 1))).toBe('assign_not_allowed');

    const first = await assign(recepcion, proveedor2Membership, 1);
    expect(first.json<EncounterSaved>()).toEqual({ id, status: 'CHECKED_IN', version: 2 });
    // Elegir el mismo no escribe.
    expect((await assign(recepcion, proveedor2Membership, 2)).json<EncounterSaved>().version).toBe(2);
    expect((await detail(recepcion, id)).provider).toEqual({ membershipId: proveedor2Membership, name: 'Persona vi-prov2' });
    // «Asignarme»: el proveedor toma una visita de otro.
    expect((await detail(proveedor, id)).abilities.assignSelf).toBe(true);
    const self = await assign(proveedor, proveedorMembership, 2);
    expect(self.json<EncounterSaved>().version).toBe(3);
    expect((await detail(proveedor, id)).abilities.assignSelf).toBe(false);

    // Un solo aviso: al proveedor 2 (el proveedor que se asignó a sí mismo no se avisa).
    const sent = await notificationsFor(id);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: 'encounter.provider_assigned', entityType: 'encounter', entityId: id });
    expect(sent[0]?.code).toMatch(/^NOR1-V-\d{6}$/);
    expect(JSON.stringify(sent)).not.toMatch(/Prueba|Visita \d/);
    const audit = await readAudit(`action = 'encounter.provider_assigned' and entity_id = $1`, [id]);
    expect(audit.map((a) => a.metadata?.self)).toEqual([false, true]);

    // Cerrada: no se asigna.
    await recepcion.post(`/api/encounters/${id}/close`, { outcome: 'CANCELLED', reason: 'Fin', expectedVersion: 3 });
    expect(code(await assign(recepcion, proveedor2Membership, 4))).toBe('encounter_closed');
  });

  it('S-CLI-12 cobertura: Recepción la corrige con su versión; cifrada; auditoría solo con nombres de campos', async () => {
    const { id } = await open();
    const update = (client: Client, coverage: Record<string, unknown>, expectedVersion: number) => client.post(`/api/encounters/${id}/coverage`, { coverage, expectedVersion });
    const insurance = { type: 'insurance', insurerName: 'Seguro Ficticio Tres', memberId: 'MBR-5555', term: 'copay', value: '15' };
    expect((await update(enfermeria, insurance, 1)).statusCode).toBe(403);
    expect((await update(recepcion, { ...insurance, value: '15,00' }, 1)).statusCode).toBe(400);
    expect((await update(recepcion, { type: 'membership' }, 1)).statusCode).toBe(400);
    const saved = await update(recepcion, insurance, 1);
    expect(saved.statusCode, saved.body).toBe(200);
    expect((await detail(enfermeria, id)).coverage).toEqual({ type: 'insurance', insurerName: 'Seguro Ficticio Tres', memberId: 'MBR-5555', term: 'copay', amountCents: 1500, coinsuranceBp: null, version: 2 });
    const [row] = await db().withTenant(NORTE.id, (tx) => tx.select().from(coverages).where(eq(coverages.encounterId, id)));
    expect(JSON.stringify(row)).not.toMatch(/Ficticio Tres|MBR-5555/);
    // Versión vieja: 409. Sin cambios: no escribe.
    expect(code(await update(recepcion, { type: 'self_pay' }, 1))).toBe('version_conflict');
    expect((await update(recepcion, insurance, 2)).statusCode).toBe(200);
    const audit = await readAudit(`action = 'encounter.coverage_updated' and entity_id = $1`, [id]);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.metadata).toMatchObject({ fields: 'type,insurerName,memberId,term,amountCents', coverage: 'insurance', version: 2 });
    expect(JSON.stringify(audit)).not.toMatch(/Ficticio Tres|MBR-5555|1500/);
    // Vuelta a Pago directo: se borran los datos del seguro.
    expect((await update(recepcion, { type: 'self_pay' }, 2)).statusCode).toBe(200);
    expect((await detail(recepcion, id)).coverage).toMatchObject({ type: 'self_pay', insurerName: null, memberId: null, term: null, amountCents: null, version: 3 });
    // Con la visita cerrada, no.
    await recepcion.post(`/api/encounters/${id}/close`, { outcome: 'CANCELLED', reason: 'Fin', expectedVersion: 1 });
    expect(code(await update(recepcion, insurance, 3))).toBe('encounter_closed');
  });

  it('S-PAC-08 visitas del paciente: solo las sedes donde quien mira tiene un rol clínico, de la más reciente a la más antigua; auditada', async () => {
    const patientId = await newPatient();
    const nor1 = await open({ patientId });
    clock.set('2026-11-04T18:00:00Z');
    try {
      await open({ patientId, client: recepcionNor2 });
    } finally {
      clock.set(NOW);
    }
    const list = async (client: Client) => {
      const response = await client.get(`/api/patients/${patientId}/encounters`);
      expect(response.statusCode, response.body).toBe(200);
      return response.json<PatientEncounters>();
    };
    // Recepción de NOR1: solo NOR1.
    expect((await list(recepcion)).encounters.map((e) => e.location.code)).toEqual(['NOR1']);
    // Con roles clínicos en NOR1 y NOR2: las dos, la más reciente primero.
    const both = await list(recepcionAmbas);
    expect(both.encounters.map((e) => [e.location.code, e.status, e.route])).toEqual([
      ['NOR2', 'CHECKED_IN', 'STANDARD'],
      ['NOR1', 'CHECKED_IN', 'STANDARD'],
    ]);
    expect(both.encounters[1]).toMatchObject({ id: nor1.id, provider: null, arrivedAt: new Date(NOW).toISOString() });
    expect(both.nextOffset).toBeNull();
    expect(JSON.stringify(both)).not.toMatch(/Prueba/);
    expect((await readAudit(`action = 'patient.encounters_read' and entity_id = $1`, [patientId])).length).toBe(2);
    // Sin rol clínico u otra organización: no.
    expect((await adminSinRol.get(`/api/patients/${patientId}/encounters`)).statusCode).toBe(403);
    expect((await surRecepcion.get(`/api/patients/${patientId}/encounters`)).statusCode).toBe(404);
  });

  it('la visita queda en la base con el estado de la máquina y su closed_at coherente', async () => {
    const { id } = await open();
    await recepcion.post(`/api/encounters/${id}/close`, { outcome: 'CANCELLED', reason: 'Fin', expectedVersion: 1 });
    const [row] = await db().withTenant(NORTE.id, (tx) => tx.select().from(encounters).where(eq(encounters.id, id)));
    expect(row).toMatchObject({ status: 'CANCELLED', version: 2, closedAt: new Date(NOW) });
  });
});
