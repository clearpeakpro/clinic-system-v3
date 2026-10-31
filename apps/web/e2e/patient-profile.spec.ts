import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { generate } from 'otplib';
import { E2E } from './global-setup.ts';

// T-013: perfil y edición del paciente (S-PAC-05, 06 a 08, 10, 11 y 12) con
// datos ficticios de la semilla. Recepción Norte abre el perfil en dos
// ventanas: edita el teléfono en una y la otra recibe «Actualizado por otro
// usuario» al guardar; no puede cambiar la fecha de nacimiento; el teléfono de
// otro paciente da el aviso con «Guardar de todos modos» y «Volver y
// corregir». El Propietario de una organización nueva (creada con `pnpm
// org:create`, como en locations.spec, para no tocar los usuarios de las
// demás pruebas) se asigna Recepción (ADR 0027), da de alta a un paciente,
// cambia su fecha de nacimiento con motivo, lo inactiva (ya no sale en la
// búsqueda salvo con «Incluir inactivos») y lo reactiva (ADR 0009).

const run = promisify(execFile);
const apiDir = fileURLToPath(new URL('../../api/', import.meta.url));
/** Con shell (Windows), los argumentos con espacios van entre comillas. */
const arg = (value: string) => (process.platform === 'win32' ? `"${value}"` : value);

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`));
const expectAccessible = (page: Page) => expect.poll(() => axe(page), { timeout: 10_000 }).toEqual([]);

async function newPage(browser: Browser) {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', locale: 'es-US', timezoneId: 'America/Chicago', viewport: { width: 1280, height: 800 } });
  return context.newPage();
}

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(E2E.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

/** Inscribe el MFA en S-GEN-07 y sigue hasta el final de S-GEN-08 (como en users.spec.ts). */
async function enrollMfa(page: Page) {
  await expect(page.getByRole('heading', { name: 'Configurar la verificación en dos pasos' })).toBeVisible();
  await expect(page.getByTestId('totp-secret')).toHaveText(/\w{4}/);
  const secret = (await page.getByTestId('totp-secret').innerText()).replace(/\s/g, '');
  await page.getByLabel('Código de verificación').fill(await generate({ secret }));
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('heading', { name: 'Guarde sus códigos de recuperación' })).toBeVisible();
  await page.getByText('Guardé estos códigos').click();
  await page.getByRole('button', { name: 'Continuar' }).click();
}

/** Busca en S-PAC-01 y abre el perfil del único resultado con ese nombre. */
async function openProfile(page: Page, sede: string, query: string, name: string) {
  await page.goto(`/app/${sede}/pacientes`);
  await page.getByRole('textbox', { name: 'Buscar paciente' }).fill(query);
  await page.getByRole('textbox', { name: 'Buscar paciente' }).press('Enter');
  await page.getByRole('button', { name: `Ver perfil de ${name}` }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

const editDialog = (page: Page) => page.getByRole('dialog', { name: 'Editar paciente' });

test.describe.configure({ retries: 0 });

test('Recepción edita el teléfono; la otra ventana recibe el conflicto de versión; no cambia la fecha', async ({ browser }) => {
  test.setTimeout(120_000);
  const first = await newPage(browser);
  const second = await newPage(browser);
  for (const page of [first, second]) {
    await signIn(page, 'recepcion.norte@example.test');
    await expect(page).toHaveURL(/\/app\/NOR1\/panel$/);
    await openProfile(page, 'NOR1', 'gabriela jimenez', 'Gabriela Jiménez Soto');
  }

  // Encabezado, «Nueva cita» deshabilitada hasta la agenda y las pestañas.
  await expect(first.getByText('7 jul 1988 (')).toBeVisible();
  await expect(first.getByText('(214) 555-0113').first()).toBeVisible();
  await expect(first.getByRole('button', { name: 'Nueva cita' })).toBeDisabled();
  await expect(first.getByText('Llega con la agenda')).toBeVisible();
  await expect(first.getByRole('button', { name: 'Fusionar con…' })).toHaveCount(0);
  const tabs = first.getByRole('tablist', { name: 'Secciones del perfil' });
  await expect(tabs.getByRole('tab')).toHaveText(['Resumen', 'Citas', 'Visitas', 'Saldos']);
  await expect(first.getByRole('tabpanel', { name: 'Resumen' })).toContainText('Información de Contacto y Admisión');
  await expect(first.getByText(/HIPAA/)).toHaveCount(0);
  await expectAccessible(first);
  await first.locator('main').screenshot({ path: 'test-results/perfil-resumen.png' });
  await tabs.getByRole('tab', { name: 'Visitas' }).click();
  await expect(first.getByRole('tabpanel', { name: 'Visitas' })).toContainText('Llega en la fase 3.');
  await first.keyboard.press('ArrowRight');
  await expect(first.getByRole('tabpanel', { name: 'Saldos' })).toContainText('No hay saldos pendientes.');
  await expectAccessible(first);

  // Recepción no puede cambiar la fecha de nacimiento.
  await first.getByRole('button', { name: 'Editar' }).click();
  const dialog = editDialog(first);
  await expect(dialog.getByLabel('Fecha de nacimiento')).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Inactivar paciente' })).toHaveCount(0);
  await expectAccessible(first);
  await dialog.screenshot({ path: 'test-results/perfil-editar.png' });

  // El teléfono de otro paciente: el aviso, solo al pulsar «Guardar».
  await dialog.getByLabel('Teléfono').fill('(214) 555-0115');
  const phoneNotice = first.getByRole('dialog', { name: 'Este teléfono ya está registrado en otro paciente' });
  await expect(phoneNotice).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(phoneNotice.getByRole('listitem')).toHaveCount(1);
  await expect(phoneNotice).toContainText('Isabel Moreno Cruz');
  await expect(phoneNotice).not.toContainText('555-0115');
  await expect(phoneNotice.getByRole('button', { name: 'Guardar de todos modos' })).toBeVisible();
  await expectAccessible(first);
  await phoneNotice.getByRole('button', { name: 'Volver y corregir' }).click();
  await expect(dialog.getByLabel('Teléfono')).toBeFocused();
  await expect(dialog.getByLabel('Teléfono')).toHaveValue('(214) 555-0115');

  // Corregido: se guarda.
  await dialog.getByLabel('Teléfono').fill('(214) 555-0163');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(first.getByText('Paciente actualizado.', { exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(first.getByText('(214) 555-0163').first()).toBeVisible();

  // La segunda ventana sigue con la versión anterior: al guardar, S-PAC-12.
  await second.getByRole('button', { name: 'Editar' }).click();
  await editDialog(second).getByLabel('Teléfono').fill('(214) 555-0164');
  await editDialog(second).getByRole('button', { name: 'Guardar' }).click();
  const conflict = second.getByRole('dialog', { name: 'Actualizado por otro usuario' });
  await expect(conflict).toContainText('Otro usuario actualizó este paciente. Actualice el registro para continuar.');
  await expect(conflict.getByRole('button')).toHaveText(['Actualizar']);
  await expectAccessible(second);
  await conflict.screenshot({ path: 'test-results/perfil-conflicto.png' });
  await conflict.getByRole('button', { name: 'Actualizar' }).click();
  await expect(conflict).toHaveCount(0);
  await expect(editDialog(second)).toHaveCount(0);
  await expect(second.getByText('(214) 555-0163').first()).toBeVisible();

  // Con cambios, salir pide confirmación (S-PAC-04).
  await second.getByRole('button', { name: 'Editar' }).click();
  await editDialog(second).getByLabel('Nombre', { exact: true }).fill('Gaby');
  await editDialog(second).getByRole('button', { name: 'Cancelar' }).click();
  await second.getByRole('dialog', { name: '¿Descartar cambios sin guardar?' }).getByRole('button', { name: 'Descartar' }).click();
  await expect(second.getByRole('heading', { name: 'Gabriela Jiménez Soto', level: 1 })).toBeVisible();
});

test('el Proveedor solo edita el teléfono; Enfermería no ve «Editar»', async ({ page }) => {
  await signIn(page, 'proveedor.norte@example.test');
  await expect(page).toHaveURL(/\/app\/NOR2\/panel$/);
  await openProfile(page, 'NOR2', 'tomas gutierrez', 'Tomás Gutiérrez León');
  await page.getByRole('button', { name: 'Editar' }).click();
  const dialog = editDialog(page);
  await expect(dialog.getByText('Su rol solo puede actualizar el teléfono.')).toBeVisible();
  await expect(dialog.getByLabel('Nombre', { exact: true })).toBeDisabled();
  await expect(dialog.getByLabel('Fecha de nacimiento')).toBeDisabled();
  await expect(dialog.getByLabel('Teléfono')).toBeEnabled();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();

  await page.getByRole('button', { name: 'Menú de cuenta' }).click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await signIn(page, 'enfermeria.norte@example.test');
  await expect(page).toHaveURL(/\/app\/NOR1\/panel$/);
  await openProfile(page, 'NOR1', 'tomas gutierrez', 'Tomás Gutiérrez León');
  await expect(page.getByRole('button', { name: 'Editar' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Nueva cita' })).toHaveCount(0);
});

test('el Propietario con Recepción cambia la fecha de nacimiento con motivo, inactiva y reactiva', async ({ page }) => {
  test.setTimeout(150_000);
  // La organización Este solo existe en la base desechable de esta ejecución
  // (Testcontainers, ver e2e/README.md): sin su URL no se crea en otra base.
  if (!process.env.E2E_OPERATOR_URL) throw new Error('Falta E2E_OPERATOR_URL (lo fija global-setup.ts)');
  const created = await run(
    'pnpm',
    [
      'exec', 'tsx', 'scripts/org-create.ts',
      '--organizacion', arg('Clínica Demo Este (ficticia)'),
      '--propietario-correo', 'propietario.este@example.test',
      '--propietario-nombre', arg('Propietario Este (ficticio)'),
      '--sede-codigo', 'EST1',
      '--sede-nombre', arg('Este Centro'),
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
  await page.getByLabel('Nombre para mostrar').fill('Propietario Este (ficticio)');
  await page.getByLabel('Contraseña', { exact: true }).fill('una frase larga del propietario');
  await page.getByLabel('Confirmar contraseña').fill('una frase larga del propietario');
  await page.getByRole('button', { name: 'Aceptar invitación' }).click();
  await enrollMfa(page);
  await expect(page).toHaveURL(/\/admin\/usuarios$/);

  // Sin rol clínico no llega a Pacientes; se asigna Recepción en EST1 (ADR 0027).
  await page.getByRole('row').filter({ hasText: 'propietario.este@example.test' }).getByRole('button', { name: /Más acciones/ }).click();
  await page.getByRole('menuitem', { name: 'Mis roles clínicos' }).click();
  const roles = page.getByRole('dialog', { name: 'Mis roles clínicos' });
  await roles.getByRole('checkbox', { name: 'Recepción en EST1' }).click();
  await roles.getByLabel('Motivo del cambio').fill('Cubre la recepción esta semana');
  await roles.getByRole('button', { name: 'Guardar' }).click();
  await expect(roles).toHaveCount(0);

  // Da de alta a un paciente ficticio y llega a su perfil.
  await page.goto('/app/EST1/pacientes');
  await page.getByRole('button', { name: 'Crear paciente' }).first().click();
  const newPatient = page.getByRole('dialog', { name: 'Nuevo paciente' });
  await newPatient.getByLabel('Nombre', { exact: true }).fill('Rocío');
  await newPatient.getByLabel('Apellido').fill('Prueba Oriente');
  await newPatient.getByLabel('Fecha de nacimiento').fill('1968-02-02');
  await newPatient.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByRole('heading', { name: 'Rocío Prueba Oriente', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Editar' }).click();
  const dialog = editDialog(page);
  await dialog.getByLabel('Fecha de nacimiento').fill('1968-02-03');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog.getByText('Se requiere un motivo.')).toBeVisible();
  await dialog.getByLabel('Motivo del cambio de fecha').fill('Error de captura en el alta');
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Paciente actualizado.', { exact: true })).toBeVisible();
  await expect(page.getByText('3 feb 1968 (')).toBeVisible();

  // Inactivar, con motivo.
  await page.getByRole('button', { name: 'Editar' }).click();
  await editDialog(page).getByRole('button', { name: 'Inactivar paciente' }).click();
  const inactivate = page.getByRole('dialog', { name: 'Inactivar paciente' });
  await inactivate.getByRole('button', { name: 'Inactivar' }).click();
  await expect(inactivate.getByText('Se requiere un motivo.')).toBeVisible();
  await inactivate.getByLabel('Motivo').fill('Registro de prueba');
  await expectAccessible(page);
  await inactivate.getByRole('button', { name: 'Inactivar' }).click();
  await expect(page.getByText('Paciente inactivado.', { exact: true })).toBeVisible();
  await expect(page.locator('main header').getByText(/Inactivo$/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nueva cita' })).toHaveCount(0);

  // No sale en la búsqueda por defecto; sí con «Incluir inactivos».
  await page.getByRole('link', { name: 'Volver a Pacientes' }).click();
  const field = page.getByRole('textbox', { name: 'Buscar paciente' });
  await field.fill('rocio oriente');
  await field.press('Enter');
  await expect(page.getByText('No se encontraron pacientes')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Incluir inactivos' }).click();
  await page.getByRole('search', { name: 'Búsqueda de expedientes clínicos' }).getByRole('button', { name: 'Buscar', exact: true }).click();
  const results = page.getByRole('table', { name: 'Resultados de la búsqueda de pacientes' });
  await expect(results).toContainText('Rocío Prueba Oriente');
  await expect(results).toContainText('Inactivo');

  // Reactivar lo devuelve.
  await page.getByRole('button', { name: 'Ver perfil de Rocío Prueba Oriente' }).click();
  await page.getByRole('button', { name: 'Editar' }).click();
  await editDialog(page).getByRole('button', { name: 'Reactivar paciente' }).click();
  const reactivate = page.getByRole('dialog', { name: 'Reactivar paciente' });
  await reactivate.getByLabel('Motivo').fill('Volvió a la clínica');
  await reactivate.getByRole('button', { name: 'Reactivar' }).click();
  await expect(page.getByText('Paciente reactivado.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nueva cita' })).toBeDisabled();
});
