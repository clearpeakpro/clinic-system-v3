import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const API = process.env.API_ORIGIN ?? 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA (ADR 0014): el service worker solo precachea los archivos estáticos
    // de la compilación. Nunca guarda respuestas de la API ni datos de pacientes.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      manifest: {
        name: 'Clinic System',
        short_name: 'Clinic System',
        lang: 'es',
        display: 'standalone',
        theme_color: '#005c55',
        background_color: '#ebfdfa',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: API, changeOrigin: false } },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: { '/api': { target: API, changeOrigin: false } },
  },
  build: { sourcemap: true },
});
