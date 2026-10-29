import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as drizzleMigrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { seed } from '../src/seed.ts';

// T-008: la migración 0014 encadena las filas de auditoría que ya existían
// (como en una base de desarrollo o de producción con historia). Se prueba en
// una base aparte: migraciones hasta la 0012, eventos de dos organizaciones y
// de plataforma, y después el resto.

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));
const DB = `backfill_${randomUUID().slice(0, 8)}`;

function withDatabase(url: string, database: string): string {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}

async function migrateAsOwner(url: string, folder: string) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('SET ROLE clinic_owner');
    await drizzleMigrate(drizzle({ client }), { migrationsFolder: folder, migrationsSchema: 'drizzle' });
  } finally {
    await client.end();
  }
}

describe('migración 0014: encadenar la auditoría existente', () => {
  let superuser: pg.Client;
  let migratorUrl: string;
  let partial: string;

  beforeAll(async () => {
    superuser = new pg.Client({ connectionString: inject('superuserUrl') });
    await superuser.connect();
    await superuser.query(`CREATE DATABASE ${DB}`);
    await superuser.query(`GRANT CONNECT ON DATABASE ${DB} TO clinic_migrator, clinic_app, clinic_operator`);
    await superuser.query(`GRANT CREATE ON DATABASE ${DB} TO clinic_owner`);
    migratorUrl = withDatabase(inject('migratorUrl'), DB);

    // Copia de las migraciones hasta la 0012.
    partial = mkdtempSync(join(tmpdir(), 'migraciones-'));
    cpSync(migrationsFolder, partial, { recursive: true });
    const journalPath = join(partial, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { idx: number }[] };
    journal.entries = journal.entries.filter((e) => e.idx <= 12);
    writeFileSync(journalPath, JSON.stringify(journal));
  });

  afterAll(async () => {
    rmSync(partial, { recursive: true, force: true });
    await superuser.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    await superuser.end();
  });

  it('las filas anteriores quedan encadenadas por organización y verificables', async () => {
    await migrateAsOwner(migratorUrl, partial);
    await seed(migratorUrl);
    // Eventos «históricos», insertados como superusuario con fechas pasadas.
    const db = new pg.Client({ connectionString: withDatabase(inject('superuserUrl'), DB) });
    await db.connect();
    const orgs = (await db.query<{ id: string }>('select id from app.organizations order by id')).rows.map((r) => r.id);
    const inserts: [string | null, string][] = [
      [orgs[0] ?? null, '2026-10-01T10:00:00Z'],
      [null, '2026-10-01T10:05:00Z'],
      [orgs[1] ?? null, '2026-10-01T11:00:00Z'],
      [orgs[0] ?? null, '2026-10-02T09:00:00Z'],
      [null, '2026-10-02T09:30:00Z'],
      [orgs[0] ?? null, '2026-10-03T08:00:00Z'],
    ];
    for (const [org, at] of inserts) {
      await db.query(`insert into app.audit_log (id, organization_id, actor_type, action, created_at) values ($1, $2, 'anonymous', 'historico', $3)`, [
        randomUUID(),
        org,
        at,
      ]);
    }

    // El resto de migraciones (0013 en adelante).
    await migrateAsOwner(migratorUrl, migrationsFolder);
    const { rows } = await db.query<{ chain: string; seq: string; created_at: Date }>('select chain, seq, created_at from app.audit_log order by chain, seq');
    const byChain = (chain: string) => rows.filter((r) => r.chain === chain).map((r) => Number(r.seq));
    expect(byChain(orgs[0] ?? '')).toEqual([1, 2, 3]);
    expect(byChain(orgs[1] ?? '')).toEqual([1]);
    expect(byChain('platform')).toEqual([1, 2]);
    // En orden de creación.
    const first = rows.filter((r) => r.chain === orgs[0]);
    expect(first.map((r) => r.created_at.toISOString())).toEqual(['2026-10-01T10:00:00.000Z', '2026-10-02T09:00:00.000Z', '2026-10-03T08:00:00.000Z']);
    for (const chain of [orgs[0] ?? '', orgs[1] ?? '', 'platform']) {
      const { rows: check } = await db.query<{ ok: boolean }>('select * from app.verify_audit_chain($1)', [chain]);
      expect(check[0]?.ok, chain).toBe(true);
    }
    // Y la cadena sigue después del encadenado: el siguiente evento es el 4.
    await db.query(`insert into app.audit_log (id, organization_id, actor_type, action) values ($1, $2, 'anonymous', 'nuevo')`, [randomUUID(), orgs[0]]);
    const { rows: next } = await db.query<{ seq: string }>(`select seq from app.audit_log where action = 'nuevo'`);
    expect(next[0]?.seq).toBe('4');
    await db.end();
  });
});
