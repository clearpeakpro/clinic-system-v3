import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { E2E } from './global-setup.ts';
import { signInSaved } from './sesion.ts';

// T-023: proveedor (S-CLI-02, S-CLI-07, S-CLI-14) con los usuarios ficticios de NOR1.
//  - Recepción abre dos visitas sin cita y Enfermería las envía al proveedor;
//  - la proveedora las ve en «Sin asignar» (no en «Mis pacientes»), con
//    «Enfermería lista» y el aviso de alergias; inicia la primera desde la
//    cola y la segunda desde la barra: las dos quedan asignadas a ella;
//  - el filtro se recuerda; en «Mis pacientes», «Continuar visita»;
//  - corrige signos vitales, ve la valoración sin poder editarla y pulsa
//    «Listo para caja»;
//  - la Cola de enfermería, para ella, es de solo lectura (sin «Iniciar»).
// La visita de otro proveedor y los dos proveedores a la vez se prueban en
// apps/api/test/provider.test.ts. Pacientes nuevos que no usa ninguna otra prueba.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`));
const expectAccessible = (page: Page) => expect.poll(() => axe(page), { timeout: 10_000 }).toEqual([]);

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', locale: 'es-US', timezoneId: 'America/Chicago', viewport: { width: 1280, height: 900 } });
  return context.newPage();
}

async function signIn(page: Page, email: string) {
  if (!(await signInSaved(page, email))) {
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(E2E.password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  }
  await expect(page).toHaveURL(/\/app\/NOR1\/panel$/);
}

const main = (page: Page) => page.locator('main');
const button = (page: Page, name: string) => main(page).getByRole('button', { name, exact: true });
const snack = (page: Page, text: string) => page.getByText(text, { exact: true });
const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegación principal' }).first();

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
  await created.getByLabel('Fecha de nacimiento').fill('1979-03-21');
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
  await vitals.getByLabel('Peso (lb)').fill('160');
  await vitals.getByLabel('Sistólica (mmHg)').fill('124');
  await vitals.getByLabel('Diastólica (mmHg)').fill('78');
  await vitals.getByRole('button', { name: 'Guardar signos vitales' }).click();
  await expect(page.getByText(/^Signos vitales guardados\./)).toBeVisible();
  await button(page, 'Enviar al proveedor').click();
  const confirm = page.getByRole('dialog', { name: '¿Enviar al proveedor?' }).or(page.getByRole('alertdialog', { name: '¿Enviar al proveedor?' }));
  await confirm.getByRole('button', { name: 'Enviar al proveedor' }).click();
  await expect(snack(page, 'Enviado al proveedor.')).toBeVisible();
}

test.describe.configure({ retries: 0 });

