import { createTenantDb, invitations, membershipRoles, memberships } from '@clinic/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { decodeInvitationToken } from '../src/invitations.ts';
import {
  Client,
  createStaff,
  enrollTotp,
  lastInvitationLink,
  NORTE,
  readAudit,
  selectContext,
  signIn,
  startApp,
  SUR,
  tokenOf,
  type TestApp,
} from './support.ts';

// Criterio 1 (T-002) y S-ADM-03 / S-ADM-04 / S-GEN-09 (T-006a): invitaciones
// propias. El enlace /invitacion/<token> sirve una sola vez, vence y al
// aceptarlo se crea la membresía con los roles y sedes indicados. El correo es
// el canal principal; la respuesta trae el mismo enlace para el diálogo de un
// solo uso.

interface Created {
  invitationId: string;
  link: string;
  expiresAt: string;
  mailSent: boolean;
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

  const invite = async (email: string, roles = ['recepcion'], locations: (0 | 1)[] = [1]) => {
    const response = await admin.post('/api/invitations', {
      email,
      name: 'Persona Invitada',
      roles,
      locationIds: locations.map((l) => NORTE.locations[l].id),
    });
    expect(response.statusCode).toBe(201);
    const created = response.json<Created>();
    // El mismo enlace va por correo y en la respuesta (diálogo S-ADM-04).
    expect(app.mailer.sent.at(-1)?.to).toBe(email);
    expect(lastInvitationLink(app, email).toString()).toBe(created.link);
    expect(created.mailSent).toBe(true);
    return { ...created, token: tokenOf(created.link) };
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
        .where(eq(memberships.userId, userId))
        .orderBy(membershipRoles.role, membershipRoles.locationId),
    );

  it('el enlace es /invitacion/<token> y el token lleva la organización', async () => {
    const created = await invite('formato@example.test');
    expect(new URL(created.link).pathname).toMatch(/^\/invitacion\/[\w-]+\.[\w-]+$/);
    expect(decodeInvitationToken(created.token)?.organizationId).toBe(NORTE.id);
    expect(Date.parse(created.expiresAt) - Date.now()).toBeGreaterThan(59 * 60 * 1000);
  });

