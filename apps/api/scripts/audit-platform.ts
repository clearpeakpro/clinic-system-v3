import { parseArgs } from 'node:util';
import pg from 'pg';
import { z } from 'zod';
import { assertOperatorUrl, operatorErrorMessage, readPlatformAudit } from '../src/platform.ts';

// pnpm audit:platform (ADR 0024): eventos de auditoría sin organización
// (inicios de sesión fallidos, bloqueos, lecturas del operador…). Solo el
// operador los lee, conectado como clinic_operator; la base de datos registra
// cada lectura (platform.audit_read) con los filtros usados.

const USAGE = `Uso:
  pnpm audit:platform [--desde 2026-10-01T00:00:00Z] [--hasta …] [--accion auth.sign_in.failure] [--limite 500]
  Sin --desde: las últimas 24 horas. Una línea JSON por evento.`;

const { values } = parseArgs({
  options: {
    desde: { type: 'string' },
    hasta: { type: 'string' },
    accion: { type: 'string' },
    limite: { type: 'string' },
    ayuda: { type: 'boolean' },
  },
});
if (values.ayuda) {
  console.log(USAGE);
  process.exit(0);
}

const args = z
  .object({
    since: z.coerce.date(),
    until: z.coerce.date().optional(),
    action: z.string().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(5000).default(500),
  })
  .safeParse({
    since: values.desde ?? new Date(Date.now() - 24 * 60 * 60 * 1000),
    until: values.hasta,
    action: values.accion,
    limit: values.limite,
  });
if (!args.success) {
  console.error(`Argumentos inválidos: ${[...new Set(args.error.issues.map((i) => i.path.join('.')))].join(', ')}`);
  console.error(USAGE);
  process.exit(1);
}

const url = process.env.DATABASE_OPERATOR_URL;
if (!url) {
  console.error('Falta la variable de entorno DATABASE_OPERATOR_URL (ver .env.example)');
  process.exit(1);
}
assertOperatorUrl(url);

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  const events = await readPlatformAudit(pool, args.data);
  for (const event of events) console.log(JSON.stringify(event));
  console.error(`${String(events.length)} eventos. Esta lectura quedó registrada en la auditoría.`);
} catch (error) {
  console.error(operatorErrorMessage(error, 'leer la auditoría de la plataforma'));
  process.exitCode = 1;
} finally {
  await pool.end();
}
