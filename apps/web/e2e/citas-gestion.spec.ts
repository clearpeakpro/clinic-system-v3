import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { E2E } from './global-setup.ts';

// T-015: gestión de citas (S-REC-10 a 17), agenda y Panel en vivo y avisos de
// la campana. Dos ventanas: Recepción de NOR1 agenda y la proveedora de NOR1
// (Diana Doctora, ficticia) lo ve sin recargar. Las citas van a días futuros
// propios de esta prueba; el archivo corre después de appointments.spec.ts
// (orden alfabético, un solo worker), así que la cita de hoy del Panel no
// altera los totales que comprueba T-014. Datos ficticios.

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

const cards = (page: Page) => page.getByTestId('appointment-card');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
const plusDays = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const PROVIDER = 'Diana Doctora (ficticia)';

/** «Nueva cita» desde la agenda, con el paciente buscado en S-REC-12. */
async function createAppointment(page: Page, options: { search: string; patient: string; time: string; provider?: string; checkOverlap?: string }) {
  await page.getByRole('button', { name: 'Nueva cita' }).first().click();
  const form = page.getByRole('dialog', { name: 'Nueva cita' });
  await form.getByRole('button', { name: 'Elegir paciente' }).click();
  const picker = page.getByRole('dialog', { name: 'Elegir paciente' });
  await picker.getByRole('textbox', { name: 'Buscar paciente' }).fill(options.search);
  await picker.getByRole('textbox', { name: 'Buscar paciente' }).press('Enter');
  // Hay homónimos en la semilla: se elige el primero.
  await picker.getByRole('button', { name: new RegExp(options.patient) }).first().click();
  await expect(form).toContainText(options.patient);
  await form.getByLabel('Tipo de cita').selectOption({ label: 'Consulta general' });
  // La duración por defecto del tipo.
  await expect(form.getByLabel('Duración')).toHaveValue('20');
  await form.getByLabel('Hora').fill(options.time);
  if (options.provider) await form.getByLabel('Proveedor').selectOption({ label: options.provider });
  if (options.checkOverlap) {
    // Antes de guardar, como en Stitch; no bloquea.
    await expect(form.getByRole('status').filter({ hasText: options.checkOverlap })).toBeVisible();
    await expect(form.getByText('Se permite guardar como sobrecupo.')).toBeVisible();
    await expect(form.getByText('Ocupado')).toBeVisible();
    await expectAccessible(page);
  }
  await form.getByRole('button', { name: 'Crear cita' }).click();
  await expect(form).toHaveCount(0);
}

