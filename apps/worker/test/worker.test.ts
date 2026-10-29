import { randomUUID } from 'node:crypto';
import { createTenantDb, DEMO, enqueueMail, idempotencyKeys, outbox, type TenantDb } from '@clinic/db';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { WORKER_DEFAULTS, loadWorkerConfig } from '../src/config.ts';
import { backoffSeconds, deliverEvent, type DeliverDeps } from '../src/deliver.ts';
import { MemoryMailer, type Mailer } from '../src/mailer.ts';
import { purgeIdempotencyKeys, verifyAuditChains } from '../src/maintenance.ts';
import { startWorker } from '../src/worker.ts';

// T-008: el worker entrega el outbox al menos una vez sin procesar dos veces
// un evento, sobrevive a una caída a mitad del trabajo, verifica las cadenas
// de auditoría y purga las claves de idempotencia. Todo como clinic_app.

const NORTE = DEMO.norte;
const KEY = 'clave-de-prueba-del-outbox-0123456789abcdef';

describe('worker', () => {
  let pool: pg.Pool;
  let superuser: pg.Pool;
  let tenantDb: TenantDb;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 6 });
    superuser = new pg.Pool({ connectionString: inject('superuserUrl'), max: 2 });
    tenantDb = createTenantDb(pool);
  });
  afterAll(async () => {
    await Promise.all([pool.end(), superuser.end()]);
  });

  const enqueue = (to = `persona.${randomUUID().slice(0, 8)}@example.test`) =>
    tenantDb.withTenant(NORTE.id, (tx) =>
      enqueueMail(tx, KEY, {
        organizationId: NORTE.id,
        kind: 'mail.invitation',
        entityType: 'invitation',
        entityId: randomUUID(),
        mail: { to, subject: 'Invitación a Clinic System', text: 'Enlace ficticio con token-secreto' },
      }),
    );
  const rowOf = async (id: string) => (await tenantDb.withTenant(NORTE.id, (tx) => tx.select().from(outbox).where(eq(outbox.id, id))))[0];
  const deps = (mailer: Mailer, extra: Partial<DeliverDeps> = {}): DeliverDeps => ({ tenantDb, mailer, outboxKey: KEY, maxAttempts: 3, ...extra });
  const failing: Mailer = { send: () => Promise.reject(new Error('SMTP caído')) };

  it('configuración: solo clinic_app y con OUTBOX_KEY', () => {
    const base = { DATABASE_APP_URL: inject('appUrl'), OUTBOX_KEY: KEY };
    expect(loadWorkerConfig(base)).toMatchObject({ outboxMaxAttempts: WORKER_DEFAULTS.outboxMaxAttempts });
    expect(() => loadWorkerConfig({ ...base, DATABASE_APP_URL: inject('superuserUrl') })).toThrow(/clinic_app/);
    expect(() => loadWorkerConfig({ ...base, OUTBOX_KEY: 'corta' })).toThrow(/OUTBOX_KEY/);
  });

  it('entrega el correo, lo marca y borra el payload; el Message-ID es el id del evento', async () => {
    const mailer = new MemoryMailer();
    const id = await enqueue('entrega@example.test');
    expect(await deliverEvent(deps(mailer), { organizationId: NORTE.id, id })).toBe('sent');
    expect(mailer.sent).toEqual([{ to: 'entrega@example.test', subject: 'Invitación a Clinic System', text: 'Enlace ficticio con token-secreto', messageId: id }]);
    expect(await rowOf(id)).toMatchObject({ status: 'sent', attempts: 1, payload: null, lastError: null });
  });

  it('un evento repetido no se procesa dos veces, tampoco si llegan dos trabajos a la vez', async () => {
    const mailer = new MemoryMailer();
    const id = await enqueue();
    const results = await Promise.all([1, 2, 3].map(() => deliverEvent(deps(mailer), { organizationId: NORTE.id, id })));
    expect(results.filter((r) => r === 'sent')).toHaveLength(1);
    expect(await deliverEvent(deps(mailer), { organizationId: NORTE.id, id })).toBe('skipped');
    expect(mailer.sent).toHaveLength(1);
  });

  it('si el worker se cae a mitad del trabajo, el evento no se pierde', async () => {
    const mailer = new MemoryMailer();
    const crash = () => {
      throw new Error('el proceso se cae');
    };
    // Antes de enviar: nada salió y la fila sigue pendiente.
    const before = await enqueue();
    await expect(deliverEvent(deps(mailer, { hooks: { beforeSend: crash } }), { organizationId: NORTE.id, id: before })).rejects.toThrow('se cae');
    expect(await rowOf(before)).toMatchObject({ status: 'pending', attempts: 0 });
    expect(await deliverEvent(deps(mailer), { organizationId: NORTE.id, id: before })).toBe('sent');

    // Después de enviar y antes de marcarlo: se reenvía (al menos una vez), con el mismo Message-ID.
    const after = await enqueue();
    await expect(deliverEvent(deps(mailer, { hooks: { afterSend: crash } }), { organizationId: NORTE.id, id: after })).rejects.toThrow('se cae');
    expect(await rowOf(after)).toMatchObject({ status: 'pending', attempts: 0 });
    expect(await deliverEvent(deps(mailer), { organizationId: NORTE.id, id: after })).toBe('sent');
    expect(mailer.sent.filter((m) => m.messageId === after)).toHaveLength(2);
    expect(mailer.sent.filter((m) => m.messageId === before)).toHaveLength(1);
  });

  it('reintenta con espera creciente; al agotar los intentos lo marca fallido, borra el payload y lo audita', async () => {
    expect([1, 2, 3, 10].map(backoffSeconds)).toEqual([30, 60, 120, 3600]);
    const id = await enqueue();
    expect(await deliverEvent(deps(failing), { organizationId: NORTE.id, id })).toBe('retry');
    const retried = await rowOf(id);
    expect(retried).toMatchObject({ status: 'pending', attempts: 1, lastError: 'smtp_error' });
    expect(retried?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 20_000);
    // Antes de su hora no se intenta.
    expect(await deliverEvent(deps(failing), { organizationId: NORTE.id, id })).toBe('skipped');

    await tenantDb.withTenant(NORTE.id, (tx) => tx.update(outbox).set({ nextAttemptAt: new Date(Date.now() - 1000), attempts: 2 }).where(eq(outbox.id, id)));
    expect(await deliverEvent(deps(failing), { organizationId: NORTE.id, id })).toBe('failed');
    expect(await rowOf(id)).toMatchObject({ status: 'failed', attempts: 3, payload: null });
    const { rows } = await superuser.query<{ actor_type: string; entity_type: string; metadata: Record<string, unknown> }>(
      `select actor_type, entity_type, metadata from app.audit_log where action = 'mail.failed' and metadata->>'outboxEventId' = $1`,
      [id],
    );
    expect(rows).toEqual([{ actor_type: 'system', entity_type: 'invitation', metadata: { outboxEventId: id, kind: 'mail.invitation', attempts: 3 } }]);
  });

  it('el proceso completo: al confirmarse la transacción, el aviso lo despierta y entrega con pg-boss', async () => {
    const mailer = new MemoryMailer();
    const worker = await startWorker(
      { ...loadWorkerConfig({ DATABASE_APP_URL: inject('appUrl'), OUTBOX_KEY: KEY }), outboxSweepSeconds: 3600 },
      mailer,
    );
    try {
      // Lo pendiente de las pruebas anteriores también sale.
      const id = await enqueue('aviso@example.test');
      await expect.poll(() => mailer.sent.some((m) => m.messageId === id), { timeout: 20_000 }).toBe(true);
      expect(await rowOf(id)).toMatchObject({ status: 'sent' });
      // Un barrido después no vuelve a enviarlo.
      await worker.sweep();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(mailer.sent.filter((m) => m.messageId === id)).toHaveLength(1);
    } finally {
      await worker.stop();
    }
  });

  it('verifica las cadenas, deja el resultado en cada una y detecta una alteración', async () => {
    await tenantDb.withTenant(NORTE.id, (tx) => enqueueMail(tx, KEY, { organizationId: NORTE.id, kind: 'x', mail: { to: 'a@example.test', subject: 'S', text: 'T' } }));
    const ok = await verifyAuditChains(pool, tenantDb);
    expect(ok.every((r) => r.ok)).toBe(true);
    const { rows: verified } = await superuser.query<{ chain: string; metadata: Record<string, unknown> }>(
      `select chain, metadata from app.audit_log where action = 'audit.chain_verified'`,
    );
    expect(verified.map((r) => r.chain)).toEqual(expect.arrayContaining(ok.map((r) => r.chain)));
    expect(verified[0]?.metadata).toMatchObject({ headHash: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown });

    const { rows } = await superuser.query<{ seq: string }>(`select seq from app.audit_log where chain = $1 order by seq limit 1`, [NORTE.id]);
    await superuser.query(`update app.audit_log set reason = 'alterada' where chain = $1 and seq = $2`, [NORTE.id, rows[0]?.seq]);
    const broken = await verifyAuditChains(pool, tenantDb);
    expect(broken.find((r) => r.chain === NORTE.id)).toMatchObject({ ok: false, firstBrokenSeq: Number(rows[0]?.seq) });
    const { rows: alerts } = await superuser.query(`select 1 from app.audit_log where action = 'audit.chain_broken' and chain = $1`, [NORTE.id]);
    expect(alerts).toHaveLength(1);
  });

  it('purga las claves de idempotencia vencidas', async () => {
    const key = `vencida-${randomUUID()}`;
    await tenantDb.withTenant(NORTE.id, (tx) =>
      tx.insert(idempotencyKeys).values({ organizationId: NORTE.id, key, requestHash: 'h', responseStatus: 201, resourceIds: [], expiresAt: new Date(Date.now() - 1000) }),
    );
    expect(await purgeIdempotencyKeys(pool)).toBeGreaterThanOrEqual(1);
    expect(await tenantDb.withTenant(NORTE.id, (tx) => tx.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key)))).toEqual([]);
  });
});
