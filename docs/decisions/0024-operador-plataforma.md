# 0024. Operador de la plataforma

- **Estado:** Aceptada
- **Fecha:** 2026-10-29
- **Resuelve:** P-11 y la condición 5 del [ADR 0023](0023-autenticacion.md).

## Contexto

Las altas de organizaciones y los eventos de auditoría sin organización (inicios de sesión fallidos, bloqueos y otros sucesos previos a elegir sede) no pertenecen a ninguna clínica. Hasta T-007 no tenían dueño: `clinic_app` no podía leer esos eventos y nadie podía dar de alta una organización.

## Decisión

- **Quién es:** el operador de la plataforma es el dueño del sistema. No es un usuario de la aplicación y en V1 no tiene pantalla.
- **Rol propio, `clinic_operator`:** distinto de `clinic_app` y de `clinic_migrator` y no es miembro de ningún otro rol.
  - Atributos: `LOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEROLE` y `NOCREATEDB`.
  - Lo crea `packages/db/sql/bootstrap.sql`. Sus permisos están en la migración `0012_platform_operator.sql`.
- **Sin datos de pacientes:** no tiene ningún permiso sobre `patients` ni sobre las tablas clínicas que lleguen, ni sobre el esquema `auth` ni las membresías. Una prueba comprueba sus permisos exactos.
- **Qué hace: `pnpm org:create`.**
  - Da de alta la organización, su primera sede y la invitación de su Propietario, con rol de toda la organización.
  - Lo hace en una transacción, bajo la RLS de la organización nueva (con `withTenant`).
  - Solo tiene `SELECT` e `INSERT` en organizaciones, sedes e invitaciones; no puede modificar nada que ya exista.
  - Envía el correo y muestra el enlace una sola vez. Lo audita como `organization.created`, con actor `operator`.
  - La primera sede la crea él: sin sede, el Propietario no podría elegir sede ni entrar.
- **Qué hace: `pnpm audit:platform`.** Es el único que lee los eventos de auditoría sin organización.
  - No tiene `SELECT` sobre `audit_log`. Lee solo con la función `app.read_platform_audit(desde, hasta, acción, límite)`: `SECURITY DEFINER` de `clinic_owner`, `search_path` vacío y ejecutable solo por él.
  - La función registra cada lectura como `platform.audit_read`, con los filtros y el usuario de la base de datos, en la misma transacción en que devuelve las filas. Ninguna lectura queda sin auditar.
- **Excepción documentada: «Último acceso» de Usuarios (S-ADM-02, T-006a).**
  - La función `app.last_sign_ins()` lee eventos de inicio de sesión sin organización para `clinic_app`.
  - Se mantiene limitada a devolver el usuario y la hora del último inicio de sesión de las personas con membresía en la organización activa (contexto RLS).
  - Nunca devuelve el evento, la IP ni otros datos.

## Consecuencias

- **Configuración:** `CLINIC_OPERATOR_PASSWORD` (bootstrap) y `DATABASE_OPERATOR_URL` (comandos). Los comandos se niegan a correr con otro usuario de base de datos.
- **Desarrollo:** `pnpm dev` ejecuta el bootstrap, que es idempotente, antes de las migraciones. Sin `CLINIC_OPERATOR_PASSWORD`, el rol existe pero no puede iniciar sesión.
- **Pruebas:** las comprobaciones de `audit_log` siguen leyendo con el superusuario de la base desechable, porque necesitan también los eventos con organización. Las pruebas del operador usan el rol real.
- **Pendiente (P-12):** desactivar una cuenta global y resolver los `409 account_shared`, antes del piloto.
