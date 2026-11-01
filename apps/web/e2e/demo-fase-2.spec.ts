import { expect, test, type Page } from '@playwright/test';
import { enrollMfa, nav, newWindow, signIn, signOut } from './demo-helpers.ts';

// T-016: recorre el guion docs/DEMO-FASE-2.md, paso por paso, con los mismos
// usuarios y textos. La base de datos se prepara con `pnpm demo:reset` (ver
// global-setup-demo.ts), con su propia base desechable: la demo de la fase 1
// cambia los datos (MFA, usuarios, sedes). Todo con datos ficticios.
//
// Para no depender de la hora a la que corre: la cita de hoy va a la próxima
// hora en punto de la sede (o a las 11:30 p. m. después de las 11:00 p. m.:
// hoy se puede agendar a cualquier hora); el solapamiento es con la cita
// sembrada de mañana a las 9:00 con Diana, y «No se presentó» usa la cita de
// ayer a las 4:00 p. m. que la semilla deja sin marcar.

const TZ = 'America/Chicago';
const PROVIDER = 'Diana Doctora (ficticia)';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const plusDays = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** La próxima hora en punto en la sede, como `HH:MM`; después de las 11:00 p. m., 23:30. */
function nextWholeHour(): string {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return hour >= 23 ? '23:30' : `${String(hour + 1).padStart(2, '0')}:00`;
}

const results = (page: Page) => page.getByRole('table', { name: 'Resultados de la búsqueda de pacientes' });
const cards = (page: Page) => page.getByTestId('appointment-card');
const row = (page: Page, text: string) => page.getByRole('row').filter({ hasText: text });
const bell = (page: Page) => page.getByRole('button', { name: /^Notificaciones/ });
const editDialog = (page: Page) => page.getByRole('dialog', { name: 'Editar paciente' });
const detail = (page: Page) => page.getByRole('dialog', { name: 'Cita' });

async function unread(page: Page): Promise<number> {
  return Number(/(\d+) sin leer/.exec((await bell(page).getAttribute('aria-label')) ?? '')?.[1] ?? '0');
}

async function search(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Buscar paciente' }).fill(text);
  await page.getByRole('textbox', { name: 'Buscar paciente' }).press('Enter');
}

