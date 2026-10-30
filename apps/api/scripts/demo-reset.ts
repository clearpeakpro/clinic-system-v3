import { createInterface } from 'node:readline/promises';
import { loadConfig } from '../src/config.ts';
import { assertLocalDatabase, assertOperatorPassword, DemoBusyError, resetDemo } from '../src/demo.ts';
import { DEV_USERS } from '../src/dev-seed.ts';

// pnpm demo:reset (T-010): deja la base de datos LOCAL como recién instalada,
// con las dos organizaciones ficticias y sus usuarios, ninguno con MFA. Borra
// todo lo demás. Solo en desarrollo; con «pnpm dev» detenido.

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') fail('demo:reset no se ejecuta en producción.');

const missing = [
  'DATABASE_SUPERUSER_URL',
  'CLINIC_MIGRATOR_PASSWORD',
  'CLINIC_APP_PASSWORD',
  'CLINIC_OPERATOR_PASSWORD',
  'DATABASE_OPERATOR_URL',
  'DEV_SEED_PASSWORD',
].filter((name) => !process.env[name]);
if (missing.length > 0) fail(`Faltan variables en su archivo .env: ${missing.join(', ')} (ver .env.example).`);

const superuserUrl = process.env.DATABASE_SUPERUSER_URL ?? '';
const operatorUrl = process.env.DATABASE_OPERATOR_URL ?? '';
const operatorPassword = process.env.CLINIC_OPERATOR_PASSWORD ?? '';
try {
  assertLocalDatabase(superuserUrl);
  assertOperatorPassword(operatorUrl, operatorPassword);
} catch (error) {
  fail((error as Error).message);
}

let config;
try {
  config = loadConfig(process.env);
} catch (error) {
  fail(`${(error as Error).message} (ver .env.example).`);
}

if (!process.argv.includes('--si')) {
  console.log(`
Esto BORRA la base de datos local de Clinic System y la deja como recién instalada:
  - «Clínica Demo Norte» (sedes NOR1 y NOR2) y «Clínica Demo Sur» (sedes SUR1 y SUR2);
  - ${String(DEV_USERS.length)} usuarios ficticios, todos con la contraseña de DEV_SEED_PASSWORD y sin MFA.
Todo lo que haya hecho (invitaciones, sedes nuevas, MFA, auditoría…) se pierde.
`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Escriba BORRAR para continuar (o pulse Enter para cancelar): ');
  rl.close();
  if (answer.trim() !== 'BORRAR') {
    console.log('Cancelado: no se borró nada.');
    process.exit(0);
  }
}

try {
  await resetDemo({
    superuserUrl,
    migratorPassword: process.env.CLINIC_MIGRATOR_PASSWORD ?? '',
    appPassword: process.env.CLINIC_APP_PASSWORD ?? '',
    operatorPassword,
    operatorUrl,
    config,
    seedPassword: process.env.DEV_SEED_PASSWORD ?? '',
  });
} catch (error) {
  if (error instanceof DemoBusyError) fail(error.message);
  if (error instanceof Error && error.message.startsWith('No se pudo comprobar el acceso del operador')) fail(error.message);
  throw error;
}

console.log(`
✔ Listo. Base de datos de demostración recién creada.
  Usuarios (contraseña: la de DEV_SEED_PASSWORD en su .env):
${DEV_USERS.map((u) => `    - ${u.email}`).join('\n')}
  El operador de la plataforma (clinic_operator) está listo para «pnpm org:create».
  Ahora ejecute «pnpm dev» y abra http://localhost:5173
`);
