import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { E2E } from './global-setup.ts';
import { signInSaved } from './sesion.ts';

// T-027: Caja, cola y estado de cuenta (S-CAJ-01 a 08, S-CAJ-16 / S-CLI-23)
// con los usuarios ficticios de NOR1.
//  - Pago directo: Recepción abre una visita «Solo procedimiento», va a Caja
//    desde la sección Facturación y agrega la consulta inicial desde el
//    catálogo (el precio lo pone el servidor: $60.00). Enfermería ve solo los
//    totales, sin «Ir a Caja», y la deja «Listo para caja». En la cola de Caja,
//    Recepción la inicia y, al completarla con saldo, se le pide confirmación
//    con el saldo exacto.
//  - Membresía: Mateo Hernández Díaz (plan Familiar de la semilla, afiliado)
//    llega con «Membresía»; la consulta inicial y la primera de seguimiento
//    salen sin costo («Descuento total», insignia «Membresía», «Pagado»).
// Precios de la semilla de Norte. Pacientes que no usa ninguna otra prueba.

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

/** Recepción: «Sin cita» hasta la cobertura, con un paciente nuevo o uno de la semilla. */
async function startWalkIn(page: Page, patient: { create: { firstName: string; lastName: string } } | { search: string; name: string }, route: RegExp) {
  await page.goto('/app/NOR1/citas');
  await page.getByRole('button', { name: 'Sin cita' }).click();
  await page.getByRole('button', { name: 'Elegir paciente' }).click();
  const picker = page.getByRole('dialog', { name: 'Elegir paciente' });
  if ('create' in patient) {
    await picker.getByRole('textbox', { name: 'Buscar paciente' }).fill(`${patient.create.firstName} ${patient.create.lastName}`);
    await picker.getByRole('textbox', { name: 'Buscar paciente' }).press('Enter');
    await picker.getByRole('button', { name: 'Crear paciente' }).first().click();
    const created = page.getByRole('dialog', { name: 'Nuevo paciente' });
    await created.getByLabel('Nombre', { exact: true }).fill(patient.create.firstName);
    await created.getByLabel('Apellido').fill(patient.create.lastName);
    await created.getByLabel('Fecha de nacimiento').fill('1979-03-11');
    await created.getByRole('button', { name: 'Crear' }).click();
    await expect(created).toHaveCount(0);
  } else {
    await picker.getByRole('textbox', { name: 'Buscar paciente' }).fill(patient.search);
    await picker.getByRole('textbox', { name: 'Buscar paciente' }).press('Enter');
    await picker.getByRole('list', { name: 'Resultados' }).getByRole('button').filter({ hasText: patient.name }).first().click();
  }
  await page.getByRole('checkbox', { name: 'Verifiqué la identidad del paciente' }).click();
  await button(page, 'Continuar').click();
  await page.getByRole('checkbox', { name: 'Confirmar esta sede' }).click();
  await button(page, 'Continuar').click();
  await page.getByRole('radio', { name: route }).click();
  await button(page, 'Continuar').click();
}

