import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { generate } from 'otplib';

// T-030: fusionar pacientes (S-PAC-13 y 14; S-PAC-01 y 05; ADR 0032).
//  - El Propietario de una organización nueva (org:create) se asigna
//    Recepción en FUS1 (ADR 0027): sin rol clínico no llega a los pacientes.
//  - Dos registros ficticios de la misma persona; el duplicado tiene una
//    visita. Desde el perfil del duplicado, «Fusionar con…»: busca al
//    principal, ve las dos tarjetas, escribe el motivo y «FUSIONAR» y
//    confirma en el diálogo destructivo.
//  - Otra pestaña con el perfil del duplicado abierto recibe el aviso en vivo
//    con «Abrir registro principal»; el perfil del principal muestra la visita
//    del duplicado y buscar el código del duplicado lleva al principal.
//  - Con una visita abierta de los dos en FUS1, «Fusionar» queda
//    deshabilitado y se explica por qué.
// Usa el inicio de sesión de la invitación (no hay sesión guardada que valga
// para una organización nueva).

const run = promisify(execFile);
const apiDir = fileURLToPath(new URL('../../api/', import.meta.url));
const arg = (value: string) => (process.platform === 'win32' ? `"${value}"` : value);

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`));
const expectAccessible = (page: Page) => expect.poll(() => axe(page), { timeout: 10_000 }).toEqual([]);

const main = (page: Page) => page.locator('main');

test.describe.configure({ retries: 0 });

async function createPatient(request: APIRequestContext, firstName: string, lastName: string): Promise<{ id: string; code: string }> {
  const response = await request.post('/api/patients', {
    data: { firstName, lastName, birthDate: '1988-07-21', phone: null, referralSourceId: null, referralDetails: null, forceCreate: true },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as { id: string; code: string };
}

async function openVisit(request: APIRequestContext, patientId: string): Promise<string> {
  const response = await request.post('/api/encounters', {
    data: { source: 'walk_in', patientId, appointmentTypeId: null, route: 'LAB_ONLY', coverage: { type: 'self_pay' } },
    headers: { 'idempotency-key': randomUUID() },
  });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { encounter: { code: string } }).encounter.code;
}

test('el Propietario con Recepción fusiona un duplicado: todo pasa al principal y el código del duplicado lleva a él', async ({ page }) => {
  test.setTimeout(240_000);
  if (!process.env.E2E_OPERATOR_URL) throw new Error('Falta E2E_OPERATOR_URL (lo fija global-setup.ts)');
  const created = await run(
    'pnpm',
    [
      'exec', 'tsx', 'scripts/org-create.ts',
      '--organizacion', arg('Clínica Demo Fusión (ficticia)'),
      '--propietario-correo', 'propietario.fusion@example.test',
      '--propietario-nombre', arg('Propietaria Fusión (ficticia)'),
      '--sede-codigo', 'FUS1',
      '--sede-nombre', arg('Fusión Centro'),
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
  await page.getByLabel('Nombre para mostrar').fill('Propietaria Fusión (ficticia)');
  await page.getByLabel('Contraseña', { exact: true }).fill('una frase larga de la propietaria fusion');
  await page.getByLabel('Confirmar contraseña').fill('una frase larga de la propietaria fusion');
  await page.getByRole('button', { name: 'Aceptar invitación' }).click();
  await expect(page.getByTestId('totp-secret')).toHaveText(/\w{4}/);
  const secret = (await page.getByTestId('totp-secret').innerText()).replace(/\s/g, '');
  await page.getByLabel('Código de verificación').fill(await generate({ secret }));
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await page.getByText('Guardé estos códigos').click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page).toHaveURL(/\/admin\/usuarios$/);

  // Se asigna Recepción en FUS1 (ADR 0027).
  await page.getByRole('row').filter({ hasText: 'propietario.fusion@example.test' }).getByRole('button', { name: /Más acciones/ }).click();
  await page.getByRole('menuitem', { name: 'Mis roles clínicos' }).click();
  const roles = page.getByRole('dialog', { name: 'Mis roles clínicos' });
  await roles.getByRole('checkbox', { name: 'Recepción en FUS1' }).click();
  await roles.getByLabel('Motivo del cambio').fill('Revisa los duplicados esta semana');
  await roles.getByRole('button', { name: 'Guardar' }).click();
  await expect(roles).toHaveCount(0);
  await page.goto('/app/FUS1/pacientes');
  await expect(page.getByRole('heading', { name: 'Pacientes', exact: true })).toBeVisible();

  // Dos registros de la misma persona ficticia; el duplicado tiene una visita.
  const principal = await createPatient(page.request, 'Rosa', 'Fusión Ficticia');
  const duplicate = await createPatient(page.request, 'Rosa', 'Fusion Ficticia');
  const visitCode = await openVisit(page.request, duplicate.id);

  // Otra pestaña con el perfil del duplicado abierto.
  const watcher = await page.context().newPage();
  await watcher.goto(`/app/FUS1/pacientes/${duplicate.id}`);
  await expect(watcher.getByRole('heading', { name: 'Rosa Fusion Ficticia' })).toBeVisible();

  // S-PAC-05 → «Fusionar con…» (S-PAC-13). Por defecto el abierto es el duplicado.
  await page.goto(`/app/FUS1/pacientes/${duplicate.id}`);
  await main(page).getByRole('link', { name: 'Fusionar con…' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/FUS1/pacientes/${duplicate.id}/fusionar$`));
  await expect(page.getByRole('heading', { name: 'Fusionar pacientes' })).toBeVisible();
  await expect(main(page)).toContainText('Aún no se ha seleccionado un paciente.');
  const search = main(page).getByRole('search');
  await search.getByLabel('Buscar paciente').fill('rosa ficticia');
  await search.getByRole('button', { name: 'Buscar' }).click();
  const results = main(page).getByRole('list', { name: 'Resultados' });
  // El paciente abierto no sale en los resultados.
  await expect(results.getByRole('listitem')).toHaveCount(1);
  await results.getByRole('button', { name: 'Seleccionar' }).click();
  const principalCard = main(page).getByRole('region', { name: 'Principal (se conserva)' });
  const duplicateCard = main(page).getByRole('region', { name: 'Duplicado (se fusiona)' });
  await expect(principalCard).toContainText(principal.code);
  await expect(duplicateCard).toContainText(duplicate.code);
  await expect(duplicateCard).toContainText('abierta en FUS1');
  // «Invertir dirección» intercambia las tarjetas; se vuelve a la dirección por defecto.
  await main(page).getByRole('button', { name: 'Invertir dirección' }).click();
  await expect(principalCard).toContainText(duplicate.code);
  await main(page).getByRole('button', { name: 'Invertir dirección' }).click();
  await expect(principalCard).toContainText(principal.code);

  // Doble confirmación: motivo, «FUSIONAR» (no «MERGE») y el diálogo destructivo.
  const merge = main(page).getByRole('button', { name: 'Fusionar', exact: true });
  await expect(merge).toBeDisabled();
  await main(page).getByLabel('Motivo').fill('Registrada dos veces por error en la recepción');
  await main(page).getByLabel('Escriba FUSIONAR para confirmar').fill('MERGE');
  await expect(merge).toBeDisabled();
  await main(page).getByLabel('Escriba FUSIONAR para confirmar').fill('fusionar');
  await expect(merge).toBeEnabled();
  await expectAccessible(page);
  await main(page).screenshot({ path: 'test-results/fusionar.png' });
  await merge.click();
  const dialog = page.getByRole('dialog', { name: '¿Fusionar estos pacientes?' }).or(page.getByRole('alertdialog', { name: '¿Fusionar estos pacientes?' }));
  await expect(dialog).toContainText(`Rosa Fusion Ficticia (${duplicate.code}) se fusionará con Rosa Fusión Ficticia (${principal.code}). Esta acción no se puede deshacer.`);
  await dialog.getByRole('button', { name: 'Fusionar' }).click();
  await expect(page.getByText('Pacientes fusionados.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/app/FUS1/pacientes/${principal.id}$`));

  // El principal tiene la visita del duplicado.
  await main(page).getByRole('tab', { name: 'Visitas' }).click();
  await expect(main(page)).toContainText(visitCode);

  // La otra pestaña recibe el aviso en vivo y muestra «Fusionado» sin «Editar» ni «Fusionar con…».
  // El snackbar (fuera de main) y el aviso del perfil.
  await expect(watcher.getByText('Este registro fue fusionado con otro paciente.')).toHaveCount(2);
  await expect(watcher.locator('main')).toContainText('Estado: Fusionado');
  await expect(watcher.locator('main').getByRole('button', { name: 'Editar' })).toHaveCount(0);
  await expect(watcher.locator('main').getByRole('link', { name: 'Fusionar con…' })).toHaveCount(0);
  await watcher.locator('main').getByRole('link', { name: 'Abrir registro principal' }).click();
  await expect(watcher).toHaveURL(new RegExp(`/app/FUS1/pacientes/${principal.id}$`));
  await watcher.close();

  // Buscar el código del duplicado (S-PAC-01) lleva al principal.
  await page.goto('/app/FUS1/pacientes');
  await main(page).getByLabel('Buscar paciente').fill(duplicate.code);
  await main(page).getByLabel('Buscar paciente').press('Enter');
  await expect(main(page)).toContainText(principal.code);
  await expect(main(page)).toContainText('Mostrando 1 de 1');

  // Con una visita abierta de los dos en FUS1 no se puede fusionar.
  const a = await createPatient(page.request, 'Iris', 'Bloqueo Ficticia');
  const b = await createPatient(page.request, 'Iris', 'Bloqueo Ficticio');
  await openVisit(page.request, a.id);
  await openVisit(page.request, b.id);
  await page.goto(`/app/FUS1/pacientes/${a.id}/fusionar`);
  await main(page).getByRole('search').getByLabel('Buscar paciente').fill(b.code);
  await main(page).getByRole('search').getByRole('button', { name: 'Buscar' }).click();
  await main(page).getByRole('list', { name: 'Resultados' }).getByRole('button', { name: 'Seleccionar' }).click();
  await expect(main(page)).toContainText('Los dos pacientes tienen una visita abierta en la misma sede. Cierre una antes de fusionar.');
  await main(page).getByLabel('Motivo').fill('Prueba de bloqueo');
  await main(page).getByLabel('Escriba FUSIONAR para confirmar').fill('FUSIONAR');
  await expect(main(page).getByRole('button', { name: 'Fusionar', exact: true })).toBeDisabled();
});
