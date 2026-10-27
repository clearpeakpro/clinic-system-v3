# T-001 — Aislamiento multi-tenant con el rol real

**Fase:** 0 · **Tamaño:** 1–2 días · **ADR:** 0002, 0022

## Objetivo

Demostrar con código y pruebas que una organización no puede leer ni escribir datos de otra, usando el rol real de la aplicación (`clinic_app`) y un pool de conexiones. Esta tarea va antes de cualquier pantalla.

## Incluye

1. Esqueleto mínimo del monorepo: `pnpm` + Turborepo, con un solo paquete, `packages/db`, en TypeScript estricto.
2. `docker-compose.yml` con Postgres 16.
3. Migración inicial (Drizzle, ejecutada como `clinic_migrator`):
   - Roles `clinic_owner` (NOLOGIN), `clinic_migrator` y `clinic_app` (NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE, sin propiedad de tablas).
   - Tablas `organizations`, `locations` y `patients`. `patients` lleva `organization_id`, `registered_location_id` y `UNIQUE (organization_id, id)`.
   - Clave foránea compuesta `patients (organization_id, registered_location_id) → locations (organization_id, id)`.
   - `ENABLE` + `FORCE ROW LEVEL SECURITY`, con políticas `USING` y `WITH CHECK` sobre `current_setting('app.org_id', true)::uuid`.
   - `GRANT` mínimos a `clinic_app`.
4. `withTenant(orgId, fn)`: abre una transacción de Drizzle, ejecuta `set_config('app.org_id', orgId, true)` y luego `fn(tx)`.
5. Semilla con datos ficticios: «Clínica Demo Norte» y «Clínica Demo Sur», 2 sedes y 3 pacientes cada una.
6. Pruebas (Vitest + Testcontainers), conectando como `clinic_app` mediante `pg.Pool`:
   1. En el contexto A no se ve ninguna fila de B.
   2. Un INSERT con el `organization_id` de B en el contexto A falla.
   3. Un UPDATE que mueve una fila a B falla.
   4. Un paciente de A no puede referenciar una sede de B.
   5. Sin contexto, cero filas y los INSERT fallan.
   6. En el mismo pool, una transacción de A seguida de una de B no hereda el contexto.
   7. `clinic_app` no puede hacer `ALTER TABLE … DISABLE ROW LEVEL SECURITY`, `CREATE ROLE` ni `SET ROLE clinic_owner`.
   8. Comprobación de la configuración: los atributos de `clinic_app` en `pg_roles` (`rolsuper`, `rolbypassrls`) son false y no es dueño de ninguna tabla.
7. GitHub Actions: `pnpm install`, `pnpm lint`, `pnpm typecheck` y `pnpm test`.
8. `packages/db/README.md` explica los tres roles y cómo usar `withTenant`.

## No incluye

API, autenticación, interfaz, AWS ni otras tablas.

## Terminada cuando

- `pnpm test` pasa en local y en CI.
- Se demostró una vez que, al quitar `FORCE` o una política, al menos una prueba falla. Anotar el resultado en el PR.
- No hay ningún dato real ni secreto en el repositorio.

## Pedido sugerido a Claude Code

> Lee CLAUDE.md, docs/architecture.md (sección Multi-tenant) y docs/tasks/T-001-aislamiento-multitenant.md. En modo plan, propón cómo implementarla. Cuando yo apruebe, trabaja en la rama `t-001-tenant-isolation` y abre un PR.
