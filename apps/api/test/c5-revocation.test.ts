import type { AddressInfo } from 'node:net';
import { createTenantDb, memberships } from '@clinic/db';
import { eq } from 'drizzle-orm';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Client,
  createStaff,
  enrollTotp,
  NORTE,
  selectContext,
  signIn,
  startApp,
  SUR,
  type TestApp,
} from './support.ts';

// Criterio 5: al desactivar a un usuario o quitarle una membresía, sus
// sesiones dejan de valer en menos de 1 minuto y su WebSocket se cierra.

const LIMIT_MS = 60_000;

describe('criterio 5: revocación', () => {
  let app: TestApp;
  let baseUrl: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    app = await startApp({ socketRevalidateMs: 500 });
    await app.app.listen(0, '127.0.0.1');
    const address = app.app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${String(address.port)}`;
  });
  afterAll(async () => {
    for (const socket of sockets) socket.close();
    await app.close();
  });

  const connect = (client: Client): Promise<Socket> =>
    new Promise((resolve, reject) => {
      const socket = io(baseUrl, {
        transports: ['websocket'],
        extraHeaders: { cookie: client.cookieHeader },
        reconnection: false,
      });
      sockets.push(socket);
      socket.once('connect', () => {
        resolve(socket);
      });
      socket.once('connect_error', reject);
    });

  const disconnected = (socket: Socket): Promise<number> => {
    const start = Date.now();
    return new Promise((resolve) => {
      if (!socket.connected) {
        resolve(0);
        return;
      }
      socket.once('disconnect', () => {
        resolve(Date.now() - start);
      });
    });
  };

  it('sin sesión no se abre el WebSocket', async () => {
    await expect(connect(new Client(app))).rejects.toThrow('unauthorized');
  });

  it('desactivar al usuario: 401 en la siguiente petición y socket cerrado', async () => {
    const staff = await createStaff(app, 'rev-desactivar', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const client = new Client(app);
    await signIn(client, staff);
    await selectContext(client, NORTE);
    const socket = await connect(client);
    const closed = disconnected(socket);

    const start = Date.now();
    await app.services.memberships.deactivateUser(staff.userId);

    const after = await client.get('/patients');
    expect(after.statusCode).toBe(401);
    expect(await closed).toBeLessThan(1_000);
    expect(Date.now() - start).toBeLessThan(LIMIT_MS);

    // No puede volver a iniciar sesión.
    const again = new Client(app);
    expect((await signIn(again, staff)).statusCode).toBeGreaterThanOrEqual(400);
    expect((await again.get('/me')).statusCode).toBe(401);
    const { rows } = await app.pool.query<{ n: number }>(
      'select count(*)::int as n from auth.session where user_id = $1',
      [staff.userId],
    );
    expect(rows[0]?.n).toBe(0);
  });

  it('quitar la membresía: pierde esa organización y su socket de esa organización se cierra', async () => {
    const adminStaff = await createStaff(app, 'rev-admin', [{ org: NORTE, location: null, role: 'administrador' }]);
    const admin = new Client(app);
    await signIn(admin, adminStaff);
    await enrollTotp(admin, adminStaff);
    await selectContext(admin, NORTE);

    const staff = await createStaff(app, 'rev-membresia', [
      { org: NORTE, location: 0, role: 'recepcion' },
      { org: SUR, location: 0, role: 'recepcion' },
    ]);
    const inNorte = new Client(app);
    await signIn(inNorte, staff);
    await selectContext(inNorte, NORTE);
    const inSur = new Client(app);
    await signIn(inSur, staff);
    await selectContext(inSur, SUR);
    const norteSocket = await connect(inNorte);
    const surSocket = await connect(inSur);
    const norteClosed = disconnected(norteSocket);

    const membershipId = await createTenantDb(app.pool).withTenant(NORTE.id, (tx) =>
      tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(eq(memberships.userId, staff.userId))
        .then((r) => r[0]?.id),
    );
    if (!membershipId) throw new Error('sin membresía');

    expect((await admin.post(`/memberships/${membershipId}/remove`)).statusCode).toBe(204);

    // La sesión en Norte ya no tiene contexto válido.
    expect((await inNorte.get('/patients')).statusCode).toBe(403);
    expect((await inNorte.get('/me')).json<{ context: unknown }>().context).toBeNull();
    expect(await norteClosed).toBeLessThan(1_000);
    // Sur sigue funcionando.
    expect((await inSur.get('/patients')).statusCode).toBe(200);
    expect(surSocket.connected).toBe(true);
  });

  it('respaldo: un socket se cierra en la revalidación periódica aunque no llegue el evento', async () => {
    const staff = await createStaff(app, 'rev-respaldo', [{ org: SUR, location: 1, role: 'enfermeria' }]);
    const client = new Client(app);
    await signIn(client, staff);
    await selectContext(client, SUR, 1);
    const socket = await connect(client);
    const closed = disconnected(socket);
    // Borrado directo, como si otro proceso hubiera revocado (sin evento en este bus).
    await app.pool.query('delete from auth.session where user_id = $1', [staff.userId]);
    // socketRevalidateMs = 500 en esta prueba; 30 s por defecto.
    expect(await closed).toBeLessThan(2_000);
  });
});
