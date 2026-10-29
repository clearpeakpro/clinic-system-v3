import { readFile } from 'node:fs/promises';
import pg from 'pg';

export interface BootstrapOptions {
  /** Conexión de superusuario a la base de datos de la aplicación. */
  superuserUrl: string;
  migratorPassword: string;
  appPassword: string;
  /**
   * Contraseña del operador de la plataforma (ADR 0024). Opcional: sin ella
   * el rol existe pero no puede iniciar sesión (p. ej. en un entorno de
   * desarrollo que aún no la configuró).
   */
  operatorPassword?: string | undefined;
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
    if (options.operatorPassword) {
      await client.query(
        `ALTER ROLE clinic_operator PASSWORD ${client.escapeLiteral(options.operatorPassword)}`,
      );
    }
  } finally {
    await client.end();
  }
}
