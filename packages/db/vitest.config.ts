import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    include: ['test/**/*.test.ts'],
    // Arrancar el contenedor puede tardar la primera vez (descarga de la imagen).
    hookTimeout: 180_000,
    testTimeout: 30_000,
  },
});
