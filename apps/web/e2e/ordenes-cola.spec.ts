import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { E2E } from './global-setup.ts';

// T-026: ejecutar órdenes y cola de órdenes (S-CLI-03, S-CLI-19, S-CLI-20 y
// S-CLI-22) con los usuarios ficticios de NOR1.
//  - Recepción abre una visita sin cita y Enfermería la envía al proveedor;
//  - la proveedora crea un procedimiento y una prueba de laboratorio, asigna
//    el procedimiento a la enfermera y envía a procedimiento;
//  - la enfermera recibe «Orden asignada a usted» (solo el código), abre su
//    cola con «Asignadas a mí», ve códigos y no nombres ni notas, inicia y
//    completa con nota;
//  - completa la orden de laboratorio desde «Pendientes» y la visita pasa
//    sola a «Listo para caja»; las dos quedan en «Completadas hoy».
// Pacientes nuevos que no usa ninguna otra prueba.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`));
const expectAccessible = (page: Page) => expect.poll(() => axe(page), { timeout: 10_000 }).toEqual([]);

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', locale: 'es-US', timezoneId: 'America/Chicago', viewport: { width: 1280, height: 900 } });
  return context.newPage();
}

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(E2E.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/app\/NOR1\/panel$/);
}

const main = (page: Page) => page.locator('main');
const button = (page: Page, name: string) => main(page).getByRole('button', { name, exact: true });
const snack = (page: Page, text: string) => page.getByText(text, { exact: true });

