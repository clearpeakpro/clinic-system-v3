# CLAUDE.md — Clinic System v3

**Responde siempre en español.**

Sistema SaaS multi-tenant de flujo de pacientes para clínicas (recepción, kiosco, enfermería, proveedor, órdenes, caja, reportes, administración). Una sola instalación en AWS sirve a todas las clínicas cliente.

## Fuentes de verdad (leer antes de programar)

- `docs/architecture.md` — stack, módulos, modelo de datos, seguridad, fases.
- `docs/manual/` — especificación funcional. Cada pantalla tiene un ID estable (`S-GEN-03`, `S-CLI-14`, `S-KIO-01`…). Las tareas se piden por ID.
- `docs/manual/11_kiosco.md` — kiosco de autorregistro (nuevo en v3).
- `docs/decisions/` — decisiones tomadas. Si contradicen el manual, **mandan las decisiones**. Las preguntas abiertas están en `docs/decisions/PENDIENTES.md`: no las resuelvas por tu cuenta.
- `docs/tasks/` — tareas pequeñas con sus criterios de terminado. Se trabaja una por vez.
- `design/stitch/<módulo>/S-XXX-NN_nombre.{png,html}` — referencia visual. No copiar el HTML tal cual: usar los componentes de `packages/ui`.

El manual describe el prototipo anterior (Flutter + Rust). Sus rutas, roles, estados, etiquetas y reglas son la especificación; sus referencias a archivos `.dart`/`.rs` son solo contexto histórico.

## Stack

TypeScript en todo. pnpm + Turborepo.

- `apps/web` — React 19, Vite, TanStack Router + Query, Tailwind 4, shadcn/ui, React Hook Form + Zod. PWA (tableta es el objetivo principal).
- `apps/api` — NestJS (Fastify), Drizzle ORM, Socket.IO. Autenticación: Better Auth solo si pasa la prueba (ADR 0021).
- `apps/worker` — proceso separado con pg-boss (ADR 0020).
- `packages/shared` — esquemas Zod, `permissions.ts`, máquina de estados de la visita, tipos.
- `packages/ui` — tokens y componentes (React como dependencia de pares; `/dev/ui` los muestra todos).
- `packages/db` — esquema Drizzle, migraciones, políticas RLS, seed ficticio.
- `infra/` — AWS CDK (entorno B: un EC2; ver ADR 0017).

## Comandos

