import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    include: ['test/**/*.test.ts'],
    // Arrancar el contenedor puede tardar la primera vez (descarga de la imagen).
    hookTimeout: 180_000,
    testTimeout: 30_000,
    // La base de datos es compartida y varias pruebas escriben en la misma cadena
    // de auditoría de plataforma: los archivos van uno detrás de otro (como en apps/api).
    fileParallelism: false,
  },
});
