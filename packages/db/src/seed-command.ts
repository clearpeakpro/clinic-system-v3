import pg from 'pg';
import { migrate } from './migrate.ts';
import { seed } from './seed.ts';

// `pnpm db:seed`: aplica primero las migraciones pendientes (como `pnpm dev`)
// y después carga la semilla ficticia. Si no puede, se detiene con un mensaje
// claro que dice qué comando ejecutar.

/** Error de `db:seed` con el mensaje para la persona que lo ejecutó. */
export class SeedCommandError extends Error {}

/** Qué hacer ante los errores habituales de una base local. */
const ADVICE: Record<string, string> = {
  ECONNREFUSED: 'La base de datos no responde. Iníciela con «docker compose up -d --wait» (o con «pnpm dev») y vuelva a ejecutar «pnpm db:seed».',
  ENOTFOUND: 'No se encuentra el servidor de la base de datos. Revise DATABASE_MIGRATOR_URL en .env (ver .env.example).',
  '28P01': 'La contraseña de clinic_migrator no coincide. Ejecute «pnpm db:bootstrap» y revise DATABASE_MIGRATOR_URL en .env.',
  '28000': 'El rol clinic_migrator no existe. Ejecute «pnpm db:bootstrap» y vuelva a ejecutar «pnpm db:seed».',
  '3D000': 'La base de datos no existe. Ejecute «pnpm db:bootstrap» y vuelva a ejecutar «pnpm db:seed».',
  '42P01': 'Faltan tablas: la base no tiene todas las migraciones. Ejecute «pnpm db:migrate» y vuelva a ejecutar «pnpm db:seed».',
};

function errorCode(error: unknown): string | undefined {
  for (let e: unknown = error; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    // AggregateError (varias direcciones, p. ej. ::1 y 127.0.0.1).
    const first = (e as { errors?: unknown[] }).errors?.[0];
    if (first && typeof first === 'object' && typeof (first as { code?: unknown }).code === 'string') return (first as { code: string }).code;
  }
  return undefined;
}

/** El mensaje para `error` en el paso `step` («aplicar las migraciones» o «cargar la semilla»). */
export function seedErrorMessage(error: unknown, step: string): string {
  const code = errorCode(error);
  const advice = code ? ADVICE[code] : undefined;
  const suffix = code ? ` (código ${code})` : '';
  return advice
    ? `No se pudo ${step}. ${advice}${suffix}`
    : `No se pudo ${step}. Ejecute «pnpm db:bootstrap» y «pnpm db:migrate», y vuelva a ejecutar «pnpm db:seed»${suffix}.`;
}

/** Migraciones ya aplicadas (0 en una base sin ninguna). */
async function appliedMigrations(migratorUrl: string): Promise<number> {
  const client = new pg.Client({ connectionString: migratorUrl });
  await client.connect();
  try {
    await client.query('SET ROLE clinic_owner');
    const { rows } = await client.query<{ exists: boolean }>(`select to_regclass('drizzle.__drizzle_migrations') is not null as exists`);
    if (!rows[0]?.exists) return 0;
    const count = await client.query<{ n: number }>('select count(*)::int as n from drizzle.__drizzle_migrations');
    return count.rows[0]?.n ?? 0;
  } finally {
    await client.end();
  }
}

/**
 * Aplica las migraciones pendientes y carga la semilla. Devuelve cuántas
 * migraciones aplicó. Lanza `SeedCommandError` con un mensaje claro.
 */
export async function runSeedCommand(migratorUrl: string): Promise<{ migrationsApplied: number }> {
  let migrationsApplied: number;
  try {
    const before = await appliedMigrations(migratorUrl);
    await migrate(migratorUrl);
    migrationsApplied = (await appliedMigrations(migratorUrl)) - before;
  } catch (error) {
    throw new SeedCommandError(seedErrorMessage(error, 'aplicar las migraciones pendientes'), { cause: error });
  }
  try {
    await seed(migratorUrl);
  } catch (error) {
    throw new SeedCommandError(seedErrorMessage(error, 'cargar la semilla'), { cause: error });
  }
  return { migrationsApplied };
}
