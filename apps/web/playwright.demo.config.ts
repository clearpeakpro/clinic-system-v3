import { defineConfig, devices } from '@playwright/test';

// Guion de la demo de la fase 1 (T-010, docs/DEMO-FASE-1.md). La base de datos
// se prepara con `pnpm demo:reset`, como la prepara la persona. Va después de
// la E2E de los flujos (`pnpm test:e2e`).
export default defineConfig({
  testDir: './e2e',
  testMatch: 'demo.spec.ts',
  globalSetup: './e2e/global-setup-demo.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-demo' }]] : 'list',
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
