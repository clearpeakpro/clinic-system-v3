import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { DemoUserError, sendDemoNotification } from '../src/demo.ts';
import { MemoryLogSink } from '../src/logging.ts';

// pnpm demo:aviso <correo> (T-010), solo en desarrollo: envía a esa persona un
// aviso ficticio «Cita actualizada» por el outbox, como lo hará la fase 2. Lo
// entrega el worker (con «pnpm dev» en marcha) y la campana lo muestra al
// instante.

if (process.env.NODE_ENV === 'production') {
  console.error('demo:aviso no se ejecuta en producción.');
  process.exit(1);
}
const email = process.argv.slice(2).find((arg) => arg.includes('@'));
if (!email) {
  console.error('Uso: pnpm demo:aviso correo@example.test');
  process.exit(1);
}

const config = loadConfig(process.env);
const app = await createApp({ config, logs: new MemoryLogSink() });
try {
  const { code } = await sendDemoNotification(app, config.outboxKey, email);
  console.log(`✔ Aviso «Cita actualizada» (${code}) enviado a ${email}. Mire la campana.`);
} catch (error) {
  if (!(error instanceof DemoUserError)) throw error;
  console.error(`✖ ${error.message}`);
  process.exitCode = 1;
} finally {
  await app.close();
}
