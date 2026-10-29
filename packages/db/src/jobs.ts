import { PgBoss } from 'pg-boss';
import pg from 'pg';

// Colas de pg-boss del worker (ADR 0019, 0020; T-008). pg-boss guarda sus
// tablas en el esquema `pgboss`. Lo instala `migrate()` como clinic_owner
// (crear el esquema, las colas y sus índices es DDL), y clinic_app solo
// recibe permisos de lectura y escritura sobre ellas: el worker nunca crea
// esquemas, tablas ni índices. Para cambiar la versión de pg-boss o las colas,
// basta con volver a ejecutar las migraciones.

export const JOB_SCHEMA = 'pgboss';

export const QUEUES = {
  /** Entrega de un evento del outbox. singletonKey = id del evento. */
  outboxDeliver: 'outbox-deliver',
  /** Verificación diaria de las cadenas de auditoría. */
  auditVerify: 'audit-verify',
  /** Purga diaria de las claves de idempotencia vencidas. */
  idempotencyPurge: 'idempotency-purge',
  /** Purga diaria de las notificaciones de más de 30 días (ADR 0008, T-009). */
  notificationsPurge: 'notifications-purge',
} as const;

const QUEUE_OPTIONS: Record<string, { policy: string; retryLimit: number; retryDelay: number; retryBackoff: boolean; expireInSeconds: number }> = {
  // stately: como mucho un trabajo en cola y uno en curso por evento.
  [QUEUES.outboxDeliver]: { policy: 'stately', retryLimit: 3, retryDelay: 5, retryBackoff: true, expireInSeconds: 120 },
  [QUEUES.auditVerify]: { policy: 'singleton', retryLimit: 2, retryDelay: 60, retryBackoff: false, expireInSeconds: 3600 },
  [QUEUES.idempotencyPurge]: { policy: 'singleton', retryLimit: 2, retryDelay: 60, retryBackoff: false, expireInSeconds: 600 },
  [QUEUES.notificationsPurge]: { policy: 'singleton', retryLimit: 2, retryDelay: 60, retryBackoff: false, expireInSeconds: 600 },
};

/** Instala o actualiza pg-boss y sus colas (lo llama migrate()). */
export async function setupJobQueues(migratorUrl: string): Promise<void> {
  const boss = new PgBoss({
    connectionString: migratorUrl,
    schema: JOB_SCHEMA,
    // Cada conexión actúa como clinic_owner: los objetos quedan a su nombre.
    options: '-c role=clinic_owner',
    max: 2,
    supervise: false,
    schedule: false,
    migrate: true,
    createSchema: true,
  });
  boss.on('error', () => undefined);
  await boss.start();
  try {
    for (const [name, options] of Object.entries(QUEUE_OPTIONS)) {
      if (await boss.getQueue(name)) {
        // La política de una cola no cambia después de crearla.
        await boss.updateQueue(name, {
          retryLimit: options.retryLimit,
          retryDelay: options.retryDelay,
          retryBackoff: options.retryBackoff,
          expireInSeconds: options.expireInSeconds,
        });
      } else {
        await boss.createQueue(name, options);
      }
    }
  } finally {
    await boss.stop({ graceful: false, close: true });
  }

  const client = new pg.Client({ connectionString: migratorUrl });
  await client.connect();
  try {
    await client.query('SET ROLE clinic_owner');
    await client.query(`GRANT USAGE ON SCHEMA ${JOB_SCHEMA} TO clinic_app`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${JOB_SCHEMA} TO clinic_app`);
    await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${JOB_SCHEMA} TO clinic_app`);
    await client.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${JOB_SCHEMA} TO clinic_app`);
  } finally {
    await client.end();
  }
}
