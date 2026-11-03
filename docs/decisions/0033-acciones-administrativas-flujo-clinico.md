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
- **Pendiente en sus tareas:** la excepción de «Enviar al proveedor» (T-022), la creación de órdenes (T-025) y anular cargos y pagos (T-028). Las dos primeras ya están hechas: ver las secciones de abajo.

## Cómo quedó implementada la excepción de «Enviar al proveedor» (T-022, 2026-11-01)

- **Un solo paso** (decisión del 2026-11-01): el Propietario o el Administrador con un rol clínico en la sede pulsa «Enviar con excepción…», escribe el motivo y la visita pasa a «Esperando proveedor». No hay solicitud ni aprobación.
- **Permiso:** `nursing.send_exception`, del Propietario y el Administrador; `POST /api/encounters/:id/send-to-provider` con `reason` exige además `patients.access`. Sin él, o sin el permiso (Enfermería incluida), 403.
- **Máquina de estados:** los pasos siguen siendo los de `visit.ts` (desde «Esperando enfermería», iniciar y enviar; desde «Con enfermería», enviar; solo ruta Estándar). La excepción solo salta el rol dueño del paso (`asOwner`) y el requisito de peso o presión.
- **Registro:** el motivo va cifrado en la fila `send_to_provider` del historial (chip «Excepción» en S-CLI-24) y en la auditoría `encounter.nursing_exception`.
- **En la web:** solo se ofrece cuando no hay peso ni presión guardados, desde el botón de la sección Enfermería o desde el diálogo «Sin signos vitales».
- **Pruebas:** `apps/api/test/nursing.test.ts`.

## Cómo quedaron las órdenes (T-025, 2026-11-02)

- **Crear:** `orders.create`, solo del rol Proveedor. El Propietario y el Administrador no lo tienen, ni siquiera con un rol clínico: `POST /api/encounters/:id/orders` les responde 403. También a Recepción y a Enfermería.
- **Cancelar:** `orders.cancel`, del Proveedor, solo en las órdenes que ordenó o de visitas donde es el proveedor (`order_not_owned`), con la visita abierta. La anulación administrativa de cargos y pagos (`billing.void`, Propietario o Administrador con rol clínico, también con la visita cerrada) llega con T-028.
- **Pruebas:** `apps/api/test/orders.test.ts`.

## Quién ejecuta las órdenes (decisión del 2026-11-02, al planificar T-026)

El manual (S-CLI-03, 19, 20 y 22) da al Administrador acceso completo a ejecutar órdenes e «Iniciar» aunque estén asignadas a otra persona. Con el ADR 0027 (sin acceso clínico implícito) se decide:

- **Ejecutan órdenes** (iniciar, completar, asignar y la Cola de órdenes) **solo quienes tienen el rol Enfermería o Proveedor en la sede** (`orders.execute`). El Propietario y el Administrador también, pero solo si tienen uno de esos dos roles en la sede; por serlo, no.
- **Nadie pasa por encima de la asignación:** una orden asignada a otra persona solo la inicia esa persona (`403 order_assigned_to_other`), también para el Propietario y el Administrador con rol clínico. Antes, cualquiera que ejecuta puede reasignarla o quitar la asignación. Completar no exige ser quien la inició.
- **A quién se asigna:** a cualquier persona activa con rol Enfermería o Proveedor en la sede (`400 assignee_not_eligible` si no). La lista de S-CLI-22 las muestra a todas (el manual solo mostraba proveedores).
- **Cola de órdenes (S-CLI-03):** la tarjeta muestra el nombre y el código del servicio, los códigos del paciente, de la visita y de la orden, la cantidad, el tipo, el estado, el personal y el estado de la visita. Nunca nombres de pacientes ni notas. Los avisos y los eventos en vivo siguen llevando solo códigos e ids.

**Implementación (T-026):** `orderActions()` de `packages/shared/src/orders.ts` (la misma regla en la web y en la API) y `OrderService.start/complete/assign/queue` de `apps/api/src/orders.ts`. Pruebas en `apps/api/test/orders-queue.test.ts`.
