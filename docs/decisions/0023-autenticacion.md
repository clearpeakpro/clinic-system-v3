# 0023. Autenticación con Better Auth

- **Estado:** Propuesta
- **Fecha:** 2026-10-27
- **Reemplaza en parte:** ADR 0002 (contexto `app.user_id` de solo lectura; eventos de auditoría sin organización)
- **Evidencia:** [`docs/spikes/T-002-better-auth.md`](../spikes/T-002-better-auth.md)

## Contexto

ADR 0021 condicionó Better Auth a una prueba de 8 criterios. Si fallaba el 3, el 5 o el 6, se pasaba al plan B. La prueba (T-002) pasó los 8: cinco sin condiciones y tres con condiciones (1, 4 y 8). Ninguno de los eliminatorios tiene condiciones.

## Decisión propuesta

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
6. **Antes de producción:**
   - fijar una versión publicada hace al menos dos semanas y repetir la suite de T-002;
   - repetirla con cada actualización.

## Consecuencias

- Se evita escribir hash de contraseñas, sesiones, cookies y TOTP propios. A cambio, se depende de un proyecto que publica con mucha frecuencia (dos versiones en dos días), y la suite de T-002 se vuelve una prueba de regresión obligatoria.
- **El orden de los hooks** (los de la configuración corren antes que los del plugin) es una trampa documentada. La auditoría de inicios de sesión no puede fiarse de `newSession`.
- **Con varias instancias de la API:** la revocación necesita `LISTEN/NOTIFY`.
- **Esfuerzo estimado para producción:** unos 7 días (ver el informe).
