import { expect, test, type Page } from '@playwright/test';
import { generate } from 'otplib';
import { E2E } from './global-setup.ts';

// Flujos de T-004 con usuarios ficticios de la semilla de desarrollo.

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(E2E.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegación principal' }).first();

test('Recepción inicia sesión y ve el marco con su menú', async ({ page }) => {
  await signIn(page, 'recepcion.norte@example.test');
  // Una sola sede: se elige sola y aterriza en el Panel.
  await expect(page).toHaveURL(/\/app\/NOR1\/panel$/);
  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();
  await expect(page.getByTestId('location-current')).toContainText('NOR1');
  const items = nav(page).getByRole('link');
  await expect(items).toHaveText(['Panel', 'Pacientes', 'Citas', 'Caja', 'Reportes']);
  await expect(nav(page).getByText('Administración')).toHaveCount(0);

  // Sin datos de la API en la caché del service worker (ADR 0014).
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
    }
    return urls;
  });
  expect(cached.filter((u) => u.includes('/api/'))).toEqual([]);

  // Cerrar sesión (S-GEN-17).
  await page.getByRole('button', { name: 'Menú de cuenta' }).click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/app/NOR1/panel');
  await expect(page).toHaveURL(/\/login/);
});

test('Administrador sin MFA queda obligado a inscribirse', async ({ page }) => {
  // Incluye esperar hasta 30 s a un código TOTP nuevo.
  test.setTimeout(120_000);
  await signIn(page, 'admin.norte@example.test');
  await expect(page.getByRole('heading', { name: 'Configurar la verificación en dos pasos' })).toBeVisible();
  // La clave aparece cuando el servidor prepara la inscripción.
  await expect(page.getByTestId('totp-secret')).toHaveText(/\w{4}/);
  const secret = (await page.getByTestId('totp-secret').innerText()).replace(/\s/g, '');
  expect(secret.length).toBeGreaterThan(10);
  await page.getByLabel('Código de verificación').fill(await generate({ secret }));
  await page.getByRole('button', { name: 'Confirmar' }).click();

  await expect(page.getByRole('heading', { name: 'Guarde sus códigos de recuperación' })).toBeVisible();
  await expect(page.getByTestId('recovery-codes').getByRole('listitem')).toHaveCount(10);
  const continuar = page.getByRole('button', { name: 'Continuar' });
  await expect(continuar).toBeDisabled();
  await page.getByText('Guardé estos códigos').click();
  await continuar.click();

  // Dos sedes en Norte: elige una y aterriza en «Administración».
  await expect(page).toHaveURL(/\/seleccionar-sede$/);
  await page.getByRole('button', { name: /NOR1/ }).click();
  await expect(page).toHaveURL(/\/admin\/usuarios$/);
  await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible();
  await expect(nav(page).getByText('Administración')).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Panel' })).toHaveCount(0);

  // De vuelta: S-GEN-06 con el correo en la cápsula y la cuenta atrás. El
  // código entra de una vez en un solo campo (como al pegarlo o autocompletarlo).
  await page.getByRole('button', { name: 'Menú de cuenta' }).click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await signIn(page, 'admin.norte@example.test');
  await expect(page.getByRole('heading', { name: 'Verificación en dos pasos' })).toBeVisible();
  await expect(page.getByText('admin.norte@example.test')).toBeVisible();
  await expect(page.getByText(/El código se actualiza en \d+s/)).toBeVisible();
  const field = page.getByLabel('Código de verificación');
  await expect(field).toHaveAttribute('autocomplete', 'one-time-code');
  // Un periodo de 30 s nuevo: el código de la inscripción no se repite.
  const period = Math.floor(Date.now() / 30_000);
  await expect.poll(() => Math.floor(Date.now() / 30_000), { timeout: 31_000 }).toBeGreaterThan(period);
  await field.focus();
  await page.keyboard.insertText(await generate({ secret }));
  await expect(page).toHaveURL(/\/admin\/usuarios$/);
});

test('usuario de dos organizaciones cambia de organización y de sede', async ({ page }) => {
  await signIn(page, 'multi@example.test');
  await expect(page).toHaveURL(/\/seleccionar-sede$/);
  await expect(page.getByText('Clínica Demo Norte')).toBeVisible();
  await expect(page.getByText('Clínica Demo Sur')).toBeVisible();

  await page.getByRole('button', { name: /NOR1/ }).click();
  await expect(page).toHaveURL(/\/app\/NOR1\/panel$/);
  await expect(nav(page).getByRole('link', { name: 'Caja' })).toBeVisible();

  // Selector de sede de la cabecera (S-GEN-13): pasa a Sur y cambia el menú.
  await page.getByTestId('location-selector').click();
  await page.getByRole('menuitem', { name: /SUR1/ }).click();
  await expect(page).toHaveURL(/\/app\/SUR1\/panel$/);
  await expect(nav(page).getByRole('link', { name: 'Cola de enfermería' })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Caja' })).toHaveCount(0);

  // Cambiar la sede en la URL hace el mismo cambio.
  await page.goto('/app/NOR1/citas');
  await expect(page.getByRole('heading', { name: 'Citas' })).toBeVisible();
  await expect(page.getByTestId('location-selector')).toContainText('NOR1');

  // Una sede ajena o inexistente no existe.
  await page.goto('/app/NOR2/panel');
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
});

test('cierre por inactividad con reloj simulado', async ({ page }) => {
  await page.clock.install();
  await signIn(page, 'proveedor.norte@example.test');
  await expect(page).toHaveURL(/\/app\/NOR2\/panel$/);

  // 15 min por defecto: el aviso aparece 60 s antes.
  await page.clock.fastForward('13:58');
  await expect(page.getByRole('dialog', { name: '¿Sigue ahí?' })).toHaveCount(0);
  await page.clock.fastForward('00:05');
  const dialog = page.getByRole('dialog', { name: '¿Sigue ahí?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('segundos por inactividad');

  // «Mantener la sesión» reinicia el periodo.
  await dialog.getByRole('button', { name: 'Mantener la sesión' }).click();
  await expect(dialog).toHaveCount(0);

  // Sin respuesta: cubierta y vuelta al acceso con el aviso.
  await page.clock.fastForward('14:05');
  await expect(page.getByRole('dialog', { name: '¿Sigue ahí?' })).toBeVisible();
  await page.clock.fastForward('01:05');
  await expect(page).toHaveURL(/\/login\?motivo=inactividad/);
  await expect(page.getByText('Su sesión se cerró por inactividad.')).toBeVisible();
  // La sesión del servidor también se cerró.
  await page.goto('/app/NOR2/panel');
  await expect(page).toHaveURL(/\/login/);
});

test('/dev/ui no existe en la compilación de producción', async ({ page }) => {
  await page.goto('/dev/ui');
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Componentes compartidos' })).toHaveCount(0);
});
