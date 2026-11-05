import { expect, test, type Browser, type Page } from '@playwright/test';
import { E2E } from './global-setup.ts';

// Marco de la aplicación (S-GEN-07/08): una sola barra de desplazamiento, la
// del contenido (<main>), y el final de la página visible.
// Antes, los textos «sr-only» (position: absolute) de los chips de estado
// escapaban del recorte de <main>: el documento se alargaba, aparecía una
// segunda barra y una franja vacía abajo tapaba el final del contenido.
// Se comprueba en escritorio, tableta y teléfono, en las pantallas largas: la
// visita, la Caja de la visita, el perfil del paciente, el Panel y las colas.

const SIZES = [
  { name: 'escritorio', width: 1600, height: 900 },
  { name: 'tableta', width: 1024, height: 768 },
  { name: 'teléfono', width: 390, height: 844 },
] as const;

async function newPage(browser: Browser, size: (typeof SIZES)[number]): Promise<Page> {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', locale: 'es-US', timezoneId: 'America/Chicago', viewport: { width: size.width, height: size.height } });
  return context.newPage();
}

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(E2E.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/app\/NOR1\/panel$/);
}

/**
 * El documento no se desplaza (solo <main>) y, al bajar hasta el final de
 * <main>, su último elemento con contenido se ve entero dentro de la ventana,
 * por encima de la barra inferior del teléfono, y no lo tapa nada.
 */
async function expectSingleScrollAndEndVisible(page: Page, label: string) {
  const result = await page.evaluate(() => {
    const doc = document.scrollingElement ?? document.documentElement;
    const main = document.querySelector('main');
    if (!main) return { error: 'sin <main>' };
    main.scrollTop = main.scrollHeight;
    window.scrollTo(0, 0);
    // El último elemento HTML visible con tamaño dentro de <main>.
    const lastVisibleChild = (el: HTMLElement): HTMLElement | undefined =>
      // Solo elementos HTML: los iconos SVG no cuentan como contenido.
      [...el.children]
        .filter((c): c is HTMLElement => c instanceof HTMLElement)
        .filter((c) => {
          const r = c.getBoundingClientRect();
          return r.height > 0 && r.width > 0 && getComputedStyle(c).visibility !== 'hidden';
        })
        .at(-1);
    let last: HTMLElement = main;
    for (let next = lastVisibleChild(last); next; next = lastVisibleChild(last)) last = next;
    const rect = last.getBoundingClientRect();
    const bottomNav = [...document.querySelectorAll('nav[aria-label="Navegación principal"]')].find((n) => getComputedStyle(n).position === 'fixed' && n.getBoundingClientRect().height > 0);
    const limit = bottomNav ? bottomNav.getBoundingClientRect().top : window.innerHeight;
    const x = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
    const y = Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1);
    const hit = document.elementFromPoint(x, y);
    return {
      documentScrolls: doc.scrollHeight > window.innerHeight + 1 || doc.scrollWidth > window.innerWidth + 1,
      documentHeight: doc.scrollHeight,
      viewport: window.innerHeight,
      lastBottom: Math.round(rect.bottom),
      lastTop: Math.round(rect.top),
      limit: Math.round(limit),
      covered: hit === null || !(last === hit || last.contains(hit) || hit.contains(last)),
      lastTag: `${last.tagName} ${last.innerText.trim().slice(0, 40)}`,
    };
  });
  expect(result, label).not.toHaveProperty('error');
  expect(result.documentScrolls, `${label}: el documento no debe desplazarse (${JSON.stringify(result)})`).toBe(false);
  expect(result.lastBottom, `${label}: el final de la página se ve (${JSON.stringify(result)})`).toBeLessThanOrEqual(result.limit ?? 0);
  expect(result.lastTop, `${label}: el final de la página se ve (${JSON.stringify(result)})`).toBeGreaterThanOrEqual(0);
  expect(result.covered, `${label}: nada tapa el final (${JSON.stringify(result)})`).toBe(false);
}

test.describe.configure({ retries: 0 });

for (const size of SIZES) {
  test(`una sola barra de desplazamiento y el final visible: ${size.name}`, async ({ browser }) => {
    test.setTimeout(120_000);
    const recepcion = await newPage(browser, size);
    await signIn(recepcion, 'recepcion.norte@example.test');
    // Una paciente nueva con una visita abierta (sin tocar a los pacientes de la semilla).
    const created = await recepcion.request.post('/api/patients', {
      data: { firstName: 'Delia', lastName: `Desplazamiento ${String(size.width)}`, birthDate: '1988-06-02', phone: null, referralSourceId: null, referralDetails: null, forceCreate: true },
    });
    expect(created.status(), await created.text()).toBe(201);
    const patientId = ((await created.json()) as { id: string }).id;
    const arrival = await recepcion.request.post('/api/encounters', {
      headers: { 'idempotency-key': `desplazamiento-${String(size.width)}-${String(Date.now())}` },
      data: { source: 'walk_in', patientId, appointmentTypeId: null, route: 'STANDARD', coverage: { type: 'self_pay' } },
    });
    expect(arrival.status(), await arrival.text()).toBe(201);
    const encounterId = ((await arrival.json()) as { encounter: { id: string } }).encounter.id;

    const screens: { label: string; url: string; ready: (page: Page) => Promise<void> }[] = [
      { label: 'visita', url: `/app/NOR1/visitas/${encounterId}`, ready: (p) => p.getByTestId('billing-section').waitFor() },
      { label: 'Caja de la visita', url: `/app/NOR1/caja/${encounterId}`, ready: (p) => p.getByTestId('checkout-bar').waitFor() },
      { label: 'perfil del paciente', url: `/app/NOR1/pacientes/${patientId}`, ready: (p) => p.getByRole('tablist', { name: 'Secciones del perfil' }).waitFor() },
      { label: 'Panel', url: '/app/NOR1/panel', ready: (p) => p.getByRole('heading', { level: 1 }).first().waitFor() },
      { label: 'cola de Caja', url: '/app/NOR1/caja', ready: (p) => p.getByRole('heading', { name: 'Caja', exact: true }).waitFor() },
    ];
    for (const screen of screens) {
      await recepcion.goto(screen.url);
      await screen.ready(recepcion);
      await recepcion.waitForLoadState('networkidle');
      await expectSingleScrollAndEndVisible(recepcion, `${size.name} · ${screen.label}`);
    }
    await recepcion.goto(`/app/NOR1/visitas/${encounterId}`);
    await recepcion.getByTestId('billing-section').waitFor();
    await recepcion.screenshot({ path: `test-results/desplazamiento-visita-${String(size.width)}.png` });

    const enfermeria = await newPage(browser, size);
    await signIn(enfermeria, 'enfermeria.norte@example.test');
    for (const [label, url] of [
      ['cola de enfermería', '/app/NOR1/cola-enfermeria'],
      ['cola de órdenes', '/app/NOR1/cola-ordenes'],
    ] as const) {
      await enfermeria.goto(url);
      await enfermeria.getByRole('heading', { level: 1 }).first().waitFor();
      await enfermeria.waitForLoadState('networkidle');
      await expectSingleScrollAndEndVisible(enfermeria, `${size.name} · ${label}`);
    }
  });
}
