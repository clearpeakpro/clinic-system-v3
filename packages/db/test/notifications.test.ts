import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { notifications } from '../src/notifications-schema.ts';
import { outbox } from '../src/ops-schema.ts';
import { decryptNotificationPayload, enqueueNotification, NOTIFICATION_EVENT } from '../src/outbox.ts';
import { notifyRealtime, parseRealtimeMessage, REALTIME_CHANNEL } from '../src/realtime.ts';
import { DEMO } from '../src/seed.ts';
import { createTenantDb, type TenantDb } from '../src/with-tenant.ts';
import { expectPgError, SQLSTATE } from './helpers.ts';

// T-009: notificaciones guardadas (ADR 0008) y canal de tiempo real.
// Aislamiento con el rol real y un pool, purga de 30 días y aviso al borrar
// una sesión. Datos ficticios.

const NORTE = DEMO.norte;
const SUR = DEMO.sur;
const KEY = 'clave-de-prueba-del-outbox-0123456789abcdef';

/** Una cuenta ficticia (clinic_app puede crear usuarios: lo hace Better Auth). */
async function createUser(pool: pg.Pool): Promise<string> {
  const id = uuidv7();
  await pool.query(
    `insert into auth."user" (id, name, email, email_verified, created_at, updated_at) values ($1, 'Persona ficticia', $2, true, now(), now())`,
    [id, `aviso.${id}@example.test`],
  );
  return id;
}

/** Recoge los avisos del canal de tiempo real durante `fn`. */
async function listen(url: string, fn: () => Promise<void>): Promise<string[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const received: string[] = [];
  client.on('notification', (n) => {
    if (n.channel === REALTIME_CHANNEL && n.payload) received.push(n.payload);
  });
  await client.query(`LISTEN ${REALTIME_CHANNEL}`);
  try {
    await fn();
    // Los avisos llegan al confirmarse la transacción; un viaje más los recoge.
    await client.query('select 1');
    await new Promise((resolve) => setTimeout(resolve, 100));
  } finally {
    await client.end();
  }
  return received;
}

describe('notifications', () => {
  let pool: pg.Pool;
  let db: TenantDb;
  let userId: string;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 4 });
    db = createTenantDb(pool);
    userId = await createUser(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  const insert = (organizationId: string, values: Partial<typeof notifications.$inferInsert> = {}) =>
    db.withTenant(organizationId, (tx) =>
      tx
        .insert(notifications)
        .values({ id: uuidv7(), organizationId, userId, kind: 'appointment.changed', code: 'NOR1-C-000001', eventId: uuidv7(), ...values })
        .returning({ id: notifications.id }),
    );

  it('cada organización ve solo las suyas; sin contexto no se ve nada', async () => {
    const [row] = await insert(NORTE.id, { locationId: NORTE.locations[0].id });
    const id = row?.id ?? '';
    expect(await db.withTenant(NORTE.id, (tx) => tx.select().from(notifications).where(eq(notifications.id, id)))).toHaveLength(1);
    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(notifications).where(eq(notifications.id, id)))).toEqual([]);
    expect((await pool.query('select * from app.notifications')).rows).toEqual([]);
  });

  it('no se puede escribir en otra organización ni apuntar a una sede de otra', async () => {
    await expectPgError(
      db.withTenant(SUR.id, (tx) => tx.insert(notifications).values({ id: uuidv7(), organizationId: NORTE.id, userId, kind: 'x', eventId: uuidv7() })),
      SQLSTATE.insufficientPrivilege,
    );
    await expectPgError(insert(NORTE.id, { locationId: SUR.locations[0].id }), SQLSTATE.foreignKeyViolation);
    // Ni mover una fila propia a la otra organización.
    const [row] = await insert(NORTE.id);
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.update(notifications).set({ organizationId: SUR.id }).where(eq(notifications.id, row?.id ?? ''))),
      SQLSTATE.insufficientPrivilege,
    );
  });

  it('un evento del outbox se guarda una sola vez por organización', async () => {
    const eventId = uuidv7();
    await insert(NORTE.id, { eventId });
    await expect(insert(NORTE.id, { eventId })).rejects.toThrow();
  });

  it('solo se purgan las de más de 30 días, y clinic_app no puede borrar directamente', async () => {
    const [old] = await insert(NORTE.id, { createdAt: new Date(Date.now() - 31 * 86_400_000) });
    const [fresh] = await insert(NORTE.id, { createdAt: new Date(Date.now() - 29 * 86_400_000) });
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.delete(notifications)), SQLSTATE.insufficientPrivilege);
    const { rows } = await pool.query<{ purged: number }>('select app.purge_notifications() as purged');
    expect(rows[0]?.purged).toBeGreaterThanOrEqual(1);
    const left = await db.withTenant(NORTE.id, (tx) => tx.select({ id: notifications.id }).from(notifications));
    expect(left.map((r) => r.id)).toContain(fresh?.id);
    expect(left.map((r) => r.id)).not.toContain(old?.id);
  });

  it('enqueueNotification escribe en el outbox de la transacción, con el payload cifrado', async () => {
    const id = await db.withTenant(NORTE.id, (tx) =>
      enqueueNotification(tx, KEY, {
        organizationId: NORTE.id,
        userId,
        kind: 'appointment.changed',
        locationId: NORTE.locations[0].id,
        entityType: 'appointment',
        entityId: randomUUID(),
        code: 'NOR1-C-000002',
      }),
    );
    const [row] = await db.withTenant(NORTE.id, (tx) => tx.select().from(outbox).where(eq(outbox.id, id)));
    expect(row).toMatchObject({ kind: NOTIFICATION_EVENT, status: 'pending', entityType: 'appointment' });
    expect(row?.payload).not.toContain('NOR1-C-000002');
    const payload = decryptNotificationPayload(KEY, { organizationId: NORTE.id, eventId: id }, row?.payload ?? '');
    expect(payload).toMatchObject({ userId, kind: 'appointment.changed', code: 'NOR1-C-000002', locationId: NORTE.locations[0].id });
  });
});

