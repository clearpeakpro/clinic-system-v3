import { defineConfig, devices } from '@playwright/test';

// Guion de la demo de la fase 3A (T-024, docs/DEMO-FASE-3A.md). Como los de
// las fases 1 y 2, con su propia base desechable preparada con `pnpm
// demo:reset`, que siembra las visitas con «Alerta» y «Crítico» a la hora del
// reinicio. Va después del de la fase 2 (`pnpm test:e2e`).
export default defineConfig({
  testDir: './e2e',
  testMatch: 'demo-fase-3a.spec.ts',
  globalSetup: './e2e/global-setup-demo.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 600_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-demo3a' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'es-US',
    timezoneId: 'America/Chicago',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'tableta', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
});
