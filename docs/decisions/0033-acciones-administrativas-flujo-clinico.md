# 0033. Acciones administrativas en el flujo clínico

- **Estado:** Aceptada
- **Fecha:** 2026-11-01
- **Resuelve:** P-17.
- **Relacionadas:** [ADR 0003](0003-enviar-al-proveedor.md) (excepción de «Enviar al proveedor»), [ADR 0009](0009-editar-nacimiento-inactivar.md) y [ADR 0027](0027-acceso-clinico-propietario-administrador.md) (sin acceso clínico implícito).
- **Implementación:** T-018, T-022, T-025 y T-028 ([FASE-3](../tasks/FASE-3.md)).

## Contexto

El manual reserva al Administrador varias acciones del flujo clínico y de Caja: «Forzar estado…» (incluso reabrir una visita cerrada o pasar con órdenes abiertas), anular cargos y pagos, la excepción de «Enviar al proveedor» sin signos vitales (ADR 0003) y crear órdenes. Pero según el ADR 0027 el Administrador sin rol clínico no ve pacientes.

## Decisión

- **Forzar estado o reabrir una visita, anular cargos y pagos y autorizar la excepción de «Enviar al proveedor»** son permisos administrativos del Propietario y el Administrador que **solo valen junto a un rol clínico** (Recepción, Enfermería o Proveedor) en la sede. Es el mismo patrón que la fecha de nacimiento (ADR 0009).
- Todas exigen un motivo, quedan auditadas y se marcan como forzadas o excepcionales en el historial de la visita.
- **Las órdenes las crea solo quien tiene el rol Proveedor** en la sede. El Administrador no crea órdenes por serlo.
- **Recepción cobra, pero no anula.** Así se separa quien cobra de quien anula.

## Consecuencias

- En `packages/shared/src/permissions.ts` se añaden permisos propios (nombres orientativos: `visits.force_state`, `billing.void` y `nursing.send_exception`), asignados al Propietario y al Administrador. La API exige además el acceso clínico en la sede, como con `patients.edit_birth_date`.
- Un Administrador que necesite usarlos pide al Propietario que le asigne un rol clínico, porque solo el Propietario puede asignárselo a sí mismo (ADR 0027).
- La web oculta estas acciones a quien no tiene los dos permisos, y la API las rechaza siempre.
