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

- **En T-003, el primer Propietario solo lo crea la semilla de desarrollo** de las dos clínicas ficticias (`pnpm db:seed`, que ejecuta `scripts/seed-dev-owners.ts`). Usuarios:
  - `propietario.norte@example.test`;
  - `propietario.sur@example.test`;
  - contraseña: `DEV_SEED_PASSWORD` de `.env`.
- Al entrar por primera vez, cada uno debe inscribir el MFA.
- **Ningún endpoint crea un Propietario**, ni siquiera por invitación (regla escalonada de abajo).
- En producción lo creará el operador de la plataforma con `pnpm org:create` (T-007).
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
| `GET /me` | sesión | Usuario, estado del MFA, contexto activo y permisos efectivos |
| `GET /me/locations` | sesión | Organizaciones y sedes que puede elegir |
| `POST /context` | sesión | Elegir organización y sede (validado contra `memberships`) |
| `POST /invitations` | `members.invite` | Invitar (correo con enlace de un solo uso, vence a las 48 h) |
| `POST /invitations/accept` | pública | Aceptar: crea la cuenta o usa la sesión; membresía y auditoría en una transacción |
| `POST /memberships/:id/deactivate` | `members.manage` | Quitar la membresía, con motivo; borra sus sesiones en esa organización |
| `POST /memberships/:id/roles` | `members.manage` | Reemplazar roles, con motivo |

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
  - Las pruebas dan a cada cliente su propia IP (`support.ts`).

## Sesiones

- **Inactividad:** `IDLE_TIMEOUT_SECONDS` (30 min por defecto), deslizante.
- **Absoluta:** `ABSOLUTE_TIMEOUT_SECONDS` (12 h por defecto), aplicada por nuestro guard.
- **En la base de datos:** las sesiones viven en `auth.session`, sin `cookieCache`. La revocación vale en la siguiente petición.

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
