import type { CreatedPatient, DuplicateCandidate, PatientProfile, PatientSearchResult } from '@clinic/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStaff, NORTE, readAudit, signedInWithContext, startApp, SUR, type Client, type TestApp } from './support.ts';

// T-013: perfil y edición del paciente (S-PAC-05, 11 y 12), inactivar y
// reactivar (ADR 0009). Cada prueba crea sus propios pacientes ficticios para
// no tocar los de la semilla, que usan otras pruebas.

describe('T-013 perfil y edición del paciente', () => {
  let app: TestApp;
  let recepcion: Client;
  let enfermeria: Client;
  let proveedor: Client;
  let surRecepcion: Client;
  let adminSinRol: Client;
  let adminRecepcion: Client;
  let ownerRecepcion: Client;
  let sourceId: string;

  beforeAll(async () => {
    app = await startApp();
    recepcion = await signedInWithContext(app, await createStaff(app, 'edit-rec', [{ org: NORTE, location: 0, role: 'recepcion' }]), NORTE, 0);
    enfermeria = await signedInWithContext(app, await createStaff(app, 'edit-enf', [{ org: NORTE, location: 0, role: 'enfermeria' }]), NORTE, 0);
    proveedor = await signedInWithContext(app, await createStaff(app, 'edit-prov', [{ org: NORTE, location: 0, role: 'proveedor' }]), NORTE, 0);
    surRecepcion = await signedInWithContext(app, await createStaff(app, 'edit-sur', [{ org: SUR, location: 0, role: 'recepcion' }]), SUR, 0);
    adminSinRol = await signedInWithContext(app, await createStaff(app, 'edit-admin', [{ org: NORTE, location: null, role: 'administrador' }]), NORTE, 0, {
      mfa: true,
    });
    adminRecepcion = await signedInWithContext(
      app,
      await createStaff(app, 'edit-admin-rec', [
        { org: NORTE, location: null, role: 'administrador' },
        { org: NORTE, location: 0, role: 'recepcion' },
      ]),
      NORTE,
      0,
      { mfa: true },
    );
    ownerRecepcion = await signedInWithContext(
      app,
      await createStaff(app, 'edit-owner-rec', [
        { org: NORTE, location: null, role: 'propietario' },
        { org: NORTE, location: 0, role: 'recepcion' },
      ]),
      NORTE,
      0,
      { mfa: true },
    );
    const catalog = await recepcion.get('/api/catalog');
    sourceId = catalog.json<{ items: { 'referral-sources': { id: string }[] } }>().items['referral-sources'][0]?.id ?? '';
  });
  afterAll(async () => {
    await app.close();
  });

  /** Seis letras al azar: el apellido se puede buscar (los dígitos serían fecha o teléfono). */
  const unique = () => Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
  const digits = (n: number) => Array.from({ length: n }, () => String(Math.floor(Math.random() * 10))).join('');
  /** Un paciente ficticio nuevo, con apellido único. */
  const createPatient = async (extra: Record<string, unknown> = {}) => {
    const response = await recepcion.post('/api/patients', {
      firstName: 'Editable',
      lastName: `Ficticio ${unique()}`,
      birthDate: '1991-06-06',
      phone: null,
      referralSourceId: null,
      referralDetails: null,
      forceCreate: true,
      ...extra,
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json<CreatedPatient>();
  };
  const profile = async (client: Client, id: string) => {
    const response = await client.get(`/api/patients/${id}`);
    expect(response.statusCode, response.body).toBe(200);
    return response.json<PatientProfile>();
  };

  it('el perfil trae versión, fuente y detalles del referido y fechas; cada apertura se audita', async () => {
    const { id } = await createPatient({ referralSourceId: sourceId, referralDetails: 'Volante ficticio' });
    const p = await profile(recepcion, id);
    expect(p).toMatchObject({ id, version: 1, status: 'active', referralSource: { id: sourceId }, referralDetails: 'Volante ficticio' });
    expect(p.referralSource?.name).toBeTruthy();
    expect(Date.parse(p.createdAt)).not.toBeNaN();
    await profile(enfermeria, id);
    expect((await readAudit(`action = 'patient.read' and entity_id = $1`, [id])).length).toBe(2);
  });

  it('Recepción edita nombre, apellidos, teléfono y referido; la auditoría lleva solo los nombres de los campos', async () => {
    const { id } = await createPatient();
    const lastName = `Corregido ${unique()}`;
    const response = await recepcion.post(`/api/patients/${id}`, {
      expectedVersion: 1,
      firstName: 'Editada',
      lastName,
      phone: '(214) 555-0133',
      referral: { sourceId, details: 'Detalle ficticio qwzx' },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ version: 2 });
    const p = await profile(recepcion, id);
    expect(p).toMatchObject({ firstName: 'Editada', lastName, phone: '2145550133', version: 2, referralDetails: 'Detalle ficticio qwzx' });
    const [event] = await readAudit(`action = 'patient.updated' and entity_id = $1`, [id]);
    expect(event?.metadata).toEqual({ fields: 'firstName,lastName,phone,referralSource,referralDetails', version: 2 });
    expect(event?.reason).toBeNull();
    const text = JSON.stringify(event);
    for (const value of ['Editada', 'Corregido', '5550133', 'qwzx']) expect(text).not.toContain(value);
    expect(app.logs.text()).not.toContain('qwzx');
  });

  it('sin fuente de referido se borran los detalles; sin cambios no escribe nada', async () => {
    const { id } = await createPatient({ referralSourceId: sourceId, referralDetails: 'Detalle ficticio' });
    expect((await recepcion.post(`/api/patients/${id}`, { expectedVersion: 1, referral: { sourceId: null, details: 'Ignorado' } })).json()).toEqual({ version: 2 });
    expect(await profile(recepcion, id)).toMatchObject({ referralSource: null, referralDetails: null });
    const same = await recepcion.post(`/api/patients/${id}`, { expectedVersion: 2, firstName: 'Editable' });
    expect(same.json()).toEqual({ version: 2 });
    expect((await readAudit(`action = 'patient.updated' and entity_id = $1`, [id])).length).toBe(1);
  });

  it('conflicto de versión: la segunda ventana recibe 409 y nada se sobrescribe', async () => {
    const { id } = await createPatient();
    expect((await recepcion.post(`/api/patients/${id}`, { expectedVersion: 1, phone: '2145550144' })).statusCode).toBe(200);
    const stale = await proveedor.post(`/api/patients/${id}`, { expectedVersion: 1, phone: '2145550155' });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ code: 'version_conflict' });
    expect((await profile(recepcion, id)).phone).toBe('2145550144');
  });

  it('el Proveedor solo cambia el teléfono; Enfermería no edita', async () => {
    const { id } = await createPatient();
    expect((await proveedor.post(`/api/patients/${id}`, { expectedVersion: 1, firstName: 'Otro' })).json()).toEqual({ code: 'identity_fields_locked' });
    expect((await proveedor.post(`/api/patients/${id}`, { expectedVersion: 1, referral: { sourceId, details: null } })).json()).toEqual({
      code: 'identity_fields_locked',
    });
    expect((await proveedor.post(`/api/patients/${id}`, { expectedVersion: 1, phone: '2145550166' })).statusCode).toBe(200);
    expect((await enfermeria.post(`/api/patients/${id}`, { expectedVersion: 2, phone: '2145550167' })).statusCode).toBe(403);
    expect((await enfermeria.post(`/api/patients/${id}/deactivate`, { expectedVersion: 2, reason: 'Prueba' })).statusCode).toBe(403);
  });

  describe('fecha de nacimiento (ADR 0009)', () => {
    it('Recepción y Proveedor no pueden cambiarla', async () => {
      const { id } = await createPatient();
      for (const client of [recepcion, proveedor]) {
        const response = await client.post(`/api/patients/${id}`, { expectedVersion: 1, birthDate: '1991-06-07', birthDateReason: 'Error de captura' });
        expect(response.statusCode).toBe(403);
        expect(response.json()).toEqual({ code: 'birth_date_locked' });
      }
      expect((await profile(recepcion, id)).birthDate).toBe('1991-06-06');
    });

    it('el Administrador sin rol clínico no llega al paciente', async () => {
      const { id } = await createPatient();
      expect((await adminSinRol.get(`/api/patients/${id}`)).statusCode).toBe(403);
      expect((await adminSinRol.post(`/api/patients/${id}`, { expectedVersion: 1, birthDate: '1991-06-07', birthDateReason: 'Error' })).statusCode).toBe(403);
      expect((await adminSinRol.post(`/api/patients/${id}/deactivate`, { expectedVersion: 1, reason: 'Error' })).statusCode).toBe(403);
    });

    it('el Administrador y el Propietario con Recepción la cambian con motivo, y queda auditado', async () => {
      for (const client of [adminRecepcion, ownerRecepcion]) {
        const { id } = await createPatient();
        expect((await client.post(`/api/patients/${id}`, { expectedVersion: 1, birthDate: '1991-06-07' })).statusCode).toBe(400);
        const response = await client.post(`/api/patients/${id}`, { expectedVersion: 1, birthDate: '1991-06-07', birthDateReason: 'Error de captura en el alta' });
        expect(response.statusCode, response.body).toBe(200);
        expect((await profile(client, id)).birthDate).toBe('1991-06-07');
        const [event] = await readAudit(`action = 'patient.updated' and entity_id = $1`, [id]);
        expect(event).toMatchObject({ reason: 'Error de captura en el alta', metadata: { fields: 'birthDate', version: 2 } });
        expect(JSON.stringify(event?.metadata)).not.toContain('1991');
      }
    });

    it('rechaza una fecha futura', async () => {
      const { id } = await createPatient();
      const response = await adminRecepcion.post(`/api/patients/${id}`, { expectedVersion: 1, birthDate: '2999-01-01', birthDateReason: 'Prueba' });
      expect(response.json()).toEqual({ code: 'invalid_birth_date' });
    });
  });

  describe('teléfono compartido al editar (ADR 0030)', () => {
    it('avisa con las coincidencias sin contar al propio; «Guardar de todos modos» guarda y se audita', async () => {
      const phone = `21455${digits(5)}`;
      const other = await createPatient({ phone });
      const { id } = await createPatient();
      const response = await recepcion.post(`/api/patients/${id}`, { expectedVersion: 1, phone });
      expect(response.statusCode).toBe(409);
      const body = response.json<{ code: string; matches: DuplicateCandidate[] }>();
      expect(body.code).toBe('phone_shared');
      expect(body.matches.map((m) => m.id)).toEqual([other.id]);
      expect(response.body).not.toContain(phone);
      const [check] = await readAudit(`action = 'patient.phone_shared_check' and entity_id = $1`, [id]);
      expect(check?.metadata?.phoneHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(check)).not.toContain(phone);
      // Nada cambió todavía.
      expect((await profile(recepcion, id)).version).toBe(1);

      const saved = await recepcion.post(`/api/patients/${id}`, { expectedVersion: 1, phone, confirmSharedPhone: true });
      expect(saved.json()).toEqual({ version: 2 });
      const [choice] = await readAudit(`action = 'patient.phone_shared_save_anyway' and entity_id = $1`, [id]);
      expect(choice?.metadata).toMatchObject({ matches: 1, phoneHash: check?.metadata?.phoneHash });

      // Volver a guardar el mismo teléfono no vuelve a avisar: no cambió.
      expect((await recepcion.post(`/api/patients/${id}`, { expectedVersion: 2, phone })).json()).toEqual({ version: 2 });
    });

    it('«Volver y corregir» en la edición se audita con el paciente; Enfermería no puede', async () => {
      const { id } = await createPatient();
      expect((await proveedor.post('/api/patients/phone-shared/back', { phone: '2145550188', patientId: id })).statusCode).toBe(204);
      const [event] = await readAudit(`action = 'patient.phone_shared_back' and entity_id = $1`, [id]);
      expect(JSON.stringify(event)).not.toContain('5550188');
      expect((await enfermeria.post('/api/patients/phone-shared/back', { phone: '2145550188', patientId: id })).statusCode).toBe(403);
      // En el alta sigue haciendo falta patients.create.
      expect((await proveedor.post('/api/patients/phone-shared/back', { phone: '2145550188' })).statusCode).toBe(403);
    });
  });

  describe('inactivar y reactivar (ADR 0009)', () => {
    const searchIds = async (q: string, includeInactive = false) => {
      const response = await recepcion.post('/api/patients/search', { q, includeInactive });
      expect(response.statusCode, response.body).toBe(200);
      return response.json<PatientSearchResult>().patients.map((p) => p.id);
    };

    it('con motivo; el inactivo no sale por defecto, sí con el filtro y siempre por código; reactivar lo devuelve', async () => {
      const lastName = `Inactivable ${unique()}`;
      const { id, code } = await createPatient({ lastName });
      expect((await recepcion.post(`/api/patients/${id}/deactivate`, { expectedVersion: 1, reason: 'Prueba' })).statusCode).toBe(403);
      expect((await adminRecepcion.post(`/api/patients/${id}/deactivate`, { expectedVersion: 1, reason: '' })).statusCode).toBe(400);
      expect((await adminRecepcion.post(`/api/patients/${id}/deactivate`, { expectedVersion: 1, reason: 'Registro de prueba' })).statusCode).toBe(204);
      expect((await adminRecepcion.post(`/api/patients/${id}/deactivate`, { expectedVersion: 2, reason: 'Otra vez' })).json()).toEqual({
        code: 'patient_already_inactive',
      });
      expect(await profile(recepcion, id)).toMatchObject({ status: 'inactive', version: 2 });
      expect(await searchIds(lastName)).toEqual([]);
      expect(await searchIds(lastName, true)).toEqual([id]);
      expect(await searchIds(code)).toEqual([id]);
      const [event] = await readAudit(`action = 'patient.deactivated' and entity_id = $1`, [id]);
      expect(event?.reason).toBe('Registro de prueba');

      expect((await ownerRecepcion.post(`/api/patients/${id}/reactivate`, { expectedVersion: 1, reason: 'Vieja' })).json()).toEqual({ code: 'version_conflict' });
      expect((await ownerRecepcion.post(`/api/patients/${id}/reactivate`, { expectedVersion: 2, reason: 'Volvió a la clínica' })).statusCode).toBe(204);
      expect(await searchIds(lastName)).toEqual([id]);
      const [reactivated] = await readAudit(`action = 'patient.reactivated' and entity_id = $1`, [id]);
      expect(reactivated?.reason).toBe('Volvió a la clínica');
    });
  });

  it('desde Sur no se ve ni se edita un paciente de Norte, ni con «Incluir inactivos»', async () => {
    const lastName = `Aislado ${unique()}`;
    const { id } = await createPatient({ lastName });
    expect((await surRecepcion.get(`/api/patients/${id}`)).statusCode).toBe(404);
    expect((await surRecepcion.post(`/api/patients/${id}`, { expectedVersion: 1, phone: '2145550199' })).statusCode).toBe(404);
    const found = await surRecepcion.post('/api/patients/search', { q: lastName, includeInactive: true });
    expect(found.json<PatientSearchResult>().total).toBe(0);
    expect((await profile(recepcion, id)).version).toBe(1);
  });
});
