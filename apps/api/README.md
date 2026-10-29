# @clinic/api

API de Clinic System: NestJS sobre Fastify. Identidad y sesiones con Better Auth (ADR 0023). Permisos, membresías, contexto de organización y sede, MFA por rol y auditoría son nuestros.

## Arranque en local

```sh
cp .env.example .env          # en la raíz; cambie los secretos
docker compose up -d          # Postgres 16 y Mailpit
pnpm db:bootstrap             # roles de base de datos (superusuario, una vez)
pnpm db:migrate
pnpm db:seed                  # clínicas ficticias + sus dos Propietarios
pnpm --filter @clinic/api dev # http://127.0.0.1:3001
```

El correo simulado se ve en Mailpit: <http://localhost:8025>.

La API se conecta **solo** como `clinic_app`: `loadConfig` no arranca con otro usuario de base de datos.

## Primer Propietario de cada organización

- **En T-003, el primer Propietario solo lo crea la semilla de desarrollo** de las dos clínicas ficticias (`pnpm db:seed`, que ejecuta `scripts/seed-dev-users.ts`). Usuarios:
  - `propietario.norte@example.test`;
  - `propietario.sur@example.test`;
  - contraseña: `DEV_SEED_PASSWORD` de `.env`.
- Al entrar por primera vez, cada uno debe inscribir el MFA.
- **Ningún endpoint crea un Propietario**, ni siquiera por invitación (regla escalonada de abajo).
- **En producción lo crea el operador de la plataforma** ([ADR 0024](../../docs/decisions/0024-operador-plataforma.md)), conectado como `clinic_operator` (`DATABASE_OPERATOR_URL`):

  ```
  pnpm org:create --organizacion "Clínica Ejemplo"     --propietario-correo propietario@example.test --propietario-nombre "Nombre Apellido"     --sede-codigo LAN --sede-nombre "Lancaster" --zona-horaria America/Chicago     [--sede-direccion "…"] [--sede-telefono "…"]
  ```

  - Crea la organización, su primera sede y la invitación del Propietario, en una transacción.
  - Envía el correo y muestra el enlace una sola vez. El Propietario la acepta en `/invitacion/<token>` y configura su MFA.
- **Auditoría sin organización:** `pnpm audit:platform [--desde …] [--hasta …] [--accion …] [--limite …]` muestra los eventos sin organización, uno por línea en JSON. Cada lectura queda auditada (`platform.audit_read`).
- La semilla no se ejecuta con `NODE_ENV=production`.

## Regla escalonada de roles

Definida en `packages/shared/src/permissions.ts` y aplicada al invitar, al cambiar roles y al quitar o desactivar membresías.

- **Rangos:** Propietario > Administrador > roles clínicos (Recepción, Enfermería, Proveedor).
- **Asignar:** solo roles de rango estrictamente menor al propio.
  - el Propietario asigna Administrador y roles clínicos;
  - el Administrador, solo roles clínicos;
  - nadie asigna Propietario por la API.
- **Gestionar** (quitar, desactivar o cambiar roles): solo a quien tiene rango estrictamente menor.
  - un Administrador no toca a un Propietario ni a otro Administrador (ni a sí mismo);
  - un Propietario tampoco toca a otro Propietario.

Pruebas: `test/role-assignment.test.ts` y `packages/shared/test/permissions.test.ts`.

## Endpoints

