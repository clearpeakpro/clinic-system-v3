# T-002 — Informe de la prueba técnica de Better Auth

- **Fecha:** 2026-10-27
- **Tarea:** [`docs/tasks/T-002-prueba-better-auth.md`](../tasks/T-002-prueba-better-auth.md) · ADR 0021, 0002
- **Código:** rama [`spike/t-002-better-auth`](https://github.com/clearpeakpro/clinic-system-v3/tree/spike/t-002-better-auth) (commit `264a6fe`). **No se fusiona.**
- **Recomendación:** **adoptar Better Auth** para identidad y sesiones, con las condiciones de la sección «Condiciones». Los criterios eliminatorios (3, 5 y 6) pasan.
- **Decisión:** [ADR 0023](../decisions/0023-autenticacion.md), aceptada con condiciones.

## Resultado por criterio

Todas las pruebas están en `apps/api/test/` y `packages/db/test/` de la rama de la prueba. Se ejecutan con la API conectada como `clinic_app` sobre Postgres 16 (Testcontainers).

| # | Criterio | Resultado | Evidencia (prueba) | Notas |
| --- | --- | --- | --- | --- |
| 1 | Invitaciones | **PASA CON CONDICIONES** | `c1-invitations.test.ts` (8 pruebas): persona nueva y persona con cuenta aceptan; se crea la fila en **nuestra** `memberships` con rol y sede; enlace usado → 410, vencido → 410, token u organización alterados → 404, otro correo → 403; el token solo se guarda como hash. | Las invitaciones son **nuestras** (`app.invitations`, con RLS); Better Auth solo crea la cuenta (`auth.api.signUpEmail` desde el servidor). No se usó el plugin de organizaciones. Condición: el registro público se cierra con un hook (ver «`disableSignUp`»). |
| 2 | Organizaciones | **PASA** | `c2-organizations.test.ts` (5): la persona de dos organizaciones cambia de una a otra; organización o sede ajena → 403; `X-Org-Id` y similares se ignoran; `update-user`/`update-session` no pueden fijar el contexto. | El contexto se guarda en `session.additionalFields` con `input: false`, y solo `POST /context` lo cambia tras validar contra `memberships`. Cada petición lo vuelve a validar. |
| 3 | MFA por rol | **PASA** | `c3-mfa.test.ts` (8): Propietario y Administrador sin TOTP reciben 403 `mfa_enrollment_required` en toda ruta salvo la inscripción (también en `/api/auth/*`); el inicio exige el código; el código de recuperación sirve una vez; `trustDevice` se rechaza; secreto y códigos cifrados en la BD. | La regla vive en **nuestro** `preHandler` de Fastify. El plugin no tiene regla por rol. Si se quita la regla, fallan 3 pruebas (demostrado). |
| 4 | Sesiones | **PASA CON CONDICIONES** | `c4-sessions.test.ts` (7): sesión en `auth.session`; cookie httpOnly + SameSite=Lax, y Secure + prefijo `__Secure-` con `secureCookies`; expira por inactividad; el uso la extiende; expira por tiempo absoluto (`session_expired` a las 2 h exactas); `Cache-Control: no-store`. | Better Auth **no tiene expiración absoluta**: solo `expiresIn` deslizante. La absoluta la aplica nuestro guard con `session.createdAt`. |
| 5 | Revocación | **PASA** | `c5-revocation.test.ts` (4): al desactivar, la siguiente petición da 401 y el WebSocket se cierra en < 1 s; al quitar la membresía, esa organización da 403 y su socket se cierra mientras la otra sigue; la revalidación periódica cierra el socket aunque no llegue el evento. | Condición: `cookieCache` **apagado**. Con `cookieCache` activo (5 min) fallan 3 pruebas (demostrado). El bus de revocación es interno al proceso; con varios procesos hará falta `LISTEN/NOTIFY`. |
| 6 | Compatibilidad con RLS | **PASA** | `c6-rls.test.ts` (6) + `packages/db` (30, incluidas las 21 de T-001): Better Auth funciona entero como `clinic_app` sin BYPASSRLS; sin contexto no se ve nada de `app.*`; las tablas de Better Auth están en el esquema `auth` sin RLS; ninguna ruta usa `clinic_migrator`. | Las 21 pruebas de T-001 siguen pasando. |
| 7 | Kiosco | **PASA** | `c7-kiosk.test.ts` (7): el kiosco envía; recibe 403 en lectura, en `/me`, en `/context`, en invitaciones y en `/api/auth/*`; una sesión de persona no sirve como kiosco; kiosco + sesión juntos → 403; token alterado, de otra organización o revocado → 401; solo se guarda el hash. | Todo el kiosco es **nuestro** (`app.kiosk_devices`, cookie propia). Better Auth no interviene ni interfiere. |
| 8 | Auditoría | **PASA CON CONDICIONES** | `c8-audit.test.ts` (5): inicio correcto, fallido y pendiente de MFA; inscripción y uso de MFA (TOTP y código de recuperación); invitación, aceptación y revocación, con actor, organización (si aplica), IP y hora; el correo del intento fallido va con HMAC-SHA256; ningún secreto ni correo en `audit_log` ni en los logs; `clinic_app` no puede leer `audit_log`. | Condición: el orden de los hooks (ver «Hallazgos»). |

**Totales en la rama de la prueba:** `packages/db` 30/30 y `apps/api` 54/54. `pnpm lint` y `pnpm typecheck` sin errores.

## Versiones exactas

| Paquete | Versión |
| --- | --- |
| `better-auth` (incluye el plugin `twoFactor`) | **1.7.14** (fijada sin `^`) |
| `@better-auth/core` | 1.7.14 |
| `@better-auth/drizzle-adapter` | 1.7.14 |
| `@better-auth/utils` | 0.5.1 |
| `@better-auth/telemetry` | 1.7.14 (desactivada; ver «Hallazgos») |
| `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-fastify` | 12.2.0 |
| `fastify` | 5.12.7 |
| `socket.io` | 4.8.4 |
| `drizzle-orm` | 0.45.4 |

Plugins usados: **solo `twoFactor`**. No se usaron el de organizaciones ni el de administración (ver «Decisiones de montaje»).

### Versión anterior (1.7.13)

Better Auth 1.7.14 se publicó el 2026-10-26, el mismo día de la prueba. Se repitió la suite completa de `apps/api` con **1.7.13** (publicada el 2026-10-25):

- **Ningún resultado cambia:** 54/54, las mismas pruebas.
- **Las mismas operaciones sobre la base de datos:** los contadores de `pg_stat_user_tables` en `auth.*` son idénticos en las dos versiones.

Las dos versiones tienen menos de dos días. Antes de producción, conviene fijar una versión con al menos dos semanas publicada (por ejemplo, la 1.7.7, del 2026-09-30) y repetir esta suite. Esa versión **no** se probó.

## Permisos de `clinic_app` sobre las tablas de identidad

Medidos, no supuestos: se ejecutó la suite y se leyeron los contadores de `pg_stat_user_tables`. Luego se quitó cada privilegio que no se ejerció y se comprobó que la suite seguía pasando. Lo verifica la prueba `T-002: permisos exactos de clinic_app en el esquema auth`.

| Tabla | Permisos | Operaciones observadas (ins/upd/del) |
| --- | --- | --- |
| `auth.user` | SELECT, INSERT, UPDATE | 33 / 7 / 0 |
| `auth.account` | SELECT, INSERT | 33 / 0 / 0 |
| `auth.session` | SELECT, INSERT, UPDATE, DELETE | 48 / 25 / 17 |
| `auth.verification` | SELECT, INSERT, DELETE | 14 / 0 / 10 |
| `auth.two_factor` | SELECT, INSERT, UPDATE | 6 / 14 / 0 |

Más `USAGE` en el esquema `auth`. Flujos que la prueba no cubre y que necesitarán más permisos: cambio y restablecimiento de contraseña (UPDATE en `account`, y probablemente en `verification`) y desactivar el MFA (DELETE en `two_factor`).

## Cambios propuestos al ADR 0002

### Lectura de las membresías propias (ajuste pedido en la revisión)

Para que una persona pueda listar sus organizaciones y para que el guard de MFA vea sus roles en todas, se añadió una segunda política a `memberships` y otra a `membership_roles`:

- **`own_memberships_read`:** `FOR SELECT` con `user_id = NULLIF(current_setting('app.user_id', true), '')::uuid`.
- **`own_membership_roles_read`:** `FOR SELECT`, solo los roles de las membresías propias. La subconsulta pasa por la RLS de `memberships`.

Esto **cambia el ADR 0002**. Hasta ahora, la única forma de ver una fila era el contexto de su organización (`app.org_id`). Ahora existe un segundo contexto, `app.user_id`, limitado así:

- **Solo lectura.** Escribir sigue exigiendo `app.org_id`, porque estas políticas son `FOR SELECT` y las de escritura siguen siendo `tenant_isolation`.
- **Solo se fija desde la sesión validada.** Lo hace `withUser(userId)` en `packages/db`, y la API solo lo llama con `session.user.id` de Better Auth. Ningún endpoint acepta un id de usuario del cliente para esto.
- **Pruebas** (`packages/db/test/memberships.test.ts`):
  - una persona ve sus membresías en todas sus organizaciones y ninguna ajena, ni en otras organizaciones ni en la suya;
  - `membership_roles` muestra solo los roles propios;
  - no puede actualizar su propia membresía de otra organización, ni con `app.user_id` ni con el contexto de otra organización;
  - con `app.user_id` no puede crear membresías ni roles para sí misma, ni borrar sus roles;
  - `withTenant` sigue viendo solo su organización.

### Eventos de auditoría sin organización

- `audit_log.organization_id` admite nulo, **solo** para eventos previos a elegir organización: inicio de sesión (correcto, fallido o pendiente de MFA), uso del MFA y desactivación global de una cuenta.
- **Quién los lee:** solo el operador de la plataforma. `clinic_app` solo tiene INSERT en `audit_log`, sin ninguna política de lectura. Ninguna organización ve esos eventos, ni siquiera su Propietario. El rol de base de datos del operador se define en la fase 1; en la prueba se leyeron con el superusuario del contenedor.
- **Correo del intento fallido:** se guarda como **HMAC-SHA256** del correo normalizado, con una clave secreta de configuración (`auditHmacKey`, de al menos 32 caracteres). No es un sha256 simple, así que no se puede comprobar un correo conocido sin la clave.

## `disableSignUp` (ajuste pedido en la revisión)

**No sirve para nuestro caso.** `emailAndPassword.disableSignUp: true` bloquea también la creación desde el servidor: en 1.7.14, `sign-up.mjs` lanza `EMAIL_PASSWORD_SIGN_UP_DISABLED` dentro del propio endpoint, sin distinguir si la llamada viene de HTTP o de `auth.api`. Con esa opción no se podría crear la cuenta al aceptar una invitación.

- **Prueba:** `signup.test.ts > con disableSignUp: true > también bloquea la creación desde el servidor`.
- **Lo que se usa:** solo el hook `before` que rechaza `/sign-up/email` cuando la llamada viene de HTTP (`ctx.request` presente). Una prueba confirma que un POST público da 403 y otra que el servidor sí puede crear la cuenta.
- **Alternativa no adoptada:** crear el usuario con `internalAdapter`. Permitiría activar `disableSignUp`, pero es una API interna.

## Hallazgos que no estaban en la documentación

1. **Orden de los hooks.** El `hooks.after` de la configuración corre **antes** que el del plugin `twoFactor`. En un inicio de sesión con MFA, nuestro hook todavía ve `newSession`, aunque el plugin la descarte después y responda `twoFactorRedirect`. La primera versión registraba esos inicios como correctos; la prueba lo detectó. Ahora un usuario con `twoFactorEnabled` se registra como `auth.sign_in.mfa_required`. Esto es fiable porque `trustDevice` está desactivado.
2. **Códigos de recuperación sin cifrar por defecto.** El plugin los guarda como JSON en claro salvo que se configure `backupCodeOptions.storeBackupCodes: 'encrypted'`. El secreto TOTP sí se cifra siempre. Una prueba comprueba ambos.
3. **Telemetría:** el paquete `@better-auth/telemetry` viene incluido, pero está **desactivado por defecto** (se activa con una opción o con `BETTER_AUTH_TELEMETRY`). Se desactivó explícitamente con `telemetry: { enabled: false }`.
4. **NestJS:** la única integración es `@thallesp/nestjs-better-auth`, que es comunitaria y tiene Fastify en beta. No se usó: Better Auth se monta como ruta de Fastify, igual que en su integración oficial para Fastify. Funcionó sin problemas, y los decoradores de Nest se ejecutan bajo Vitest 5 (oxc) con inyección explícita.
5. **`trustDevice`** (saltarse el TOTP 30 días) viene activo en el plugin; se rechaza con un hook. Que el personal no pueda usarlo es una propuesta para el ADR 0023.
6. **IP:** Better Auth la lee de encabezados. El montaje sobrescribe siempre `x-clinic-client-ip` con la IP que ve Fastify, para que el cliente no pueda falsearla. Detrás de Caddy hará falta `trustProxy`.

## Decisiones de montaje

- **Sin plugin de organizaciones:** duplicaría `memberships` e invitaciones, y la fuente de verdad tiene que ser nuestra. No hace falta sincronizar nada.
- **Sin plugin de administración:** añade un `role` global a `user` y sus llamadas de servidor exigen una sesión de administrador. La desactivación es propia: marcar `disabled_at`, borrar las sesiones y avisar al bus. Un `databaseHooks.session.create.before` impide abrir sesiones nuevas.
- **Tablas de Better Auth** en el esquema `auth`, con ids UUID v7 generados por la API (`advanced.database.generateId`), para que `memberships.user_id` sea `uuid` con clave foránea a `auth.user`.

## Condiciones para adoptarlo

1. `cookieCache` siempre apagado (o con `disableCookieCache` en toda comprobación de sesión), con una prueba de revocación que lo vigile.
2. La regla de MFA por rol, la expiración absoluta, el contexto y el kiosco son nuestros y llevan sus pruebas. El plugin no los cubre.
3. `storeBackupCodes: 'encrypted'`, `trustDevice` rechazado y telemetría apagada en la configuración base.
4. La auditoría de autenticación usa `twoFactorEnabled` y no `newSession` (hallazgo 1). Cualquier actualización de Better Auth repite la suite completa.
5. Versión exacta fijada y actualizada a mano, repitiendo esta suite (ver «Versión anterior»).
6. Con más de un proceso de API: bus de revocación sobre `LISTEN/NOTIFY` (la revalidación periódica cubre mientras tanto, a 30 s).

## Qué quedó fuera

- Cambio y restablecimiento de contraseña, verificación de correo y bloqueo por intentos fallidos en el inicio con contraseña. El bloqueo del plugin de MFA no se probó.
- Límite de peticiones (`rateLimit`) con almacenamiento en la base de datos.
- Vinculación del kiosco con un código de un solo uso (ADR 0014): la prueba registra el dispositivo desde el servidor.
- Auditoría en la misma transacción que la acción. Hoy se escribe después, y si falla la escritura se pierde el evento; en producción iría por outbox (ADR 0019).
- Rol de base de datos del operador de la plataforma.

## Esfuerzo estimado para producción

| Trabajo | Días |
| --- | --- |
| Módulo `identity` en `apps/api` a partir de la prueba (configuración, montaje, guards, contexto) | 2 |
| Invitaciones con correo por outbox y SES, y pantallas S-GEN/S-ADM correspondientes (solo backend) | 1,5 |
| Contraseña: cambio, restablecimiento y permisos adicionales | 1 |
| Bus de revocación con `LISTEN/NOTIFY` y salas de Socket.IO definitivas | 1 |
| Auditoría por outbox, rol del operador y lectura para Propietario/Administrador | 1 |
| Límite de peticiones, `trustProxy`, cabeceras de seguridad, repetir la suite con la versión fijada | 0,5 |
| **Total** | **≈ 7 días** |

El plan B (autenticación propia con argon2 y otplib) no se detalla, porque no falló ningún criterio eliminatorio. Igualmente, la mayor parte de la lógica de este informe (MFA por rol, contexto, kiosco, revocación y auditoría) ya es nuestra; Better Auth aporta contraseñas, sesiones en la BD, cookies y TOTP.
