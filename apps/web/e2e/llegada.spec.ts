import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { E2E } from './global-setup.ts';

// T-017: llegada con cita y sin cita (S-REC-18 a 27). Dos ventanas: Recepción
// de NOR1 registra la llegada de una cita de hoy y la proveedora de NOR1
// (Diana Doctora, ficticia) ve la cita pasar a «Llegó» sin recargar. Después,
// una visita sin cita de un paciente nuevo, y el rechazo de un segundo
// registro del mismo paciente. La cita es de hoy y la crea esta prueba para
// un paciente que no usa ninguna otra. Datos ficticios.

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

const cards = (page: Page) => page.getByTestId('appointment-card');
const wizardButton = (page: Page, name: string) => page.locator('main').getByRole('button', { name, exact: true });

/** «Crear paciente» desde S-REC-12 (que ya está abierto): vuelve con el paciente elegido. */
async function createPatient(page: Page, firstName: string, lastName: string, birthDate: string) {
  const picker = page.getByRole('dialog', { name: 'Elegir paciente' });
  await picker.getByRole('textbox', { name: 'Buscar paciente' }).fill(`${firstName} ${lastName}`);
  await picker.getByRole('textbox', { name: 'Buscar paciente' }).press('Enter');
  await picker.getByRole('button', { name: 'Crear paciente' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo paciente' });
  await dialog.getByLabel('Nombre', { exact: true }).fill(firstName);
  await dialog.getByLabel('Apellido').fill(lastName);
  await dialog.getByLabel('Fecha de nacimiento').fill(birthDate);
  await dialog.getByRole('button', { name: 'Crear' }).click();
  await expect(dialog).toHaveCount(0);
}

test('Recepción registra la llegada de una cita de hoy y la proveedora la ve en «Llegó» sin recargar; luego, una visita sin cita', async ({ browser }) => {
  const recepcion = await newPage(browser);
  const proveedora = await newPage(browser);
  await signIn(recepcion, 'recepcion.norte@example.test');
  await signIn(proveedora, 'proveedora.nor1@example.test');

  // Una cita de hoy, con la proveedora, para una paciente nueva que no usa ninguna otra prueba.
  await recepcion.goto('/app/NOR1/citas');
  await recepcion.getByRole('button', { name: 'Nueva cita' }).first().click();
  const form = recepcion.getByRole('dialog', { name: 'Nueva cita' });
  await form.getByRole('button', { name: 'Elegir paciente' }).click();
  await createPatient(recepcion, 'Ximena', 'Llegada Cita', '1988-05-20');
  await expect(form).toContainText('Ximena Llegada Cita');
  await form.getByLabel('Tipo de cita').selectOption({ label: 'Consulta general' });
  await form.getByLabel('Hora').fill('23:15');
  await form.getByLabel('Proveedor').selectOption({ label: 'Diana Doctora (ficticia)' });
  await form.getByRole('button', { name: 'Crear cita' }).click();
  await expect(form).toHaveCount(0);

  await proveedora.goto('/app/NOR1/citas');
  const card = cards(proveedora).filter({ hasText: 'Ximena Llegada Cita' });
  await expect(card).toContainText('Programada');

  // S-REC-09 → S-REC-18.
  await cards(recepcion).filter({ hasText: 'Ximena Llegada Cita' }).click();
  await recepcion.getByRole('dialog', { name: 'Cita' }).getByRole('button', { name: 'Registrar llegada' }).click();
  await expect(recepcion).toHaveURL(/\/app\/NOR1\/llegada\/[0-9a-f-]+$/);
  await expect(recepcion.getByRole('heading', { name: 'Registro de llegada', level: 1 })).toBeVisible();

  // Paso 1: la casilla es obligatoria.
  await expect(recepcion.getByRole('heading', { name: 'Paso 1 de 5: Paciente' })).toBeVisible();
  await expect(recepcion.locator('main')).toContainText('Ximena Llegada Cita');
  await wizardButton(recepcion, 'Continuar').click();
  await expect(recepcion.getByRole('alert')).toContainText('Verifique la identidad del paciente antes de continuar.');
  await expectAccessible(recepcion);
  await recepcion.getByRole('checkbox', { name: 'Verifiqué la identidad del paciente' }).click();
  await expect(recepcion.getByRole('alert')).toHaveCount(0);
  await wizardButton(recepcion, 'Continuar').click();

  // Paso 2: la sede activa.
  await expect(recepcion.getByRole('heading', { name: 'Paso 2 de 5: Sede' })).toBeVisible();
  await expect(recepcion.locator('main')).toContainText('NOR1 · America/Chicago');
  await recepcion.getByRole('checkbox', { name: 'Confirmar esta sede' }).click();
  await wizardButton(recepcion, 'Continuar').click();

  // Paso 3: la ruta sugerida por el tipo; Recepción la cambia y se guarda (ADR 0005).
  await expect(recepcion.getByText('Sugerida por el tipo de cita (Consulta general). Puede cambiarla.')).toBeVisible();
  await expect(recepcion.getByRole('radio', { name: /^Estándar/ })).toHaveAttribute('aria-checked', 'true');
  await recepcion.getByRole('radio', { name: /^Solo laboratorio/ }).click();
  await wizardButton(recepcion, 'Continuar').click();

  // Paso 4: en 3A, solo Pago directo y Seguro (ADR 0034). Con Seguro, 6 pasos.
  await expect(recepcion.getByRole('radio', { name: 'Membresía' })).toHaveCount(0);
  await recepcion.getByRole('radio', { name: 'Seguro' }).click();
  await expect(recepcion.getByRole('heading', { name: 'Paso 4 de 6: Cobertura' })).toBeVisible();
  await wizardButton(recepcion, 'Continuar').click();

  // Paso 5: datos del seguro; cambiar de término vacía el valor.
  await wizardButton(recepcion, 'Continuar').click();
  await expect(recepcion.getByRole('alert')).toContainText('Ingrese el nombre del seguro.');
  await recepcion.getByLabel('Nombre del seguro').fill('aseguradora ficticia del norte');
  await expect(recepcion.getByLabel('Nombre del seguro')).toHaveValue('Aseguradora Ficticia Del Norte');
  await recepcion.getByLabel('ID de miembro').fill('FIC-000123');
  await recepcion.getByLabel('Copago').fill('20');
  await recepcion.getByRole('radio', { name: 'Coaseguro' }).click();
  await expect(recepcion.getByLabel('Coaseguro')).toHaveValue('');
  await recepcion.getByLabel('Coaseguro').fill('120');
  await wizardButton(recepcion, 'Continuar').click();
  await expect(recepcion.getByRole('alert')).toContainText('Ingrese un porcentaje entre 0 y 100.');
  await recepcion.getByLabel('Coaseguro').fill('20');
  await expectAccessible(recepcion);
  await wizardButton(recepcion, 'Continuar').click();

  // Paso 6: revisar y confirmar.
  const summary = recepcion.getByRole('region', { name: 'Revisar y confirmar' });
  await expect(summary).toContainText('Ximena Llegada Cita');
  await expect(summary).toContainText(/NOR1-A-\d{6}/);
  await expect(summary).toContainText('Solo laboratorio');
  await expect(summary).toContainText('Seguro');
  await expect(summary).toContainText('Aseguradora Ficticia Del Norte');
  await expect(summary).toContainText('20 %');
  await expectAccessible(recepcion);
  await recepcion.locator('main').screenshot({ path: 'test-results/llegada-confirmar.png' });
  await wizardButton(recepcion, 'Registrar llegada').click();

  // S-REC-27.
  await expect(recepcion.getByRole('heading', { name: 'Llegada registrada' })).toBeVisible();
  await expect(recepcion.locator('main')).toContainText(/NOR1-V-\d{6}/);
  await expect(recepcion.locator('main')).toContainText('Solo laboratorio');
  await expectAccessible(recepcion);
  await recepcion.locator('main').screenshot({ path: 'test-results/llegada-registrada.png' });

  // La proveedora, sin recargar.
  await expect(card).toContainText('Llegó', { timeout: 15_000 });

  // «Abrir visita»: la versión mínima hasta T-018.
  const code = /NOR1-V-\d{6}/.exec((await recepcion.locator('main').textContent()) ?? '')?.[0] ?? '';
  await recepcion.getByRole('button', { name: 'Abrir visita' }).click();
  await expect(recepcion).toHaveURL(/\/app\/NOR1\/visitas\/[0-9a-f-]+$/);
  await expect(recepcion.locator('main')).toContainText(code);
  await expect(recepcion.locator('main')).toContainText('Registrado');
  await expect(recepcion.getByText('La pantalla de la visita llega en T-018.')).toBeVisible();

  // Visita sin cita de un paciente nuevo (S-REC-19), creado desde el selector.
  await recepcion.getByRole('link', { name: 'Citas' }).first().click();
  await recepcion.getByRole('button', { name: 'Sin cita' }).click();
  await expect(recepcion).toHaveURL(/\/app\/NOR1\/llegada\/sin-cita$/);
  await expect(recepcion.getByText('Elija al paciente que acaba de llegar para iniciar la visita sin cita.')).toBeVisible();
  await recepcion.getByRole('button', { name: 'Elegir paciente' }).click();
  await createPatient(recepcion, 'Rogelio', 'Llegada Ficticia', '1979-03-15');
  await expect(recepcion).toHaveURL(/\/app\/NOR1\/llegada\/sin-cita\?paciente=[0-9a-f-]+$/);
  await expect(recepcion.locator('main')).toContainText('Rogelio Llegada Ficticia');

  const walkIn = async () => {
    await recepcion.getByRole('checkbox', { name: 'Verifiqué la identidad del paciente' }).click();
    await wizardButton(recepcion, 'Continuar').click();
    await recepcion.getByRole('checkbox', { name: 'Confirmar esta sede' }).click();
    await wizardButton(recepcion, 'Continuar').click();
    await expect(recepcion.getByLabel('Tipo de cita')).toHaveValue('');
    await wizardButton(recepcion, 'Continuar').click();
    await expect(recepcion.getByRole('radio', { name: 'Pago directo' })).toHaveAttribute('aria-checked', 'true');
    await wizardButton(recepcion, 'Continuar').click();
    await expect(recepcion.getByRole('heading', { name: 'Paso 5 de 5: Confirmar' })).toBeVisible();
    await expect(recepcion.getByRole('region', { name: 'Revisar y confirmar' })).toContainText('Sin cita');
    await wizardButton(recepcion, 'Iniciar visita sin cita').click();
  };
  await walkIn();
  await expect(recepcion.getByRole('heading', { name: 'Llegada registrada' })).toBeVisible();
  await expect(recepcion.locator('main')).toContainText('Pago directo');

  // Un segundo registro del mismo paciente en la sede se rechaza, con el enlace a la visita abierta.
  const url = recepcion.url();
  await recepcion.goto(url);
  await walkIn();
  await expect(recepcion.getByRole('alert')).toContainText('Esta acción no está permitida en el estado actual.');
  await recepcion.getByRole('link', { name: 'Abrir la visita existente' }).click();
  await expect(recepcion).toHaveURL(/\/app\/NOR1\/visitas\/[0-9a-f-]+$/);
  await expect(recepcion.locator('main')).toContainText('Registrado');

  // Sin appointments.check_in (la proveedora) no se registran llegadas: la ruta lleva al Panel.
  await proveedora.goto(url);
  await expect(proveedora).toHaveURL(/\/app\/NOR1\/panel$/);
});
