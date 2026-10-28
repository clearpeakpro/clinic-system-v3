import { createTenantDb, invitations, membershipRoles, memberships } from '@clinic/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  Client,
  createStaff,
  enrollTotp,
  NORTE,
  selectContext,
  signIn,
  lastInvitationLink,
  startApp,
  SUR,
  type TestApp,
} from './support.ts';

// Criterio 1 (T-002): invitaciones propias (sin el plugin de organizaciones). El
// enlace sirve una sola vez, expira y al aceptarlo se crea la fila en
// NUESTRA memberships con el rol y la sede indicados.

interface Link {
  organizationId: string;
  token: string;
}

function parseLink(text: string): Link {
  const url = new URL(text);
  const organizationId = url.searchParams.get('org');
  const token = url.searchParams.get('token');
  if (!organizationId || !token) throw new Error('enlace sin org o token');
  return { organizationId, token };
}

describe('criterio 1: invitaciones', () => {
  let app: TestApp;
  let admin: Client;

  beforeAll(async () => {
    app = await startApp({ invitationTtlSeconds: 60 * 60 });
    const staff = await createStaff(app, 'inv-admin', [{ org: NORTE, location: null, role: 'administrador' }]);
    admin = new Client(app);
    await signIn(admin, staff);
    await enrollTotp(admin, staff);
    expect((await selectContext(admin, NORTE)).statusCode).toBe(204);
  });
  afterAll(async () => {
    await app.close();
  });

  const invite = async (email: string, role = 'recepcion', location: 0 | 1 = 1) => {
    const response = await admin.post('/api/invitations', {
      email,
      role,
      locationId: NORTE.locations[location].id,
    });
    expect(response.statusCode).toBe(201);
    expect(app.mailer.sent.at(-1)?.to).toBe(email);
    return parseLink(lastInvitationLink(app, email).toString());
  };

  const membershipOf = async (userId: string) =>
    createTenantDb(app.pool).withTenant(NORTE.id, (tx) =>
      tx
        .select({ role: membershipRoles.role, locationId: membershipRoles.locationId, status: memberships.status })
        .from(memberships)
        .innerJoin(
          membershipRoles,
          and(eq(membershipRoles.membershipId, memberships.id), eq(membershipRoles.organizationId, memberships.organizationId)),
        )
        .where(eq(memberships.userId, userId)),
    );

  it('una persona nueva acepta y se crea su membresía con el rol y la sede', async () => {
    const email = 'nueva.recepcion@example.test';
    const link = await invite(email);
    const guest = new Client(app);
    const accepted = await guest.post('/api/invitations/accept', { ...link, name: 'Persona Nueva', password: 'Ficticia-clave-123' });
    expect(accepted.statusCode).toBe(201);

    const { rows } = await app.pool.query<{ id: string }>('select id from auth."user" where email = $1', [email]);
    const userId = rows[0]?.id;
    if (!userId) throw new Error('usuario no creado');
    expect(await membershipOf(userId)).toEqual([
      { role: 'recepcion', locationId: NORTE.locations[1].id, status: 'active' },
    ]);
    // Y puede iniciar sesión y trabajar en esa sede.
    const client = new Client(app);
    expect((await signIn(client, { userId, email, password: 'Ficticia-clave-123' })).statusCode).toBe(200);
    expect((await selectContext(client, NORTE, 1)).statusCode).toBe(204);
    expect((await selectContext(client, NORTE, 0)).statusCode).toBe(403);
  });

  it('una persona con cuenta (de Sur) acepta con su sesión', async () => {
    const existing = await createStaff(app, 'inv-existente', [{ org: SUR, location: 0, role: 'enfermeria' }]);
    const link = await invite(existing.email, 'enfermeria', 0);
    const client = new Client(app);
    await signIn(client, existing);
    expect((await client.post('/api/invitations/accept', link)).statusCode).toBe(201);
    expect(await membershipOf(existing.userId)).toEqual([
      { role: 'enfermeria', locationId: NORTE.locations[0].id, status: 'active' },
    ]);
  });

  it('un enlace usado se rechaza', async () => {
    const link = await invite('dos.veces@example.test');
    const first = await new Client(app).post('/api/invitations/accept', { ...link, name: 'Una', password: 'Ficticia-clave-123' });
    expect(first.statusCode).toBe(201);
    const second = await new Client(app).post('/api/invitations/accept', { ...link, name: 'Otra', password: 'Ficticia-clave-456' });
    expect(second.statusCode).toBe(410);
    expect(second.json()).toEqual({ code: 'invitation_used' });
  });

  it('un enlace vencido se rechaza', async () => {
    const link = await invite('vencida@example.test');
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 2 * 60 * 60 * 1000 });
    try {
      const response = await new Client(app).post('/api/invitations/accept', { ...link, name: 'Tarde', password: 'Ficticia-clave-123' });
      expect(response.statusCode).toBe(410);
      expect(response.json()).toEqual({ code: 'invitation_expired' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('un enlace alterado se rechaza (token u organización)', async () => {
    const link = await invite('alterada@example.test');
    const flipped = `${link.token.slice(0, -1)}${link.token.endsWith('A') ? 'B' : 'A'}`;
    const badToken = await new Client(app).post('/api/invitations/accept', { ...link, token: flipped, name: 'X', password: 'Ficticia-clave-123' });
    expect(badToken.statusCode).toBe(404);
    const otherOrg = await new Client(app).post('/api/invitations/accept', { ...link, organizationId: SUR.id, name: 'X', password: 'Ficticia-clave-123' });
    expect(otherOrg.statusCode).toBe(404);
    // La invitación original sigue sin usar.
    const pending = await createTenantDb(app.pool).withTenant(NORTE.id, (tx) =>
      tx.select({ acceptedAt: invitations.acceptedAt }).from(invitations).where(eq(invitations.email, 'alterada@example.test')),
    );
    expect(pending).toEqual([{ acceptedAt: null }]);
  });

  it('con sesión de otra persona (otro correo) se rechaza', async () => {
    const link = await invite('destinataria@example.test');
    const other = await createStaff(app, 'inv-otra', [{ org: SUR, location: 0, role: 'recepcion' }]);
    const client = new Client(app);
    await signIn(client, other);
    expect((await client.post('/api/invitations/accept', link)).statusCode).toBe(403);
  });

  it('el token no se guarda en claro', async () => {
    const link = await invite('hash@example.test');
    const rows = await createTenantDb(app.pool).withTenant(NORTE.id, (tx) =>
      tx.select({ tokenHash: invitations.tokenHash }).from(invitations).where(eq(invitations.email, 'hash@example.test')),
    );
    expect(rows[0]?.tokenHash).not.toBe(link.token);
    expect(rows[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('Recepción no puede invitar', async () => {
    const staff = await createStaff(app, 'inv-recepcion', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const client = new Client(app);
    await signIn(client, staff);
    await selectContext(client, NORTE);
    const response = await client.post('/api/invitations', { email: 'x@example.test', role: 'recepcion', locationId: NORTE.locations[0].id });
    expect(response.statusCode).toBe(403);
  });
});
