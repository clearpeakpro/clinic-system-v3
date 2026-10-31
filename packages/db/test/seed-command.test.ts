import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate as drizzleMigrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { runSeedCommand, SeedCommandError } from '../src/seed-command.ts';
import { DEMO, DEMO_LABS } from '../src/seed.ts';

// `pnpm db:seed` aplica primero las migraciones pendientes (como `pnpm dev`).
// Se prueba en una base aparte que se quedó en la migración 0019, antes de
// T-011b: sin eso, la semilla fallaba con «relation app.lab_providers does
// not exist». Y si no puede, dice qué comando ejecutar.

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));
const DB = `seedcmd_${randomUUID().slice(0, 8)}`;

function withDatabase(url: string, database: string): string {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}

describe('pnpm db:seed', () => {
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
    // Migraciones hasta la 0019, como una base local de antes de T-011b.
    partial = mkdtempSync(join(tmpdir(), 'migraciones-'));
    cpSync(migrationsFolder, partial, { recursive: true });
    const journalPath = join(partial, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { idx: number }[] };
    journal.entries = journal.entries.filter((e) => e.idx <= 19);
    writeFileSync(journalPath, JSON.stringify(journal));
    const client = new pg.Client({ connectionString: migratorUrl });
    await client.connect();
    try {
      await client.query('SET ROLE clinic_owner');
      await drizzleMigrate(drizzle({ client }), { migrationsFolder: partial, migrationsSchema: 'drizzle' });
    } finally {
      await client.end();
    }
  });

  afterAll(async () => {
    rmSync(partial, { recursive: true, force: true });
    await superuser.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    await superuser.end();
  });

  it('con migraciones pendientes, las aplica y después carga la semilla con los laboratorios', async () => {
    const { migrationsApplied } = await runSeedCommand(migratorUrl);
    expect(migrationsApplied).toBeGreaterThanOrEqual(2); // 0020 y 0021 (y las que vengan)
    const db = new pg.Client({ connectionString: withDatabase(inject('superuserUrl'), DB) });
    await db.connect();
    try {
      const { rows } = await db.query<{ organization_id: string; name: string }>('select organization_id, name from app.lab_providers order by name');
      expect(rows.filter((r) => r.organization_id === DEMO.norte.id).map((r) => r.name)).toEqual(DEMO_LABS.providers.map((p) => p.name).sort());
      expect(rows.filter((r) => r.organization_id === DEMO.sur.id)).toHaveLength(DEMO_LABS.providers.length);
    } finally {
      await db.end();
    }
    // Una segunda vez no aplica nada y no duplica la semilla.
    expect(await runSeedCommand(migratorUrl)).toEqual({ migrationsApplied: 0 });
  });

  it('si la base no responde, dice cómo iniciarla', async () => {
    const down = new URL(migratorUrl);
    down.hostname = '127.0.0.1';
    down.port = '1';
    const error = await runSeedCommand(down.toString()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SeedCommandError);
    expect((error as Error).message).toMatch(/^No se pudo aplicar las migraciones pendientes\. La base de datos no responde\. .*docker compose up -d --wait.*\(código ECONNREFUSED\)$/);
  });

  it('si la contraseña de clinic_migrator no coincide, pide pnpm db:bootstrap', async () => {
    const wrong = new URL(migratorUrl);
    wrong.password = 'incorrecta';
    const error = await runSeedCommand(wrong.toString()).catch((e: unknown) => e);
    expect((error as Error).message).toContain('pnpm db:bootstrap');
    expect((error as Error).message).toContain('(código 28P01)');
    // El mensaje no repite la URL ni la contraseña.
    expect((error as Error).message).not.toContain('incorrecta');
  });
});
