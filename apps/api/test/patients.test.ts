import { decryptNotificationPayload, NOTIFICATION_EVENT } from '@clinic/db';
import type { CreatedPatient, DuplicateCandidate, PatientSearchResult } from '@clinic/shared';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  createStaff,
  membershipIdOf,
  NORTE,
  readAudit,
  signedInWithContext,
  startApp,
  SUR,
  versionOf,
  type Client,
  type Staff,
  type TestApp,
} from './support.ts';

// T-012: pacientes (S-PAC-01 a 04) y la excepción del ADR 0027. Búsqueda en
// un solo campo (ADR 0030), alta con duplicados, permisos, auditoría con
// hash, aislamiento entre Norte y Sur y que los detalles del referido no
// salen en claro. Datos ficticios.

const NOR1 = NORTE.locations[0].id;
const NOR2 = NORTE.locations[1].id;

describe('T-012 pacientes', () => {
  let app: TestApp;
  let recepcion: Client;
  let enfermeria: Client;
  let proveedor: Client;
  let surRecepcion: Client;
  let admin: Client;
  let adminStaff: Staff;

  beforeAll(async () => {
    app = await startApp();
    recepcion = await signedInWithContext(app, await createStaff(app, 'pac-rec', [{ org: NORTE, location: 0, role: 'recepcion' }]), NORTE, 0);
    enfermeria = await signedInWithContext(app, await createStaff(app, 'pac-enf', [{ org: NORTE, location: 0, role: 'enfermeria' }]), NORTE, 0);
    proveedor = await signedInWithContext(app, await createStaff(app, 'pac-prov', [{ org: NORTE, location: 0, role: 'proveedor' }]), NORTE, 0);
    surRecepcion = await signedInWithContext(app, await createStaff(app, 'pac-sur', [{ org: SUR, location: 0, role: 'recepcion' }]), SUR, 0);
    adminStaff = await createStaff(app, 'pac-admin', [{ org: NORTE, location: null, role: 'administrador' }]);
    admin = await signedInWithContext(app, adminStaff, NORTE, 0, { mfa: true });
  });
  afterAll(async () => {
    await app.close();
  });

  const search = async (client: Client, q: string, offset = 0) => {
    const response = await client.post('/api/patients/search', { q, offset });
    expect(response.statusCode, response.body).toBe(200);
    return response.json<PatientSearchResult>();
  };
  const names = (result: PatientSearchResult) => result.patients.map((p) => `${p.firstName} ${p.lastName}`);

  it('«maria», «MARÍA», «Lopez» y «maria lop» encuentran a María López García, sin tildes ni mayúsculas', async () => {
    for (const q of ['maria', 'MARÍA', 'Lopez', 'maria lop', 'lop maria', 'lopez garcia']) {
      expect(names(await search(recepcion, q)), q).toContain('María López García');
    }
  });

  it('fecha, teléfono, código y combinaciones', async () => {
    expect(names(await search(recepcion, '02031985'))).toEqual(expect.arrayContaining(['María López García', 'Maria Lopez']));
    expect(names(await search(recepcion, '02/03/1985'))).toHaveLength(2);
    expect(names(await search(recepcion, 'maria 02031985'))).toEqual(expect.arrayContaining(['María López García', 'Maria Lopez']));
    // Madre e hijo comparten teléfono.
    expect(names(await search(recepcion, '(817) 555-0105')).sort()).toEqual(['Lucía Hernández Díaz', 'Mateo Hernández Díaz']);
    expect(names(await search(recepcion, 'mateo 8175550105'))).toEqual(['Mateo Hernández Díaz']);
    const byCode = await search(recepcion, 'p-1');
    expect(byCode.patients.map((p) => p.code)).toEqual(['P-000001']);
  });

  it('las coincidencias exactas por nombre van primero', async () => {
    const result = await search(recepcion, 'juan perez');
    expect(names(result).slice(0, 2)).toEqual(['Juan Pérez Gómez', 'Juan Pérez Gómez']);
  });

  it('rechaza una fecha que no existe, otros números y un nombre de menos de 3 letras', async () => {
    for (const [q, code] of [
      ['02301985', 'invalid_date'],
      ['11/24/85', 'invalid_date'],
      ['123456', 'invalid_number'],
      ['ma', 'name_too_short'],
      ['a b', 'name_too_short'],
      ['   ', 'empty'],
    ] as const) {
      const response = await recepcion.post('/api/patients/search', { q, offset: 0 });
      expect(response.statusCode, q).toBe(400);
      expect(response.json(), q).toEqual({ code });
    }
    // Con fecha o teléfono no hay mínimo de letras.
    expect(names(await search(recepcion, 'm 02031985'))).toEqual(expect.arrayContaining(['María López García']));
  });

  it('pagina de 20 en 20 con el total, sin repetir filas', async () => {
    for (let i = 1; i <= 22; i++) {
      const response = await recepcion.post('/api/patients', {
        firstName: 'Paginado',
        lastName: 'Ficticio Xyz',
        birthDate: `1970-01-${String(i).padStart(2, '0')}`,
        phone: null,
        referralSourceId: null,
        referralDetails: null,
        forceCreate: true,
      });
      expect(response.statusCode, response.body).toBe(201);
    }
    const first = await search(recepcion, 'paginado xyz');
    expect(first.patients).toHaveLength(20);
    expect(first.total).toBe(22);
    expect(first.nextOffset).toBe(20);
    const second = await search(recepcion, 'paginado xyz', 20);
    expect(second.patients).toHaveLength(2);
    expect(second.nextOffset).toBeNull();
    expect(new Set([...first.patients, ...second.patients].map((p) => p.id)).size).toBe(22);
  });

  it('cada búsqueda se audita con el hash del criterio, nunca sus valores', async () => {
    await search(recepcion, 'Valentina castillo');
    const event = (await readAudit(`action = 'patient.search' and metadata->>'criteria' = 'name'`)).at(-1);
    expect(event?.metadata).toMatchObject({ criteria: 'name', results: 1, total: 1 });
    expect(event?.metadata?.queryHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(event)).not.toMatch(/valentina|castillo/i);
    // El mismo criterio con otras mayúsculas y tildes da el mismo hash.
    await search(recepcion, 'VALENTINA Castíllo');
    const events = await readAudit(`action = 'patient.search' and metadata->>'queryHash' = $1`, [event?.metadata?.queryHash]);
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it('Enfermería y Proveedor buscan pero no crean; Propietario y Administrador sin rol clínico, nada', async () => {
    for (const client of [enfermeria, proveedor]) {
      expect(names(await search(client, 'maria'))).toContain('María López García');
      expect((await client.post('/api/patients', { firstName: 'X', lastName: 'Y', birthDate: '2000-01-01', phone: null, referralSourceId: null, referralDetails: null })).statusCode).toBe(403);
    }
    expect((await admin.post('/api/patients/search', { q: 'maria' })).statusCode).toBe(403);
    expect((await admin.get(`/api/patients/${NORTE.patients[0].id}`)).statusCode).toBe(403);
  });

  it('un paciente de Norte nunca aparece desde Sur, ni por nombre, ni por código, ni por id', async () => {
    expect(names(await search(surRecepcion, 'maria lopez'))).not.toContain('María López García');
    expect(names(await search(surRecepcion, 'lucia hernandez'))).toEqual([]);
    expect((await surRecepcion.get(`/api/patients/${NORTE.patients[0].id}`)).statusCode).toBe(404);
    // P-000001 en Sur es su propio paciente.
    expect((await search(surRecepcion, 'P-000001')).patients.map((p) => p.id)).toEqual([SUR.patients[0].id]);
  });

  describe('alta', () => {
    const newPatient = (extra: Record<string, unknown> = {}) => ({
      firstName: 'Paciente',
      lastName: `Ficticio ${String(Math.random()).slice(2, 8)}`,
      birthDate: '1990-05-05',
      phone: null,
      referralSourceId: null,
      referralDetails: null,
      ...extra,
    });

    it('crea con el siguiente código, en Recepción, y lo audita con los nombres de los campos', async () => {
      const response = await recepcion.post('/api/patients', newPatient({ phone: '(214) 555-0177' }));
      expect(response.statusCode, response.body).toBe(201);
      const created = response.json<CreatedPatient>();
      expect(created.code).toMatch(/^P-\d{6}$/);
      const [event] = await readAudit(`action = 'patient.created' and entity_id = $1`, [created.id]);
      expect(event?.metadata).toEqual({ code: created.code, fields: 'firstName,lastName,birthDate,phone' });
      const read = await recepcion.get(`/api/patients/${created.id}`);
      expect(read.json()).toMatchObject({ code: created.code, phone: '2145550177', status: 'active' });
      expect((await readAudit(`action = 'patient.read' and entity_id = $1`, [created.id])).length).toBe(1);
    });

    it('«Maria Lopez» con la misma fecha que «María López García» da el aviso; forzar crea y se audita', async () => {
      const input = newPatient({ firstName: 'Maria', lastName: 'Lopez Garcia', birthDate: '1985-02-03' });
      const response = await recepcion.post('/api/patients', input);
      expect(response.statusCode).toBe(409);
      const body = response.json<{ code: string; candidates: DuplicateCandidate[] }>();
      expect(body.code).toBe('possible_duplicate');
      expect(body.candidates.map((c) => `${c.firstName} ${c.lastName}`)).toEqual(expect.arrayContaining(['María López García', 'Maria Lopez']));
      // La comprobación queda auditada aunque no se cree nada.
      const checks = await readAudit(`action = 'patient.duplicate_check'`);
      expect(checks.at(-1)?.metadata?.candidates).toBeGreaterThanOrEqual(2);
      // «Abrir existente» también se audita.
      expect((await recepcion.post(`/api/patients/${NORTE.patients[0].id}/open-existing`, {})).statusCode).toBe(204);
      expect((await readAudit(`action = 'patient.duplicate_open_existing' and entity_id = $1`, [NORTE.patients[0].id])).length).toBeGreaterThanOrEqual(1);
      // «Crear de todos modos».
      const forced = await recepcion.post('/api/patients', { ...input, forceCreate: true });
      expect(forced.statusCode, forced.body).toBe(201);
      const { id } = forced.json<CreatedPatient>();
      const [event] = await readAudit(`action = 'patient.create_forced' and entity_id = $1`, [id]);
      expect(String(event?.metadata?.candidateIds)).toContain(NORTE.patients[0].id);
    });

    it('madre e hijo con el mismo teléfono: aviso suave con las coincidencias; «Crear de todos modos» crea y se audita', async () => {
      const input = newPatient({ firstName: 'Sofía', lastName: 'Hernández Díaz', birthDate: '2015-07-07', phone: '817-555-0105' });
      const response = await recepcion.post('/api/patients', input);
      expect(response.statusCode, response.body).toBe(409);
      const body = response.json<{ code: string; matches: DuplicateCandidate[] }>();
      expect(body.code).toBe('phone_shared');
      // Código, nombre y fecha de nacimiento; nunca el teléfono.
      expect(body.matches.map((m) => `${m.firstName} ${m.lastName} ${m.birthDate}`).sort()).toEqual([
        'Lucía Hernández Díaz 1970-08-18',
        'Mateo Hernández Díaz 2012-04-09',
      ]);
      expect(body.matches.every((m) => /^P-\d{6}$/.test(m.code))).toBe(true);
      expect(response.body).not.toContain('5550105');
      // La del alta (sin paciente); la edición (T-013) también audita este evento.
      const check = (await readAudit(`action = 'patient.phone_shared_check' and entity_id is null`)).at(-1);
      expect(check?.metadata).toMatchObject({ matches: 2 });
      expect(check?.metadata?.phoneHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(check)).not.toContain('5550105');

      const created = await recepcion.post('/api/patients', { ...input, confirmSharedPhone: true });
      expect(created.statusCode, created.body).toBe(201);
      const { id } = created.json<CreatedPatient>();
      const [choice] = await readAudit(`action = 'patient.phone_shared_create_anyway' and entity_id = $1`, [id]);
      expect(choice?.metadata).toMatchObject({ matches: 2, phoneHash: check?.metadata?.phoneHash });
      expect(JSON.stringify(choice)).not.toContain('5550105');
    });

    it('«Volver y corregir» se audita sin el teléfono en claro; con otro teléfono se crea sin aviso', async () => {
      const input = newPatient({ firstName: 'Emilio', lastName: 'Hernández Díaz', birthDate: '2016-03-03', phone: '(817) 555-0105' });
      expect((await recepcion.post('/api/patients', input)).json()).toMatchObject({ code: 'phone_shared' });
      const back = await recepcion.post('/api/patients/phone-shared/back', { phone: input.phone });
      expect(back.statusCode, back.body).toBe(204);
      const [event] = (await readAudit(`action = 'patient.phone_shared_back'`)).slice(-1);
      expect(event?.metadata?.phoneHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(event)).not.toContain('5550105');
      // Enfermería no crea pacientes, así que tampoco registra esta elección.
      expect((await enfermeria.post('/api/patients/phone-shared/back', { phone: input.phone })).statusCode).toBe(403);

      const corrected = await recepcion.post('/api/patients', { ...input, phone: '(817) 555-0198' });
      expect(corrected.statusCode, corrected.body).toBe(201);
    });

    it('nombre, fecha y teléfono a la vez: solo el aviso fuerte; forzarlo no pide confirmar el teléfono', async () => {
      const input = newPatient({ firstName: 'Maria', lastName: 'Lopez Garcia', birthDate: '1985-02-03', phone: '214-555-0101' });
      const response = await recepcion.post('/api/patients', input);
      expect(response.statusCode).toBe(409);
      expect(response.json<{ code: string }>().code).toBe('possible_duplicate');
      const forced = await recepcion.post('/api/patients', { ...input, forceCreate: true });
      expect(forced.statusCode, forced.body).toBe(201);
      const { id } = forced.json<CreatedPatient>();
      expect(await readAudit(`action = 'patient.phone_shared_create_anyway' and entity_id = $1`, [id])).toEqual([]);
    });

    it('rechaza una fecha futura, una fuente de otra clínica y detalles sin fuente', async () => {
      expect((await recepcion.post('/api/patients', newPatient({ birthDate: '2999-01-01' }))).json()).toEqual({ code: 'invalid_birth_date' });
      const surSource = await surRecepcion.get('/api/catalog');
      const source = surSource.json<{ items: { 'referral-sources': { id: string }[] } }>().items['referral-sources'][0]?.id;
      expect((await recepcion.post('/api/patients', newPatient({ referralSourceId: source }))).json()).toEqual({ code: 'invalid_referral_source' });
      expect((await recepcion.post('/api/patients', newPatient({ referralDetails: 'Por una vecina' }))).statusCode).toBe(400);
    });

    it('los detalles del referido se guardan cifrados y no salen en búsquedas, logs ni auditoría', async () => {
      const catalog = await recepcion.get('/api/catalog');
      const source = catalog.json<{ items: { 'referral-sources': { id: string }[] } }>().items['referral-sources'][0]?.id;
      const secret = 'Detalle ficticio zxqv';
      const response = await recepcion.post('/api/patients', newPatient({ firstName: 'Zoila', referralSourceId: source, referralDetails: secret }));
      expect(response.statusCode, response.body).toBe(201);
      const { id } = response.json<CreatedPatient>();
      const operator = new pg.Client({ connectionString: inject('operatorUrl') });
      await operator.connect();
      const { rows } = await operator.query<{ enc: string }>('select referral_details_enc as enc from app.patients where id = $1', [id]);
      const audit = await operator.query<{ text: string }>('select string_agg(metadata::text, \' \') as text from app.audit_log');
      await operator.end();
      expect(rows[0]?.enc).toMatch(/^v1:local:/);
      expect(rows[0]?.enc).not.toContain('zxqv');
      const found = await recepcion.post('/api/patients/search', { q: 'zoila' });
      expect(found.body).not.toContain('zxqv');
      expect(found.body).not.toContain('referral');
      expect(app.logs.text()).not.toContain('zxqv');
      expect(audit.rows[0]?.text).not.toContain('zxqv');
    });
  });

  describe('excepción del ADR 0027: el Propietario se asigna roles clínicos', () => {
    let owner: Client;
    let ownerStaff: Staff;

    beforeAll(async () => {
      ownerStaff = await createStaff(app, 'pac-owner', [{ org: NORTE, location: null, role: 'propietario' }]);
      owner = await signedInWithContext(app, ownerStaff, NORTE, 0, { mfa: true });
    });

    const assign = async (roles: { role: string; locationId: string }[], reason = 'Cubre la recepción esta semana') => {
      const membershipId = await membershipIdOf(app, NORTE, ownerStaff.userId);
      return owner.post('/api/memberships/self/clinical-roles', { roles, reason, expectedVersion: await versionOf(app, NORTE, membershipId) });
    };

    it('sin rol clínico no ve Pacientes; con Recepción en NOR1, sí', async () => {
      expect((await owner.post('/api/patients/search', { q: 'maria' })).statusCode).toBe(403);
      expect((await assign([{ role: 'recepcion', locationId: NOR1 }])).statusCode).toBe(204);
      expect(names(await search(owner, 'maria'))).toContain('María López García');
      const me = await owner.get('/api/me');
      expect(me.json<{ permissions: string[] }>().permissions).toEqual(expect.arrayContaining(['patients.access', 'patients.create', 'admin.access']));
    });

    it('queda auditado con el motivo y avisa a los Administradores, con las sedes y sin nombres', async () => {
      const membershipId = await membershipIdOf(app, NORTE, ownerStaff.userId);
      const [event] = await readAudit(`action = 'membership.own_clinical_roles_changed' and entity_id = $1`, [membershipId]);
      expect(event).toMatchObject({ reason: 'Cubre la recepción esta semana', metadata: { roles: 'recepcion', added: 1, removed: 0, locations: 'NOR1' } });
      const operator = new pg.Client({ connectionString: inject('operatorUrl') });
      await operator.connect();
      const { rows } = await operator.query<{ id: string; payload: string }>(
        'select id, payload from app.outbox where kind = $1 and organization_id = $2 and entity_id = $3',
        [NOTIFICATION_EVENT, NORTE.id, membershipId],
      );
      await operator.end();
      const payloads = rows.map((r) => decryptNotificationPayload(app.config.outboxKey, { organizationId: NORTE.id, eventId: r.id }, r.payload));
      expect(payloads.find((p) => p.userId === adminStaff.userId)).toMatchObject({ kind: 'membership.owner_clinical_roles', code: 'NOR1' });
      expect(payloads.some((p) => p.userId === ownerStaff.userId)).toBe(false);
    });

    it('cambiar de sede avisa con las dos sedes; quitarlos todos también se puede', async () => {
      expect((await assign([{ role: 'recepcion', locationId: NOR2 }])).statusCode).toBe(204);
      const membershipId = await membershipIdOf(app, NORTE, ownerStaff.userId);
      const events = await readAudit(`action = 'membership.own_clinical_roles_changed' and entity_id = $1`, [membershipId]);
      expect(events.at(-1)?.metadata).toMatchObject({ added: 1, removed: 1, locations: 'NOR1, NOR2' });
      expect((await assign([])).statusCode).toBe(204);
      expect((await owner.post('/api/patients/search', { q: 'maria' })).statusCode).toBe(403);
      // Su rol de Propietario sigue.
      expect((await owner.get('/api/me')).json<{ permissions: string[] }>().permissions).toContain('admin.access');
    });

    it('no puede asignarse Administrador ni Propietario, y exige motivo', async () => {
      expect((await assign([{ role: 'administrador', locationId: NOR1 }])).json()).toEqual({ code: 'role_change_not_allowed' });
      expect((await assign([{ role: 'propietario', locationId: NOR1 }])).json()).toEqual({ code: 'role_change_not_allowed' });
      expect((await assign([{ role: 'recepcion', locationId: NOR1 }], '')).statusCode).toBe(400);
    });

    it('un Administrador no puede usar la excepción, y nadie cambia sus propios roles por la vía general', async () => {
      const membershipId = await membershipIdOf(app, NORTE, adminStaff.userId);
      const response = await admin.post('/api/memberships/self/clinical-roles', {
        roles: [{ role: 'recepcion', locationId: NOR1 }],
        reason: 'Prueba',
        expectedVersion: await versionOf(app, NORTE, membershipId),
      });
      expect(response.json()).toEqual({ code: 'owner_only' });
      const ownerMembership = await membershipIdOf(app, NORTE, ownerStaff.userId);
      const general = await owner.post(`/api/memberships/${ownerMembership}/roles`, {
        roles: [{ role: 'propietario', locationId: null }, { role: 'recepcion', locationId: NOR1 }],
        reason: 'Prueba',
        expectedVersion: await versionOf(app, NORTE, ownerMembership),
      });
      expect(general.json()).toEqual({ code: 'cannot_modify_self' });
    });

    it('una versión vieja da 409', async () => {
      const response = await owner.post('/api/memberships/self/clinical-roles', { roles: [], reason: 'Prueba', expectedVersion: 1 });
      expect(response.json()).toEqual({ code: 'version_conflict' });
    });
  });
});
