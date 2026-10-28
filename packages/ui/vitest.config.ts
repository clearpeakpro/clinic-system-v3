import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    // Los componentes se prueban en jsdom; los tokens y formatos, en Node.
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    // material-color-utilities 0.4.0 publica imports ESM sin extensión que Node
    // no resuelve: se procesa con Vite.
    server: { deps: { inline: ['@material/material-color-utilities'] } },
  },
});
