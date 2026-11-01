import { APPOINTMENT_STATUS_VALUES, appointments, appointmentTypes, createLocalFieldCipher, createTenantDb, nextAppointmentCode } from '@clinic/db';
import {
  APPOINTMENT_STATUSES,
  PATIENT_APPOINTMENTS_PAGE_SIZE,
  type AgendaDay,
  type AppointmentDetail,
  type AppointmentStatus,
  type CreatedPatient,
  type PatientAppointments,
} from '@clinic/shared';
import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStaff, membershipIdOf, NORTE, readAudit, signedInWithContext, startApp, SUR, type Client, type TestApp } from './support.ts';

// T-014: agenda (S-REC-06 a 08), detalle de la cita (S-REC-09), pestaña Citas
// del perfil (S-PAC-07) y «N citas hoy» del Panel. Las citas se crean
// directamente en la base (las acciones llegan con T-015), con fechas lejanas
// para no chocar con otras pruebas. Todas las sedes ficticias están en la
// hora Central (America/Chicago). Datos ficticios.

type Org = typeof NORTE | typeof SUR;

describe('T-014 agenda y detalle de la cita', () => {
  let app: TestApp;
  let recepcion: Client;
  let recepcionNor2: Client;
  let recepcionAmbas: Client;
  let enfermeria: Client;
  let proveedor: Client;
  let proveedorMembership: string;
  let surRecepcion: Client;
  let adminSinRol: Client;
  let ownerSinRol: Client;
  let adminRecepcion: Client;
  const types: Record<string, string> = {};

  beforeAll(async () => {
    app = await startApp();
    recepcion = await signedInWithContext(app, await createStaff(app, 'cit-rec', [{ org: NORTE, location: 0, role: 'recepcion' }]), NORTE, 0);
    recepcionNor2 = await signedInWithContext(app, await createStaff(app, 'cit-rec2', [{ org: NORTE, location: 1, role: 'recepcion' }]), NORTE, 1);
    recepcionAmbas = await signedInWithContext(
      app,
      await createStaff(app, 'cit-ambas', [
        { org: NORTE, location: 0, role: 'recepcion' },
        { org: NORTE, location: 1, role: 'recepcion' },
      ]),
      NORTE,
      0,
    );
    enfermeria = await signedInWithContext(app, await createStaff(app, 'cit-enf', [{ org: NORTE, location: 0, role: 'enfermeria' }]), NORTE, 0);
    const provStaff = await createStaff(app, 'cit-prov', [{ org: NORTE, location: 0, role: 'proveedor' }]);
    proveedor = await signedInWithContext(app, provStaff, NORTE, 0);
    proveedorMembership = await membershipIdOf(app, NORTE, provStaff.userId);
    surRecepcion = await signedInWithContext(app, await createStaff(app, 'cit-sur', [{ org: SUR, location: 0, role: 'recepcion' }]), SUR, 0);
    adminSinRol = await signedInWithContext(app, await createStaff(app, 'cit-admin', [{ org: NORTE, location: null, role: 'administrador' }]), NORTE, 0, {
      mfa: true,
    });
    ownerSinRol = await signedInWithContext(app, await createStaff(app, 'cit-owner', [{ org: NORTE, location: null, role: 'propietario' }]), NORTE, 0, {
      mfa: true,
    });
    adminRecepcion = await signedInWithContext(
      app,
      await createStaff(app, 'cit-admin-rec', [
        { org: NORTE, location: null, role: 'administrador' },
        { org: NORTE, location: 0, role: 'recepcion' },
      ]),
      NORTE,
      0,
      { mfa: true },
    );
    for (const org of [NORTE, SUR]) {
      const rows = await createTenantDb(app.pool).withTenant(org.id, (tx) => tx.select({ id: appointmentTypes.id, code: appointmentTypes.code }).from(appointmentTypes));
      for (const r of rows) types[`${org.id}:${r.code}`] = r.id;
    }
  });
  afterAll(async () => {
    await app.close();
  });

  interface NewAppointment {
    org?: Org;
    site?: 0 | 1;
    patientId?: string;
    /** Instante exacto (UTC)… */
    at?: string;
    /** …o un día relativo a hoy en la sede y una hora local. */
    today?: { days: number; time: string };
    status?: AppointmentStatus;
    providerMembershipId?: string | null;
    notes?: string;
    cancelReason?: string;
    minutes?: number;
  }

  /** Crea una cita ficticia directamente en la base, con su código de sede. */
  const insert = async (a: NewAppointment): Promise<{ id: string; code: string }> => {
    const org = a.org ?? NORTE;
    const site = org.locations[a.site ?? 0];
    const id = uuidv7();
    const cipher = createLocalFieldCipher(app.config.fieldEncryptionKey);
    const context = (column: string) => ({ organizationId: org.id, table: 'appointments', column, recordId: id });
    return createTenantDb(app.pool).withTenant(org.id, async (tx) => {
      const code = await nextAppointmentCode(tx, org.id, site);
      await tx.insert(appointments).values({
        id,
        organizationId: org.id,
        locationId: site.id,
        patientId: a.patientId ?? org.patients[0].id,
        appointmentTypeId: types[`${org.id}:CONSULTA`] ?? '',
        providerMembershipId: a.providerMembershipId ?? null,
        code,
        startsAt: a.at
          ? new Date(a.at)
          : sql`(((now() at time zone 'America/Chicago')::date + ${a.today?.days ?? 0}::int) + ${a.today?.time ?? '12:00'}::time) at time zone 'America/Chicago'`,
        durationMinutes: a.minutes ?? 20,
        status: a.status ?? 'SCHEDULED',
        notesEnc: a.notes ? await cipher.encrypt(a.notes, context('notes')) : null,
        cancelReasonEnc: a.cancelReason ? await cipher.encrypt(a.cancelReason, context('cancel_reason')) : null,
      });
      return { id, code };
    });
  };

  const day = async (client: Client, date?: string) => {
    const response = await client.get(`/api/appointments${date ? `?date=${date}` : ''}`);
    expect(response.statusCode, response.body).toBe(200);
    return response.json<AgendaDay>();
  };

  it('los estados son los mismos en la base y en @clinic/shared', () => {
    expect([...APPOINTMENT_STATUSES]).toEqual([...APPOINTMENT_STATUS_VALUES]);
  });

  it('la agenda de NOR1 muestra solo citas de NOR1, ordenadas por hora y código, en la zona de la sede', async () => {
    // Fechas fijas en el pasado: las pruebas relativas a hoy (también las de
    // appointment-commands, en la misma base) nunca llegan a ellas.
    const date = '2025-12-02';
    const late = await insert({ at: '2025-12-02T16:00:00Z' });
    const early = await insert({ at: '2025-12-02T15:00:00Z', minutes: 30 });
    const tie = await insert({ at: '2025-12-02T16:00:00Z' });
    await insert({ at: '2025-12-02T15:30:00Z', site: 1 });
    await insert({ at: '2025-12-02T15:30:00Z', org: SUR });
    const agenda = await day(recepcion, date);
    expect(agenda.date).toBe(date);
    expect(agenda.timeZone).toBe('America/Chicago');
    expect(agenda.appointments.map((a) => a.id)).toEqual([early.id, late.id, tie.id]);
    expect(agenda.appointments.every((a) => a.code.startsWith('NOR1-A-'))).toBe(true);
    const first = agenda.appointments[0];
    expect(first?.durationMinutes).toBe(30);
    expect(first?.patient).toMatchObject({ id: NORTE.patients[0].id, firstName: NORTE.patients[0].firstName });
    expect(first?.type).toMatchObject({ code: 'CONSULTA', name: 'Consulta general', active: true, color: 'teal' });
    expect(first?.provider).toBeNull();
    // NOR2 tiene su propia agenda.
    const nor2 = await day(recepcionNor2, date);
    expect(nor2.appointments).toHaveLength(1);
    expect(nor2.appointments[0]?.code.startsWith('NOR2-A-')).toBe(true);
  });

  it('desde Sur no se ve nada de Norte: ni en la agenda ni en el detalle', async () => {
    const norte = await insert({ at: '2025-12-03T15:00:00Z' });
    const sur = await insert({ at: '2025-12-03T15:00:00Z', org: SUR });
    const agenda = await day(surRecepcion, '2025-12-03');
    expect(agenda.appointments.map((a) => a.id)).toEqual([sur.id]);
    expect((await surRecepcion.get(`/api/appointments/${norte.id}`)).statusCode).toBe(404);
    expect((await recepcion.get(`/api/appointments/${sur.id}`)).statusCode).toBe(404);
  });

  it('día con cambio de horario en otoño (1 nov 2026): 25 horas, sin perder ni repetir citas', async () => {
    const inside = [
      '2026-11-01T05:30:00Z', // 0:30 a. m. CDT
      '2026-11-01T06:30:00Z', // 1:30 a. m. CDT
      '2026-11-01T07:30:00Z', // 1:30 a. m. CST (la hora que se repite)
      '2026-11-02T05:30:00Z', // 11:30 p. m. CST
    ];
    const outside = ['2026-11-01T04:30:00Z' /* 31 oct, 11:30 p. m. */, '2026-11-02T06:30:00Z' /* 2 nov, 0:30 a. m. */];
    const ids = [];
    for (const at of inside) ids.push((await insert({ at, site: 1 })).id);
    for (const at of outside) await insert({ at, site: 1 });
    const agenda = await day(recepcionNor2, '2026-11-01');
    expect(agenda.appointments.map((a) => a.id)).toEqual(ids);
  });

  it('día con cambio de horario en primavera (14 mar 2027): 23 horas', async () => {
    const inside = [
      '2027-03-14T07:30:00Z', // 1:30 a. m. CST
      '2027-03-14T08:30:00Z', // 3:30 a. m. CDT (las 2:00 no existen)
      '2027-03-15T04:30:00Z', // 11:30 p. m. CDT
    ];
    const outside = ['2027-03-14T05:30:00Z' /* 13 mar, 11:30 p. m. */, '2027-03-15T05:30:00Z' /* 15 mar, 0:30 a. m. */];
    const ids = [];
    for (const at of inside) ids.push((await insert({ at, site: 1 })).id);
    for (const at of outside) await insert({ at, site: 1 });
    const agenda = await day(recepcionNor2, '2027-03-14');
    expect(agenda.appointments.map((a) => a.id)).toEqual(ids);
  });

  it('sin fecha, con una fecha inválida o fuera de ±2 años, la agenda es la de hoy en la sede', async () => {
    const today = (await day(recepcion)).today;
    expect((await day(recepcion)).date).toBe(today);
    expect((await day(recepcion, '2026-02-30')).date).toBe(today);
    expect((await day(recepcion, 'manana')).date).toBe(today);
    expect((await day(recepcion, '2035-01-01')).date).toBe(today);
  });

  it('proveedores para el filtro: los activos de la sede, sin quien llama; «Mis citas» con su membresía', async () => {
    const assigned = await insert({ at: '2026-12-04T15:00:00Z', providerMembershipId: proveedorMembership });
    const forRecepcion = await day(recepcion, '2026-12-04');
    expect(forRecepcion.providers.map((p) => p.membershipId)).toContain(proveedorMembership);
    expect(forRecepcion.providers.find((p) => p.membershipId === proveedorMembership)?.name).toBe('Persona cit-prov');
    expect(forRecepcion.appointments.find((a) => a.id === assigned.id)?.provider).toEqual({ membershipId: proveedorMembership, name: 'Persona cit-prov' });
    const forProveedor = await day(proveedor, '2026-12-04');
    expect(forProveedor.myMembershipId).toBe(proveedorMembership);
    expect(forProveedor.providers.map((p) => p.membershipId)).not.toContain(proveedorMembership);
    // El proveedor ve todas las citas de la sede (el filtro es del cliente).
    expect(forProveedor.appointments.map((a) => a.id)).toEqual(forRecepcion.appointments.map((a) => a.id));
    // Un proveedor de NOR2 no sale en el filtro de NOR1.
    const nor2Provider = await createStaff(app, 'cit-prov2', [{ org: NORTE, location: 1, role: 'proveedor' }]);
    const nor2Membership = await membershipIdOf(app, NORTE, nor2Provider.userId);
    expect((await day(recepcion, '2026-12-04')).providers.map((p) => p.membershipId)).not.toContain(nor2Membership);
  });

  it('detalle: notas y motivo descifrados; la lectura se audita sin datos del paciente', async () => {
    const created = await insert({ at: '2026-12-05T15:00:00Z', notes: 'Nota ficticia de prueba', status: 'CONFIRMED' });
    const cancelled = await insert({ at: '2026-12-05T16:00:00Z', status: 'CANCELLED', cancelReason: 'Motivo ficticio de prueba' });
    const response = await recepcion.get(`/api/appointments/${created.id}`);
    expect(response.statusCode, response.body).toBe(200);
    const detail = response.json<AppointmentDetail>();
    expect(detail).toMatchObject({
      id: created.id,
      code: created.code,
      status: 'CONFIRMED',
      notes: 'Nota ficticia de prueba',
      cancelReason: null,
      version: 1,
      location: { code: 'NOR1' },
      timeZone: 'America/Chicago',
    });
    expect((await recepcion.get(`/api/appointments/${cancelled.id}`)).json<AppointmentDetail>().cancelReason).toBe('Motivo ficticio de prueba');
    const audit = await readAudit(`action = 'appointment.view' and entity_id = $1`, [created.id]);
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain('Nota ficticia');
    expect(JSON.stringify(audit)).not.toContain(NORTE.patients[0].lastName);
    expect((await day(recepcion, '2026-12-05')).appointments.map((a) => a.id)).toEqual([created.id, cancelled.id]);
    const list = await readAudit(`action = 'appointment.list' and metadata->>'date' = '2026-12-05'`);
    expect(list.length).toBeGreaterThan(0);
    expect(JSON.stringify(list)).not.toContain(NORTE.patients[0].lastName);
    // Una cita de otra sede no se abre desde la sede activa; un id inválido, 400.
    const other = await insert({ at: '2026-12-05T15:00:00Z', site: 1 });
    expect((await recepcion.get(`/api/appointments/${other.id}`)).statusCode).toBe(404);
    expect((await recepcion.get('/api/appointments/no-es-un-id')).statusCode).toBe(400);
  });

  it('sin Recepción ni Proveedor en la sede no hay agenda: Enfermería, y Propietario o Administrador sin rol clínico (ADR 0027)', async () => {
    const created = await insert({ at: '2026-12-06T15:00:00Z' });
    for (const client of [enfermeria, adminSinRol, ownerSinRol]) {
      expect((await client.get('/api/appointments')).statusCode).toBe(403);
      expect((await client.get(`/api/appointments/${created.id}`)).statusCode).toBe(403);
      expect((await client.get(`/api/patients/${NORTE.patients[0].id}/appointments`)).statusCode).toBe(403);
    }
    expect((await day(adminRecepcion, '2026-12-06')).appointments.map((a) => a.id)).toContain(created.id);
  });

  it('«N citas hoy»: las de hoy en la sede menos Canceladas y No se presentó; lo ve quien ve el Panel', async () => {
    const before = (await recepcionNor2.get('/api/appointments/today-count')).json<{ count: number }>().count;
    for (const status of APPOINTMENT_STATUSES) await insert({ site: 1, today: { days: 0, time: '23:50' }, status });
    await insert({ site: 1, today: { days: 1, time: '00:10' } });
    await insert({ site: 1, today: { days: -1, time: '23:50' } });
    await insert({ site: 0, today: { days: 0, time: '12:00' } });
    const after = await recepcionNor2.get('/api/appointments/today-count');
    expect(after.statusCode).toBe(200);
    expect(after.json<{ count: number }>().count - before).toBe(3);
    expect((await enfermeria.get('/api/appointments/today-count')).statusCode).toBe(200);
    expect((await adminSinRol.get('/api/appointments/today-count')).statusCode).toBe(403);
  });

  describe('pestaña Citas del perfil (S-PAC-07)', () => {
    let patientId: string;

    beforeAll(async () => {
      const response = await recepcion.post('/api/patients', {
        firstName: 'Agenda',
        lastName: 'Ficticia Perfil',
        birthDate: '1990-01-01',
        phone: null,
        referralSourceId: null,
        referralDetails: null,
        forceCreate: true,
      });
      expect(response.statusCode, response.body).toBe(201);
      patientId = response.json<CreatedPatient>().id;
    });

    const list = async (client: Client, offset = 0) => {
      const response = await client.get(`/api/patients/${patientId}/appointments?offset=${String(offset)}`);
      expect(response.statusCode, response.body).toBe(200);
      return response.json<PatientAppointments>();
    };

    it('solo las de las sedes donde quien llama tiene Citas, de la más reciente a la más antigua, con la próxima cita', async () => {
      const past = await insert({ patientId, today: { days: -10, time: '10:00' }, status: 'ARRIVED' });
      const cancelledSoon = await insert({ patientId, today: { days: 1, time: '09:00' }, status: 'CANCELLED', cancelReason: 'Motivo ficticio' });
      const next = await insert({ patientId, today: { days: 2, time: '09:00' }, status: 'CONFIRMED', providerMembershipId: proveedorMembership });
      const later = await insert({ patientId, today: { days: 5, time: '09:00' } });
      const nor2 = await insert({ patientId, site: 1, today: { days: 1, time: '10:00' } });

      const onlyNor1 = await list(recepcion);
      expect(onlyNor1.appointments.map((a) => a.id)).toEqual([later.id, next.id, cancelledSoon.id, past.id]);
      expect(onlyNor1.upcoming?.id).toBe(next.id);
      expect(onlyNor1.upcoming?.provider?.name).toBe('Persona cit-prov');
      expect(onlyNor1.nextOffset).toBeNull();
      expect(onlyNor1.appointments[0]?.location).toMatchObject({ code: 'NOR1', name: NORTE.locations[0].name });

      // Con Recepción en las dos sedes, también la de NOR2, que es la próxima.
      const both = await list(recepcionAmbas);
      expect(both.appointments.map((a) => a.id)).toEqual([later.id, next.id, nor2.id, cancelledSoon.id, past.id]);
      expect(both.upcoming?.id).toBe(nor2.id);

      const audit = await readAudit(`action = 'patient.appointments_read' and entity_id = $1`, [patientId]);
      expect(audit.length).toBeGreaterThanOrEqual(2);
      expect(JSON.stringify(audit)).not.toContain('Motivo ficticio');
    });

    it('de 50 en 50 con «Cargar más»; de otra organización o inexistente, 404', async () => {
      for (let i = 0; i < PATIENT_APPOINTMENTS_PAGE_SIZE; i += 1) await insert({ patientId, at: `2026-06-${String((i % 28) + 1).padStart(2, '0')}T15:${String(i).padStart(2, '0')}:00Z` });
      const first = await list(recepcion);
      expect(first.appointments).toHaveLength(PATIENT_APPOINTMENTS_PAGE_SIZE);
      expect(first.nextOffset).toBe(PATIENT_APPOINTMENTS_PAGE_SIZE);
      const second = await list(recepcion, PATIENT_APPOINTMENTS_PAGE_SIZE);
      expect(second.appointments.length).toBeGreaterThan(0);
      expect(second.upcoming).toBeNull();
      expect(new Set([...first.appointments, ...second.appointments].map((a) => a.id)).size).toBe(first.appointments.length + second.appointments.length);
      expect((await surRecepcion.get(`/api/patients/${patientId}/appointments`)).statusCode).toBe(404);
      expect((await recepcion.get(`/api/patients/${uuidv7()}/appointments`)).statusCode).toBe(404);
      expect((await recepcion.get(`/api/patients/${patientId}/appointments?offset=-1`)).statusCode).toBe(400);
    });
  });
});
