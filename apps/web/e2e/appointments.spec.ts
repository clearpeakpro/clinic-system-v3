import AxeBuilder from '@axe-core/playwright';
import { appointments, appointmentTypes, createTenantDb, DEMO, nextAppointmentCode } from '@clinic/db';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { E2E } from './global-setup.ts';

// T-014: agenda (S-REC-06 a 09), «N citas hoy» del Panel y citas del perfil
// (S-PAC-07), con las citas ficticias de la semilla (20 por sede: ayer, hoy y
// los próximos días, relativas al día en que se siembra). Las citas de los
// días con cambio de horario se crean aquí, lejos de las de la semilla.
// Todas las sedes ficticias están en la hora Central.

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

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegación principal' }).first();
const cards = (page: Page) => page.getByTestId('appointment-card');
const statusChip = (page: Page, name: RegExp) => page.getByRole('group', { name: 'Filtrar por estado' }).getByRole('button', { name });

/** Hoy en la hora Central (`AAAA-MM-DD`). */
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
const plusDays = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** Crea citas ficticias en NOR1 en esos instantes (como clinic_app). */
async function insertAt(instants: string[]): Promise<void> {
  const pool = new pg.Pool({ connectionString: process.env.E2E_APP_URL, max: 1 });
  const org = DEMO.norte;
  try {
    await createTenantDb(pool).withTenant(org.id, async (tx) => {
      const types = await tx.select({ id: appointmentTypes.id, code: appointmentTypes.code }).from(appointmentTypes);
      const type = types.find((t) => t.code === 'SEGUIMIENTO');
      for (const at of instants) {
        await tx.insert(appointments).values({
          organizationId: org.id,
          locationId: org.locations[0].id,
          patientId: org.patients[0].id,
          appointmentTypeId: type?.id ?? '',
          code: await nextAppointmentCode(tx, org.id, org.locations[0]),
          startsAt: new Date(at),
          durationMinutes: 20,
        });
      }
    });
  } finally {
    await pool.end();
  }
}

