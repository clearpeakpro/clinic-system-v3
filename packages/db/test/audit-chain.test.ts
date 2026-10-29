import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { auditLog } from '../src/identity-schema.ts';
import { organizations } from '../src/schema.ts';
import { DEMO } from '../src/seed.ts';
import { createTenantDb, type TenantDb } from '../src/with-tenant.ts';
import { expectPgError, SQLSTATE } from './helpers.ts';

// T-008 (ADR 0018): cadena de hash de la auditoría, calculada por un trigger.
// Una cadena por organización y una de plataforma para los eventos sin
// organización. Las alteraciones se simulan con el superusuario de la base
// desechable: ningún rol de la aplicación puede editar ni borrar audit_log.

interface Verification {
  ok: boolean;
  row_count: string;
  head_seq: string | null;
  head_hash: string | null;
  first_broken_seq: string | null;
}

describe('cadena de hash de la auditoría', () => {
  let app: pg.Pool;
  let superuser: pg.Pool;
  let operator: pg.Pool;
  let db: TenantDb;

  beforeAll(() => {
    app = new pg.Pool({ connectionString: inject('appUrl'), max: 10 });
    superuser = new pg.Pool({ connectionString: inject('superuserUrl'), max: 2 });
    operator = new pg.Pool({ connectionString: inject('operatorUrl'), max: 2 });
    db = createTenantDb(app);
  });
  afterAll(async () => {
    await Promise.all([app.end(), superuser.end(), operator.end()]);
  });

  /** Organización propia de cada prueba: alterar su cadena no afecta a las demás. */
  const newOrganization = async () => {
    const id = randomUUID();
    await createTenantDb(operator).withTenant(id, (tx) => tx.insert(organizations).values({ id, name: 'Organización de prueba' }));
    return id;
  };
  const event = (organizationId: string, action = 'prueba.evento') =>
    db.withTenant(organizationId, (tx) =>
      tx.insert(auditLog).values({ id: randomUUID(), organizationId, actorType: 'anonymous', action, metadata: { n: 1 } }),
    );
  const verify = async (chain: string) => {
    const { rows } = await app.query<Verification>('select * from app.verify_audit_chain($1)', [chain]);
    return rows[0];
  };
  const rowsOf = async (chain: string) =>
    (
      await superuser.query<{ id: string; seq: string; prev_hash: string | null; hash: string; chain: string }>(
        'select id, seq, prev_hash, hash, chain from app.audit_log where chain = $1 order by seq',
        [chain],
      )
    ).rows;

  it('cada evento recibe el siguiente número de su cadena y el hash del anterior', async () => {
    const org = await newOrganization();
    // La aplicación no puede elegir su posición ni su hash.
    await db.withTenant(org, (tx) =>
      tx.insert(auditLog).values({ id: randomUUID(), organizationId: org, actorType: 'anonymous', action: 'a', chain: 'otra', seq: 99, hash: 'falso' }),
    );
    await event(org, 'b');
    const rows = await rowsOf(org);
    expect(rows.map((r) => [r.chain, Number(r.seq)])).toEqual([
      [org, 1],
      [org, 2],
    ]);
    expect(rows[0]?.prev_hash).toBeNull();
    expect(rows[1]?.prev_hash).toBe(rows[0]?.hash);
    expect(rows[0]?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await verify(org)).toMatchObject({ ok: true, row_count: '2', head_seq: '2', first_broken_seq: null });
  });

  it('se mantiene con escrituras concurrentes en la misma organización y en otras', async () => {
    const [a, b] = await Promise.all([newOrganization(), newOrganization()]);
    await Promise.all(Array.from({ length: 30 }, (_, i) => event(i % 2 === 0 ? a : b)));
    for (const org of [a, b]) {
      const rows = await rowsOf(org);
      expect(rows.map((r) => Number(r.seq))).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
      expect(await verify(org)).toMatchObject({ ok: true, row_count: '15' });
    }
  });

  it('si la transacción se deshace, la cadena no avanza', async () => {
    const org = await newOrganization();
    await event(org);
    await expect(
      db.withTenant(org, async (tx) => {
        await tx.insert(auditLog).values({ id: randomUUID(), organizationId: org, actorType: 'anonymous', action: 'deshecho' });
        throw new Error('se deshace');
      }),
    ).rejects.toThrow('se deshace');
    await event(org);
    expect((await rowsOf(org)).map((r) => Number(r.seq))).toEqual([1, 2]);
    expect(await verify(org)).toMatchObject({ ok: true });
  });

  it('alterar una fila rompe la verificación en esa fila', async () => {
    const org = await newOrganization();
    for (let i = 0; i < 4; i++) await event(org);
    await superuser.query(`update app.audit_log set action = 'alterada' where chain = $1 and seq = 3`, [org]);
    expect(await verify(org)).toMatchObject({ ok: false, first_broken_seq: '3' });
  });

  it('borrar una fila del medio o la última también se detecta', async () => {
    const middle = await newOrganization();
    for (let i = 0; i < 4; i++) await event(middle);
    await superuser.query('delete from app.audit_log where chain = $1 and seq = 2', [middle]);
    expect(await verify(middle)).toMatchObject({ ok: false, first_broken_seq: '2' });

    const tail = await newOrganization();
    for (let i = 0; i < 3; i++) await event(tail);
    await superuser.query('delete from app.audit_log where chain = $1 and seq = 3', [tail]);
    expect(await verify(tail)).toMatchObject({ ok: false, first_broken_seq: '3' });
  });

  it('los eventos sin organización van en la cadena de plataforma, también las lecturas del operador', async () => {
    const before = await verify('platform');
    await app.query(`insert into app.audit_log (id, organization_id, actor_type, action) values ($1, null, 'anonymous', 'prueba.plataforma')`, [randomUUID()]);
    const { rows } = await operator.query<{ action: string; seq: string; hash: string }>('select * from app.read_platform_audit(now() - interval \'1 hour\')');
    expect(rows.some((r) => r.action === 'prueba.plataforma')).toBe(true);
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.hash))).toBe(true);
    const after = await verify('platform');
    expect(after).toMatchObject({ ok: true });
    // El evento y la lectura del operador (platform.audit_read).
    expect(Number(after?.row_count)).toBe(Number(before?.row_count ?? 0) + 2);
  });

  it('la lista de cadenas incluye las dos organizaciones ficticias y la plataforma', async () => {
    await event(DEMO.norte.id);
    await event(DEMO.sur.id);
    const { rows } = await app.query<{ chain_id: string }>('select * from app.audit_chains()');
    const chains = rows.map((r) => r.chain_id);
    expect(chains).toEqual(expect.arrayContaining([DEMO.norte.id, DEMO.sur.id, 'platform']));
  });

  it('clinic_app no lee audit_log ni las cabezas, y no puede editar ni borrar', async () => {
    await expectPgError(app.query('select * from app.audit_log'), SQLSTATE.insufficientPrivilege);
    await expectPgError(app.query('select * from app.audit_chain_heads'), SQLSTATE.insufficientPrivilege);
    await expectPgError(app.query(`update app.audit_log set action = 'x'`), SQLSTATE.insufficientPrivilege);
    await expectPgError(app.query('delete from app.audit_log'), SQLSTATE.insufficientPrivilege);
    await expectPgError(operator.query('select * from app.verify_audit_chain($1)', ['platform']), SQLSTATE.insufficientPrivilege);
  });

  it('las funciones corren con search_path vacío y como SECURITY DEFINER de clinic_owner', async () => {
    const { rows } = await superuser.query<{ name: string; owner: string; definer: boolean; config: string[] }>(
      `select p.proname as name, pg_get_userbyid(p.proowner) as owner, p.prosecdef as definer, p.proconfig as config
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'app' and p.proname in ('audit_log_chain', 'verify_audit_chain', 'audit_chains', 'outbox_due', 'purge_idempotency_keys')
        order by p.proname`,
    );
    expect(rows.map((r) => r.name)).toEqual(['audit_chains', 'audit_log_chain', 'outbox_due', 'purge_idempotency_keys', 'verify_audit_chain']);
    for (const row of rows) expect(row, row.name).toMatchObject({ owner: 'clinic_owner', definer: true, config: ['search_path=""'] });
  });
});
