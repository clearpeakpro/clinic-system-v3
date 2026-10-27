# 0019. Códigos, transacciones, idempotencia y outbox

- **Estado:** Aceptada (excepto cifrado de campos, pendiente)
- **Fecha:** 2026-10-24

## Contexto

Hay que resolverlo antes del esquema.

## Decisión

Códigos con `code_counters` en la misma transacción y `UNIQUE (organization_id, code)`. Formatos: `P-000123`, `LAN-V-000123`, `LAN-O-000123`, `LAN-R-2026-000045`. Orden y cargo en una sola transacción; pago con `FOR UPDATE` y auditoría en la misma transacción; anulaciones como filas inversas; centavos con CHECK. `Idempotency-Key` obligatorio en llegada, kiosco, pagos y anulaciones (24 h; 409 si cambia el contenido). Índices únicos parciales. pg-boss con `singletonKey` y trabajos idempotentes. Outbox transaccional para entregas fiables.
