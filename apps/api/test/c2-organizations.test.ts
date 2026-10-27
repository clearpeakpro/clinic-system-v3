import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createStaff, NORTE, selectContext, signIn, startApp, SUR, type Staff, type TestApp } from './support.ts';

// Criterio 2: el usuario de dos organizaciones elige organización y sede; el
// servidor deriva el contexto de la sesión y de memberships.

describe('criterio 2: organizaciones', () => {
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

  it('ve sus dos organizaciones y cambia de una a otra', async () => {
    const client = new Client(app);
    await signIn(client, multi);
    expect((await client.get('/me')).json<{ organizations: string[] }>().organizations).toEqual(
      [NORTE.id, SUR.id].sort(),
    );

    expect((await selectContext(client, NORTE, 0)).statusCode).toBe(204);
    expect((await client.get('/patients')).json<{ organizationIds: string[] }>().organizationIds).toEqual([NORTE.id]);

    expect((await selectContext(client, SUR, 1)).statusCode).toBe(204);
    expect((await client.get('/patients')).json<{ organizationIds: string[] }>().organizationIds).toEqual([SUR.id]);
  });

  it('sin contexto elegido no hay acceso a datos', async () => {
    const client = new Client(app);
    await signIn(client, multi);
    expect((await client.get('/patients')).statusCode).toBe(403);
  });

  it('una organización ajena o una sede sin rol responde 403', async () => {
    const onlyNorte = await createStaff(app, 'org-solo-norte', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const client = new Client(app);
    await signIn(client, onlyNorte);
    expect((await selectContext(client, SUR, 0)).statusCode).toBe(403);
    expect((await selectContext(client, NORTE, 1)).statusCode).toBe(403);
    // Una sede de Sur con el id de organización de Norte tampoco.
    const mixed = await client.post('/context', { organizationId: NORTE.id, locationId: SUR.locations[0].id });
    expect(mixed.statusCode).toBe(403);
  });

  it('los encabezados del cliente no cambian el contexto', async () => {
    const onlyNorte = await createStaff(app, 'org-encabezado', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const client = new Client(app);
    await signIn(client, onlyNorte);
    await selectContext(client, NORTE, 0);
    const response = await client.get('/patients', {
      'x-org-id': SUR.id,
      'x-organization-id': SUR.id,
      'x-location-id': SUR.locations[0].id,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ organizationIds: string[] }>().organizationIds).toEqual([NORTE.id]);
  });

  it('el cliente no puede fijar el contexto con los endpoints de Better Auth', async () => {
    const onlyNorte = await createStaff(app, 'org-update-session', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const client = new Client(app);
    await signIn(client, onlyNorte);
    // Los campos son input: false: Better Auth los ignora o rechaza.
    await client.post('/api/auth/update-user', { activeOrganizationId: SUR.id });
    await client.post('/api/auth/update-session', { activeOrganizationId: SUR.id, activeLocationId: SUR.locations[0].id });
    expect((await client.get('/me')).json<{ context: unknown }>().context).toBeNull();
    expect((await client.get('/patients')).statusCode).toBe(403);
  });
});