async function openProfile(page: Page, query: string, name: string) {
  await nav(page).getByRole('link', { name: 'Pacientes' }).click();
  await search(page, query);
  await page.getByRole('button', { name: `Ver perfil de ${name}` }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

// Un solo recorrido, como lo hace la persona: cada paso depende del anterior.
test.describe.configure({ mode: 'serial', retries: 0 });

test('guion de la demo de la fase 2 (docs/DEMO-FASE-2.md)', async ({ browser }) => {
  test.setTimeout(360_000);
  const normal = await newWindow(browser);
  const incognito = await newWindow(browser);
  const tomorrow = plusDays(today(), 1);

  // ── Bloque A. La Propietaria configura la clínica ──

  await test.step('Paso 1: la Propietaria activa el MFA y no ve Pacientes ni Citas', async () => {
    await signIn(normal, 'propietario.norte@example.test');
    await enrollMfa(normal);
    // En una ventana nueva no hay sede recordada: la elige.
    const chooser = normal.getByRole('heading', { name: 'Seleccionar sede' });
    const users = normal.getByRole('heading', { name: 'Usuarios', level: 1 });
    await expect(chooser.or(users)).toBeVisible();
    if (await chooser.isVisible()) await normal.getByRole('button', { name: /NOR1/ }).click();
    await expect(normal).toHaveURL(/\/admin\/usuarios$/);
    await expect(nav(normal).getByRole('link', { name: 'Usuarios' })).toBeVisible();
    await expect(nav(normal).getByRole('link', { name: 'Pacientes' })).toHaveCount(0);
    await expect(nav(normal).getByRole('link', { name: 'Citas' })).toHaveCount(0);
  });

  const procedure = 'Inyección de demostración';
  await test.step('Paso 2: un procedimiento con precio general y precio propio en NOR2', async () => {
    await nav(normal).getByRole('link', { name: 'Catálogos' }).click();
    await normal.getByRole('navigation', { name: 'Catálogos' }).getByRole('link', { name: /Procedimientos/ }).click();
    await expect(normal.getByRole('columnheader', { name: 'Precio en NOR1' })).toBeVisible();
    await expect(row(normal, 'INJ-B12')).toContainText('$20.00');
    await expect(row(normal, 'INJ-B12')).toContainText('Usa el precio general');

    await normal.getByRole('button', { name: 'Nuevo procedimiento' }).click();
    const form = normal.getByRole('dialog', { name: 'Nuevo procedimiento' });
    await form.getByLabel('Código').fill('INJ-DEMO');
    await form.getByLabel('Nombre', { exact: true }).fill(procedure);
    await form.getByLabel('Precio general', { exact: true }).fill('25');
    await form.getByRole('button', { name: 'Crear' }).click();
    await expect(normal.getByText('Guardado.')).toBeVisible();
    await expect(row(normal, 'INJ-DEMO')).toContainText('$25.00');
    await expect(row(normal, 'INJ-DEMO')).toContainText('Usa el precio general');

    await normal.getByLabel('Sede de los precios').selectOption({ label: 'NOR2 · Norte Oeste' });
    await expect(normal.getByRole('columnheader', { name: 'Precio en NOR2' })).toBeVisible();
    await expect(row(normal, 'INJ-B12')).toContainText('$22.00');
    await row(normal, 'INJ-DEMO').getByRole('button', { name: `Editar ${procedure}` }).click();
    const edit = normal.getByRole('dialog', { name: 'Editar procedimiento' });
    await edit.getByLabel('Precio en Norte Oeste', { exact: true }).fill('27');
    await edit.getByRole('button', { name: 'Guardar' }).click();
    await expect(edit).toHaveCount(0);
    await expect(row(normal, 'INJ-DEMO')).toContainText('$27.00');
    await expect(row(normal, 'INJ-DEMO')).not.toContainText('Usa el precio general');
  });

  await test.step('Paso 3: un cambio del precio general desde mañana; NOR2 vuelve al general', async () => {
    await normal.getByLabel('Sede de los precios').selectOption({ label: 'NOR1 · Norte Centro' });
    await row(normal, 'INJ-DEMO').getByRole('button', { name: `Editar ${procedure}` }).click();
    const change = normal.getByRole('dialog', { name: 'Editar procedimiento' });
    const general = change.getByRole('group', { name: 'Precio general' });
    await general.getByLabel('Precio general (opcional)').fill('30');
    await general.getByLabel('Vigente desde').fill(tomorrow);
    await change.getByRole('button', { name: 'Guardar' }).click();
    await expect(change).toHaveCount(0);
    await expect(row(normal, 'INJ-DEMO')).toContainText('$25.00');
    await expect(row(normal, 'INJ-DEMO')).toContainText(/Desde \d{1,2} [a-z]+: \$30\.00/);

    await normal.getByLabel('Sede de los precios').selectOption({ label: 'NOR2 · Norte Oeste' });
    await row(normal, 'INJ-DEMO').getByRole('button', { name: `Volver al precio general en NOR2: ${procedure}` }).click();
    const revert = normal.getByRole('dialog', { name: '¿Volver al precio general en Norte Oeste?' });
    await expect(revert.getByLabel('Vigente desde')).toHaveValue(today());
    await revert.getByRole('button', { name: 'Volver al precio general' }).click();
    await expect(revert).toHaveCount(0);
    await expect(row(normal, 'INJ-DEMO')).toContainText('$25.00');
    await expect(row(normal, 'INJ-DEMO')).toContainText('Usa el precio general');
  });

  await test.step('Paso 4: laboratorios y costos', async () => {
    const tabs = normal.getByRole('navigation', { name: 'Catálogos' });
    await tabs.getByRole('link', { name: /Proveedores de laboratorio/ }).click();
    for (const [name, preference] of [['LabCorp', '1'], ['Quest Diagnostics', '2'], ['CPL', '3']] as const) {
      await expect(row(normal, name)).toContainText('Activo');
      await expect(row(normal, name)).toContainText(preference);
    }
    await normal.getByRole('button', { name: 'Nuevo laboratorio' }).click();
    const newLab = normal.getByRole('dialog', { name: 'Nuevo laboratorio' });
    await newLab.getByLabel('Nombre').fill('Laboratorio Demo Norte');
    await newLab.getByLabel('Orden de preferencia').fill('4');
    await newLab.getByRole('button', { name: 'Crear' }).click();
    await expect(normal.getByText('Guardado.').first()).toBeVisible();
    await expect(row(normal, 'Laboratorio Demo Norte')).toContainText('Activo');

    await tabs.getByRole('link', { name: /Pruebas de laboratorio/ }).click();
    await expect(row(normal, 'LAB-STREP')).toContainText('Sin laboratorio asignado');
    await row(normal, 'LAB-STREP').getByRole('button', { name: 'Editar Prueba rápida de estreptococo' }).click();
    const strep = normal.getByRole('dialog', { name: 'Editar prueba de laboratorio' });
    const labs = strep.getByRole('group', { name: 'Laboratorios que la realizan' });
    await labs.getByRole('checkbox', { name: 'Laboratorio Demo Norte' }).click();
    await labs.getByLabel('Costo para la clínica en Laboratorio Demo Norte').fill('8');
    await strep.getByRole('button', { name: 'Guardar' }).click();
    await expect(strep).toHaveCount(0);
    await expect(row(normal, 'LAB-STREP')).not.toContainText('Sin laboratorio asignado');

    await row(normal, 'LAB-A1C').getByRole('button', { name: 'Editar Hemoglobina A1c' }).click();
    const a1c = normal.getByRole('dialog', { name: 'Editar prueba de laboratorio' });
    const a1cLabs = a1c.getByRole('group', { name: 'Laboratorios que la realizan' });
    for (const name of ['LabCorp', 'Quest Diagnostics', 'CPL']) await expect(a1cLabs.getByRole('checkbox', { name })).toBeChecked();
    await expect(a1cLabs.getByLabel('Costo para la clínica en CPL')).toHaveValue('9.00');
    await a1c.getByRole('button', { name: 'Cancelar' }).click();
    await expect(a1c).toHaveCount(0);
  });

  await test.step('Paso 5: la Propietaria se asigna Recepción en NOR1 con motivo', async () => {
    await nav(normal).getByRole('link', { name: 'Usuarios' }).click();
    await row(normal, 'propietario.norte@example.test').getByRole('button', { name: /Más acciones/ }).click();
    await normal.getByRole('menuitem', { name: 'Mis roles clínicos' }).click();
    const roles = normal.getByRole('dialog', { name: 'Mis roles clínicos' });
    await expect(roles.getByRole('checkbox', { name: 'Administrador' })).toHaveCount(0);
    await roles.getByRole('checkbox', { name: 'Recepción en NOR1' }).click();
    await roles.getByRole('button', { name: 'Guardar' }).click();
    await expect(roles.getByText('Se requiere un motivo.')).toBeVisible();
    await roles.getByLabel('Motivo del cambio').fill('Cubre la recepción esta semana');
    await roles.getByRole('button', { name: 'Guardar' }).click();
    await expect(roles).toHaveCount(0);
    await expect(row(normal, 'propietario.norte@example.test')).toContainText('Recepción');
    await expect(nav(normal).getByRole('link', { name: 'Pacientes' })).toBeVisible();
    await expect(nav(normal).getByRole('link', { name: 'Citas' })).toBeVisible();
  });

  await test.step('Paso 6: corrige una fecha de nacimiento con motivo', async () => {
    await openProfile(normal, 'paula romero', 'Paula Romero Aguilar');
    await expect(normal.getByText('9 sept 1991 (')).toBeVisible();
    await normal.getByRole('button', { name: 'Editar' }).click();
    const dialog = editDialog(normal);
    await dialog.getByLabel('Fecha de nacimiento').fill('1991-09-19');
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog.getByText('Se requiere un motivo.')).toBeVisible();
    await dialog.getByLabel('Motivo del cambio de fecha').fill('Error de captura en el alta');
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(normal.getByText('Paciente actualizado.', { exact: true })).toBeVisible();
    await expect(normal.getByText('19 sept 1991 (')).toBeVisible();
    await signOut(normal);
  });

  // ── Bloque B. Recepción busca y da de alta pacientes ──

  await test.step('Paso 7: búsqueda con y sin tildes, por fecha MMDDAAAA y por teléfono', async () => {
    await signIn(normal, 'recepcion.norte@example.test');
    await expect(normal).toHaveURL(/\/app\/NOR1\/panel$/);
    await nav(normal).getByRole('link', { name: 'Pacientes' }).click();
    for (const text of ['maria lop', 'MARÍA', 'Lopez']) {
      await search(normal, text);
      await expect(results(normal), text).toContainText('María López García');
    }
    await search(normal, '02031985');
    await expect(normal.getByText('Mostrando 2 de 2 coincidencias')).toBeVisible();
    await expect(results(normal)).toContainText('María López García');
    await expect(results(normal)).toContainText('Maria Lopez');
    await search(normal, '02301985');
    await expect(normal.getByText('Fecha no válida (use MMDDAAAA)')).toBeVisible();
    await search(normal, '8175550105');
    await expect(results(normal)).toContainText('Lucía Hernández Díaz');
    await expect(results(normal)).toContainText('Mateo Hernández Díaz');
  });

  await test.step('Paso 8: la búsqueda de la cabecera, también por código', async () => {
    const field = normal.getByRole('combobox', { name: 'Buscar pacientes' });
    const options = normal.getByRole('listbox', { name: 'Resultados de la búsqueda de pacientes' }).getByRole('option');
    await field.fill('valentina');
    await field.press('Enter');
    await expect(options.filter({ hasText: 'Valentina Castillo Ríos' })).toContainText(/P-\d{6}.*1 dic 1999 · \d+ años/);
    await expect(options.last()).toContainText('Ver todos los resultados');
    await options.filter({ hasText: 'Valentina Castillo Ríos' }).click();
    await expect(normal.getByRole('heading', { name: 'Valentina Castillo Ríos', level: 1 })).toBeVisible();
    await expect(field).toHaveValue('');
    await field.fill('P-000002');
    await field.press('Enter');
    await expect(normal.getByRole('heading', { name: 'José Ramírez Santos', level: 1 })).toBeVisible();
  });

  await test.step('Paso 9: un posible duplicado; «Abrir existente»', async () => {
    await nav(normal).getByRole('link', { name: 'Pacientes' }).click();
    await normal.getByRole('button', { name: 'Crear paciente' }).first().click();
    const dialog = normal.getByRole('dialog', { name: 'Nuevo paciente' });
    await dialog.getByLabel('Nombre', { exact: true }).fill('Maria');
    await dialog.getByLabel('Apellido').fill('Lopez Garcia');
    await dialog.getByLabel('Fecha de nacimiento').fill('1985-02-03');
    await dialog.getByRole('button', { name: 'Crear' }).click();
    const notice = dialog.getByRole('region', { name: 'Posible paciente existente' });
    await expect(notice).toContainText('María López García');
    await expect(notice).toContainText('3 feb 1985 · Expediente P-');
    await expect(notice.getByRole('button', { name: 'Crear de todos modos' })).toBeVisible();
    await notice.getByRole('button', { name: /Abrir existente: María López García/ }).click();
    await expect(normal.getByRole('heading', { name: 'María López García', level: 1 })).toBeVisible();
  });

  await test.step('Paso 10: un teléfono compartido; «Volver y corregir» y «Crear de todos modos»', async () => {
    await normal.getByRole('link', { name: 'Volver a Pacientes' }).click();
    await normal.getByRole('button', { name: 'Crear paciente' }).first().click();
    const dialog = normal.getByRole('dialog', { name: 'Nuevo paciente' });
    await dialog.getByLabel('Nombre', { exact: true }).fill('Sofía');
    await dialog.getByLabel('Apellido').fill('Hernández Díaz');
    await dialog.getByLabel('Fecha de nacimiento').fill('2015-07-07');
    await dialog.getByLabel('Teléfono de contacto').fill('8175550105');
    await dialog.getByRole('button', { name: 'Crear' }).click();
    const phoneNotice = normal.getByRole('dialog', { name: 'Este teléfono ya está registrado en otro paciente' });
    await expect(phoneNotice).toContainText('Lucía Hernández Díaz');
    await expect(phoneNotice).toContainText('Mateo Hernández Díaz');
    await phoneNotice.getByRole('button', { name: 'Volver y corregir' }).click();
    await expect(phoneNotice).toHaveCount(0);
    await expect(dialog.getByLabel('Teléfono de contacto')).toBeFocused();
    await expect(dialog.getByLabel('Nombre', { exact: true })).toHaveValue('Sofía');
    await dialog.getByRole('button', { name: 'Crear' }).click();
    await phoneNotice.getByRole('button', { name: 'Crear de todos modos' }).click();
    await expect(normal.getByText('Paciente creado.', { exact: true })).toBeVisible();
    await expect(normal.getByRole('heading', { name: 'Sofía Hernández Díaz', level: 1 })).toBeVisible();
  });

  // ── Bloque C. Dos personas editan al mismo paciente ──

  const patient = 'Héctor Medina Salas';
  await test.step('Paso 11: el conflicto de versión, con «Actualizar» y sin guardar igualmente', async () => {
    await signIn(incognito, 'proveedora.nor1@example.test');
    await expect(incognito).toHaveURL(/\/app\/NOR1\/panel$/);
    await openProfile(incognito, 'hector medina', patient);
    await incognito.getByRole('button', { name: 'Editar' }).click();
    await expect(editDialog(incognito).getByText('Su rol solo puede actualizar el teléfono.')).toBeVisible();

    await openProfile(normal, 'hector medina', patient);
    await normal.getByRole('button', { name: 'Editar' }).click();
    await expect(editDialog(normal).getByLabel('Fecha de nacimiento')).toBeDisabled();
    await editDialog(normal).getByLabel('Teléfono').fill('2145550163');
    await editDialog(normal).getByRole('button', { name: 'Guardar' }).click();
    await expect(normal.getByText('Paciente actualizado.', { exact: true })).toBeVisible();
    await expect(normal.getByText('(214) 555-0163').first()).toBeVisible();

    await editDialog(incognito).getByLabel('Teléfono').fill('2145550164');
    await editDialog(incognito).getByRole('button', { name: 'Guardar' }).click();
    const conflict = incognito.getByRole('dialog', { name: 'Actualizado por otro usuario' });
    await expect(conflict).toContainText('Otro usuario actualizó este paciente. Actualice el registro para continuar.');
    await expect(conflict.getByRole('button')).toHaveText(['Actualizar']);
    await conflict.getByRole('button', { name: 'Actualizar' }).click();
    await expect(incognito.getByText('(214) 555-0163').first()).toBeVisible();
  });

  // ── Bloque D. La agenda, sus acciones y los avisos en vivo ──

  await test.step('Paso 12: una cita nueva llega sola a la proveedora', async () => {
    await nav(incognito).getByRole('link', { name: 'Panel' }).click();
    const subtitle = incognito.getByTestId('panel-subtitle');
    await expect(subtitle).toHaveText('Norte Centro · 7 citas hoy');
    const before = await unread(incognito);

    await normal.getByRole('button', { name: 'Nueva cita' }).click();
    const form = normal.getByRole('dialog', { name: 'Nueva cita' });
    await expect(form).toContainText(patient);
    await form.getByLabel('Tipo de cita').selectOption({ label: 'Consulta general' });
    await expect(form.getByLabel('Duración')).toHaveValue('20');
    await expect(form.getByLabel('Fecha')).toHaveValue(today());
    await form.getByLabel('Hora').fill(nextWholeHour());
    await form.getByLabel('Proveedor').selectOption({ label: PROVIDER });
    await form.getByRole('button', { name: 'Crear cita' }).click();
    await expect(form).toHaveCount(0);
    await expect(normal.getByText(/^Cita A-\d{6} creada\./)).toBeVisible();

    await expect(subtitle).toHaveText('Norte Centro · 8 citas hoy', { timeout: 15_000 });
    await expect(bell(incognito)).toHaveAccessibleName(`Notificaciones, ${String(before + 1)} sin leer`, { timeout: 15_000 });
    await bell(incognito).click();
    const panel = incognito.getByRole('dialog', { name: 'Notificaciones' });
    const notice = panel.getByRole('button', { name: /Cita asignada a usted/ }).first();
    await expect(notice).toContainText(/Cita NOR1-A-\d{6} · /);
    await expect(panel).not.toContainText('Héctor');
    await notice.click();
    await expect(incognito).toHaveURL(new RegExp(`/app/NOR1/citas\\?fecha=${today()}&cita=`));
    await expect(detail(incognito)).toContainText(patient);
    await expect(detail(incognito)).toContainText('Programada');
    await detail(incognito).getByRole('button', { name: 'Cerrar' }).click();
  });

  await test.step('Paso 13: confirmar; «Registrar llegada» deshabilitado hasta la fase 3', async () => {
    const before = await unread(incognito);
    await nav(normal).getByRole('link', { name: 'Citas' }).click();
    await cards(normal).filter({ hasText: patient }).click();
    const check = detail(normal).getByRole('button', { name: 'Registrar llegada' });
    await expect(check).toBeDisabled();
    await expect(detail(normal)).toContainText('Llega en la fase 3');
    await detail(normal).getByRole('button', { name: 'Confirmar' }).click();
    await expect(normal.getByText('Cita confirmada.', { exact: true })).toBeVisible();
    await expect(detail(normal)).toContainText('Estado: Confirmada');
    await expect(cards(incognito).filter({ hasText: patient })).toContainText('Confirmada', { timeout: 15_000 });
    await expect(bell(incognito)).toHaveAccessibleName(`Notificaciones, ${String(before + 1)} sin leer`, { timeout: 15_000 });
  });

  await test.step('Paso 14: reprogramar encima de otra cita avisa del solapamiento sin bloquear', async () => {
    const before = await unread(incognito);
    await detail(normal).getByRole('button', { name: 'Reprogramar' }).click();
    const reschedule = normal.getByRole('dialog', { name: 'Reprogramar cita' });
    await reschedule.getByLabel('Fecha').fill(tomorrow);
    await reschedule.getByLabel('Hora').fill('09:00');
    await expect(reschedule.getByRole('status').filter({ hasText: `${PROVIDER} ya tiene una cita que se solapa a las 9:00 a. m.` })).toBeVisible();
    await reschedule.getByRole('button', { name: 'Reprogramar' }).click();
    await expect(normal.getByText('Cita reprogramada. El proveedor ya tiene una cita en ese horario.', { exact: true })).toBeVisible();

    await expect(cards(incognito).filter({ hasText: patient })).toHaveCount(0, { timeout: 15_000 });
    // S-GEN-15: el aviso sin leer de la misma cita se reemplaza; el número no sube.
    await bell(incognito).click();
    const updated = incognito.getByRole('dialog', { name: 'Notificaciones' }).getByRole('button', { name: /Cita actualizada/ });
    await expect(updated).toHaveCount(1);
    await expect(updated).toContainText(', 9:00 a. m.', { timeout: 15_000 });
    await expect(bell(incognito)).toHaveAccessibleName(`Notificaciones, ${String(before)} sin leer`);
    await updated.click();
    await expect(incognito).toHaveURL(new RegExp(`/app/NOR1/citas\\?fecha=${tomorrow}&cita=`));
    await expect(detail(incognito)).toContainText(patient);
    await expect(detail(incognito)).toContainText('9:00 – 9:20 a. m.');
    await detail(incognito).getByRole('button', { name: 'Cerrar' }).click();
  });

  await test.step('Paso 15: cancelar exige un motivo; «Volver» no cambia nada', async () => {
    await detail(normal).getByRole('button', { name: 'Cerrar' }).click();
    await normal.getByRole('button', { name: 'Día siguiente' }).click();
    await expect(normal).toHaveURL(new RegExp(`fecha=${tomorrow}$`));
    const juan = cards(normal).filter({ hasText: '10:30 –' });
    await expect(juan).toContainText('Juan Pérez Gómez');
    await juan.click();
    await detail(normal).getByRole('button', { name: 'Cancelar cita' }).click();
    const cancel = normal.getByRole('dialog', { name: '¿Cancelar esta cita?' });
    await cancel.getByRole('button', { name: 'Cancelar cita' }).click();
    await expect(cancel.getByText('Se requiere un motivo.')).toBeVisible();
    await cancel.getByRole('button', { name: 'Volver' }).click();
    await expect(detail(normal)).toContainText('Programada');
    await detail(normal).getByRole('button', { name: 'Cancelar cita' }).click();
    await cancel.getByLabel('Motivo').fill('A petición del paciente');
    await cancel.getByRole('button', { name: 'Cancelar cita' }).click();
    await expect(normal.getByText('Cita cancelada.', { exact: true })).toBeVisible();
    await detail(normal).getByRole('button', { name: 'Cerrar' }).click();
    await expect(juan).toContainText('Cancelada');
    await expect(juan.locator('.line-through')).toHaveCount(1);
    await expect(cards(incognito).filter({ hasText: '10:30 –' })).toContainText('Cancelada', { timeout: 15_000 });
  });

  await test.step('Paso 16: marcar «No se presentó» en la cita de ayer', async () => {
    await normal.getByRole('button', { name: 'Hoy' }).click();
    await normal.getByRole('button', { name: 'Día anterior' }).click();
    await expect(normal).toHaveURL(new RegExp(`fecha=${plusDays(today(), -1)}$`));
    const natalia = cards(normal).filter({ hasText: '4:00 – 4:20 p. m.' });
    await expect(natalia).toContainText('Natalia Vargas Rojas');
    await expect(natalia).toContainText('Programada');
    await natalia.click();
    await detail(normal).getByRole('button', { name: 'Marcar no presentado' }).click();
    const confirm = normal.getByRole('dialog', { name: '¿Marcar como no presentado?' });
    await confirm.getByRole('button', { name: 'Marcar no presentado' }).click();
    await expect(normal.getByText('Marcada como no presentado.', { exact: true })).toBeVisible();
    await expect(detail(normal)).toContainText('No se presentó');
    await detail(normal).getByRole('button', { name: 'Cerrar' }).click();
    await signOut(normal);
  });

  // ── Bloque E. Sur no ve nada de Norte ──

  await test.step('Paso 17: Recepción Sur no encuentra pacientes ni citas de Norte', async () => {
    await signOut(incognito);
    await signIn(incognito, 'recepcion.sur@example.test');
    await expect(incognito).toHaveURL(/\/app\/SUR1\/panel$/);
    await nav(incognito).getByRole('link', { name: 'Pacientes' }).click();
    for (const text of ['Lopez', '02031985']) {
      await search(incognito, text);
      await expect(incognito.getByText('No se encontraron pacientes'), text).toBeVisible();
    }
    await nav(incognito).getByRole('link', { name: 'Citas' }).click();
    await expect(cards(incognito).filter({ hasText: 'Diego Torres Campos' }).first()).toBeVisible();
    await expect(cards(incognito).filter({ hasText: patient })).toHaveCount(0);
    await incognito.goto('/app/NOR1/citas');
    await expect(incognito.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
  });
});
