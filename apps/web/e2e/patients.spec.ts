import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { E2E } from './global-setup.ts';

// T-012: Pacientes (S-PAC-01 a 04) con datos ficticios de la semilla.
// Recepción Norte busca desde la cabecera y en la página con un solo campo
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

  // «Buscar pacientes» de la cabecera: el mismo campo y el mínimo de 3 letras.
  await page.getByRole('button', { name: 'Buscar pacientes' }).click();
  const panel = page.getByRole('dialog', { name: 'Buscar pacientes' });
  await panel.getByRole('textbox', { name: 'Buscar paciente' }).fill('ma');
  await panel.getByRole('textbox', { name: 'Buscar paciente' }).press('Enter');
  await expect(panel).toContainText('Escriba al menos 3 letras del nombre o use la fecha de nacimiento, el teléfono o el código.');
  await panel.getByRole('textbox', { name: 'Buscar paciente' }).fill('maria');
  await panel.getByRole('textbox', { name: 'Buscar paciente' }).press('Enter');
  await expect(page).toHaveURL(/\/app\/NOR1\/pacientes$/);
  await expect(page.getByRole('heading', { name: 'Pacientes', level: 1 })).toBeVisible();
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
