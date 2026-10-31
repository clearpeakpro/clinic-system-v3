import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { generate } from 'otplib';
import { E2E } from './global-setup.ts';

// T-011: Administración › Catálogos y precios (S-ADM-13 a 20) con datos
// ficticios. El Administrador de Sur (sin uso en las demás pruebas) crea un
// procedimiento con su precio general, le pone un precio propio en SUR2
// (SUR1 sigue con el general) y la devuelve al general desde mañana (P-15),
// programa un cambio del general desde mañana
// (hoy sigue el anterior), lo desactiva con motivo y lo reactiva. El caso de
// NOR1/NOR2 y el aislamiento completo están en las pruebas de la API y de la
// base de datos. T-011b: da de alta un laboratorio, lo marca con su costo en
// la prueba sin laboratorio, programa un cambio de costo y desmarca otro en
// A1c, y al desactivarlo la prueba vuelve a «Sin laboratorio asignado».

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

test('el Administrador gestiona el catálogo, los precios por sede y los laboratorios', async ({ page }) => {
  test.setTimeout(180_000);
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

  // P-15: SUR2 vuelve al precio general desde mañana; hoy sigue su precio propio.
  const tomorrow = tomorrowInChicago();
  await row(page, 'PROC-CURA').getByRole('button', { name: 'Volver al precio general en SUR2: Curación ficticia' }).click();
  const revert = page.getByRole('dialog', { name: '¿Volver al precio general en Sur Este?' });
  await revert.getByLabel('Vigente desde').fill(tomorrow.iso);
  await expectAccessible(page);
  await revert.getByRole('button', { name: 'Volver al precio general' }).click();
  await expect(row(page, 'PROC-CURA')).toContainText('$45.00');
  await expect(row(page, 'PROC-CURA')).toContainText(`Desde ${tomorrow.short}: usa el precio general`);
  await page.locator('main').screenshot({ path: 'test-results/catalogo-sur2.png' });

  // En SUR1 sigue el general. Un cambio del general desde mañana: hoy rige el anterior y se ve el programado.
  await page.getByLabel('Sede de los precios').selectOption({ label: 'SUR1 · Sur Centro' });
  await expect(row(page, 'PROC-CURA')).toContainText('$40.00');
  await expect(row(page, 'PROC-CURA')).toContainText('Usa el precio general');
  await row(page, 'PROC-CURA').getByRole('button', { name: 'Editar Curación ficticia' }).click();
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
  const tabs = page.getByRole('navigation', { name: 'Catálogos' });
  await tabs.getByRole('link', { name: /Fuentes de referido/ }).click();
  await expect(row(page, 'REDES')).toContainText('Redes sociales');
  await expectAccessible(page);

  // T-011b. Pruebas: la de estreptococo no tiene laboratorio; A1c sí.
  await tabs.getByRole('link', { name: /Pruebas de laboratorio/ }).click();
  await expect(row(page, 'LAB-STREP')).toContainText('$25.00');
  await expect(row(page, 'LAB-STREP')).toContainText('Sin laboratorio asignado');
  await expect(row(page, 'LAB-A1C')).not.toContainText('Sin laboratorio asignado');

  // Proveedores de laboratorio (S-ADM-17): los de la semilla y uno nuevo.
  await tabs.getByRole('link', { name: /Proveedores de laboratorio/ }).click();
  await expect(page).toHaveURL(/\/admin\/catalogos\/proveedores-de-laboratorio$/);
  await expect(page.getByLabel('Sede de los precios')).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: 'LabCorp' })).toContainText('Activo');
  await expect(page.getByRole('row').filter({ hasText: 'CPL' })).toContainText('3');
  await page.getByRole('button', { name: 'Nuevo laboratorio' }).click();
  const newLab = page.getByRole('dialog', { name: 'Nuevo laboratorio' });
  await newLab.getByRole('button', { name: 'Crear' }).click();
  await expect(newLab.getByText('Este campo es obligatorio.')).toHaveCount(2);
  await newLab.getByLabel('Nombre').fill('Laboratorio Ficticio Sur');
  await newLab.getByLabel('Orden de preferencia').fill('4');
  await expectAccessible(page);
  await newLab.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByText('Guardado.').first()).toBeVisible();
  const ficticio = page.getByRole('row').filter({ hasText: 'Laboratorio Ficticio Sur' });
  await expect(ficticio).toContainText('Activo');
  await expectAccessible(page);
  await page.locator('main').screenshot({ path: 'test-results/catalogo-laboratorios.png' });

  // «Laboratorios que la realizan» (S-ADM-16): se marca con su costo en la prueba sin laboratorio.
  await tabs.getByRole('link', { name: /Pruebas de laboratorio/ }).click();
  await row(page, 'LAB-STREP').getByRole('button', { name: 'Editar Prueba rápida de estreptococo' }).click();
  const strep = page.getByRole('dialog', { name: 'Editar prueba de laboratorio' });
  const labsSection = strep.getByRole('group', { name: 'Laboratorios que la realizan' });
  await labsSection.getByRole('checkbox', { name: 'Laboratorio Ficticio Sur' }).click();
  await strep.getByRole('button', { name: 'Guardar' }).click();
  await expect(labsSection.getByText('Este campo es obligatorio.')).toBeVisible();
  await labsSection.getByLabel('Costo para la clínica en Laboratorio Ficticio Sur').fill('7.50');
  await expectAccessible(page);
  await strep.getByRole('button', { name: 'Guardar' }).click();
  await expect(strep).toHaveCount(0);
  await expect(row(page, 'LAB-STREP')).not.toContainText('Sin laboratorio asignado');

  // A1c: CPL cambia de costo desde mañana (hoy sigue el anterior) y Quest deja de hacerla desde hoy.
  await row(page, 'LAB-A1C').getByRole('button', { name: 'Editar Hemoglobina A1c' }).click();
  const a1c = page.getByRole('dialog', { name: 'Editar prueba de laboratorio' });
  const a1cLabs = a1c.getByRole('group', { name: 'Laboratorios que la realizan' });
  await expect(a1cLabs.getByRole('checkbox', { name: 'CPL' })).toBeChecked();
  await expect(a1cLabs.getByLabel('Costo para la clínica en CPL')).toHaveValue('10.00');
  await a1cLabs.getByLabel('Costo para la clínica en CPL').fill('9');
  await a1cLabs.getByLabel('Vigente desde (CPL)').fill(tomorrow.iso);
  await a1cLabs.getByRole('checkbox', { name: 'Quest Diagnostics' }).click();
  await expect(a1cLabs.getByLabel('No la realiza desde (Quest Diagnostics)')).toBeVisible();
  await a1c.getByRole('button', { name: 'Guardar' }).click();
  await expect(a1c).toHaveCount(0);
  await row(page, 'LAB-A1C').getByRole('button', { name: 'Editar Hemoglobina A1c' }).click();
  const again = page.getByRole('dialog', { name: 'Editar prueba de laboratorio' });
  const againLabs = again.getByRole('group', { name: 'Laboratorios que la realizan' });
  await expect(againLabs).toContainText('Hoy cuesta 10.00 USD');
  await expect(againLabs).toContainText(`Desde ${tomorrow.short}: $9.00`);
  await expect(againLabs.getByRole('checkbox', { name: 'Quest Diagnostics' })).not.toBeChecked();
  await expectAccessible(page);
  await againLabs.scrollIntoViewIfNeeded();
  await againLabs.screenshot({ path: 'test-results/catalogo-laboratorios-de-la-prueba.png' });
  await again.getByRole('button', { name: 'Cancelar' }).click();

  // Al desactivar el laboratorio, la prueba vuelve a quedar sin laboratorio.
  await tabs.getByRole('link', { name: /Proveedores de laboratorio/ }).click();
  await ficticio.getByRole('button', { name: 'Desactivar Laboratorio Ficticio Sur' }).click();
  const deactivate = page.getByRole('dialog', { name: '¿Desactivar Laboratorio Ficticio Sur?' });
  await deactivate.getByLabel('Motivo').fill('Prueba ficticia');
  await deactivate.getByRole('button', { name: 'Desactivar' }).click();
  await expect(ficticio).toContainText('Inactivo');
  await tabs.getByRole('link', { name: /Pruebas de laboratorio/ }).click();
  await expect(row(page, 'LAB-STREP')).toContainText('Sin laboratorio asignado');
  await expectAccessible(page);
  await page.locator('main').screenshot({ path: 'test-results/catalogo-pruebas.png' });
});
