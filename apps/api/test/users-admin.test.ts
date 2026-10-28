import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  Client,
  createStaff,
  enrollTotp,
  membershipIdOf,
  NORTE,
  readAudit,
  signedInWithContext,
  signIn,
  startApp,
  SUR,
  tokenOf,
  versionOf,
  type Staff,
  type TestApp,
} from './support.ts';

// Administración › Usuarios (S-ADM-02 a 09, T-006a): lista, nombre, roles y
// sedes, deshabilitar y reactivar, estado y restablecimiento del MFA, y
// restablecimiento de contraseña. Siempre con la regla escalonada.

interface Row {
  kind: 'member' | 'invitation';
  membershipId?: string;
  userId?: string;
  name: string;
  email: string;
  status?: string;
  version?: number;
  assignments: { role: string; locationId: string | null }[];
  mfa?: string;
  mfaResetPending?: boolean;
  self?: boolean;
  manageable: boolean;
  sharedAccount?: boolean;
}

const sessionsOf = async (app: TestApp, userId: string) =>
  (await app.pool.query<{ n: number }>('select count(*)::int as n from auth.session where user_id = $1', [userId])).rows[0]?.n;

describe('Administración › Usuarios', () => {
  let app: TestApp;
  let owner: Client;
  let admin: Client;
  let ownerStaff: Staff;
  let adminStaff: Staff;

  const clinical = async (label: string, role: 'recepcion' | 'enfermeria' | 'proveedor' = 'recepcion') => {
    const staff = await createStaff(app, label, [{ org: NORTE, location: 0, role }]);
    return { staff, membershipId: await membershipIdOf(app, NORTE, staff.userId) };
  };
  const body = async (membershipId: string, extra: Record<string, unknown> = {}) => ({
    reason: 'Motivo de prueba',
    expectedVersion: await versionOf(app, NORTE, membershipId),
    ...extra,
  });

  beforeAll(async () => {
    app = await startApp();
    ownerStaff = await createStaff(app, 'usr-prop', [{ org: NORTE, location: null, role: 'propietario' }]);
    adminStaff = await createStaff(app, 'usr-admin', [{ org: NORTE, location: null, role: 'administrador' }]);
    owner = await signedInWithContext(app, ownerStaff, NORTE, 0, { mfa: true });
    admin = await signedInWithContext(app, adminStaff, NORTE, 0, { mfa: true });
  });
  afterAll(async () => {
    await app.close();
  });

  describe('lista (S-ADM-02)', () => {
    it('personas e invitaciones de la organización, con lo que cada uno puede hacer', async () => {
      const target = await clinical('usr-lista');
      const sur = await createStaff(app, 'usr-sur', [{ org: SUR, location: 0, role: 'recepcion' }]);
      await admin.post('/api/invitations', { email: 'usr.pendiente@example.test', name: 'Zoe Pendiente', roles: ['proveedor'], locationIds: [NORTE.locations[1].id] });

      const response = await admin.get('/api/users');
      expect(response.statusCode).toBe(200);
      const list = response.json<{ rows: Row[]; locations: { code: string }[]; assignableRoles: string[] }>();
      expect(list.assignableRoles).toEqual(['recepcion', 'enfermeria', 'proveedor']);
      expect(list.locations.map((l) => l.code)).toEqual(NORTE.locations.map((l) => l.code).sort());

      const byEmail = (email: string) => list.rows.find((r) => r.email === email);
      expect(byEmail(target.staff.email)).toMatchObject({
        kind: 'member',
        status: 'active',
        version: 1,
        mfa: 'disabled',
        self: false,
        manageable: true,
        sharedAccount: false,
        assignments: [{ role: 'recepcion', locationId: NORTE.locations[0].id }],
      });
      // Ni a sí mismo, ni al Propietario.
      expect(byEmail(adminStaff.email)).toMatchObject({ self: true, manageable: false, mfa: 'enabled' });
      expect(byEmail(ownerStaff.email)).toMatchObject({ manageable: false });
      expect(byEmail('usr.pendiente@example.test')).toMatchObject({
        kind: 'invitation',
        name: 'Zoe Pendiente',
        manageable: true,
        assignments: [{ role: 'proveedor', locationId: NORTE.locations[1].id }],
      });
      // Nada de Sur.
      expect(byEmail(sur.email)).toBeUndefined();
      expect(list.rows.every((r) => r.assignments.every((a) => a.locationId === null || NORTE.locations.some((l) => l.id === a.locationId)))).toBe(true);

      // El Propietario sí puede gestionar al Administrador y asignar Administrador.
      const ownerList = (await owner.get('/api/users')).json<{ rows: Row[]; assignableRoles: string[] }>();
      expect(ownerList.assignableRoles).toEqual(['administrador', 'recepcion', 'enfermeria', 'proveedor']);
      expect(ownerList.rows.find((r) => r.email === adminStaff.email)).toMatchObject({ manageable: true });
    });

    it('marca las cuentas con membresía activa en otra organización', async () => {
      const both = await createStaff(app, 'usr-ambas', [
        { org: NORTE, location: 0, role: 'recepcion' },
        { org: SUR, location: 0, role: 'recepcion' },
      ]);
      const list = (await admin.get('/api/users')).json<{ rows: Row[] }>();
      expect(list.rows.find((r) => r.email === both.email)).toMatchObject({ sharedAccount: true });
    });

    it('un rol clínico no ve la lista', async () => {
      const { staff } = await clinical('usr-lista-recep');
      const client = await signedInWithContext(app, staff, NORTE);
      expect((await client.get('/api/users')).statusCode).toBe(403);
    });
  });

  describe('editar nombre (S-ADM-05)', () => {
    it('cambia el nombre con la versión actual; con una versión vieja, 409', async () => {
      const target = await clinical('usr-nombre');
      const stale = await versionOf(app, NORTE, target.membershipId);
      const ok = await admin.post(`/api/memberships/${target.membershipId}/name`, { name: 'Nombre Nuevo', expectedVersion: stale });
      expect(ok.statusCode).toBe(204);
      const { rows } = await app.pool.query<{ name: string }>('select name from auth."user" where id = $1', [target.staff.userId]);
      expect(rows[0]?.name).toBe('Nombre Nuevo');
      const conflict = await admin.post(`/api/memberships/${target.membershipId}/name`, { name: 'Otro', expectedVersion: stale });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toEqual({ code: 'version_conflict' });
      // La auditoría guarda solo el nombre del campo, nunca el valor.
      const [event] = await readAudit("action = 'user.renamed' and entity_id = $1", [target.membershipId]);
      expect(event).toMatchObject({ organization_id: NORTE.id, actor_id: adminStaff.userId, metadata: { fields: 'name' } });
      expect(JSON.stringify(event)).not.toContain('Nombre Nuevo');
    });

    it('no toca una cuenta con membresía activa en otra organización', async () => {
      const both = await createStaff(app, 'usr-nombre-ambas', [
        { org: NORTE, location: 0, role: 'recepcion' },
        { org: SUR, location: 0, role: 'recepcion' },
      ]);
      const membershipId = await membershipIdOf(app, NORTE, both.userId);
      const response = await admin.post(`/api/memberships/${membershipId}/name`, { name: 'X', expectedVersion: await versionOf(app, NORTE, membershipId) });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ code: 'account_shared' });
    });

    it('nadie cambia su propio nombre desde aquí', async () => {
      const own = await membershipIdOf(app, NORTE, adminStaff.userId);
      const response = await admin.post(`/api/memberships/${own}/name`, { name: 'Yo', expectedVersion: await versionOf(app, NORTE, own) });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ code: 'cannot_modify_self' });
    });
  });

  describe('editar sedes (S-ADM-06)', () => {
    it('reemplaza las sedes de los roles clínicos; versión vieja → 409', async () => {
      const target = await clinical('usr-sedes', 'proveedor');
      const roles = NORTE.locations.map((l) => ({ role: 'proveedor', locationId: l.id }));
      const stale = await versionOf(app, NORTE, target.membershipId);
      expect((await admin.post(`/api/memberships/${target.membershipId}/roles`, await body(target.membershipId, { roles }))).statusCode).toBe(204);
      const again = await admin.post(`/api/memberships/${target.membershipId}/roles`, { roles, reason: 'Otra', expectedVersion: stale });
      expect(again.statusCode).toBe(409);
      const list = (await admin.get('/api/users')).json<{ rows: Row[] }>();
      expect(list.rows.find((r) => r.membershipId === target.membershipId)?.assignments).toHaveLength(2);
    });

    it('una sede de otra organización no se acepta', async () => {
      const target = await clinical('usr-sede-ajena');
      const response = await admin.post(
        `/api/memberships/${target.membershipId}/roles`,
        await body(target.membershipId, { roles: [{ role: 'recepcion', locationId: SUR.locations[0].id }] }),
      );
      expect(response.statusCode).toBe(400);
    });
  });

  describe('deshabilitar y reactivar (S-ADM-07, S-ADM-09)', () => {
    it('deshabilitar corta la sesión; reactivar devuelve el acceso con la misma contraseña', async () => {
      const target = await clinical('usr-baja');
      const session = await signedInWithContext(app, target.staff, NORTE);
      expect((await admin.post(`/api/memberships/${target.membershipId}/deactivate`, await body(target.membershipId))).statusCode).toBe(204);
      expect((await session.get('/api/me')).statusCode).toBe(401);
      // Reactivar exige motivo y solo vale sobre una membresía deshabilitada.
      expect((await admin.post(`/api/memberships/${target.membershipId}/reactivate`, { expectedVersion: await versionOf(app, NORTE, target.membershipId) })).statusCode).toBe(400);
      expect((await admin.post(`/api/memberships/${target.membershipId}/reactivate`, await body(target.membershipId, { reason: 'Recontratación' }))).statusCode).toBe(204);
      const again = await admin.post(`/api/memberships/${target.membershipId}/reactivate`, await body(target.membershipId));
      expect(again.statusCode).toBe(409);
      expect(again.json()).toEqual({ code: 'membership_not_inactive' });
      const back = await signedInWithContext(app, target.staff, NORTE);
      expect((await back.get('/api/me')).json()).toMatchObject({ roles: ['recepcion'] });
      const [event] = await readAudit("action = 'membership.reactivated' and entity_id = $1", [target.membershipId]);
      expect(event).toMatchObject({ reason: 'Recontratación', actor_id: adminStaff.userId });
    });

    it('el Administrador no reactiva a otro Administrador (regla escalonada)', async () => {
      const other = await createStaff(app, 'usr-otro-admin', [{ org: NORTE, location: null, role: 'administrador' }]);
      const membershipId = await membershipIdOf(app, NORTE, other.userId);
      expect((await owner.post(`/api/memberships/${membershipId}/deactivate`, await body(membershipId))).statusCode).toBe(204);
      const response = await admin.post(`/api/memberships/${membershipId}/reactivate`, await body(membershipId));
      expect(response.statusCode).toBe(403);
      expect((await owner.post(`/api/memberships/${membershipId}/reactivate`, await body(membershipId))).statusCode).toBe(204);
    });
  });

  describe('restablecimiento de contraseña (S-ADM-02, S-ADM-04, S-GEN-10)', () => {
    it('emite un enlace /restablecer/<token> de un solo uso; el anterior deja de servir', async () => {
      const target = await clinical('usr-pwd');
      expect((await admin.post(`/api/memberships/${target.membershipId}/password-reset`, {})).statusCode).toBe(400);
      const first = await admin.post(`/api/memberships/${target.membershipId}/password-reset`, { reason: 'Olvidó la contraseña' });
      expect(first.statusCode).toBe(201);
      const second = (await admin.post(`/api/memberships/${target.membershipId}/password-reset`, { reason: 'Se perdió el primero' })).json<{ link: string; expiresAt: string }>();
      expect(new URL(second.link).pathname).toMatch(/^\/restablecer\/[\w-]+$/);
      expect(Date.parse(second.expiresAt)).toBeGreaterThan(Date.now());

      // El token no se guarda en claro.
      const token = tokenOf(second.link);
      const stored = await app.pool.query<{ identifier: string }>('select identifier from auth.verification where value = $1', [target.staff.userId]);
      expect(stored.rows).toHaveLength(1);
      expect(stored.rows[0]?.identifier).not.toContain(token);

      const anonymous = new Client(app);
      const old = await anonymous.post('/api/auth/reset-password', { token: tokenOf(first.json<{ link: string }>().link), newPassword: 'una contraseña nueva larga' });
      expect(old.statusCode).toBe(400);
      const ok = await anonymous.post('/api/auth/reset-password', { token, newPassword: 'una contraseña nueva larga' });
      expect(ok.statusCode).toBe(200);
      expect((await anonymous.post('/api/auth/reset-password', { token, newPassword: 'otra contraseña nueva larga' })).statusCode).toBe(400);
      const client = new Client(app);
      expect((await signIn(client, { ...target.staff, password: 'una contraseña nueva larga' })).statusCode).toBe(200);

      const events = await readAudit("action = 'user.password_reset_created' and entity_id = $1", [target.membershipId]);
      expect(events.map((e) => e.reason)).toEqual(['Olvidó la contraseña', 'Se perdió el primero']);
      expect(JSON.stringify(events)).not.toContain(token);
    });

    it('un enlace vencido no sirve', async () => {
      const target = await clinical('usr-pwd-vencido');
      const { link } = (await admin.post(`/api/memberships/${target.membershipId}/password-reset`, { reason: 'Prueba' })).json<{ link: string }>();
      vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + app.config.passwordResetTtlSeconds * 1000 + 60_000 });
      try {
        const response = await new Client(app).post('/api/auth/reset-password', { token: tokenOf(link), newPassword: 'una contraseña nueva larga' });
        expect(response.statusCode).toBe(400);
      } finally {
        vi.useRealTimers();
      }
    });

    it('no hay «¿olvidó su contraseña?» público', async () => {
      const target = await clinical('usr-pwd-publico');
      const response = await new Client(app).post('/api/auth/request-password-reset', { email: target.staff.email });
      expect(response.statusCode).toBe(403);
    });

    it('solo sobre membresías activas y cuentas que no son de otra organización', async () => {
      const target = await clinical('usr-pwd-baja');
      await admin.post(`/api/memberships/${target.membershipId}/deactivate`, await body(target.membershipId));
      const inactive = await admin.post(`/api/memberships/${target.membershipId}/password-reset`, { reason: 'Prueba' });
      expect(inactive.json()).toEqual({ code: 'membership_not_active' });
      const both = await createStaff(app, 'usr-pwd-ambas', [
        { org: NORTE, location: 0, role: 'recepcion' },
        { org: SUR, location: 0, role: 'recepcion' },
      ]);
      const shared = await admin.post(`/api/memberships/${await membershipIdOf(app, NORTE, both.userId)}/password-reset`, { reason: 'Prueba' });
      expect(shared.json()).toEqual({ code: 'account_shared' });
    });
  });

  describe('restablecer el MFA (S-ADM-08)', () => {
    it('Administrador (por el Propietario): quita el factor, la contraseña y las sesiones; al volver debe inscribirse', async () => {
      const target = await createStaff(app, 'usr-mfa-admin', [{ org: NORTE, location: null, role: 'administrador' }]);
      const membershipId = await membershipIdOf(app, NORTE, target.userId);
      const session = await signedInWithContext(app, target, NORTE, 0, { mfa: true });

      const status: unknown = (await owner.get(`/api/memberships/${membershipId}/mfa`)).json();
      expect(status).toEqual({ enrolled: true, lockedUntil: null, backupCodesLeft: 10, resetPendingSince: null });
      // El Administrador no puede con otro Administrador.
      expect((await admin.get(`/api/memberships/${membershipId}/mfa`)).statusCode).toBe(403);

      expect((await owner.post(`/api/memberships/${membershipId}/mfa-reset`, {})).statusCode).toBe(400);
      const reset = await owner.post(`/api/memberships/${membershipId}/mfa-reset`, { reason: 'Perdió el teléfono; identidad confirmada en persona' });
      expect(reset.statusCode).toBe(201);
      const { reset: link } = reset.json<{ reset: { link: string } | null }>();
      if (!link) throw new Error('sin enlace');

      expect((await session.get('/api/me')).statusCode).toBe(401);
      expect(await sessionsOf(app, target.userId)).toBe(0);
      expect((await signIn(new Client(app), target)).statusCode).toBe(401);
      const pending = (await owner.get(`/api/memberships/${membershipId}/mfa`)).json<{ enrolled: boolean; resetPendingSince: string | null }>();
      expect(pending.enrolled).toBe(false);
      expect(pending.resetPendingSince).not.toBeNull();
      // Mientras está pendiente no se restablece otra vez.
      const twice = await owner.post(`/api/memberships/${membershipId}/mfa-reset`, { reason: 'Otra vez' });
      expect(twice.json()).toEqual({ code: 'mfa_reset_pending' });

      const newPassword = 'contraseña nueva tras el restablecimiento';
      expect((await new Client(app).post('/api/auth/reset-password', { token: tokenOf(link.link), newPassword })).statusCode).toBe(200);
      const after = (await owner.get(`/api/memberships/${membershipId}/mfa`)).json<{ resetPendingSince: string | null }>();
      expect(after.resetPendingSince).toBeNull();
      // Su rol exige MFA: entra, pero debe inscribirse antes de nada.
      const back = new Client(app);
      expect((await signIn(back, { ...target, password: newPassword })).statusCode).toBe(200);
      expect((await back.get('/api/me')).json()).toEqual({ code: 'mfa_enrollment_required' });

      const [event] = await readAudit("action = 'user.mfa_reset' and entity_id = $1", [membershipId]);
      expect(event).toMatchObject({ actor_id: ownerStaff.userId, organization_id: NORTE.id, reason: 'Perdió el teléfono; identidad confirmada en persona' });
    });

    it('rol clínico: tras el restablecimiento entra sin MFA (y puede activarlo desde su Perfil)', async () => {
      const target = await clinical('usr-mfa-clinico', 'proveedor');
      const client = new Client(app);
      await signIn(client, target.staff);
      await enrollTotp(client, target.staff);
      const { reset } = (await admin.post(`/api/memberships/${target.membershipId}/mfa-reset`, { reason: 'Cambió de teléfono' })).json<{ reset: { link: string } }>();
      const newPassword = 'otra contraseña nueva para el proveedor';
      expect((await new Client(app).post('/api/auth/reset-password', { token: tokenOf(reset.link), newPassword })).statusCode).toBe(200);
      const back = new Client(app);
      const signedIn = await signIn(back, { ...target.staff, password: newPassword });
      expect(signedIn.json()).not.toMatchObject({ twoFactorRedirect: true });
      expect((await back.get('/api/me')).json()).toMatchObject({ twoFactorEnabled: false, mfaRequired: false });
    });

    it('sin MFA no hay nada que restablecer; con la membresía deshabilitada no se emite enlace', async () => {
      const none = await clinical('usr-mfa-ninguno');
      const response = await admin.post(`/api/memberships/${none.membershipId}/mfa-reset`, { reason: 'Prueba' });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ code: 'mfa_not_enrolled' });

      const off = await clinical('usr-mfa-baja');
      const client = new Client(app);
      await signIn(client, off.staff);
      await enrollTotp(client, off.staff);
      await admin.post(`/api/memberships/${off.membershipId}/deactivate`, await body(off.membershipId));
      const reset = await admin.post(`/api/memberships/${off.membershipId}/mfa-reset`, { reason: 'Prueba' });
      expect(reset.statusCode).toBe(201);
      expect(reset.json()).toEqual({ reset: null });
    });

    it('nunca sobre la propia cuenta', async () => {
      const own = await membershipIdOf(app, NORTE, adminStaff.userId);
      expect((await admin.post(`/api/memberships/${own}/mfa-reset`, { reason: 'Prueba' })).json()).toEqual({ code: 'cannot_modify_self' });
    });
  });

  it('el Propietario tiene permisos administrativos y ningún permiso clínico', async () => {
    const me = (await owner.get('/api/me')).json<{ roles: string[]; permissions: string[] }>();
    expect(me.roles).toEqual(['propietario']);
    expect(me.permissions).toEqual(['admin.access', 'members.invite', 'members.manage']);
  });
});
