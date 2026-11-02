import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { E2E } from './global-setup.ts';

// T-022: enfermería (S-CLI-01, S-CLI-13 a 16, S-CLI-26) con los usuarios ficticios de NOR1.
//  - Recepción envía una visita Estándar a enfermería y ve la vista limitada,
//    sin valores ni aviso de alergias;
//  - Enfermería la inicia desde su cola, guarda signos vitales (con la
//    validación de la presión y el IMC de vista previa) y valoración, ve el
//    aviso de alergias y la envía al proveedor;
//  - la proveedora ve los valores y la valoración, sin poder editar la valoración;
//  - en la visita siguiente del mismo paciente aparecen sus alergias, y
//    «Sin alergias conocidas» cambia el aviso (ADR 0040);
//  - sin peso ni presión, «Enviar al proveedor» lleva a los signos vitales;
//  - con cambios sin guardar, salir pide confirmación (S-CLI-26).
// La excepción del ADR 0033 (Propietario o Administrador con rol clínico) se
// prueba en apps/api/test/nursing.test.ts. Paciente nuevo que no usa ninguna otra prueba.

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
const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegación principal' }).first();

/** Pasos del asistente desde «Paciente» hasta abrir la visita (S-REC-20 a 27), ruta Estándar. */
async function finishWalkIn(page: Page) {
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
}

test.describe.configure({ retries: 0 });

