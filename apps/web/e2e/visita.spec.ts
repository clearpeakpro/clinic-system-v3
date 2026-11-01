import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { generate } from 'otplib';
import { E2E } from './global-setup.ts';

// T-018: pantalla de la visita y su circuito (S-CLI-04 a 12, S-CLI-24, S-PAC-08).
// Con los usuarios ficticios de NOR1:
//  - Recepción abre una visita Estándar sin cita, la envía a enfermería y
//    Enfermería ve «Iniciar enfermería» sin recargar;
//  - una segunda ventana de Recepción, sin conexión en vivo, actúa con la
//    versión vieja y recibe el conflicto (409);
//  - Recepción asigna a la proveedora, que recibe «Paciente asignado a usted»
//    en la campana sin el nombre del paciente y la abre desde ahí;
//  - una visita «Solo inyección» va a procedimiento;
//  - cerrar sin motivo no se permite; con motivo, el banner lo muestra;
//  - la cobertura se corrige y el perfil lista las visitas.
// El Propietario de una organización nueva (como en patient-profile.spec) se
// asigna Recepción y fuerza el estado con motivo (ADR 0033). Pacientes nuevos
// que no usa ninguna otra prueba.

const run = promisify(execFile);
const apiDir = fileURLToPath(new URL('../../api/', import.meta.url));
const arg = (value: string) => (process.platform === 'win32' ? `"${value}"` : value);

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`));
const expectAccessible = (page: Page) => expect.poll(() => axe(page), { timeout: 10_000 }).toEqual([]);

async function newPage(browser: Browser, options: { live?: boolean } = {}): Promise<Page> {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', locale: 'es-US', timezoneId: 'America/Chicago', viewport: { width: 1280, height: 900 } });
  // Sin conexión en vivo: la ventana se queda con la versión que leyó.
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
const actionBar = (page: Page, name: string) => page.locator('main').getByRole('button', { name, exact: true });
const snack = (page: Page, text: string) => page.getByText(text, { exact: true });

/** Visita sin cita (S-REC-19) de un paciente nuevo, por el asistente; termina en la pantalla de la visita. */
async function walkIn(page: Page, sede: string, patient: { first: string; last: string; birth: string }, route: string) {
  await page.goto(`/app/${sede}/citas`);
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
  await page.getByRole('radio', { name: new RegExp(`^${route}`) }).click();
  await wizardButton(page, 'Continuar').click();
  await wizardButton(page, 'Continuar').click();
  await wizardButton(page, 'Iniciar visita sin cita').click();
  await expect(page.getByRole('heading', { name: 'Llegada registrada' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir visita' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/${sede}/visitas/[0-9a-f-]+$`));
  await expect(page.getByRole('heading', { name: `${patient.first} ${patient.last}`, level: 1 })).toBeVisible();
}

test.describe.configure({ retries: 0 });