test('la proveedora toma pacientes sin asignar desde su cola y desde la barra, corrige signos vitales y los pasa a Caja', async ({ browser }) => {
  test.setTimeout(240_000);
  const recepcion = await newPage(browser);
  const enfermeria = await newPage(browser);
  const proveedora = await newPage(browser);
  await signIn(recepcion, 'recepcion.norte@example.test');
  await signIn(enfermeria, 'enfermeria.norte@example.test');
  await signIn(proveedora, 'proveedora.nor1@example.test');
  const first = 'Pedro Proveedor Ficticio';
  const second = 'Lucía Consulta Ficticia';

  const firstUrl = await walkInToNurse(recepcion, 'Pedro', 'Proveedor Ficticio');
  const secondUrl = await walkInToNurse(recepcion, 'Lucía', 'Consulta Ficticia');
  await nurseToProvider(enfermeria, firstUrl);
  await nurseToProvider(enfermeria, secondUrl);

  // Su cola: «Mis pacientes» al inicio; sin asignar, en «Sin asignar».
  await nav(proveedora).getByRole('link', { name: 'Cola de proveedor' }).click();
  await expect(proveedora).toHaveURL(/\/app\/NOR1\/cola-proveedor$/);
  await expect(main(proveedora).getByRole('button', { name: /^Mis pacientes/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(proveedora.getByTestId('provider-queue-card').filter({ hasText: first })).toHaveCount(0);
  await main(proveedora).getByRole('button', { name: /^Sin asignar/ }).click();
  const card = proveedora.getByTestId('provider-queue-card').filter({ hasText: first });
  await expect(card).toContainText('Esperando proveedor');
  await expect(card).toContainText('Enfermería lista');
  await expect(card).toContainText('Sin asignar');
  await expect(card.getByTestId('allergy-chip')).toHaveAttribute('data-status', 'not_recorded');
  await expect(card.getByTestId('allergy-chip')).toHaveText('Alergias no registradas');
  await expect(proveedora.getByTestId('provider-queue-card').filter({ hasText: second })).toHaveCount(1);
  await proveedora.getByRole('searchbox', { name: 'Buscar en la cola' }).fill('pedro proveedor');
  await expect(proveedora.getByTestId('provider-queue-card')).toHaveCount(1);
  await expectAccessible(proveedora);
  await main(proveedora).screenshot({ path: 'test-results/cola-proveedor.png' });

  // «Iniciar consulta» desde la cola: se la autoasigna y abre la visita.
  await card.getByRole('button', { name: `Iniciar consulta de ${first}` }).click();
  await expect(snack(proveedora, 'Consulta iniciada.')).toBeVisible();
  await expect(proveedora).toHaveURL(new RegExp(`${firstUrl}$`));
  await expect(main(proveedora)).toContainText('Con proveedor');
  await expect(proveedora.getByTestId('encounter-provider')).toHaveText('Usted');

  // Corrige signos vitales; la valoración, solo lectura.
  await expect(main(proveedora).getByRole('button', { name: 'Editar valoración' })).toHaveCount(0);
  await main(proveedora).getByRole('button', { name: 'Editar signos vitales' }).click();
  const vitals = proveedora.getByRole('form', { name: 'Signos vitales' });
  await vitals.getByLabel('Peso (lb)').fill('158.5');
  await vitals.getByRole('button', { name: 'Guardar signos vitales' }).click();
  await expect(snack(proveedora, 'Signos vitales guardados.')).toBeVisible();
  await expect(proveedora.getByTestId('vitals-summary')).toContainText('158.5 lb');
  await expect(main(proveedora)).toContainText('Con proveedor');
  await expectAccessible(proveedora);

  // El filtro se recuerda; en «Mis pacientes», «Continuar visita».
  await nav(proveedora).getByRole('link', { name: 'Cola de proveedor' }).click();
  await expect(main(proveedora).getByRole('button', { name: /^Sin asignar/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(proveedora.getByTestId('provider-queue-card').filter({ hasText: first })).toHaveCount(0);
  await main(proveedora).getByRole('button', { name: /^Mis pacientes/ }).click();
  const mine = proveedora.getByTestId('provider-queue-card').filter({ hasText: first });
  await expect(mine).toContainText('Con proveedor');
  await expect(mine).toContainText('Asignado a mí');
  await mine.getByRole('button', { name: `Continuar visita de ${first}` }).click();
  await expect(proveedora).toHaveURL(new RegExp(`${firstUrl}$`));

  // «Listo para caja».
  await button(proveedora, 'Listo para caja').click();
  await expect(snack(proveedora, 'Visita movida a Listo para caja.')).toBeVisible();
  await expect(main(proveedora)).toContainText('Listo para caja');

  // «Iniciar consulta» desde la barra: también se la autoasigna.
  await proveedora.goto(secondUrl);
  await expect(proveedora.getByTestId('encounter-provider')).toHaveText('Sin asignar');
  await button(proveedora, 'Iniciar consulta').click();
  await expect(snack(proveedora, 'Visita movida a Con proveedor.')).toBeVisible();
  await expect(proveedora.getByTestId('encounter-provider')).toHaveText('Usted');
  await expect(button(proveedora, 'Asignarme')).toHaveCount(0);

  // Cola de enfermería: la ve, pero sin «Iniciar».
  await nav(proveedora).getByRole('link', { name: 'Cola de enfermería' }).click();
  await expect(proveedora).toHaveURL(/\/app\/NOR1\/cola-enfermeria$/);
  await expect(main(proveedora).getByRole('heading', { name: 'Cola de enfermería' })).toBeVisible();
  await expect(main(proveedora).getByRole('button', { name: /^Iniciar enfermería/ })).toHaveCount(0);
});
