import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { E2E } from './global-setup.ts';
import { signInSaved } from './sesion.ts';

// T-029: recibos (S-CAJ-14, 15 y 24; ADR 0037).
//  - Recepción de NOR1 genera el recibo de una visita con un pago parcial,
//    con confirmación y vinculado al último pago; lo ve en español y en
//    inglés y lo imprime en formato de ticket (el diálogo del navegador se
//    sustituye por uno que guarda el texto impreso).
//  - Después de otro pago, el primer recibo sigue igual: «Reimprimir» saca
//    la instantánea original, en el idioma elegido.
//  - Nada del recibo queda en el almacenamiento del navegador ni en la caché.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`));
const expectAccessible = (page: Page) => expect.poll(() => axe(page), { timeout: 10_000 }).toEqual([]);

declare global {
  interface Window {
    __printed?: string[];
  }
}

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', locale: 'es-US', timezoneId: 'America/Chicago', viewport: { width: 1280, height: 900 } });
  // El diálogo de impresión del navegador, sustituido en todas las ventanas (también la del iframe del recibo).
  await context.addInitScript(() => {
    window.print = () => {
      const top = window.top ?? window;
      top.__printed = [...(top.__printed ?? []), document.body.innerText];
      // Como el navegador al cerrar el diálogo.
      window.dispatchEvent(new Event('afterprint'));
    };
  });
  return context.newPage();
}