test('Recepción envía a enfermería; Enfermería inicia, registra y envía al proveedor; alergias en la visita siguiente', async ({ browser }) => {
  test.setTimeout(240_000);
  const recepcion = await newPage(browser);
  const enfermeria = await newPage(browser);
  const proveedora = await newPage(browser);
  await signIn(recepcion, 'recepcion.norte@example.test');
  await signIn(enfermeria, 'enfermeria.norte@example.test');
  await signIn(proveedora, 'proveedora.nor1@example.test');
  const patient = 'Elena Enfermería Ficticia';

  // Recepción: visita sin cita de un paciente nuevo y «Enviar a enfermería».
  await recepcion.goto('/app/NOR1/citas');
  await recepcion.getByRole('button', { name: 'Sin cita' }).click();
  await recepcion.getByRole('button', { name: 'Elegir paciente' }).click();
  const picker = recepcion.getByRole('dialog', { name: 'Elegir paciente' });
  await picker.getByRole('textbox', { name: 'Buscar paciente' }).fill(patient);
  await picker.getByRole('textbox', { name: 'Buscar paciente' }).press('Enter');
  await picker.getByRole('button', { name: 'Crear paciente' }).first().click();
  const created = recepcion.getByRole('dialog', { name: 'Nuevo paciente' });
  await created.getByLabel('Nombre', { exact: true }).fill('Elena');
  await created.getByLabel('Apellido').fill('Enfermería Ficticia');
  await created.getByLabel('Fecha de nacimiento').fill('1987-02-14');
  await created.getByRole('button', { name: 'Crear' }).click();
  await expect(created).toHaveCount(0);
  await finishWalkIn(recepcion);
  const visitUrl = new URL(recepcion.url()).pathname;
  const profileHref = await main(recepcion).getByRole('link', { name: 'Abrir perfil del paciente' }).getAttribute('href');
  const patientId = /pacientes\/([0-9a-f-]+)/.exec(profileHref ?? '')?.[1] ?? '';
  await button(recepcion, 'Enviar a enfermería').click();
  await expect(snack(recepcion, 'Visita movida a Esperando enfermería.')).toBeVisible();
  // Recepción: sin aviso de alergias y vista limitada.
  await expect(recepcion.getByTestId('allergy-banner')).toHaveCount(0);
  await expect(recepcion.getByTestId('nursing-limited')).toContainText('Signos vitales');
  await expect(recepcion.getByTestId('nursing-limited')).toContainText('Sin registrar');
  await expect(recepcion.getByTestId('nursing-limited')).toContainText('Los valores clínicos solo son visibles para el personal clínico.');

  // Enfermería: su cola, en vivo, con «Iniciar».
  await nav(enfermeria).getByRole('link', { name: 'Cola de enfermería' }).click();
  await expect(enfermeria).toHaveURL(/\/app\/NOR1\/cola-enfermeria$/);
  const card = enfermeria.getByTestId('nursing-queue-card').filter({ hasText: patient });
  await expect(card).toContainText('Esperando enfermería');
  await expect(card.locator('[data-wait-level]')).toHaveCount(0);
  await enfermeria.getByRole('searchbox', { name: 'Buscar en la cola' }).fill('elena enfermeria');
  await expect(enfermeria.getByTestId('nursing-queue-card')).toHaveCount(1);
  await expectAccessible(enfermeria);
  await main(enfermeria).screenshot({ path: 'test-results/cola-enfermeria.png' });
  await card.getByRole('button', { name: `Iniciar enfermería de ${patient}` }).click();
  await expect(snack(enfermeria, 'Enfermería iniciada.')).toBeVisible();
  await expect(enfermeria).toHaveURL(new RegExp(`${visitUrl}\\?section=nursing$`));
  await expect(main(enfermeria)).toContainText('Con enfermería');
  await expect(enfermeria.getByTestId('allergy-banner')).toHaveAttribute('data-status', 'not_recorded');
  await expect(enfermeria.getByTestId('allergy-banner')).toHaveText('Alergias no registradas');

  // Signos vitales: abiertos en edición; la presión se valida en vivo; IMC de vista previa.
  const vitals = enfermeria.getByRole('form', { name: 'Signos vitales' });
  await vitals.getByLabel('Peso (lb)').fill('152');
  await vitals.getByLabel('Estatura: pies (ft)').fill('5');
  await vitals.getByLabel('Estatura: pulgadas (in)').fill('6');
  await vitals.getByLabel('Sistólica (mmHg)').fill('120');
  await vitals.getByLabel('Diastólica (mmHg)').fill('135');
  await expect(vitals).toContainText('La diastólica debe ser menor que la sistólica.');
  await expect(vitals.getByRole('button', { name: 'Guardar signos vitales' })).toBeDisabled();
  await vitals.getByLabel('Diastólica (mmHg)').fill('80');
  await expect(enfermeria.getByTestId('bmi-preview')).toContainText('IMC: 24.5');

  // Con cambios sin guardar, salir pide confirmación (S-CLI-26).
  await nav(enfermeria).getByRole('link', { name: 'Panel', exact: true }).click();
  const discard = enfermeria.getByRole('alertdialog', { name: '¿Descartar cambios sin guardar?' }).or(enfermeria.getByRole('dialog', { name: '¿Descartar cambios sin guardar?' }));
  await expect(discard).toBeVisible();
  await discard.getByRole('button', { name: 'Seguir editando' }).click();
  await expect(enfermeria).toHaveURL(/\/visitas\//);
  await expect(button(enfermeria, 'Enviar al proveedor')).toBeDisabled();

  await vitals.getByRole('button', { name: 'Guardar signos vitales' }).click();
  await expect(snack(enfermeria, 'Signos vitales guardados.')).toBeVisible();

  // Valoración: alergias del paciente y síntomas de la visita.
  const assessment = enfermeria.getByRole('form', { name: 'Valoración' });
  // Abiertos al inicio: «Síntomas / motivo de consulta» y los que tienen texto (manual).
  await assessment.locator('summary').filter({ hasText: /^Alergias/ }).click();
  await assessment.getByRole('textbox', { name: 'Alergias' }).fill('Penicilina (ficticia)');
  await assessment.getByRole('textbox', { name: 'Síntomas / motivo de consulta' }).fill('Dolor de garganta ficticio');
  await assessment.getByRole('button', { name: 'Guardar valoración' }).click();
  await expect(snack(enfermeria, 'Valoración guardada.')).toBeVisible();
  await expect(enfermeria.getByTestId('allergy-banner')).toHaveAttribute('data-status', 'recorded');
  await expect(enfermeria.getByTestId('allergy-banner')).toContainText('Penicilina (ficticia)');
  await expectAccessible(enfermeria);
  await main(enfermeria).screenshot({ path: 'test-results/visita-enfermeria.png' });

  // Recepción, en vivo: fechas sí, valores no.
  await expect(recepcion.getByTestId('nursing-limited')).toContainText('Registrado', { timeout: 15_000 });
  await expect(main(recepcion)).not.toContainText('Penicilina');
  await expect(main(recepcion)).not.toContainText('152');
  await expect(recepcion.getByTestId('allergy-banner')).toHaveCount(0);

  // «Enviar al proveedor»: confirmación y vuelta a la cola.
  await button(enfermeria, 'Enviar al proveedor').click();
  const confirm = enfermeria.getByRole('dialog', { name: '¿Enviar al proveedor?' }).or(enfermeria.getByRole('alertdialog', { name: '¿Enviar al proveedor?' }));
  await confirm.getByRole('button', { name: 'Enviar al proveedor' }).click();
  await expect(snack(enfermeria, 'Enviado al proveedor.')).toBeVisible();
  await expect(enfermeria).toHaveURL(/\/app\/NOR1\/cola-enfermeria$/);
  await expect(enfermeria.getByTestId('nursing-queue-card').filter({ hasText: patient })).toHaveCount(0);

  // La proveedora: valores y valoración; edita signos vitales, no la valoración.
  await proveedora.goto(visitUrl);
  await expect(main(proveedora)).toContainText('Esperando proveedor');
  await expect(proveedora.getByTestId('vitals-summary')).toContainText('152 lb');
  await expect(proveedora.getByTestId('vitals-summary')).toContainText('120/80 mmHg');
  await expect(proveedora.getByTestId('allergy-banner')).toContainText('Penicilina (ficticia)');
  await expect(main(proveedora).getByRole('button', { name: 'Editar signos vitales' })).toBeVisible();
  await expect(main(proveedora).getByRole('button', { name: 'Editar valoración' })).toHaveCount(0);
  await expect(main(proveedora)).toContainText('Dolor de garganta ficticio');
  await expect(recepcion.getByTestId('nursing-limited')).toContainText('Completado', { timeout: 15_000 });

  // Visita siguiente del mismo paciente: Recepción cierra esta y abre otra.
  await recepcion.goto(visitUrl);
  await button(recepcion, 'Cerrar visita…').click();
  const close = recepcion.getByRole('dialog', { name: 'Cerrar visita' }).or(recepcion.getByRole('alertdialog', { name: 'Cerrar visita' }));
  await close.getByLabel('Motivo').fill('Prueba ficticia de visita siguiente');
  await close.getByRole('button', { name: 'Cerrar visita' }).click();
  await expect(main(recepcion)).toContainText('Esta visita está cerrada.');
  await recepcion.goto(`/app/NOR1/llegada/sin-cita?paciente=${patientId}`);
  await finishWalkIn(recepcion);
  const secondUrl = new URL(recepcion.url()).pathname;
  await button(recepcion, 'Enviar a enfermería').click();
  await expect(snack(recepcion, 'Visita movida a Esperando enfermería.')).toBeVisible();

  await enfermeria.goto(secondUrl);
  await expect(enfermeria.getByTestId('allergy-banner')).toHaveAttribute('data-status', 'recorded');
  await expect(enfermeria.getByTestId('allergy-banner')).toContainText('Penicilina (ficticia)');
  // Sin peso ni presión: «Ir a signos vitales» (Enfermería no tiene la excepción).
  await button(enfermeria, 'Enviar al proveedor').click();
  const missing = enfermeria.getByRole('dialog', { name: 'Sin signos vitales' });
  await expect(missing).toContainText('Se requiere peso o presión arterial antes de enviar al proveedor.');
  await expect(missing.getByRole('button', { name: 'Enviar con excepción…' })).toHaveCount(0);
  await missing.getByRole('button', { name: 'Ir a signos vitales' }).click();
  await expect(enfermeria.getByRole('form', { name: 'Signos vitales' }).getByLabel('Peso (lb)')).toBeFocused();
  // «Sin alergias conocidas»: estado explícito (ADR 0040).
  const second = enfermeria.getByRole('form', { name: 'Valoración' });
  await second.getByRole('textbox', { name: 'Alergias' }).fill('');
  await second.getByRole('checkbox', { name: 'Sin alergias conocidas' }).click();
  await second.getByRole('button', { name: 'Guardar valoración' }).click();
  await expect(snack(enfermeria, 'Valoración guardada. Enfermería iniciada: la visita está ahora con enfermería.')).toBeVisible();
  await expect(enfermeria.getByTestId('allergy-banner')).toHaveAttribute('data-status', 'none_known');
  await expect(enfermeria.getByTestId('allergy-banner')).toHaveText('Sin alergias conocidas');
  await expectAccessible(enfermeria);
});
