import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { generate } from 'otplib';
import { E2E } from './global-setup.ts';

// T-006a: Administración › Usuarios con datos ficticios. El Propietario de
// Norte invita, la persona acepta y entra; el Propietario la deshabilita y su
// sesión se corta. En E2E el worker no puede entregar el correo (sin servidor
// SMTP y con un solo intento, T-008): la fila muestra «Correo no entregado» y
// el enlace se toma del diálogo de un solo uso (S-ADM-04), que es el respaldo.

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegación principal' }).first();

/** Inscribe el MFA en la pantalla S-GEN-07 (inicio de sesión o invitación) y sigue hasta el final de S-GEN-08. */
async function enrollMfa(page: Page) {
  await expect(page.getByRole('heading', { name: 'Configurar la verificación en dos pasos' })).toBeVisible();
  await expect(page.getByTestId('totp-secret')).toHaveText(/\w{4}/);
  const secret = (await page.getByTestId('totp-secret').innerText()).replace(/\s/g, '');
  await page.getByLabel('Código de verificación').fill(await generate({ secret }));
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('heading', { name: 'Guarde sus códigos de recuperación' })).toBeVisible();
  await page.getByText('Guardé estos códigos').click();
  await page.getByRole('button', { name: 'Continuar' }).click();
}

async function ownerOnUsers(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill('propietario.norte@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill(E2E.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await enrollMfa(page);
  await expect(page).toHaveURL(/\/seleccionar-sede$/);
  await page.getByRole('button', { name: /NOR1/ }).click();
  await expect(page).toHaveURL(/\/admin\/usuarios$/);
  await expect(page.getByRole('heading', { name: 'Usuarios', level: 1 })).toBeVisible();
}

/** Crea la invitación y devuelve el enlace del diálogo de un solo uso. */
async function invite(page: Page, email: string, name: string, roles: string[], locations: string[]) {
  await page.getByRole('button', { name: 'Invitar usuario' }).click();
  const dialog = page.getByRole('dialog', { name: 'Invitar usuario' });
  await dialog.getByLabel('Correo electrónico').fill(email);
  await dialog.getByLabel('Nombre para mostrar').fill(name);
  for (const role of roles) await dialog.getByRole('button', { name: role, exact: true }).click();
  for (const location of locations) await dialog.getByRole('button', { name: new RegExp(`\\(${location}\\)`) }).click();
  await dialog.getByRole('button', { name: 'Crear invitación' }).click();

  const secret = page.getByRole('dialog', { name: 'Invitación creada' });
  await expect(secret).toBeVisible();
  await expect(secret).toContainText('También se envía por correo');
  const link = await secret.getByTestId('one-time-link').innerText();
  expect(link).toMatch(/\/invitacion\/[\w-]+\.[\w-]+$/);
  await secret.getByRole('button', { name: 'Cerrar' }).click();
  await expect(secret).toHaveCount(0);
  return new URL(link).pathname;
}

async function newPage(browser: Browser) {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', locale: 'es-US', timezoneId: 'America/Chicago' });
  return context.newPage();
}

const row = (page: Page, email: string) => page.getByRole('row').filter({ hasText: email });

// El Propietario se inscribe en el MFA una sola vez: las dos pruebas comparten
// su página. Sin reintentos: al repetir, el Propietario ya estaría inscrito.
test.describe.configure({ mode: 'serial', retries: 0 });
let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await newPage(browser);
  await ownerOnUsers(page);
});

