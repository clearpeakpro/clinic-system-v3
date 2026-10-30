import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { generate } from 'otplib';
import { E2E } from './global-setup.ts';

// T-011: Administración › Catálogos y precios (S-ADM-13 a 20) con datos
// ficticios. El Administrador de Sur (sin uso en las demás pruebas) crea un
// procedimiento con su precio general, le pone un precio propio en SUR2
// (SUR1 sigue con el general), programa un cambio del general desde mañana
// (hoy sigue el anterior), lo desactiva con motivo y lo reactiva. El caso de
// NOR1/NOR2 y el aislamiento completo están en las pruebas de la API y de la
// base de datos.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`));
const expectAccessible = (page: Page) => expect.poll(() => axe(page), { timeout: 10_000 }).toEqual([]);

const row = (page: Page, code: string) => page.getByRole('row').filter({ hasText: code });

/** Mañana en la hora de la sede (America/Chicago), como `AAAA-MM-DD`, y su «31 oct». */
function tomorrowInChicago(): { iso: string; short: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const date = new Date(`${parts}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  const iso = date.toISOString().slice(0, 10);
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
  return { iso, short: `${String(date.getUTCDate())} ${months[date.getUTCMonth()] ?? ''}` };
}

test.describe.configure({ retries: 0 });

test('el Administrador gestiona el catálogo y los precios por sede', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill('admin.sur@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill(E2E.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByTestId('totp-secret')).toHaveText(/\w{4}/);
  const secret = (await page.getByTestId('totp-secret').innerText()).replace(/\s/g, '');
  await page.getByLabel('Código de verificación').fill(await generate({ secret }));
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await page.getByText('Guardé estos códigos').click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: /SUR1/ }).click();
  await expect(page).toHaveURL(/\/admin\/usuarios$/);

  // Catálogos abre Tipos de cita.
  await page.getByRole('navigation', { name: 'Navegación principal' }).first().getByRole('link', { name: 'Catálogos' }).click();
  await expect(page).toHaveURL(/\/admin\/catalogos\/tipos-de-cita$/);
  await expect(page.getByRole('heading', { name: 'Catálogos y precios', level: 1 })).toBeVisible();
  await expect(row(page, 'CONSULTA')).toContainText('Consulta general');
  await expect(row(page, 'CONSULTA')).toContainText('20 min');
  await expect(row(page, 'CONSULTA')).toContainText('Verde azulado');
  await expectAccessible(page);
  await page.locator('main').screenshot({ path: 'test-results/catalogo-tipos-de-cita.png' });

  // Procedimientos: el precio general de Sur (no el de Norte); SUR1 no tiene precio propio.
  await page.getByRole('navigation', { name: 'Catálogos' }).getByRole('link', { name: /Procedimientos/ }).click();
  await expect(page).toHaveURL(/\/admin\/catalogos\/procedimientos$/);
  await expect(page.getByRole('columnheader', { name: 'Precio en SUR1' })).toBeVisible();
  await expect(row(page, 'INJ-B12')).toContainText('$18.00');
  await expect(row(page, 'INJ-B12')).toContainText('Usa el precio general');
  await expect(row(page, 'INJ-B12')).toContainText('Inyección');

  // Nuevo procedimiento con su precio general.
  await page.getByRole('button', { name: 'Nuevo procedimiento' }).click();
  const form = page.getByRole('dialog', { name: 'Nuevo procedimiento' });
  await form.getByRole('button', { name: 'Crear' }).click();
  await expect(form.getByText('Use de 2 a 41 letras mayúsculas')).toBeVisible();
  await form.getByLabel('Código').fill('proc-cura');
  await expect(form.getByLabel('Código')).toHaveValue('PROC-CURA');
  await form.getByLabel('Nombre', { exact: true }).fill('Curación ficticia');
  await form.getByLabel('Precio general', { exact: true }).fill('40');
  await expectAccessible(page);
  await form.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByText('Guardado.')).toBeVisible();
  await expect(row(page, 'PROC-CURA')).toContainText('$40.00');
  await expect(row(page, 'PROC-CURA')).toContainText('Usa el precio general');

  // SUR2 tiene su propio precio, que reemplaza al general solo allí.
  await page.getByLabel('Sede de los precios').selectOption({ label: 'SUR2 · Sur Este' });
  await expect(page.getByRole('columnheader', { name: 'Precio en SUR2' })).toBeVisible();
  await expect(row(page, 'PROC-CURA')).toContainText('Usa el precio general');
  await row(page, 'PROC-CURA').getByRole('button', { name: 'Editar Curación ficticia' }).click();
  const edit = page.getByRole('dialog', { name: 'Editar procedimiento' });
  await edit.getByLabel('Precio en Sur Este', { exact: true }).fill('45');
  await edit.getByRole('button', { name: 'Guardar' }).click();
  await expect(row(page, 'PROC-CURA')).toContainText('$45.00');

  await expect(row(page, 'PROC-CURA')).not.toContainText('Usa el precio general');

  // En SUR1 sigue el general. Un cambio del general desde mañana: hoy rige el anterior y se ve el programado.
  await page.getByLabel('Sede de los precios').selectOption({ label: 'SUR1 · Sur Centro' });
  await expect(row(page, 'PROC-CURA')).toContainText('$40.00');
  await expect(row(page, 'PROC-CURA')).toContainText('Usa el precio general');
  await row(page, 'PROC-CURA').getByRole('button', { name: 'Editar Curación ficticia' }).click();
  const tomorrow = tomorrowInChicago();
  const change = page.getByRole('dialog', { name: 'Editar procedimiento' });
  const generalSection = change.getByRole('group', { name: 'Precio general' });
  await generalSection.getByLabel('Precio general (opcional)').fill('50');
  await generalSection.getByLabel('Vigente desde').fill(tomorrow.iso);
  await change.getByRole('button', { name: 'Guardar' }).click();
  await expect(row(page, 'PROC-CURA')).toContainText('$40.00');
  await expect(row(page, 'PROC-CURA')).toContainText(`Desde ${tomorrow.short}: $50.00`);
  await expectAccessible(page);
  await page.locator('main').screenshot({ path: 'test-results/catalogo-procedimientos.png' });

  // Búsqueda y filtro de tipo.
  await page.getByPlaceholder('Buscar por código o nombre de procedimiento…').fill('b12');
  await expect(page.getByRole('row').filter({ hasText: /INJ-B12|PROC-CURA|PROC-LAVOT/ })).toHaveCount(1);
  await page.getByPlaceholder('Buscar por código o nombre de procedimiento…').fill('');
  await page.getByLabel('Tipo', { exact: true }).selectOption('injection');
  await expect(row(page, 'PROC-CURA')).toHaveCount(0);
  await page.getByLabel('Tipo', { exact: true }).selectOption('all');

  // Desactivar exige motivo; reactivar no confirma.
  await row(page, 'PROC-CURA').getByRole('button', { name: 'Desactivar Curación ficticia' }).click();
  const confirm = page.getByRole('dialog', { name: '¿Desactivar Curación ficticia?' });
  await expect(confirm).toContainText('Las entradas inactivas se ocultan al personal pero se conservan en el historial.');
  await confirm.getByRole('button', { name: 'Desactivar' }).click();
  await expect(confirm.getByText('Se requiere un motivo.')).toBeVisible();
  await confirm.getByLabel('Motivo').fill('Prueba ficticia');
  await confirm.getByRole('button', { name: 'Desactivar' }).click();
  await expect(row(page, 'PROC-CURA')).toContainText('Inactivo');
  await row(page, 'PROC-CURA').getByRole('button', { name: 'Reactivar Curación ficticia' }).click();
  await expect(row(page, 'PROC-CURA')).toContainText('Activo');

  // Las demás pestañas.
  await page.getByRole('navigation', { name: 'Catálogos' }).getByRole('link', { name: /Pruebas de laboratorio/ }).click();
  await expect(row(page, 'LAB-STREP')).toContainText('$25.00');
  await page.getByRole('navigation', { name: 'Catálogos' }).getByRole('link', { name: /Fuentes de referido/ }).click();
  await expect(row(page, 'REDES')).toContainText('Redes sociales');
  await expectAccessible(page);
});
