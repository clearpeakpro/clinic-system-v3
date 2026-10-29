# 0025. Sin rol de contabilidad en V1

- **Estado:** Aceptada
- **Fecha:** 2026-10-29
- **Resuelve:** P-04 y el punto pendiente del [ADR 0011](0011-roles-v3.md).

## Decisión

El rol de solo lectura para contabilidad no entra en V1. El catálogo de roles de V1 es Propietario, Administrador, Recepción, Enfermería / asistente médico y Proveedor (`packages/shared/src/permissions.ts`).

## Consecuencias

- **Sin rol ni permisos:** no se crea el rol ni sus permisos; los reportes y la Caja siguen con los roles actuales.
- **Si se quiere más adelante:** se añade con un ADR nuevo y su lugar en la regla escalonada, por debajo del Administrador.
