import { createTenantDb, locations } from '@clinic/db';
import { eq, inArray } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { IdempotencyService, idempotencyKeyOf, requestHash } from '../src/idempotency.ts';
import { HttpError } from '../src/services.ts';
import {
  Client,
  createStaff,
  enrollTotp,
  newOrganization,
  NORTE,
  readAudit,
  selectContext,
  signedInWithContext,
  signIn,
  startApp,
  totp,
  type TestApp,
} from './support.ts';

// T-008 en la API: eventos de autenticación fail-closed, estado del correo de
// las invitaciones (outbox) en Usuarios e Idempotency-Key.

describe('T-008 en la API', () => {
  let app: TestApp;
  let superuser: pg.Pool;

  beforeAll(async () => {
    app = await startApp();
    // En las pruebas de la API, `operatorUrl` es el superusuario de la base desechable.
    superuser = new pg.Pool({ connectionString: inject('operatorUrl'), max: 2 });
  });
  afterAll(async () => {
    await superuser.end();
    await app.close();
  });

  describe('eventos de autenticación fail-closed (ADR 0023)', () => {
    /** Simula que no se puede escribir la auditoría (y la restaura al terminar). */
    const withoutAudit = async (fn: () => Promise<void>) => {
      await superuser.query('REVOKE INSERT ON app.audit_log FROM clinic_app');
      try {
        await fn();
      } finally {
        await superuser.query('GRANT INSERT ON app.audit_log TO clinic_app');
      }
    };
    const sessionsOf = async (userId: string) =>
      Number((await superuser.query<{ n: string }>('select count(*) as n from auth.session where user_id = $1', [userId])).rows[0]?.n);

    it('sin auditoría no se abre ninguna sesión: 503', async () => {
      const staff = await createStaff(app, 'failclosed-entrada', [{ org: NORTE, location: 0, role: 'recepcion' }]);
      await withoutAudit(async () => {
        const response = await signIn(new Client(app), staff);
        expect(response.statusCode).toBe(503);
        expect(response.json()).toMatchObject({ code: 'audit_unavailable' });
        // Un intento fallido tampoco pasa sin rastro.
        const wrong = await new Client(app).post('/api/auth/sign-in/email', { email: staff.email, password: 'Equivocada-12345' });
        expect(wrong.statusCode).toBe(503);
      });
      expect(await sessionsOf(staff.userId)).toBe(0);
      // Con la auditoría de vuelta, entra y queda el evento.
      expect((await signIn(new Client(app), staff)).statusCode).toBe(200);
      expect(await readAudit("action = 'auth.sign_in.success' and actor_id = $1", [staff.userId])).toHaveLength(1);
    });

    it('con MFA: sin auditoría, el código correcto no abre sesión', async () => {
      const staff = await createStaff(app, 'failclosed-mfa', [{ org: NORTE, location: null, role: 'administrador' }]);
      const enroller = new Client(app);
      await signIn(enroller, staff);
      const { secret } = await enrollTotp(enroller, staff);
      const client = new Client(app);
      expect((await signIn(client, staff)).json()).toMatchObject({ twoFactorRedirect: true });
      const before = await sessionsOf(staff.userId);
      await withoutAudit(async () => {
        const verify = await client.post('/api/auth/two-factor/verify-totp', { code: await totp(secret) });
        expect(verify.statusCode).toBe(503);
      });
      expect(await sessionsOf(staff.userId)).toBe(before);
      expect(await readAudit("action = 'auth.sign_in.mfa_required' and actor_id = $1", [staff.userId])).toHaveLength(1);
    });

    it('sin auditoría no se cierra la sesión (503) y sigue válida', async () => {
      const staff = await createStaff(app, 'failclosed-salida', [{ org: NORTE, location: 0, role: 'recepcion' }]);
      const client = await signedInWithContext(app, staff, NORTE);
      await withoutAudit(async () => {
        expect((await client.post('/api/auth/sign-out', {})).statusCode).toBe(503);
      });
      expect((await client.get('/api/me')).statusCode).toBe(200);
      expect((await client.post('/api/auth/sign-out', {})).statusCode).toBe(200);
      expect(await readAudit("action = 'auth.sign_out' and actor_id = $1", [staff.userId])).toHaveLength(1);
    });
  });

  it('Usuarios muestra el estado del correo de cada invitación (outbox)', async () => {
    const { owner } = await newOrganization(app, 'MAIL1');
    const created = await owner.post('/api/invitations', { email: 'estado.correo@example.test', name: 'Persona', roles: ['administrador'], locationIds: [] });
    expect(created.statusCode).toBe(201);
    expect(created.json()).not.toHaveProperty('mailSent');
    const { invitationId } = created.json<{ invitationId: string }>();
    const status = async () =>
      (await owner.get('/api/users')).json<{ rows: { kind: string; invitationId?: string; mailStatus?: string | null }[] }>().rows.find((r) => r.invitationId === invitationId)
        ?.mailStatus;
    expect(await status()).toBe('pending');
    // El worker lo marca como fallido tras agotar los intentos.
    await superuser.query(`update app.outbox set status = 'failed', payload = null where entity_id = $1`, [invitationId]);
    expect(await status()).toBe('failed');
    // «Reenviar» crea una invitación nueva con su propio correo pendiente.
    const resent = await owner.post(`/api/invitations/${invitationId}/resend`, {});
    const newId = resent.json<{ invitationId: string }>().invitationId;
    const rows = (await owner.get('/api/users')).json<{ rows: { invitationId?: string; mailStatus?: string | null }[] }>().rows;
    expect(rows.find((r) => r.invitationId === newId)?.mailStatus).toBe('pending');
  });

  describe('Idempotency-Key (ADR 0019)', () => {
    let service: IdempotencyService;
    let org: typeof NORTE;

    beforeAll(async () => {
      service = new IdempotencyService(createTenantDb(app.pool));
      ({ org } = await newOrganization(app, 'IDEM1'));
    });

    /** Un cambio real (una sede) y su lectura: lo que haría un endpoint de la fase 3. */
    const createLocation = (code: string, key: string, body: Record<string, unknown> = { code, name: `Sede ${code}` }) =>
      service.run(
        org.id,
        key,
        { method: 'POST', path: '/api/locations', body },
        async (tx) => {
          const [row] = await tx
            .insert(locations)
            .values({ organizationId: org.id, code: String(body.code), name: String(body.name), timezone: 'America/Chicago' })
            .returning({ id: locations.id });
          return { status: 201, resourceIds: [row?.id ?? ''] };
        },
        (ids) =>
          createTenantDb(app.pool).withTenant(org.id, (tx) =>
            tx.select({ id: locations.id, code: locations.code }).from(locations).where(inArray(locations.id, ids)),
          ),
      );
    const countCode = async (code: string) =>
      (await createTenantDb(app.pool).withTenant(org.id, (tx) => tx.select().from(locations).where(eq(locations.code, code)))).length;

    it('la misma clave devuelve la misma respuesta sin repetir el cambio', async () => {
      const first = await createLocation('IDA1', 'clave-idem-0001');
      const again = await createLocation('IDA1', 'clave-idem-0001');
      expect(first).toMatchObject({ status: 201, replayed: false });
      expect(again).toMatchObject({ status: 201, replayed: true, body: first.body });
      expect(await countCode('IDA1')).toBe(1);
      // Solo el estado y los ids: nunca la respuesta.
      const { rows } = await superuser.query('select response_status, resource_ids from app.idempotency_keys where key = $1', ['clave-idem-0001']);
      expect(rows).toEqual([{ response_status: 201, resource_ids: [first.body[0]?.id] }]);
    });

    it('la misma clave con otro contenido devuelve 409', async () => {
      await createLocation('IDB1', 'clave-idem-0002');
      await expect(createLocation('IDB2', 'clave-idem-0002')).rejects.toMatchObject({ status: 409, code: 'idempotency_key_reused' });
      expect(await countCode('IDB2')).toBe(0);
    });

    it('dos peticiones a la vez con la misma clave crean una sola vez', async () => {
      const results = await Promise.all([createLocation('IDC1', 'clave-idem-0003'), createLocation('IDC1', 'clave-idem-0003')]);
      expect(results.filter((r) => !r.replayed)).toHaveLength(1);
      expect(results[0].body).toEqual(results[1].body);
      expect(await countCode('IDC1')).toBe(1);
    });

    it('si el cambio falla, la clave no queda reservada', async () => {
      await createLocation('IDD1', 'clave-idem-0004');
      // Mismo código en otra clave: viola el UNIQUE y se deshace todo.
      await expect(createLocation('IDD1', 'clave-idem-0005')).rejects.toThrow();
      const { rows } = await superuser.query('select 1 from app.idempotency_keys where key = $1', ['clave-idem-0005']);
      expect(rows).toEqual([]);
      expect((await createLocation('IDD2', 'clave-idem-0005')).replayed).toBe(false);
    });

    it('la clave es por organización, y el hash no depende del orden de los campos', async () => {
      expect(requestHash({ method: 'post', path: '/x', body: { a: 1, b: [2, { c: 3, d: 4 }] } })).toBe(
        requestHash({ method: 'POST', path: '/x', body: { b: [2, { d: 4, c: 3 }], a: 1 } }),
      );
      expect(requestHash({ method: 'POST', path: '/x', body: { a: 1 } })).not.toBe(requestHash({ method: 'POST', path: '/y', body: { a: 1 } }));
      const other = new IdempotencyService(createTenantDb(app.pool));
      const norte = await other.run(NORTE.id, 'clave-idem-0001', { method: 'POST', path: '/x', body: {} }, () => Promise.resolve({ status: 200, resourceIds: [] }), () => Promise.resolve('ok'));
      expect(norte.replayed).toBe(false);
    });

    it('el encabezado Idempotency-Key es obligatorio y con formato', () => {
      expect(idempotencyKeyOf({ 'idempotency-key': 'clave-valida-01' })).toBe('clave-valida-01');
      for (const headers of [{}, { 'idempotency-key': 'corta' }, { 'idempotency-key': 'con espacios no' }]) {
        expect(() => idempotencyKeyOf(headers)).toThrow(HttpError);
      }
    });
  });

  it('el evento de entrada sigue en la cadena de plataforma', async () => {
    const staff = await createStaff(app, 't008-cadena', [{ org: NORTE, location: 0, role: 'recepcion' }]);
    const client = new Client(app);
    await signIn(client, staff);
    await selectContext(client, NORTE);
    const { rows } = await superuser.query<{ chain: string; seq: string; hash: string }>(
      `select chain, seq, hash from app.audit_log where action = 'auth.sign_in.success' and actor_id = $1`,
      [staff.userId],
    );
    expect(rows[0]).toMatchObject({ chain: 'platform', hash: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown });
    const { rows: check } = await superuser.query<{ ok: boolean }>(`select * from app.verify_audit_chain('platform')`);
    expect(check[0]?.ok).toBe(true);
  });
});
