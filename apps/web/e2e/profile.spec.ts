import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { generate } from 'otplib';
import { E2E } from './global-setup.ts';

// T-006b: Perfil (S-GEN-21 a 25) con usuarios ficticios de Sur, que ninguna
// otra prueba usa: Enfermería (MFA voluntario) y el Propietario (MFA obligatorio).

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const NEW_PASSWORD = 'otra frase larga y ficticia';

async function signIn(page: Page, email: string, password = E2E.password) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

async function openProfile(page: Page) {
  await page.getByRole('button', { name: 'Menú de cuenta' }).click();
  await page.getByRole('menuitem', { name: 'Perfil' }).click();
  await expect(page).toHaveURL(/\/app\/[A-Z0-9]+\/perfil$/);
  await expect(page.getByRole('heading', { name: 'Perfil', level: 1 })).toBeVisible();
}

const mfaCard = (page: Page) => page.getByRole('region', { name: 'Verificación en dos pasos' });

/** Lee la clave del QR, confirma con un código y devuelve la clave. */
async function enrollIn(page: Page) {
  await expect(page.getByTestId('totp-secret')).toHaveText(/\w{4}/);
  const secret = (await page.getByTestId('totp-secret').innerText()).replace(/\s/g, '');
  await page.getByLabel('Código de verificación').fill(await generate({ secret }));
  await page.getByRole('button', { name: 'Confirmar' }).click();
  return secret;
}

test('Enfermería configura, regenera y desactiva su MFA, y cambia su contraseña', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await signIn(page, 'enfermeria.sur@example.test');
  await expect(page).toHaveURL(/\/app\/SUR2\/panel$/);
  await openProfile(page);

  // Cuenta: solo lectura.
  const account = page.getByRole('region', { name: 'Cuenta' });
  await expect(account).toContainText('enfermeria.sur@example.test');
  await expect(account).toContainText('Enfermería');
  await expect(account).toContainText('SUR2');
  await expect(mfaCard(page)).toContainText('Desactivada');
  expect((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.map((v) => v.id)).toEqual([]);

  // S-GEN-23: contraseña → QR y código → códigos de recuperación.
  await mfaCard(page).getByRole('button', { name: 'Configurar' }).click();
  const setup = page.getByRole('dialog', { name: 'Configurar la verificación en dos pasos' });
  await setup.getByLabel('Contraseña actual').fill(E2E.password);
  await setup.getByRole('button', { name: 'Continuar' }).click();
  expect((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.map((v) => v.id)).toEqual([]);
  const secret = await enrollIn(page);
  const codes = page.getByRole('dialog', { name: 'Guarde sus códigos de recuperación' });
  await expect(codes.getByTestId('recovery-codes').getByRole('listitem')).toHaveCount(10);
  await codes.getByText('Guardé estos códigos').click();
  await codes.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('La verificación en dos pasos está activada.')).toBeVisible();
  await expect(mfaCard(page)).toContainText('Activada');
  await expect(mfaCard(page)).toContainText('Le quedan 10 códigos de recuperación.');

  // S-GEN-24 → S-GEN-25: un código erróneo deja el diálogo abierto.
  await mfaCard(page).getByRole('button', { name: 'Nuevos códigos de recuperación' }).click();
  const regenerate = page.getByRole('dialog', { name: '¿Generar nuevos códigos de recuperación?' });
  await regenerate.getByLabel('Código de verificación').fill('000000');
  await regenerate.getByRole('button', { name: 'Nuevos códigos de recuperación' }).click();
  await expect(regenerate).toContainText('Ese código no es válido.');
  await regenerate.getByLabel('Código de verificación').fill(await generate({ secret }));
  await regenerate.getByRole('button', { name: 'Nuevos códigos de recuperación' }).click();
  const fresh = page.getByRole('dialog', { name: 'Guarde sus códigos de recuperación' });
  await expect(fresh.getByTestId('recovery-codes').getByRole('listitem')).toHaveCount(10);
  await fresh.getByText('Guardé estos códigos').click();
  await fresh.getByRole('button', { name: 'Continuar' }).click();
  await expect(fresh).toHaveCount(0);

  // Desactivar (variante destructiva).
  await mfaCard(page).getByRole('button', { name: 'Desactivar' }).click();
  const disable = page.getByRole('dialog', { name: '¿Desactivar la verificación en dos pasos?' });
  await disable.getByLabel('Código de verificación').fill(await generate({ secret }));
  await disable.getByRole('button', { name: 'Desactivar' }).click();
  await expect(page.getByText('La verificación en dos pasos está desactivada.')).toBeVisible();
  await expect(mfaCard(page)).toContainText('Desactivada');

  // Contraseña: la otra sesión se cierra; esta sigue.
  const other = await browser.newPage({ baseURL: 'http://127.0.0.1:4173' });
  await signIn(other, 'enfermeria.sur@example.test');
  await expect(other).toHaveURL(/\/app\/SUR2\/panel$/);
  const password = page.getByRole('region', { name: 'Contraseña' });
  await password.getByLabel('Contraseña actual').fill('Equivocada-12345');
  await password.getByLabel('Nueva contraseña', { exact: true }).fill(NEW_PASSWORD);
  await password.getByLabel('Confirmar nueva contraseña').fill(NEW_PASSWORD);
  await password.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(password).toContainText('La contraseña actual no es correcta.');
  await password.getByLabel('Contraseña actual').fill(E2E.password);
  await password.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByText('Contraseña cambiada. Se cerró su sesión en los demás dispositivos.')).toBeVisible();
  await other.reload();
  await expect(other).toHaveURL(/\/login/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Perfil', level: 1 })).toBeVisible();
  await signIn(other, 'enfermeria.sur@example.test', NEW_PASSWORD);
  await expect(other).toHaveURL(/\/app\/SUR2\/panel$/);
});

test('el Propietario ve su MFA como obligatorio y sin «Desactivar»', async ({ page }) => {
  await signIn(page, 'propietario.sur@example.test');
  await expect(page.getByRole('heading', { name: 'Configurar la verificación en dos pasos' })).toBeVisible();
  await enrollIn(page);
  await page.getByText('Guardé estos códigos').click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: /SUR1/ }).click();
  await openProfile(page);
  await expect(mfaCard(page)).toContainText('Activada');
  await expect(mfaCard(page)).toContainText('Obligatoria para su rol');
  await expect(mfaCard(page).getByRole('button', { name: 'Nuevos códigos de recuperación' })).toBeVisible();
  await expect(mfaCard(page).getByRole('button', { name: 'Desactivar' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Cuenta' })).toContainText('Propietario');
});
