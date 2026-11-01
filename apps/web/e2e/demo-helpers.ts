import { expect, type Browser, type Page } from '@playwright/test';
import { generate } from 'otplib';
import { E2E } from './global-setup.ts';

// Ayudantes comunes de los guiones de las demos (demo.spec.ts, T-010, y
// demo-fase-2.spec.ts, T-016): la «ventana normal» y la «ventana de incógnito»
// son dos contextos de navegador independientes, y el MFA se genera aquí en
// lugar de con un teléfono.

export async function newWindow(browser: Browser) {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', locale: 'es-US', timezoneId: 'America/Chicago' });
  return context.newPage();
}

export async function signIn(page: Page, email: string, password = E2E.password) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

export async function signOut(page: Page, everywhere = false) {
  const label = everywhere ? 'Cerrar sesión en todos los dispositivos' : 'Cerrar sesión';
  await page.getByRole('button', { name: 'Menú de cuenta' }).click();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** Códigos ya usados por secreto: un código no se repite dentro de su ventana de 30 s. */
const usedCodes = new Map<string, Set<string>>();

/** Un código TOTP que todavía no se usó (espera, si hace falta, al siguiente). */
export async function freshCode(secret: string): Promise<string> {
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
export async function enrollMfa(page: Page): Promise<string> {
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

export const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegación principal' }).first();
