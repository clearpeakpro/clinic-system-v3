import { runSeedCommand, SeedCommandError } from '../src/seed-command.ts';
import { requireEnv } from './env.ts';

if (process.env.NODE_ENV === 'production') {
  throw new Error('La semilla ficticia no se ejecuta en producción.');
}
try {
  // Primero las migraciones pendientes, como `pnpm dev`.
  const { migrationsApplied } = await runSeedCommand(requireEnv('DATABASE_MIGRATOR_URL'));
  if (migrationsApplied > 0) console.log(`Migraciones pendientes aplicadas: ${String(migrationsApplied)}.`);
  console.log('Semilla ficticia cargada.');
} catch (error) {
  if (!(error instanceof SeedCommandError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
}
