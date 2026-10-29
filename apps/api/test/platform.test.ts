import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { MemoryMailer } from '../src/mailer.ts';
import { assertOperatorUrl, createOrganization, readPlatformAudit } from '../src/platform.ts';
import { Client, enrollTotp, readAudit, startApp, tokenOf, type TestApp } from './support.ts';

// Operador de la plataforma (ADR 0024, T-007): pnpm org:create y pnpm
// audit:platform, conectados como clinic_operator (el rol real).

describe('operador de la plataforma', () => {
  let app: TestApp;
  let operator: pg.Pool;

  beforeAll(async () => {
    app = await startApp();
    operator = new pg.Pool({ connectionString: inject('platformOperatorUrl'), max: 2 });
  });
  afterAll(async () => {
    await operator.end();
    await app.close();
  });

  it('solo se conecta como clinic_operator', () => {
    expect(() => { assertOperatorUrl(inject('appUrl')); }).toThrow(/clinic_operator/);
    expect(() => { assertOperatorUrl(inject('platformOperatorUrl')); }).not.toThrow();
  });

  it('org:create: organización, primera sede e invitación; el Propietario acepta, configura el MFA y administra sus sedes', async () => {
    const mailer = new MemoryMailer();
    const created = await createOrganization(
      operator,
      {
        organizationName: 'Clínica Demo Este (ficticia)',
        ownerEmail: 'Propietario.Este@Example.test',
        ownerName: 'Propietaria Este (ficticia)',
        location: { code: 'EST1', name: 'Este Centro', timezone: 'America/New_York', address: '1 Calle Ficticia Este', phone: null },
      },
      { baseURL: app.config.baseURL, invitationTtlSeconds: 3600, mailer },
    );
    expect(created.mailSent).toBe(true);
    expect(mailer.sent.at(-1)?.to).toBe('propietario.este@example.test');
    expect(created.link).toMatch(/\/invitacion\/[\w-]+\.[\w-]+$/);

    // El Propietario acepta en S-GEN-09 y entra.
    const owner = new Client(app);
    const password = 'frase larga de propietaria ficticia';
    const accepted = await owner.post('/api/invitations/accept', { token: tokenOf(created.link), name: 'Propietaria Este (ficticia)', password });
    expect(accepted.statusCode).toBe(201);
    // Su rol exige MFA.
    expect((await owner.get('/api/me')).json()).toEqual({ code: 'mfa_enrollment_required' });
    await enrollTotp(owner, { userId: '', email: 'propietario.este@example.test', password });
    expect((await owner.post('/api/context', { organizationId: created.organizationId, locationId: created.locationId })).statusCode).toBe(204);
    const me = (await owner.get('/api/me')).json<{ roles: string[]; permissions: string[] }>();
    expect(me.roles).toEqual(['propietario']);
    expect(me.permissions).toContain('locations.manage');
    expect(me.permissions).not.toContain('patients.access');
    const sites = (await owner.get('/api/locations')).json<{ code: string; timezone: string }[]>();
    expect(sites).toEqual([expect.objectContaining({ code: 'EST1', timezone: 'America/New_York' })]);
    // Su única sede no se puede desactivar.
    const id = (await owner.get('/api/locations')).json<{ id: string; version: number }[]>()[0];
    expect((await owner.post(`/api/locations/${id?.id ?? ''}/deactivate`, { expectedVersion: id?.version })).json()).toEqual({ code: 'last_active_location' });

    // Auditado como operador, sin el correo del Propietario.
    const [event] = await readAudit("action = 'organization.created' and entity_id = $1", [created.organizationId]);
    expect(event).toMatchObject({
      organization_id: created.organizationId,
      actor_type: 'operator',
      metadata: { locationCode: 'EST1', invitationId: created.invitationId, dbUser: 'clinic_operator' },
    });
    expect(JSON.stringify(event)).not.toContain('propietario.este');
  });

  it('org:create rechaza datos inválidos sin crear nada', async () => {
    const before = await readAudit("action = 'organization.created'");
    for (const location of [
      { code: 'est', name: 'X', timezone: 'America/Chicago', address: null, phone: null },
      { code: 'EST2', name: 'X', timezone: 'Hora del Este', address: null, phone: null },
    ]) {
      await expect(
        createOrganization(
          operator,
          { organizationName: 'X', ownerEmail: 'x@example.test', ownerName: 'X', location },
          { baseURL: app.config.baseURL, invitationTtlSeconds: 3600, mailer: new MemoryMailer() },
        ),
      ).rejects.toThrow();
    }
    expect(await readAudit("action = 'organization.created'")).toHaveLength(before.length);
  });

  it('audit:platform: lee los eventos sin organización y cada lectura queda auditada', async () => {
    const since = new Date(Date.now() - 10 * 60 * 1000);
    // Un inicio de sesión fallido (evento sin organización).
    await new Client(app).post('/api/auth/sign-in/email', { email: 'nadie@example.test', password: 'Equivocada-12345' });
    const events = await readPlatformAudit(operator, { since, action: 'auth.sign_in.failure' });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.every((e) => e.action === 'auth.sign_in.failure')).toBe(true);
    const reads = await readAudit("action = 'platform.audit_read' and created_at >= $1", [since]);
    expect(reads.at(-1)).toMatchObject({ organization_id: null, actor_type: 'operator', metadata: { action: 'auth.sign_in.failure', dbUser: 'clinic_operator' } });
  });
});
