# T-009 — Tiempo real y notificaciones (base)

**Tamaño:** 2 días · **Depende de:** T-004 y T-008 · **Pantallas:** S-GEN-14, 15, 19

## Incluye

- WebSocket (Socket.IO) con salas `org:<id>:loc:<id>`. La membresía se valida al unirse y al reconectar. Los eventos solo llevan ids y estados.
- Revocación: desactivar a un usuario cierra sus sockets en menos de 1 segundo; además, cada socket se revalida cada 30 segundos.
- Indicador «En vivo» en la cabecera y el banner de modo degradado (recarga cada 30 segundos si se cae la conexión).
- Centro de notificaciones con historial de 30 días guardado en la base de datos (ADR 0008), sin nombres de pacientes.
- Pruebas: un socket de A no recibe eventos de B; un usuario revocado queda desconectado.
