# T-002 — Prueba técnica de Better Auth

**Fase:** 0 · **Tamaño:** 3 días como máximo · **ADR:** 0021, 0002 · **Depende de:** T-001 (ya fusionada)

## Objetivo

Decidir con evidencia si Better Auth sirve para la identidad y las sesiones de v3, o si pasamos al plan B: autenticación propia con argon2 y otplib.

Esta es una **prueba técnica**, no la implementación final:

- El código de la prueba vive en la rama `spike/t-002-better-auth` y **no se fusiona**.
- A `main` solo llegan el informe (`docs/spikes/T-002-better-auth.md`) y el borrador del ADR con la decisión.

Better Auth se encarga solo de identidad y sesiones. **Los permisos clínicos y por sede son siempre nuestros** (`packages/shared/permissions.ts`). No se supone que ningún plugin los implemente.

## Montaje mínimo

1. En la rama de la prueba, crea un `apps/api` mínimo con NestJS + Fastify, que use `packages/db` de T-001 y su `withTenant`.
2. Configura Better Auth con el adaptador de Drizzle y el plugin de TOTP (two-factor). Usa el de organizaciones y el de administración solo si hacen falta para un criterio, y anota cuáles se usaron.
3. **La API se conecta como `clinic_app`**, nunca como `clinic_migrator` ni como superusuario. Las tablas de Better Auth se crean con una migración ejecutada por `clinic_migrator`.
4. Tablas de identidad global (usuarios, sesiones, cuentas, verificaciones, secretos de TOTP):
   - van sin RLS de organización, en el esquema `auth` o con un prefijo claro;
   - `clinic_app` recibe solo los permisos que Better Auth necesite;
   - el informe lista exactamente esos permisos.
5. Nuestras tablas `memberships` y `membership_roles` (con RLS) son la fuente de verdad. Si se usa el plugin de organizaciones, hay que documentar cómo se mantienen sincronizadas, o por qué no hace falta.
6. Datos: las dos organizaciones ficticias de T-001, con al menos estos usuarios: un Propietario, un Administrador, una persona de Recepción y una de Enfermería, más un usuario que pertenece a las dos organizaciones.

## Criterios (cada uno con pruebas automáticas que pasan o fallan)

| # | Criterio | Pasa si… |
| --- | --- | --- |
| 1 | Invitaciones | Un Administrador invita por correo (un correo simulado basta). El enlace sirve una sola vez y expira. Al aceptarlo se crea la fila en **nuestra** `memberships` con el rol y la sede indicados. Un enlace usado, vencido o alterado se rechaza. |
| 2 | Organizaciones | El usuario de dos organizaciones elige la organización y la sede activas. El contexto (`org_id`, `location_id`) lo deriva el servidor de la sesión y de `memberships`, nunca de un encabezado del cliente. Si se intenta usar una organización a la que no pertenece, la respuesta es 403. |
| 3 | MFA por rol | Propietario y Administrador sin TOTP solo pueden llegar a la pantalla de inscripción: cualquier otra ruta responde 403 con un código «mfa_enrollment_required». Con TOTP, el inicio de sesión exige el código. Los códigos de recuperación funcionan una sola vez. **La regla vive en nuestro guard**, no se da por supuesta en el plugin. |
| 4 | Sesiones | Se guardan en la base de datos. Cookie httpOnly, Secure (en producción) y SameSite=Lax o Strict. Hay expiración por inactividad y expiración absoluta, ambas configurables, y una prueba para cada una. |
| 5 | Revocación | Al desactivar a un usuario o quitarle una membresía, sus sesiones dejan de valer en menos de 1 minuto, con prueba incluida. Además, un WebSocket abierto de ese usuario se cierra (puede ser un WebSocket mínimo de prueba). |
| 6 | Compatibilidad con RLS | Todas las consultas de Better Auth funcionan como `clinic_app`, sin BYPASSRLS. Los datos con RLS solo se leen dentro de `withTenant`. Ninguna ruta necesita el rol de migraciones. Las 21 pruebas de T-001 siguen pasando. |
| 7 | Kiosco | Un token de dispositivo de kiosco (persistente, con hash en la base de datos y permiso único `kiosk.submit`) convive con las sesiones de personas sin mezclarse: el token de kiosco recibe 403 en un endpoint de lectura, y una sesión de persona no sirve como kiosco. |
| 8 | Auditoría | El inicio de sesión correcto, el fallido, la inscripción y el uso de MFA, la invitación, la aceptación y la revocación generan eventos que podemos escribir en `audit_log` con actor, organización (si aplica), IP y hora. Sin contraseñas, tokens ni códigos en el registro ni en los logs. |

## Entregables

1. La rama `spike/t-002-better-auth` con el código y las pruebas, subida a GitHub y **sin fusionar**.
2. Un PR a `main` que solo agrega:
   - **`docs/spikes/T-002-better-auth.md`**, con:
     - una tabla de los 8 criterios: PASA / FALLA / PASA CON CONDICIONES, la evidencia (nombre de la prueba) y notas;
     - la versión exacta de Better Auth y de cada plugin usado;
     - los permisos exactos que necesitó `clinic_app` sobre las tablas de identidad;
     - el esfuerzo estimado para llevarlo a producción;
     - la **recomendación**: adoptar Better Auth o pasar al plan B. Si falla el criterio 3, 5 o 6, la recomendación es el plan B, con un esquema de una página de cómo sería.
   - **`docs/decisions/0023-autenticacion.md`** en estado «Propuesta», con la recomendación.
3. En `docs/decisions/PENDIENTES.md`, actualizar la fila P-02 con un enlace al informe.

## No incluye

Pantallas, correo real (SES), Google como proveedor de inicio de sesión, AWS ni pacientes.

## Terminada cuando

- Cada criterio tiene al menos una prueba automática y su resultado está en el informe.
- `pnpm lint`, `pnpm typecheck` y `pnpm test` pasan en la rama de la prueba, incluidas las pruebas de T-001.
- El PR del informe tiene la CI en verde.
- Si se llegó al límite de 3 días sin terminar, el informe dice qué quedó sin probar y la recomendación tiene en cuenta ese hueco.

## Pedido sugerido a Claude Code

> Lee CLAUDE.md, docs/architecture.md (secciones Multi-tenant y Autenticación) y docs/tasks/T-002-prueba-better-auth.md. En modo plan, propón cómo hacer la prueba técnica. Consulta la documentación actual de Better Auth antes de suponer qué hace cada plugin. Cuando yo apruebe, trabaja en la rama spike/t-002-better-auth.
