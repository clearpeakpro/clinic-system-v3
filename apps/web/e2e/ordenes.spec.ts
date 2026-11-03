import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { E2E } from './global-setup.ts';

// T-025: órdenes con su cargo y laboratorio sugerido (S-CLI-17, S-CLI-18,
// S-CLI-21 y S-CLI-08) con los usuarios ficticios de NOR1.
//  - Recepción abre una visita sin cita y Enfermería la envía al proveedor;
//  - la proveedora inicia la consulta y crea dos órdenes: «Lavado ótico» × 2
//    (el «Cargo estimado» lo da la API) y tres pruebas de laboratorio, que
//    salen en una sola orden con LabCorp, el más barato (ADR 0028), sin ver
//    ningún costo;
//  - «Listo para caja» se bloquea con «Órdenes abiertas» e «Ir a órdenes»;
//  - Enfermería cambia el laboratorio con motivo («Cambiar laboratorio…»);
//  - la proveedora cancela el procedimiento con motivo, envía a
//    procedimiento y, al cancelar la última orden, la visita pasa sola a
//    «Listo para caja».
// Precios y costos de la semilla de Norte. Pacientes nuevos que no usa ninguna otra prueba.

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
  await created.getByLabel('Fecha de nacimiento').fill('1981-07-14');
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
  await vitals.getByLabel('Peso (lb)').fill('171');
  await vitals.getByLabel('Sistólica (mmHg)').fill('118');
  await vitals.getByLabel('Diastólica (mmHg)').fill('76');
  await vitals.getByRole('button', { name: 'Guardar signos vitales' }).click();
  await expect(page.getByText(/^Signos vitales guardados\./)).toBeVisible();
  await button(page, 'Enviar al proveedor').click();
  const confirm = page.getByRole('dialog', { name: '¿Enviar al proveedor?' }).or(page.getByRole('alertdialog', { name: '¿Enviar al proveedor?' }));
  await confirm.getByRole('button', { name: 'Enviar al proveedor' }).click();
  await expect(snack(page, 'Enviado al proveedor.')).toBeVisible();
}

test.describe.configure({ retries: 0 });

