# 0008. Historial de notificaciones

- **Estado:** Aceptada
- **Fecha:** 2026-10-22

## Contexto

Las notificaciones solo vivían en memoria.

## Decisión

Se guardan 30 días en la base de datos.

## Implementación (T-009, 2026-10-29)

- **Tabla `notifications`** (por organización, con RLS forzado): destinatario, sede, tipo, entidad y código humano (`NOR1-V-000123`). Nunca nombres ni datos de pacientes.
- **Llegan por el outbox** ([ADR 0019](0019-operaciones-criticas.md)): quien genera un aviso lo escribe con `enqueueNotification` en la misma transacción que su cambio. El worker lo guarda y avisa a los sockets de la persona, todo en una transacción.
- **Regla del manual (S-GEN-15):** un aviso no leído sobre la misma entidad y del mismo tipo se reemplaza por el nuevo.
- **La campana** muestra los avisos de la organización activa de los últimos 30 días, hasta 100.
- **Marcar como leído y «Borrar»:**
  - no se auditan: es el estado personal de la bandeja, sin datos del negocio ni de pacientes;
  - «Borrar» solo los oculta para la persona (`dismissed_at`); las filas se van con la purga.
- **Purga:** el worker borra cada día los de más de 30 días, con una función de la base de datos. `clinic_app` no tiene `DELETE`.
- **Catálogo de tipos y textos:** `packages/shared/src/notifications.ts`, con los textos del manual en «usted».
  - Quien genera cada aviso llega con su fase: paciente asignado, cita, orden, configuración incompleta, actualización requerida y alerta de seguridad.
  - La insignia de «Seguridad» queda fuera hasta que exista su módulo.
