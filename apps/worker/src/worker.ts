import { createTenantDb, JOB_SCHEMA, OUTBOX_CHANNEL, QUEUES } from '@clinic/db';
import { PgBoss } from 'pg-boss';
import pg from 'pg';
import type { WorkerConfig } from './config.ts';
import { deliverEvent } from './deliver.ts';
import { log } from './log.ts';
import type { Mailer } from './mailer.ts';
import { purgeIdempotencyKeys, purgeNotifications, verifyAuditChains } from './maintenance.ts';

// El worker (ADR 0020): proceso aparte, conectado como clinic_app, que nunca
// corre dentro de la API. pg-boss no crea ni migra su esquema aquí: lo
// instala migrate() como clinic_owner.
//  - Outbox: al confirmarse una transacción que escribió un evento llega un
//    aviso (LISTEN/NOTIFY); además se revisa cada pocos segundos. Cada evento
//    pendiente se pone en cola con singletonKey = su id, y el trabajo lo
//    entrega dentro de withTenant (deliver.ts).
//    Las notificaciones (T-009) van por el mismo camino: se guardan y se avisa
//    a los sockets de la persona por LISTEN/NOTIFY.
//  - Cada día: verificación de las cadenas de auditoría y purga de las claves
//    de idempotencia vencidas y de las notificaciones de más de 30 días.

export interface RunningWorker {
  /** Revisa el outbox ahora (también lo hacen el aviso y el temporizador). */
  sweep(): Promise<number>;
  stop(): Promise<void>;
}

export async function startWorker(config: WorkerConfig, mailer: Mailer): Promise<RunningWorker> {
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });
  const tenantDb = createTenantDb(pool);
  const boss = new PgBoss({
    connectionString: config.databaseUrl,
    schema: JOB_SCHEMA,
    max: 4,
    migrate: false,
    createSchema: false,
  });
  boss.on('error', (error: Error) => {
    log('error', 'pg-boss', { type: error.name });
  });
  await boss.start();

  const deps = { tenantDb, mailer, outboxKey: config.outboxKey, maxAttempts: config.outboxMaxAttempts };
  await boss.work<{ organizationId: string; id: string }>(QUEUES.outboxDeliver, async ([job]) => {
    if (!job) return;
    const result = await deliverEvent(deps, job.data);
    if (result !== 'sent' && result !== 'skipped') log('warn', 'outbox', { result, eventId: job.data.id });
  });
  await boss.work(QUEUES.auditVerify, async () => {
    const results = await verifyAuditChains(pool, tenantDb);
    for (const r of results.filter((x) => !x.ok)) log('error', 'cadena de auditoría rota', { chain: r.chain, firstBrokenSeq: r.firstBrokenSeq });
    log('info', 'cadenas de auditoría verificadas', { chains: results.length, broken: results.filter((x) => !x.ok).length });
  });
  await boss.work(QUEUES.idempotencyPurge, async () => {
    log('info', 'claves de idempotencia purgadas', { purged: await purgeIdempotencyKeys(pool) });
  });
  await boss.schedule(QUEUES.auditVerify, config.auditVerifyCron, null, { tz: 'UTC' });
  await boss.work(QUEUES.notificationsPurge, async () => {
    log('info', 'notificaciones purgadas', { purged: await purgeNotifications(pool) });
  });
  await boss.schedule(QUEUES.idempotencyPurge, config.idempotencyPurgeCron, null, { tz: 'UTC' });
  await boss.schedule(QUEUES.notificationsPurge, config.notificationsPurgeCron, null, { tz: 'UTC' });

  let sweeping: Promise<number> | null = null;
  const sweep = (): Promise<number> => {
    // Un barrido a la vez; los avisos que llegan mientras tanto se suman al siguiente.
    sweeping ??= (async () => {
      try {
        const { rows } = await pool.query<{ organization_id: string; id: string }>('select * from app.outbox_due(100)');
        for (const row of rows) {
          await boss.send(QUEUES.outboxDeliver, { organizationId: row.organization_id, id: row.id }, { singletonKey: row.id });
        }
        return rows.length;
      } finally {
        sweeping = null;
      }
    })();
    return sweeping;
  };
  const sweepQuietly = () => {
    sweep().catch((error: unknown) => {
      log('error', 'barrido del outbox', { type: (error as Error).name });
    });
  };

  const listener = new pg.Client({ connectionString: config.databaseUrl });
  await listener.connect();
  listener.on('notification', sweepQuietly);
  listener.on('error', (error: Error) => {
    log('error', 'LISTEN del outbox', { type: error.name });
  });
  await listener.query(`LISTEN ${OUTBOX_CHANNEL}`);
  const timer = setInterval(sweepQuietly, config.outboxSweepSeconds * 1000);
  sweepQuietly();
  log('info', 'worker en marcha', { sweepSeconds: config.outboxSweepSeconds });

  return {
    sweep,
    async stop() {
      clearInterval(timer);
      await listener.end().catch(() => undefined);
      await boss.stop({ graceful: true, timeout: 10_000, close: true });
      await pool.end();
    },
  };
}
