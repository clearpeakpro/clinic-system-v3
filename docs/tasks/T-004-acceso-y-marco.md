# T-004 — Primera pantalla visible: acceso y marco

**Tamaño:** 3–4 días · **Depende de:** T-003 · **Pantallas:** S-GEN-01, 03, 06, 07, 08, 11, 12, 13, 16, 17, 20, 29

**Objetivo:** abrir la app en el navegador, iniciar sesión, pasar el MFA, elegir sede y ver el marco con la navegación según el rol.

## Incluye

- `apps/web`: React 19 + Vite + TanStack Router y Query + Tailwind 4 + shadcn/ui, configurado como PWA. El service worker solo guarda en caché los archivos estáticos.
- `packages/ui/src/tokens.css`: tokens extraídos de los HTML de Stitch (colores claro y oscuro, tipografía Inter y JetBrains Mono, radios, espaciado). Deben coincidir con el sistema de diseño del PRD de Stitch.
- Pantallas:
  - arranque neutro;
  - iniciar sesión;
  - código de MFA;
  - inscripción obligatoria en MFA con códigos de recuperación;
  - seleccionar sede;
  - marco (menú lateral en escritorio, riel en tableta, barra inferior en teléfono);
  - selector de sede en la cabecera;
  - menú de cuenta;
  - cerrar sesión;
  - aviso y cubierta por inactividad;
  - página no encontrada.
- Rutas `/app/<SEDE>/…` y `/admin/…`. El menú se arma con `permissions.ts`. El Panel queda como página vacía con su título.
- `pnpm dev` levanta Postgres, Mailpit, la API y la web. El README dice en qué dirección abrir la app y lista los usuarios de prueba.
- Pruebas E2E con Playwright:
  - inicio de sesión de Recepción;
  - Administrador sin MFA, que queda obligado a inscribirse;
  - usuario de dos organizaciones que cambia de organización y de sede;
  - cierre por inactividad con reloj simulado.

**No incluye:** las pantallas de Panel, Pacientes ni Administración (solo el menú que lleva a ellas).

**Terminada cuando:** tú puedes hacer todo el recorrido en tu navegador con los usuarios de prueba, y las pruebas E2E pasan en la CI. Esta es la primera demo para ti.
