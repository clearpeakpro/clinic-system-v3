import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// T-005: /dev/ui sin infracciones de axe (WCAG 2.2 A y AA, incluido el
// contraste) en claro y oscuro (la página muestra los dos temas a la vez), en
// escritorio, tableta y teléfono.

const VIEWPORTS = {
  escritorio: { width: 1440, height: 900 },
  tableta: { width: 1280, height: 800 },
  'tableta vertical': { width: 800, height: 1280 },
  telefono: { width: 390, height: 844 },
} as const;

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test(`/dev/ui sin infracciones de axe (${name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/dev/ui');
    await expect(page.getByRole('heading', { name: 'Componentes compartidos' })).toBeVisible();
    // Las animaciones (esqueleto, barra) no deben cambiar el resultado.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
    const summary = results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    }));
    expect(summary).toEqual([]);
    // Que el contraste se evaluó de verdad (no un «sin infracciones» vacío).
    expect(results.passes.map((p) => p.id)).toContain('color-contrast');
  });
}

test('los diálogos abiertos de verdad también pasan axe', async ({ page }) => {
  await page.goto('/dev/ui');
  await page.getByRole('button', { name: 'Abrir: confirmación con motivo' }).first().click();
  const dialog = page.getByRole('dialog', { name: '¿Anular este cargo?' }).last();
  await expect(dialog).toBeVisible();
  // Sin motivo no se confirma.
  await dialog.getByRole('button', { name: 'Anular cargo' }).click();
  await expect(dialog.getByText('Se requiere un motivo.')).toBeVisible();
  // Con el diálogo abierto, Radix oculta el resto de la página a los lectores.
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
