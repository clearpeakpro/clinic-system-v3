import { readFile } from 'node:fs/promises';
import pg from 'pg';

export interface BootstrapOptions {
  /** Conexión de superusuario a la base de datos de la aplicación. */
  superuserUrl: string;
  migratorPassword: string;
  appPassword: string;
}

/** Crea los roles y permisos de base de datos. Ver sql/bootstrap.sql. */
export async function bootstrap(options: BootstrapOptions): Promise<void> {
  const sql = await readFile(new URL('../sql/bootstrap.sql', import.meta.url), 'utf8');
  const client = new pg.Client({ connectionString: options.superuserUrl });
  await client.connect();
  try {
    await client.query(sql);
    await client.query(
      `ALTER ROLE clinic_migrator PASSWORD ${client.escapeLiteral(options.migratorPassword)}`,
    );
    await client.query(
      `ALTER ROLE clinic_app PASSWORD ${client.escapeLiteral(options.appPassword)}`,
    );
  } finally {
    await client.end();
  }
}
