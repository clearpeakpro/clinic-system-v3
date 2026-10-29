import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { generate } from 'otplib';

// T-007: el operador da de alta una organización con `pnpm org:create` (el
// comando real, como clinic_operator), su Propietaria acepta la invitación y
// administra sus sedes (S-ADM-10 a 12). La organización es nueva: no toca a
// los usuarios ficticios que usan las demás pruebas.

const run = promisify(execFile);
const apiDir = fileURLToPath(new URL('../../api/', import.meta.url));
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function operator(script: 'org-create' | 'audit-platform', args: string[]) {
  return run('pnpm', ['exec', 'tsx', `scripts/${script}.ts`, ...args], {
    cwd: apiDir,
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      DATABASE_OPERATOR_URL: process.env.E2E_OPERATOR_URL,
      BASE_URL: process.env.E2E_BASE_URL,
      // Sin servidor de correo: el comando muestra el enlace en la terminal.
      SMTP_URL: 'smtp://127.0.0.1:1',
    },
  });
}

/** Con shell (Windows), los argumentos con espacios van entre comillas. */
const arg = (value: string) => (process.platform === 'win32' ? `"${value}"` : value);

async function enrollMfa(page: Page) {
  await expect(page.getByRole('heading', { name: 'Configurar la verificación en dos pasos' })).toBeVisible();
  await expect(page.getByTestId('totp-secret')).toHaveText(/\w{4}/);
  const secret = (await page.getByTestId('totp-secret').innerText()).replace(/\s/g, '');
  await page.getByLabel('Código de verificación').fill(await generate({ secret }));
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await page.getByText('Guardé estos códigos').click();
  await page.getByRole('button', { name: 'Continuar' }).click();
}

const card = (page: Page, code: string) => page.getByRole('list', { name: 'Sedes' }).getByRole('listitem').filter({ hasText: code });
const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.map((v) => v.id);

test('el operador crea una organización; su Propietaria administra las sedes', async ({ page }) => {
  test.setTimeout(150_000);
  const created = await operator('org-create', [
    '--organizacion', arg('Clínica Demo Oeste (ficticia)'),
    '--propietario-correo', 'propietaria.oeste@example.test',
    '--propietario-nombre', arg('Propietaria Oeste (ficticia)'),
    '--sede-codigo', 'OES1',
    '--sede-nombre', arg('Oeste Centro'),
    '--zona-horaria', 'America/Denver',
  ]);
  expect(created.stdout).toContain('No se pudo enviar el correo');
  const link = /https?:\/\/\S+\/invitacion\/\S+/.exec(created.stdout)?.[0];
  if (!link) throw new Error('org:create no mostró el enlace');

  // La Propietaria acepta, configura el MFA y entra en su única sede.
  await page.goto(new URL(link).pathname);
  await page.getByLabel('Nombre para mostrar').fill('Propietaria Oeste (ficticia)');
  await page.getByLabel('Contraseña', { exact: true }).fill('una frase larga de la propietaria');
  await page.getByLabel('Confirmar contraseña').fill('una frase larga de la propietaria');
  await page.getByRole('button', { name: 'Aceptar invitación' }).click();
  await enrollMfa(page);
  await expect(page).toHaveURL(/\/admin\/usuarios$/);

  // S-ADM-10: su primera sede, seleccionada.
  await page.getByRole('navigation', { name: 'Navegación principal' }).first().getByRole('link', { name: 'Sedes' }).click();
  await expect(page.getByRole('heading', { name: 'Sedes', level: 1 })).toBeVisible();
  await expect(card(page, 'OES1')).toContainText('Seleccionada');
  await expect(card(page, 'OES1')).toContainText('America/Denver');
  expect(await axe(page)).toEqual([]);

  // S-ADM-11 y S-ADM-12: nueva sede.
  await page.getByRole('button', { name: 'Nueva sede' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva sede' });
  await dialog.getByLabel('Código').fill('oes-2');
  await expect(dialog.getByLabel('Código')).toHaveValue('OES2');
  await dialog.getByLabel('Nombre', { exact: true }).fill('Oeste Norte');
  await dialog.getByRole('button', { name: /Zona horaria/ }).click();
  const zones = page.getByRole('dialog', { name: 'Zona horaria' });
  await zones.getByLabel('Buscar zona horaria').fill('los angeles');
  expect(await axe(page)).toEqual([]);
  await zones.getByRole('button', { name: 'America/Los_Angeles' }).click();
  await dialog.getByLabel('Dirección').fill('2 Calle Ficticia Oeste');
  await dialog.getByLabel('Teléfono').fill('(555) 010-0002');
  await dialog.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByText('Guardado.')).toBeVisible();
  await expect(card(page, 'OES2')).toContainText('America/Los_Angeles');
  await expect(card(page, 'OES2')).toContainText('(555) 010-0002');

  // Código repetido en la misma organización.
  await page.getByRole('button', { name: 'Nueva sede' }).click();
  const again = page.getByRole('dialog', { name: 'Nueva sede' });
  await again.getByLabel('Código').fill('OES2');
  await again.getByLabel('Nombre', { exact: true }).fill('Repetida');
  await again.getByRole('button', { name: 'Crear' }).click();
  await expect(again).toContainText('Este registro ya existe.');
  await again.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('dialog', { name: '¿Descartar cambios sin guardar?' }).getByRole('button', { name: 'Descartar' }).click();

  // Editar: el código no cambia.
  await card(page, 'OES2').getByRole('button', { name: 'Editar Oeste Norte' }).click();
  const edit = page.getByRole('dialog', { name: 'Editar sede' });
  await expect(edit.getByLabel('Código')).toBeDisabled();
  await edit.getByLabel('Nombre', { exact: true }).fill('Oeste Norte II');
  await edit.getByRole('button', { name: 'Guardar' }).click();
  await expect(card(page, 'OES2')).toContainText('Oeste Norte II');

  // Con dos sedes, la cabecera ofrece el selector; al desactivar una, vuelve a ser texto.
  await expect(page.getByTestId('location-selector')).toBeVisible();
  await card(page, 'OES2').getByRole('button', { name: /Más acciones/ }).click();
  await page.getByRole('menuitem', { name: 'Desactivar' }).click();
  await page.getByRole('dialog', { name: '¿Desactivar Oeste Norte II?' }).getByRole('button', { name: 'Desactivar' }).click();
  await expect(card(page, 'OES2')).toContainText('Inactivo');
  await expect(page.getByTestId('location-current')).toContainText('OES1');
  expect(await axe(page)).toEqual([]);

  // La única activa no se desactiva.
  await card(page, 'OES1').getByRole('button', { name: /Más acciones/ }).click();
  await page.getByRole('menuitem', { name: 'Desactivar' }).click();
  await page.getByRole('dialog', { name: '¿Desactivar Oeste Centro?' }).getByRole('button', { name: 'Desactivar' }).click();
  await expect(page.getByText('No se puede desactivar la única sede activa.')).toBeVisible();

  // Activar no pide confirmación.
  await card(page, 'OES2').getByRole('button', { name: /Más acciones/ }).click();
  await page.getByRole('menuitem', { name: 'Activar' }).click();
  await expect(card(page, 'OES2')).toContainText('Activo');
  await expect(page.getByTestId('location-selector')).toBeVisible();

  // El operador lee la auditoría sin organización; su lectura queda registrada.
  const read = await operator('audit-platform', ['--accion', 'auth.sign_in.mfa_required']);
  expect(read.stderr).toContain('Esta lectura quedó registrada');
});
