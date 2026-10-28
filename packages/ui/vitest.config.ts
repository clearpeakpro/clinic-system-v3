import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // material-color-utilities 0.4.0 publica imports ESM sin extensión que Node
    // no resuelve: se procesa con Vite.
    server: { deps: { inline: ['@material/material-color-utilities'] } },
  },
});
