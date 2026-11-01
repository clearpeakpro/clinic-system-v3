import { defineConfig, devices } from '@playwright/test';

// Guion de la demo de la fase 2 (T-016, docs/DEMO-FASE-2.md). Como el de la
// fase 1, con su propia base desechable preparada con `pnpm demo:reset`: el
// guion de la fase 1 cambia los datos (MFA, usuarios, sedes). Va después del
// de la fase 1 (`pnpm test:e2e`).
export default defineConfig({
  testDir: './e2e',
  testMatch: 'demo-fase-2.spec.ts',
  globalSetup: './e2e/global-setup-demo.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-demo2' }]] : 'list',
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
