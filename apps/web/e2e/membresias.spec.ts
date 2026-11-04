import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { E2E } from './global-setup.ts';

// T-026b parte B (ADR 0034): membresías del paciente con los usuarios ficticios de NOR1.
//  - Recepción inscribe a una paciente nueva en el plan Familiar con un
//    afiliado (S-PAC-23): «Identidad verificada» obligatoria; queda
//    «Pendiente de pago» con la cuota inicial pendiente (S-PAC-22).
//  - Con la membresía activa de la semilla (Paula Romero Aguilar, plan
//    Esencial), la llegada muestra «Membresía activa: …» y ofrece «Membresía»
//    (S-REC-24); el resumen lleva el plan (S-REC-26) y la visita, su cobertura
//    (S-CLI-11).
//  - La proveedora ordena una A1c: sale sin costo por el chequeo incluido y
//    la orden muestra «Membresía −$35.00», calculado por el servidor.
// Pacientes nuevos que no usa ninguna otra prueba, salvo la de la semilla.

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

/** Crea una paciente desde Pacientes y abre su perfil. */
async function createPatient(page: Page, firstName: string, lastName: string, birthDate: string) {
  await page.goto('/app/NOR1/pacientes');
  await page.getByRole('textbox', { name: 'Buscar paciente' }).fill(`${firstName} ${lastName}`);
  await page.getByRole('textbox', { name: 'Buscar paciente' }).press('Enter');
  await page.getByRole('button', { name: 'Crear paciente' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo paciente' });
  await dialog.getByLabel('Nombre', { exact: true }).fill(firstName);
  await dialog.getByLabel('Apellido').fill(lastName);
  await dialog.getByLabel('Fecha de nacimiento').fill(birthDate);
  await dialog.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByRole('heading', { name: `${firstName} ${lastName}`, level: 1 })).toBeVisible();
}

test.describe.configure({ retries: 0 });

test('Recepción inscribe a una paciente en el plan Familiar con un afiliado: queda «Pendiente de pago»', async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await newPage(browser);
  await signIn(page, 'recepcion.norte@example.test');
  await createPatient(page, 'Yago', 'Afiliado Ficticio', '2014-03-09');
  await createPatient(page, 'Zoila', 'Membresía Ficticia', '1983-09-21');

  const card = main(page).getByRole('region', { name: 'Personas de la membresía' });
  await expect(main(page)).toContainText('Sin membresía.');
  await button(page, 'Inscribir en un plan').click();
  const dialog = page.getByRole('dialog', { name: 'Inscribir en un plan' });
  await dialog.getByRole('button', { name: 'Inscribir' }).click();
  await expect(dialog.getByText('Elija un plan.')).toBeVisible();
  await expect(dialog.getByText('Elija el día de cobro.')).toBeVisible();
  await expect(dialog.getByText('Verifique la identidad del titular antes de inscribir.')).toBeVisible();

  await dialog.getByLabel('Plan').selectOption({ label: 'Plan Familiar' });
  await expect(dialog).toContainText('$250.00');
  await expect(dialog).toContainText('$99.00');
  await dialog.getByLabel('Día de cobro').selectOption({ label: 'Día 15' });
  await expect(dialog).toContainText('Primera mensualidad:');
  await dialog.getByRole('textbox', { name: 'Buscar paciente' }).fill('Yago Afiliado');
  await dialog.getByRole('textbox', { name: 'Buscar paciente' }).press('Enter');
  await dialog.getByRole('button', { name: 'Añadir a Yago Afiliado Ficticio' }).click();
  await expect(dialog.getByRole('button', { name: 'Quitar a Yago Afiliado Ficticio' })).toBeVisible();
  await dialog.getByRole('checkbox', { name: 'Identidad verificada' }).click();
  await expect(dialog).toContainText('no guarda números de ID ni de tarjeta');
  await expectAccessible(page);
  await dialog.screenshot({ path: 'test-results/membresia-inscribir.png' });
  await dialog.getByRole('button', { name: 'Inscribir' }).click();
  await expect(page.getByText('Paciente inscrito. Cobre la cuota inicial en Caja para activar la membresía.', { exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);

  await expect(main(page)).toContainText('Plan Familiar');
  await expect(main(page)).toContainText('Pendiente de pago');
  await expect(main(page)).toContainText('Sin beneficios hasta que se pague la cuota inicial en Caja.');
  await expect(card).toContainText('Personas (2 de 4)');
  await expect(card).toContainText('Yago Afiliado Ficticio');
  const fees = main(page).getByRole('region', { name: 'Cuotas' });
  await expect(fees).toContainText('Cuota inicial');
  await expect(fees).toContainText('$250.00');
  await expect(fees).toContainText('Pendiente');
  await expect(main(page)).toContainText('Identidad verificada por Usted');
  await expect(button(page, 'Inscribir en un plan')).toHaveCount(0);
  await expectAccessible(page);
  await main(page).screenshot({ path: 'test-results/membresia-perfil.png' });
});

test('con la membresía activa, la llegada ofrece «Membresía» y la orden recibe el beneficio del plan', async ({ browser }) => {
  test.setTimeout(240_000);
  const recepcion = await newPage(browser);
  const proveedora = await newPage(browser);
  await signIn(recepcion, 'recepcion.norte@example.test');
  await signIn(proveedora, 'proveedora.nor1@example.test');

  // Paula Romero Aguilar: plan Esencial activo desde hoy (semilla).
  await recepcion.goto('/app/NOR1/citas');
  await recepcion.getByRole('button', { name: 'Sin cita' }).click();
  await recepcion.getByRole('button', { name: 'Elegir paciente' }).click();
  const picker = recepcion.getByRole('dialog', { name: 'Elegir paciente' });
  await picker.getByRole('textbox', { name: 'Buscar paciente' }).fill('Paula Romero');
  await picker.getByRole('textbox', { name: 'Buscar paciente' }).press('Enter');
  await picker.getByRole('list', { name: 'Resultados' }).getByRole('button').filter({ hasText: 'Paula Romero Aguilar' }).first().click();
  await recepcion.getByRole('checkbox', { name: 'Verifiqué la identidad del paciente' }).click();
  await button(recepcion, 'Continuar').click();
  await recepcion.getByRole('checkbox', { name: 'Confirmar esta sede' }).click();
  await button(recepcion, 'Continuar').click();
  await recepcion.getByRole('radio', { name: /^Solo laboratorio/ }).click();
  await button(recepcion, 'Continuar').click();

  // Paso 4: el aviso solo informa; la cobertura por defecto sigue siendo «Pago directo».
  await expect(recepcion.getByRole('status').filter({ hasText: 'Membresía activa: Plan Esencial (desde' })).toBeVisible();
  await expect(recepcion.getByRole('radio', { name: 'Pago directo' })).toHaveAttribute('aria-checked', 'true');
  await recepcion.getByRole('radio', { name: 'Membresía' }).click();
  await expect(recepcion.getByRole('heading', { name: 'Paso 4 de 5: Cobertura' })).toBeVisible();
  await expectAccessible(recepcion);
  await button(recepcion, 'Continuar').click();
  await expect(main(recepcion)).toContainText('Plan de membresía');
  await expect(main(recepcion)).toContainText('Plan Esencial');
  await button(recepcion, 'Iniciar visita sin cita').click();
  await expect(recepcion.getByRole('heading', { name: 'Llegada registrada' })).toBeVisible();
  await recepcion.getByRole('button', { name: 'Abrir visita' }).click();
  await expect(recepcion).toHaveURL(/\/app\/NOR1\/visitas\/[0-9a-f-]+$/);
  const visitUrl = new URL(recepcion.url()).pathname;
  const coverage = main(recepcion).locator('#section-coverage');
  await expect(coverage).toContainText('Membresía');
  await expect(coverage).toContainText('Plan Esencial');

  // La proveedora ordena una A1c en la visita solo de laboratorio: el chequeo la incluye.
  await proveedora.goto(visitUrl);
  const section = proveedora.getByTestId('orders-section');
  await section.getByRole('button', { name: 'Nueva orden' }).click();
  const dialog = proveedora.getByRole('dialog', { name: 'Nueva orden' });
  await dialog.getByRole('radio', { name: 'Laboratorio', exact: true }).click();
  await dialog.getByRole('checkbox', { name: /Hemoglobina A1c/ }).click();
  await dialog.getByRole('button', { name: 'Crear orden' }).click();
  await expect(proveedora.getByText('Orden creada.', { exact: true })).toBeVisible();
  const row = section.getByTestId('order-row').filter({ hasText: 'Hemoglobina A1c' });
  await expect(row).toContainText('$35.00');
  await expect(row).toContainText('Membresía');
  await expect(row).toContainText('−$35.00');
  await expectAccessible(proveedora);
  await row.screenshot({ path: 'test-results/membresia-orden.png' });
});