async function signIn(page: Page, email: string) {
  if (!(await signInSaved(page, email))) {
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(E2E.password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  }
  await expect(page).toHaveURL(/\/app\/NOR1\/panel$/);
}

const main = (page: Page) => page.locator('main');
const snack = (page: Page, text: string | RegExp) => page.getByText(text, { exact: typeof text === 'string' });
const receiptsCard = (page: Page) => page.getByTestId('receipts-card');
const printed = (page: Page) => page.evaluate(() => window.__printed ?? []);

/** Una paciente nueva con una visita abierta en NOR1 y la consulta inicial ($60.00), por la API. */
async function visitWithConsult(page: Page, lastName: string): Promise<string> {
  const created = await page.request.post('/api/patients', {
    data: { firstName: 'Rebeca', lastName, birthDate: '1990-03-14', phone: null, referralSourceId: null, referralDetails: null, forceCreate: true },
  });
  expect(created.status(), await created.text()).toBe(201);
  const patientId = ((await created.json()) as { id: string }).id;
  const arrival = await page.request.post('/api/encounters', {
    headers: { 'idempotency-key': randomUUID() },
    data: { source: 'walk_in', patientId, appointmentTypeId: null, route: 'STANDARD', coverage: { type: 'self_pay' } },
  });
  expect(arrival.status(), await arrival.text()).toBe(201);
  const encounterId = ((await arrival.json()) as { encounter: { id: string } }).encounter.id;
  const options = (await (await page.request.get(`/api/encounters/${encounterId}/charge-options`)).json()) as { items: { kind: string; id: string; code: string }[] };
  const consult = options.items.find((i) => i.code === 'CONS-INICIAL');
  expect(consult).toBeDefined();
  const charge = await page.request.post(`/api/encounters/${encounterId}/charges`, {
    headers: { 'idempotency-key': randomUUID() },
    data: { item: { kind: 'consultation', id: consult?.id }, quantity: 1, expectedVersion: await statementVersion(page, encounterId) },
  });
  expect(charge.status(), await charge.text()).toBe(201);
  return encounterId;
}

async function statementVersion(page: Page, encounterId: string): Promise<number> {
  return ((await (await page.request.get(`/api/encounters/${encounterId}/statement`)).json()) as { statementVersion: number }).statementVersion;
}

async function pay(page: Page, encounterId: string, amountCents: number) {
  const response = await page.request.post(`/api/encounters/${encounterId}/payments`, {
    headers: { 'idempotency-key': randomUUID() },
    data: { method: 'credit_card', amountCents, reference: 'AUTH-5678', expectedVersion: await statementVersion(page, encounterId) },
  });
  expect(response.status(), await response.text()).toBe(201);
}

test.describe.configure({ retries: 0 });

test('Recepción genera el recibo, lo ve en español y en inglés, lo imprime y lo reimprime sin cambios', async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await newPage(browser);
  await signIn(page, 'recepcion.norte@example.test');
  const encounterId = await visitWithConsult(page, 'Recibos Ficticia');
  await pay(page, encounterId, 2000);

  await page.goto(`/app/NOR1/caja/${encounterId}`);
  const card = receiptsCard(page);
  await expect(card.getByRole('heading', { name: 'Recibos' })).toBeVisible();
  await expect(card).toContainText('Aún no se han generado recibos.');

  // Generar pide confirmación: «Cancelar» no crea nada.
  await card.getByRole('button', { name: 'Generar recibo' }).click();
  let confirm = page.getByRole('dialog', { name: 'Generar recibo' });
  await expect(confirm).toContainText('Se creará un recibo nuevo');
  await expect(confirm.getByRole('checkbox', { name: 'Vincular al último pago ($20.00)' })).toBeChecked();
  await expectAccessible(page);
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  await expect(card.getByTestId('receipt-row')).toHaveCount(0);

  // Generar de verdad (vinculado al pago de $20.00).
  await card.getByRole('button', { name: 'Generar recibo' }).click();
  confirm = page.getByRole('dialog', { name: 'Generar recibo' });
  await confirm.getByRole('button', { name: 'Generar recibo' }).click();
  await expect(snack(page, /^Recibo NOR1-R-\d{4}-\d{6} generado\.$/)).toBeVisible();
  await expect(card.getByTestId('receipt-row')).toHaveCount(1);
  const firstRow = card.getByTestId('receipt-row').first();
  await expect(firstRow).toContainText('por Usted · Vinculado a un pago de $20.00');
  const firstCode = ((await firstRow.locator('.font-mono').textContent()) ?? '').trim();
  expect(firstCode).toMatch(/^NOR1-R-\d{4}-\d{6}$/);

  // Ver (S-CAJ-15): el texto del servidor en español y, al cambiar, en inglés.
  await firstRow.getByRole('button', { name: `Ver recibo ${firstCode}` }).click();
  const sheet = page.getByRole('dialog', { name: `Recibo ${firstCode}` });
  const text = sheet.getByTestId('receipt-text');
  await expect(text).toContainText('RECIBO');
  await expect(text).toContainText('Clínica Demo Norte');
  await expect(text).toContainText('Rebeca Recibos Ficticia');
  await expect(text).toContainText(/Pagado +\$20\.00/);
  await expect(text).toContainText(/Saldo +\$40\.00/);
  await expect(text).toContainText('••••5678');
  await expect(sheet.getByRole('radio', { name: 'Español' })).toHaveAttribute('aria-checked', 'true');
  await expectAccessible(page);
  await sheet.getByRole('radio', { name: 'English' }).click();
  await expect(text).toContainText('RECEIPT');
  await expect(text).toContainText(/Paid +\$20\.00/);
  // Imprimir desde la hoja, en inglés: sale el texto que devuelve el servidor tras auditar.
  await sheet.getByTestId('sheet-print').click();
  await expect.poll(() => printed(page)).toHaveLength(1);
  expect((await printed(page))[0]).toContain('RECEIPT');
  expect((await printed(page))[0]).toContain(firstCode);
  await sheet.getByRole('button', { name: 'Cerrar' }).click();
  await expect(sheet).toHaveCount(0);
  // El iframe de impresión no queda en la página.
  await expect(page.getByTestId('receipt-print-frame')).toHaveCount(0);

  // Otro pago y un segundo recibo: el primero pasa a «Reimprimir» y sigue igual.
  await pay(page, encounterId, 1000);
  await page.reload();
  await card.getByRole('button', { name: 'Generar recibo' }).click();
  confirm = page.getByRole('dialog', { name: 'Generar recibo' });
  await expect(confirm.getByRole('checkbox', { name: 'Vincular al último pago ($10.00)' })).toBeChecked();
  await confirm.getByRole('button', { name: 'Generar recibo' }).click();
  await expect(card.getByTestId('receipt-row')).toHaveCount(2);
  const rows = card.getByTestId('receipt-row');
  await expect(rows.nth(1)).toContainText(firstCode);
  await expect(rows.first().getByRole('button', { name: /^Imprimir recibo / })).toBeVisible();
  await rows.nth(1).getByRole('button', { name: `Reimprimir recibo ${firstCode}` }).click();
  const printDialog = page.getByRole('dialog', { name: 'Reimprimir recibo' });
  await expect(printDialog.getByRole('radio', { name: 'Español' })).toHaveAttribute('aria-checked', 'true');
  await expect(printDialog.getByRole('radio', { name: 'English' })).toBeVisible();
  await expectAccessible(page);
  await printDialog.getByTestId('confirm-print').click();
  await expect(printDialog).toHaveCount(0);
  // (La recarga de la página vació la lista de impresiones.)
  await expect.poll(() => printed(page)).toHaveLength(1);
  const reprint = (await printed(page))[0] ?? '';
  expect(reprint).toContain('RECIBO');
  expect(reprint).toContain(firstCode);
  // La instantánea original: $20.00 pagados y $40.00 de saldo, aunque ya se pagaron $30.00.
  expect(reprint).toMatch(/Pagado +\$20\.00/);
  expect(reprint).toMatch(/Saldo +\$40\.00/);

  // Nada del recibo en el navegador: ni en el almacenamiento ni en la caché del service worker.
  const stored = await page.evaluate(async () => {
    const read = (storage: Storage) => Array.from({ length: storage.length }, (_, i) => storage.getItem(storage.key(i) ?? '') ?? '');
    const values = [...read(localStorage), ...read(sessionStorage)].join('\n');
    const cached: string[] = [];
    if ('caches' in window) {
      for (const name of await caches.keys()) {
        for (const request of await (await caches.open(name)).keys()) cached.push(request.url);
      }
    }
    const databases = 'databases' in indexedDB ? (await indexedDB.databases()).map((d) => d.name ?? '') : [];
    return { values, cached, databases };
  });
  expect(stored.values).not.toContain(firstCode);
  expect(stored.values).not.toContain('Recibos Ficticia');
  expect(stored.cached.filter((url) => url.includes('/api/'))).toEqual([]);
  expect(stored.databases).toEqual([]);
  await expect(main(page)).not.toContainText('RECIBO');
});
