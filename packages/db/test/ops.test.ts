import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { idempotencyKeys, outbox } from '../src/ops-schema.ts';
import { decryptPayload, encryptPayload, enqueueMail } from '../src/outbox.ts';
import { DEMO } from '../src/seed.ts';
import { createTenantDb, type TenantDb } from '../src/with-tenant.ts';
import { expectPgError, SQLSTATE } from './helpers.ts';

// T-008 (ADR 0019): outbox e idempotency_keys. Aislamiento con el rol real y
// un pool, funciones del worker y cifrado del payload.

const NORTE = DEMO.norte;
const SUR = DEMO.sur;
const KEY = 'clave-de-prueba-del-outbox-0123456789abcdef';

describe('outbox', () => {
  let pool: pg.Pool;
  let db: TenantDb;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 4 });
    db = createTenantDb(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  it('se escribe en la transacción del cambio, cifrado; Sur y sin contexto no ven nada', async () => {
    const id = await db.withTenant(NORTE.id, (tx) =>
      enqueueMail(tx, KEY, { organizationId: NORTE.id, kind: 'mail.invitation', mail: { to: 'x@example.test', subject: 'Asunto', text: 'Enlace secreto-123' } }),
    );
    const [row] = await db.withTenant(NORTE.id, (tx) => tx.select().from(outbox).where(eq(outbox.id, id)));
    expect(row).toMatchObject({ status: 'pending', attempts: 0, kind: 'mail.invitation' });
    expect(row?.payload).not.toContain('secreto-123');
    expect(decryptPayload(KEY, { organizationId: NORTE.id, eventId: id }, row?.payload ?? '')).toEqual({
      to: 'x@example.test',
      subject: 'Asunto',
      text: 'Enlace secreto-123',
    });

    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(outbox).where(eq(outbox.id, id)))).toEqual([]);
    expect((await pool.query('select * from app.outbox')).rows).toEqual([]);
    await expectPgError(
      db.withTenant(SUR.id, (tx) => tx.insert(outbox).values({ organizationId: NORTE.id, kind: 'x' })),
      SQLSTATE.insufficientPrivilege,
    );
  });

  it('si la transacción se deshace, el evento no existe', async () => {
    let id = '';
    await expect(
      db.withTenant(NORTE.id, async (tx) => {
        id = await enqueueMail(tx, KEY, { organizationId: NORTE.id, kind: 'mail.invitation', mail: { to: 'y@example.test', subject: 'S', text: 'T' } });
        throw new Error('se deshace');
      }),
    ).rejects.toThrow('se deshace');
    expect(await db.withTenant(NORTE.id, (tx) => tx.select().from(outbox).where(eq(outbox.id, id)))).toEqual([]);
  });

  it('el payload está atado a su evento y su organización, y no se puede alterar', () => {
    const ids = { organizationId: NORTE.id, eventId: randomUUID() };
    const sealed = encryptPayload(KEY, ids, { to: 'a@example.test', subject: 'S', text: 'T' });
    expect(() => decryptPayload(KEY, { ...ids, organizationId: SUR.id }, sealed)).toThrow();
    expect(() => decryptPayload(KEY, { ...ids, eventId: randomUUID() }, sealed)).toThrow();
    expect(() => decryptPayload('otra-clave-de-prueba-0123456789abcdef0', ids, sealed)).toThrow();
    const parts = sealed.split('.');
    parts[3] = `${parts[3]?.slice(0, -2) ?? ''}AA`;
    expect(() => decryptPayload(KEY, ids, parts.join('.'))).toThrow();
    expect(() => encryptPayload('corta', ids, { to: 'a', subject: 'b', text: 'c' })).toThrow(/32/);
  });

  it('outbox_due devuelve solo organización e id de los pendientes vencidos, de todas las organizaciones', async () => {
    const norte = await db.withTenant(NORTE.id, (tx) =>
      enqueueMail(tx, KEY, { organizationId: NORTE.id, kind: 'mail.invitation', mail: { to: 'n@example.test', subject: 'S', text: 'T' } }),
    );
    const sur = await db.withTenant(SUR.id, (tx) =>
      enqueueMail(tx, KEY, { organizationId: SUR.id, kind: 'mail.invitation', mail: { to: 's@example.test', subject: 'S', text: 'T' } }),
    );
    const later = await db.withTenant(SUR.id, async (tx) => {
      const id = await enqueueMail(tx, KEY, { organizationId: SUR.id, kind: 'mail.invitation', mail: { to: 't@example.test', subject: 'S', text: 'T' } });
      await tx.update(outbox).set({ nextAttemptAt: new Date(Date.now() + 3_600_000) }).where(eq(outbox.id, id));
      return id;
    });
    const { rows, fields } = await pool.query<{ organization_id: string; id: string }>('select * from app.outbox_due(1000)');
    expect(fields.map((f) => f.name)).toEqual(['organization_id', 'id']);
    expect(rows).toEqual(expect.arrayContaining([{ organization_id: NORTE.id, id: norte }, { organization_id: SUR.id, id: sur }]));
    expect(rows.some((r) => r.id === later)).toBe(false);
  });
});

describe('idempotency_keys', () => {
  let pool: pg.Pool;
  let db: TenantDb;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 4 });
    db = createTenantDb(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  const insert = (organizationId: string, key: string, expiresAt: Date) =>
    db.withTenant(organizationId, (tx) =>
      tx.insert(idempotencyKeys).values({ organizationId, key, requestHash: 'h', responseStatus: 201, resourceIds: [randomUUID()], expiresAt }),
    );

  it('la clave es única por organización y cada una ve solo las suyas', async () => {
    const key = `clave-${randomUUID()}`;
    const future = new Date(Date.now() + 86_400_000);
    await insert(NORTE.id, key, future);
    await expect(insert(NORTE.id, key, future)).rejects.toThrow();
    await insert(SUR.id, key, future);
    const sur = await db.withTenant(SUR.id, (tx) => tx.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key)));
    expect(sur.map((r) => r.organizationId)).toEqual([SUR.id]);
    expect((await pool.query('select * from app.idempotency_keys')).rows).toEqual([]);
  });

  it('solo se purgan las vencidas, y clinic_app no puede borrar directamente', async () => {
    const old = `vencida-${randomUUID()}`;
    const fresh = `vigente-${randomUUID()}`;
    await insert(NORTE.id, old, new Date(Date.now() - 1000));
    await insert(NORTE.id, fresh, new Date(Date.now() + 86_400_000));
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.delete(idempotencyKeys)), SQLSTATE.insufficientPrivilege);
    const { rows } = await pool.query<{ purge_idempotency_keys: number }>('select app.purge_idempotency_keys()');
    expect(rows[0]?.purge_idempotency_keys).toBeGreaterThanOrEqual(1);
    const left = await db.withTenant(NORTE.id, (tx) => tx.select({ key: idempotencyKeys.key }).from(idempotencyKeys));
    expect(left.map((r) => r.key)).toContain(fresh);
    expect(left.map((r) => r.key)).not.toContain(old);
  });
});
