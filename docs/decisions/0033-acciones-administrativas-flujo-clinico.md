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

## Cómo quedó implementada «Forzar estado…» (T-018, 2026-11-01)

- **Permiso:** `visits.force_state`, del Propietario y el Administrador (`packages/shared/src/permissions.ts`). `POST /api/encounters/:id/force` exige además `patients.access`, es decir, un rol clínico en la sede; sin él, 403. Recepción, Enfermería y el Proveedor no lo tienen.
- **Destinos** (`forceTargets()` de `packages/shared/src/visit.ts`, decisión del 2026-11-01: se sigue el manual): todos los estados menos el actual, «Se retiró», «Cancelada» y los destinos a los que ya lleva una acción regular desde ese estado y con esa ruta. Otro destino da 409 `invalid_transition`.
- **Reabrir:** desde una visita cerrada, forzar a un estado abierto la reabre (`closed_at` vuelve a nulo). Si el paciente ya tiene otra visita abierta en la sede: 409 `encounter_already_open`, «El paciente ya tiene una visita abierta en esta sede.» (decisión del 2026-11-01).
- **Motivo obligatorio** (máx. 500), cifrado en `encounter_events` y en la auditoría `encounter.forced` (`forced`, `reopened`). En el historial (S-CLI-24) la entrada lleva el chip «Forzado» y el motivo.
- **Pruebas:** `apps/api/test/encounter-screen.test.ts` (Administrador sin rol clínico, Recepción, Enfermería y Proveedor: 403; destinos regulares y cierres: 409; reabrir y su bloqueo) y `apps/web/e2e/visita.spec.ts` (el Propietario de una organización nueva se asigna Recepción y fuerza con motivo).
- **Pendiente en sus tareas:** la excepción de «Enviar al proveedor» (T-022), la creación de órdenes (T-025) y anular cargos y pagos (T-028).
