# 0002. Multi-tenant: identidad global, membresías, RLS con rol real

- **Estado:** Aceptada (reescrita 2026-10-24)
- **Fecha:** 2026-10-24

## Contexto

Una instalación sirve a varias organizaciones. RLS sola no protege contra todos los errores.

## Decisión

- `users` global; `memberships` y `membership_roles` (rol por sede; nulo = toda la organización, solo para roles administrativos) bajo RLS.
- Roles de base de datos: `clinic_owner` (dueño, NOLOGIN), `clinic_migrator` (migraciones), `clinic_app` (API y worker; NOSUPERUSER, NOBYPASSRLS, sin propiedad de tablas, sin DELETE en finanzas ni auditoría).
- `ENABLE` + `FORCE ROW LEVEL SECURITY`; políticas `USING` y `WITH CHECK` sobre `current_setting('app.org_id', true)`.
- `withTenant`: transacción + `set_config(..., true)`; contexto derivado de la sesión validada, nunca de un encabezado del cliente.
- `UNIQUE (organization_id, id)` y claves foráneas compuestas.
- Ocho pruebas obligatorias como `clinic_app` con pool (ver `docs/architecture.md`).
- Controles propios para worker, S3 (prefijo por organización, URLs firmadas de 5 min), WebSockets (salas por organización y sede, solo ids) y exportaciones.

## Consecuencias

Toda tabla nueva requiere política, clave foránea compuesta y prueba de aislamiento. Las fugas por canales fuera de la base de datos se cubren con controles específicos, no con RLS.
