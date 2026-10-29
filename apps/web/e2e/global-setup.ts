import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { bootstrap, migrate, seed } from '@clinic/db';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

// E2E de T-004: Postgres 16 (Testcontainers) + la API real (clinic_app) + la
// web compilada (vite preview). Usuarios ficticios de la semilla de desarrollo.

export const E2E = {
  webPort: 4173,
  apiPort: 3101,
  password: 'Ficticia-e2e-12345',
};

const apiDir = fileURLToPath(new URL('../../api/', import.meta.url));
const webDir = fileURLToPath(new URL('../', import.meta.url));
const workerDir = fileURLToPath(new URL('../../worker/', import.meta.url));

function urlFor(base: string, user: string, password: string): string {
  const url = new URL(base);
  url.username = user;
  url.password = password;
  return url.toString();
}

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  child.stderr.on('data', (chunk: Buffer) => process.stderr.write(chunk));
  return child;
}

function waitFor(url: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      fetch(url)
        .then(() => { resolve(); })
        .catch(() => {
          if (Date.now() - start > timeoutMs) reject(new Error(`No respondió: ${url}`));
          else setTimeout(attempt, 500);
        });
    };
    attempt();
  });
}

/** Termina el proceso y sus hijos (pnpm → tsx/vite) y espera a que salgan. */
async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || !child.pid) return;
  const exited = new Promise<void>((resolve) => child.once('exit', () => { resolve(); }));
  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f']).once('exit', () => { resolve(); });
    });
  } else {
    child.kill('SIGTERM');
  }
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 10_000))]);
}

/** Antes de arrancar: si el puerto ya está ocupado (otra ejecución), se falla con un mensaje claro. */
async function assertFree(port: number): Promise<void> {
  const busy = await fetch(`http://127.0.0.1:${String(port)}`).then(() => true, () => false);
  if (busy) throw new Error(`El puerto ${String(port)} ya está en uso: cierre la ejecución anterior.`);
}

function finished(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.on('exit', (code) => { if (code === 0) resolve(); else reject(new Error(`salió con ${String(code)}`)); });
  });
}

export default async function globalSetup() {
  await assertFree(E2E.webPort);
  await assertFree(E2E.apiPort);
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const superuserUrl = container.getConnectionUri();
  const migratorPassword = randomBytes(16).toString('hex');
  const appPassword = randomBytes(16).toString('hex');
  const operatorPassword = randomBytes(16).toString('hex');
  await bootstrap({ superuserUrl, migratorPassword, appPassword, operatorPassword });
  const migratorUrl = urlFor(superuserUrl, 'clinic_migrator', migratorPassword);
  await migrate(migratorUrl);
  await seed(migratorUrl);

  const webOrigin = `http://127.0.0.1:${String(E2E.webPort)}`;
  const outboxKey = randomBytes(32).toString('hex');
  const apiEnv = {
    NODE_ENV: 'test',
    DATABASE_APP_URL: urlFor(superuserUrl, 'clinic_app', appPassword),
    BASE_URL: webOrigin,
    TRUSTED_ORIGINS: webOrigin,
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    AUDIT_HMAC_KEY: randomBytes(32).toString('hex'),
    OUTBOX_KEY: outboxKey,
    PORT: String(E2E.apiPort),
    DEV_SEED_PASSWORD: E2E.password,
  };
  await finished(run('pnpm', ['exec', 'tsx', 'scripts/seed-dev-users.ts'], apiDir, apiEnv));

  const api = run('pnpm', ['exec', 'tsx', 'src/main.ts'], apiDir, apiEnv);
  // T-008: el worker entrega el outbox. Sin servidor de correo (puerto 1) y con
  // un solo intento, un correo de invitación queda enseguida como no entregado.
  const worker = run('pnpm', ['exec', 'tsx', 'src/main.ts'], workerDir, {
    DATABASE_APP_URL: apiEnv.DATABASE_APP_URL,
    OUTBOX_KEY: outboxKey,
    SMTP_URL: 'smtp://127.0.0.1:1',
    OUTBOX_MAX_ATTEMPTS: '1',
    OUTBOX_SWEEP_SECONDS: '2',
  });
  const web = run('pnpm', ['exec', 'vite', 'preview', '--host', '127.0.0.1'], webDir, {
    API_ORIGIN: `http://127.0.0.1:${String(E2E.apiPort)}`,
  });
  await waitFor(`http://127.0.0.1:${String(E2E.apiPort)}/api/me`);
  await waitFor(webOrigin);

  // T-007: las pruebas ejecutan `pnpm org:create` y `pnpm audit:platform` de
  // verdad, como el operador (clinic_operator) de esta base desechable.
  process.env.E2E_OPERATOR_URL = urlFor(superuserUrl, 'clinic_operator', operatorPassword);
  process.env.E2E_BASE_URL = webOrigin;
  process.env.E2E_OUTBOX_KEY = outboxKey;

  // Orden: web, worker, API y por último la base de datos (si no, se registra
  // «terminating connection»). Se espera a que cada proceso termine.
  return async () => {
    for (const child of [web, worker, api]) await stop(child);
    await container.stop();
  };
}
