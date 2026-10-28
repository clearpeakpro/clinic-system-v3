import { createTenantDb, membershipRoles, memberships } from '@clinic/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createStaff,
  membershipIdOf,
  NORTE,
  signedInWithContext,
  startApp,
  SUR,
  type Client,
  type Staff,
  type TestApp,
} from './support.ts';

// Regla escalonada de roles (packages/shared/src/permissions.ts):
// Propietario > Administrador > roles clínicos. Se asignan solo roles de rango
// estrictamente menor; se gestiona (quitar, desactivar, cambiar roles) solo a
// quien tiene rango estrictamente menor. Nadie asigna Propietario por la API.

describe('regla escalonada de roles', () => {
  let app: TestApp;
  let owner: Client;
  let admin: Client;
  let reception: Client;
  let ownerStaff: Staff;
  let adminStaff: Staff;

  const location0 = NORTE.locations[0].id;

  const rolesOf = async (membershipId: string) =>
    createTenantDb(app.pool).withTenant(NORTE.id, (tx) =>
      tx
        .select({ role: membershipRoles.role, locationId: membershipRoles.locationId })
        .from(membershipRoles)
        .where(eq(membershipRoles.membershipId, membershipId)),
    );

  const statusOf = async (membershipId: string) =>
    createTenantDb(app.pool).withTenant(NORTE.id, (tx) =>
      tx
        .select({ status: memberships.status })
        .from(memberships)
        .where(eq(memberships.id, membershipId))
        .then((r) => r[0]?.status),
    );

  const member = async (label: string, role: 'propietario' | 'administrador' | 'recepcion') => {
    const staff = await createStaff(app, label, [
      { org: NORTE, location: role === 'recepcion' ? 0 : null, role },
    ]);
    return { staff, membershipId: await membershipIdOf(app, NORTE, staff.userId) };
  };

  beforeAll(async () => {
    app = await startApp();
    ownerStaff = await createStaff(app, 'reg-propietario', [{ org: NORTE, location: null, role: 'propietario' }]);
    adminStaff = await createStaff(app, 'reg-admin', [{ org: NORTE, location: null, role: 'administrador' }]);
    const receptionStaff = await createStaff(app, 'reg-recepcion', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    owner = await signedInWithContext(app, ownerStaff, NORTE, 0, { mfa: true });
    admin = await signedInWithContext(app, adminStaff, NORTE, 0, { mfa: true });
    reception = await signedInWithContext(app, receptionStaff, NORTE);
  });
  afterAll(async () => {
    await app.close();
  });

  describe('invitar', () => {
    const invite = (client: Client, role: string, locationId: string | null = location0) =>
      client.post('/api/invitations', { email: `inv.${role}.${String(Date.now())}@example.test`, role, locationId });

    it('el Administrador invita roles clínicos', async () => {
      for (const role of ['recepcion', 'enfermeria', 'proveedor']) {
        expect((await invite(admin, role)).statusCode, role).toBe(201);
      }
    });

    it('el Administrador no invita Administradores ni Propietarios', async () => {
      for (const role of ['administrador', 'propietario']) {
        const response = await invite(admin, role, null);
        expect(response.statusCode, role).toBe(403);
        expect(response.json(), role).toEqual({ code: 'role_not_assignable' });
      }
    });

    it('el Propietario invita Administradores y roles clínicos, pero no Propietarios', async () => {
      expect((await invite(owner, 'administrador', null)).statusCode).toBe(201);
      expect((await invite(owner, 'proveedor')).statusCode).toBe(201);
      expect((await invite(owner, 'propietario', null)).statusCode).toBe(403);
    });

    it('un rol clínico no puede invitar', async () => {
      expect((await invite(reception, 'recepcion')).statusCode).toBe(403);
    });

    it('un rol clínico no se puede asignar a toda la organización', async () => {
      const response = await invite(admin, 'recepcion', null);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ code: 'location_required' });
    });
  });

  describe('quitar o desactivar membresías', () => {
    const deactivate = (client: Client, membershipId: string) =>
      client.post(`/api/memberships/${membershipId}/deactivate`, { reason: 'Prueba de la regla escalonada' });

    it('el Administrador no puede desactivar a un Propietario', async () => {
      const target = await member('reg-objetivo-prop', 'propietario');
      const response = await deactivate(admin, target.membershipId);
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ code: 'member_not_manageable' });
      expect(await statusOf(target.membershipId)).toBe('active');
    });

    it('el Administrador no puede desactivar a otro Administrador ni a sí mismo', async () => {
      const target = await member('reg-objetivo-admin', 'administrador');
      expect((await deactivate(admin, target.membershipId)).statusCode).toBe(403);
      const own = await membershipIdOf(app, NORTE, adminStaff.userId);
      expect((await deactivate(admin, own)).statusCode).toBe(403);
      expect(await statusOf(target.membershipId)).toBe('active');
      expect(await statusOf(own)).toBe('active');
    });

    it('el Administrador sí desactiva un rol clínico', async () => {
      const target = await member('reg-objetivo-recep', 'recepcion');
      expect((await deactivate(admin, target.membershipId)).statusCode).toBe(204);
      expect(await statusOf(target.membershipId)).toBe('inactive');
    });

    it('el Propietario desactiva a un Administrador, pero no a otro Propietario', async () => {
      const targetAdmin = await member('reg-prop-admin', 'administrador');
      expect((await deactivate(owner, targetAdmin.membershipId)).statusCode).toBe(204);
      const targetOwner = await member('reg-prop-prop', 'propietario');
      expect((await deactivate(owner, targetOwner.membershipId)).statusCode).toBe(403);
      expect(await statusOf(targetOwner.membershipId)).toBe('active');
    });

    it('un rol clínico no puede desactivar a nadie', async () => {
      const target = await member('reg-recep-recep', 'recepcion');
      expect((await deactivate(reception, target.membershipId)).statusCode).toBe(403);
    });

    it('una membresía de otra organización no existe para quien actúa', async () => {
      const sur = await createStaff(app, 'reg-sur', [{ org: SUR, location: 0, role: 'recepcion' }]);
      const surMembership = await membershipIdOf(app, SUR, sur.userId);
      expect((await deactivate(admin, surMembership)).statusCode).toBe(404);
    });
  });

  describe('cambiar roles', () => {
    const change = (client: Client, membershipId: string, roles: { role: string; locationId: string | null }[]) =>
      client.post(`/api/memberships/${membershipId}/roles`, { roles, reason: 'Prueba de la regla escalonada' });

    it('el Administrador cambia un rol clínico por otro', async () => {
      const target = await member('reg-cambio-ok', 'recepcion');
      expect((await change(admin, target.membershipId, [{ role: 'enfermeria', locationId: location0 }])).statusCode).toBe(204);
      expect(await rolesOf(target.membershipId)).toEqual([{ role: 'enfermeria', locationId: location0 }]);
    });

    it('nadie sube a alguien a un rol igual o superior al suyo', async () => {
      const target = await member('reg-subir', 'recepcion');
      const toAdmin = await change(admin, target.membershipId, [{ role: 'administrador', locationId: null }]);
      expect(toAdmin.statusCode).toBe(403);
      expect(toAdmin.json()).toEqual({ code: 'role_change_not_allowed' });
      expect((await change(owner, target.membershipId, [{ role: 'propietario', locationId: null }])).statusCode).toBe(403);
      // Tampoco añadiéndolo junto a un rol permitido.
      const mixed = await change(admin, target.membershipId, [
        { role: 'recepcion', locationId: location0 },
        { role: 'administrador', locationId: null },
      ]);
      expect(mixed.statusCode).toBe(403);
      expect(await rolesOf(target.membershipId)).toEqual([{ role: 'recepcion', locationId: location0 }]);
    });

    it('el Propietario sí sube un rol clínico a Administrador', async () => {
      const target = await member('reg-ascenso', 'recepcion');
      expect((await change(owner, target.membershipId, [{ role: 'administrador', locationId: null }])).statusCode).toBe(204);
      expect(await rolesOf(target.membershipId)).toEqual([{ role: 'administrador', locationId: null }]);
    });

    it('el Administrador no cambia el rol de un Propietario ni de otro Administrador', async () => {
      const targetOwner = await member('reg-cambio-prop', 'propietario');
      expect((await change(admin, targetOwner.membershipId, [{ role: 'recepcion', locationId: location0 }])).statusCode).toBe(403);
      const targetAdmin = await member('reg-cambio-admin', 'administrador');
      expect((await change(admin, targetAdmin.membershipId, [{ role: 'recepcion', locationId: location0 }])).statusCode).toBe(403);
      expect(await rolesOf(targetAdmin.membershipId)).toEqual([{ role: 'administrador', locationId: null }]);
    });

    it('cambiar roles exige motivo', async () => {
      const target = await member('reg-sin-motivo', 'recepcion');
      const response = await admin.post(`/api/memberships/${target.membershipId}/roles`, {
        roles: [{ role: 'enfermeria', locationId: location0 }],
      });
      expect(response.statusCode).toBe(400);
    });

    it('el primer Propietario no se crea por la API', async () => {
      // Solo la semilla de desarrollo (y, desde T-007, el operador) lo crea.
      expect(ownerStaff.userId).toBeTruthy();
      for (const client of [owner, admin]) {
        const response = await client.post('/api/invitations', {
          email: 'otro.propietario@example.test',
          role: 'propietario',
          locationId: null,
        });
        expect(response.statusCode).toBe(403);
      }
    });
  });
});
