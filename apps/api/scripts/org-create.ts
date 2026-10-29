import { parseArgs } from 'node:util';
import pg from 'pg';
import { z } from 'zod';
import { DEFAULTS } from '../src/config.ts';
import { SmtpMailer } from '../src/mailer.ts';
import { assertOperatorUrl, createOrganization } from '../src/platform.ts';

// pnpm org:create (ADR 0024): da de alta una organización con su primera sede
// y la invitación de su Propietario. Lo ejecuta el operador de la plataforma,
// conectado como clinic_operator (DATABASE_OPERATOR_URL).

const USAGE = `Uso:
  pnpm org:create --organizacion "Clínica Ejemplo" \\
    --propietario-correo propietario@example.test --propietario-nombre "Nombre Apellido" \\
    --sede-codigo LAN --sede-nombre "Lancaster" --zona-horaria America/Chicago \\
    [--sede-direccion "…"] [--sede-telefono "…"]`;

const { values } = parseArgs({
  options: {
    organizacion: { type: 'string' },
    'propietario-correo': { type: 'string' },
    'propietario-nombre': { type: 'string' },
    'sede-codigo': { type: 'string' },
    'sede-nombre': { type: 'string' },
    'zona-horaria': { type: 'string' },
    'sede-direccion': { type: 'string' },
    'sede-telefono': { type: 'string' },
    ayuda: { type: 'boolean' },
  },
});
if (values.ayuda) {
  console.log(USAGE);
  process.exit(0);
}

const env = z
  .object({
    DATABASE_OPERATOR_URL: z.url(),
    BASE_URL: z.url(),
    INVITATION_TTL_SECONDS: z.coerce.number().int().positive().default(DEFAULTS.invitationTtlSeconds),
    SMTP_URL: z.url().default('smtp://127.0.0.1:1025'),
    MAIL_FROM: z.string().default('Clinic System <no-reply@example.test>'),
  })
  .safeParse(process.env);
if (!env.success) {
  console.error(`Faltan variables de entorno: ${[...new Set(env.error.issues.map((i) => i.path.join('.')))].join(', ')} (ver .env.example)`);
  process.exit(1);
}
assertOperatorUrl(env.data.DATABASE_OPERATOR_URL);

const pool = new pg.Pool({ connectionString: env.data.DATABASE_OPERATOR_URL, max: 1 });
try {
  const created = await createOrganization(
    pool,
    {
      organizationName: values.organizacion ?? '',
      ownerEmail: values['propietario-correo'] ?? '',
      ownerName: values['propietario-nombre'] ?? '',
      location: {
        code: (values['sede-codigo'] ?? '').toUpperCase(),
        name: values['sede-nombre'] ?? '',
        timezone: values['zona-horaria'] ?? '',
        address: values['sede-direccion'] ?? null,
        phone: values['sede-telefono'] ?? null,
      },
    },
    { baseURL: env.data.BASE_URL, invitationTtlSeconds: env.data.INVITATION_TTL_SECONDS, mailer: new SmtpMailer(env.data.SMTP_URL, env.data.MAIL_FROM) },
  );
  console.log(`Organización creada: ${created.organizationId}`);
  console.log(`Primera sede: ${created.locationId}`);
  console.log(created.mailSent ? 'Invitación enviada por correo al Propietario.' : 'No se pudo enviar el correo: entregue el enlace por un canal verificado.');
  console.log(`Enlace de invitación (se muestra una sola vez; vence el ${created.expiresAt}):`);
  console.log(created.link);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error(`Datos inválidos: ${[...new Set(error.issues.map((i) => i.path.join('.')))].join(', ')}`);
    console.error(USAGE);
  } else {
    // Solo el código de Postgres: el mensaje podría repetir los datos.
    const code = ((error as { cause?: { code?: string } }).cause ?? (error as { code?: string })).code;
    console.error(`No se creó la organización${code ? ` (código ${code})` : ''}.`);
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}
