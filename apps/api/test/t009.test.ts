import { createTenantDb, membershipRoles, notifications, notifyRealtime } from '@clinic/db';
import { eq } from 'drizzle-orm';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SOCKET_PATH } from '../src/realtime.ts';
import {
  Client,
  createStaff,
  deactivateVia,
  membershipIdOf,
  NORTE,
  signedInWithContext,
  startApp,
  SUR,
  type TestApp,
} from './support.ts';

// T-009: tiempo real y centro de notificaciones.
//  - Un socket de A no recibe eventos de B (salas por organización y sede).
//  - Un usuario revocado queda desconectado en menos de 1 s; la revalidación
//    periódica cubre lo que no avisa el canal, sin renovar la sesión.
//  - Sin la conexión LISTEN no se aceptan sockets.
//  - Cada persona ve y marca solo sus avisos.

const ORIGIN = 'http://localhost:3000';

interface Connection {
  socket: Socket;
  events: { name: string; payload: unknown }[];
  ended: Promise<{ reason: string; at: number }>;
}

async function listen(app: TestApp): Promise<string> {
  await app.app.listen(0, '127.0.0.1');
  const { port } = app.app.getHttpServer().address() as AddressInfo;
  return `http://127.0.0.1:${String(port)}`;
}

/** Conecta un socket con las cookies del cliente. Rechaza con el código del servidor. */
function connect(url: string, client: Client | null, origin = ORIGIN): Promise<Connection> {
  const socket = io(url, {
    path: SOCKET_PATH,
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    extraHeaders: { origin, ...(client ? { cookie: client.cookieHeader } : {}) },
  });
  const events: Connection['events'] = [];
  socket.onAny((name: string, payload: unknown) => {
    events.push({ name, payload });
  });
  const ended = new Promise<{ reason: string; at: number }>((resolve) => {
    socket.on('ended', (payload: { reason: string }) => {
      resolve({ reason: payload.reason, at: Date.now() });
    });
  });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => {
      resolve({ socket, events, ended });
    });
    socket.once('connect_error', (error) => {
      socket.close();
      reject(error);
    });
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