test('Recepción agenda para la proveedora de NOR1; ella ve el aviso y la cita sin recargar; el Panel se actualiza solo', async ({ browser }) => {
  const day = plusDays(today(), 21);
  const recepcion = await newPage(browser);
  const proveedora = await newPage(browser);
  await signIn(recepcion, 'recepcion.norte@example.test');
  await signIn(proveedora, 'proveedora.nor1@example.test');
  await proveedora.goto(`/app/NOR1/citas?fecha=${day}`);
  await expect(proveedora.getByText('No hay nada programado para este día.')).toBeVisible();
  const bell = proveedora.getByRole('button', { name: /^Notificaciones/ });
  const unreadBefore = Number(/(\d+) sin leer/.exec((await bell.getAttribute('aria-label')) ?? '')?.[1] ?? '0');

  await recepcion.goto(`/app/NOR1/citas?fecha=${day}`);
  await recepcion.getByRole('button', { name: 'Nueva cita' }).first().click();
  const form = recepcion.getByRole('dialog', { name: 'Nueva cita' });
  // Validación al intentar guardar sin datos.
  await form.getByRole('button', { name: 'Crear cita' }).click();
  await expect(form.getByText('Elija un paciente.')).toBeVisible();
  await expect(form.getByText('Elija un tipo de cita.')).toBeVisible();
  // Solo desde hoy en la sede.
  await form.getByLabel('Fecha').fill(plusDays(today(), -1));
  await expect(form.getByText('No se pueden agendar citas en días anteriores a hoy.')).toBeVisible();
  await form.getByLabel('Fecha').fill(day);
  await expect(form.getByText('No se pueden agendar citas en días anteriores a hoy.')).toHaveCount(0);
  // Sin datos de cumplimiento normativo ni textos inventados.
  await expect(form).not.toContainText('HIPAA');
  await expect(form).not.toContainText('Expediente validado');
  await expectAccessible(recepcion);
  await form.getByRole('button', { name: 'Cancelar' }).click();
  // Cambió la fecha: pide descartar (S-REC-17).
  const discard = recepcion.getByRole('dialog', { name: '¿Descartar cambios sin guardar?' });
  await discard.getByRole('button', { name: 'Descartar' }).click();
  await expect(form).toHaveCount(0);

  await createAppointment(recepcion, { search: 'sofia navarro', patient: 'Sofía Navarro Morales', time: '10:00', provider: PROVIDER });
  await expect(recepcion.getByText(/^Cita A-\d{6} creada\.$/)).toBeVisible();
  await expect(cards(recepcion).filter({ hasText: '10:00 – 10:20 a. m.' })).toHaveCount(1);

  // La proveedora, sin recargar: la cita en su agenda y el aviso en la campana.
  await expect(cards(proveedora).filter({ hasText: '10:00 – 10:20 a. m.' })).toHaveCount(1, { timeout: 15_000 });
  await expect(bell).toHaveAccessibleName(`Notificaciones, ${String(unreadBefore + 1)} sin leer`, { timeout: 15_000 });
  await bell.click();
  const panel = proveedora.getByRole('dialog', { name: 'Notificaciones' });
  const notice = panel.getByRole('button', { name: /Cita asignada a usted/ }).first();
  await expect(notice).toContainText(/Cita NOR1-A-\d{6} · \d{1,2} [a-z]+, 10:00 a\. m\./);
  // Sin nombres de pacientes.
  await expect(panel).not.toContainText('Sofía');
  await expect(panel).not.toContainText('Navarro');
  await notice.click();
  await expect(proveedora).toHaveURL(new RegExp(`/app/NOR1/citas\\?fecha=${day}&cita=`));
  const detail = proveedora.getByRole('dialog', { name: 'Cita' });
  await expect(detail).toContainText('Sofía Navarro Morales');
  await expect(detail).toContainText('Programada');
  // Es suya: la proveedora la confirma; «Registrar llegada» no es para su rol.
  await expect(detail.getByRole('button', { name: 'Registrar llegada' })).toHaveCount(0);
  await detail.getByRole('button', { name: 'Confirmar' }).click();
  await expect(proveedora.getByText('Cita confirmada.', { exact: true })).toBeVisible();
  await expect(detail.getByText('Confirmada', { exact: true })).toBeVisible();
  await detail.getByRole('button', { name: 'Cerrar' }).click();
  // Recepción lo ve sin recargar.
  await expect(cards(recepcion).filter({ hasText: '10:00 – 10:20 a. m.' })).toContainText('Confirmada', { timeout: 15_000 });

  // El Panel de la proveedora se actualiza solo con una cita de hoy.
  await proveedora.getByRole('navigation', { name: 'Navegación principal' }).first().getByRole('link', { name: 'Panel' }).click();
  const subtitle = proveedora.getByTestId('panel-subtitle');
  await expect(subtitle).toContainText('citas hoy');
  const before = Number(/(\d+) citas? hoy/.exec((await subtitle.textContent()) ?? '')?.[1] ?? '0');
  await recepcion.goto('/app/NOR1/citas');
  await createAppointment(recepcion, { search: 'sofia navarro', patient: 'Sofía Navarro Morales', time: '23:50' });
  await expect(subtitle).toContainText(`${String(before + 1)} citas hoy`, { timeout: 15_000 });
});

