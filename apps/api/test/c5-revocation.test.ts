import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Client,
  createStaff,
  membershipIdOf,
  NORTE,
  selectContext,
  signedInWithContext,
  signIn,
  startApp,
  SUR,
  type TestApp,
} from './support.ts';

// Criterio 5 (T-002), sin la parte de WebSocket (llega con T-009): desactivar
// a un usuario o quitarle la membresía invalida sus sesiones.

const sessionsOf = async (app: TestApp, userId: string) =>
  (
    await app.pool.query<{ n: number }>('select count(*)::int as n from auth.session where user_id = $1', [userId])
  ).rows[0]?.n;

describe('criterio 5: revocación', () => {
  let app: TestApp;
  let admin: Client;

  beforeAll(async () => {
    app = await startApp();
    const adminStaff = await createStaff(app, 'rev-admin', [{ org: NORTE, location: null, role: 'administrador' }]);
    admin = await signedInWithContext(app, adminStaff, NORTE, 0, { mfa: true });
  });
  afterAll(async () => {
    await app.close();
  });

  it('desactivar la cuenta: 401 en la siguiente petición, sin sesiones y sin poder volver a entrar', async () => {
    const staff = await createStaff(app, 'rev-cuenta', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const client = await signedInWithContext(app, staff, NORTE);
    expect((await client.get('/me')).statusCode).toBe(200);

    await app.services.memberships.deactivateUser(staff.userId, 'Prueba de revocación');

    expect((await client.get('/me')).statusCode).toBe(401);
    expect(await sessionsOf(app, staff.userId)).toBe(0);
    const again = new Client(app);
    expect((await signIn(again, staff)).statusCode).toBeGreaterThanOrEqual(400);
    expect((await again.get('/me')).statusCode).toBe(401);
  });

  it('quitar la membresía: su sesión en esa organización se borra; la de la otra sigue', async () => {
    const staff = await createStaff(app, 'rev-membresia', [
      { org: NORTE, location: 0, role: 'recepcion' },
      { org: SUR, location: 0, role: 'recepcion' },
    ]);
    const inNorte = await signedInWithContext(app, staff, NORTE);
    const inSur = await signedInWithContext(app, staff, SUR);

    const membershipId = await membershipIdOf(app, NORTE, staff.userId);
    const response = await admin.post(`/memberships/${membershipId}/deactivate`, { reason: 'Ya no trabaja en Norte' });
    expect(response.statusCode).toBe(204);

    expect((await inNorte.get('/me')).statusCode).toBe(401);
    expect((await inSur.get('/me')).statusCode).toBe(200);
    expect(await sessionsOf(app, staff.userId)).toBe(1);

    // Puede volver a entrar, pero ya no puede elegir Norte.
    const again = new Client(app);
    await signIn(again, staff);
    expect((await selectContext(again, NORTE)).statusCode).toBe(403);
    expect((await selectContext(again, SUR)).statusCode).toBe(204);
  });

  it('una sesión sin contexto también pierde la organización quitada en la siguiente petición', async () => {
    const staff = await createStaff(app, 'rev-sin-contexto', [
      { org: NORTE, location: 0, role: 'recepcion' },
      { org: SUR, location: 0, role: 'recepcion' },
    ]);
    const client = new Client(app);
    await signIn(client, staff);
    const membershipId = await membershipIdOf(app, NORTE, staff.userId);
    await admin.post(`/memberships/${membershipId}/deactivate`, { reason: 'Prueba' });
    expect((await selectContext(client, NORTE)).statusCode).toBe(403);
  });

  it('si no le queda ninguna membresía activa, se borran todas sus sesiones', async () => {
    const staff = await createStaff(app, 'rev-ultima', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const withContext = await signedInWithContext(app, staff, NORTE);
    const withoutContext = new Client(app);
    await signIn(withoutContext, staff);

    const membershipId = await membershipIdOf(app, NORTE, staff.userId);
    await admin.post(`/memberships/${membershipId}/deactivate`, { reason: 'Baja' });

    expect(await sessionsOf(app, staff.userId)).toBe(0);
    expect((await withContext.get('/me')).statusCode).toBe(401);
    expect((await withoutContext.get('/me')).statusCode).toBe(401);
  });

  it('quitar una membresía exige motivo', async () => {
    const staff = await createStaff(app, 'rev-motivo', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const membershipId = await membershipIdOf(app, NORTE, staff.userId);
    expect((await admin.post(`/memberships/${membershipId}/deactivate`, {})).statusCode).toBe(400);
    expect((await admin.post(`/memberships/${membershipId}/deactivate`, { reason: '   ' })).statusCode).toBe(400);
  });
});
