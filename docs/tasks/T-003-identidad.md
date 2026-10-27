# T-003 — Identidad en main (solo backend)

**Tamaño:** 3–4 días · **Depende de:** T-002 · **ADR:** 0021, 0023, 0002

**Objetivo:** pasar a main, con calidad de producción, lo que la prueba de T-002 demostró. Además, cumplir las condiciones 1, 2 y 4 del ADR 0023.

## Incluye

- Better Auth fijado en una versión con al menos 2 semanas de antigüedad (condición 1). Anotar la versión y la fecha en el ADR 0023.
- `apps/api` (NestJS + Fastify) con:
  - montaje de Better Auth en `/api/auth/*` (TOTP, códigos de recuperación cifrados, `cookieCache` apagado);
  - hook que cierra el registro público;
  - expiración por inactividad y expiración absoluta;
  - guard de MFA por rol;
  - `POST /context` para elegir organización y sede;
  - revalidación de la membresía en cada petición.
- Tablas `memberships`, `membership_roles`, `invitations` y `audit_log` en `packages/db`, con sus migraciones y políticas, incluidas las de solo SELECT basadas en `app.user_id`.
- Invitaciones: crear, aceptar (en una transacción, con el token guardado como hash) y vencer. El correo se simula: en local se ve en Mailpit (añadirlo a docker compose).
- Revocación: desactivar un usuario o quitarle la membresía invalida sus sesiones.
- Eventos de autenticación en `audit_log`. El correo se guarda con HMAC.
- Comprobación en la CI (condición 2): falla si aparece `set_config('app.org_id'` o `set_config('app.user_id'` fuera de `withTenant` o `withUser`, o con el tercer argumento distinto de `true`.
- Pruebas de configuración (condición 4): `cookieCache` apagado, códigos de recuperación cifrados, registro cerrado. Corren siempre en la CI.
- Traer de la rama de la prueba las pruebas de los criterios 1 a 8 que apliquen. El kiosco queda para la fase 3.

**No incluye:** pantallas ni el kiosco.

**Terminada cuando:** todas las pruebas de T-001 y las de los criterios 1 a 6 y 8 pasan en main, y la comprobación de la condición 2 falla si se introduce un `set_config` incorrecto a propósito (anotar el resultado en el PR).
