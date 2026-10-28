import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: {
    decorator: { legacy: true },
  },
  test: {
    globalSetup: ['./test/global-setup.ts'],
    include: ['test/**/*.test.ts'],
    hookTimeout: 180_000,
    testTimeout: 30_000,
    // Cada archivo levanta su propia API; la base de datos es compartida.
    fileParallelism: false,
  },
});