describe('canal de tiempo real', () => {
  let pool: pg.Pool;
  let db: TenantDb;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 4 });
    db = createTenantDb(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  const createSession = async (userId: string) => {
    const id = uuidv7();
    await pool.query(
      `insert into auth.session (id, expires_at, token, created_at, updated_at, user_id) values ($1, now() + interval '1 hour', $2, now(), now(), $3)`,
      [id, `token-${id}`, userId],
    );
    return id;
  };

  it('borrar una sesión avisa con su id, solo al confirmarse', async () => {
    const userId = await createUser(pool);
    const kept = await createSession(userId);
    const deleted = await createSession(userId);
    const received = await listen(inject('appUrl'), async () => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query('delete from auth.session where id = $1', [kept]);
        await client.query('rollback');
      } finally {
        client.release();
      }
      await pool.query('delete from auth.session where id = $1', [deleted]);
    });
    expect(received.map((p) => parseRealtimeMessage(p))).toEqual([{ t: 'session_revoked', session: deleted }]);
  });

  it('notifyRealtime sale al confirmarse la transacción y no si se deshace', async () => {
    const user = randomUUID();
    const received = await listen(inject('appUrl'), async () => {
      await expect(
        db.withTenant(NORTE.id, async (tx) => {
          await notifyRealtime(tx, { t: 'notifications', org: NORTE.id, user: randomUUID() });
          throw new Error('se deshace');
        }),
      ).rejects.toThrow('se deshace');
      await db.withTenant(NORTE.id, (tx) => notifyRealtime(tx, { t: 'notifications', org: NORTE.id, user }));
    });
    expect(received.map((p) => parseRealtimeMessage(p))).toEqual([{ t: 'notifications', org: NORTE.id, user }]);
  });

  it('parseRealtimeMessage descarta lo que no tiene la forma esperada', () => {
    const org = randomUUID();
    const loc = randomUUID();
    expect(parseRealtimeMessage('no es json')).toBeNull();
    expect(parseRealtimeMessage(undefined)).toBeNull();
    expect(parseRealtimeMessage(JSON.stringify({ t: 'otro' }))).toBeNull();
    expect(parseRealtimeMessage(JSON.stringify({ t: 'session_revoked', session: 'x' }))).toBeNull();
    expect(parseRealtimeMessage(JSON.stringify({ t: 'revalidate', org, user: 'x' }))).toBeNull();
    expect(parseRealtimeMessage(JSON.stringify({ t: 'event', org, loc, name: 'a', ids: { patient: 'Ana' } }))).toBeNull();
    expect(parseRealtimeMessage(JSON.stringify({ t: 'revalidate', org }))).toEqual({ t: 'revalidate', org });
    expect(parseRealtimeMessage(JSON.stringify({ t: 'event', org, loc, name: 'a.changed', ids: { a: org } }))).toEqual({
      t: 'event',
      org,
      loc,
      name: 'a.changed',
      ids: { a: org },
    });
    // T-015: el estado nuevo de la cita, solo como constante (nunca texto libre).
    expect(parseRealtimeMessage(JSON.stringify({ t: 'event', org, loc, name: 'appointment.changed', ids: { appointment: org }, status: 'CANCELLED' }))).toEqual({
      t: 'event',
      org,
      loc,
      name: 'appointment.changed',
      ids: { appointment: org },
      status: 'CANCELLED',
    });
    expect(parseRealtimeMessage(JSON.stringify({ t: 'event', org, loc, name: 'a', ids: {}, status: 'Ana López' }))).toBeNull();
  });
});