test('la proveedora crea órdenes con su cargo y el laboratorio sugerido, y al cancelar la última la visita pasa sola a Caja', async ({ browser }) => {
  test.setTimeout(240_000);
  const recepcion = await newPage(browser);
  const enfermeria = await newPage(browser);
  const proveedora = await newPage(browser);
  await signIn(recepcion, 'recepcion.norte@example.test');
  await signIn(enfermeria, 'enfermeria.norte@example.test');
  await signIn(proveedora, 'proveedora.nor1@example.test');

  const visitUrl = await walkInToNurse(recepcion, 'Olga', 'Órdenes Ficticia');
  await nurseToProvider(enfermeria, visitUrl);

  await proveedora.goto(visitUrl);
  await button(proveedora, 'Iniciar consulta').click();
  await expect(snack(proveedora, 'Visita movida a Con proveedor.')).toBeVisible();
  const section = proveedora.getByTestId('orders-section');
  await expect(section).toContainText('Aún no hay órdenes en esta consulta.');

  // Procedimiento: «Lavado ótico» × 2; el estimado lo calcula la API.
  await section.getByRole('button', { name: 'Nueva orden' }).click();
  const dialog = proveedora.getByRole('dialog', { name: 'Nueva orden' });
  await dialog.getByRole('button', { name: 'Crear orden' }).click();
  await expect(dialog.getByText('Seleccione un elemento.')).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Buscar por código o nombre' }).fill('lavado');
  await dialog.getByRole('radio', { name: /Lavado ótico/ }).click();
  await dialog.getByRole('button', { name: 'Sumar uno' }).click();
  await expect(dialog.getByTestId('order-estimate')).toContainText('$60.00');
  await expect(dialog.getByTestId('order-estimate')).toContainText('$30.00 × 2');
  await expectAccessible(proveedora);
  await dialog.getByRole('button', { name: 'Crear orden' }).click();
  await expect(snack(proveedora, 'Orden creada.')).toBeVisible();
  await expect(dialog).toHaveCount(0);

  // Laboratorio: tres pruebas, una sola orden con LabCorp; solo el nombre del laboratorio.
  await section.getByRole('button', { name: 'Nueva orden' }).click();
  await dialog.getByRole('radio', { name: 'Laboratorio', exact: true }).click();
  for (const test of ['Hemoglobina A1c', 'Perfil tiroideo (TSH)', 'Antígeno prostático (PSA)']) {
    await dialog.getByRole('checkbox', { name: new RegExp(test.replace(/[()]/g, '\\$&')) }).click();
  }
  await expect(dialog.getByTestId('lab-groups')).toContainText('Laboratorio sugerido: LabCorp');
  await expect(dialog.getByTestId('order-estimate')).toContainText('$130.00');
  await expect(dialog).not.toContainText(/costo/i);
  await dialog.getByLabel('Notas (opcional)').fill('Nota ficticia: en ayunas.');
  await dialog.getByRole('button', { name: 'Crear orden' }).click();
  await expect(snack(proveedora, 'Orden creada.')).toBeVisible();
  const labRow = section.getByTestId('order-row').filter({ hasText: 'Hemoglobina A1c' });
  await expect(labRow).toContainText('Laboratorio proveedor: LabCorp');
  await expect(labRow).toContainText('Pendiente');
  await expect(labRow).toContainText('$130.00');
  await expect(labRow).toContainText('Notas: Nota ficticia: en ayunas.');
  await expect(section).not.toContainText(/costo/i);
  await expectAccessible(proveedora);
  await main(proveedora).screenshot({ path: 'test-results/ordenes-seccion.png' });

  // «Listo para caja» con órdenes abiertas: S-CLI-08 e «Ir a órdenes».
  await button(proveedora, 'Listo para caja').click();
  const open = proveedora.getByRole('dialog', { name: 'Órdenes abiertas' });
  await expect(open).toBeVisible();
  await open.getByRole('button', { name: 'Ir a órdenes' }).click();
  await expect(open).toHaveCount(0);
  await expect(section).toBeInViewport();

  // Enfermería cambia el laboratorio, con motivo; la proveedora lo ve en vivo.
  await enfermeria.goto(visitUrl);
  const nurseRow = enfermeria.getByTestId('order-row').filter({ hasText: 'Hemoglobina A1c' });
  await expect(enfermeria.getByTestId('orders-section').getByRole('button', { name: 'Nueva orden' })).toHaveCount(0);
  await nurseRow.getByRole('button', { name: 'Cambiar laboratorio…' }).click();
  const change = enfermeria.getByRole('dialog', { name: 'Cambiar laboratorio' });
  await change.getByRole('radio', { name: 'CPL' }).click();
  await change.getByRole('button', { name: 'Cambiar laboratorio' }).click();
  await expect(change.getByText('Se requiere un motivo.')).toBeVisible();
  await change.getByLabel('Motivo').fill('Motivo ficticio: red del paciente');
  await change.getByRole('button', { name: 'Cambiar laboratorio' }).click();
  await expect(snack(enfermeria, 'Laboratorio cambiado.')).toBeVisible();
  await expect(labRow).toContainText('Laboratorio proveedor: CPL');

  // Cancelar el procedimiento con motivo: su cargo se anula; queda oculta salvo con el conmutador.
  const procRow = section.getByTestId('order-row').filter({ hasText: 'Lavado ótico' });
  await procRow.getByRole('button', { name: 'Cancelar orden' }).click();
  const cancel = proveedora.getByRole('dialog', { name: 'Cancelar orden' });
  await expect(cancel).toContainText('La orden y su cargo quedarán anulados. Esta acción no se puede deshacer.');
  await cancel.getByLabel('Motivo').fill('Motivo ficticio: ya no es necesario');
  await cancel.getByRole('button', { name: 'Cancelar orden' }).click();
  await expect(snack(proveedora, 'Orden cancelada.')).toBeVisible();
  await expect(procRow).toHaveCount(0);
  await section.getByRole('button', { name: 'Mostrar canceladas (1)' }).click();
  await expect(procRow).toContainText('Cancelada: Motivo ficticio: ya no es necesario');

  // «Enviar a procedimiento» y cancelar la última orden abierta: la visita pasa sola a «Listo para caja».
  await button(proveedora, 'Enviar a procedimiento').click();
  await expect(snack(proveedora, 'Visita movida a Procedimiento pendiente.')).toBeVisible();
  await labRow.getByRole('button', { name: 'Cancelar orden' }).click();
  await cancel.getByLabel('Motivo').fill('Motivo ficticio: el paciente lo hará después');
  await cancel.getByRole('button', { name: 'Cancelar orden' }).click();
  await expect(snack(proveedora, 'Orden cancelada. La visita pasó a Listo para caja.')).toBeVisible();
  await expect(main(proveedora).getByText('Estado: Listo para caja', { exact: true })).toBeVisible();
  await expect(button(proveedora, 'Listo para caja')).toHaveCount(0);
  await main(proveedora).getByRole('tab', { name: /^Historial/ }).click();
  await expect(main(proveedora)).toContainText('Sistema');
});