describe('T-009 tiempo real', () => {
  let app: TestApp;
  let url: string;
  let admin: Client;
  const open: Socket[] = [];
  const track = (c: Connection) => {
    open.push(c.socket);
    return c;
  };

  beforeAll(async () => {
    app = await startApp();
    url = await listen(app);
    const adminStaff = await createStaff(app, 'rt-admin', [{ org: NORTE, location: null, role: 'administrador' }]);
    admin = await signedInWithContext(app, adminStaff, NORTE, 0, { mfa: true });
  });
  afterAll(async () => {
    for (const socket of open) socket.close();
    await app.close();
  });

  const publish = (orgId: string, message: Parameters<typeof notifyRealtime>[1]) =>
    createTenantDb(app.pool).withTenant(orgId, (tx) => notifyRealtime(tx, message));

  it('un socket de A no recibe los eventos de B, ni los de otra sede ni los avisos de otra persona', async () => {
    const norte = await createStaff(app, 'rt-norte', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const otro = await createStaff(app, 'rt-norte-2', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const sur = await createStaff(app, 'rt-sur', [{ org: SUR, location: 0, role: 'recepcion' }]);
    const a = track(await connect(url, await signedInWithContext(app, norte, NORTE)));
    const b = track(await connect(url, await signedInWithContext(app, sur, SUR)));

    const ids = { encounter: uuidv7() };
    await publish(SUR.id, { t: 'event', org: SUR.id, loc: SUR.locations[0].id, name: 'encounter.changed', ids });
    await publish(NORTE.id, { t: 'event', org: NORTE.id, loc: NORTE.locations[1].id, name: 'encounter.changed', ids });
    await publish(NORTE.id, { t: 'notifications', org: NORTE.id, user: otro.userId });
    await publish(SUR.id, { t: 'notifications', org: SUR.id, user: norte.userId });
    await publish(NORTE.id, { t: 'event', org: NORTE.id, loc: NORTE.locations[0].id, name: 'encounter.changed', ids });
    await publish(NORTE.id, { t: 'notifications', org: NORTE.id, user: norte.userId });
    await settle();

    expect(a.events).toEqual([
      { name: 'event', payload: { name: 'encounter.changed', ids } },
      { name: 'notifications', payload: undefined },
    ]);
    expect(b.events).toEqual([{ name: 'event', payload: { name: 'encounter.changed', ids } }]);
  });

  it('rechaza sin sesión, desde otro origen y sin sede activa', async () => {
    await expect(connect(url, null)).rejects.toThrow('unauthenticated');
    const staff = await createStaff(app, 'rt-rechazo', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const client = await signedInWithContext(app, staff, NORTE);
    await expect(connect(url, client, 'http://intruso.example.test')).rejects.toThrow('forbidden_origin');
    const sinContexto = new Client(app);
    await sinContexto.post('/api/auth/sign-in/email', { email: staff.email, password: staff.password });
    await expect(connect(url, sinContexto)).rejects.toThrow('no_active_context');
  });

  it('desactivar a un usuario cierra su socket en menos de 1 segundo', async () => {
    const staff = await createStaff(app, 'rt-cuenta', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const c = track(await connect(url, await signedInWithContext(app, staff, NORTE)));
    const start = Date.now();
    await app.services.memberships.deactivateUser(staff.userId, 'Prueba de revocación');
    const ended = await c.ended;
    expect(ended.reason).toBe('session_ended');
    expect(ended.at - start).toBeLessThan(1000);
    await expect.poll(() => c.socket.connected).toBe(false);
  });

  it('quitar la membresía cierra el socket de esa organización; el de la otra sigue', async () => {
    const staff = await createStaff(app, 'rt-membresia', [
      { org: NORTE, location: 0, role: 'recepcion' },
      { org: SUR, location: 0, role: 'recepcion' },
    ]);
    const inNorte = track(await connect(url, await signedInWithContext(app, staff, NORTE)));
    const inSur = track(await connect(url, await signedInWithContext(app, staff, SUR)));
    const start = Date.now();
    const response = await deactivateVia(admin, app, NORTE, await membershipIdOf(app, NORTE, staff.userId), 'Ya no trabaja en Norte');
    expect(response.statusCode).toBe(204);
    const ended = await inNorte.ended;
    expect(ended.reason).toBe('session_ended');
    expect(ended.at - start).toBeLessThan(1000);
    await settle();
    expect(inSur.socket.connected).toBe(true);
  });

  it('cerrar sesión cierra el socket de esa sesión', async () => {
    const staff = await createStaff(app, 'rt-salir', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const client = await signedInWithContext(app, staff, NORTE);
    const c = track(await connect(url, client));
    expect((await client.post('/api/auth/sign-out', {})).statusCode).toBe(200);
    expect((await c.ended).reason).toBe('session_ended');
  });

  it('quitarle la sede activa al cambiar sus roles revalida su socket al instante', async () => {
    const staff = await createStaff(app, 'rt-roles', [
      { org: NORTE, location: 0, role: 'recepcion' },
      { org: NORTE, location: 1, role: 'recepcion' },
    ]);
    const c = track(await connect(url, await signedInWithContext(app, staff, NORTE, 0)));
    const membershipId = await membershipIdOf(app, NORTE, staff.userId);
    const users = (await admin.get('/api/users')).json<{ rows: { membershipId?: string; version?: number }[] }>();
    const version = users.rows.find((r) => r.membershipId === membershipId)?.version;
    const response = await admin.post(`/api/memberships/${membershipId}/roles`, {
      roles: [{ role: 'recepcion', locationId: NORTE.locations[1].id }],
      reason: 'Cambio de sede',
      expectedVersion: version,
    });
    expect(response.statusCode).toBe(204);
    expect((await c.ended).reason).toBe('context_changed');
  });

  it('sin la conexión LISTEN cierra los sockets y no acepta nuevos hasta recuperarla', async () => {
    const staff = await createStaff(app, 'rt-listen', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const client = await signedInWithContext(app, staff, NORTE);
    const c = track(await connect(url, client));
    const pid = app.realtime.listenerPid;
    expect(pid).not.toBeNull();
    await app.pool.query('select pg_terminate_backend($1)', [pid]);
    expect((await c.ended).reason).toBe('realtime_unavailable');
    expect(app.realtime.available).toBe(false);
    await expect(connect(url, client)).rejects.toThrow('realtime_unavailable');
    // Se recupera sola (primer reintento a 1 s).
    await expect.poll(() => app.realtime.available, { timeout: 10_000 }).toBe(true);
    track(await connect(url, client));
  });
});

describe('T-009 revalidación periódica', () => {
  let app: TestApp;
  let url: string;

  beforeAll(async () => {
    // Revalida cada segundo; updateAge de la sesión = 2 s (inactividad de 4 s).
    app = await startApp({ realtimeRevalidateSeconds: 1, idleTimeoutSeconds: 4 });
    url = await listen(app);
  });
  afterAll(async () => {
    await app.close();
  });

  const expiresAt = async (userId: string) =>
    (await app.pool.query<{ expires_at: Date }>('select expires_at from auth.session where user_id = $1', [userId])).rows[0]?.expires_at.getTime();

  it('cierra el socket aunque no llegue ningún aviso', async () => {
    const staff = await createStaff(app, 'rt-periodica', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const membershipId = await membershipIdOf(app, NORTE, staff.userId);
    const c = await connect(url, await signedInWithContext(app, staff, NORTE));
    try {
      // Sin aviso: se le quita el rol directamente en la base de datos.
      await createTenantDb(app.pool).withTenant(NORTE.id, (tx) => tx.delete(membershipRoles).where(eq(membershipRoles.membershipId, membershipId)));
      const start = Date.now();
      expect((await c.ended).reason).toBe('context_changed');
      expect(Date.now() - start).toBeLessThan(2500);
    } finally {
      c.socket.close();
    }
  });

  it('revalidar no renueva la sesión (el cierre por inactividad sigue valiendo)', async () => {
    const staff = await createStaff(app, 'rt-sin-renovar', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const client = await signedInWithContext(app, staff, NORTE);
    const c = await connect(url, client);
    try {
      const before = await expiresAt(staff.userId);
      // Pasa updateAge y la revalidación periódica corre varias veces.
      await new Promise((resolve) => setTimeout(resolve, 3500));
      expect(c.socket.connected).toBe(true);
      expect(await expiresAt(staff.userId)).toBe(before);
      // Una petición de la persona sí la renueva.
      expect((await client.get('/api/me')).statusCode).toBe(200);
      expect(await expiresAt(staff.userId)).toBeGreaterThan(before ?? 0);
    } finally {
      c.socket.close();
    }
  });

});

describe('T-009 centro de notificaciones', () => {
  let app: TestApp;
  let url: string;

  beforeAll(async () => {
    app = await startApp();
    url = await listen(app);
  });
  afterAll(async () => {
    await app.close();
  });

  const insert = (orgId: string, userId: string, values: Partial<typeof notifications.$inferInsert> = {}) =>
    createTenantDb(app.pool).withTenant(orgId, async (tx) => {
      const id = uuidv7();
      await tx.insert(notifications).values({ id, organizationId: orgId, userId, kind: 'appointment.changed', code: 'NOR1-C-000001', eventId: uuidv7(), ...values });
      return id;
    });

  interface List {
    rows: { id: string; kind: string; code: string | null; read: boolean }[];
    unread: number;
  }

  it('cada persona ve solo sus avisos de la organización activa, de los últimos 30 días', async () => {
    const staff = await createStaff(app, 'nt-lista', [
      { org: NORTE, location: 0, role: 'proveedor' },
      { org: SUR, location: 0, role: 'proveedor' },
    ]);
    const otra = await createStaff(app, 'nt-otra', [{ org: NORTE, location: 0, role: 'proveedor' }]);
    const mine = await insert(NORTE.id, staff.userId, { code: 'NOR1-C-000010' });
    await insert(NORTE.id, otra.userId);
    await insert(SUR.id, staff.userId, { code: 'SUR1-C-000010' });
    await insert(NORTE.id, staff.userId, { createdAt: new Date(Date.now() - 31 * 86_400_000) });
    await insert(NORTE.id, staff.userId, { dismissedAt: new Date() });

    const client = await signedInWithContext(app, staff, NORTE);
    const response = await client.get('/api/notifications');
    expect(response.statusCode).toBe(200);
    const list = response.json<List>();
    expect(list.rows).toEqual([expect.objectContaining({ id: mine, kind: 'appointment.changed', code: 'NOR1-C-000010', read: false })]);
    expect(list.unread).toBe(1);
    expect(JSON.stringify(list)).not.toMatch(/Persona|example\.test/);

    const inSur = await signedInWithContext(app, staff, SUR);
    expect((await inSur.get('/api/notifications')).json<List>().rows.map((r) => r.code)).toEqual(['SUR1-C-000010']);
    expect((await new Client(app).get('/api/notifications')).statusCode).toBe(401);
  });

  it('marcar como leído, todo como leído y «Borrar»; los avisos de otra persona dan 404', async () => {
    const staff = await createStaff(app, 'nt-marcar', [{ org: NORTE, location: 0, role: 'proveedor' }]);
    const otra = await createStaff(app, 'nt-marcar-otra', [{ org: NORTE, location: 0, role: 'proveedor' }]);
    const first = await insert(NORTE.id, staff.userId);
    await insert(NORTE.id, staff.userId);
    const ajena = await insert(NORTE.id, otra.userId);
    const client = await signedInWithContext(app, staff, NORTE);

    expect((await client.post(`/api/notifications/${ajena}/read`)).statusCode).toBe(404);
    expect((await client.post('/api/notifications/no-es-un-id/read')).statusCode).toBe(400);
    expect((await client.post(`/api/notifications/${first}/read`)).statusCode).toBe(204);
    let list = (await client.get('/api/notifications')).json<List>();
    expect(list.unread).toBe(1);
    expect(list.rows.find((r) => r.id === first)?.read).toBe(true);

    expect((await client.post('/api/notifications/read-all')).statusCode).toBe(204);
    expect((await client.get('/api/notifications')).json<List>().unread).toBe(0);

    expect((await client.post('/api/notifications/clear')).statusCode).toBe(204);
    list = (await client.get('/api/notifications')).json<List>();
    expect(list).toEqual({ rows: [], unread: 0 });
    // La de la otra persona sigue intacta.
    const otraClient = await signedInWithContext(app, otra, NORTE);
    expect((await otraClient.get('/api/notifications')).json<List>().rows.map((r) => r.id)).toEqual([ajena]);
    // «Borrar» oculta, no borra: la fila sigue hasta la purga de 30 días.
    const rows = await createTenantDb(app.pool).withTenant(NORTE.id, (tx) => tx.select().from(notifications).where(eq(notifications.id, first)));
    expect(rows[0]?.dismissedAt).not.toBeNull();
  });

  it('marcar como leído avisa a los demás sockets de la persona', async () => {
    const staff = await createStaff(app, 'nt-pestanas', [{ org: NORTE, location: 0, role: 'proveedor' }]);
    const id = await insert(NORTE.id, staff.userId);
    const tab = await signedInWithContext(app, staff, NORTE);
    const c = await connect(url, tab);
    try {
      expect((await tab.post(`/api/notifications/${id}/read`)).statusCode).toBe(204);
      await expect.poll(() => c.events.map((e) => e.name)).toEqual(['notifications']);
    } finally {
      c.socket.close();
    }
  });
});
