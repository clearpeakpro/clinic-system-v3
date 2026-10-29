import { createTenantDb, DEMO, enqueueNotification } from '@clinic/db';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E } from './global-setup.ts';

// T-009: indicador «En vivo» (S-GEN-14), campana y centro de notificaciones
// (S-GEN-15) y banner de modo degradado (S-GEN-19), con la API, el worker y
// la base de datos reales. Los avisos se escriben en el outbox como lo haría
// la API (enqueueNotification, como clinic_app); el worker los entrega.
// Datos ficticios: solo códigos, nunca nombres.

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(E2E.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

const live = (page: Page) => page.getByRole('banner').getByRole('status');

test('un aviso llega a la campana sin recargar; se marca como leído y se borra', async ({ page }) => {
  await signIn(page, 'proveedor.norte@example.test');
  await expect(page).toHaveURL(/\/app\/NOR2\/panel$/);
  await expect(live(page)).toHaveText(/Actualizaciones en vivo: En vivo/);
  const bell = page.getByRole('button', { name: /^Notificaciones/ });
  await expect(bell).toHaveAccessibleName('Notificaciones');

  const me = (await (await page.request.get('/api/me')).json()) as { userId: string };
  const pool = new pg.Pool({ connectionString: process.env.E2E_APP_URL, max: 1 });
  try {
    await createTenantDb(pool).withTenant(DEMO.norte.id, (tx) =>
      enqueueNotification(tx, process.env.E2E_OUTBOX_KEY ?? '', {
        organizationId: DEMO.norte.id,
        userId: me.userId,
        kind: 'encounter.provider_assigned',
        locationId: DEMO.norte.locations[1].id,
        code: 'NOR2-V-000123',
      }),
    );
  } finally {
    await pool.end();
  }

  // El worker lo guarda y la conexión en vivo actualiza la campana.
  await expect(bell).toHaveAccessibleName('Notificaciones, 1 sin leer', { timeout: 15_000 });
  await bell.click();
  const panel = page.getByRole('dialog', { name: 'Notificaciones' });
  await expect(panel).toBeVisible();
  const item = panel.getByRole('button', { name: /Paciente asignado a usted/ });
  await expect(item).toContainText('Visita NOR2-V-000123 · Ahora mismo');
  await expect(item).toContainText('Sin leer');

  // Tocarlo lo marca como leído y cierra el panel.
  await item.click();
  await expect(panel).toHaveCount(0);
  await expect(bell).toHaveAccessibleName('Notificaciones');

  // «Borrar» vacía la lista.
  await bell.click();
  await expect(panel.getByRole('button', { name: /Paciente asignado a usted/ })).not.toContainText('Sin leer');
  await panel.getByRole('button', { name: 'Borrar' }).click();
  await expect(panel.getByText('Está al día')).toBeVisible();
  await expect(panel.getByText('Las asignaciones y alertas para usted aparecerán aquí.')).toBeVisible();
});

test('sin conexión en vivo: banner y «Sin conexión»; «Ocultar aviso»; al volver, «En vivo»', async ({ page }) => {
  // Mientras `blocked`, el WebSocket no llega a la API.
  let blocked = true;
  await page.routeWebSocket(/\/api\/socket\.io\//, async (ws) => {
    if (blocked) await ws.close();
    else ws.connectToServer();
  });
  await signIn(page, 'recepcion.norte@example.test');
  await expect(page).toHaveURL(/\/app\/NOR1\/panel$/);

  const banner = page.getByRole('status').filter({ hasText: 'Las actualizaciones en vivo están demoradas' });
  await expect(banner).toHaveText('Las actualizaciones en vivo están demoradas: las pantallas se actualizan solas cada 30 segundos.');
  await expect(banner).not.toContainText(/contingencia/i);
  await expect(live(page)).toHaveText(/Actualizaciones en vivo: (Sin conexión|Reconectando…)/);

  // «Ocultar aviso» lo oculta mientras dura esta desconexión.
  await banner.getByRole('button', { name: 'Ocultar aviso' }).click();
  await expect(banner).toHaveCount(0);
  await expect(live(page)).toHaveText(/Actualizaciones en vivo: (Sin conexión|Reconectando…)/);

  // Vuelve la conexión: «En vivo» en el siguiente reintento.
  blocked = false;
  await expect(live(page)).toHaveText(/Actualizaciones en vivo: En vivo/, { timeout: 20_000 });
  await expect(banner).toHaveCount(0);
});
