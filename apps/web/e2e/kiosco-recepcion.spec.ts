import AxeBuilder from '@axe-core/playwright';
import { createTenantDb, DEMO, kioskDevices, memberships } from '@clinic/db';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { E2E } from './global-setup.ts';

// T-021: llegadas del kiosco en Recepción (S-REC-28 → S-PAC-03 → S-REC-20 a 27).
//  - Una tableta de NOR1 (preparada aquí como clinic_app, con un código de un
//    solo uso; vincularla desde Sedes ya lo prueba kiosco.spec.ts) envía un
//    registro y aparece en el Panel de Recepción, en otra ventana, en menos de 2 s.
//  - Recepción lo confirma: crea el paciente con los datos del kiosco y abre
//    la visita con el asistente; la ruta no viene marcada (ADR 0031); la
//    visita muestra el motivo declarado.
//  - Otro registro se descarta con motivo.
// Datos ficticios, con pacientes nuevos que no usa ninguna otra prueba.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`));
const expectAccessible = (page: Page) => expect.poll(() => axe(page), { timeout: 10_000 }).toEqual([]);

const CODE = 'RCP4E2';

/** Tableta de NOR1 por vincular, con un código conocido (solo su hash, como en Sedes). */
async function pendingTabletInNor1(): Promise<void> {
  const pool = new pg.Pool({ connectionString: process.env.E2E_APP_URL, max: 1 });
  const org = DEMO.norte;
  try {
    await createTenantDb(pool).withTenant(org.id, async (tx) => {
      const [member] = await tx.select({ id: memberships.id }).from(memberships).limit(1);
      if (!member) throw new Error('sin membresías en Norte');
      await tx.insert(kioskDevices).values({
        organizationId: org.id,
        locationId: org.locations[0].id,
        name: 'Tableta E2E recepción',
        status: 'pending',
        pairingCodeHash: createHash('sha256').update(CODE).digest('hex'),
        pairingExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdByMembershipId: member.id,
        createdAt: new Date(),
      });
    });
  } finally {
    await pool.end();
  }
}

async function newPage(browser: Browser, viewport = { width: 1280, height: 900 }): Promise<Page> {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', locale: 'es-US', timezoneId: 'America/Chicago', viewport });
  return context.newPage();
}

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(E2E.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/app\/NOR1\/panel$/);
}

/** Un registro desde la tableta, en español. */
async function checkIn(tablet: Page, p: { first: string; last: string; phone: string; firstVisit: boolean; symptoms: string }) {
  await tablet.getByRole('textbox', { name: 'Nombre', exact: true }).fill(p.first);
  await tablet.getByRole('textbox', { name: 'Apellidos', exact: true }).fill(p.last);
  await tablet.getByRole('combobox', { name: /^Mes/ }).selectOption({ label: 'Abril' });
  await tablet.getByRole('textbox', { name: 'Día', exact: true }).fill('23');
  await tablet.getByRole('textbox', { name: 'Año', exact: true }).fill('1991');
  await tablet.getByRole('textbox', { name: 'Teléfono celular', exact: true }).fill(p.phone);
  await tablet.getByRole('radio', { name: p.firstVisit ? /^Sí, primera vez/ : /^No, ya soy paciente/ }).click();
  await tablet.getByRole('radio', { name: /^Me siento enfermo/ }).click();
  await tablet.getByRole('textbox', { name: /Describa brevemente sus síntomas/ }).fill(p.symptoms);
  await tablet.getByRole('button', { name: 'Registrarme' }).click();
  await expect(tablet.getByRole('heading', { name: '¡Gracias!' })).toBeVisible();
  await tablet.getByRole('button', { name: 'Registrar a otra persona' }).click();
}

const main = (page: Page) => page.locator('main');
const button = (page: Page, name: string) => main(page).getByRole('button', { name, exact: true });

test.describe.configure({ retries: 0 });

