import { migrate } from '../src/migrate.ts';
import { requireEnv } from './env.ts';

await migrate(requireEnv('DATABASE_MIGRATOR_URL'));
console.log('Migraciones aplicadas.');
