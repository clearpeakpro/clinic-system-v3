# 0023. Autenticación con Better Auth

- **Estado:** Aceptada con condiciones
- **Fecha:** 2026-10-27
- **Reemplaza en parte:** ADR 0002 (contexto `app.user_id` de solo lectura; eventos de auditoría sin organización)
- **Evidencia:** [`docs/spikes/T-002-better-auth.md`](../spikes/T-002-better-auth.md)

## Contexto

ADR 0021 condicionó Better Auth a una prueba de 8 criterios. Si fallaba el 3, el 5 o el 6, se pasaba al plan B. La prueba (T-002) pasó los 8: cinco sin condiciones y tres con condiciones (1, 4 y 8). Ninguno de los eliminatorios tiene condiciones.

## Decisión

1. **Better Auth para identidad y sesiones.**
   - Versión exacta fijada.
   - Adaptador de Drizzle; tablas en el esquema `auth`, sin RLS de organización.
   - Solo el plugin `twoFactor` (TOTP y códigos de recuperación).
   - Sin el plugin de organizaciones ni el de administración.
2. **Fuera de Better Auth (nuestro):** permisos, membresías, invitaciones, contexto de organización y sede, la regla de MFA por rol, la expiración absoluta de la sesión, el kiosco, la revocación de WebSockets y la auditoría.
3. **Configuración obligatoria:**
   - `cookieCache` apagado;
   - `storeBackupCodes: 'encrypted'`;
   - `trustDevice` rechazado para todo el personal;
   - telemetría apagada;
   - registro público cerrado con un hook (no con `disableSignUp`, que impide crear cuentas desde el servidor);
   - IP tomada solo de Fastify.
4. **Cambio al ADR 0002:**
   - Además de `app.org_id`, existe el contexto `app.user_id`, **solo de lectura** (`FOR SELECT`) sobre las membresías y roles propios.
   - Se fija únicamente desde la sesión validada, con `withUser`.
   - Escribir sigue exigiendo `app.org_id`.
5. **Auditoría (complementa al ADR 0018):**
   - Los eventos previos a elegir organización van con `organization_id` nulo y **solo los lee el operador de la plataforma**.
   - El correo de un inicio fallido se guarda con HMAC-SHA256 y una clave secreta de configuración.
6. **Actualizaciones:** cada actualización de Better Auth repite la suite de T-002 (ver la condición 4).

## Condiciones de la aceptación

1. **Versión.** Antes de la fase 1, fijar una versión de Better Auth publicada hace al menos 2 semanas y repetir con ella las 54 pruebas de `apps/api` de la prueba T-002.
   - **Cumplida en T-003 (2026-10-27):** **`better-auth@1.7.7`**, publicada el **2026-09-30** (27 días). Es la más reciente con al menos 2 semanas: 1.7.8 salió el 2026-10-14; las beta de 1.8 se descartan.
   - Las 54 pruebas de la rama `spike/t-002-better-auth` pasan con 1.7.7, con las mismas operaciones sobre `auth.*` que con 1.7.14.
   - Fijada sin `^` en `apps/api/package.json`.
2. **Contexto RLS solo por sus funciones.** Añadir a la CI una comprobación que falle si se fija `app.org_id` o `app.user_id` fuera de `withTenant` o `withUser`.
3. **Contraseña y MFA.** En la fase 1, pruebas y permisos mínimos de `clinic_app` para cambiar la contraseña y para desactivar el MFA.
4. **Pruebas que vigilan la configuración.** Las pruebas de `cookieCache` (revocación), de códigos de recuperación cifrados y de registro público cerrado corren siempre en la CI y se revisan en cada actualización de Better Auth.
5. **Operador de la plataforma.** El rol de base de datos del operador (el único que lee los eventos de auditoría sin organización) es una tarea de la fase 1. Queda como pendiente P-11.

## Política de contraseñas y límite de intentos (T-003b, 2026-10-27)

**Contraseñas** (`apps/api/src/password-policy.ts`, `packages/shared/src/password.ts`):

- **Longitud:** de 12 a 128 caracteres. Better Auth la aplica en el alta, el cambio y el restablecimiento (`minPasswordLength` / `maxPasswordLength`), y la API también al aceptar una invitación, con códigos `password_too_short` / `password_too_long`.
- **Sin reglas de composición:** no se exigen mayúsculas, números ni símbolos.
- **Contraseñas comunes:** se rechazan las de una **lista local** de 46,825 contraseñas comunes de 12 o más caracteres (SecLists, MIT; ver `apps/api/data/README.md`), sin distinguir mayúsculas y sin servicios externos. Responde `password_too_common`.
  - Se aplica en todo punto que fija una contraseña: alta, `/change-password` y `/reset-password`, también en las llamadas de servidor.
- **Sin caducidad periódica.**

**Límite de intentos de inicio de sesión:**

- **Por IP (Better Auth):** el límite propio de Better Auth, que en 1.7.7 solo existe por IP y solo se activa por defecto en producción. Aquí se activa **en todos los entornos** (`rateLimit.enabled: true`, en memoria).
  - Reglas de 1.7.7: `/sign-in*`, `/sign-up*` y `/change-password`, 3 intentos cada 10 s por IP y ruta; `/two-factor/*`, 3 cada 10 s.
  - La IP la pone el servidor (`x-clinic-client-ip`).
- **Por cuenta (nuestro):** Better Auth no lo tiene.
  - Con **10 fallos en 15 minutos** sobre el mismo correo, desde cualquier IP, el inicio de sesión responde `429 too_many_attempts` hasta que los fallos salen de la ventana. Es configurable (`SIGN_IN_ACCOUNT_MAX_FAILURES`, `SIGN_IN_ACCOUNT_WINDOW_SECONDS`).
  - Un inicio correcto borra los fallos.
  - Se cuenta por el HMAC del correo (`auth.sign_in_failures`), exista o no la cuenta, así la respuesta no revela si el correo está registrado.
  - Cada bloqueo se audita (`auth.sign_in.throttled`).
- **MFA:** además, el plugin `twoFactor` bloquea la cuenta tras varios códigos fallidos (`failedVerificationCount` / `lockedUntil`).
- **Límite conocido:** el límite por IP vive en memoria. Vale con una instancia (entorno B); con varias (entorno C), pasar a `storage: 'database'`.

Pruebas: `apps/api/test/password-policy.test.ts` y `apps/api/test/sign-in-limits.test.ts`.

## Consecuencias

- Se evita escribir hash de contraseñas, sesiones, cookies y TOTP propios. A cambio, se depende de un proyecto que publica con mucha frecuencia (dos versiones en dos días), y la suite de T-002 se vuelve una prueba de regresión obligatoria.
- **El orden de los hooks** (los de la configuración corren antes que los del plugin) es una trampa documentada. La auditoría de inicios de sesión no puede fiarse de `newSession`.
- **Con varias instancias de la API:** la revocación necesita `LISTEN/NOTIFY`.
- **Esfuerzo estimado para producción:** unos 7 días (ver el informe).