| Método y ruta | Permiso | Qué hace |
| --- | --- | --- |
| `GET/POST /api/auth/*` | — | Better Auth: inicio y cierre de sesión, sesión, TOTP y códigos de recuperación. El registro público está cerrado. |
| `GET /api/me` | sesión | Usuario, estado del MFA, contexto activo y permisos efectivos |
| `GET /api/me/locations` | sesión | Organizaciones y sedes que puede elegir |
| `GET /api/me/mfa` | sesión | S-GEN-22: estado del propio MFA (activo, obligatorio por rol, bloqueo, códigos que quedan) |
| `POST /api/me/password` | sesión | Perfil: cambiar la contraseña con la actual; cierra las demás sesiones |
| `POST /api/me/mfa/recovery-codes` | sesión | S-GEN-24/25: códigos de recuperación nuevos, con un código actual de la aplicación |
| `POST /api/me/mfa/disable` | sesión | S-GEN-24: desactivar el propio MFA con un código actual; `403 mfa_required_for_role` para Propietario y Administrador |
| `POST /api/context` | sesión | Elegir organización y sede (validado contra `memberships`) |
| `GET /api/users` | `members.manage` | S-ADM-02: personas e invitaciones pendientes de la organización activa, con lo que quien consulta puede hacer en cada fila y su último acceso (de la auditoría de inicio de sesión, sin IP; función `app.last_sign_ins`, migración 0010) |
| `GET /api/locations` | `locations.manage` | S-ADM-10: todas las sedes de la organización activa, también las inactivas |
| `POST /api/locations` | `locations.manage` | S-ADM-11: crear (código de 2 a 8 caracteres, empieza por letra, A–Z y dígitos; único en la organización: `409 location_code_taken`) |
| `POST /api/locations/:id` | `locations.manage` | S-ADM-11: editar nombre, zona horaria IANA, dirección y teléfono, con versión. El código no cambia. |
| `POST /api/locations/:id/deactivate` y `/activate` | `locations.manage` | S-ADM-10, con versión. No se desactiva la única activa (`409 last_active_location`). Una sede inactiva no se elige (`403 location_inactive`), no se ofrece al invitar y deja sin contexto a quien trabajaba en ella. |
| `POST /api/invitations` | `members.invite` | S-ADM-03: invitar con roles y sedes. Envía el correo y devuelve el enlace `/invitacion/<token>` una sola vez (S-ADM-04); vence a las 48 h. Reinvitar a alguien aún «Invitado» anula el enlace anterior. |
| `POST /api/invitations/:id/revoke` | `members.invite` | Revocar una invitación pendiente, con motivo |
| `POST /api/invitations/:id/resend` | `members.invite` | S-ADM-02 «Reenviar»: enlace nuevo con los mismos roles y sedes (también si venció); anula el anterior, envía el correo y devuelve el enlace una sola vez. Regla escalonada como al revocar. |
| `POST /api/invitations/accept` | pública | S-GEN-09: crea la cuenta y abre su sesión, o usa la sesión existente; membresía, roles y auditoría en una transacción |
| `POST /api/memberships/:id/name` | `members.manage` | S-ADM-05: nombre para mostrar (cuenta global), con versión |
| `POST /api/memberships/:id/roles` | `members.manage` | S-ADM-06: reemplazar roles y sedes, con motivo y versión |
| `POST /api/memberships/:id/deactivate` | `members.manage` | Deshabilitar en esta organización, con motivo y versión; borra sus sesiones en ella |
| `POST /api/memberships/:id/reactivate` | `members.manage` | S-ADM-09: reactivar, con motivo y versión (la contraseña no cambia) |
| `GET /api/memberships/:id/mfa` | `members.manage` | S-ADM-08: estado del MFA (activo, bloqueo, códigos que quedan, restablecimiento pendiente) |
| `POST /api/memberships/:id/mfa-reset` | `members.manage` | S-ADM-08: quita el factor, invalida la contraseña y cierra las sesiones, con motivo; devuelve un enlace `/restablecer/<token>` si la membresía está activa |
| `POST /api/memberships/:id/password-reset` | `members.manage` | Restablecimiento de contraseña, con motivo: enlace de un solo uso (anula los anteriores). Solo se entrega en el diálogo, nunca por correo. |

**Administración de usuarios (T-006a):**
- Nadie actúa sobre sí mismo ni sobre alguien de rango igual o mayor (403 `cannot_modify_self` / `member_not_manageable`).
- Versión vieja → 409 `version_conflict` (regla 7).
- Editar el nombre, restablecer el MFA o la contraseña tocan la cuenta **global**: si la persona tiene una membresía activa en otra organización, 409 `account_shared` (lo resuelve el operador de la plataforma, T-007). Se comprueba con la función `app.has_active_membership_elsewhere`, que solo responde sí o no.
- `/api/auth/request-password-reset` está cerrado (403): el restablecimiento solo lo emite un administrador. El token se guarda con hash en `auth.verification`.
- Tras restablecer el MFA, solo los roles que lo exigen (Propietario, Administrador) deben inscribirse de nuevo al entrar.

**Reglas comunes:**
- Un Propietario o Administrador sin MFA recibe 403 `mfa_enrollment_required` en todo salvo la inscripción.
- Los errores responden solo `{ code }`.
- Toda respuesta lleva `Cache-Control: no-store`.

## Contraseñas y límite de intentos

Detalle en el ADR 0023.

- **Contraseñas:**
  - de 12 a 128 caracteres;
  - sin reglas de composición;
  - se rechazan las de la lista local `data/common-passwords.txt`;
  - sin caducidad periódica.