/** Termina la llegada y abre la visita. Devuelve su ruta. */
async function finishWalkIn(page: Page): Promise<string> {
  await button(page, 'Iniciar visita sin cita').click();
  await expect(page.getByRole('heading', { name: 'Llegada registrada' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir visita' }).click();
  await expect(page).toHaveURL(/\/app\/NOR1\/visitas\/[0-9a-f-]+$/);
  return new URL(page.url()).pathname;
}

/** Desde la sección Facturación, «Ir a Caja»; agrega una consulta del catálogo. */
async function addConsultation(page: Page, name: RegExp) {
  await main(page).getByRole('button', { name: 'Agregar cargo' }).click();
  const dialog = page.getByRole('dialog', { name: 'Agregar cargo' });
  await dialog.getByRole('radio', { name }).click();
  await dialog.getByRole('button', { name: 'Agregar cargo' }).click();
  await expect(snack(page, 'Cargo agregado.')).toBeVisible();
  await expect(dialog).toHaveCount(0);
}

test.describe.configure({ retries: 0 });

test('pago directo: cargo del catálogo en Caja, totales para Enfermería, cola de Caja y completar con saldo', async ({ browser }) => {
  test.setTimeout(240_000);
  const recepcion = await newPage(browser);
  const enfermeria = await newPage(browser);
  await signIn(recepcion, 'recepcion.norte@example.test');
  await signIn(enfermeria, 'enfermeria.norte@example.test');

  await startWalkIn(recepcion, { create: { firstName: 'Celia', lastName: 'Caja Ficticia' } }, /^Solo procedimiento/);
  await button(recepcion, 'Continuar').click();
  const visitUrl = await finishWalkIn(recepcion);
  const encounterId = visitUrl.split('/').pop() ?? '';
  await button(recepcion, 'Enviar a procedimiento').click();
  await expect(snack(recepcion, 'Visita movida a Procedimiento pendiente.')).toBeVisible();

  // Sección Facturación (S-CLI-23): sin cargos, $0.00, e «Ir a Caja».
  const billing = recepcion.getByTestId('billing-section');
  await expect(billing.getByTestId('total-due')).toContainText('$0.00');
  await billing.getByRole('link', { name: 'Ir a Caja' }).click();
  await expect(recepcion).toHaveURL(new RegExp(`/app/NOR1/caja/${encounterId}$`));
  await expect(recepcion.getByRole('heading', { name: 'Celia Caja Ficticia' })).toBeVisible();
  await expect(main(recepcion)).toContainText('Esta visita aún no tiene cargos.');

  // «Agregar cargo» (S-CAJ-08): solo del catálogo; el precio lo pone el servidor.
  await main(recepcion).getByRole('button', { name: 'Agregar cargo' }).click();
  const dialog = recepcion.getByRole('dialog', { name: 'Agregar cargo' });
  await expect(dialog.getByRole('radio', { name: /Consulta médica inicial/ })).toContainText('$60.00');
  await expect(dialog.getByRole('textbox', { name: /precio/i })).toHaveCount(0);
  await expect(dialog.getByText(/descuento \(USD\)/i)).toHaveCount(0);
  await expectAccessible(recepcion);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await addConsultation(recepcion, /Consulta médica inicial/);
  const line = main(recepcion).getByTestId('statement-line').filter({ hasText: 'CONS-INICIAL' });
  await expect(line).toContainText('Caja');
  await expect(line).toContainText('$60.00');
  await expect(main(recepcion).getByTestId('statement-rule')).toHaveText('Pago directo: el paciente debe el monto completo.');
  await expect(main(recepcion).getByTestId('total-due')).toContainText('$60.00');
  await expect(main(recepcion).getByTestId('total-balance')).toContainText('Abierto');
  await expectAccessible(recepcion);
  await main(recepcion).getByRole('region', { name: 'Estado de cuenta' }).screenshot({ path: 'test-results/caja-estado-de-cuenta.png' });

  // Enfermería: solo los totales, sin «Ir a Caja»; la deja «Listo para caja».
  await enfermeria.goto(visitUrl);
  const nurseBilling = enfermeria.getByTestId('billing-section');
  await expect(nurseBilling.getByTestId('total-due')).toContainText('$60.00');
  await expect(nurseBilling.getByRole('link', { name: 'Ir a Caja' })).toHaveCount(0);
  await expect(nurseBilling).not.toContainText('CONS-INICIAL');
  await button(enfermeria, 'Listo para caja').click();
  await expect(snack(enfermeria, 'Visita movida a Listo para caja.')).toBeVisible();

  // Cola de Caja (S-CAJ-01/02), en vivo: la tarjeta con su saldo e «Iniciar caja».
  await recepcion.goto('/app/NOR1/caja');
  await expect(recepcion.getByRole('heading', { name: 'Caja', exact: true })).toBeVisible();
  const card = main(recepcion).getByTestId('checkout-card').filter({ hasText: 'Celia Caja Ficticia' });
  await expect(card).toContainText('Listo para caja');
  await expect(card).toContainText('$60.00');
  await main(recepcion).getByRole('textbox', { name: 'Buscar por nombre, código de visita o del paciente' }).fill('celia caja');
  await expect(main(recepcion).getByTestId('checkout-card')).toHaveCount(1);
  await expectAccessible(recepcion);
  await card.getByRole('button', { name: 'Iniciar caja' }).click();
  await expect(snack(recepcion, 'Caja iniciada.')).toBeVisible();
  await expect(recepcion).toHaveURL(new RegExp(`/app/NOR1/caja/${encounterId}$`));
  await expect(recepcion.getByTestId('checkout-bar')).toContainText('En caja');

  // «Completar visita» con saldo (S-CAJ-05): confirmación con el saldo exacto.
  await button(recepcion, 'Completar visita').click();
  const confirm = recepcion.getByRole('dialog', { name: 'Completar visita' }).or(recepcion.getByRole('alertdialog', { name: 'Completar visita' }));
  await expect(confirm).toContainText('Queda un saldo de $60.00. Permanecerá en la cuenta del paciente como saldo abierto.');
  await expectAccessible(recepcion);
  await confirm.getByRole('button', { name: 'Completar visita' }).click();
  await expect(snack(recepcion, 'Visita completada.')).toBeVisible();
  await expect(recepcion.getByTestId('checkout-bar')).toContainText('Completada');
  await expect(main(recepcion)).toContainText('Esta visita está cerrada. El estado de cuenta es de solo lectura.');
  await expect(main(recepcion).getByRole('button', { name: 'Agregar cargo' })).toHaveCount(0);
});

test('membresía: la consulta inicial y la primera de seguimiento salen sin costo', async ({ browser }) => {
  test.setTimeout(240_000);
  const recepcion = await newPage(browser);
  await signIn(recepcion, 'recepcion.norte@example.test');

  // Mateo Hernández Díaz: afiliado del plan Familiar de la semilla, activo desde hoy.
  await startWalkIn(recepcion, { search: 'Mateo Hernández', name: 'Mateo Hernández Díaz' }, /^Solo laboratorio/);
  await recepcion.getByRole('radio', { name: 'Membresía' }).click();
  await button(recepcion, 'Continuar').click();
  const visitUrl = await finishWalkIn(recepcion);
  await recepcion.goto(visitUrl);
  await recepcion.getByTestId('billing-section').getByRole('link', { name: 'Ir a Caja' }).click();
  await expect(recepcion).toHaveURL(/\/app\/NOR1\/caja\/[0-9a-f-]+$/);

  await addConsultation(recepcion, /Consulta médica inicial/);
  const inicial = main(recepcion).getByTestId('statement-line').filter({ hasText: 'CONS-INICIAL' });
  await expect(inicial).toContainText('Membresía');
  await expect(main(recepcion).getByTestId('statement-rule')).toHaveText('Los beneficios de la membresía descontaron una o más líneas.');
  await addConsultation(recepcion, /Consulta de seguimiento/);
  await expect(main(recepcion).getByTestId('statement-line').filter({ hasText: 'CONS-SEGUIMIENTO' })).toContainText('Membresía');
  await expect(main(recepcion).getByTestId('total-subtotal')).toContainText('$105.00');
  await expect(main(recepcion).getByTestId('total-discount')).toContainText('$105.00');
  await expect(main(recepcion).getByTestId('total-insurance')).toContainText('$0.00');
  await expect(main(recepcion).getByTestId('total-due')).toContainText('$0.00');
  await expect(main(recepcion).getByTestId('total-balance')).toContainText('Pagado');
  await expectAccessible(recepcion);
  await main(recepcion).getByRole('region', { name: 'Estado de cuenta' }).screenshot({ path: 'test-results/caja-membresia.png' });
});
