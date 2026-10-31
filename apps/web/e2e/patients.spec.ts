import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { E2E } from './global-setup.ts';

// T-012: Pacientes (S-PAC-01 a 04) con datos ficticios de la semilla.
// La búsqueda de la cabecera (campo con la lupa integrada, panel de
// resultados, «/», código escaneado, Esc, clic fuera y teléfono) va en su
// propia prueba. Recepción Norte busca en la página con un solo campo
// (ADR 0030), ve los errores de fecha y del mínimo de 3 letras, intenta crear
// un duplicado («Posible paciente existente»), abre el existente, y crea al
// hijo de una paciente con su mismo teléfono (solo la nota). Enfermería busca
// pero no crea. La excepción del Propietario está en users.spec.ts.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const axe = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`));
const expectAccessible = (page: Page) => expect.poll(() => axe(page), { timeout: 10_000 }).toEqual([]);

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(E2E.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

const results = (page: Page) => page.getByRole('table', { name: 'Resultados de la búsqueda de pacientes' });
const search = async (page: Page, text: string) => {
  await page.getByRole('textbox', { name: 'Buscar paciente' }).fill(text);
  await page.getByRole('textbox', { name: 'Buscar paciente' }).press('Enter');
};

test.describe.configure({ retries: 0 });

test('Recepción busca, ve el aviso de duplicado y crea pacientes', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, 'recepcion.norte@example.test');
  await expect(page).toHaveURL(/\/app\/NOR1\/panel$/);

  await page.getByRole('navigation', { name: 'Navegación principal' }).first().getByRole('link', { name: 'Pacientes' }).click();
  await expect(page.getByRole('heading', { name: 'Pacientes', level: 1 })).toBeVisible();
  await search(page, 'maria');
  await expect(results(page)).toContainText('María López García');
  await expect(results(page)).toContainText('Maria Lopez');
  // El criterio no queda en la URL.
  expect(page.url()).not.toContain('maria');

  // Sin tildes ni mayúsculas, en cualquier orden, y combinaciones.
  for (const text of ['MARÍA', 'Lopez', 'lop maria']) {
    await search(page, text);
    await expect(results(page), text).toContainText('María López García');
  }
  await search(page, 'maria 02031985');
  await expect(page.getByText('Mostrando 2 de 2 coincidencias')).toBeVisible();
  await expect(results(page)).toContainText('(214) 555-0101');
  await expectAccessible(page);
  await page.locator('main').screenshot({ path: 'test-results/pacientes-busqueda.png' });

  // Errores del campo.
  await search(page, '02301985');
  await expect(page.getByText('Fecha no válida (use MMDDAAAA)')).toBeVisible();
  await search(page, 'ma');
  await expect(page.getByText('Escriba al menos 3 letras del nombre o use la fecha de nacimiento, el teléfono o el código.')).toBeVisible();

  // Ningún texto afirma cumplimiento de normas; el aviso neutro del estado inicial.
  await page.getByRole('button', { name: 'Limpiar' }).click();
  await expect(page.getByText('Las búsquedas y consultas de pacientes quedan registradas.')).toBeVisible();
  await expect(page.getByText(/HIPAA/)).toHaveCount(0);

  // «Nuevo paciente» con un posible duplicado: misma fecha y nombre parecido.
  await page.getByRole('button', { name: 'Crear paciente' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo paciente' });
  await expect(dialog.getByText(/HIPAA/)).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Crear' }).click();
  await expect(dialog.getByText('Este campo es obligatorio.')).toHaveCount(2);
  await expect(dialog.getByText('Seleccione la fecha de nacimiento.')).toBeVisible();
  await dialog.getByLabel('Nombre', { exact: true }).fill('Maria');
  await dialog.getByLabel('Apellido').fill('Lopez Garcia');
  await dialog.getByLabel('Fecha de nacimiento').fill('1985-02-03');
  await dialog.getByRole('button', { name: 'Crear' }).click();
  const notice = dialog.getByRole('region', { name: 'Posible paciente existente' });
  await expect(notice).toContainText('María López García');
  await expect(notice).toContainText('3 feb 1985 · Expediente P-');
  await expect(notice.getByRole('button', { name: 'Crear de todos modos' })).toBeVisible();
  await expectAccessible(page);
  await dialog.screenshot({ path: 'test-results/pacientes-duplicado.png' });

  // «Abrir existente» lleva al perfil (por ahora, su encabezado).
  await notice.getByRole('button', { name: /Abrir existente: María López García/ }).click();
  await expect(page).toHaveURL(/\/app\/NOR1\/pacientes\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: 'María López García', level: 1 })).toBeVisible();
  await expect(page.getByText('3 feb 1985 (')).toBeVisible();
  await expectAccessible(page);
  await page.locator('main').screenshot({ path: 'test-results/pacientes-encabezado.png' });

  // Al volver, la búsqueda sigue ahí (en memoria).
  await page.getByRole('link', { name: 'Volver a Pacientes' }).click();
  await expect(page.getByRole('heading', { name: 'Pacientes', level: 1 })).toBeVisible();

  // El hijo de Lucía Hernández, con el mismo teléfono: sin aviso, con la nota.
  await page.getByRole('button', { name: 'Crear paciente' }).first().click();
  const child = page.getByRole('dialog', { name: 'Nuevo paciente' });
  await child.getByLabel('Nombre', { exact: true }).fill('Sofía');
  await child.getByLabel('Apellido').fill('Hernández Díaz');
  await child.getByLabel('Fecha de nacimiento').fill('2015-07-07');
  await child.getByLabel('Teléfono de contacto').fill('(817) 555-0105');
  await child.getByLabel('Fuente de referido').selectOption({ label: 'Recomendación de un conocido' });
  await child.getByLabel('Detalles del referido').fill('Por su madre');
  await child.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByText(/Paciente creado\. Este teléfono ya está registrado en otros pacientes \(P-\d{6}, P-\d{6}\)\./)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sofía Hernández Díaz', level: 1 })).toBeVisible();
});

