import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as drizzleMigrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

// Migración 0019: antes del índice único, borra los registros de MFA
// duplicados que dejaron dos inscripciones a la vez (como en una base de
// desarrollo). Se prueba en una base aparte: migraciones hasta la 0018,
// duplicados y después el resto.

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));
const DB = `twofactor_${randomUUID().slice(0, 8)}`;

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

describe('migración 0019: un solo registro de MFA por persona', () => {
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
    partial = mkdtempSync(join(tmpdir(), 'migraciones-'));
    cpSync(migrationsFolder, partial, { recursive: true });
    const journalPath = join(partial, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { idx: number }[] };
    journal.entries = journal.entries.filter((e) => e.idx <= 18);
    writeFileSync(journalPath, JSON.stringify(journal));
  });

  afterAll(async () => {
    rmSync(partial, { recursive: true, force: true });
    await superuser.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    await superuser.end();
  });

  it('conserva el verificado si lo hay y, si no, el más reciente', async () => {
    await migrateAsOwner(migratorUrl, partial);
    const db = new pg.Client({ connectionString: withDatabase(inject('superuserUrl'), DB) });
    await db.connect();
    const user = async () => {
      const id = uuidv7();
      await db.query(`insert into auth."user" (id, name, email, email_verified, created_at, updated_at) values ($1, 'Persona ficticia', $2, true, now(), now())`, [
        id,
        `mfa.${id}@example.test`,
      ]);
      return id;
    };
    const factor = async (userId: string, verified: boolean) => {
      const id = uuidv7();
      await db.query(`insert into auth.two_factor (id, secret, backup_codes, user_id, verified) values ($1, 's', 'b', $2, $3)`, [id, userId, verified]);
      return id;
    };
    // Dos sin verificar: queda el más reciente.
    const pending = await user();
    await factor(pending, false);
    const latest = await factor(pending, false);
    // Uno verificado y otro posterior sin verificar: queda el verificado.
    const enrolled = await user();
    const verified = await factor(enrolled, true);
    await factor(enrolled, false);
    // Sin duplicados: no se toca.
    const single = await user();
    const only = await factor(single, false);

    await migrateAsOwner(migratorUrl, migrationsFolder);
    const { rows } = await db.query<{ id: string; user_id: string }>('select id, user_id from auth.two_factor order by user_id');
    expect(Object.fromEntries(rows.map((r) => [r.user_id, r.id]))).toEqual({ [pending]: latest, [enrolled]: verified, [single]: only });
    await db.end();
  });
});