  it('una persona nueva acepta: se crea su membresía con roles y sedes, y entra directamente', async () => {
    const email = 'nueva.recepcion@example.test';
    const { token } = await invite(email, ['recepcion', 'enfermeria'], [0, 1]);
    const guest = new Client(app);
    const accepted = await guest.post('/api/invitations/accept', { token, name: 'Persona Nueva', password: 'Ficticia-clave-123' });
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json()).toMatchObject({ signedIn: true });

    const { rows } = await app.pool.query<{ id: string; name: string }>('select id, name from auth."user" where email = $1', [email]);
    const userId = rows[0]?.id;
    if (!userId) throw new Error('usuario no creado');
    // El nombre es el que eligió la persona (S-GEN-09).
    expect(rows[0]?.name).toBe('Persona Nueva');
    const expected = [
      { role: 'enfermeria', locationId: NORTE.locations[0].id, status: 'active' },
      { role: 'enfermeria', locationId: NORTE.locations[1].id, status: 'active' },
      { role: 'recepcion', locationId: NORTE.locations[0].id, status: 'active' },
      { role: 'recepcion', locationId: NORTE.locations[1].id, status: 'active' },
    ].sort((a, b) => a.role.localeCompare(b.role) || a.locationId.localeCompare(b.locationId));
    expect(await membershipOf(userId)).toEqual(expected);
    // La sesión ya está abierta en el mismo cliente.
    expect((await guest.get('/api/me')).json()).toMatchObject({ userId });
    expect((await selectContext(guest, NORTE, 1)).statusCode).toBe(204);
  });

  it('un Administrador invitado queda en toda la organización', async () => {
    // Solo el Propietario puede invitar Administradores.
    const owner = await createStaff(app, 'inv-prop', [{ org: NORTE, location: null, role: 'propietario' }]);
    const client = new Client(app);
    await signIn(client, owner);
    await enrollTotp(client, owner);
    await selectContext(client, NORTE);
    const response = await client.post('/api/invitations', {
      email: 'nuevo.admin@example.test',
      name: 'Nuevo Admin',
      roles: ['administrador', 'proveedor'],
      locationIds: [NORTE.locations[0].id],
    });
    expect(response.statusCode).toBe(201);
    const accepted = await new Client(app).post('/api/invitations/accept', {
      token: tokenOf(response.json<Created>().link),
      name: 'Nuevo Admin',
      password: 'Ficticia-clave-777',
    });
    expect(accepted.statusCode).toBe(201);
    const { rows } = await app.pool.query<{ id: string }>('select id from auth."user" where email = $1', ['nuevo.admin@example.test']);
    expect(await membershipOf(rows[0]?.id ?? '')).toEqual([
      { role: 'administrador', locationId: null, status: 'active' },
      { role: 'proveedor', locationId: NORTE.locations[0].id, status: 'active' },
    ]);
  });

  it('una persona con cuenta (de Sur) acepta con su sesión', async () => {
    const existing = await createStaff(app, 'inv-existente', [{ org: SUR, location: 0, role: 'enfermeria' }]);
    const { token } = await invite(existing.email, ['enfermeria'], [0]);
    // Sin sesión, la cuenta existente no se pisa.
    const anonymous = await new Client(app).post('/api/invitations/accept', { token, name: 'X', password: 'Ficticia-clave-123' });
    expect(anonymous.statusCode).toBe(409);
    expect(anonymous.json()).toEqual({ code: 'account_exists' });
    const client = new Client(app);
    await signIn(client, existing);
    const accepted = await client.post('/api/invitations/accept', { token });
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json()).toMatchObject({ signedIn: false });
    expect(await membershipOf(existing.userId)).toEqual([
      { role: 'enfermeria', locationId: NORTE.locations[0].id, status: 'active' },
    ]);
  });

  it('un enlace usado se rechaza', async () => {
    const { token } = await invite('dos.veces@example.test');
    const first = await new Client(app).post('/api/invitations/accept', { token, name: 'Una', password: 'Ficticia-clave-123' });
    expect(first.statusCode).toBe(201);
    const second = await new Client(app).post('/api/invitations/accept', { token, name: 'Otra', password: 'Ficticia-clave-456' });
    expect(second.statusCode).toBe(410);
    expect(second.json()).toEqual({ code: 'invitation_used' });
  });

  it('un enlace vencido se rechaza', async () => {
    const { token } = await invite('vencida@example.test');
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 2 * 60 * 60 * 1000 });
    try {
      const response = await new Client(app).post('/api/invitations/accept', { token, name: 'Tarde', password: 'Ficticia-clave-123' });
      expect(response.statusCode).toBe(410);
      expect(response.json()).toEqual({ code: 'invitation_expired' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('un enlace alterado se rechaza (secreto u organización)', async () => {
    const { token } = await invite('alterada@example.test');
    const [org = '', secret = ''] = token.split('.');
    const flipped = `${org}.${secret.slice(0, -1)}${secret.endsWith('A') ? 'B' : 'A'}`;
    const badSecret = await new Client(app).post('/api/invitations/accept', { token: flipped, name: 'X', password: 'Ficticia-clave-123' });
    expect(badSecret.statusCode).toBe(404);
    const surOrg = Buffer.from(SUR.id.replaceAll('-', ''), 'hex').toString('base64url');
    const otherOrg = await new Client(app).post('/api/invitations/accept', { token: `${surOrg}.${secret}`, name: 'X', password: 'Ficticia-clave-123' });
    expect(otherOrg.statusCode).toBe(404);
    const garbage = await new Client(app).post('/api/invitations/accept', { token: 'x'.repeat(40), name: 'X', password: 'Ficticia-clave-123' });
    expect(garbage.statusCode).toBe(404);
    // La invitación original sigue sin usar.
    const pending = await createTenantDb(app.pool).withTenant(NORTE.id, (tx) =>
      tx.select({ acceptedAt: invitations.acceptedAt }).from(invitations).where(eq(invitations.email, 'alterada@example.test')),
    );
    expect(pending).toEqual([{ acceptedAt: null }]);
  });

  it('con sesión de otra persona (otro correo) se rechaza', async () => {
    const { token } = await invite('destinataria@example.test');
    const other = await createStaff(app, 'inv-otra', [{ org: SUR, location: 0, role: 'recepcion' }]);
    const client = new Client(app);
    await signIn(client, other);
    expect((await client.post('/api/invitations/accept', { token })).statusCode).toBe(403);
  });

  it('el secreto no se guarda en claro', async () => {
    const { token } = await invite('hash@example.test');
    const rows = await createTenantDb(app.pool).withTenant(NORTE.id, (tx) =>
      tx.select({ tokenHash: invitations.tokenHash }).from(invitations).where(eq(invitations.email, 'hash@example.test')),
    );
    expect(rows[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]?.tokenHash).not.toContain(token.split('.')[1]);
  });

  it('volver a invitar a alguien aún «Invitado» emite un enlace nuevo y anula el anterior', async () => {
    const first = await invite('reinvitada@example.test');
    const second = await invite('reinvitada@example.test');
    expect(second.token).not.toBe(first.token);
    const old = await new Client(app).post('/api/invitations/accept', { token: first.token, name: 'X', password: 'Ficticia-clave-123' });
    expect(old.statusCode).toBe(410);
    expect(old.json()).toEqual({ code: 'invitation_revoked' });
    const list = (await admin.get('/api/users')).json<{ rows: { kind: string; email: string }[] }>();
    expect(list.rows.filter((r) => r.email === 'reinvitada@example.test')).toHaveLength(1);
    const fresh = await new Client(app).post('/api/invitations/accept', { token: second.token, name: 'X', password: 'Ficticia-clave-123' });
    expect(fresh.statusCode).toBe(201);
  });

  it('el correo de alguien que ya es de la organización se rechaza', async () => {
    const member = await createStaff(app, 'inv-miembro', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const response = await admin.post('/api/invitations', {
      email: member.email.toUpperCase(),
      name: 'X',
      roles: ['recepcion'],
      locationIds: [NORTE.locations[0].id],
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ code: 'email_taken' });
  });

  it('revocar una invitación (con motivo) deja el enlace sin efecto y se audita', async () => {
    const created = await invite('revocada@example.test');
    expect((await admin.post(`/api/invitations/${created.invitationId}/revoke`, {})).statusCode).toBe(400);
    const revoked = await admin.post(`/api/invitations/${created.invitationId}/revoke`, { reason: 'Se equivocó de correo' });
    expect(revoked.statusCode).toBe(204);
    const again = await admin.post(`/api/invitations/${created.invitationId}/revoke`, { reason: 'Otra vez' });
    expect(again.statusCode).toBe(409);
    const accept = await new Client(app).post('/api/invitations/accept', { token: created.token, name: 'X', password: 'Ficticia-clave-123' });
    expect(accept.json()).toEqual({ code: 'invitation_revoked' });
    const events = await readAudit("action = 'invitation.revoked' and entity_id = $1", [created.invitationId]);
    expect(events).toMatchObject([{ organization_id: NORTE.id, reason: 'Se equivocó de correo' }]);
  });

  it('reenviar (S-ADM-02) emite un enlace nuevo con los mismos roles, anula el anterior y se audita', async () => {
    const first = await invite('reenviada@example.test', ['recepcion', 'enfermeria'], [0, 1]);
    const response = await admin.post(`/api/invitations/${first.invitationId}/resend`, {});
    expect(response.statusCode).toBe(201);
    const second = response.json<Created>();
    expect(second.invitationId).not.toBe(first.invitationId);
    expect(second.mailSent).toBe(true);
    expect(lastInvitationLink(app, 'reenviada@example.test').toString()).toBe(second.link);

    // El enlace anterior ya no sirve; el nuevo sí, con los mismos roles y sedes.
    const old = await new Client(app).post('/api/invitations/accept', { token: first.token, name: 'X', password: 'Ficticia-clave-123' });
    expect(old.json()).toEqual({ code: 'invitation_revoked' });
    const guest = new Client(app);
    const accepted = await guest.post('/api/invitations/accept', { token: tokenOf(second.link), name: 'Reenviada', password: 'Ficticia-clave-123' });
    expect(accepted.statusCode).toBe(201);
    const me = (await guest.get('/api/me')).json<{ userId: string }>();
    expect((await membershipOf(me.userId)).map((r) => `${r.role}@${String(r.locationId)}`)).toEqual(
      [
        `enfermeria@${NORTE.locations[0].id}`,
        `enfermeria@${NORTE.locations[1].id}`,
        `recepcion@${NORTE.locations[0].id}`,
        `recepcion@${NORTE.locations[1].id}`,
      ].sort(),
    );

    const [event] = await readAudit("action = 'invitation.resent' and entity_id = $1", [second.invitationId]);
    expect(event).toMatchObject({ organization_id: NORTE.id, metadata: { previousInvitationId: first.invitationId } });
    // Una invitación ya aceptada o anulada no se reenvía.
    expect((await admin.post(`/api/invitations/${second.invitationId}/resend`, {})).statusCode).toBe(409);
    expect((await admin.post(`/api/invitations/${first.invitationId}/resend`, {})).statusCode).toBe(409);
  });

  it('una invitación vencida se puede reenviar', async () => {
    const created = await invite('vencida.reenvio@example.test');
    await createTenantDb(app.pool).withTenant(NORTE.id, (tx) =>
      tx.update(invitations).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(invitations.id, created.invitationId)),
    );
    const expired = await new Client(app).post('/api/invitations/accept', { token: created.token, name: 'Vencida', password: 'Ficticia-clave-123' });
    expect(expired.statusCode).toBe(410);
    const response = await admin.post(`/api/invitations/${created.invitationId}/resend`, {});
    expect(response.statusCode).toBe(201);
    const accepted = await new Client(app).post('/api/invitations/accept', {
      token: tokenOf(response.json<Created>().link),
      name: 'Vencida',
      password: 'Ficticia-clave-123',
    });
    expect(accepted.statusCode).toBe(201);
  });

  it('si el correo falla, la invitación vale igual y la respuesta lo dice', async () => {
    vi.spyOn(app.mailer, 'send').mockRejectedValueOnce(new Error('SMTP caído'));
    const response = await admin.post('/api/invitations', {
      email: 'sin.correo@example.test',
      name: 'Persona',
      roles: ['proveedor'],
      locationIds: [NORTE.locations[0].id],
    });
    expect(response.statusCode).toBe(201);
    const created = response.json<Created>();
    expect(created.mailSent).toBe(false);
    const accepted = await new Client(app).post('/api/invitations/accept', { token: tokenOf(created.link), name: 'P', password: 'Ficticia-clave-123' });
    expect(accepted.statusCode).toBe(201);
  });

  it('Recepción no puede invitar', async () => {
    const staff = await createStaff(app, 'inv-recepcion', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const client = new Client(app);
    await signIn(client, staff);
    await selectContext(client, NORTE);
    const response = await client.post('/api/invitations', { email: 'x@example.test', name: 'X', roles: ['recepcion'], locationIds: [NORTE.locations[0].id] });
    expect(response.statusCode).toBe(403);
  });
});
