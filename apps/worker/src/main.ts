import { loadWorkerConfig } from './config.ts';
import { log } from './log.ts';
import { SmtpMailer } from './mailer.ts';
import { startWorker } from './worker.ts';

const config = loadWorkerConfig(process.env);
const worker = await startWorker(config, new SmtpMailer(config.smtpUrl, config.mailFrom));

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    log('info', 'worker detenido', { signal });
    void worker.stop().then(() => process.exit(0));
  });
}