test('Recepción ve la agenda de hoy de NOR1: horas, tarjetas, filtros, vista Lista y detalle', async ({ page }) => {
  await signIn(page, 'recepcion.norte@example.test');
  await expect(page).toHaveURL(/\/app\/NOR1\/panel$/);
  // Panel: 9 citas hoy en la semilla, menos 1 cancelada y 1 no presentada.
  await expect(page.getByTestId('panel-subtitle')).toHaveText('Norte Centro · 7 citas hoy');

  await nav(page).getByRole('link', { name: 'Citas' }).click();
  await expect(page).toHaveURL(/\/app\/NOR1\/citas$/);
  await expect(page.getByRole('heading', { name: 'Citas', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nueva cita' })).toBeDisabled();
  await expect(page.getByText('Llega con la agenda')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sin cita' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hoy' })).toHaveCount(0);

  // Hoy: 9 citas, agrupadas por hora local; solo NOR1.
  await expect(cards(page)).toHaveCount(9);
  await expect(statusChip(page, /^Todos/)).toContainText('9');
  await expect(statusChip(page, /^Programada/)).toContainText('3');
  await expect(statusChip(page, /^Confirmada/)).toContainText('2');
  await expect(statusChip(page, /^Llegó/)).toContainText('2');
  await expect(statusChip(page, /^Cancelada/)).toContainText('1');
  await expect(statusChip(page, /^No se presentó/)).toContainText('1');
  const sections = page.getByRole('region', { name: /[ap]\. m\.$/ });
  await expect(sections.getByRole('heading', { level: 2 })).toHaveText(['8:00 a. m.', '9:00 a. m.', '10:00 a. m.', '11:00 a. m.', '2:00 p. m.', '3:00 p. m.']);
  const first = cards(page).first();
  await expect(first).toContainText('8:30 – 8:50 a. m. · 20 min');
  await expect(first).toContainText('Consulta general');
  await expect(first).toContainText('Diana Doctora (ficticia)');
  // El color del tipo es una franja lateral; el único chip de la tarjeta es el estado.
  await expect(first.getByTestId('type-stripe')).toHaveClass(/bg-agenda-teal/);
  await expect(first.getByText('Estado:')).toHaveCount(1);
  await expect(first).not.toContainText('NOR1-A-');
  await expectAccessible(page);
  await page.locator('main').screenshot({ path: 'test-results/agenda-dia.png' });

  // Filtros en el cliente: estados de selección múltiple y proveedor.
  await statusChip(page, /^Cancelada/).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first().locator('.line-through')).toHaveCount(1);
  await statusChip(page, /^No se presentó/).click();
  await expect(cards(page)).toHaveCount(2);
  await statusChip(page, /^Todos/).click();
  await expect(cards(page)).toHaveCount(9);
  await page.getByLabel('Proveedor').selectOption({ label: 'Sin asignar' });
  await expect(cards(page)).toHaveCount(2);
  await expect(cards(page).first()).toContainText('Sin proveedor');
  await page.getByLabel('Proveedor').selectOption({ label: 'Diana Doctora (ficticia)' });
  await expect(cards(page)).toHaveCount(7);
  // «Mis citas» solo se ofrece al rol Proveedor.
  await expect(page.getByLabel('Proveedor').locator('option', { hasText: 'Mis citas' })).toHaveCount(0);
  await statusChip(page, /^Llegó/).click();
  await page.getByLabel('Proveedor').selectOption({ label: 'Sin asignar' });
  await expect(page.getByText('Ninguna cita coincide con los filtros actuales.')).toBeVisible();
  await page.getByRole('button', { name: 'Quitar filtros' }).click();
  await expect(cards(page)).toHaveCount(9);
  await expect(page.getByLabel('Proveedor')).toHaveValue('all');

  // Vista Lista (S-REC-08): con el código de la cita.
  await page.getByRole('radio', { name: 'Lista' }).click();
  const table = page.getByRole('table', { name: 'Citas del día' });
  await expect(table.getByRole('columnheader')).toHaveText(['Hora', 'Código', 'Paciente', 'Tipo', 'Proveedor', 'Duración', 'Estado']);
  await expect(table.getByRole('row')).toHaveCount(10);
  await expect(table.getByRole('row').nth(1)).toContainText(/A-\d{6}/);
  await expectAccessible(page);
  await page.locator('main').screenshot({ path: 'test-results/agenda-lista.png' });

  // Detalle (S-REC-09) en solo lectura: la cita confirmada de las 10:00, con notas.
  await table.getByRole('row').filter({ hasText: '10:00 – 10:30 a. m.' }).click();
  const detail = page.getByRole('dialog', { name: 'Cita' });
  await expect(detail).toContainText(/NOR1-A-\d{6}/);
  await expect(detail).toContainText('Confirmada');
  await expect(detail).toContainText('Traerá los resultados de su último análisis.');
  await expect(detail).toContainText('10:00 – 10:30 a. m. · 30 min');
  await expect(detail.getByRole('button', { name: /Confirmar|Reprogramar|Editar|Cancelar cita|Registrar llegada/ })).toHaveCount(0);
  await expectAccessible(page);
  await detail.getByRole('button', { name: 'Cerrar' }).click();
  await page.getByRole('radio', { name: 'Día' }).click();

  // La cancelada: motivo en el detalle, nunca en la tarjeta.
  await expect(cards(page).filter({ hasText: '10:40' })).not.toContainText('Canceló el paciente');
  await cards(page).filter({ hasText: '10:40' }).click();
  await expect(detail).toContainText('Canceló el paciente vía llamada.');
  await expect(detail).toContainText('Esta cita está cerrada; no hay más acciones disponibles.');
  await detail.getByRole('button', { name: 'Cerrar' }).click();

  // Día siguiente, «Hoy» y la fecha en la URL.
  await page.getByRole('button', { name: 'Día siguiente' }).click();
  await expect(page).toHaveURL(new RegExp(`fecha=${plusDays(today(), 1)}$`));
  await expect(cards(page)).toHaveCount(3);
  await page.goBack();
  await expect(cards(page)).toHaveCount(9);
  await page.goForward();
  await expect(cards(page)).toHaveCount(3);
  await page.getByRole('button', { name: 'Hoy' }).click();
  await expect(page).toHaveURL(/\/app\/NOR1\/citas$/);
  await expect(cards(page)).toHaveCount(9);
  // Una fecha inválida en la URL es hoy.
  await page.goto('/app/NOR1/citas?fecha=2026-02-30');
  await expect(cards(page)).toHaveCount(9);
});

test('días con cambio de horario: las horas y los días son los de la sede', async ({ page }) => {
  await insertAt([
    '2027-11-07T05:30:00Z', // 0:30 a. m. CDT
    '2027-11-07T06:30:00Z', // 1:30 a. m. CDT
    '2027-11-07T07:30:00Z', // 1:30 a. m. CST (la hora se repite)
    '2027-11-08T05:30:00Z', // 7 nov, 11:30 p. m. CST
    '2027-11-07T04:30:00Z', // 6 nov, 11:30 p. m. CDT: otro día
    '2027-03-14T07:30:00Z', // 1:30 a. m. CST
    '2027-03-14T08:30:00Z', // 3:30 a. m. CDT
  ]);
  await signIn(page, 'recepcion.norte@example.test');
  await expect(page).toHaveURL(/\/app\/NOR1\/panel$/);
  await page.goto('/app/NOR1/citas?fecha=2027-11-07');
  await expect(page.getByText('Domingo, 7 de noviembre de 2027')).toBeVisible();
  await expect(cards(page)).toHaveCount(4);
  const sections = page.getByRole('region', { name: /[ap]\. m\.$/ });
  await expect(sections.getByRole('heading', { level: 2 })).toHaveText(['12:00 a. m.', '1:00 a. m.', '11:00 p. m.']);
  await expect(cards(page).filter({ hasText: '1:30 – 1:50 a. m.' })).toHaveCount(2);
  await page.goto('/app/NOR1/citas?fecha=2027-11-06');
  await expect(cards(page).filter({ hasText: '11:30 – 11:50 p. m.' })).toHaveCount(1);
  await page.goto('/app/NOR1/citas?fecha=2027-03-14');
  await expect(sections.getByRole('heading', { level: 2 })).toHaveText(['1:00 a. m.', '3:00 a. m.']);
  await expect(cards(page).nth(1)).toContainText('3:30 – 3:50 a. m.');
});

