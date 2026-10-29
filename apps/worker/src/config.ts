import { z } from 'zod';

// Configuración del worker (ADR 0020, T-008). Usa solo clinic_app, como la API.

export interface WorkerConfig {
  databaseUrl: string;
  /** Clave del cifrado del payload del outbox (la misma que la API y org:create). */
  outboxKey: string;
  smtpUrl: string;
  mailFrom: string;
  /** Intentos de entrega de un evento antes de marcarlo como fallido. */
  outboxMaxAttempts: number;
  /** Revisión periódica del outbox, además del aviso de LISTEN/NOTIFY. */
  outboxSweepSeconds: number;
  /** Cron (UTC) de la verificación diaria de las cadenas de auditoría. */
  auditVerifyCron: string;
  /** Cron (UTC) de la purga diaria de las claves de idempotencia vencidas. */
  idempotencyPurgeCron: string;
}

export const WORKER_DEFAULTS = {
  outboxMaxAttempts: 8,
  outboxSweepSeconds: 30,
  auditVerifyCron: '0 3 * * *',
  idempotencyPurgeCron: '30 3 * * *',
} as const;

const envSchema = z.object({
  DATABASE_APP_URL: z.url(),
  OUTBOX_KEY: z.string().min(32),
  SMTP_URL: z.url().default('smtp://127.0.0.1:1025'),
  MAIL_FROM: z.string().default('Clinic System <no-reply@example.test>'),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(WORKER_DEFAULTS.outboxMaxAttempts),
  OUTBOX_SWEEP_SECONDS: z.coerce.number().int().min(1).max(3600).default(WORKER_DEFAULTS.outboxSweepSeconds),
  AUDIT_VERIFY_CRON: z.string().default(WORKER_DEFAULTS.auditVerifyCron),
  IDEMPOTENCY_PURGE_CRON: z.string().default(WORKER_DEFAULTS.idempotencyPurgeCron),
});

/** Falla al arrancar si falta algo; el mensaje nombra la variable, nunca su valor. */
export function loadWorkerConfig(env: NodeJS.ProcessEnv): WorkerConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => i.path.join('.')))].join(', ');
    throw new Error(`Configuración inválida del worker: ${names}`);
  }
  const e = parsed.data;
  if (new URL(e.DATABASE_APP_URL).username !== 'clinic_app') {
    throw new Error('Configuración inválida del worker: solo se conecta como clinic_app');
  }
  return {
    databaseUrl: e.DATABASE_APP_URL,
    outboxKey: e.OUTBOX_KEY,
    smtpUrl: e.SMTP_URL,
    mailFrom: e.MAIL_FROM,
    outboxMaxAttempts: e.OUTBOX_MAX_ATTEMPTS,
    outboxSweepSeconds: e.OUTBOX_SWEEP_SECONDS,
    auditVerifyCron: e.AUDIT_VERIFY_CRON,
    idempotencyPurgeCron: e.IDEMPOTENCY_PURGE_CRON,
  };
}
