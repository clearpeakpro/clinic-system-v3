import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULTS } from '../src/config.ts';
import { createStaff, NORTE, readAudit, signedInWithContext, startApp, type TestApp } from './support.ts';

// T-004: lo que la web necesita de /api/me y el registro del cierre por
// inactividad (S-GEN-20).

describe('/api/me para la web', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('devuelve nombre, correo, límite de inactividad (15 min por defecto) y permisos del contexto', async () => {
    expect(DEFAULTS.idleTimeoutSeconds).toBe(15 * 60);
    const staff = await createStaff(app, 'me-recepcion', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const client = await signedInWithContext(app, staff, NORTE);
    const me = (await client.get('/api/me')).json<Record<string, unknown>>();
    expect(me).toMatchObject({
      userId: staff.userId,
      email: staff.email,
      name: 'Persona me-recepcion',
      idleTimeoutSeconds: DEFAULTS.idleTimeoutSeconds,
      context: { organizationId: NORTE.id, locationId: NORTE.locations[0].id },
    });
    expect(me.permissions).toContain('panel.view');
    expect(me.permissions).not.toContain('admin.access');
  });

  it('POST /api/me/idle-logout registra el cierre por inactividad', async () => {
    const staff = await createStaff(app, 'me-idle', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const client = await signedInWithContext(app, staff, NORTE);
    expect((await client.post('/api/me/idle-logout', {})).statusCode).toBe(204);
    const events = await readAudit(`action = 'auth.sign_out.idle' and actor_id = $1`, [staff.userId]);
    expect(events).toHaveLength(1);
    expect(events[0]?.request_id).toBeTruthy();
  });

  it('sin sesión, idle-logout responde 401', async () => {
    const { Client } = await import('./support.ts');
    expect((await new Client(app).post('/api/me/idle-logout', {})).statusCode).toBe(401);
  });
});
