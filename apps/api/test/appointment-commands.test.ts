import type { AddressInfo } from 'node:net';
import { appointments, appointmentTypes, createTenantDb, decryptNotificationPayload, memberships, NOTIFICATION_EVENT, notifications, patients, type NotificationPayload } from '@clinic/db';
import { addDays, type AppointmentDetail, type AppointmentFormOptions, type AppointmentOverlap, type AppointmentSaved, type CreatedPatient } from '@clinic/shared';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { io, type Socket } from 'socket.io-client';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { SOCKET_PATH } from '../src/realtime.ts';
import { createStaff, membershipIdOf, newOrganization, NORTE, readAudit, signedInWithContext, startApp, SUR, type Client, type Staff, type TestApp } from './support.ts';

// T-015: gestión de citas (S-REC-09 a 17). Alcance por rol (ADR 0027),
// matriz de estados, solapamiento, solo desde hoy en la sede, concurrencia
// optimista, Idempotency-Key, auditoría, avisos por el outbox (sin nombres de
// pacientes) y el evento en vivo (solo ids y estado). Cada prueba usa días
// distintos y proveedores propios para no chocar con otras. Datos ficticios.

describe('T-015 gestión de citas', () => {
  let app: TestApp;
  let url: string;
  let recepcion: Client;
  let recepcionStaff: Staff;
  let proveedor: Client;
  let proveedorStaff: Staff;
  let proveedorMembership: string;
  let proveedor2Staff: Staff;
  let proveedor2Membership: string;
  let recepcionMembership: string;
  let enfermeria: Client;
  let adminSinRol: Client;
  let ownerSinRol: Client;
  let surRecepcion: Client;
  let today: string;
  let consulta: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    app = await startApp();
    await app.app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${String((app.app.getHttpServer().address() as AddressInfo).port)}`;
    recepcionStaff = await createStaff(app, 'gc-rec', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    recepcion = await signedInWithContext(app, recepcionStaff, NORTE, 0);
    recepcionMembership = await membershipIdOf(app, NORTE, recepcionStaff.userId);
    proveedorStaff = await createStaff(app, 'gc-prov', [{ org: NORTE, location: 0, role: 'proveedor' }]);
    proveedor = await signedInWithContext(app, proveedorStaff, NORTE, 0);
    proveedorMembership = await membershipIdOf(app, NORTE, proveedorStaff.userId);
    proveedor2Staff = await createStaff(app, 'gc-prov2', [{ org: NORTE, location: 0, role: 'proveedor' }]);
    proveedor2Membership = await membershipIdOf(app, NORTE, proveedor2Staff.userId);
    enfermeria = await signedInWithContext(app, await createStaff(app, 'gc-enf', [{ org: NORTE, location: 0, role: 'enfermeria' }]), NORTE, 0);
    adminSinRol = await signedInWithContext(app, await createStaff(app, 'gc-admin', [{ org: NORTE, location: null, role: 'administrador' }]), NORTE, 0, {
      mfa: true,
    });
    ownerSinRol = await signedInWithContext(app, await createStaff(app, 'gc-owner', [{ org: NORTE, location: null, role: 'propietario' }]), NORTE, 0, {
      mfa: true,
    });
    surRecepcion = await signedInWithContext(app, await createStaff(app, 'gc-sur', [{ org: SUR, location: 0, role: 'recepcion' }]), SUR, 0);
    const options = await recepcion.get('/api/appointments/form-options');
    expect(options.statusCode, options.body).toBe(200);
    today = options.json<AppointmentFormOptions>().today;
    const db = createTenantDb(app.pool);
    const types = await db.withTenant(NORTE.id, (tx) => tx.select({ id: appointmentTypes.id, code: appointmentTypes.code }).from(appointmentTypes));
    consulta = types.find((t) => t.code === 'CONSULTA')?.id ?? '';
  });
  afterAll(async () => {
    for (const socket of sockets) socket.close();
    await app.close();
  });

  let keyCounter = 0;
  const key = () => `gc-${String(Date.now())}-${String((keyCounter += 1))}`;

  const body = (over: Record<string, unknown> = {}) => ({
    patientId: NORTE.patients[0].id,
    appointmentTypeId: consulta,
    date: addDays(today, 30),
    time: '09:00',
    durationMinutes: 20,
    providerMembershipId: proveedorMembership,
    notes: null,
    ...over,
  });

  const create = async (client: Client, over: Record<string, unknown> = {}, idempotencyKey = key()) => {
    const response = await client.post('/api/appointments', body(over), { 'idempotency-key': idempotencyKey });
    return response;
  };
  const created = async (client: Client, over: Record<string, unknown> = {}) => {
    const response = await create(client, over);
    expect(response.statusCode, response.body).toBe(201);
    return response.json<AppointmentSaved>();
  };
  const detail = async (client: Client, id: string) => {
    const response = await client.get(`/api/appointments/${id}`);
    expect(response.statusCode, response.body).toBe(200);
    return response.json<AppointmentDetail>();
  };

  /** Avisos de la campana encolados para una cita, descifrados con la clave de la prueba. */
  const notificationsFor = async (appointmentId: string): Promise<NotificationPayload[]> => {
    const operator = new pg.Client({ connectionString: inject('operatorUrl') });
    await operator.connect();
    try {
      const { rows } = await operator.query<{ id: string; payload: string }>(
        'select id, payload from app.outbox where kind = $1 and organization_id = $2 and entity_id = $3 and payload is not null order by created_at, id',
        [NOTIFICATION_EVENT, NORTE.id, appointmentId],
      );
      return rows.map((r) => decryptNotificationPayload(app.config.outboxKey, { organizationId: NORTE.id, eventId: r.id }, r.payload));
    } finally {
      await operator.end();
    }
  };

  it('Recepción crea una cita para el proveedor de NOR1: código de sede, auditoría y aviso «Cita asignada a usted» sin nombres', async () => {
    const saved = await created(recepcion, { date: addDays(today, 30), time: '09:00', notes: 'Traer estudios previos' });
    expect(saved).toMatchObject({ status: 'SCHEDULED', version: 1, warnings: [] });
    expect(saved.code).toMatch(/^NOR1-A-\d{6}$/);
    const read = await detail(recepcion, saved.id);
    expect(read.notes).toBe('Traer estudios previos');
    expect(read.provider?.membershipId).toBe(proveedorMembership);
    // 9:00 en la hora Central.
    expect(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).format(new Date(read.startsAt))).toBe(
      '09:00',
    );
    const [event] = await readAudit(`action = 'appointment.created' and entity_id = $1`, [saved.id]);
    expect(event?.metadata).toMatchObject({ code: saved.code, provider: true, overlap: false });
    expect(JSON.stringify(event)).not.toContain('Traer estudios');
    const notes = await notificationsFor(saved.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ userId: proveedorStaff.userId, kind: 'appointment.assigned', code: saved.code, entityType: 'appointment', locationId: NORTE.locations[0].id });
    expect(notes[0]?.startsAt).toBe(read.startsAt);
    expect(JSON.stringify(notes)).not.toMatch(/María|López/);
  });

  it('la lista de avisos muestra el código con la fecha y la hora de la sede', async () => {
    // El worker no corre en estas pruebas: se guarda el aviso como lo haría él.
    const id = uuidv7();
    await createTenantDb(app.pool).withTenant(NORTE.id, (tx) =>
      tx.insert(notifications).values({
        id,
        organizationId: NORTE.id,
        userId: proveedorStaff.userId,
        locationId: NORTE.locations[0].id,
        kind: 'appointment.assigned',
        entityType: 'appointment',
        entityId: id,
        code: 'NOR1-A-999999',
        startsAt: new Date('2026-11-03T15:00:00Z'),
        eventId: id,
      }),
    );
    // Otro de NOR2, donde no tiene acceso a Citas: al tocarlo solo se marca como leído.
    const other = uuidv7();
    await createTenantDb(app.pool).withTenant(NORTE.id, (tx) =>
      tx.insert(notifications).values({
        id: other,
        organizationId: NORTE.id,
        userId: proveedorStaff.userId,
        locationId: NORTE.locations[1].id,
        kind: 'appointment.changed',
        entityType: 'appointment',
        entityId: other,
        code: 'NOR2-A-999999',
        startsAt: new Date('2026-11-04T05:30:00Z'),
        eventId: other,
      }),
    );
    type Row = { id: string; code: string; when: string | null; day: string | null; canOpen: boolean };
    const list = (await proveedor.get('/api/notifications')).json<{ rows: Row[] }>();
    expect(list.rows.find((r) => r.id === id)).toMatchObject({ code: 'NOR1-A-999999', when: '3 nov, 9:00 a. m.', day: '2026-11-03', canOpen: true });
    // 5:30 UTC del 4 de noviembre es el 3 de noviembre en la hora Central.
    expect(list.rows.find((r) => r.id === other)).toMatchObject({ when: '3 nov, 11:30 p. m.', day: '2026-11-03', canOpen: false });
  });

  it('Idempotency-Key: la repetición devuelve la misma cita; con otro contenido, 409', async () => {
    const k = key();
    const first = await create(recepcion, { date: addDays(today, 31) }, k);
    expect(first.statusCode, first.body).toBe(201);
    const again = await create(recepcion, { date: addDays(today, 31) }, k);
    expect(again.statusCode).toBe(201);
    expect(again.json<AppointmentSaved>().id).toBe(first.json<AppointmentSaved>().id);
    expect((await create(recepcion, { date: addDays(today, 32) }, k)).json<{ code: string }>().code).toBe('idempotency_key_reused');
    expect((await recepcion.post('/api/appointments', body())).statusCode).toBe(400);
  });

  it('solo desde hoy en la sede: hoy a cualquier hora sí; ayer, no (crear y reprogramar)', async () => {
    const early = await created(recepcion, { date: today, time: '00:05', providerMembershipId: null });
    expect(early.status).toBe('SCHEDULED');
    const past = await create(recepcion, { date: addDays(today, -1), providerMembershipId: null });
    expect(past.statusCode).toBe(400);
    expect(past.json<{ code: string }>().code).toBe('appointment_in_past');
    const r = await recepcion.post(`/api/appointments/${early.id}/reschedule`, { expectedVersion: 1, date: addDays(today, -1), time: '10:00', durationMinutes: 20 });
    expect(r.json<{ code: string }>().code).toBe('appointment_in_past');
  });

  it('paciente inactivo y un proveedor que no es Proveedor en la sede se rechazan', async () => {
    const p = await recepcion.post('/api/patients', {
      firstName: 'Ficticio',
      lastName: `Inactivo ${uuidv7().slice(-6)}`,
      birthDate: '1990-01-01',
      phone: null,
      referralSourceId: null,
      referralDetails: null,
      forceCreate: true,
    });
    expect(p.statusCode, p.body).toBe(201);
    const patientId = p.json<CreatedPatient>().id;
    await createTenantDb(app.pool).withTenant(NORTE.id, (tx) => tx.update(patients).set({ status: 'inactive' }).where(eq(patients.id, patientId)));
    expect((await create(recepcion, { patientId })).json<{ code: string }>().code).toBe('patient_inactive');
    const invalid = await create(recepcion, { providerMembershipId: recepcionMembership });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json<{ code: string }>().code).toBe('invalid_provider');
  });

  it('un tipo de cita inactivo se rechaza (en una organización propia, para no tocar el catálogo de la semilla)', async () => {
    const { org, owner } = await newOrganization(app, 'GCT1');
    const membershipId = await createTenantDb(app.pool).withTenant(org.id, (tx) =>
      tx.select({ id: memberships.id, version: memberships.version }).from(memberships).then((r) => r[0]),
    );
    if (!membershipId) throw new Error('sin membresía');
    const assigned = await owner.post('/api/memberships/self/clinical-roles', {
      roles: [{ role: 'recepcion', locationId: org.locations[0].id }],
      reason: 'Prueba de citas',
      expectedVersion: membershipId.version,
    });
    expect(assigned.statusCode, assigned.body).toBe(204);
    const p = await owner.post('/api/patients', {
      firstName: 'Ficticia',
      lastName: 'Tipo Inactivo',
      birthDate: '1991-02-02',
      phone: null,
      referralSourceId: null,
      referralDetails: null,
      forceCreate: true,
    });
    expect(p.statusCode, p.body).toBe(201);
    const typeId = uuidv7();
    await createTenantDb(app.pool).withTenant(org.id, (tx) =>
      tx.insert(appointmentTypes).values({ id: typeId, organizationId: org.id, code: 'RETIRADO', name: 'Tipo retirado', active: false }),
    );
    const response = await owner.post(
      '/api/appointments',
      body({ patientId: p.json<CreatedPatient>().id, appointmentTypeId: typeId, providerMembershipId: null }),
      { 'idempotency-key': key() },
    );
    expect(response.statusCode).toBe(409);
    expect(response.json<{ code: string }>().code).toBe('appointment_type_inactive');
  });

  it('solapamiento: aviso antes de guardar y, igual, al crear, editar y reprogramar; nunca bloquea', async () => {
    const date = addDays(today, 40);
    const a = await created(recepcion, { date, time: '10:00', durationMinutes: 30, providerMembershipId: proveedor2Membership });
    const check = await recepcion.post('/api/appointments/overlap', { providerMembershipId: proveedor2Membership, date, time: '10:15', durationMinutes: 20 });
    expect(check.statusCode, check.body).toBe(200);
    const overlap = check.json<AppointmentOverlap>();
    expect(overlap.overlap).toBe(true);
    expect(overlap.conflictStartsAt).toBe((await detail(recepcion, a.id)).startsAt);
    // Justo al terminar no se cruza; la propia cita no cuenta.
    expect((await recepcion.post('/api/appointments/overlap', { providerMembershipId: proveedor2Membership, date, time: '10:30', durationMinutes: 20 })).json<AppointmentOverlap>().overlap).toBe(false);
    expect(
      (await recepcion.post('/api/appointments/overlap', { providerMembershipId: proveedor2Membership, date, time: '10:00', durationMinutes: 30, appointmentId: a.id })).json<AppointmentOverlap>()
        .overlap,
    ).toBe(false);

    const b = await created(recepcion, { date, time: '10:15', providerMembershipId: proveedor2Membership });
    expect(b.warnings).toEqual(['provider_overlap']);
    const c = await created(recepcion, { date, time: '11:00', providerMembershipId: proveedor2Membership });
    expect(c.warnings).toEqual([]);
    const edited = await recepcion.post(`/api/appointments/${c.id}`, { expectedVersion: 1, durationMinutes: 5 });
    expect(edited.json<AppointmentSaved>().warnings).toEqual([]);
    const moved = await recepcion.post(`/api/appointments/${c.id}/reschedule`, { expectedVersion: 2, date, time: '10:20', durationMinutes: 5 });
    expect(moved.statusCode, moved.body).toBe(200);
    expect(moved.json<AppointmentSaved>()).toMatchObject({ version: 3, warnings: ['provider_overlap'] });
    // Al editar: la cita de otro proveedor pasa a uno ocupado.
    const d = await created(recepcion, { date, time: '10:05', providerMembershipId: null });
    const reassigned = await recepcion.post(`/api/appointments/${d.id}`, { expectedVersion: 1, providerMembershipId: proveedor2Membership });
    expect(reassigned.json<AppointmentSaved>().warnings).toEqual(['provider_overlap']);
    // Una cita cancelada ya no ocupa.
    for (const s of [a, b]) {
      const v = (await detail(recepcion, s.id)).version;
      expect((await recepcion.post(`/api/appointments/${s.id}/cancel`, { expectedVersion: v, reason: 'Prueba de solapamiento' })).statusCode).toBe(200);
    }
    const v = (await detail(recepcion, c.id)).version;
    await recepcion.post(`/api/appointments/${c.id}/cancel`, { expectedVersion: v, reason: 'Prueba de solapamiento' });
    expect((await recepcion.post('/api/appointments/overlap', { providerMembershipId: proveedor2Membership, date, time: '10:15', durationMinutes: 20 })).json<AppointmentOverlap>().overlap).toBe(true);
    const dv = (await detail(recepcion, d.id)).version;
    await recepcion.post(`/api/appointments/${d.id}/cancel`, { expectedVersion: dv, reason: 'Prueba de solapamiento' });
    expect((await recepcion.post('/api/appointments/overlap', { providerMembershipId: proveedor2Membership, date, time: '10:15', durationMinutes: 20 })).json<AppointmentOverlap>().overlap).toBe(false);
  });

  it('editar: versión vieja → 409; auditoría con solo los nombres de los campos; reasignar avisa a los dos proveedores', async () => {
    const saved = await created(recepcion, { date: addDays(today, 50), providerMembershipId: proveedorMembership });
    const ok = await recepcion.post(`/api/appointments/${saved.id}`, { expectedVersion: 1, notes: 'Nota nueva ficticia', durationMinutes: 40 });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json<AppointmentSaved>().version).toBe(2);
    const stale = await recepcion.post(`/api/appointments/${saved.id}`, { expectedVersion: 1, durationMinutes: 30 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json<{ code: string }>().code).toBe('version_conflict');
    const [audit] = await readAudit(`action = 'appointment.updated' and entity_id = $1`, [saved.id]);
    expect(audit?.metadata).toMatchObject({ fields: 'duration,notes', version: 2 });
    expect(JSON.stringify(audit)).not.toContain('Nota nueva');
    // Sin cambios: no sube la versión.
    expect((await recepcion.post(`/api/appointments/${saved.id}`, { expectedVersion: 2, durationMinutes: 40 })).json<AppointmentSaved>().version).toBe(2);

    const moved = await recepcion.post(`/api/appointments/${saved.id}`, { expectedVersion: 2, providerMembershipId: proveedor2Membership });
    expect(moved.statusCode, moved.body).toBe(200);
    const notes = await notificationsFor(saved.id);
    expect(notes.map((n) => [n.kind, n.userId])).toEqual([
      ['appointment.assigned', proveedorStaff.userId],
      ['appointment.changed', proveedorStaff.userId],
      ['appointment.assigned', proveedor2Staff.userId],
      ['appointment.reassigned', proveedorStaff.userId],
    ]);
    // En edición, la fecha y la hora no se cambian (se reprograman): el campo se ignora.
    const read = await detail(recepcion, saved.id);
    await recepcion.post(`/api/appointments/${saved.id}`, { expectedVersion: 3, date: addDays(today, 60), time: '15:00' });
    expect((await detail(recepcion, saved.id)).startsAt).toBe(read.startsAt);
  });

  it('cancelar exige motivo; queda auditado con él; una cita cancelada no admite más acciones', async () => {
    const saved = await created(recepcion, { date: addDays(today, 51) });
    expect((await recepcion.post(`/api/appointments/${saved.id}/cancel`, { expectedVersion: 1, reason: '   ' })).statusCode).toBe(400);
    expect((await recepcion.post(`/api/appointments/${saved.id}/cancel`, { expectedVersion: 1 })).statusCode).toBe(400);
    const ok = await recepcion.post(`/api/appointments/${saved.id}/cancel`, { expectedVersion: 1, reason: 'A petición del paciente' });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json<AppointmentSaved>()).toMatchObject({ status: 'CANCELLED', version: 2 });
    expect((await detail(recepcion, saved.id)).cancelReason).toBe('A petición del paciente');
    const [audit] = await readAudit(`action = 'appointment.cancelled' and entity_id = $1`, [saved.id]);
    expect(audit).toMatchObject({ reason: 'A petición del paciente', metadata: { from: 'SCHEDULED', to: 'CANCELLED' } });
    expect((await recepcion.post(`/api/appointments/${saved.id}/cancel`, { expectedVersion: 2, reason: 'Otra vez' })).json<{ code: string }>().code).toBe(
      'invalid_appointment_transition',
    );
    expect((await recepcion.post(`/api/appointments/${saved.id}`, { expectedVersion: 2, durationMinutes: 30 })).json<{ code: string }>().code).toBe(
      'appointment_not_editable',
    );
    expect((await recepcion.post(`/api/appointments/${saved.id}/confirm`, { expectedVersion: 2 })).statusCode).toBe(409);
  });

  it('confirmar una vez; no presentado solo desde la hora de inicio', async () => {
    const future = await created(recepcion, { date: addDays(today, 52) });
    const confirmed = await recepcion.post(`/api/appointments/${future.id}/confirm`, { expectedVersion: 1 });
    expect(confirmed.json<AppointmentSaved>()).toMatchObject({ status: 'CONFIRMED', version: 2 });
    expect((await recepcion.post(`/api/appointments/${future.id}/confirm`, { expectedVersion: 2 })).json<{ code: string }>().code).toBe(
      'invalid_appointment_transition',
    );
    const early = await recepcion.post(`/api/appointments/${future.id}/no-show`, { expectedVersion: 2 });
    expect(early.statusCode).toBe(409);
    expect(early.json<{ code: string }>().code).toBe('no_show_before_start');

    const started = await created(recepcion, { date: today, time: '00:01', providerMembershipId: null });
    const noShow = await recepcion.post(`/api/appointments/${started.id}/no-show`, { expectedVersion: 1 });
    expect(noShow.statusCode, noShow.body).toBe(200);
    expect(noShow.json<AppointmentSaved>().status).toBe('NO_SHOW');
    expect(await readAudit(`action = 'appointment.no_show' and entity_id = $1`, [started.id])).toHaveLength(1);
  });

  it('Proveedor: solo para sí mismo y solo en sus citas; no reasigna; sin aviso por lo que hace él mismo', async () => {
    expect((await create(proveedor, { providerMembershipId: proveedor2Membership })).json<{ code: string }>().code).toBe('provider_scope');
    expect((await create(proveedor, { providerMembershipId: null })).json<{ code: string }>().code).toBe('provider_scope');
    const mine = await created(proveedor, { date: addDays(today, 53), providerMembershipId: proveedorMembership });
    expect(await notificationsFor(mine.id)).toEqual([]);
    expect((await proveedor.post(`/api/appointments/${mine.id}/confirm`, { expectedVersion: 1 })).statusCode).toBe(200);
    expect((await proveedor.post(`/api/appointments/${mine.id}`, { expectedVersion: 2, providerMembershipId: proveedor2Membership })).json<{ code: string }>().code).toBe(
      'provider_scope',
    );
    const other = await created(recepcion, { date: addDays(today, 53), time: '11:00', providerMembershipId: proveedor2Membership });
    for (const [path, payload] of [
      ['', { expectedVersion: 1, durationMinutes: 30 }],
      ['/confirm', { expectedVersion: 1 }],
      ['/cancel', { expectedVersion: 1, reason: 'No es mía' }],
      ['/reschedule', { expectedVersion: 1, date: addDays(today, 54), time: '09:00', durationMinutes: 20 }],
    ] as const) {
      const r = await proveedor.post(`/api/appointments/${other.id}${path}`, payload);
      expect(r.statusCode, path).toBe(403);
      expect(r.json<{ code: string }>().code).toBe('provider_scope');
    }
    // Recepción cambia la cita del proveedor: «Cita actualizada» para él.
    expect((await recepcion.post(`/api/appointments/${mine.id}/reschedule`, { expectedVersion: 2, date: addDays(today, 55), time: '08:00', durationMinutes: 20 })).statusCode).toBe(200);
    expect((await notificationsFor(mine.id)).map((n) => [n.kind, n.userId])).toEqual([['appointment.changed', proveedorStaff.userId]]);
  });

  it('Enfermería y Propietario o Administrador sin rol clínico: 403; Sur no ve ni cambia las citas de Norte', async () => {
    const saved = await created(recepcion, { date: addDays(today, 56) });
    for (const client of [enfermeria, adminSinRol, ownerSinRol]) {
      expect((await create(client)).statusCode).toBe(403);
      expect((await client.post(`/api/appointments/${saved.id}/confirm`, { expectedVersion: 1 })).statusCode).toBe(403);
      expect((await client.get('/api/appointments/form-options')).statusCode).toBe(403);
    }
    expect((await surRecepcion.post(`/api/appointments/${saved.id}/confirm`, { expectedVersion: 1 })).statusCode).toBe(404);
    expect((await surRecepcion.post(`/api/appointments/${saved.id}/cancel`, { expectedVersion: 1, reason: 'Ajena' })).statusCode).toBe(404);
    // Sur no puede agendar a un paciente de Norte.
    const cross = await surRecepcion.post('/api/appointments', body({ providerMembershipId: null, appointmentTypeId: consulta }), { 'idempotency-key': key() });
    expect(cross.statusCode).toBeGreaterThanOrEqual(400);
    expect((await detail(recepcion, saved.id)).status).toBe('SCHEDULED');
    const rows = await createTenantDb(app.pool).withTenant(SUR.id, (tx) => tx.select({ id: appointments.id }).from(appointments).where(eq(appointments.id, saved.id)));
    expect(rows).toEqual([]);
  });

  it('cada cambio emite appointment.changed a la sala de la sede, con solo el id y el estado', async () => {
    const connect = (client: Client) =>
      new Promise<{ socket: Socket; events: { name: string; payload: unknown }[] }>((resolve, reject) => {
        const socket = io(url, { path: SOCKET_PATH, transports: ['websocket'], reconnection: false, forceNew: true, extraHeaders: { origin: 'http://localhost:3000', cookie: client.cookieHeader } });
        sockets.push(socket);
        const events: { name: string; payload: unknown }[] = [];
        socket.onAny((name: string, payload: unknown) => {
          events.push({ name, payload });
        });
        socket.once('connect', () => {
          resolve({ socket, events });
        });
        socket.once('connect_error', reject);
      });
    const nor1 = await connect(proveedor);
    const sur = await connect(surRecepcion);
    const saved = await created(recepcion, { date: addDays(today, 57), notes: 'Nota que no viaja' });
    await recepcion.post(`/api/appointments/${saved.id}/cancel`, { expectedVersion: 1, reason: 'Motivo que no viaja' });
    await expect
      .poll(() => nor1.events.filter((e) => e.name === 'event').map((e) => e.payload))
      .toEqual([
        { name: 'appointment.changed', ids: { appointment: saved.id }, status: 'SCHEDULED' },
        { name: 'appointment.changed', ids: { appointment: saved.id }, status: 'CANCELLED' },
      ]);
    expect(JSON.stringify(nor1.events)).not.toMatch(/María|López|no viaja/);
    expect(sur.events.filter((e) => e.name === 'event')).toEqual([]);
  });
});
