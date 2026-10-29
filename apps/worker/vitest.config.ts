import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    include: ['test/**/*.test.ts'],
    hookTimeout: 180_000,
    testTimeout: 30_000,
    // Una base compartida: las pruebas que arrancan el worker no deben correr a la vez.
    fileParallelism: false,
  },
});
