# T-008 — Worker, outbox y auditoría completa

**Tamaño:** 3 días · **Depende de:** T-003 · **ADR:** 0018, 0019, 0020

## Incluye

- `apps/worker`: proceso separado con pg-boss que usa `clinic_app` y abre `withTenant` en cada trabajo.
- Tabla `outbox`, escrita en la misma transacción que el cambio. El worker la publica con entrega «al menos una vez» y descarta duplicados por id de evento.
- Envío de correo por el outbox: Mailpit en local, sin SES todavía. Las invitaciones de T-003 pasan a usarlo.
- Auditoría:
  - cadena de hash por organización;
  - trabajo diario que verifica la cadena;
  - en cambios clínicos se guardan solo los nombres de los campos.
- `idempotency_keys` y un middleware de `Idempotency-Key`, listos para la fase 3.
- Pruebas:
  - un evento no se pierde si el worker se cae a mitad del trabajo;
  - un evento repetido no se procesa dos veces;
  - alterar una fila de auditoría rompe la verificación de la cadena;
  - la misma `Idempotency-Key` devuelve la misma respuesta;
  - la misma clave con otro contenido devuelve 409.
