import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { generate } from 'otplib';
import { E2E } from './global-setup.ts';

// T-028: pagos, anulaciones y saldos (S-CAJ-10 a 13, S-CAJ-17 / S-PAC-10).
//  - Recepción de NOR1, con una paciente nueva: la inscribe en el plan
//    Esencial y cobra la cuota inicial desde la pestaña Saldos (la membresía
//    queda «Activa»). En la Caja de una visita registra un pago parcial: Enter
//    no lo envía y un doble toque lo registra una sola vez. Cierra la visita
//    como «Se retiró antes» y cobra el resto desde Saldos (ADR 0004 y 0042).
//  - Anular (ADR 0033): el Propietario de una organización nueva se asigna
//    Recepción, cobra y después anula el pago y el cargo de Caja con motivo;
//    nada se borra: quedan «Anulado» con su motivo.

const run = promisify(execFile);
const apiDir = fileURLToPath(new URL('../../api/', import.meta.url));
const arg = (value: string) => (process.platform === 'win32' ? `"${value}"` : value);

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

/** Visita sin cita (S-REC-19) por el asistente, con un paciente nuevo o uno existente; termina en la pantalla de la visita. */
async function walkIn(page: Page, sede: string, patient: { create: { first: string; last: string; birth: string } } | { search: string; name: string }, route: string) {
  await page.goto(`/app/${sede}/citas`);
  await page.getByRole('button', { name: 'Sin cita' }).click();
  await page.getByRole('button', { name: 'Elegir paciente' }).click();
  const picker = page.getByRole('dialog', { name: 'Elegir paciente' });
  if ('create' in patient) {
    await picker.getByRole('textbox', { name: 'Buscar paciente' }).fill(`${patient.create.first} ${patient.create.last}`);
    await picker.getByRole('textbox', { name: 'Buscar paciente' }).press('Enter');
    await picker.getByRole('button', { name: 'Crear paciente' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo paciente' });
    await dialog.getByLabel('Nombre', { exact: true }).fill(patient.create.first);
    await dialog.getByLabel('Apellido').fill(patient.create.last);
    await dialog.getByLabel('Fecha de nacimiento').fill(patient.create.birth);
    await dialog.getByRole('button', { name: 'Crear' }).click();
    await expect(dialog).toHaveCount(0);
  } else {
    await picker.getByRole('textbox', { name: 'Buscar paciente' }).fill(patient.search);
    await picker.getByRole('textbox', { name: 'Buscar paciente' }).press('Enter');
    await picker.getByRole('list', { name: 'Resultados' }).getByRole('button').filter({ hasText: patient.name }).first().click();
  }
  await page.getByRole('checkbox', { name: 'Verifiqué la identidad del paciente' }).click();
  await button(page, 'Continuar').click();
  await page.getByRole('checkbox', { name: 'Confirmar esta sede' }).click();
  await button(page, 'Continuar').click();
  await page.getByRole('radio', { name: new RegExp(`^${route}`) }).click();
  await button(page, 'Continuar').click();
  await button(page, 'Continuar').click();
  await button(page, 'Iniciar visita sin cita').click();
  await expect(page.getByRole('heading', { name: 'Llegada registrada' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir visita' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/${sede}/visitas/[0-9a-f-]+$`));
}

/** Desde la sección Facturación, «Ir a Caja» y una consulta del catálogo. */
async function toCheckoutWith(page: Page, consultation: RegExp) {
  await page.getByTestId('billing-section').getByRole('link', { name: 'Ir a Caja' }).click();
  await expect(page).toHaveURL(/\/caja\/[0-9a-f-]+$/);
  await main(page).getByRole('button', { name: 'Agregar cargo' }).click();
  const dialog = page.getByRole('dialog', { name: 'Agregar cargo' });
  await dialog.getByRole('radio', { name: consultation }).click();
  await dialog.getByRole('button', { name: 'Agregar cargo' }).click();
  await expect(snack(page, 'Cargo agregado.')).toBeVisible();
  await expect(dialog).toHaveCount(0);
}

const payments = (page: Page) => page.getByRole('region', { name: 'Pagos', exact: true });

test.describe.configure({ retries: 0 });

test('Recepción: la cuota inicial desde Saldos activa la membresía; pago parcial sin duplicar y el resto desde Saldos', async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await newPage(browser);
  await signIn(page, 'recepcion.norte@example.test');

  // Una paciente nueva, sin saldos.
  await page.goto('/app/NOR1/pacientes');
  await page.getByRole('textbox', { name: 'Buscar paciente' }).fill('Pilar Pagos Ficticia');
  await page.getByRole('textbox', { name: 'Buscar paciente' }).press('Enter');
  await page.getByRole('button', { name: 'Crear paciente' }).first().click();
  const created = page.getByRole('dialog', { name: 'Nuevo paciente' });
  await created.getByLabel('Nombre', { exact: true }).fill('Pilar');
  await created.getByLabel('Apellido').fill('Pagos Ficticia');
  await created.getByLabel('Fecha de nacimiento').fill('1986-04-17');
  await created.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByRole('heading', { name: 'Pilar Pagos Ficticia', level: 1 })).toBeVisible();
  const profileUrl = new URL(page.url()).pathname;
  await page.getByRole('tab', { name: 'Saldos' }).click();
  await expect(main(page)).toContainText('No hay saldos pendientes.');

  // Inscripción en el plan Esencial: «Pendiente de pago».
  await page.getByRole('tab', { name: 'Resumen' }).click();
  await button(page, 'Inscribir en un plan').click();
  const enroll = page.getByRole('dialog', { name: 'Inscribir en un plan' });
  await enroll.getByLabel('Plan').selectOption({ label: 'Plan Esencial' });
  await enroll.getByLabel('Día de cobro').selectOption({ label: 'Día 15' });
  await enroll.getByRole('checkbox', { name: 'Identidad verificada' }).click();
  await enroll.getByRole('button', { name: 'Inscribir' }).click();
  await expect(snack(page, 'Paciente inscrito. Cobre la cuota inicial para activar la membresía.')).toBeVisible();
  await expect(main(page)).toContainText('Pendiente de pago');

  // La cuota inicial aparece en Saldos y se cobra completa: la membresía queda «Activa».
  await page.getByRole('tab', { name: 'Saldos' }).click();
  const fee = main(page).getByTestId('balance-fee');
  await expect(fee).toHaveCount(1);
  await expect(fee).toContainText('Plan Esencial');
  await expectAccessible(page);
  await fee.getByRole('button', { name: 'Cobrar' }).click();
  const payFee = page.getByRole('dialog', { name: 'Cobrar cuota' });
  await expect(payFee.getByRole('textbox', { name: /Monto/ })).toHaveCount(0);
  await payFee.getByRole('radio', { name: /Tarjeta de débito/ }).click();
  await payFee.getByLabel('Referencia (opcional)').fill('TERM-00451234');
  await expectAccessible(page);
  await payFee.getByRole('button', { name: /^Registrar pago · \$/ }).click();
  await expect(snack(page, 'Cuota pagada.')).toBeVisible();
  await expect(main(page)).toContainText('No hay saldos pendientes.');
  await page.getByRole('tab', { name: 'Resumen' }).click();
  await expect(main(page)).toContainText('Activa');
  const initial = main(page).getByTestId('membership-fee').filter({ hasText: 'Cuota inicial' });
  await expect(initial).toContainText('Pagada');
  await expect(initial).toContainText('Ref. ••••1234');
  await expect(initial).not.toContainText('00451234');

  // Una visita con la consulta inicial ($60.00): pago parcial de $20.00.
  await walkIn(page, 'NOR1', { search: 'Pilar Pagos', name: 'Pilar Pagos Ficticia' }, 'Solo procedimiento');
  const visitUrl = new URL(page.url()).pathname;
  await toCheckoutWith(page, /Consulta médica inicial/);
  const card = payments(page);
  await expect(card).toContainText('No hay pagos registrados.');
  const amount = card.getByLabel('Monto (USD)');
  await amount.fill('20');
  // Enter no registra el pago (en el manual sí).
  await amount.press('Enter');
  await card.getByLabel('Referencia (opcional)').press('Enter');
  await expect(card).toContainText('No hay pagos registrados.');
  await expect(card.getByTestId('record-payment')).toHaveText('Registrar pago · $20.00');
  await expectAccessible(page);
  // Dos toques seguidos: un solo pago.
  await card.getByTestId('record-payment').dblclick();
  await expect(snack(page, 'Pago de $20.00 registrado.').first()).toBeVisible();
  await expect(card.getByTestId('payment-row')).toHaveCount(1);
  await expect(card.getByTestId('payment-row')).toContainText('Efectivo');
  await expect(card.getByTestId('payment-row')).toContainText('Recibido por Usted');
  await expect(main(page).getByTestId('total-paid')).toContainText('$20.00');
  await expect(main(page).getByTestId('total-balance')).toContainText('Pago parcial');
  await expect(main(page).getByTestId('total-balance')).toContainText('$40.00');
  // Recepción cobra, pero no anula.
  await expect(main(page).getByRole('button', { name: 'Anular pago' })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: /Anular cargo/ })).toHaveCount(0);
  await expectAccessible(page);
  await main(page).screenshot({ path: 'test-results/pagos-caja.png' });

  // «Se retiró antes»: el saldo se sigue debiendo y se cobra desde Saldos.
  await page.goto(visitUrl);
  await button(page, 'Cerrar visita…').click();
  const close = page.getByRole('dialog', { name: 'Cerrar visita' });
  await close.getByLabel('Motivo').fill('La paciente tuvo que irse');
  await close.getByRole('button', { name: 'Cerrar visita' }).click();
  await expect(snack(page, 'Visita cerrada: el paciente se retiró.')).toBeVisible();
  await page.goto(profileUrl);
  await page.getByRole('tab', { name: 'Saldos' }).click();
  const owed = main(page).getByTestId('balance-visit');
  await expect(owed).toHaveCount(1);
  await expect(owed).toContainText('Se retiró');
  await expect(owed).toContainText('$40.00');
  await expectAccessible(page);
  await main(page).screenshot({ path: 'test-results/pagos-saldos.png' });
  await owed.getByRole('link', { name: 'Cobrar' }).click();
  await expect(page).toHaveURL(/\/app\/NOR1\/caja\/[0-9a-f-]+$/);
  await payments(page).getByRole('button', { name: 'Pagar saldo' }).click();
  await expect(payments(page).getByLabel('Monto (USD)')).toHaveValue('40.00');
  await payments(page).getByTestId('record-payment').click();
  await expect(snack(page, 'Pago de $40.00 registrado.')).toBeVisible();
  await expect(main(page).getByTestId('total-balance')).toContainText('Pagado');
  await expect(payments(page)).toContainText('No hay nada pendiente en este estado de cuenta.');
  await page.goto(profileUrl);
  await page.getByRole('tab', { name: 'Saldos' }).click();
  await expect(main(page)).toContainText('No hay saldos pendientes.');
});

test('el Propietario con Recepción anula un pago y un cargo de Caja con motivo; nada se borra (ADR 0033)', async ({ page }) => {
  test.setTimeout(240_000);
  if (!process.env.E2E_OPERATOR_URL) throw new Error('Falta E2E_OPERATOR_URL (lo fija global-setup.ts)');
  const created = await run(
    'pnpm',
    [
      'exec', 'tsx', 'scripts/org-create.ts',
      '--organizacion', arg('Clínica Demo Este (ficticia)'),
      '--propietario-correo', 'propietario.este@example.test',
      '--propietario-nombre', arg('Propietaria Este (ficticia)'),
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
  await page.getByLabel('Nombre para mostrar').fill('Propietaria Este (ficticia)');
  await page.getByLabel('Contraseña', { exact: true }).fill('una frase larga de la propietaria este');
  await page.getByLabel('Confirmar contraseña').fill('una frase larga de la propietaria este');
  await page.getByRole('button', { name: 'Aceptar invitación' }).click();
  await expect(page.getByTestId('totp-secret')).toHaveText(/\w{4}/);
  const secret = (await page.getByTestId('totp-secret').innerText()).replace(/\s/g, '');
  await page.getByLabel('Código de verificación').fill(await generate({ secret }));
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await page.getByText('Guardé estos códigos').click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page).toHaveURL(/\/admin\/usuarios$/);

  // Se asigna Recepción en EST1 (ADR 0027) y crea una consulta del catálogo con precio.
  await page.getByRole('row').filter({ hasText: 'propietario.este@example.test' }).getByRole('button', { name: /Más acciones/ }).click();
  await page.getByRole('menuitem', { name: 'Mis roles clínicos' }).click();
  const roles = page.getByRole('dialog', { name: 'Mis roles clínicos' });
  await roles.getByRole('checkbox', { name: 'Recepción en EST1' }).click();
  await roles.getByLabel('Motivo del cambio').fill('Cubre la recepción esta semana');
  await roles.getByRole('button', { name: 'Guardar' }).click();
  await expect(roles).toHaveCount(0);
  const catalog = (await (await page.request.get('/api/admin/catalog')).json()) as { generalToday: string };
  const consultation = await page.request.post('/api/admin/catalog/consultations', {
    data: { code: 'CONS-ESTE', name: 'Consulta ficticia Este', sortOrder: null, generalPrice: { amountCents: 5000, effectiveFrom: catalog.generalToday } },
  });
  expect(consultation.status(), await consultation.text()).toBe(201);

  await walkIn(page, 'EST1', { create: { first: 'Elisa', last: 'Anulación Ficticia', birth: '1990-02-14' } }, 'Solo procedimiento');
  await toCheckoutWith(page, /Consulta ficticia Este/);
  await payments(page).getByRole('button', { name: 'Pagar saldo' }).click();
  await payments(page).getByTestId('record-payment').click();
  await expect(snack(page, 'Pago de $50.00 registrado.')).toBeVisible();
  await expect(main(page).getByTestId('total-balance')).toContainText('Pagado');

  // «Anular pago» (S-CAJ-13): motivo obligatorio; el pago queda «Anulado» con su motivo.
  await payments(page).getByRole('button', { name: 'Anular pago' }).click();
  const voidPayment = page.getByRole('dialog', { name: 'Anular pago' }).or(page.getByRole('alertdialog', { name: 'Anular pago' }));
  await expect(voidPayment).toContainText('Los recibos ya emitidos no cambian');
  await voidPayment.getByRole('button', { name: 'Anular' }).click();
  await expect(voidPayment.getByText('Se requiere un motivo.', { exact: true })).toBeVisible();
  await voidPayment.getByLabel('Motivo').fill('Cobrado en la tarjeta equivocada');
  await expectAccessible(page);
  await voidPayment.getByRole('button', { name: 'Anular' }).click();
  await expect(snack(page, 'Pago anulado.')).toBeVisible();
  const row = payments(page).getByTestId('payment-row');
  await expect(row).toHaveAttribute('data-voided', 'true');
  await expect(row).toContainText('Anulado: Cobrado en la tarjeta equivocada');
  await expect(main(page).getByTestId('total-balance')).toContainText('$50.00');

  // «Anular cargo» (S-CAJ-10): el cargo pasa a «anulados» con su motivo y el total vuelve a $0.00.
  await main(page).getByRole('button', { name: 'Anular cargo CONS-ESTE' }).first().click();
  const voidCharge = page.getByRole('dialog', { name: 'Anular cargo' }).or(page.getByRole('alertdialog', { name: 'Anular cargo' }));
  await expect(voidCharge).toContainText('CONS-ESTE · Cant. 1');
  await expect(voidCharge).toContainText('crédito a favor');
  await voidCharge.getByLabel('Motivo').fill('Cargo agregado por error');
  await voidCharge.getByRole('button', { name: 'Anular' }).click();
  await expect(snack(page, 'Cargo anulado.')).toBeVisible();
  await expect(main(page)).toContainText('1 cargo anulado');
  await expect(main(page).getByTestId('total-due')).toContainText('$0.00');
  await expectAccessible(page);
  await main(page).screenshot({ path: 'test-results/pagos-anulaciones.png' });
});
