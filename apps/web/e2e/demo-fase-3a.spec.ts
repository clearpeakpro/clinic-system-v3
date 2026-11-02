import { expect, test, type Page } from '@playwright/test';
import { enrollMfa, freshCode, nav, newWindow, signIn, signOut } from './demo-helpers.ts';

// T-024: recorre el guion docs/DEMO-FASE-3A.md, paso por paso, con los mismos
// usuarios y textos. La base se prepara con `pnpm demo:reset` (ver
// global-setup-demo.ts), con su propia base desechable: la semilla trae las
// visitas abiertas de NOR1 y SUR1, sembradas con el reloj a la hora del
// reinicio, así que «Alerta» y «Crítico» se comprueban al principio.
//
// Tres «ventanas», como en el guion: la normal (Recepción), la de incógnito
// (las demás personas, una tras otra) y la tableta (Edge en el guion), cada
// una un contexto de navegador independiente. Cubre también «Ya soy paciente»
// del kiosco (T-021), que no tenía E2E. Todo con datos ficticios.

const main = (page: Page) => page.locator('main');
const button = (page: Page, name: string) => main(page).getByRole('button', { name, exact: true });
const snack = (page: Page, text: string) => page.getByText(text, { exact: true });
const queue = (page: Page) => page.getByRole('table', { name: 'Pacientes en la clínica' });
const queueRow = (page: Page, name: string) => queue(page).getByRole('row').filter({ hasText: name });
const chip = (page: Page, name: string) => page.getByRole('group', { name: 'Estación' }).getByRole('button', { name: new RegExp(`^${name}`) });
const tray = (page: Page) => page.getByTestId('kiosk-tray');
const arrival = (page: Page, name: string) => tray(page).getByTestId('kiosk-arrival').filter({ hasText: name });
const kiosks = (page: Page) => page.getByRole('region', { name: 'Kioscos de autorregistro' });
const kioskRow = (page: Page, name: string) => kiosks(page).getByTestId('kiosk-row').filter({ hasText: name });
const bell = (page: Page) => page.getByRole('button', { name: /^Notificaciones/ });
const dialog = (page: Page, name: string) => page.getByRole('dialog', { name }).or(page.getByRole('alertdialog', { name }));
const allergy = (page: Page) => page.getByTestId('allergy-banner');

