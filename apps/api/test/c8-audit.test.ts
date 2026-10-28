import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Client,
  createStaff,
  enrollTotp,
  NORTE,
  readAudit,
  selectContext,
  signIn,
  startApp,
  lastInvitationLink,
  totp,
  type Staff,
  type TestApp,
} from './support.ts';

// Criterio 8 (T-002): inicio de sesión correcto y fallido, inscripción y uso de MFA,
// invitación, aceptación y revocación generan eventos en audit_log con actor,
// organización (si aplica), IP y hora. Sin contraseñas, tokens ni códigos.

describe('criterio 8: auditoría', () => {
  let app: TestApp;
  let admin: Staff;
  // Una IP por cliente (198.51.100.0/24, de documentación): el límite por IP
  // de Better Auth permite 3 inicios de sesión cada 10 s desde la misma IP.
  const ips = ['198.51.100.21', '198.51.100.22', '198.51.100.23', '198.51.100.24', '198.51.100.25'] as const;
  const secrets: string[] = [];
  const startedAt = new Date();

  beforeAll(async () => {
    app = await startApp();
    admin = await createStaff(app, 'aud-admin', [{ org: NORTE, location: null, role: 'administrador' }]);
    secrets.push(admin.password);

    // Inicio de sesión fallido.
    const failed = new Client(app, ips[0]);
    const wrongPassword = 'Clave-equivocada-XYZ-987';
    secrets.push(wrongPassword);
    await failed.post('/api/auth/sign-in/email', { email: admin.email, password: wrongPassword });

    // Inicio correcto + inscripción de MFA.
    const client = new Client(app, ips[1]);
    await signIn(client, admin);
    const { secret, backupCodes } = await enrollTotp(client, admin);
    secrets.push(secret, ...backupCodes);

    // Inicio con MFA (TOTP) y con código de recuperación.
    const withTotp = new Client(app, ips[2]);
    await signIn(withTotp, admin);
    const code = await totp(secret);
    await withTotp.post('/api/auth/two-factor/verify-totp', { code });
    const backup = backupCodes[0] ?? '';
    const withBackup = new Client(app, ips[3]);
    await signIn(withBackup, admin);
    await withBackup.post('/api/auth/two-factor/verify-backup-code', { code: backup });

    // Invitación, aceptación y revocación de la membresía.
    await selectContext(withTotp, NORTE);
    await withTotp.post('/invitations', { email: 'auditada@example.test', role: 'recepcion', locationId: NORTE.locations[0].id });
    const link = lastInvitationLink(app);
    const token = link.searchParams.get('token') ?? '';
    secrets.push(token);
    const newPassword = 'Ficticia-auditada-555';
    secrets.push(newPassword);
    const accepted = await new Client(app, ips[4]).post('/invitations/accept', {
      organizationId: NORTE.id,
      token,
      name: 'Persona Auditada',
      password: newPassword,
    });
    const { membershipId } = accepted.json<{ membershipId: string }>();
    await withTotp.post(`/memberships/${membershipId}/deactivate`, { reason: 'Baja de prueba' });

    // Cookies de sesión: también son secretos.
    for (const value of [...client.cookies.values(), ...withTotp.cookies.values()]) secrets.push(value);
  });
  afterAll(async () => {
    await app.close();
  });

  const eventsSince = () => readAudit('created_at >= $1', [startedAt]);

  it('registra todos los eventos esperados', async () => {
    const actions = new Set((await eventsSince()).map((e) => e.action));
    for (const action of [
      'auth.sign_in.failure',
      'auth.sign_in.success',
      'auth.sign_in.mfa_required',
      'auth.mfa.enrollment_started',
      'auth.mfa.success',
      'invitation.created',
      'invitation.accepted',
      'membership.deactivated',
    ]) {
      expect(actions, action).toContain(action);
    }
    // Un inicio pendiente del segundo factor no se registra como correcto: solo
    // hubo un inicio correcto sin MFA (antes de inscribirse).
    const successes = (await eventsSince()).filter((e) => e.action === 'auth.sign_in.success');
    expect(successes).toHaveLength(1);
    const backup = (await eventsSince()).find(
      (e) => e.action === 'auth.mfa.success' && e.metadata?.method === 'backup_code',
    );
    expect(backup).toBeDefined();
  });

  it('cada evento lleva actor, IP y hora; los de organización, su organización', async () => {
    const events = await eventsSince();
    for (const event of events.filter((e) => /^auth\.(sign_in\.(success|mfa_required)|mfa\.)/.test(e.action))) {
      expect(event, event.action).toMatchObject({ actor_type: 'user', actor_id: admin.userId, organization_id: null });
      expect(ips, event.action).toContain(event.ip);
    }
    for (const event of events.filter((e) => e.action.startsWith('invitation.') || e.action.startsWith('membership.'))) {
      expect(event.organization_id, event.action).toBe(NORTE.id);
      expect(ips, event.action).toContain(event.ip);
      expect(event.actor_id, event.action).not.toBeNull();
    }
    for (const event of events) expect(event.created_at).toBeInstanceOf(Date);
  });

  it('cada evento lleva el id de petición; la desactivación, su motivo', async () => {
    const events = await eventsSince();
    for (const event of events) expect(event.request_id, event.action).toBeTruthy();
    expect(events.find((e) => e.action === 'membership.deactivated')?.reason).toBe('Baja de prueba');
  });

  it('el inicio de sesión fallido guarda el correo con HMAC-SHA256 y clave secreta', async () => {
    const failure = (await eventsSince()).find((e) => e.action === 'auth.sign_in.failure');
    const expected = createHmac('sha256', app.config.auditHmacKey).update(admin.email.toLowerCase()).digest('hex');
    expect(failure).toMatchObject({ actor_type: 'anonymous', actor_id: null, ip: ips[0], organization_id: null });
    expect(failure?.metadata).toEqual({ emailHmac: expected });
    // No es un sha256 simple del correo.
    const { createHash } = await import('node:crypto');
    expect(expected).not.toBe(createHash('sha256').update(admin.email.toLowerCase()).digest('hex'));
  });

  it('ningún secreto ni correo aparece en audit_log ni en los logs técnicos', async () => {
    const auditText = JSON.stringify(await eventsSince());
    const logText = app.logs.text();
    expect(logText.length).toBeGreaterThan(0);
    for (const secret of secrets.filter((s) => s.length >= 6)) {
      expect(auditText.includes(secret), 'audit_log').toBe(false);
      expect(logText.includes(secret), 'logs').toBe(false);
    }
    expect(auditText.includes(admin.email)).toBe(false);
    expect(auditText.includes('auditada@example.test')).toBe(false);
  });

  it('clinic_app no puede leer audit_log', async () => {
    await expect(app.pool.query('select * from app.audit_log')).rejects.toMatchObject({ code: '42501' });
  });
});
