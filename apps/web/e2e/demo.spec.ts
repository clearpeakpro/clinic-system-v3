import { expect, test, type Browser, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { generate } from 'otplib';
import { E2E } from './global-setup.ts';

// T-010: recorre el guion docs/DEMO-FASE-1.md, paso por paso y con los mismos
// usuarios. La base de datos se prepara con `pnpm demo:reset` (ver
// global-setup-demo.ts). La «ventana normal» y la «ventana de incógnito» son
// dos contextos de navegador independientes; el MFA se genera aquí en lugar
// de con un teléfono. Todo con datos ficticios.

const run = promisify(execFile);
const apiDir = fileURLToPath(new URL('../../api/', import.meta.url));
/** Con shell (Windows), los argumentos con espacios van entre comillas. */
const arg = (value: string) => (process.platform === 'win32' ? `"${value}"` : value);

const INVITED = { email: 'invitado.demo@example.test', name: 'Persona Invitada (ficticia)', password: 'una frase larga de la persona invitada' };

/** Ejecuta un comando de la API como lo haría la persona en la terminal. */
function command(script: string, args: string[], env: Record<string, string | undefined> = {}) {
  return run('pnpm', ['exec', 'tsx', `scripts/${script}.ts`, ...args], {
    cwd: apiDir,
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
}

async function newWindow(browser: Browser) {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', locale: 'es-US', timezoneId: 'America/Chicago' });
  return context.newPage();
}

async function signIn(page: Page, email: string, password = E2E.password) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

async function signOut(page: Page, everywhere = false) {
  const label = everywhere ? 'Cerrar sesión en todos los dispositivos' : 'Cerrar sesión';
  await page.getByRole('button', { name: 'Menú de cuenta' }).click();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** Códigos ya usados por secreto: un código no se repite dentro de su ventana de 30 s. */
const usedCodes = new Map<string, Set<string>>();

/** Un código TOTP que todavía no se usó (espera, si hace falta, al siguiente). */
async function freshCode(secret: string): Promise<string> {
  const used = usedCodes.get(secret) ?? new Set<string>();
  usedCodes.set(secret, used);
  for (;;) {
    const code = await generate({ secret });
    if (!used.has(code)) {
      used.add(code);
      return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/** Paso del MFA: en la demo, con el teléfono; aquí, con el mismo secreto. Devuelve el secreto. */
async function enrollMfa(page: Page): Promise<string> {
  await expect(page.getByRole('heading', { name: 'Configurar la verificación en dos pasos' })).toBeVisible();
  await expect(page.getByTestId('totp-secret')).toHaveText(/\w{4}/);
  const secret = (await page.getByTestId('totp-secret').innerText()).replace(/\s/g, '');
  await page.getByLabel('Código de verificación').fill(await freshCode(secret));
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('heading', { name: 'Guarde sus códigos de recuperación' })).toBeVisible();
  await expect(page.getByTestId('recovery-codes').getByRole('listitem')).toHaveCount(10);
  await page.getByText('Guardé estos códigos').click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  return secret;
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegación principal' }).first();
const live = (page: Page) => page.getByRole('banner').getByRole('status');
const row = (page: Page, text: string) => page.getByRole('row').filter({ hasText: text });
const card = (page: Page, code: string) => page.getByRole('list', { name: 'Sedes' }).getByRole('listitem').filter({ hasText: code });

// Un solo recorrido, como lo hace la persona: cada paso depende del anterior.
test.describe.configure({ mode: 'serial', retries: 0 });

test('guion de la demo de la fase 1 (docs/DEMO-FASE-1.md)', async ({ browser }) => {
  test.setTimeout(240_000);
  const normal = await newWindow(browser);
  const incognito = await newWindow(browser);

  await test.step('Paso 1: Recepción entra directo a su Panel', async () => {
    await signIn(normal, 'recepcion.norte@example.test');
    await expect(normal).toHaveURL(/\/app\/NOR1\/panel$/);
    await expect(normal.getByTestId('location-current')).toContainText('NOR1');
    await expect(normal.getByTestId('location-current')).toContainText('Norte Centro');
    await expect(nav(normal).getByRole('link')).toHaveText(['Panel', 'Pacientes', 'Citas', 'Caja', 'Reportes']);
    await expect(live(normal)).toHaveText(/En vivo/);
    await signOut(normal);
  });

  let ownerSecret = '';
  await test.step('Paso 2: la Propietaria configura el MFA y entra en NOR1', async () => {
    await signIn(normal, 'propietario.norte@example.test');
    ownerSecret = await enrollMfa(normal);
    // La ventana recuerda la última sede usada (NOR1, la de Recepción).
    await expect(normal).toHaveURL(/\/admin\/usuarios$/);
    await expect(normal.getByTestId('location-selector')).toContainText('NOR1');
    await expect(normal.getByRole('heading', { name: 'Usuarios', level: 1 })).toBeVisible();
    for (const name of ['Adriana Admin', 'Rosa Recepción', 'Nora Enfermería', 'Pablo Proveedor', 'Mario Dos Clínicas']) {
      await expect(row(normal, name)).toHaveCount(1);
    }
    for (const name of ['Sergio Admin', 'Raúl Recepción', 'Elena Enfermería', 'Sofía Proveedora']) {
      await expect(row(normal, name)).toHaveCount(0);
    }
  });

  let link = '';
  await test.step('Paso 3: invita a una persona; el enlace se ve en pantalla', async () => {
    await normal.getByRole('button', { name: 'Invitar usuario' }).click();
    const dialog = normal.getByRole('dialog', { name: 'Invitar usuario' });
    await dialog.getByLabel('Correo electrónico').fill(INVITED.email);
    await dialog.getByLabel('Nombre para mostrar').fill(INVITED.name);
    await dialog.getByRole('button', { name: 'Proveedor', exact: true }).click();
    await dialog.getByRole('button', { name: /\(NOR1\)/ }).click();
    await dialog.getByRole('button', { name: 'Crear invitación' }).click();
    const secret = normal.getByRole('dialog', { name: 'Invitación creada' });
    await expect(secret).toContainText('También se envía por correo');
    link = await secret.getByTestId('one-time-link').innerText();
    await secret.getByRole('button', { name: 'Cerrar' }).click();
    await expect(row(normal, INVITED.email)).toContainText('Pendiente');
  });

  await test.step('Paso 4: en incógnito, la persona acepta y entra', async () => {
    await incognito.goto(new URL(link).pathname);
    await incognito.getByLabel('Nombre para mostrar').fill(INVITED.name);
    await incognito.getByLabel('Contraseña', { exact: true }).fill(INVITED.password);
    await incognito.getByLabel('Confirmar contraseña').fill(INVITED.password);
    await incognito.getByRole('button', { name: 'Aceptar invitación' }).click();
    await expect(incognito).toHaveURL(/\/app\/NOR1\/panel$/);
    await expect(nav(incognito).getByRole('link')).toHaveText(['Panel', 'Pacientes', 'Citas', 'Cola de enfermería', 'Cola de proveedor', 'Cola de órdenes']);
    await expect(live(incognito)).toHaveText(/En vivo/);
  });

  await test.step('Paso 5: pnpm demo:aviso; la campana se actualiza sola', async () => {
    const bell = incognito.getByRole('button', { name: /^Notificaciones/ });
    await expect(bell).toHaveAccessibleName('Notificaciones');
    const env = JSON.parse(process.env.E2E_API_ENV ?? '{}') as Record<string, string>;
    const sent = await command('demo-aviso', [INVITED.email], env);
    expect(sent.stdout).toContain('Mire la campana');
    await expect(bell).toHaveAccessibleName('Notificaciones, 1 sin leer', { timeout: 15_000 });
    await bell.click();
    const panel = incognito.getByRole('dialog', { name: 'Notificaciones' });
    const item = panel.getByRole('button', { name: /Cita actualizada/ });
    await expect(item).toContainText(/Cita NOR1-C-\d{6} · Ahora mismo/);
    await item.click();
    await expect(bell).toHaveAccessibleName('Notificaciones');
    await bell.click();
    await panel.getByRole('button', { name: 'Borrar' }).click();
    await expect(panel.getByText('Está al día')).toBeVisible();
    await incognito.keyboard.press('Escape');
  });

  await test.step('Paso 6: al deshabilitarla, su ventana vuelve sola al inicio de sesión', async () => {
    await normal.getByRole('button', { name: 'Actualizar' }).click();
    const target = row(normal, INVITED.email);
    await expect(target).toContainText('Activo');
    await target.getByRole('button', { name: /Más acciones/ }).click();
    await normal.getByRole('menuitem', { name: 'Deshabilitar' }).click();
    const confirm = normal.getByRole('dialog', { name: `¿Deshabilitar a ${INVITED.name}?` });
    await confirm.getByLabel('Motivo').fill('Demo de la fase 1');
    await confirm.getByRole('button', { name: 'Deshabilitar' }).click();
    await expect(target).toContainText('Deshabilitado');
    // Sin tocar la ventana de incógnito.
    await expect(incognito).toHaveURL(/\/login/, { timeout: 10_000 });
    await expect(incognito.getByText('Su sesión terminó.')).toBeVisible();
    // Y ya no puede volver a entrar en Norte.
    await signIn(incognito, INVITED.email, INVITED.password);
    await expect(incognito).not.toHaveURL(/\/app\/NOR1/);
  });

  await test.step('Paso 7: Sedes: crea NOR3 y la desactiva', async () => {
    await nav(normal).getByRole('link', { name: 'Sedes' }).click();
    await expect(card(normal, 'NOR1')).toContainText('Seleccionada');
    await expect(card(normal, 'NOR2')).toBeVisible();
    await normal.getByRole('button', { name: 'Nueva sede' }).click();
    const dialog = normal.getByRole('dialog', { name: 'Nueva sede' });
    await dialog.getByLabel('Código').fill('NOR3');
    await dialog.getByLabel('Nombre', { exact: true }).fill('Norte Demo');
    await dialog.getByRole('button', { name: 'Crear' }).click();
    await expect(normal.getByText('Guardado.')).toBeVisible();
    await expect(card(normal, 'NOR3')).toContainText('Activo');
    await card(normal, 'NOR3').getByRole('button', { name: /Más acciones/ }).click();
    await normal.getByRole('menuitem', { name: 'Desactivar' }).click();
    await normal.getByRole('dialog', { name: '¿Desactivar Norte Demo?' }).getByRole('button', { name: 'Desactivar' }).click();
    await expect(card(normal, 'NOR3')).toContainText('Inactivo');
  });

  await test.step('Paso 8: en incógnito, la persona de las dos clínicas cambia de clínica', async () => {
    await signIn(incognito, 'multi@example.test');
    // La ventana recuerda NOR1, la sede de la persona anterior.
    await expect(incognito).toHaveURL(/\/app\/NOR1\/panel$/);
    await expect(nav(incognito).getByRole('link', { name: 'Caja' })).toBeVisible();
    await incognito.getByTestId('location-selector').click();
    await expect(incognito.getByRole('menuitem', { name: /NOR1.*Clínica Demo Norte/ })).toBeVisible();
    await expect(incognito.getByRole('menuitem', { name: /SUR1.*Clínica Demo Sur/ })).toBeVisible();
    await incognito.getByRole('menuitem', { name: /SUR1/ }).click();
    await expect(incognito).toHaveURL(/\/app\/SUR1\/panel$/);
    await expect(nav(incognito).getByRole('link', { name: 'Cola de enfermería' })).toBeVisible();
    await expect(nav(incognito).getByRole('link', { name: 'Caja' })).toHaveCount(0);
    await signOut(incognito);
  });

  await test.step('Paso 9: el Propietario de Sur no ve nada de Norte', async () => {
    await signIn(incognito, 'propietario.sur@example.test');
    await enrollMfa(incognito);
    // La ventana recuerda SUR1, la última sede de la persona anterior.
    await expect(incognito).toHaveURL(/\/admin\/usuarios$/);
    await expect(incognito.getByTestId('location-selector')).toContainText('SUR1');
    await expect(row(incognito, 'Sergio Admin')).toHaveCount(1);
    for (const name of ['Adriana Admin', 'Rosa Recepción', INVITED.name]) {
      await expect(row(incognito, name)).toHaveCount(0);
    }
    await incognito.goto('/app/NOR1/panel');
    await expect(incognito.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
  });

  await test.step('Paso 10: cerrar sesión en todos los dispositivos', async () => {
    // La misma Propietaria entra también en la ventana de incógnito, con el código de su teléfono.
    await incognito.getByRole('link', { name: 'Atrás' }).click();
    await expect(incognito).toHaveURL(/\/admin\/usuarios$/);
    await signOut(incognito);
    await signIn(incognito, 'propietario.norte@example.test');
    await expect(incognito.getByRole('heading', { name: 'Verificación en dos pasos' })).toBeVisible();
    await incognito.getByLabel('Código de verificación').fill(await freshCode(ownerSecret));
    // La ventana recuerda SUR1, que no es suya: elige la sede.
    await expect(incognito.getByRole('heading', { name: 'Seleccionar sede' })).toBeVisible();
    await incognito.getByRole('button', { name: /NOR1/ }).click();
    await expect(incognito).toHaveURL(/\/admin\/usuarios$/);
    await expect(live(incognito)).toHaveText(/En vivo/);

    // En la ventana normal: cierre voluntario, sin mensaje (S-GEN-17).
    await signOut(normal, true);
    await expect(normal.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(normal.getByText('Su sesión terminó.')).toHaveCount(0);
    // En la otra ventana, sin tocar nada: «Su sesión terminó.» (S-GEN-03, S-GEN-14).
    await expect(incognito).toHaveURL(/\/login/, { timeout: 10_000 });
    await expect(incognito.getByText('Su sesión terminó.')).toBeVisible();
    await expect(incognito.getByText('Inicie sesión de nuevo para continuar.')).toBeVisible();
  });

  await test.step('Paso opcional: el operador crea una clínica con pnpm org:create', async () => {
    const created = await command(
      'org-create',
      [
        '--organizacion', arg('Clínica Demo Este'),
        '--propietario-correo', 'propietaria.este@example.test',
        '--propietario-nombre', arg('Propietaria Este (ficticia)'),
        '--sede-codigo', 'EST1',
        '--sede-nombre', arg('Este Centro'),
        '--zona-horaria', 'America/Chicago',
      ],
      { DATABASE_OPERATOR_URL: process.env.E2E_OPERATOR_URL, BASE_URL: process.env.E2E_BASE_URL, OUTBOX_KEY: process.env.E2E_OUTBOX_KEY },
    );
    const invitation = /https?:\/\/\S+\/invitacion\/\S+/.exec(created.stdout)?.[0];
    expect(invitation).toBeDefined();
    const owner = await newWindow(browser);
    await owner.goto(new URL(invitation ?? '').pathname);
    await owner.getByLabel('Nombre para mostrar').fill('Propietaria Este (ficticia)');
    await owner.getByLabel('Contraseña', { exact: true }).fill('una frase larga de la propietaria');
    await owner.getByLabel('Confirmar contraseña').fill('una frase larga de la propietaria');
    await owner.getByRole('button', { name: 'Aceptar invitación' }).click();
    await enrollMfa(owner);
    await expect(owner).toHaveURL(/\/admin\/usuarios$/);
    await expect(owner.getByTestId('location-current')).toContainText('EST1');
  });
});
