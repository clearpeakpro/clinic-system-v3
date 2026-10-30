# 0019. Códigos, transacciones, idempotencia y outbox

- **Estado:** Aceptada (el cifrado de campos se decidió en el [ADR 0026](0026-cifrado-campos-busqueda.md))
- **Fecha:** 2026-10-24

## Contexto

Hay que resolverlo antes del esquema.

## Decisión

Códigos con `code_counters` en la misma transacción y `UNIQUE (organization_id, code)`. Formatos: `P-000123`, `LAN-V-000123`, `LAN-O-000123`, `LAN-R-2026-000045`. Orden y cargo en una sola transacción; pago con `FOR UPDATE` y auditoría en la misma transacción; anulaciones como filas inversas; centavos con CHECK. `Idempotency-Key` obligatorio en llegada, kiosco, pagos y anulaciones (24 h; 409 si cambia el contenido; se guardan solo el estado y los ids, ver abajo). Índices únicos parciales. pg-boss con `singletonKey` y trabajos idempotentes. Outbox transaccional para entregas fiables.

## Idempotencia sin guardar la respuesta (T-008, 2026-10-29)

**Revisión:** `idempotency_keys` no guarda la respuesta completa, que en la fase 3 (llegada, kiosco, pagos) podría llevar datos de pacientes. Guarda organización, clave, hash de la petición (método, ruta y cuerpo canónico), **código de estado e ids del recurso creado**, durante 24 h.

- **La clave se reserva en la misma transacción que el cambio.** Si el cambio falla, la clave no queda guardada y la petición se puede reintentar.
- **Misma clave y mismo contenido:** se vuelve a leer el recurso con las mismas comprobaciones de permisos de quien llama y se devuelve con el estado guardado.
- **Misma clave con otro contenido:** `409 idempotency_key_reused`.
- **Dos peticiones a la vez con la misma clave:** la segunda espera a la primera (índice único) y se comporta como una repetición.
- **Purga:** el worker borra cada día las claves vencidas, con una función de la base de datos. `clinic_app` no tiene `DELETE` en esa tabla.

Implementación: `apps/api/src/idempotency.ts` (`IdempotencyService` y `@IdempotencyKey()`). Pruebas en `apps/api/test/t008.test.ts`.

## Outbox (T-008, 2026-10-29)

- **Escritura:** `outbox` se escribe en la misma transacción que el cambio (`enqueueMail` de `@clinic/db`). El aviso de `pg_notify` solo sale al confirmarse la transacción.
- **Payload:** va cifrado (AES-256-GCM con `OUTBOX_KEY`, atado a su evento y a su organización) y se borra al entregarse. El enlace de una invitación lleva su token.
- **Entrega, en el worker:**
  - una función `SECURITY DEFINER` devuelve solo pares organización/id pendientes;
  - cada uno va a pg-boss con `singletonKey` = id del evento;
  - el trabajo bloquea la fila dentro de `withTenant` (`FOR UPDATE SKIP LOCKED`), envía y la marca como entregada en la misma transacción. Un evento repetido no se procesa dos veces, y si el worker se cae antes de confirmar, el evento sigue pendiente.
- **Límite de «al menos una vez»:** si el worker se cae después de que el servidor de correo acepte el mensaje, el correo puede llegar dos veces. Lleva `Message-ID` = id del evento.
- **Reintentos:** con espera creciente. Al agotarse, el evento queda `failed`, su payload se borra, se audita `mail.failed` y Usuarios muestra «Correo no entregado» junto a «Reenviar».
- **Qué va por el outbox:**
  - los correos de invitación; los restablecimientos de contraseña no se envían por correo (T-006a);
  - desde T-009, las notificaciones guardadas ([ADR 0008](0008-historial-notificaciones.md)): tipo `notification` y `enqueueNotification`.
    - El worker las guarda en `notifications` y avisa a los sockets de la persona (`pg_notify('clinic_realtime')`) en la misma transacción que marca el evento.
    - Sin efectos fuera de la base de datos, así que se entregan una sola vez.
    - Si no se pueden guardar, reintentos; al agotarse, `failed` y `notification.failed` en la auditoría.
