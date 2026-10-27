import { seed } from '../src/seed.ts';
import { requireEnv } from './env.ts';

if (process.env.NODE_ENV === 'production') {
  throw new Error('La semilla ficticia no se ejecuta en producción.');
}
await seed(requireEnv('DATABASE_MIGRATOR_URL'));
console.log('Semilla ficticia cargada.');
