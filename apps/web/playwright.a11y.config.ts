import { defineConfig, devices } from '@playwright/test';

// Accesibilidad de /dev/ui (T-005). /dev/ui solo existe en desarrollo, así que
// se prueba contra el servidor de desarrollo de Vite (sin API ni base de datos).
const PORT = 5174;

export default defineConfig({
  testDir: './e2e-a11y',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-a11y' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}`,
    locale: 'es-US',
    timezoneId: 'America/Chicago',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vite --host 127.0.0.1 --port ${String(PORT)} --strictPort`,
    url: `http://127.0.0.1:${String(PORT)}/dev/ui`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