test('Recepción mueve la visita por su circuito; Enfermería y la proveedora lo ven en vivo; conflicto de versión; cierre con motivo', async ({ browser }) => {
  test.setTimeout(240_000);
  const recepcion = await newPage(browser);
  const enfermeria = await newPage(browser);
  const proveedora = await newPage(browser);
  const stale = await newPage(browser, { live: false });
  for (const [page, email] of [
    [recepcion, 'recepcion.norte@example.test'],
    [enfermeria, 'enfermeria.norte@example.test'],
    [proveedora, 'proveedora.nor1@example.test'],
    [stale, 'recepcion.norte@example.test'],
  ] as const) {
    await signIn(page, email);
    await expect(page).toHaveURL(/\/app\/NOR1\/panel$/);
  }
  const bell = proveedora.getByRole('button', { name: /^Notificaciones/ });
  const unreadBefore = Number(/(\d+) sin leer/.exec((await bell.getAttribute('aria-label')) ?? '')?.[1] ?? '0');

  // S-CLI-04: la visita Estándar recién abierta.
  await walkIn(recepcion, 'NOR1', { first: 'Valeria', last: 'Visita Estándar', birth: '1991-04-12' }, 'Estándar');
  const url = new URL(recepcion.url()).pathname;
  const main = recepcion.locator('main');
  await expect(main).toContainText(/NOR1-V-\d{6}/);
  await expect(main).toContainText('Sin cita');
  await expect(main).toContainText('Registrado');
  await expect(recepcion.getByTestId('encounter-provider')).toHaveText('Sin asignar');
  await expect(recepcion.getByTestId('encounter-waiting')).toHaveText(/\d{2}:\d{2}/);
  await expect(actionBar(recepcion, 'Enviar a enfermería')).toBeVisible();
  await expect(actionBar(recepcion, 'Cerrar visita…')).toBeVisible();
  await expect(actionBar(recepcion, 'Forzar estado…')).toHaveCount(0);
  const coverage = recepcion.getByRole('region', { name: 'Cobertura' });
  await expect(coverage).toContainText('Pago directo');
  await expectAccessible(recepcion);
  await main.screenshot({ path: 'test-results/visita-recepcion.png' });

  // Enfermería la abre en solo lectura; la ventana sin conexión en vivo también la tiene abierta.
  await enfermeria.goto(url);
  await expect(enfermeria.locator('main')).toContainText('No hay acciones disponibles para su rol en este estado.');
  await expect(enfermeria.getByRole('button', { name: 'Editar cobertura' })).toHaveCount(0);
  await stale.goto(url);
  await expect(actionBar(stale, 'Enviar a enfermería')).toBeVisible();

  // Recepción la envía a enfermería; Enfermería ve su paso sin recargar.
  await actionBar(recepcion, 'Enviar a enfermería').click();
  await expect(snack(recepcion, 'Visita movida a Esperando enfermería.')).toBeVisible();
  await expect(main).toContainText('Esperando enfermería');
  await expect(actionBar(enfermeria, 'Iniciar enfermería')).toBeVisible({ timeout: 15_000 });

  // La otra ventana actuó con la versión vieja: 409, aviso y relectura.
  await actionBar(stale, 'Enviar a enfermería').click();
  await expect(snack(stale, 'Otra persona actualizó esta visita. La pantalla se ha actualizado.')).toBeVisible();
  await expect(stale.locator('main')).toContainText('Esperando enfermería');
  await expect(actionBar(stale, 'Enviar a enfermería')).toHaveCount(0);

  // S-CLI-06: asignar a la proveedora.
  await recepcion.getByRole('button', { name: 'Asignar proveedor' }).click();
  const assign = recepcion.getByRole('dialog', { name: 'Asignar proveedor' });
  await expectAccessible(recepcion);
  await assign.getByRole('radio', { name: 'Diana Doctora (ficticia)' }).click();
  await expect(snack(recepcion, 'Proveedor actualizado.')).toBeVisible();
  await expect(recepcion.getByTestId('encounter-provider')).toHaveText('Diana Doctora (ficticia)');
  await expect(recepcion.getByRole('button', { name: 'Cambiar proveedor' })).toBeVisible();

  // La proveedora: «Paciente asignado a usted», con el código y sin el nombre; la abre desde la campana.
  await expect(bell).toHaveAccessibleName(`Notificaciones, ${String(unreadBefore + 1)} sin leer`, { timeout: 15_000 });
  await bell.click();
  const panel = proveedora.getByRole('dialog', { name: 'Notificaciones' });
  const notice = panel.getByRole('button', { name: /Paciente asignado a usted/ }).first();
  await expect(notice).toContainText(/Visita NOR1-V-\d{6}/);
  await expect(panel).not.toContainText('Valeria');
  await expect(panel).not.toContainText('Visita Estándar');
  await notice.click();
  await expect(proveedora).toHaveURL(new RegExp(`${url}$`));
  await expect(proveedora.getByTestId('encounter-provider')).toHaveText('Usted');
  await expect(proveedora.getByRole('button', { name: 'Asignarme' })).toHaveCount(0);

  // S-CLI-12: corregir la cobertura (Recepción).
  await coverage.getByRole('button', { name: 'Editar cobertura' }).click();
  const coverageDialog = recepcion.getByRole('dialog', { name: 'Cobertura' });
  await coverageDialog.getByRole('radio', { name: 'Seguro' }).click();
  await coverageDialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(coverageDialog.getByText('Ingrese el nombre del seguro.')).toBeVisible();
  await coverageDialog.getByLabel('Aseguradora').fill('aseguradora ficticia visita');
  await coverageDialog.getByLabel('Copago').fill('15');
  await expectAccessible(recepcion);
  await coverageDialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(snack(recepcion, 'Cobertura guardada.')).toBeVisible();
  await expect(coverage).toContainText('Aseguradora Ficticia Visita');
  await expect(coverage).toContainText('$15.00');

  // S-CLI-09: cerrar exige motivo; con motivo, banner con el motivo.
  await actionBar(recepcion, 'Cerrar visita…').click();
  const close = recepcion.getByRole('dialog', { name: 'Cerrar visita' });
  await expect(close.getByRole('radio', { name: 'Se retiró antes' })).toHaveAttribute('aria-checked', 'true');
  await close.getByRole('button', { name: 'Cerrar visita' }).click();
  await expect(close.getByText('Se requiere un motivo.', { exact: true })).toBeVisible();
  await close.getByLabel('Motivo').fill('El paciente se retiró antes de la valoración');
  await expectAccessible(recepcion);
  await close.getByRole('button', { name: 'Cerrar visita' }).click();
  await expect(snack(recepcion, 'Visita cerrada: el paciente se retiró.')).toBeVisible();
  await expect(main).toContainText('Esta visita está cerrada.');
  await expect(main).toContainText('Motivo: El paciente se retiró antes de la valoración');
  await expect(actionBar(recepcion, 'Cerrar visita…')).toHaveCount(0);
  await expect(coverage.getByRole('button', { name: 'Editar cobertura' })).toHaveCount(0);

  // S-CLI-24: el historial, de lo más reciente a lo más antiguo, con el motivo.
  await recepcion.getByRole('tab', { name: /^Historial/ }).click();
  const history = recepcion.getByRole('list', { name: 'Historial de estados' }).getByRole('listitem');
  await expect(history).toHaveCount(3);
  await expect(history.nth(0)).toContainText('Esperando enfermería');
  await expect(history.nth(0)).toContainText('Se retiró');
  await expect(history.nth(0)).toContainText('por Usted · v4');
  await expect(history.nth(0)).toContainText('El paciente se retiró antes de la valoración');
  await expect(history.nth(2)).toContainText('Registrado');
  await expectAccessible(recepcion);
  await main.screenshot({ path: 'test-results/visita-historial.png' });

  // S-PAC-08: el perfil lista la visita y la muestra como «Última visita».
  await recepcion.getByRole('link', { name: 'Abrir perfil del paciente' }).click();
  await expect(recepcion.getByTestId('last-encounter')).toContainText('Se retiró');
  await recepcion.getByRole('tab', { name: 'Visitas' }).click();
  const visits = recepcion.getByRole('table', { name: 'Visitas del paciente' });
  await expect(visits).toContainText(/NOR1-V-\d{6}/);
  await expect(visits).toContainText('Diana Doctora (ficticia)');
  await expect(visits).toContainText('Estándar');
  await expectAccessible(recepcion);
  await visits.getByRole('button', { name: /Abrir la visita NOR1-V-/ }).click();
  await expect(recepcion).toHaveURL(new RegExp(`${url}$`));

  // «Solo inyección»: de «Registrado» directo a procedimiento.
  await walkIn(recepcion, 'NOR1', { first: 'Ignacio', last: 'Visita Inyección', birth: '1975-09-30' }, 'Solo inyección');
  await expect(actionBar(recepcion, 'Enviar a enfermería')).toHaveCount(0);
  await actionBar(recepcion, 'Enviar a procedimiento').click();
  await expect(snack(recepcion, 'Visita movida a Procedimiento pendiente.')).toBeVisible();
  await expect(main).toContainText('Procedimiento pendiente');
});

