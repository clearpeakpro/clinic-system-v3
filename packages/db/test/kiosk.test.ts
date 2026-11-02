import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { memberships } from '../src/identity-schema.ts';
import { kioskCheckins, kioskDevices } from '../src/kiosk-schema.ts';
import { DEMO } from '../src/seed.ts';
import { createTenantDb, type TenantDb } from '../src/with-tenant.ts';
import { expectPgError, SQLSTATE } from './helpers.ts';

// T-020: tabletas del kiosco y sus registros. Aislamiento con el rol real
// (clinic_app) y un pool; nada se borra; reglas de estado; y las funciones
// SECURITY DEFINER: la búsqueda por hash devuelve solo ids, y el vencimiento
// y el vaciado usan la hora que reciben. El contenido es texto ficticio.

const NORTE = DEMO.norte;
const SUR = DEMO.sur;
const CHECK_VIOLATION = '23514';

type Org = typeof NORTE | typeof SUR;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

describe('kiosco', () => {
  let pool: pg.Pool;
  let db: TenantDb;
  const member: Record<string, string> = {};

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: inject('appUrl'), max: 10 });
    db = createTenantDb(pool);
    for (const org of [NORTE, SUR]) {
      const userId = randomUUID();
      await pool.query(
        `insert into auth."user" (id, name, email, email_verified, created_at, updated_at) values ($1, $2, $3, true, now(), now())`,
        [userId, 'Administración ficticia', `kio.${userId}@example.test`],
      );
      const id = randomUUID();
      await db.withTenant(org.id, (tx) => tx.insert(memberships).values({ id, organizationId: org.id, userId }));
      member[org.id] = id;
    }
  });
  afterAll(async () => {
    await pool.end();
  });

  const now = new Date('2026-11-05T16:00:00Z');
  const by = (org: Org) => member[org.id] ?? '';
  const device = (org: Org, extra: Partial<typeof kioskDevices.$inferInsert> = {}): typeof kioskDevices.$inferInsert => ({
    id: randomUUID(),
    organizationId: org.id,
    locationId: org.locations[0].id,
    name: 'Tableta ficticia',
    status: 'active',
    tokenHash: sha(randomUUID()),
    tokenExpiresAt: new Date('2027-02-03T16:00:00Z'),
    linkedAt: now,
    createdByMembershipId: by(org),
    createdAt: now,
    ...extra,
  });
  const checkin = (org: Org, deviceId: string, extra: Partial<typeof kioskCheckins.$inferInsert> = {}): typeof kioskCheckins.$inferInsert => ({
    organizationId: org.id,
    locationId: org.locations[0].id,
    deviceId,
    contentEnc: 'cifrado-ficticio',
    serviceDate: '2026-11-05',
    expiresAt: new Date('2026-11-06T06:00:00Z'),
    purgeAt: new Date('2026-11-06T16:00:00Z'),
    createdAt: now,
    updatedAt: now,
    ...extra,
  });

  it('cada organización ve solo sus tabletas y registros; sin contexto no se ve nada', async () => {
    const d = device(NORTE);
    await db.withTenant(NORTE.id, async (tx) => {
      await tx.insert(kioskDevices).values(d);
      await tx.insert(kioskCheckins).values(checkin(NORTE, d.id ?? ''));
    });
    expect(await db.withTenant(NORTE.id, (tx) => tx.select().from(kioskDevices).where(eq(kioskDevices.id, d.id ?? '')))).toHaveLength(1);
    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(kioskDevices).where(eq(kioskDevices.id, d.id ?? '')))).toEqual([]);
    expect(await db.withTenant(NORTE.id, (tx) => tx.select().from(kioskCheckins).where(eq(kioskCheckins.deviceId, d.id ?? '')))).toHaveLength(1);
    expect(await db.withTenant(SUR.id, (tx) => tx.select().from(kioskCheckins).where(eq(kioskCheckins.deviceId, d.id ?? '')))).toEqual([]);
    for (const name of ['kiosk_devices', 'kiosk_checkins']) {
      expect((await pool.query(`select * from app.${name}`)).rows).toEqual([]);
    }
    const revoked = await db.withTenant(SUR.id, (tx) => tx.update(kioskDevices).set({ status: 'revoked', tokenHash: null, revokedAt: now }).where(eq(kioskDevices.id, d.id ?? '')).returning());
    expect(revoked).toEqual([]);
  });

  it('no se escribe en otra organización ni se apunta a sus sedes, tabletas o membresías', async () => {
    const norte = device(NORTE);
    await db.withTenant(NORTE.id, (tx) => tx.insert(kioskDevices).values(norte));
    await expectPgError(db.withTenant(SUR.id, (tx) => tx.insert(kioskDevices).values(device(NORTE))), SQLSTATE.insufficientPrivilege);
    await expectPgError(db.withTenant(SUR.id, (tx) => tx.insert(kioskDevices).values(device(SUR, { locationId: NORTE.locations[0].id }))), SQLSTATE.foreignKeyViolation);
    await expectPgError(db.withTenant(SUR.id, (tx) => tx.insert(kioskDevices).values(device(SUR, { createdByMembershipId: by(NORTE) }))), SQLSTATE.foreignKeyViolation);
    await expectPgError(db.withTenant(SUR.id, (tx) => tx.insert(kioskCheckins).values(checkin(SUR, norte.id ?? ''))), SQLSTATE.foreignKeyViolation);
  });

  it('clinic_app no borra tabletas ni registros', async () => {
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.delete(kioskDevices).where(eq(kioskDevices.organizationId, NORTE.id))), SQLSTATE.insufficientPrivilege);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.delete(kioskCheckins).where(eq(kioskCheckins.organizationId, NORTE.id))), SQLSTATE.insufficientPrivilege);
  });

  it('reglas: activa con token; revocada sin token ni código; contenido vacío solo con fecha de vaciado', async () => {
    const bad: Partial<typeof kioskDevices.$inferInsert>[] = [
      { tokenHash: null },
      { status: 'pending' },
      { status: 'revoked' },
      { status: 'revoked', tokenHash: null, revokedAt: now, pairingCodeHash: sha('X') },
      { name: '' },
      { status: 'otro' },
    ];
    for (const extra of bad) {
      await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(kioskDevices).values(device(NORTE, extra))), CHECK_VIOLATION);
    }
    const ok = device(NORTE);
    await db.withTenant(NORTE.id, (tx) => tx.insert(kioskDevices).values(ok));
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(kioskCheckins).values(checkin(NORTE, ok.id ?? '', { contentEnc: null }))), CHECK_VIOLATION);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(kioskCheckins).values(checkin(NORTE, ok.id ?? '', { expiresAt: now }))), CHECK_VIOLATION);
    await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(kioskCheckins).values(checkin(NORTE, ok.id ?? '', { status: 'otro' }))), CHECK_VIOLATION);
  });

  it('funciones: la tableta se encuentra solo activa y por su hash, con ids; el código, solo pendiente', async () => {
    const token = randomUUID();
    const code = randomUUID();
    const active = device(SUR, { tokenHash: sha(token) });
    const pending = device(SUR, { status: 'pending', tokenHash: null, tokenExpiresAt: null, linkedAt: null, pairingCodeHash: sha(code), pairingExpiresAt: now });
    await db.withTenant(SUR.id, async (tx) => {
      await tx.insert(kioskDevices).values(active);
      await tx.insert(kioskDevices).values(pending);
    });
    const found = await pool.query('select * from app.kiosk_device_by_token($1)', [sha(token)]);
    expect(found.rows).toEqual([{ organization_id: SUR.id, location_id: SUR.locations[0].id, device_id: active.id, token_expires_at: active.tokenExpiresAt }]);
    expect((await pool.query('select * from app.kiosk_device_by_token($1)', [sha('otro')])).rows).toEqual([]);
    expect((await pool.query('select * from app.kiosk_pairing_by_code($1)', [sha(code)])).rows).toEqual([
      { organization_id: SUR.id, location_id: SUR.locations[0].id, device_id: pending.id, pairing_expires_at: now },
    ]);
    // Revocada: ya no se encuentra.
    await db.withTenant(SUR.id, (tx) => tx.update(kioskDevices).set({ status: 'revoked', tokenHash: null, revokedAt: now }).where(eq(kioskDevices.id, active.id ?? '')));
    expect((await pool.query('select * from app.kiosk_device_by_token($1)', [sha(token)])).rows).toEqual([]);
  });

  it('el vencimiento y el vaciado usan la hora recibida y devuelven solo conteos', async () => {
    const d = device(NORTE);
    const [row] = await db.withTenant(NORTE.id, async (tx) => {
      await tx.insert(kioskDevices).values(d);
      return tx
        .insert(kioskCheckins)
        .values(checkin(NORTE, d.id ?? '', { expiresAt: new Date('2027-06-02T05:00:00Z'), purgeAt: new Date('2027-06-02T16:00:00Z'), createdAt: new Date('2027-06-01T16:00:00Z') }))
        .returning({ id: kioskCheckins.id });
    });
    const read = async () => (await db.withTenant(NORTE.id, (tx) => tx.select().from(kioskCheckins).where(eq(kioskCheckins.id, row?.id ?? ''))))[0];
    const call = async (fn: string, at: string) => Number((await pool.query<{ n: number }>(`select app.${fn}($1::timestamptz) as n`, [at])).rows[0]?.n);
    // Justo antes del cierre del día: sigue pendiente.
    await call('expire_kiosk_checkins', '2027-06-02T04:59:59Z');
    expect((await read())?.status).toBe('pending');
    expect(await call('expire_kiosk_checkins', '2027-06-02T05:00:00Z')).toBeGreaterThanOrEqual(1);
    expect(await read()).toMatchObject({ status: 'expired', contentEnc: 'cifrado-ficticio' });
    // Vaciado a las 24 h.
    await call('purge_kiosk_checkins', '2027-06-02T15:59:59Z');
    expect((await read())?.contentEnc).toBe('cifrado-ficticio');
    expect(await call('purge_kiosk_checkins', '2027-06-02T16:00:00Z')).toBeGreaterThanOrEqual(1);
    expect(await read()).toMatchObject({ contentEnc: null, contentPurgedAt: new Date('2027-06-02T16:00:00Z') });
  });

  it('T-021: confirmado exige paciente y visita; confirmado o descartado, sin contenido y con quién y cuándo; el paciente, de la misma organización', async () => {
    const d = device(NORTE);
    await db.withTenant(NORTE.id, (tx) => tx.insert(kioskDevices).values(d));
    const purged = { contentEnc: null, contentPurgedAt: now };
    const resolved = { resolvedAt: now, resolvedByMembershipId: by(NORTE) };
    const bad: Partial<typeof kioskCheckins.$inferInsert>[] = [
      { status: 'discarded', ...purged },
      { status: 'discarded', ...resolved },
      { status: 'confirmed', ...purged, ...resolved, patientId: NORTE.patients[0].id },
      { status: 'pending', ...resolved },
    ];
    for (const extra of bad) {
      await expectPgError(db.withTenant(NORTE.id, (tx) => tx.insert(kioskCheckins).values(checkin(NORTE, d.id ?? '', extra))), CHECK_VIOLATION);
    }
    await db.withTenant(NORTE.id, (tx) => tx.insert(kioskCheckins).values(checkin(NORTE, d.id ?? '', { status: 'discarded', ...purged, ...resolved })));
    await expectPgError(
      db.withTenant(NORTE.id, (tx) => tx.insert(kioskCheckins).values(checkin(NORTE, d.id ?? '', { patientId: SUR.patients[0].id }))),
      SQLSTATE.foreignKeyViolation,
    );
  });
});
