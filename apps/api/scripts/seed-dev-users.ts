import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { DEV_USERS, seedDevAppointments, seedDevMemberships, seedDevUsers } from '../src/dev-seed.ts';
import { MemoryLogSink } from '../src/logging.ts';

// Semilla de desarrollo: usuarios, citas y membresías ficticios. Ver src/dev-seed.ts.

if (process.env.NODE_ENV === 'production') {
  throw new Error('La semilla ficticia no se ejecuta en producción.');
}
const password = process.env.DEV_SEED_PASSWORD;
if (!password) throw new Error('Falta la variable de entorno DEV_SEED_PASSWORD (ver .env.example)');

const config = loadConfig(process.env);
const app = await createApp({ config, logs: new MemoryLogSink() });
try {
  await seedDevUsers(app, password);
  console.log(`Usuarios ficticios listos: ${DEV_USERS.map((u) => u.email).join(', ')}`);
  await seedDevAppointments(app, config.fieldEncryptionKey);
  console.log('Citas ficticias listas: ayer, hoy y los próximos días en las cuatro sedes.');
  await seedDevMemberships(app);
  console.log('Membresías ficticias listas: plan Esencial en NOR1 y SUR1, y plan Familiar en Norte.');
} finally {
  await app.close();
}