test('el Propietario con Recepción fuerza el estado con motivo (ADR 0033) y queda «Forzado» en el historial', async ({ page }) => {
  test.setTimeout(180_000);
  if (!process.env.E2E_OPERATOR_URL) throw new Error('Falta E2E_OPERATOR_URL (lo fija global-setup.ts)');
  const created = await run(
    'pnpm',
    [
      'exec', 'tsx', 'scripts/org-create.ts',
      '--organizacion', arg('Clínica Demo Oeste (ficticia)'),
      '--propietario-correo', 'propietario.oeste@example.test',
      '--propietario-nombre', arg('Propietario Oeste (ficticio)'),
      '--sede-codigo', 'OES1',
      '--sede-nombre', arg('Oeste Centro'),
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
  await page.getByLabel('Nombre para mostrar').fill('Propietario Oeste (ficticio)');
  await page.getByLabel('Contraseña', { exact: true }).fill('una frase larga del propietario oeste');
  await page.getByLabel('Confirmar contraseña').fill('una frase larga del propietario oeste');
  await page.getByRole('button', { name: 'Aceptar invitación' }).click();
  await expect(page.getByRole('heading', { name: 'Configurar la verificación en dos pasos' })).toBeVisible();
  await expect(page.getByTestId('totp-secret')).toHaveText(/\w{4}/);
  const secret = (await page.getByTestId('totp-secret').innerText()).replace(/\s/g, '');
  await page.getByLabel('Código de verificación').fill(await generate({ secret }));
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await page.getByText('Guardé estos códigos').click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page).toHaveURL(/\/admin\/usuarios$/);

  // Sin rol clínico no llega a la visita: se asigna Recepción en OES1 (ADR 0027).
  await page.getByRole('row').filter({ hasText: 'propietario.oeste@example.test' }).getByRole('button', { name: /Más acciones/ }).click();
  await page.getByRole('menuitem', { name: 'Mis roles clínicos' }).click();
  const roles = page.getByRole('dialog', { name: 'Mis roles clínicos' });
  await roles.getByRole('checkbox', { name: 'Recepción en OES1' }).click();
  await roles.getByLabel('Motivo del cambio').fill('Cubre la recepción esta semana');
  await roles.getByRole('button', { name: 'Guardar' }).click();
  await expect(roles).toHaveCount(0);

  await walkIn(page, 'OES1', { first: 'Octavio', last: 'Visita Forzada', birth: '1983-01-25' }, 'Estándar');
  await page.locator('main').getByRole('button', { name: 'Forzar estado…', exact: true }).click();
  const force = page.getByRole('dialog', { name: 'Cambio excepcional de estado' });
  await expect(force).toContainText('Esto omite el flujo normal. El cambio queda registrado en la auditoría con su motivo.');
  // El destino regular («Esperando enfermería») no se ofrece.
  const options = force.getByLabel('Nuevo estado').locator('option');
  await expect(options).not.toContainText(['Esperando enfermería']);
  await expect(options).not.toContainText(['Se retiró']);
  await force.getByLabel('Nuevo estado').selectOption({ label: 'Con enfermería' });
  await force.getByRole('button', { name: 'Forzar' }).click();
  await expect(force.getByText('Se requiere un motivo.', { exact: true })).toBeVisible();
  await force.getByLabel('Motivo').fill('La enfermera ya la atendía');
  await expectAccessible(page);
  await force.getByRole('button', { name: 'Forzar' }).click();
  await expect(page.getByText('Visita movida a Con enfermería.', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /^Historial/ }).click();
  const latest = page.getByRole('list', { name: 'Historial de estados' }).getByRole('listitem').first();
  await expect(latest).toContainText('Forzado');
  await expect(latest).toContainText('Con enfermería');
  await expect(latest).toContainText('La enfermera ya la atendía');
});