test('el Proveedor entra con «Mis citas»; Enfermería no ve Citas; Sur no ve nada de Norte', async ({ page }) => {
  await signIn(page, 'proveedora.nor1@example.test');
  await expect(page).toHaveURL(/\/app\/NOR1\/panel$/);
  await nav(page).getByRole('link', { name: 'Citas' }).click();
  await expect(page.getByLabel('Proveedor')).toHaveValue('mine');
  await expect(cards(page)).toHaveCount(7);
  await expect(cards(page).first()).toContainText('Yo · Diana Doctora (ficticia)');
  await page.getByLabel('Proveedor').selectOption({ label: 'Todos los proveedores' });
  await expect(cards(page)).toHaveCount(9);
  // El filtro se conserva durante la sesión.
  await nav(page).getByRole('link', { name: 'Panel' }).click();
  await nav(page).getByRole('link', { name: 'Citas' }).click();
  await expect(page.getByLabel('Proveedor')).toHaveValue('all');

  await page.getByRole('button', { name: 'Menú de cuenta' }).click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await signIn(page, 'enfermeria.norte@example.test');
  await expect(page).toHaveURL(/\/app\/NOR1\/panel$/);
  await expect(page.getByTestId('panel-subtitle')).toHaveText('Norte Centro · 7 citas hoy');
  await expect(nav(page).getByRole('link', { name: 'Citas' })).toHaveCount(0);
  await page.goto('/app/NOR1/citas');
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
  // En el perfil, sin pestaña Citas ni «Próxima cita».
  await page.goto(`/app/NOR1/pacientes/${DEMO.norte.patients[10].id}`);
  await expect(page.getByRole('heading', { name: 'Valentina Castillo Ríos', level: 1 })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Secciones del perfil' }).getByRole('tab')).toHaveText(['Resumen', 'Visitas', 'Saldos']);
  await expect(page.getByRole('heading', { name: 'Próxima cita' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Menú de cuenta' }).click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await signIn(page, 'recepcion.sur@example.test');
  await expect(page).toHaveURL(/\/app\/SUR1\/panel$/);
  await nav(page).getByRole('link', { name: 'Citas' }).click();
  await expect(cards(page)).toHaveCount(9);
  await page.getByRole('radio', { name: 'Lista' }).click();
  const codes = await page.getByRole('table', { name: 'Citas del día' }).getByRole('button', { name: /^Abrir la cita/ }).allInnerTexts();
  expect(codes).toHaveLength(9);
  // Desde Sur, una sede de Norte en la URL no existe.
  await page.goto('/app/NOR1/citas');
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
});

test('perfil del paciente: «Próxima cita» y pestaña Citas, que abre la agenda en su fecha', async ({ page }) => {
  await signIn(page, 'recepcion.norte@example.test');
  await expect(page).toHaveURL(/\/app\/NOR1\/panel$/);
  // Valentina Castillo Ríos (NOR1): hoy a las 9:00 (Llegó) y en dos días a las 9:30 (Programada).
  await page.goto(`/app/NOR1/pacientes/${DEMO.norte.patients[10].id}`);
  await expect(page.getByRole('heading', { name: 'Valentina Castillo Ríos', level: 1 })).toBeVisible();
  const upcoming = page.getByTestId('upcoming-appointment');
  await expect(upcoming).toContainText('9:30 a. m.');
  await expect(upcoming).toContainText('Consulta general');
  await expect(upcoming).toContainText('Programada');
  await expect(upcoming).toContainText('Diana Doctora (ficticia)');
  await expect(upcoming).toContainText('Norte Centro (NOR1)');

  await page.getByRole('tab', { name: 'Citas' }).click();
  const table = page.getByRole('table', { name: 'Citas del paciente' });
  await expect(table.getByRole('columnheader')).toHaveText(['Fecha', 'Hora', 'Código', 'Sede', 'Tipo', 'Proveedor', 'Estado']);
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(table.getByRole('row').nth(1)).toContainText('9:30 a. m.');
  await expect(table.getByRole('row').nth(2)).toContainText('Llegó');
  await expectAccessible(page);
  await page.locator('main').screenshot({ path: 'test-results/perfil-citas.png' });
  await table.getByRole('row').nth(1).click();
  await expect(page).toHaveURL(new RegExp(`/app/NOR1/citas\\?fecha=${plusDays(today(), 2)}$`));
  await expect(cards(page).filter({ hasText: 'Valentina Castillo Ríos' })).toHaveCount(1);
});