test('el solapamiento se avisa antes de guardar al crear y al reprogramar; cancelar exige motivo; todo queda en la agenda en vivo', async ({ browser }) => {
  const day = plusDays(today(), 22);
  const page = await newPage(browser);
  await signIn(page, 'recepcion.norte@example.test');
  await page.goto(`/app/NOR1/citas?fecha=${day}`);
  await createAppointment(page, { search: 'juan perez', patient: 'Juan Pérez Gómez', time: '09:00', provider: PROVIDER });
  await expect(page.getByText(/^Cita A-\d{6} creada\.$/)).toBeVisible();
  // Otra a las 9:10 con la misma proveedora: aviso antes de guardar y, al guardar, en el mensaje.
  await createAppointment(page, {
    search: 'carmen ruiz',
    patient: 'Carmen Ruiz Ortega',
    time: '09:10',
    provider: PROVIDER,
    checkOverlap: `${PROVIDER} ya tiene una cita que se solapa a las 9:00 a. m.`,
  });
  await expect(page.getByText(/^Cita A-\d{6} creada\. El proveedor ya tiene una cita en ese horario\.$/)).toBeVisible();

  // Una tercera sin proveedor a las 11:00; se le asigna la proveedora y se reprograma encima de la de las 9:00.
  await createAppointment(page, { search: 'gabriela jimenez', patient: 'Gabriela Jiménez Soto', time: '11:00' });
  await cards(page).filter({ hasText: '11:00 – 11:20 a. m.' }).click();
  const detail = page.getByRole('dialog', { name: 'Cita' });
  await detail.getByRole('button', { name: 'Editar' }).click();
  const edit = page.getByRole('dialog', { name: 'Editar cita' });
  await expect(edit.getByText('Use Reprogramar para cambiar la fecha o la hora.')).toBeVisible();
  await expect(edit.getByLabel('Fecha')).toBeDisabled();
  await edit.getByLabel('Proveedor').selectOption({ label: PROVIDER });
  await edit.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Cita actualizada.', { exact: true })).toBeVisible();
  await expect(detail).toContainText(PROVIDER);

  await detail.getByRole('button', { name: 'Reprogramar' }).click();
  const reschedule = page.getByRole('dialog', { name: 'Reprogramar cita' });
  await reschedule.getByLabel('Hora').fill('09:05');
  await expect(reschedule.getByRole('status').filter({ hasText: `${PROVIDER} ya tiene una cita que se solapa a las 9:00 a. m.` })).toBeVisible();
  // Tampoco en días anteriores a hoy.
  await reschedule.getByLabel('Fecha').fill(plusDays(today(), -2));
  await reschedule.getByRole('button', { name: 'Reprogramar' }).click();
  await expect(reschedule.getByText('No se pueden agendar citas en días anteriores a hoy.')).toBeVisible();
  await reschedule.getByLabel('Fecha').fill(day);
  await expectAccessible(page);
  await reschedule.getByRole('button', { name: 'Reprogramar' }).click();
  await expect(page.getByText('Cita reprogramada. El proveedor ya tiene una cita en ese horario.', { exact: true })).toBeVisible();
  await expect(detail).toContainText('9:05 – 9:25 a. m.');

  // Cancelar sin motivo no se permite; «Volver» no cambia nada.
  await detail.getByRole('button', { name: 'Cancelar cita' }).click();
  const cancel = page.getByRole('dialog', { name: '¿Cancelar esta cita?' });
  await expect(cancel).toContainText('Indique un motivo operativo (sin datos clínicos).');
  await cancel.getByRole('button', { name: 'Cancelar cita' }).click();
  await expect(cancel.getByText('Se requiere un motivo.')).toBeVisible();
  await cancel.getByRole('button', { name: 'Volver' }).click();
  await expect(detail).toContainText('Programada');
  await detail.getByRole('button', { name: 'Cancelar cita' }).click();
  await cancel.getByLabel('Motivo').fill('A petición del paciente');
  await expectAccessible(page);
  await cancel.getByRole('button', { name: 'Cancelar cita' }).click();
  await expect(page.getByText('Cita cancelada.', { exact: true })).toBeVisible();
  await expect(detail).toContainText('A petición del paciente');
  await expect(detail).toContainText('Esta cita está cerrada; no hay más acciones disponibles.');
  await expect(detail.getByRole('button', { name: 'Editar' })).toHaveCount(0);
  await detail.getByRole('button', { name: 'Cerrar' }).click();
  await expect(cards(page).filter({ hasText: 'Gabriela Jiménez Soto' })).toContainText('Cancelada');
});

test('conflicto de versión: si otra persona cambió la cita, «Actualizar» y sin guardar igualmente', async ({ browser }) => {
  const day = plusDays(today(), 23);
  const a = await newPage(browser);
  const b = await newPage(browser);
  await signIn(a, 'recepcion.norte@example.test');
  await signIn(b, 'proveedora.nor1@example.test');
  await a.goto(`/app/NOR1/citas?fecha=${day}`);
  await createAppointment(a, { search: 'sofia navarro', patient: 'Sofía Navarro Morales', time: '15:00', provider: PROVIDER });
  await b.goto(`/app/NOR1/citas?fecha=${day}`);
  await cards(b).filter({ hasText: '3:00 – 3:20 p. m.' }).click();
  await cards(a).filter({ hasText: '3:00 – 3:20 p. m.' }).click();
  const detailA = a.getByRole('dialog', { name: 'Cita' });
  const detailB = b.getByRole('dialog', { name: 'Cita' });
  await expect(detailB).toContainText('Programada');
  // B abre Editar con la versión 1; A confirma (versión 2).
  await detailB.getByRole('button', { name: 'Editar' }).click();
  await detailA.getByRole('button', { name: 'Confirmar' }).click();
  await expect(a.getByText('Cita confirmada.', { exact: true })).toBeVisible();
  const edit = b.getByRole('dialog', { name: 'Editar cita' });
  await edit.getByLabel('Duración').fill('30');
  await edit.getByRole('button', { name: 'Guardar' }).click();
  const conflict = b.getByRole('dialog', { name: 'Actualizada por otro usuario' });
  await expect(conflict).toContainText('Otro usuario actualizó esta cita. Actualice para continuar.');
  await expect(conflict.getByRole('button')).toHaveText(['Actualizar']);
  await conflict.getByRole('button', { name: 'Actualizar' }).click();
  await expect(detailB).toContainText('Confirmada');
  await expect(detailB).toContainText('3:00 – 3:20 p. m. · 20 min');
});
