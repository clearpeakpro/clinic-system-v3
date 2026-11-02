import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { generate } from 'otplib';
import { E2E } from './global-setup.ts';

// T-019: Panel en vivo (S-REC-01 a 05). Con los usuarios ficticios de NOR1:
//  - Recepción registra una llegada en una ventana y, en otra, la tarjeta «En
//    espera», «Pacientes hoy» y la lista cambian en menos de 2 s;
//  - búsqueda en la cola (ADR 0012), tarjeta = filtro con su chip marcado, el
//    filtro dura al navegar y «Restablecer filtros»;
//  - filtro inicial de Enfermería («Enfermería») y de la proveedora
//    («Proveedor» + «Mis pacientes»);
//  - sin conexión en vivo, el indicador del Panel lo dice;
//  - el Propietario de una organización nueva, sin rol clínico (sin
//    panel.view), no ve el Panel (ADR 0027).
// La base es compartida con otras pruebas: los números se comparan con los de
// antes. El cronómetro y «Alerta» / «Crítico» se prueban con reloj fijado en
// las pruebas unitarias y de integración (aquí no se puede esperar 5 minutos).

const run = promisify(execFile);
const apiDir = fileURLToPath(new URL('../../api/', import.meta.url));
const arg = (value: string) => (process.platform === 'win32' ? `"${value}"` : value);

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`));
const expectAccessible = (page: Page) => expect.poll(() => axe(page), { timeout: 10_000 }).toEqual([]);

async function newPage(browser: Browser, options: { live?: boolean; width?: number } = {}): Promise<Page> {
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    locale: 'es-US',
    timezoneId: 'America/Chicago',
    viewport: { width: options.width ?? 1280, height: 900 },
  });
  if (options.live === false) await context.routeWebSocket(/\/api\/socket\.io/, (ws) => { void ws.close(); });
  return context.newPage();
}

async function signIn(page: Page, email: string, password = E2E.password) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

const wizardButton = (page: Page, name: string) => page.locator('main').getByRole('button', { name, exact: true });
const metric = async (page: Page, id: string) => Number(await page.getByTestId(`metric-${id}`).innerText());
const chip = (page: Page, name: string) => page.getByRole('group', { name: 'Estación' }).getByRole('button', { name: new RegExp(`^${name}`) });
const card = (page: Page, name: string) => page.getByRole('list', { name: 'Resumen del día' }).getByRole('button', { name: new RegExp(`^${name}:`) });
const queue = (page: Page) => page.getByRole('table', { name: 'Pacientes en la clínica' });

/** Visita sin cita (S-REC-19) de un paciente nuevo, por el asistente, hasta «Llegada registrada». */
async function walkIn(page: Page, patient: { first: string; last: string; birth: string }) {
  await page.goto('/app/NOR1/citas');
  await page.getByRole('button', { name: 'Sin cita' }).click();
  await page.getByRole('button', { name: 'Elegir paciente' }).click();
  const picker = page.getByRole('dialog', { name: 'Elegir paciente' });
  await picker.getByRole('textbox', { name: 'Buscar paciente' }).fill(`${patient.first} ${patient.last}`);
  await picker.getByRole('textbox', { name: 'Buscar paciente' }).press('Enter');
  await picker.getByRole('button', { name: 'Crear paciente' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo paciente' });
  await dialog.getByLabel('Nombre', { exact: true }).fill(patient.first);
  await dialog.getByLabel('Apellido').fill(patient.last);
  await dialog.getByLabel('Fecha de nacimiento').fill(patient.birth);
  await dialog.getByRole('button', { name: 'Crear' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Verifiqué la identidad del paciente' }).click();
  await wizardButton(page, 'Continuar').click();
  await page.getByRole('checkbox', { name: 'Confirmar esta sede' }).click();
  await wizardButton(page, 'Continuar').click();
  await page.getByRole('radio', { name: /^Estándar/ }).click();
  await wizardButton(page, 'Continuar').click();
  await wizardButton(page, 'Continuar').click();
  // Se envía al final, para medir desde aquí el tiempo hasta la otra ventana.
}

test.describe.configure({ retries: 0 });

test('la llegada aparece en el Panel de otra ventana en menos de 2 s; filtros, búsqueda y filtro inicial por rol', async ({ browser }) => {
  test.setTimeout(240_000);
  const panel = await newPage(browser);
  const mostrador = await newPage(browser);
  for (const page of [panel, mostrador]) {
    await signIn(page, 'recepcion.norte@example.test');
    await expect(page).toHaveURL(/\/app\/NOR1\/panel$/);
  }

  // S-REC-01: encabezado, indicador «En vivo», tarjetas y filtro inicial de Recepción.
  await expect(panel.getByTestId('panel-subtitle')).toHaveText(/^Norte Centro · (Sin citas hoy|1 cita hoy|\d+ citas hoy)$/);
  await expect(panel.getByTestId('panel-live')).toHaveText('En vivo');
  await expect(panel.getByTestId('metric-waiting')).toHaveText(/^\d+$/);
  await expect(chip(panel, 'Todos los abiertos')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByRole('combobox', { name: 'Proveedor' })).toHaveValue('all');
  const waitingBefore = await metric(panel, 'waiting');
  const todayBefore = await metric(panel, 'patientsToday');

  const patient = { first: 'Paula', last: 'Panel En Vivo', birth: '1988-03-09' };
  await walkIn(mostrador, patient);
  await wizardButton(mostrador, 'Iniciar visita sin cita').click();
  await expect(mostrador.getByRole('heading', { name: 'Llegada registrada' })).toBeVisible();
  const row = queue(panel).getByRole('row').filter({ hasText: `${patient.first} ${patient.last}` });
  await expect(row).toBeVisible({ timeout: 2000 });
  await expect(panel.getByTestId('metric-waiting')).toHaveText(String(waitingBefore + 1), { timeout: 2000 });
  await expect(panel.getByTestId('metric-patientsToday')).toHaveText(String(todayBefore + 1), { timeout: 2000 });
  await expect(row).toContainText('Registrado');
  await expect(row).toContainText('Estándar');
  await expect(row).toContainText('Sin asignar');
  await expect(row).toContainText('Sin cita');
  await expect(row).toContainText(/P-\d{6}/);
  await expect(row.getByTestId('queue-waiting')).toHaveText(/^\d+ min$/);
  // Recién llegada: sin «Alerta» ni «Crítico».
  await expect(row.locator('[data-wait-level]')).toHaveCount(0);
  await expectAccessible(panel);
  await panel.locator('main').screenshot({ path: 'test-results/panel-recepcion.png' });

  // Búsqueda en la cola (ADR 0012): sin acentos ni mayúsculas.
  const search = panel.getByRole('searchbox', { name: 'Buscar en la cola' });
  await search.fill('paula panel en vivo');
  await expect(queue(panel).getByRole('row')).toHaveCount(2); // Cabecera y la fila.
  await search.fill('nadie con este nombre ficticio');
  await expect(panel.getByRole('heading', { name: 'No hay pacientes en esta vista' })).toBeVisible();
  await search.fill('');

  // Tarjeta = filtro: «En espera» marca también su chip; otra vez, «Todos los abiertos».
  await card(panel, 'En espera').click();
  await expect(card(panel, 'En espera')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(panel, 'En espera')).toHaveAttribute('aria-pressed', 'true');
  await expect(row).toBeVisible();
  // Una tarjeta sin chip aparece como filtro en la barra, con «Quitar filtro».
  await card(panel, 'Con enfermería').click();
  await expect(panel.getByTestId('card-filter')).toHaveText('Con enfermería');
  await expect(row).toHaveCount(0);
  await panel.getByRole('button', { name: 'Quitar el filtro Con enfermería' }).click();
  await expect(chip(panel, 'Todos los abiertos')).toHaveAttribute('aria-pressed', 'true');
  // El filtro dura toda la sesión: se navega y se vuelve.
  await chip(panel, 'Caja').click();
  await panel.getByRole('navigation', { name: 'Navegación principal' }).first().getByRole('link', { name: 'Pacientes', exact: true }).click();
  await panel.getByRole('navigation', { name: 'Navegación principal' }).first().getByRole('link', { name: 'Panel', exact: true }).click();
  await expect(chip(panel, 'Caja')).toHaveAttribute('aria-pressed', 'true');
  // «Restablecer filtros» vuelve al filtro inicial del rol.
  await panel.getByRole('searchbox', { name: 'Buscar en la cola' }).fill('nadie con este nombre ficticio');
  await panel.getByRole('button', { name: 'Restablecer filtros' }).click();
  await expect(chip(panel, 'Todos los abiertos')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByRole('searchbox', { name: 'Buscar en la cola' })).toHaveValue('');

  // Toda fila abre la visita.
  await queue(panel).getByRole('button', { name: `Abrir la visita de ${patient.first} ${patient.last}` }).click();
  await expect(panel).toHaveURL(/\/app\/NOR1\/visitas\/[0-9a-f-]+$/);
  await expect(panel.getByRole('heading', { name: `${patient.first} ${patient.last}`, level: 1 })).toBeVisible();

  // Enfermería: chip «Enfermería» (Registrado está en su grupo).
  const enfermeria = await newPage(browser);
  await signIn(enfermeria, 'enfermeria.norte@example.test');
  await expect(enfermeria).toHaveURL(/\/app\/NOR1\/panel$/);
  await expect(chip(enfermeria, 'Enfermería')).toHaveAttribute('aria-pressed', 'true');
  await expect(queue(enfermeria).getByRole('row').filter({ hasText: `${patient.first} ${patient.last}` })).toBeVisible();
  await expect(enfermeria.getByRole('combobox', { name: 'Proveedor' }).locator('option', { hasText: 'Mis pacientes' })).toHaveCount(0);

  // Proveedora: «Proveedor» + «Mis pacientes»; la visita sin asignar no es suya.
  const proveedora = await newPage(browser);
  await signIn(proveedora, 'proveedora.nor1@example.test');
  await expect(proveedora).toHaveURL(/\/app\/NOR1\/panel$/);
  await expect(chip(proveedora, 'Proveedor')).toHaveAttribute('aria-pressed', 'true');
  await expect(proveedora.getByRole('combobox', { name: 'Proveedor' })).toHaveValue('mine');
  await expect(proveedora.locator('main')).not.toContainText(`${patient.first} ${patient.last}`);
  await chip(proveedora, 'Todos los abiertos').click();
  await proveedora.getByRole('combobox', { name: 'Proveedor' }).selectOption('none');
  await expect(queue(proveedora).getByRole('row').filter({ hasText: `${patient.first} ${patient.last}` })).toBeVisible();
  await expectAccessible(proveedora);
});

test('sin conexión en vivo, el indicador del Panel avisa que los datos pueden estar desactualizados (teléfono)', async ({ browser }) => {
  const page = await newPage(browser, { live: false, width: 390 });
  await signIn(page, 'recepcion.norte@example.test');
  await expect(page).toHaveURL(/\/app\/NOR1\/panel$/);
  await expect(page.getByTestId('panel-live')).toHaveText(/^(Reconectando|Sin conexión) — los datos pueden estar desactualizados$/);
  await expect(page.getByTestId('metric-waiting')).toHaveText(/^\d+$/);
  // Teléfono: tarjetas en franja desplazable y la lista en tarjetas, sin desbordar la página.
  await expect(page.getByRole('list', { name: 'Pacientes en la clínica' }).or(page.getByRole('heading', { name: 'No hay pacientes en esta vista' }))).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectAccessible(page);
  await page.screenshot({ path: 'test-results/panel-telefono.png', fullPage: true });
  // «Actualizar» vuelve a pedir la foto sin vaciar la pantalla.
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.getByTestId('metric-waiting')).toHaveText(/^\d+$/);
});

test('el Propietario sin rol clínico (sin panel.view) no ve el Panel (ADR 0027)', async ({ page }) => {
  test.setTimeout(120_000);
  if (!process.env.E2E_OPERATOR_URL) throw new Error('Falta E2E_OPERATOR_URL (lo fija global-setup.ts)');
  const created = await run(
    'pnpm',
    [
      'exec', 'tsx', 'scripts/org-create.ts',
      '--organizacion', arg('Clínica Demo Centro (ficticia)'),
      '--propietario-correo', 'propietario.centro@example.test',
      '--propietario-nombre', arg('Propietario Centro (ficticio)'),
      '--sede-codigo', 'CEN1',
      '--sede-nombre', arg('Centro Principal'),
      '--zona-horaria', 'America/Chicago',
    ],
    {
      cwd: apiDir,
      shell: process.platform === 'win32',
      env: { ...process.env, DATABASE_OPERATOR_URL: process.env.E2E_OPERATOR_URL, BASE_URL: process.env.E2E_BASE_URL, OUTBOX_KEY: process.env.E2E_OUTBOX_KEY },
    },
  );
  const link = /https?:\/\/\S+\/invitacion\/\S+/.exec(created.stdout)?.[0];
  if (!link) throw new Error('org:create no mostró el enlace');
  await page.goto(new URL(link).pathname);
  await page.getByLabel('Nombre para mostrar').fill('Propietario Centro (ficticio)');
  await page.getByLabel('Contraseña', { exact: true }).fill('una frase larga del propietario centro');
  await page.getByLabel('Confirmar contraseña').fill('una frase larga del propietario centro');
  await page.getByRole('button', { name: 'Aceptar invitación' }).click();
  await expect(page.getByRole('heading', { name: 'Configurar la verificación en dos pasos' })).toBeVisible();
  await expect(page.getByTestId('totp-secret')).toHaveText(/\w{4}/);
  const secret = (await page.getByTestId('totp-secret').innerText()).replace(/\s/g, '');
  await page.getByLabel('Código de verificación').fill(await generate({ secret }));
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await page.getByText('Guardé estos códigos').click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page).toHaveURL(/\/admin\/usuarios$/);
  const nav = page.getByRole('navigation', { name: 'Navegación principal' }).first();
  await expect(nav.getByRole('link', { name: 'Panel' })).toHaveCount(0);
  await page.goto('/app/CEN1/panel');
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
});