- `pnpm install`
- `pnpm dev` — Postgres y Mailpit (docker compose) + bootstrap de roles (idempotente) + migraciones pendientes + API (http://127.0.0.1:3001) + worker (outbox y trabajos diarios) + web (http://localhost:5173, reenvía `/api` a la API; arranca cuando la API responde)
- `pnpm test` — unitarias + integración (Testcontainers)
- `pnpm test:e2e` — Playwright (compila la web y levanta Postgres con Testcontainers, la API y `vite preview`)
- `pnpm --filter @clinic/web test:a11y` — axe sobre `/dev/ui` (hoja de componentes, solo en desarrollo: http://localhost:5173/dev/ui)
- `pnpm db:bootstrap` (superusuario) / `pnpm db:migrate` / `pnpm db:seed` (aplica antes las migraciones pendientes; clínicas ficticias y sus Propietarios)
- `pnpm org:create` / `pnpm audit:platform` — operador de la plataforma, como `clinic_operator` (ADR 0024)
- `pnpm demo:reset` — borra la base de datos LOCAL y la deja como recién instalada: las dos clínicas ficticias, sus 13 usuarios (sin MFA), su catálogo con precios, laboratorios y costos, sus pacientes y sus citas (pide escribir `BORRAR`; con `pnpm dev` detenido). Guiones: `docs/DEMO-FASE-1.md` y `docs/DEMO-FASE-2.md`
- `pnpm demo:aviso <correo>` — aviso ficticio en la campana de esa persona (solo desarrollo)
- `pnpm --filter @clinic/api dev` — API en http://127.0.0.1:3001 (Mailpit en http://localhost:8025)
- `pnpm check:rls-context` — el contexto RLS solo se fija en `withTenant` / `withUser` (va dentro de `pnpm lint`)
- `pnpm lint` / `pnpm typecheck`

## Reglas no negociables

1. **Multi-tenant (ADR 0002):**
   - Toda tabla de negocio lleva `organization_id`, `UNIQUE (organization_id, id)`, claves foráneas compuestas, `FORCE ROW LEVEL SECURITY` y políticas `USING` y `WITH CHECK`.
   - La API y el worker usan solo `clinic_app`. `clinic_migrator` se usa solo en migraciones y en la semilla ficticia de desarrollo.
   - Todo acceso a datos pasa por `withTenant`, con el contexto derivado de la sesión validada.
   - Cada tabla nueva lleva su prueba de aislamiento con el rol real y un pool.
   - RLS no cubre S3, WebSockets, exportaciones ni logs: aplicar sus controles propios.
2. **Permisos:** se definen solo en `packages/shared/src/permissions.ts`. El frontend oculta, el backend autoriza siempre.
3. **Estados de la visita:** solo cambian a través de la máquina de estados compartida; cada transición queda en `encounter_events`.
4. **Dinero:** enteros en centavos, calculados en el servidor. El frontend nunca suma importes.
5. **Nada se borra en finanzas ni en auditoría:** cargos y pagos se anulan con motivo; `audit_log` es append-only.
6. **Auditoría:** toda escritura (y lecturas sensibles, impresiones y exportaciones) se audita con actor, sede y motivo.
7. **Concurrencia optimista:** columna `version`; respuesta 409; la UI nunca ofrece «guardar igualmente».
8. **PHI:** nunca escribir datos de pacientes en logs, mensajes de error, analítica ni fixtures. Solo datos ficticios en dev, tests y seeds.
9. **Kiosco y PWA (ADR 0014):**
   - El token de kiosco solo tiene `kiosk.submit`.
   - Nunca guardar PHI en localStorage, sessionStorage, IndexedDB ni en la caché del service worker.
   - La API responde con `Cache-Control: no-store`.
   - El motivo de visita nunca decide una ruta clínica por sí solo.
10. **UI:** español, trato de «usted», terminología unificada («Caja», no «Checkout»/«Cobro»). Estados con icono + texto + color. Objetivos táctiles ≥ 48 dp (kiosco ≥ 64 dp). Zona horaria de la sede para «hoy», agendas y reportes.
11. **Auditoría (ADR 0018):** en cambios clínicos se guardan solo los nombres de los campos, nunca los valores. Los logs técnicos no llevan PHI.
12. **Operaciones críticas (ADR 0019):** `Idempotency-Key` en llegada, kiosco, pagos y anulaciones. Orden y cargo en una sola transacción. Outbox para entregas fiables. Códigos generados con `code_counters`.
13. **Datos de prueba:** siempre las dos organizaciones ficticias («Clínica Demo Norte» y «Clínica Demo Sur»).
14. **Infraestructura:** no crear recursos en AWS. El código CDK lo revisa y lo despliega el dueño de la cuenta (presupuesto B: US$25/mes).

## Forma de trabajo

- Una pantalla o flujo por PR, referenciando su ID (`feat(encounters): S-REC-18 registro de llegada`).
- Cada pantalla: ficha del manual + captura de Stitch + prueba E2E del flujo del rol.
- Si una tarea requiere una decisión que no está en `docs/decisions/`, detenerse y preguntar; no inventar reglas de negocio.
- Mantener `docs/architecture.md` al día si cambia algo estructural.
- En el equipo local corre lint, typecheck y las pruebas de los paquetes que cambiaste y de los que dependen de ellos (con el filtro de Turborepo). No corras la E2E completa en local salvo que te lo pida, porque el equipo se queda sin memoria; si hace falta, corre solo los archivos E2E afectados.
- La batería completa y la E2E las corre siempre la CI. Un PR no está terminado hasta que la CI (check y e2e) esté en verde, y si la CI encuentra un error de una tarea anterior, se corrige en el mismo PR.