async function goPanel(page: Page) {
  await nav(page).getByRole('link', { name: 'Panel', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/NOR1\/panel$/);
}

async function openFromPanel(page: Page, name: string) {
  await goPanel(page);
  await chip(page, 'Todos los abiertos').click();
  await queue(page).getByRole('button', { name: `Abrir la visita de ${name}` }).click();
  await expect(page).toHaveURL(/\/app\/NOR1\/visitas\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

/** Pasos 1 y 2 del asistente (identidad y sede). */
async function identityAndSite(page: Page) {
  await page.getByRole('checkbox', { name: 'Verifiqué la identidad del paciente' }).click();
  await button(page, 'Continuar').click();
  await page.getByRole('checkbox', { name: 'Confirmar esta sede' }).click();
  await button(page, 'Continuar').click();
}

/** Paso 11 del guion: visita sin cita de un paciente existente, Estándar y Pago directo. */
async function walkIn(page: Page, query: string, name: string) {
  await nav(page).getByRole('link', { name: 'Citas' }).click();
  await page.getByRole('button', { name: 'Sin cita' }).click();
  await page.getByRole('button', { name: 'Elegir paciente' }).click();
  const picker = page.getByRole('dialog', { name: 'Elegir paciente' });
  await picker.getByRole('textbox', { name: 'Buscar paciente' }).fill(query);
  await picker.getByRole('textbox', { name: 'Buscar paciente' }).press('Enter');
  await picker.getByRole('list', { name: 'Resultados' }).getByRole('button').filter({ hasText: name }).first().click();
  await expect(main(page)).toContainText(name);
  await identityAndSite(page);
  await expect(page.getByRole('radio', { name: /^Estándar/ })).toHaveAttribute('aria-checked', 'true');
  await button(page, 'Continuar').click();
  await expect(page.getByRole('radio', { name: 'Pago directo' })).toHaveAttribute('aria-checked', 'true');
  await button(page, 'Continuar').click();
  await button(page, 'Iniciar visita sin cita').click();
  await expect(page.getByRole('heading', { name: 'Llegada registrada' })).toBeVisible();
}

// Un solo recorrido, como lo hace la persona: cada paso depende del anterior.
test.describe.configure({ mode: 'serial', retries: 0 });

test('guion de la demo de la fase 3A (docs/DEMO-FASE-3A.md)', async ({ browser }) => {
  test.setTimeout(600_000);
  const normal = await newWindow(browser);
  const incognito = await newWindow(browser);
  const edge = await (await browser.newContext({ baseURL: 'http://127.0.0.1:4173', locale: 'es-US', timezoneId: 'America/Chicago', viewport: { width: 800, height: 1280 } })).newPage();
  let ownerSecret = '';
  let kioskCode = '';

  // ── Bloque A. El Panel, con «Alerta» y «Crítico» ──

  await test.step('Paso 1: las marcas de espera de la semilla', async () => {
    await signIn(normal, 'recepcion.norte@example.test');
    await expect(normal).toHaveURL(/\/app\/NOR1\/panel$/);
    await expect(normal.getByTestId('panel-live')).toHaveText('En vivo');
    await expect(queueRow(normal, 'Gabriela Jiménez Soto')).toContainText('Registrado');
    await expect(queueRow(normal, 'Gabriela Jiménez Soto').locator('[data-wait-level="critical"]')).toHaveText(/Crítico/);
    await expect(queueRow(normal, 'Tomás Gutiérrez León')).toContainText('Esperando enfermería');
    await expect(queueRow(normal, 'Tomás Gutiérrez León').locator('[data-wait-level="alert"]')).toHaveText(/Alerta/);
    await expect(queueRow(normal, 'Raúl Ortiz Fuentes')).toContainText('Esperando proveedor');
    await expect(queueRow(normal, 'Raúl Ortiz Fuentes').locator('[data-wait-level="critical"]')).toHaveText(/Crítico/);
    for (const [name, status] of [
      ['Ángel Domínguez Vega', 'Con enfermería'],
      ['Valentina Castillo Ríos', 'Con proveedor'],
      ['Sofía Navarro Morales', 'Listo para caja'],
      ['Óscar Delgado Núñez', 'Procedimiento pendiente'],
    ] as const) {
      await expect(queueRow(normal, name)).toContainText(status);
      await expect(queueRow(normal, name).locator('[data-wait-level]')).toHaveCount(0);
    }
  });

  await test.step('Paso 2: sacar a Gabriela de «Crítico»', async () => {
    await queue(normal).getByRole('button', { name: 'Abrir la visita de Gabriela Jiménez Soto' }).click();
    await expect(main(normal)).toContainText(/NOR1-V-\d{6}/);
    await expect(main(normal)).toContainText('Registrado');
    await expect(normal.getByRole('region', { name: 'Cobertura' })).toContainText('Seguro Ficticio Verde');
    await expect(normal.getByRole('region', { name: 'Cobertura' })).toContainText('20 %');
    await button(normal, 'Enviar a enfermería').click();
    await expect(snack(normal, 'Visita movida a Esperando enfermería.')).toBeVisible();
    await goPanel(normal);
    await expect(queueRow(normal, 'Gabriela Jiménez Soto')).toContainText('Esperando enfermería');
    await expect(queueRow(normal, 'Gabriela Jiménez Soto').locator('[data-wait-level]')).toHaveCount(0);
  });

  // ── Bloque B. El kiosco de autorregistro ──

  await test.step('Paso 3: la Propietaria entra con MFA y genera el código', async () => {
    await signIn(incognito, 'propietario.norte@example.test');
    ownerSecret = await enrollMfa(incognito);
    const chooser = incognito.getByRole('heading', { name: 'Seleccionar sede' });
    await expect(chooser.or(incognito.getByRole('heading', { name: 'Usuarios', level: 1 }))).toBeVisible();
    if (await chooser.isVisible()) await incognito.getByRole('button', { name: /NOR1/ }).click();
    await expect(incognito).toHaveURL(/\/admin\/usuarios$/);
    await nav(incognito).getByRole('link', { name: 'Sedes' }).click();
    await expect(kiosks(incognito).getByRole('combobox', { name: 'Sede' }).locator('option:checked')).toHaveText('NOR1 · Norte Centro');
    await expect(kioskRow(incognito, 'Tableta recepción (demo)')).toContainText('Activo');
    await kiosks(incognito).getByRole('button', { name: 'Vincular kiosco' }).click();
    const nameDialog = incognito.getByRole('dialog', { name: 'Vincular kiosco' });
    await nameDialog.getByLabel('Nombre de la tableta').fill('Tableta Edge');
    await nameDialog.getByRole('button', { name: 'Generar código' }).click();
    await expect(incognito.getByTestId('kiosk-code')).toHaveText(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
    await expect(nameDialog).toContainText('/kiosk/NOR1');
    kioskCode = await incognito.getByTestId('kiosk-code').innerText();
  });

  await test.step('Paso 4: vincular la tableta', async () => {
    await edge.goto('/kiosk/NOR1');
    await expect(edge.getByRole('heading', { name: 'Vincular esta tableta' })).toBeVisible();
    await edge.getByLabel('Código de vinculación').fill(kioskCode);
    await edge.getByRole('button', { name: 'Vincular' }).click();
    await expect(edge.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();
    await expect(edge.getByText('Regístrese aquí y tome asiento. Le llamaremos por su nombre.')).toBeVisible();
    await incognito.getByRole('button', { name: 'Listo' }).click();
    await incognito.getByRole('button', { name: 'Actualizar' }).click();
    await expect(kioskRow(incognito, 'Tableta Edge')).toContainText('Activo');
    await expect(kioskRow(incognito, 'Tableta Edge')).toContainText('Último uso');
  });

  await test.step('Paso 5: un paciente nuevo se registra en español', async () => {
    await edge.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Rebeca');
    await edge.getByRole('textbox', { name: 'Apellidos', exact: true }).fill('Salinas Ortiz');
    await edge.getByRole('combobox', { name: /^Mes/ }).selectOption({ label: 'Abril' });
    await edge.getByRole('textbox', { name: 'Día', exact: true }).fill('23');
    await edge.getByRole('textbox', { name: 'Año', exact: true }).fill('1991');
    await edge.getByRole('textbox', { name: 'Teléfono celular', exact: true }).fill('2145550171');
    await edge.getByRole('radio', { name: /^Sí, primera vez/ }).click();
    await edge.getByRole('radio', { name: /^Me siento enfermo/ }).click();
    await edge.getByRole('textbox', { name: /Describa brevemente sus síntomas/ }).fill('Dolor de garganta y fiebre desde ayer');
    await edge.getByRole('button', { name: 'Registrarme' }).click();
    await expect(edge.getByRole('heading', { name: '¡Gracias!' })).toBeVisible();
    await expect(edge.getByText('Tome asiento. Le llamaremos por su nombre.')).toBeVisible();
    await expect(edge.locator('body')).not.toContainText('Rebeca');

    const row = arrival(normal, 'Rebeca Salinas Ortiz');
    await expect(row).toBeVisible({ timeout: 2_000 });
    await expect(row).toContainText('Primera vez');
    await expect(row).toContainText('Me siento enfermo');
    await expect(row).toContainText('«Dolor de garganta y fiebre desde ayer»');
    await expect(row).toContainText('(***) ***-0171');
    await expect(tray(normal).getByRole('button', { name: 'Silenciar' })).toBeVisible();
    await edge.getByRole('button', { name: 'Registrar a otra persona' }).click();
    await expect(edge.getByRole('textbox', { name: 'Nombre', exact: true })).toHaveValue('');
  });

  let rebecaVisit = '';
  await test.step('Paso 6: Recepción confirma a la paciente nueva («Primera vez»)', async () => {
    await arrival(normal, 'Rebeca Salinas Ortiz').getByRole('button', { name: 'Confirmar llegada de Rebeca Salinas Ortiz' }).click();
    await expect(normal).toHaveURL(/\/app\/NOR1\/llegada\/kiosco\/[0-9a-f-]+$/);
    await expect(main(normal)).toContainText('Dice que es su primera vez');
    await button(normal, 'Crear paciente nuevo').click();
    const created = normal.getByRole('dialog', { name: 'Nuevo paciente' });
    await expect(created.getByLabel('Nombre', { exact: true })).toHaveValue('Rebeca');
    await expect(created.getByLabel('Apellido')).toHaveValue('Salinas Ortiz');
    await expect(created.getByLabel('Fecha de nacimiento')).toHaveValue('1991-04-23');
    await created.getByRole('button', { name: 'Crear' }).click();
    await expect(created).toHaveCount(0);
    await identityAndSite(normal);
    await expect(main(normal).getByTestId('declared-reason')).toContainText('Me siento enfermo');
    await expect(main(normal).getByRole('radio', { checked: true })).toHaveCount(0);
    await button(normal, 'Continuar').click();
    await expect(main(normal)).toContainText('Elija una ruta de atención.');
    await normal.getByRole('radio', { name: /^Estándar/ }).click();
    await button(normal, 'Continuar').click();
    await expect(normal.getByRole('radio', { name: 'Pago directo' })).toHaveAttribute('aria-checked', 'true');
    await button(normal, 'Continuar').click();
    await button(normal, 'Iniciar visita sin cita').click();
    await expect(normal.getByRole('heading', { name: 'Llegada registrada' })).toBeVisible();
    await normal.getByRole('button', { name: 'Abrir visita' }).click();
    await expect(normal).toHaveURL(/\/app\/NOR1\/visitas\/[0-9a-f-]+$/);
    rebecaVisit = new URL(normal.url()).pathname;
    await expect(main(normal)).toContainText('Registrado');
    await expect(main(normal).getByTestId('declared-reason')).toContainText('«Dolor de garganta y fiebre desde ayer»');
    await button(normal, 'Enviar a enfermería').click();
    await expect(snack(normal, 'Visita movida a Esperando enfermería.')).toBeVisible();
  });

  await test.step('Paso 7: una paciente con cita se registra en inglés («Ya soy paciente»)', async () => {
    await edge.getByRole('button', { name: 'Change language to English' }).click();
    await expect(edge.getByRole('heading', { name: 'Welcome' })).toBeVisible();
    await edge.getByRole('textbox', { name: 'First name', exact: true }).fill('Paula');
    await edge.getByRole('textbox', { name: 'Last name', exact: true }).fill('Romero Aguilar');
    await edge.getByRole('combobox', { name: /^Month/ }).selectOption({ label: 'September' });
    await edge.getByRole('textbox', { name: 'Day', exact: true }).fill('9');
    await edge.getByRole('textbox', { name: 'Year', exact: true }).fill('1991');
    await edge.getByRole('textbox', { name: 'Mobile phone', exact: true }).fill('2145550119');
    await edge.getByRole('radio', { name: /^No, I am a patient/ }).click();
    await edge.getByRole('radio', { name: /^I am here for results/ }).click();
    await edge.getByRole('button', { name: 'Check in' }).click();
    await expect(edge.getByRole('heading', { name: 'Thank you!' })).toBeVisible();
    // Vuelve sola al formulario en español: el idioma no se guarda.
    await expect(edge.getByRole('heading', { name: 'Bienvenido' })).toBeVisible({ timeout: 20_000 });

    await goPanel(normal);
    const row = arrival(normal, 'Paula Romero Aguilar');
    await expect(row).toContainText('Ya es paciente');
    await expect(row).toContainText('Vengo por resultados');
    await row.getByRole('button', { name: 'Confirmar llegada de Paula Romero Aguilar' }).click();
    await expect(main(normal)).toContainText('Dice que ya es paciente');
    const candidate = main(normal).getByTestId('kiosk-candidate').filter({ hasText: 'Paula Romero Aguilar' });
    await expect(candidate).toContainText('9 sept 1991');
    await expect(candidate).toContainText('(214) 555-0119');
    await candidate.getByRole('button', { name: 'Es Paula Romero Aguilar' }).click();
    // El asistente con su cita de hoy (la de las 11:30 a. m.).
    await expect(main(normal)).toContainText(/Tiene cita hoy \(NOR1-A-\d{6}\): al confirmar, la cita pasa a «Llegó»\./);
    await identityAndSite(normal);
    await normal.getByRole('radio', { name: /^Estándar/ }).click();
    await button(normal, 'Continuar').click();
    await button(normal, 'Continuar').click();
    await button(normal, 'Registrar llegada').click();
    await expect(normal.getByRole('heading', { name: 'Llegada registrada' })).toBeVisible();
    await nav(normal).getByRole('link', { name: 'Citas' }).click();
    await expect(normal.getByTestId('appointment-card').filter({ hasText: 'Paula Romero Aguilar' })).toContainText('Llegó');
  });

  await test.step('Paso 8: descartar un envío de prueba', async () => {
    await edge.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Prueba');
    await edge.getByRole('textbox', { name: 'Apellidos', exact: true }).fill('Tableta Edge');
    await edge.getByRole('combobox', { name: /^Mes/ }).selectOption({ label: 'Enero' });
    await edge.getByRole('textbox', { name: 'Día', exact: true }).fill('1');
    await edge.getByRole('textbox', { name: 'Año', exact: true }).fill('1990');
    await edge.getByRole('textbox', { name: 'Teléfono celular', exact: true }).fill('2145550172');
    await edge.getByRole('radio', { name: /^No, ya soy paciente/ }).click();
    await edge.getByRole('radio', { name: /^Otro motivo/ }).click();
    await edge.getByRole('button', { name: 'Registrarme' }).click();
    await expect(edge.getByRole('heading', { name: '¡Gracias!' })).toBeVisible();

    await goPanel(normal);
    const row = arrival(normal, 'Prueba Tableta Edge');
    await row.getByRole('button', { name: 'Descartar el registro de Prueba Tableta Edge' }).click();
    const discard = dialog(normal, '¿Descartar este registro del kiosco?');
    await discard.getByLabel('Motivo').fill('Envío de prueba de la tableta');
    await discard.getByRole('button', { name: 'Descartar' }).click();
    await expect(snack(normal, 'Registro descartado.')).toBeVisible();
    await expect(row).toHaveCount(0);
  });

  await test.step('Paso 9: revocar la tableta', async () => {
    await kiosks(incognito).getByRole('button', { name: 'Revocar Tableta Edge' }).click();
    const revoke = dialog(incognito, '¿Revocar Tableta Edge?');
    await revoke.getByLabel('Motivo').fill('Fin de la demo del kiosco');
    await revoke.getByRole('button', { name: 'Revocar' }).click();
    await expect(snack(incognito, 'Kiosco revocado.')).toBeVisible();
    await expect(kioskRow(incognito, 'Tableta Edge')).toContainText('Revocado');
    await expect(kioskRow(incognito, 'Tableta recepción (demo)')).toContainText('Activo');
    await edge.reload();
    await expect(edge.getByRole('heading', { name: 'Vincular esta tableta' })).toBeVisible();
    await signOut(incognito);
  });

  // ── Bloque C. Llegadas con cita y sin cita ──

  await test.step('Paso 10: llegada con cita', async () => {
    await nav(normal).getByRole('link', { name: 'Citas' }).click();
    const card = normal.getByTestId('appointment-card').filter({ hasText: 'Isabel Moreno Cruz' });
    await expect(card).toContainText('Confirmada');
    await card.click();
    await normal.getByRole('dialog', { name: 'Cita' }).getByRole('button', { name: 'Registrar llegada' }).click();
    await expect(normal.getByRole('heading', { name: 'Registro de llegada', level: 1 })).toBeVisible();
    await expect(normal.getByRole('heading', { name: 'Paso 1 de 5: Paciente' })).toBeVisible();
    await expect(main(normal)).toContainText('Isabel Moreno Cruz');
    await identityAndSite(normal);
    await expect(normal.getByText('Sugerida por el tipo de cita (Consulta general). Puede cambiarla.')).toBeVisible();
    await expect(normal.getByRole('radio', { name: /^Estándar/ })).toHaveAttribute('aria-checked', 'true');
    await button(normal, 'Continuar').click();
    await normal.getByRole('radio', { name: 'Seguro' }).click();
    await button(normal, 'Continuar').click();
    await normal.getByLabel('Nombre del seguro').fill('aseguradora ficticia del norte');
    await normal.getByLabel('ID de miembro').fill('FIC-000115');
    await normal.getByLabel('Copago').fill('20');
    await expect(normal.getByLabel('Nombre del seguro')).toHaveValue('Aseguradora Ficticia Del Norte');
    await button(normal, 'Continuar').click();
    await button(normal, 'Registrar llegada').click();
    await expect(normal.getByRole('heading', { name: 'Llegada registrada' })).toBeVisible();
    await nav(normal).getByRole('link', { name: 'Citas' }).click();
    await expect(normal.getByTestId('appointment-card').filter({ hasText: 'Isabel Moreno Cruz' })).toContainText('Llegó');
  });

  await test.step('Paso 11: llegada sin cita', async () => {
    await walkIn(normal, 'lucia hernandez', 'Lucía Hernández Díaz');
    await goPanel(normal);
    for (const name of ['Isabel Moreno Cruz', 'Lucía Hernández Díaz', 'Rebeca Salinas Ortiz', 'Paula Romero Aguilar']) {
      await expect(queueRow(normal, name)).toBeVisible();
    }
  });

  // ── Bloque D. Enfermería ──

  await test.step('Paso 12: la cola de enfermería y las alergias en sus tres estados', async () => {
    await signIn(incognito, 'enfermeria.norte@example.test');
    await expect(incognito).toHaveURL(/\/app\/NOR1\/panel$/);
    await nav(incognito).getByRole('link', { name: 'Cola de enfermería' }).click();
    const cards = incognito.getByTestId('nursing-queue-card');
    for (const name of ['Rebeca Salinas Ortiz', 'Gabriela Jiménez Soto', 'Tomás Gutiérrez León']) {
      await expect(cards.filter({ hasText: name })).toContainText('Esperando enfermería');
    }
    await expect(cards.filter({ hasText: 'Tomás Gutiérrez León' }).locator('[data-wait-level]')).toHaveText(/Alerta|Crítico/);
    await expect(cards.filter({ hasText: 'Ángel Domínguez Vega' })).toContainText('Con enfermería');
    await expect(cards.filter({ hasText: 'Óscar Delgado Núñez' })).toContainText('Procedimiento pendiente');
    await cards.filter({ hasText: 'Ángel Domínguez Vega' }).getByRole('button', { name: 'Abrir la visita de Ángel Domínguez Vega' }).click();
    await expect(allergy(incognito)).toHaveAttribute('data-status', 'not_recorded');
    await expect(allergy(incognito)).toHaveText('Alergias no registradas');
    await openFromPanel(incognito, 'Raúl Ortiz Fuentes');
    await expect(allergy(incognito)).toHaveAttribute('data-status', 'none_known');
    await expect(allergy(incognito)).toHaveText('Sin alergias conocidas');
    await openFromPanel(incognito, 'Valentina Castillo Ríos');
    await expect(allergy(incognito)).toHaveAttribute('data-status', 'recorded');
    await expect(allergy(incognito)).toContainText('Penicilina (ficticia).');
  });

  await test.step('Paso 13: sin peso ni presión no se envía al proveedor', async () => {
    await openFromPanel(incognito, 'Ángel Domínguez Vega');
    await button(incognito, 'Enviar al proveedor').click();
    const missing = incognito.getByRole('dialog', { name: 'Sin signos vitales' });
    await expect(missing).toContainText('Se requiere peso o presión arterial antes de enviar al proveedor.');
    await expect(missing.getByRole('button', { name: 'Ir a signos vitales' })).toBeVisible();
    await expect(missing.getByRole('button', { name: 'Enviar con excepción…' })).toHaveCount(0);
    await missing.getByRole('button', { name: 'Cancelar' }).click();
    await expect(main(incognito)).toContainText('Con enfermería');
  });

  await test.step('Paso 14: Enfermería atiende a Rebeca y la envía al proveedor', async () => {
    await nav(incognito).getByRole('link', { name: 'Cola de enfermería' }).click();
    await incognito.getByRole('button', { name: 'Iniciar enfermería de Rebeca Salinas Ortiz' }).click();
    await expect(snack(incognito, 'Enfermería iniciada.')).toBeVisible();
    await expect(main(incognito)).toContainText('Con enfermería');
    await expect(allergy(incognito)).toHaveText('Alergias no registradas');
    const vitals = incognito.getByRole('form', { name: 'Signos vitales' });
    await vitals.getByLabel('Peso (lb)').fill('152');
    await vitals.getByLabel('Estatura: pies (ft)').fill('5');
    await vitals.getByLabel('Estatura: pulgadas (in)').fill('6');
    await vitals.getByLabel('Sistólica (mmHg)').fill('120');
    await vitals.getByLabel('Diastólica (mmHg)').fill('80');
    await expect(incognito.getByTestId('bmi-preview')).toContainText('IMC: 24.5');
    await vitals.getByRole('button', { name: 'Guardar signos vitales' }).click();
    await expect(snack(incognito, 'Signos vitales guardados.')).toBeVisible();
    const assessment = incognito.getByRole('form', { name: 'Valoración' });
    await assessment.locator('summary').filter({ hasText: /^Alergias/ }).click();
    await assessment.getByRole('textbox', { name: 'Alergias' }).fill('Sulfas (ficticia)');
    await assessment.getByRole('button', { name: 'Guardar valoración' }).click();
    await expect(snack(incognito, 'Valoración guardada.')).toBeVisible();
    await expect(allergy(incognito)).toHaveAttribute('data-status', 'recorded');
    await expect(allergy(incognito)).toContainText('Alergias: Sulfas (ficticia)');
    await button(incognito, 'Enviar al proveedor').click();
    await dialog(incognito, '¿Enviar al proveedor?').getByRole('button', { name: 'Enviar al proveedor' }).click();
    await expect(snack(incognito, 'Enviado al proveedor.')).toBeVisible();
    await expect(incognito).toHaveURL(/\/app\/NOR1\/cola-enfermeria$/);
    await expect(incognito.getByTestId('nursing-queue-card').filter({ hasText: 'Rebeca Salinas Ortiz' })).toHaveCount(0);
    await signOut(incognito);
  });

  await test.step('Paso 15: la Propietaria se asigna Recepción en NOR1, con motivo', async () => {
    await signIn(incognito, 'propietario.norte@example.test');
    await expect(incognito.getByRole('heading', { name: 'Verificación en dos pasos' })).toBeVisible();
    await incognito.getByLabel('Código de verificación').fill(await freshCode(ownerSecret));
    const chooser = incognito.getByRole('heading', { name: 'Seleccionar sede' });
    await expect(chooser.or(incognito.getByRole('heading', { name: 'Usuarios', level: 1 }))).toBeVisible();
    if (await chooser.isVisible()) await incognito.getByRole('button', { name: /NOR1/ }).click();
    await expect(incognito).toHaveURL(/\/admin\/usuarios$/);
    await expect(nav(incognito).getByRole('link', { name: 'Pacientes' })).toHaveCount(0);
    await incognito.getByRole('row').filter({ hasText: 'propietario.norte@example.test' }).getByRole('button', { name: /Más acciones/ }).click();
    await incognito.getByRole('menuitem', { name: 'Mis roles clínicos' }).click();
    const roles = incognito.getByRole('dialog', { name: 'Mis roles clínicos' });
    await roles.getByRole('checkbox', { name: 'Recepción en NOR1' }).click();
    await roles.getByRole('button', { name: 'Guardar' }).click();
    await expect(roles.getByText('Se requiere un motivo.')).toBeVisible();
    await roles.getByLabel('Motivo del cambio').fill('Supervisa la demo de enfermería');
    await roles.getByRole('button', { name: 'Guardar' }).click();
    await expect(roles).toHaveCount(0);
    await expect(incognito.getByRole('row').filter({ hasText: 'propietario.norte@example.test' })).toContainText('Recepción');
    await expect(nav(incognito).getByRole('link', { name: 'Pacientes' })).toBeVisible();
    await expect(nav(incognito).getByRole('link', { name: 'Panel', exact: true })).toBeVisible();
  });

  await test.step('Paso 16: la excepción, sin signos vitales y con motivo', async () => {
    await openFromPanel(incognito, 'Ángel Domínguez Vega');
    await button(incognito, 'Enviar con excepción…').click();
    const exception = dialog(incognito, 'Enviar con excepción');
    await expect(exception).toContainText('Sin peso ni presión arterial guardados. El envío queda en el historial de la visita como excepción, con su motivo.');
    await exception.getByRole('button', { name: 'Enviar al proveedor' }).click();
    await expect(exception.getByText('Se requiere un motivo.')).toBeVisible();
    await exception.getByLabel('Motivo').fill('Báscula averiada; el paciente no puede esperar');
    await exception.getByRole('button', { name: 'Enviar al proveedor' }).click();
    await expect(snack(incognito, 'Enviado al proveedor.')).toBeVisible();
    await expect(main(incognito)).toContainText('Esperando proveedor');
    await incognito.getByRole('tab', { name: /^Historial/ }).click();
    const latest = incognito.getByRole('list', { name: 'Historial de estados' }).getByRole('listitem').first();
    await expect(latest).toContainText('Excepción');
    await expect(latest).toContainText('Báscula averiada; el paciente no puede esperar');
    await signOut(incognito);
  });

  // ── Bloque E. El Proveedor ──

  await test.step('Paso 17: «Paciente asignado a usted»', async () => {
    await signIn(incognito, 'proveedora.nor1@example.test');
    await expect(incognito).toHaveURL(/\/app\/NOR1\/panel$/);
    await nav(incognito).getByRole('link', { name: 'Cola de proveedor' }).click();
    await main(incognito).getByRole('button', { name: /^Sin asignar/ }).click();
    const card = (name: string) => incognito.getByTestId('provider-queue-card').filter({ hasText: name });
    await expect(card('Rebeca Salinas Ortiz').getByTestId('allergy-chip')).toHaveText('Alergias: Sulfas (ficticia)');
    await expect(card('Raúl Ortiz Fuentes').getByTestId('allergy-chip')).toHaveText('Sin alergias conocidas');
    await expect(card('Ángel Domínguez Vega').getByTestId('allergy-chip')).toHaveText('Alergias no registradas');
    for (const name of ['Rebeca Salinas Ortiz', 'Raúl Ortiz Fuentes', 'Ángel Domínguez Vega']) await expect(card(name)).toContainText('Esperando proveedor');
    const unreadBefore = Number(/(\d+) sin leer/.exec((await bell(incognito).getAttribute('aria-label')) ?? '')?.[1] ?? '0');

    await normal.goto(rebecaVisit);
    await normal.getByRole('button', { name: 'Asignar proveedor' }).click();
    await normal.getByRole('dialog', { name: 'Asignar proveedor' }).getByRole('radio', { name: 'Diana Doctora (ficticia)' }).click();
    await expect(snack(normal, 'Proveedor actualizado.')).toBeVisible();

    await expect(bell(incognito)).toHaveAccessibleName(`Notificaciones, ${String(unreadBefore + 1)} sin leer`, { timeout: 15_000 });
    await bell(incognito).click();
    const panel = incognito.getByRole('dialog', { name: 'Notificaciones' });
    const notice = panel.getByRole('button', { name: /Paciente asignado a usted/ }).first();
    await expect(notice).toContainText(/Visita NOR1-V-\d{6}/);
    await expect(panel).not.toContainText('Rebeca');
    await notice.click();
    await expect(incognito).toHaveURL(new RegExp(`${rebecaVisit}$`));
    await expect(incognito.getByTestId('encounter-provider')).toHaveText('Usted');
  });

  await test.step('Paso 18: la consulta y «Listo para caja»', async () => {
    await button(incognito, 'Iniciar consulta').click();
    await expect(snack(incognito, 'Visita movida a Con proveedor.')).toBeVisible();
    await expect(incognito.getByTestId('vitals-summary')).toContainText('152 lb');
    await expect(incognito.getByTestId('vitals-summary')).toContainText('120/80 mmHg');
    await expect(main(incognito).getByRole('button', { name: 'Editar valoración' })).toHaveCount(0);
    await button(incognito, 'Listo para caja').click();
    await expect(snack(incognito, 'Visita movida a Listo para caja.')).toBeVisible();
  });

  // ── Bloque F. Cerrar una visita y la visita siguiente ──

  await test.step('Paso 19: cerrar con motivo y ver el historial', async () => {
    await normal.goto(rebecaVisit);
    await button(normal, 'Cerrar visita…').click();
    const close = normal.getByRole('dialog', { name: 'Cerrar visita' });
    await expect(close.getByRole('radio', { name: 'Se retiró antes' })).toHaveAttribute('aria-checked', 'true');
    await close.getByRole('button', { name: 'Cerrar visita' }).click();
    await expect(close.getByText('Se requiere un motivo.', { exact: true })).toBeVisible();
    await close.getByLabel('Motivo').fill('Se fue antes de pasar a Caja');
    await close.getByRole('button', { name: 'Cerrar visita' }).click();
    await expect(snack(normal, 'Visita cerrada: el paciente se retiró.')).toBeVisible();
    await expect(main(normal)).toContainText('Esta visita está cerrada.');
    await expect(main(normal)).toContainText('Motivo: Se fue antes de pasar a Caja');
    await normal.getByRole('tab', { name: /^Historial/ }).click();
    const history = normal.getByRole('list', { name: 'Historial de estados' }).getByRole('listitem');
    await expect(history).toHaveCount(7);
    await expect(history.nth(0)).toContainText('Se retiró');
    await expect(history.nth(0)).toContainText('Se fue antes de pasar a Caja');
    await expect(history.nth(1)).toContainText('Listo para caja');
    await expect(history.nth(6)).toContainText('Registrado');
  });

  await test.step('Paso 20: las alergias aparecen solas en la visita siguiente', async () => {
    await walkIn(normal, 'rebeca salinas', 'Rebeca Salinas Ortiz');
    await normal.getByRole('button', { name: 'Abrir visita' }).click();
    await expect(normal).toHaveURL(/\/app\/NOR1\/visitas\/[0-9a-f-]+$/);
    await button(normal, 'Enviar a enfermería').click();
    await expect(snack(normal, 'Visita movida a Esperando enfermería.')).toBeVisible();
    await expect(allergy(normal)).toHaveCount(0);

    await signOut(incognito);
    await signIn(incognito, 'enfermeria.norte@example.test');
    await expect(incognito).toHaveURL(/\/app\/NOR1\/panel$/);
    await nav(incognito).getByRole('link', { name: 'Cola de enfermería' }).click();
    await incognito.getByRole('button', { name: 'Abrir la visita de Rebeca Salinas Ortiz' }).click();
    await expect(allergy(incognito)).toHaveAttribute('data-status', 'recorded');
    await expect(allergy(incognito)).toContainText('Alergias: Sulfas (ficticia)');
    await signOut(incognito);
  });

  // ── Bloque G. Sur no ve nada de Norte ──

  await test.step('Paso 21: aislamiento entre clínicas', async () => {
    await signIn(incognito, 'recepcion.sur@example.test');
    await expect(incognito).toHaveURL(/\/app\/SUR1\/panel$/);
    for (const name of ['Camila Álvarez Ponce', 'Jorge Mendoza Ibarra', 'Emilio Cabrera Solís', 'Ramón Acosta Lara']) {
      await expect(queue(incognito).getByRole('row').filter({ hasText: name })).toBeVisible();
    }
    for (const name of ['Rebeca Salinas Ortiz', 'Gabriela Jiménez Soto', 'Paula Romero Aguilar']) {
      await expect(main(incognito)).not.toContainText(name);
    }
    await expect(tray(incognito).getByTestId('kiosk-arrival')).toHaveCount(0);
    await nav(incognito).getByRole('link', { name: 'Pacientes' }).click();
    await incognito.getByRole('textbox', { name: 'Buscar paciente' }).fill('rebeca salinas');
    await incognito.getByRole('textbox', { name: 'Buscar paciente' }).press('Enter');
    await expect(incognito.getByText('No se encontraron pacientes')).toBeVisible();
    await incognito.goto('/app/NOR1/panel');
    await expect(incognito.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
  });
});
