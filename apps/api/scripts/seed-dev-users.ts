import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { DEV_USERS, seedDevUsers } from '../src/dev-seed.ts';
import { MemoryLogSink } from '../src/logging.ts';
import { MemoryMailer } from '../src/mailer.ts';

// Semilla de desarrollo: usuarios ficticios. Ver src/dev-seed.ts.

if (process.env.NODE_ENV === 'production') {
  throw new Error('La semilla ficticia no se ejecuta en producción.');
}
const password = process.env.DEV_SEED_PASSWORD;
if (!password) throw new Error('Falta la variable de entorno DEV_SEED_PASSWORD (ver .env.example)');

const app = await createApp({ config: loadConfig(process.env), mailer: new MemoryMailer(), logs: new MemoryLogSink() });
try {
  await seedDevUsers(app, password);
  console.log(`Usuarios ficticios listos: ${DEV_USERS.map((u) => u.email).join(', ')}`);
} finally {
  await app.close();
}