- **Inicio de sesión:**
  - límite **por IP** de Better Auth, activo en todos los entornos: **30 intentos por minuto** en el inicio de sesión, porque toda la clínica comparte la IP pública (configurable con `SIGN_IN_IP_MAX_ATTEMPTS` y `SIGN_IN_IP_WINDOW_SECONDS`);
  - límite **por cuenta**: 10 fallos en 15 min → `429 too_many_attempts`.
- **Verificación en dos pasos:**
  - límite **por IP** de Better Auth en `/two-factor/*`: **20 peticiones por minuto** (configurable con `TWO_FACTOR_IP_MAX_ATTEMPTS` y `TWO_FACTOR_IP_WINDOW_SECONDS`);
  - bloqueo **por cuenta** del plugin: 10 códigos incorrectos seguidos → 15 min `429 ACCOUNT_TEMPORARILY_LOCKED` (`TWO_FACTOR_MAX_FAILURES`, `TWO_FACTOR_LOCK_SECONDS`).
  - Las pruebas dan a cada cliente su propia IP (`support.ts`).

## Sesiones

- **Inactividad:** `IDLE_TIMEOUT_SECONDS` (30 min por defecto), deslizante.
- **Absoluta:** `ABSOLUTE_TIMEOUT_SECONDS` (12 h por defecto), aplicada por nuestro guard.
- **En la base de datos:** las sesiones viven en `auth.session`, sin `cookieCache`. La revocación vale en la siguiente petición.

## Outbox, auditoría e idempotencia (T-008)

- **Correo:** la API no envía correos. Las invitaciones (crear, «Reenviar» y `org:create`) escriben el correo en el outbox en la misma transacción, cifrado con `OUTBOX_KEY`, y lo entrega el worker. `GET /api/users` incluye `mailStatus` en cada invitación (`failed` → «Correo no entregado»).
- **Eventos de autenticación fail-closed:** si no se pueden auditar, `503 audit_unavailable` (ADR 0023).
- **`Idempotency-Key`:** `IdempotencyService` y `@IdempotencyKey()` (`src/idempotency.ts`), listos para la fase 3. Se guardan solo el estado y los ids del recurso (ADR 0019).
- **Cadena de hash de `audit_log`:** la calcula la base de datos (ADR 0018); la API no hace nada especial.

## Tiempo real y notificaciones (T-009)

- **Socket.IO** (`src/realtime.ts`) en `/api/socket.io`, sobre el mismo servidor HTTP:
  - solo WebSocket y desde un origen de confianza (`BASE_URL` y `TRUSTED_ORIGINS`);
  - al conectar se validan la sesión, el MFA y la sede activa con el mismo `PrincipalResolver`;
  - salas `org:<id>:loc:<id>` y `org:<id>:user:<id>`; los eventos solo llevan ids.
- **Revocación** (ADR 0023): una conexión `LISTEN` al canal `clinic_realtime` recibe:
  - las sesiones borradas (trigger de `auth.session`), cuyos sockets se cierran al instante;
  - las revalidaciones (cambio de roles, sede desactivada);
  - los avisos de la bandeja.

  Cada socket se revalida además cada `REALTIME_REVALIDATE_SECONDS` (30 s), sin renovar la sesión. Sin la conexión `LISTEN`, cierra los sockets y no acepta nuevos hasta recuperarla.
- **Notificaciones** (`src/notifications.ts`): `GET /api/notifications`, `POST /api/notifications/:id/read`, `read-all` y `clear`.
  - Solo los avisos propios de la organización activa.
  - No se auditan (ADR 0008).

## Al actualizar Better Auth

Better Auth está fijado en **1.7.7** (publicada el 2026-09-30), sin `^`. Para cualquier actualización:

1. **Antigüedad:** elegir una versión estable publicada hace al menos 2 semanas (`pnpm view better-auth time`).
2. **Pruebas:** ejecutar `pnpm test` completo. Revisar en especial `test/config.test.ts` (condición 4 del ADR 0023): `cookieCache` apagado, códigos de recuperación cifrados, registro cerrado, telemetría y `trustDevice`.
3. **Comportamientos a revisar en el changelog:**
   - el orden de los hooks: los nuestros corren antes que los del plugin `twoFactor` (`src/auth.ts`, inicio de sesión pendiente de MFA);
   - `disableSignUp`, que sigue sin usarse;
   - los nombres de las cookies;
   - el esquema de `twoFactor` (`packages/db/src/auth-schema.ts`, comparar con `getAuthTables`).
4. **Permisos:** si cambian las operaciones sobre `auth.*`, medirlas como en T-002 y ajustar los GRANT de `packages/db/migrations/0003_identity_rls.sql`.
5. **Registro:** anotar la versión y la fecha en el ADR 0023.
