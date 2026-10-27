import { bootstrap } from '../src/bootstrap.ts';
import { requireEnv } from './env.ts';

await bootstrap({
  superuserUrl: requireEnv('DATABASE_SUPERUSER_URL'),
  migratorPassword: requireEnv('CLINIC_MIGRATOR_PASSWORD'),
  appPassword: requireEnv('CLINIC_APP_PASSWORD'),
});
console.log('Roles de base de datos listos.');
