import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createStaff, NORTE, selectContext, signIn, startApp, SUR, type Staff, type TestApp } from './support.ts';

// Criterio 2 (T-002): el usuario de dos organizaciones elige organización y
// sede; el servidor deriva el contexto de la sesión y de memberships.

interface Me {
  context: { organizationId: string; locationId: string } | null;
}

interface Choice {
  organizationId: string;
  organizationName: string;
  locations: { id: string; code: string }[];
}

describe('criterio 2: organizaciones y contexto', () => {
  let app: TestApp;
  let multi: Staff;

  beforeAll(async () => {
    app = await startApp();
    multi = await createStaff(app, 'org-multi', [
      { org: NORTE, location: 0, role: 'recepcion' },
      { org: SUR, location: 1, role: 'enfermeria' },
    ]);
  });
  afterAll(async () => {
    await app.close();
  });

  it('ve solo las organizaciones y sedes donde tiene rol', async () => {
    const client = new Client(app);
    await signIn(client, multi);
    const choices = (await client.get('/api/me/locations')).json<Choice[]>();
    expect(choices.map((c) => [c.organizationName, c.locations.map((l) => l.id)])).toEqual(
      [
        [NORTE.name, [NORTE.locations[0].id]],
        [SUR.name, [SUR.locations[1].id]],
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
  });

  it('cambia de una organización a otra', async () => {
    const client = new Client(app);
    await signIn(client, multi);
    expect((await client.get('/api/me')).json<Me>().context).toBeNull();

    expect((await selectContext(client, NORTE, 0)).statusCode).toBe(204);
    expect((await client.get('/api/me')).json<Me>().context).toEqual({
      organizationId: NORTE.id,
      locationId: NORTE.locations[0].id,
    });

    expect((await selectContext(client, SUR, 1)).statusCode).toBe(204);
    expect((await client.get('/api/me')).json<Me>().context).toEqual({
      organizationId: SUR.id,
      locationId: SUR.locations[1].id,
    });
  });

  it('una organización ajena o una sede sin rol responde 403', async () => {
    const onlyNorte = await createStaff(app, 'org-solo-norte', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const client = new Client(app);
    await signIn(client, onlyNorte);
    expect((await selectContext(client, SUR, 0)).statusCode).toBe(403);
    expect((await selectContext(client, NORTE, 1)).statusCode).toBe(403);
    // Una sede de Sur con el id de organización de Norte tampoco.
    const mixed = await client.post('/api/context', { organizationId: NORTE.id, locationId: SUR.locations[0].id });
    expect(mixed.statusCode).toBe(403);
    expect((await client.get('/api/me')).json<Me>().context).toBeNull();
  });

  it('los encabezados del cliente no cambian el contexto', async () => {
    const onlyNorte = await createStaff(app, 'org-encabezado', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const client = new Client(app);
    await signIn(client, onlyNorte);
    await selectContext(client, NORTE, 0);
    const response = await client.get('/api/me', {
      'x-org-id': SUR.id,
      'x-organization-id': SUR.id,
      'x-location-id': SUR.locations[0].id,
    });
    expect(response.json<Me>().context?.organizationId).toBe(NORTE.id);
  });

  it('el cliente no puede fijar el contexto con los endpoints de Better Auth', async () => {
    const onlyNorte = await createStaff(app, 'org-update-session', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const client = new Client(app);
    await signIn(client, onlyNorte);
    // Los campos son input: false: Better Auth los ignora o rechaza.
    await client.post('/api/auth/update-user', { activeOrganizationId: SUR.id });
    await client.post('/api/auth/update-session', { activeOrganizationId: SUR.id, activeLocationId: SUR.locations[0].id });
    expect((await client.get('/api/me')).json<Me>().context).toBeNull();
  });

  it('datos de entrada inválidos responden 400 sin eco', async () => {
    const client = new Client(app);
    await signIn(client, multi);
    const response = await client.post('/api/context', { organizationId: 'no-es-uuid', locationId: '<script>' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'invalid_request' });
  });
});