test('un registro del kiosco aparece al instante en el Panel y Recepción lo confirma como visita; otro se descarta', async ({ browser }) => {
  test.setTimeout(240_000);
  await pendingTabletInNor1();
  const recepcion = await newPage(browser);
  await signIn(recepcion, 'recepcion.norte@example.test');
  const tray = recepcion.getByTestId('kiosk-tray');
  await expect(tray).toBeVisible();

  // La tableta se vincula con el código y queda en el formulario.
  const tablet = await newPage(browser, { width: 800, height: 1280 });
  await tablet.goto('/kiosk/NOR1');
  await tablet.getByLabel('Código de vinculación').fill(CODE);
  await tablet.getByRole('button', { name: 'Vincular' }).click();
  await expect(tablet.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();

  // Envío → Panel de Recepción en menos de 2 s.
  const patient = 'Teodora Recepción Kioscal';
  await checkIn(tablet, { first: 'Teodora', last: 'Recepción Kioscal', phone: '4695550161', firstVisit: true, symptoms: 'Tos ficticia desde ayer' });
  const row = tray.getByTestId('kiosk-arrival').filter({ hasText: patient });
  await expect(row).toBeVisible({ timeout: 2_000 });
  await expect(row).toContainText('Primera vez');
  await expect(row).toContainText('Me siento enfermo');
  await expect(row).toContainText('«Tos ficticia desde ayer»');
  await expect(row).toContainText('(***) ***-0161');
  await expectAccessible(recepcion);
  await recepcion.locator('main').screenshot({ path: 'test-results/kiosco-bandeja.png' });

  // Otro registro, para descartarlo.
  await checkIn(tablet, { first: 'Prudencio', last: 'Descarte Ficticio', phone: '4695550162', firstVisit: false, symptoms: '' });
  const toDiscard = tray.getByTestId('kiosk-arrival').filter({ hasText: 'Prudencio Descarte Ficticio' });
  await expect(toDiscard).toBeVisible({ timeout: 2_000 });
  await toDiscard.getByRole('button', { name: 'Descartar el registro de Prudencio Descarte Ficticio' }).click();
  const discard = recepcion.getByRole('alertdialog', { name: '¿Descartar este registro del kiosco?' }).or(recepcion.getByRole('dialog', { name: '¿Descartar este registro del kiosco?' }));
  await discard.getByLabel('Motivo').fill('Envío de prueba (ficticio)');
  await discard.getByRole('button', { name: 'Descartar' }).click();
  await expect(recepcion.getByText('Registro descartado.')).toBeVisible();
  await expect(toDiscard).toHaveCount(0);

  // Confirmar: crear el paciente con los datos del kiosco (pasa por los duplicados).
  await row.getByRole('button', { name: `Confirmar llegada de ${patient}` }).click();
  await expect(recepcion).toHaveURL(/\/app\/NOR1\/llegada\/kiosco\/[0-9a-f-]+$/);
  await expect(main(recepcion)).toContainText('Dice que es su primera vez');
  await expect(main(recepcion)).toContainText('(469) 555-0161');
  await expectAccessible(recepcion);
  await button(recepcion, 'Crear paciente nuevo').click();
  const created = recepcion.getByRole('dialog', { name: 'Nuevo paciente' });
  await expect(created.getByLabel('Nombre', { exact: true })).toHaveValue('Teodora');
  await expect(created.getByLabel('Apellido')).toHaveValue('Recepción Kioscal');
  await expect(created.getByLabel('Fecha de nacimiento')).toHaveValue('1991-04-23');
  await created.getByRole('button', { name: 'Crear' }).click();
  await expect(created).toHaveCount(0);

  // El asistente, con el motivo a la vista y sin ruta marcada.
  await recepcion.getByRole('checkbox', { name: 'Verifiqué la identidad del paciente' }).click();
  await button(recepcion, 'Continuar').click();
  await recepcion.getByRole('checkbox', { name: 'Confirmar esta sede' }).click();
  await button(recepcion, 'Continuar').click();
  await expect(main(recepcion).getByTestId('declared-reason')).toContainText('Me siento enfermo');
  await expect(main(recepcion).getByRole('radio', { checked: true })).toHaveCount(0);
  await button(recepcion, 'Continuar').click();
  await expect(main(recepcion)).toContainText('Elija una ruta de atención.');
  await recepcion.getByRole('radio', { name: /^Estándar/ }).click();
  await button(recepcion, 'Continuar').click();
  await button(recepcion, 'Continuar').click();
  await button(recepcion, 'Iniciar visita sin cita').click();
  await expect(recepcion.getByRole('heading', { name: 'Llegada registrada' })).toBeVisible();
  await recepcion.getByRole('button', { name: 'Abrir visita' }).click();
  await expect(recepcion).toHaveURL(/\/app\/NOR1\/visitas\/[0-9a-f-]+$/);
  await expect(main(recepcion)).toContainText('Registrado');
  await expect(main(recepcion).getByTestId('declared-reason')).toContainText('«Tos ficticia desde ayer»');
  await expectAccessible(recepcion);

  // La bandeja ya no lo tiene.
  await recepcion.goto('/app/NOR1/panel');
  await expect(tray.getByTestId('kiosk-arrival').filter({ hasText: patient })).toHaveCount(0);
});
