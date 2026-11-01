# 0038. Reporte diario de la sede antes del piloto

- **Estado:** Aceptada
- **Fecha:** 2026-11-01
- **Resuelve:** P-22.
- **Relacionadas:** [ADR 0010](0010-recepcion-reportes-rango.md) (reportes por rango, P-03) y [ADR 0018](0018-auditoria.md) (impresiones auditadas).
- **Implementación:** T-031 ([FASE-3](../tasks/FASE-3.md)).

## Contexto

La arquitectura deja los reportes para la fase 5, pero el piloto empieza al terminar la fase 4. Sin el reporte diario, Recepción no puede cuadrar la caja con el efectivo y los comprobantes al cerrar el día.

## Decisión

- En la parte 3B entra **solo la pestaña «Diario» de la sede** (S-CAJ-18, 19 y 21): visitas, cobertura, citas, total facturado, total recibido y recibido por método, en el día de la sede.
- Se imprime con auditoría previa (S-CAJ-24).
- Siguen en la fase 5: la pestaña «Rango» y su CSV (P-03), los reportes de la compañía, «Saldo pendiente» y «Bono».

## Consecuencias

- Las cifras las calcula el servidor con el día de la sede, y se prueban también en un día con cambio de horario.
- El reporte lo ven Recepción, y el Propietario y el Administrador con rol clínico en la sede ([ADR 0027](0027-acceso-clinico-propietario-administrador.md)).
