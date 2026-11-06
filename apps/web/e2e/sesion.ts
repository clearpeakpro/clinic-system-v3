import { expect, type Cookie, type Page } from '@playwright/test';
import { E2E } from './global-setup.ts';

// Sesión guardada para las pruebas que no prueban el inicio de sesión.
//
// La primera vez que una persona entra en la ejecución, la sesión se abre por
// la API (la misma petición que hace el formulario) y sus cookies se guardan
// en memoria. Las veces siguientes se ponen esas cookies en el contexto del
// navegador y se abre «/»: el arranque (S-GEN-01) lleva a la persona a su
// destino, igual que después de enviar el formulario.
//
// Solo para el personal de la semilla con una sola sede y sin MFA: su
// destino no depende de la sesión (la sede activa es siempre la suya). Las
// demás personas, y las pruebas del inicio de sesión (flows, profile, users y
// las demos), siguen entrando por el formulario.
//
// Si otra prueba cerró esa sesión (cerrar sesión, cambio de contraseña…), se
// nota al comprobarla y se abre otra. Y si la ventana ya se usó (por ejemplo,
// alguien acaba de cerrar sesión en ella), primero se va a /login, como hacía
// el formulario, y se abre una sesión nueva: un cierre de sesión que todavía
// estuviera en camino no puede llevarse la guardada.
//
// Una sesión guardada se reutiliza solo durante sus primeros 5 minutos
// (MAX_REUSE_MS). Las ventanas de las pruebas anteriores siguen abiertas
// hasta el final de la ejecución y, a los 15 minutos sin interacción, la web
// cierra su sesión por inactividad (S-GEN-20), como debe. Si esa sesión
// fuera la guardada, dejaría fuera a la prueba que la estuviera usando (pasó
// en la CI del PR #42 con visita.spec.ts). Toda ventana que usa una sesión se
// abrió después de crearla, así que no la cierra antes de 15 minutos desde
// su creación; reutilizándola solo 5 minutos, la prueba que la usa tiene
// otros 10 de margen (las más largas duran alrededor de 1 minuto).

const SAVED = new Set([
  'recepcion.norte@example.test',
  'enfermeria.norte@example.test',
  'proveedor.norte@example.test',
  'proveedora.nor1@example.test',
  'recepcion.sur@example.test',
  'enfermeria.sur@example.test',
]);

const WEB_ORIGIN = `http://127.0.0.1:${String(E2E.webPort)}`;

const MAX_REUSE_MS = 5 * 60_000;

const saved = new Map<string, { cookies: Cookie[]; at: number }>();

async function sessionEmail(page: Page): Promise<string | null> {
  const response = await page.request.get('/api/auth/get-session');
  if (!response.ok()) return null;
  const body = (await response.json()) as { user?: { email?: string } } | null;
  return body?.user?.email ?? null;
}

/**
 * Entra con la sesión guardada de esa persona. Devuelve `false` si no le
 * corresponde (hay que usar el formulario).
 */
export async function signInSaved(page: Page, email: string, password = E2E.password): Promise<boolean> {
  if (!SAVED.has(email) || password !== E2E.password) return false;
  const context = page.context();
  const used = page.url() !== 'about:blank';
  if (used) await page.goto('/login');
  const entry = saved.get(email);
  const cookies = !used && entry && Date.now() - entry.at < MAX_REUSE_MS ? entry.cookies : undefined;
  let valid = false;
  if (cookies) {
    await context.addCookies(cookies);
    valid = (await sessionEmail(page)) === email;
    if (!valid) {
      saved.delete(email);
      await context.clearCookies();
    }
  }
  if (!valid) {
    const response = await page.request.post('/api/auth/sign-in/email', {
      headers: { origin: WEB_ORIGIN },
      data: { email, password },
    });
    expect(response.status(), `inicio de sesión de ${email}`).toBe(200);
    const body = (await response.json()) as { twoFactorRedirect?: boolean };
    expect(body.twoFactorRedirect, `${email} no debe tener MFA`).toBeFalsy();
    saved.set(email, { cookies: await context.cookies(), at: Date.now() });
  }
  await page.goto('/');
  return true;
}
