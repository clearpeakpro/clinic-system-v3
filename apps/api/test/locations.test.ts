import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createStaff, newOrganization, NORTE, readAudit, signedInWithContext, startApp, type TestApp } from './support.ts';

// Administración › Sedes (S-ADM-10 a 12, T-007): lista, crear, editar,
// desactivar y activar, con versión, auditoría y la regla de la única sede
// activa. Una sede inactiva no se puede elegir ni operar. Con organizaciones
// propias (creadas con org:create): las ficticias de la semilla no se tocan.

interface Row {
  id: string;
  code: string;
  name: string;
  timezone: string;
  address: string | null;
  phone: string | null;
  active: boolean;
  version: number;
}

describe('Administración › Sedes', () => {
  let app: TestApp;
  let owner: Client;
  let surOwner: Client;
  let orgA: typeof NORTE;

  beforeAll(async () => {
    app = await startApp();
    ({ org: orgA, owner } = await newOrganization(app, 'ORA1'));
    ({ owner: surOwner } = await newOrganization(app, 'ORB1'));
    await create(owner, 'ORA2');
  });
  afterAll(async () => {
    await app.close();
  });

  const list = async (client: Client) => (await client.get('/api/locations')).json<Row[]>();
  const byCode = async (client: Client, code: string) => {
    const row = (await list(client)).find((r) => r.code === code);
    if (!row) throw new Error(`sin sede ${code}`);
    return row;
  };
  const create = (client: Client, code: string, extra: Record<string, unknown> = {}) =>
    client.post('/api/locations', { code, name: `Sede ${code}`, timezone: 'America/Chicago', address: null, phone: null, ...extra });

  it('lista las sedes de su organización; los roles clínicos no entran', async () => {
    const rows = await list(owner);
    expect(rows.map((r) => r.code)).toEqual(['ORA1', 'ORA2']);
    expect(rows[0]).toMatchObject({ active: true, version: 1, timezone: 'America/Chicago' });
    expect((await list(surOwner)).map((r) => r.code)).toEqual(['ORB1']);

    const clinical = await createStaff(app, 'sedes-recep', [{ org: orgA, location: 0, role: 'recepcion' }]);
    const client = await signedInWithContext(app, clinical, orgA);
    expect((await client.get('/api/locations')).statusCode).toBe(403);
    expect((await create(client, 'NOPE')).statusCode).toBe(403);
  });

  it('crea una sede con código único en la organización (en otra se permite) y la audita', async () => {
    const created = await create(owner, 'NOR7', { address: '1 Calle Ficticia', phone: '(555) 010-0000' });
    expect(created.statusCode).toBe(201);
    const { id } = created.json<{ id: string }>();
    expect(await byCode(owner, 'NOR7')).toMatchObject({ id, address: '1 Calle Ficticia', phone: '(555) 010-0000', active: true });

    const duplicate = await create(owner, 'NOR7');
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ code: 'location_code_taken' });
    expect((await create(surOwner, 'NOR7')).statusCode).toBe(201);

    const [event] = await readAudit("action = 'location.created' and entity_id = $1", [id]);
    expect(event).toMatchObject({ organization_id: orgA.id, metadata: { code: 'NOR7' } });
  });

  it('valida código, zona horaria y longitudes', async () => {
    for (const body of [
      { code: 'nor8' },
      { code: '8NOR' },
      { code: 'NOR-8' },
      { code: 'NOR8', timezone: 'Central' },
      { code: 'NOR8', name: '' },
      { code: 'NOR8', phone: '1'.repeat(31) },
    ]) {
      expect((await create(owner, body.code, body)).statusCode, JSON.stringify(body)).toBe(400);
    }
  });

  it('edita con la versión actual (el código no cambia); con una versión vieja, 409', async () => {
    await create(owner, 'NOR9');
    const site = await byCode(owner, 'NOR9');
    const response = await owner.post(`/api/locations/${site.id}`, {
      code: 'XXX',
      name: 'Norte Nueve',
      timezone: 'America/Denver',
      address: '9 Calle Ficticia',
      phone: null,
      expectedVersion: site.version,
    });
    expect(response.statusCode).toBe(204);
    expect(await byCode(owner, 'NOR9')).toMatchObject({ name: 'Norte Nueve', timezone: 'America/Denver', address: '9 Calle Ficticia', version: 2 });

    const stale = await owner.post(`/api/locations/${site.id}`, { name: 'Otra', timezone: 'America/Chicago', address: null, phone: null, expectedVersion: 1 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ code: 'version_conflict' });
    const [event] = await readAudit("action = 'location.updated' and entity_id = $1", [site.id]);
    // Solo los nombres de los campos que cambiaron.
    expect(event?.metadata).toEqual({ fields: 'name,timezone,address' });
  });

  it('una sede inactiva no se elige ni se opera; al activarla vuelve', async () => {
    await create(owner, 'NORX');
    let site = await byCode(owner, 'NORX');
    const nurse = await createStaff(app, 'sedes-enf', [{ org: orgA, location: 0, role: 'enfermeria' }]);
    // Se le asigna la sede nueva para poder trabajar en ella.
    const admin = await createStaff(app, 'sedes-admin', [{ org: orgA, location: null, role: 'administrador' }]);
    const adminClient = await signedInWithContext(app, admin, orgA, 0, { mfa: true });
    const list2 = (await adminClient.get('/api/users')).json<{ rows: { email: string; membershipId: string; version: number }[] }>();
    const member = list2.rows.find((r) => r.email === nurse.email);
    if (!member) throw new Error('sin fila');
    expect(
      (
        await adminClient.post(`/api/memberships/${member.membershipId}/roles`, {
          roles: [
            { role: 'enfermeria', locationId: orgA.locations[0].id },
            { role: 'enfermeria', locationId: site.id },
          ],
          reason: 'Prueba',
          expectedVersion: member.version,
        })
      ).statusCode,
    ).toBe(204);
    const client = new Client(app);
    await client.post('/api/auth/sign-in/email', { email: nurse.email, password: nurse.password });
    expect((await client.post('/api/context', { organizationId: orgA.id, locationId: site.id })).statusCode).toBe(204);

    const off = await owner.post(`/api/locations/${site.id}/deactivate`, { expectedVersion: site.version });
    expect(off.statusCode).toBe(204);
    expect(await byCode(owner, 'NORX')).toMatchObject({ active: false });
    // Pierde el contexto, no la puede elegir y ya no aparece entre sus sedes.
    expect((await client.get('/api/me')).json()).toMatchObject({ context: null, permissions: [] });
    const again = await client.post('/api/context', { organizationId: orgA.id, locationId: site.id });
    expect(again.statusCode).toBe(403);
    expect(again.json()).toEqual({ code: 'location_inactive' });
    const choices = (await client.get('/api/me/locations')).json<{ locations: { code: string }[] }[]>();
    expect(choices.flatMap((c) => c.locations.map((l) => l.code))).toEqual(['ORA1']);
    // No se invita a una sede inactiva.
    const invite = await owner.post('/api/invitations', { email: 'sede.inactiva@example.test', name: 'X', roles: ['proveedor'], locationIds: [site.id] });
    expect(invite.json()).toEqual({ code: 'location_inactive' });
    // Desactivar de nuevo: 409.
    site = await byCode(owner, 'NORX');
    expect((await owner.post(`/api/locations/${site.id}/deactivate`, { expectedVersion: site.version })).json()).toEqual({ code: 'location_already_inactive' });

    expect((await owner.post(`/api/locations/${site.id}/activate`, { expectedVersion: site.version })).statusCode).toBe(204);
    expect((await client.post('/api/context', { organizationId: orgA.id, locationId: site.id })).statusCode).toBe(204);
    expect(await readAudit("action in ('location.deactivated', 'location.activated') and entity_id = $1", [site.id])).toHaveLength(2);
  });

  it('no se desactiva la única sede activa', async () => {
    // Organización B: ORB1 y la NOR7 creada arriba. Se deja solo ORB1 (donde
    // trabaja su Propietario) y después se restaura.
    const rows = (await list(surOwner)).filter((r) => r.active);
    const keep = rows.find((r) => r.code === 'ORB1');
    const rest = rows.filter((r) => r !== keep);
    if (!keep) throw new Error('sin ORB1');
    for (const r of rest) expect((await surOwner.post(`/api/locations/${r.id}/deactivate`, { expectedVersion: r.version })).statusCode).toBe(204);
    const last = await surOwner.post(`/api/locations/${keep.id}/deactivate`, { expectedVersion: keep.version });
    expect(last.statusCode).toBe(409);
    expect(last.json()).toEqual({ code: 'last_active_location' });
    for (const r of rest) expect((await surOwner.post(`/api/locations/${r.id}/activate`, { expectedVersion: r.version + 1 })).statusCode).toBe(204);
  });
});