test('Enfermería busca pacientes pero no ve «Crear paciente»', async ({ page }) => {
  await signIn(page, 'enfermeria.norte@example.test');
  await expect(page).toHaveURL(/\/app\/NOR1\/panel$/);
  await page.getByRole('navigation', { name: 'Navegación principal' }).first().getByRole('link', { name: 'Pacientes' }).click();
  await search(page, 'valentina');
  await expect(results(page)).toContainText('Valentina Castillo Ríos');
  await expect(page.getByRole('button', { name: 'Crear paciente' })).toHaveCount(0);
});

const headerField = (page: Page) => page.getByRole('combobox', { name: 'Buscar pacientes' });
const headerOptions = (page: Page) => page.getByRole('listbox', { name: 'Resultados de la búsqueda de pacientes' }).getByRole('option');

test('la búsqueda de la cabecera: panel de resultados, teclado, código escaneado y campo vacío al cerrar', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, 'recepcion.norte@example.test');
  await expect(page).toHaveURL(/\/app\/NOR1\/panel$/);
  const field = headerField(page);

  // «/» enfoca el campo; los errores salen en el panel.
  await page.keyboard.press('/');
  await expect(field).toBeFocused();
  await page.keyboard.type('ma');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('Escriba al menos 3 letras del nombre o use la fecha de nacimiento, el teléfono o el código.');
  await field.fill('02301985');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Fecha no válida (use MMDDAAAA)');

  // Resultados: código, nombre, fecha y edad, y «Ver todos los resultados» al final.
  await field.fill('maria');
  await field.press('Enter');
  await expect(headerOptions(page).first()).toBeVisible();
  await expect(headerOptions(page)).toContainText(['P-', 'P-', 'Ver todos los resultados']);
  await expect(headerOptions(page).filter({ hasText: 'María López García' })).toContainText(/P-\d{6}.*3 feb 1985 · \d+ años/);
  await expect(field).toHaveAttribute('aria-expanded', 'true');
  await expectAccessible(page);
  await page.screenshot({ path: 'test-results/cabecera-busqueda.png' });

  // Flechas y Enter: abre el perfil y el campo queda vacío.
  const options = await headerOptions(page).allInnerTexts();
  const target = options.findIndex((o) => o.includes('María López García'));
  for (let i = 0; i <= target; i++) await field.press('ArrowDown');
  await expect(headerOptions(page).nth(target)).toHaveAttribute('aria-selected', 'true');
  await field.press('Enter');
  await expect(page.getByRole('heading', { name: 'María López García', level: 1 })).toBeVisible();
  await expect(field).toHaveValue('');

  // «Ver todos los resultados»: Pacientes con esa búsqueda, sin el criterio en la URL.
  await field.fill('lopez');
  await field.press('Enter');
  await headerOptions(page).filter({ hasText: 'Ver todos los resultados' }).click();
  await expect(page).toHaveURL(/\/app\/NOR1\/pacientes$/);
  await expect(results(page)).toContainText('María López García');
  await expect(page.getByRole('textbox', { name: 'Buscar paciente' })).toHaveValue('lopez');
  await expect(field).toHaveValue('');
  expect(page.url()).not.toContain('lopez');

  // Un código escaneado que existe abre directamente el perfil.
  await field.fill('CLINICA|P-000002|11221978');
  await field.press('Enter');
  await expect(page.getByRole('heading', { name: 'José Ramírez Santos', level: 1 })).toBeVisible();
  await expect(field).toHaveValue('');

  // Esc y clic fuera cierran el panel y vacían el campo.
  await field.fill('valentina');
  await field.press('Enter');
  await expect(headerOptions(page).first()).toBeVisible();
  await field.press('Escape');
  await expect(headerOptions(page)).toHaveCount(0);
  await expect(field).toHaveValue('');
  await field.fill('valentina');
  await field.press('Enter');
  await expect(headerOptions(page).first()).toBeVisible();
  await page.getByRole('heading', { level: 1 }).click();
  await expect(headerOptions(page)).toHaveCount(0);
  await expect(field).toHaveValue('');
});

test('en el teléfono, la lupa despliega el campo a todo el ancho de la cabecera', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'recepcion.norte@example.test');
  await expect(page).toHaveURL(/\/app\/NOR1\/panel$/);
  await expect(headerField(page)).toBeHidden();
  await page.getByRole('button', { name: 'Buscar pacientes' }).click();
  await expect(headerField(page)).toBeFocused();
  const box = await headerField(page).boundingBox();
  expect(box?.width).toBeGreaterThan(200);
  await headerField(page).fill('valentina');
  await headerField(page).press('Enter');
  await expect(headerOptions(page).filter({ hasText: 'Valentina Castillo Ríos' })).toBeVisible();
  await expectAccessible(page);
  await page.screenshot({ path: 'test-results/cabecera-busqueda-telefono.png' });
  await headerOptions(page).filter({ hasText: 'Valentina Castillo Ríos' }).click();
  await expect(page.getByRole('heading', { name: 'Valentina Castillo Ríos', level: 1 })).toBeVisible();
  await expect(headerField(page)).toBeHidden();
});