/** Recepción: paciente nuevo, visita sin cita (Estándar) y «Enviar a enfermería». Devuelve la ruta de la visita. */
async function walkInToNurse(page: Page, firstName: string, lastName: string): Promise<string> {
  await page.goto('/app/NOR1/citas');
  await page.getByRole('button', { name: 'Sin cita' }).click();
  await page.getByRole('button', { name: 'Elegir paciente' }).click();
  const picker = page.getByRole('dialog', { name: 'Elegir paciente' });
  await picker.getByRole('textbox', { name: 'Buscar paciente' }).fill(`${firstName} ${lastName}`);
  await picker.getByRole('textbox', { name: 'Buscar paciente' }).press('Enter');
  await picker.getByRole('button', { name: 'Crear paciente' }).first().click();
  const created = page.getByRole('dialog', { name: 'Nuevo paciente' });
  await created.getByLabel('Nombre', { exact: true }).fill(firstName);
  await created.getByLabel('Apellido').fill(lastName);
  await created.getByLabel('Fecha de nacimiento').fill('1979-03-22');
  await created.getByRole('button', { name: 'Crear' }).click();
  await expect(created).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Verifiqué la identidad del paciente' }).click();
  await button(page, 'Continuar').click();
  await page.getByRole('checkbox', { name: 'Confirmar esta sede' }).click();
  await button(page, 'Continuar').click();
  await page.getByRole('radio', { name: /^Estándar/ }).click();
  await button(page, 'Continuar').click();
  await button(page, 'Continuar').click();
  await button(page, 'Iniciar visita sin cita').click();
  await expect(page.getByRole('heading', { name: 'Llegada registrada' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir visita' }).click();
  await expect(page).toHaveURL(/\/app\/NOR1\/visitas\/[0-9a-f-]+$/);
  const url = new URL(page.url()).pathname;
  await button(page, 'Enviar a enfermería').click();
  await expect(snack(page, 'Visita movida a Esperando enfermería.')).toBeVisible();
  return url;
}

/** Enfermería: peso y presión (inicia la enfermería) y «Enviar al proveedor». */
async function nurseToProvider(page: Page, visitUrl: string) {
  await page.goto(visitUrl);
  const vitals = page.getByRole('form', { name: 'Signos vitales' });
  await vitals.getByLabel('Peso (lb)').fill('164');
  await vitals.getByLabel('Sistólica (mmHg)').fill('121');
  await vitals.getByLabel('Diastólica (mmHg)').fill('79');
  await vitals.getByRole('button', { name: 'Guardar signos vitales' }).click();
  await expect(page.getByText(/^Signos vitales guardados\./)).toBeVisible();
  await button(page, 'Enviar al proveedor').click();
  const confirm = page.getByRole('dialog', { name: '¿Enviar al proveedor?' }).or(page.getByRole('alertdialog', { name: '¿Enviar al proveedor?' }));
  await confirm.getByRole('button', { name: 'Enviar al proveedor' }).click();
  await expect(snack(page, 'Enviado al proveedor.')).toBeVisible();
}

test.describe.configure({ retries: 0 });

test('la enfermera ejecuta las órdenes desde su cola y la visita pasa sola a Listo para caja', async ({ browser }) => {
  test.setTimeout(240_000);
  const recepcion = await newPage(browser);
  const enfermeria = await newPage(browser);
  const proveedora = await newPage(browser);
  await signIn(recepcion, 'recepcion.norte@example.test');
  await signIn(enfermeria, 'enfermeria.norte@example.test');
  await signIn(proveedora, 'proveedora.nor1@example.test');

  const visitUrl = await walkInToNurse(recepcion, 'Celia', 'Cola Ficticia');
  await nurseToProvider(enfermeria, visitUrl);

  // La proveedora: un procedimiento con nota y una prueba de laboratorio.
  await proveedora.goto(visitUrl);
  await button(proveedora, 'Iniciar consulta').click();
  await expect(snack(proveedora, 'Visita movida a Con proveedor.')).toBeVisible();
  const section = proveedora.getByTestId('orders-section');
  const dialog = proveedora.getByRole('dialog', { name: 'Nueva orden' });
  await section.getByRole('button', { name: 'Nueva orden' }).click();
  await dialog.getByRole('textbox', { name: 'Buscar por código o nombre' }).fill('lavado');
  await dialog.getByRole('radio', { name: /Lavado ótico/ }).click();
  await dialog.getByLabel('Notas (opcional)').fill('Nota ficticia: oído derecho.');
  await dialog.getByRole('button', { name: 'Crear orden' }).click();
  await expect(snack(proveedora, 'Orden creada.')).toBeVisible();
  await section.getByRole('button', { name: 'Nueva orden' }).click();
  await dialog.getByRole('radio', { name: 'Laboratorio', exact: true }).click();
  await dialog.getByRole('checkbox', { name: /Hemoglobina A1c/ }).click();
  await expect(dialog.getByTestId('lab-groups')).toContainText('Laboratorio sugerido:');
  await dialog.getByRole('button', { name: 'Crear orden' }).click();
  await expect(snack(proveedora, 'Orden creada.')).toBeVisible();
  const procRow = section.getByTestId('order-row').filter({ hasText: 'Lavado ótico' });
  const labRow = section.getByTestId('order-row').filter({ hasText: 'Hemoglobina A1c' });
  const procCode = (await procRow.getAttribute('data-code')) ?? '';
  const labCode = (await labRow.getAttribute('data-code')) ?? '';
  expect(procCode).toMatch(/^NOR1-O-\d{6}$/);
  expect(labCode).toMatch(/^NOR1-O-\d{6}$/);

  // «Asignar orden» (S-CLI-22): a la enfermera, que puede ejecutar en la sede.
  await procRow.getByRole('button', { name: 'Asignar' }).click();
  const assign = proveedora.getByRole('dialog', { name: 'Asignar orden' });
  await expect(assign.getByRole('radio', { name: /Rosa Recepción/ })).toHaveCount(0);
  await expectAccessible(proveedora);
  await assign.getByRole('radio', { name: /Nora Enfermería/ }).click();
  await expect(snack(proveedora, 'Orden asignada.')).toBeVisible();
  await expect(procRow).toContainText('Asignada a Nora Enfermería (ficticia)');
  await button(proveedora, 'Enviar a procedimiento').click();
  await expect(snack(proveedora, 'Visita movida a Procedimiento pendiente.')).toBeVisible();

  // La enfermera: «Orden asignada a usted», solo con el código; abre su cola.
  const bell = enfermeria.getByRole('button', { name: /^Notificaciones/ });
  await expect(bell).toHaveAccessibleName(/Notificaciones, \d+ sin leer/, { timeout: 15_000 });
  await bell.click();
  const panel = enfermeria.getByRole('dialog', { name: 'Notificaciones' });
  const notice = panel.getByRole('button', { name: /Orden asignada a usted/ }).filter({ hasText: `Orden ${procCode}` });
  await expect(notice).toBeVisible({ timeout: 15_000 });
  await expect(panel).not.toContainText('Celia');
  await notice.click();
  await expect(enfermeria).toHaveURL(/\/app\/NOR1\/cola-ordenes\?mias=true$/);
  await expect(enfermeria.getByRole('heading', { name: 'Cola de órdenes' })).toBeVisible();
  await expect(main(enfermeria).getByRole('button', { name: 'Asignadas a mí' })).toHaveAttribute('aria-pressed', 'true');

  // La tarjeta: códigos, servicio, personal y estado de la visita; sin nombres ni notas.
  const card = (code: string) => main(enfermeria).locator(`[data-testid="orders-queue-card"][data-code="${code}"]`);
  const proc = card(procCode);
  await expect(proc).toContainText('Lavado ótico');
  await expect(proc).toContainText(/P-\d{6}/);
  await expect(proc).toContainText(/NOR1-V-\d{6}/);
  await expect(proc).toContainText('Asignada a Usted');
  await expect(proc).toContainText('Diana Doctora (ficticia)');
  await expect(proc).toContainText('Visita: Procedimiento pendiente');
  await expect(main(enfermeria)).not.toContainText('Celia');
  await expect(main(enfermeria)).not.toContainText('Cola Ficticia');
  await expect(main(enfermeria)).not.toContainText('Nota ficticia');
  await expect(card(labCode)).toHaveCount(0);
  await expectAccessible(enfermeria);
  await main(enfermeria).screenshot({ path: 'test-results/ordenes-cola.png' });

  // Iniciar y completar con nota (S-CLI-19 y S-CLI-20).
  await proc.getByRole('button', { name: 'Iniciar' }).click();
  await expect(snack(enfermeria, 'Orden iniciada.')).toBeVisible();
  await expect(proc).toHaveCount(0);
  await main(enfermeria).getByRole('button', { name: /^En curso/ }).click();
  await expect(enfermeria).toHaveURL(/pestana=en-curso/);
  await proc.getByRole('button', { name: 'Completar' }).click();
  const complete = enfermeria.getByRole('dialog', { name: 'Completar orden' });
  await expect(complete.getByLabel('Notas de finalización (opcional)')).toBeFocused();
  await complete.getByLabel('Notas de finalización (opcional)').fill('Nota ficticia de finalización.');
  await expectAccessible(enfermeria);
  await complete.getByRole('button', { name: 'Completar' }).click();
  await expect(snack(enfermeria, 'Orden completada.')).toBeVisible();
  await expect(proc).toHaveCount(0);

  // La de laboratorio, sin asignar: desde «Pendientes» sin el filtro; al completarla, la visita pasa sola.
  await main(enfermeria).getByRole('button', { name: /^Pendientes/ }).click();
  await main(enfermeria).getByRole('button', { name: 'Asignadas a mí' }).click();
  await expect(enfermeria).toHaveURL(/\/app\/NOR1\/cola-ordenes$/);
  const lab = card(labCode);
  await expect(lab).toContainText('Sin asignar');
  await expect(lab).toContainText('Laboratorio:');
  await lab.getByRole('button', { name: 'Iniciar' }).click();
  await expect(snack(enfermeria, 'Orden iniciada.')).toBeVisible();
  await main(enfermeria).getByRole('button', { name: /^En curso/ }).click();
  await lab.getByRole('button', { name: 'Completar' }).click();
  await complete.getByRole('button', { name: 'Completar' }).click();
  await expect(snack(enfermeria, 'Orden completada. La visita pasó a Listo para caja.')).toBeVisible();

  // «Completadas hoy»: las dos; «Abrir visita» lleva a la sección Órdenes.
  await main(enfermeria).getByRole('button', { name: /^Completadas hoy/ }).click();
  await expect(card(procCode)).toContainText('Completada');
  await expect(card(labCode)).toContainText('Completada');
  await expect(card(labCode)).toContainText('Visita: Listo para caja');
  await card(procCode).getByRole('button', { name: /^Abrir la visita/ }).click();
  await expect(enfermeria).toHaveURL(/\/app\/NOR1\/visitas\/[0-9a-f-]+\?section=orders$/);
  await expect(main(enfermeria).getByText('Estado: Listo para caja', { exact: true })).toBeVisible();
  await expect(enfermeria.getByTestId('order-row').filter({ hasText: 'Lavado ótico' })).toContainText('Nota ficticia: oído derecho. Nota ficticia de finalización.');

  // La proveedora lo ve en vivo.
  await expect(main(proveedora).getByText('Estado: Listo para caja', { exact: true })).toBeVisible({ timeout: 15_000 });
});
