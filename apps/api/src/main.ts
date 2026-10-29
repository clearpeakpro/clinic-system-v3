import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { StdoutLogSink } from './logging.ts';

const config = loadConfig(process.env);
const port = Number(process.env.PORT ?? 3001);
const app = await createApp({
  config,
  logs: new StdoutLogSink(),
});
await app.app.listen(port, '127.0.0.1');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
