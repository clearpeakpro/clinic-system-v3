import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { generate } from 'otplib';

// T-020: kiosco de autorregistro (S-KIO-01, S-KIO-02, S-ADM-10).
//  - La Propietaria de una organización nueva vincula una tableta desde Sedes
//    (código de un solo uso). La organización es propia de esta prueba: las
//    cuentas de Administración de la semilla las usan otras E2E con su MFA.
//  - La tableta envía un registro en español y otro en inglés; «Listo» no
//    muestra el nombre y vuelve al formulario en español.
//  - Tras enviar, no queda nada en localStorage, sessionStorage ni IndexedDB,
//    y ninguna respuesta de la API en la caché.
//  - El formulario se borra a los 60 s sin actividad (aviso a los 50 s), al
//    ocultar la pestaña y al recargar.
//  - Revocada desde Sedes, la tableta vuelve a pedir el código.
// Datos ficticios.

const run = promisify(execFile);
const apiDir = fileURLToPath(new URL('../../api/', import.meta.url));
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`));
const expectAccessible = (page: Page) => expect.poll(() => axe(page), { timeout: 10_000 }).toEqual([]);
const arg = (value: string) => (process.platform === 'win32' ? `"${value}"` : value);

async function newPage(browser: Browser, viewport = { width: 1280, height: 900 }): Promise<Page> {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', locale: 'es-US', timezoneId: 'America/Chicago', viewport });
  return context.newPage();
}

/** Organización nueva con su Propietaria (org:create real, como clinic_operator), ya con MFA y en Administración. */
async function ownerOfNewOrganization(page: Page) {
  if (!process.env.E2E_OPERATOR_URL) throw new Error('Falta E2E_OPERATOR_URL (lo fija global-setup.ts)');
  const created = await run(
    'pnpm',
    [
      'exec', 'tsx', 'scripts/org-create.ts',
      '--organizacion', arg('Clínica Demo Kiosco (ficticia)'),
      '--propietario-correo', 'propietaria.kiosco@example.test',
      '--propietario-nombre', arg('Propietaria Kiosco (ficticia)'),
      '--sede-codigo', 'KIO1',
      '--sede-nombre', arg('Kiosco Principal'),
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
  await page.getByLabel('Nombre para mostrar').fill('Propietaria Kiosco (ficticia)');
  await page.getByLabel('Contraseña', { exact: true }).fill('una frase larga de la propietaria kiosco');
  await page.getByLabel('Confirmar contraseña').fill('una frase larga de la propietaria kiosco');
  await page.getByRole('button', { name: 'Aceptar invitación' }).click();
  await expect(page.getByTestId('totp-secret')).toHaveText(/\w{4}/);
  const secret = (await page.getByTestId('totp-secret').innerText()).replace(/\s/g, '');
  await page.getByLabel('Código de verificación').fill(await generate({ secret }));
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await page.getByText('Guardé estos códigos').click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page).toHaveURL(/\/admin\/usuarios$/);
}

/** Lo que quedó en el navegador de la tableta. La caché del service worker solo puede tener la app (nunca /api). */
async function browserLeftovers(page: Page) {
  return page.evaluate(async () => {
    const cached: string[] = [];
    if ('caches' in window) {
      for (const name of await caches.keys()) {
        for (const request of await (await caches.open(name)).keys()) cached.push(request.url);
      }
    }
    return {
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
      indexedDb: (await indexedDB.databases()).map((d) => d.name ?? ''),
      apiInCache: cached.filter((url) => url.includes('/api/')),
      html: document.body.innerText,
    };
  });
}

const form = (page: Page) => page.getByRole('form');

async function fillSpanish(page: Page) {
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Mariana');
  await page.getByLabel('Apellidos').fill('Kiosco Ficticia');
  await page.getByRole('combobox', { name: /^Mes/ }).selectOption({ label: 'Mayo' });
  await page.getByLabel('Día', { exact: true }).fill('14');
  await page.getByLabel('Año').fill('1988');
  await page.getByLabel('Teléfono celular').fill('2145550188');
  await page.getByRole('radio', { name: /^Sí, primera vez/ }).click();
  await page.getByRole('radio', { name: /^Me siento enfermo/ }).click();
}

test.describe.configure({ retries: 0 });

test('la Propietaria vincula una tableta; el paciente se registra en español y en inglés sin dejar nada en el navegador', async ({ browser }) => {
  test.setTimeout(240_000);
  const owner = await newPage(browser);
  await ownerOfNewOrganization(owner);

  // Sedes › Kioscos de autorregistro › «Vincular kiosco».
  await owner.getByRole('navigation', { name: 'Navegación principal' }).first().getByRole('link', { name: 'Sedes' }).click();
  await expect(owner).toHaveURL(/\/admin\/sedes$/);
  const kiosks = owner.getByRole('region', { name: 'Kioscos de autorregistro' });
  await expect(kiosks).toContainText('Esta sede aún no tiene kioscos.');
  await kiosks.getByRole('button', { name: 'Vincular kiosco' }).click();
  const nameDialog = owner.getByRole('dialog', { name: 'Vincular kiosco' });
  await nameDialog.getByLabel('Nombre de la tableta').fill('Tableta recepción 1');
  await nameDialog.getByRole('button', { name: 'Generar código' }).click();
  await expect(owner.getByTestId('kiosk-code')).toHaveText(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
  await expect(owner.getByRole('dialog', { name: 'Vincular kiosco' })).toContainText('/kiosk/KIO1');
  await expectAccessible(owner);
  await owner.screenshot({ path: 'test-results/kiosco-vincular.png' });
  const code = await owner.getByTestId('kiosk-code').innerText();
  await owner.getByRole('button', { name: 'Listo' }).click();

  // La tableta: sin vincular, pide el código.
  const tablet = await newPage(browser, { width: 800, height: 1280 });
  await tablet.clock.install();
  await tablet.goto('/kiosk/KIO1');
  await expect(tablet.getByRole('heading', { name: 'Vincular esta tableta' })).toBeVisible();
  await tablet.getByLabel('Código de vinculación').fill(code.toLowerCase());
  await tablet.getByRole('button', { name: 'Vincular' }).click();
  await expect(tablet.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();
  await expect(tablet.getByText('Regístrese aquí y tome asiento. Le llamaremos por su nombre.')).toBeVisible();
  // Sedes no se actualiza en vivo (manual, S-ADM-10): «Actualizar».
  await owner.getByRole('button', { name: 'Actualizar' }).click();
  await expect(kiosks.getByTestId('kiosk-row').filter({ hasText: 'Tableta recepción 1' })).toContainText('Activo');

  // Validación antes de enviar.
  await tablet.getByRole('button', { name: 'Registrarme' }).click();
  await expect(tablet.getByRole('alert')).toContainText('Revise los datos marcados en rojo.');
  await expect(form(tablet)).toContainText('Elija una opción.');

  // Registro en español.
  await fillSpanish(tablet);
  await tablet.getByLabel(/Describa brevemente sus síntomas/).fill('Fiebre ficticia desde anoche');
  await expect(tablet.getByLabel('Teléfono celular')).toHaveValue('(214) 555-0188');
  await expectAccessible(tablet);
  await tablet.screenshot({ path: 'test-results/kiosco-registro.png', fullPage: true });
  await tablet.getByRole('button', { name: 'Registrarme' }).click();
  await expect(tablet.getByRole('heading', { name: '¡Gracias!' })).toBeVisible();
  await expect(tablet.getByText('Tome asiento. Le llamaremos por su nombre.')).toBeVisible();
  await expectAccessible(tablet);
  await tablet.screenshot({ path: 'test-results/kiosco-listo.png' });
  let left = await browserLeftovers(tablet);
  expect(left).toMatchObject({ local: [], session: [], indexedDb: [], apiInCache: [] });
  for (const value of ['Mariana', 'Kiosco Ficticia', '555-0188', 'Fiebre ficticia']) expect(left.html).not.toContain(value);

  // «Registrar a otra persona»: formulario vacío.
  await tablet.getByRole('button', { name: 'Registrar a otra persona' }).click();
  await expect(tablet.getByRole('textbox', { name: 'Nombre', exact: true })).toHaveValue('');

  // En inglés: un botón grande cambia todos los textos.
  await tablet.getByRole('button', { name: 'Change language to English' }).click();
  await expect(tablet.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  await tablet.getByRole('textbox', { name: 'First name', exact: true }).fill('Robert');
  await tablet.getByLabel('Last name').fill('Kiosk Fictitious');
  await tablet.getByRole('combobox', { name: /^Month/ }).selectOption({ label: 'March' });
  await tablet.getByLabel('Day', { exact: true }).fill('3');
  await tablet.getByLabel('Year').fill('1975');
  await tablet.getByLabel('Mobile phone').fill('9725550177');
  await tablet.getByRole('radio', { name: /^No, I am a patient/ }).click();
  await tablet.getByRole('radio', { name: /^I am here for results/ }).click();
  await expectAccessible(tablet);
  await tablet.getByRole('button', { name: 'Check in' }).click();
  await expect(tablet.getByRole('heading', { name: 'Thank you!' })).toBeVisible();
  // Tras la cuenta regresiva, vuelve al formulario en español.
  await tablet.clock.fastForward(11_000);
  await expect(tablet.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();
  left = await browserLeftovers(tablet);
  expect(left).toMatchObject({ local: [], session: [], indexedDb: [], apiInCache: [] });
  expect(left.html).not.toContain('Robert');

  // Inactividad: aviso a los 50 s y borrado a los 60 s (y el idioma vuelve a español).
  await tablet.getByRole('button', { name: 'Change language to English' }).click();
  await tablet.getByRole('textbox', { name: 'First name', exact: true }).fill('Robert');
  await tablet.clock.fastForward(51_000);
  await expect(tablet.getByRole('dialog', { name: 'Are you still there?' })).toBeVisible();
  await tablet.clock.fastForward(10_000);
  await expect(tablet.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();
  await expect(tablet.getByRole('textbox', { name: 'Nombre', exact: true })).toHaveValue('');

  // Al ocultar la pestaña, también se borra.
  await tablet.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Mariana');
  await tablet.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });
  await expect(tablet.getByRole('textbox', { name: 'Nombre', exact: true })).toHaveValue('');

  // Al recargar, nada sobrevive.
  await tablet.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Mariana');
  await tablet.reload();
  await expect(tablet.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();
  await expect(tablet.getByRole('textbox', { name: 'Nombre', exact: true })).toHaveValue('');

  // Revocada desde Sedes: al enviar, la tableta vuelve a pedir el código.
  await kiosks.getByRole('button', { name: 'Revocar Tableta recepción 1' }).click();
  const revoke = owner.getByRole('alertdialog', { name: '¿Revocar Tableta recepción 1?' }).or(owner.getByRole('dialog', { name: '¿Revocar Tableta recepción 1?' }));
  await revoke.getByLabel('Motivo').fill('Prueba ficticia de revocación');
  await revoke.getByRole('button', { name: 'Revocar' }).click();
  await expect(owner.getByText('Kiosco revocado.')).toBeVisible();
  await expect(kiosks.getByTestId('kiosk-row').filter({ hasText: 'Tableta recepción 1' })).toContainText('Revocado');
  await fillSpanish(tablet);
  await tablet.getByRole('button', { name: 'Registrarme' }).click();
  await expect(tablet.getByRole('heading', { name: 'Vincular esta tableta' })).toBeVisible();
  left = await browserLeftovers(tablet);
  expect(left).toMatchObject({ local: [], session: [], indexedDb: [], apiInCache: [] });
  expect(left.html).not.toContain('Mariana');
});