test('el Propietario invita, la persona acepta y entra; al deshabilitarla, su sesión se corta', async ({ browser }) => {
  test.setTimeout(120_000);

  // Regla escalonada: el Propietario ofrece Administrador, nunca Propietario.
  await page.getByRole('button', { name: 'Invitar usuario' }).click();
  const dialog = page.getByRole('dialog', { name: 'Invitar usuario' });
  await expect(dialog.getByRole('button', { name: 'Administrador', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Propietario', exact: true })).toHaveCount(0);
  // Validación al enviar vacío.
  await dialog.getByRole('button', { name: 'Crear invitación' }).click();
  await expect(dialog.getByText('Seleccione al menos un rol.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toHaveCount(0);

  // Accesibilidad de la página real y del diálogo (WCAG 2.2 AA, con contraste).
  const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations.map((v) => v.id)).toEqual([]);
  await page.getByRole('button', { name: 'Invitar usuario' }).click();
  await expect(page.getByRole('dialog', { name: 'Invitar usuario' })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations.map((v) => v.id)).toEqual([]);
  await page.getByRole('dialog', { name: 'Invitar usuario' }).getByRole('button', { name: 'Cancelar' }).click();

  // Totales con los conteos reales de la semilla (antes de invitar).
  const totals = async () => ({
    total: await page.getByText('Total registrados').locator('..').locator('dd').innerText(),
    invited: await page.getByText('Invitaciones pendientes').locator('..').locator('dd').innerText(),
  });
  const before = await totals();

  const firstPath = await invite(page, 'nuevo.proveedor@example.test', 'Persona Proveedora Ficticia', ['Proveedor'], ['NOR1']);
  await expect(row(page, 'nuevo.proveedor@example.test')).toContainText('Invitado');
  await expect(row(page, 'nuevo.proveedor@example.test')).toContainText('Proveedor · NOR1');
  await expect(row(page, 'nuevo.proveedor@example.test')).toContainText('—');
  // El worker no pudo entregar el correo (outbox, T-008): chip junto a «Reenviar».
  await expect
    .poll(
      async () => {
        await page.getByRole('button', { name: 'Actualizar' }).click();
        return row(page, 'nuevo.proveedor@example.test').getByText('Correo no entregado').count();
      },
      { timeout: 30_000, intervals: [1000, 2000] },
    )
    .toBe(1);
  await expect.poll(totals).toEqual({ total: String(Number(before.total) + 1), invited: String(Number(before.invited) + 1) });
  // El Propietario aparece resaltado y con su etiqueta; nunca entró en esta prueba salvo ahora: «Hoy».
  await expect(row(page, 'propietario.norte@example.test')).toContainText('Propietario');
  await expect(row(page, 'propietario.norte@example.test')).toContainText('Sin acceso clínico');
  await expect(row(page, 'propietario.norte@example.test')).toContainText(/Hoy, \d{1,2}:\d{2} [ap]\. m\./);

  // Filtros en una fila: el estado es un desplegable.
  await page.getByLabel('Estado', { exact: true }).selectOption({ label: 'Invitado' });
  await expect(page.getByRole('row')).toHaveCount(2);
  await page.getByLabel('Estado', { exact: true }).selectOption({ label: 'Todos los estados' });

  // «Reenviar»: enlace nuevo; el anterior deja de servir.
  await row(page, 'nuevo.proveedor@example.test').getByRole('button', { name: 'Reenviar la invitación a Persona Proveedora Ficticia' }).click();
  const resent = page.getByRole('dialog', { name: 'Invitación reenviada' });
  await expect(resent).toContainText('El enlace anterior ya no funciona');
  const path = new URL(await resent.getByTestId('one-time-link').innerText()).pathname;
  expect(path).not.toBe(firstPath);
  await resent.getByRole('button', { name: 'Cerrar' }).click();
  await expect.poll(totals).toEqual({ total: String(Number(before.total) + 1), invited: String(Number(before.invited) + 1) });

  // La persona invitada, en otro navegador: crea su contraseña y entra.
  const guest = await newPage(browser);
  await guest.goto(path);
  await expect(guest.getByRole('heading', { name: 'Aceptar invitación' })).toBeVisible();
  await guest.getByLabel('Nombre para mostrar').fill('Persona Proveedora Ficticia');
  await guest.getByLabel('Contraseña', { exact: true }).fill('una frase larga y ficticia');
  await guest.getByLabel('Confirmar contraseña').fill('una frase larga y ficticia');
  await guest.getByRole('button', { name: 'Aceptar invitación' }).click();
  await expect(guest).toHaveURL(/\/app\/NOR1\/panel$/);
  await expect(nav(guest).getByRole('link', { name: 'Cola de proveedor' })).toBeVisible();

  // Ni el mismo enlace ni el anterior al reenvío sirven ya.
  for (const used of [path, firstPath]) {
    const other = await newPage(browser);
    await other.goto(used);
    await other.getByLabel('Nombre para mostrar').fill('Otra');
    await other.getByLabel('Contraseña', { exact: true }).fill('otra frase larga y ficticia');
    await other.getByLabel('Confirmar contraseña').fill('otra frase larga y ficticia');
    await other.getByRole('button', { name: 'Aceptar invitación' }).click();
    await expect(other.getByRole('heading', { name: 'Invitación no válida' })).toBeVisible();
  }

  // El Propietario actualiza la lista y la deshabilita con motivo.
  await page.getByRole('button', { name: 'Actualizar' }).click();
  const target = row(page, 'nuevo.proveedor@example.test');
  await expect(target).toContainText('Activo');
  await expect(target).toContainText(/Hoy, /);
  await target.getByRole('button', { name: /Más acciones/ }).click();
  await page.getByRole('menuitem', { name: 'Deshabilitar' }).click();
  const confirm = page.getByRole('dialog', { name: '¿Deshabilitar a Persona Proveedora Ficticia?' });
  await confirm.getByRole('button', { name: 'Deshabilitar' }).click();
  await expect(confirm.getByText('Se requiere un motivo.')).toBeVisible();
  await confirm.getByLabel('Motivo').fill('Fin del contrato (prueba ficticia)');
  await confirm.getByRole('button', { name: 'Deshabilitar' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(target).toContainText('Deshabilitado');

  // Su sesión se cortó: la siguiente petición la lleva al inicio de sesión.
  await guest.reload();
  await expect(guest).toHaveURL(/\/login/);
});

test('un Administrador invitado se inscribe en el MFA al aceptar y no puede invitar Administradores', async ({ browser }) => {
  test.setTimeout(120_000);
  const path = await invite(page, 'nuevo.admin@example.test', 'Persona Administradora Ficticia', ['Administrador'], []);

  const admin = await newPage(browser);
  await admin.goto(path);
  await admin.getByLabel('Nombre para mostrar').fill('Persona Administradora Ficticia');
  await admin.getByLabel('Contraseña', { exact: true }).fill('frase de administración ficticia');
  await admin.getByLabel('Confirmar contraseña').fill('frase de administración ficticia');
  await admin.getByRole('button', { name: 'Aceptar invitación' }).click();
  // Su rol exige MFA: se inscribe en la misma página, sin volver a escribir la contraseña.
  await enrollMfa(admin);
  await expect(admin).toHaveURL(/\/seleccionar-sede$/);
  await admin.getByRole('button', { name: /NOR1/ }).click();
  await expect(admin).toHaveURL(/\/admin\/usuarios$/);

  // Su propia fila y la del Propietario no tienen acciones.
  await expect(row(admin, 'propietario.norte@example.test').getByRole('button', { name: /Más acciones/ })).toHaveCount(0);
  await admin.getByRole('button', { name: 'Invitar usuario' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Invitar usuario' });
  await expect(dialog.getByRole('button', { name: 'Proveedor', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Administrador', exact: true })).toHaveCount(0);
});
