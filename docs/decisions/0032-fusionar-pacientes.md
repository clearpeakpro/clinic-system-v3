# 0032. Fusionar pacientes duplicados

- **Estado:** Aceptada
- **Fecha:** 2026-11-01
- **Resuelve:** P-16.
- **Relacionadas:** [ADR 0009](0009-editar-nacimiento-inactivar.md) (cambios sensibles con motivo), [ADR 0018](0018-auditoria.md) (auditoría), [ADR 0027](0027-acceso-clinico-propietario-administrador.md) (sin acceso clínico implícito) y [ADR 0030](0030-busqueda-pacientes-un-campo.md) (búsqueda y duplicados).
- **Implementación:** T-030 ([FASE-3](../tasks/FASE-3.md)), antes del piloto.

## Contexto

En el piloto habrá pacientes duplicados reales, aunque el alta avise de posibles duplicados (S-PAC-03). El manual propone «Fusionar con…» en el perfil (S-PAC-13 y 14), y la columna `merged_into` existe desde T-012. Faltaba decidir quién fusiona, qué pasa con lo que tiene el duplicado, si se puede deshacer y cómo se audita.

## Decisión

- **Quién:** el Propietario o el Administrador, **solo si además tiene un rol clínico en la sede** (el mismo criterio que la fecha de nacimiento, ADR 0009 y 0027). Recepción, Enfermería y el Proveedor no fusionan.
- **Qué pasa al paciente que se conserva:** todo lo del duplicado:
  - citas pasadas y futuras, visitas, órdenes, cargos, pagos y saldos;
  - su historia clínica de paciente (alergias y antecedentes, [ADR 0036](0036-valoracion-paciente-visita.md));
  - sus membresías;
  - los códigos de las sedes donde el principal no tiene código. Los demás códigos quedan en el duplicado, y buscarlos lleva al principal.
- **Bloqueo:** no se fusiona si los dos pacientes tienen una visita abierta en la misma sede. Primero se cierra una.
- **Irreversible:** no se puede deshacer. Por eso exige:
  - que los dos registros estén activos y sean distintos;
  - un motivo obligatorio;
  - escribir «FUSIONAR» y confirmar en un diálogo destructivo.
- **El duplicado no se borra:** queda en estado «Fusionado», con `merged_into` apuntando al principal.
- **Auditoría:** `patient.merge`, en la misma transacción, con los ids de los dos pacientes, quién lo hizo, la sede, el motivo y los conteos de lo movido (citas, visitas, órdenes, cargos y pagos). **Sin nombres** ni datos clínicos.

## Consecuencias

- La fusión es una sola transacción, con `version` de los dos pacientes (409 si cualquiera de los dos cambió).
- Cada tabla que apunta a un paciente debe entrar en la fusión. T-030 lleva una prueba que falla si aparece una tabla nueva con referencia a `patients` que la fusión no trata.
- Un error al fusionar no se corrige desde la aplicación: haría falta una intervención del operador, con su propio registro.

## Precisiones del 2026-11-07 (plan de T-030)

Al planificar T-030 aparecieron casos que la decisión original no cubría. El dueño del producto aprobó estas reglas:

**Nota sobre los códigos:** en v3 cada paciente tiene **un solo código por organización** (`P-000123`), no un código por sede como en el prototipo. Por eso la fusión no traslada códigos: el del duplicado se queda en el duplicado, y buscarlo (en Pacientes o en la cabecera) lleva al principal. La regla «los códigos de las sedes donde el principal no tiene código» no aplica.

| # | Tema | Decisión |
| --- | --- | --- |
| 1 | Filas que la aplicación no puede cambiar (pagos, recibos, historia del paciente, eventos y titular de la membresía) | Se mueven con una función de la base, `app.merge_patient()`, `SECURITY DEFINER`, que solo puede ejecutar `clinic_app`, comprueba que la organización es la del contexto RLS y cambia **solo la columna del paciente**. Para el resto de la API esas tablas siguen siendo de solo lectura e inserción. |
| 2a | Solo uno de los dos está en una membresía en curso (Pendiente de pago, Activa o Suspendida), como titular o afiliado | Pasa al principal con su papel, sus cuotas, sus pagos, su historial y los beneficios usados (se cuentan por membresía y año, y siguen valiendo). |
| 2b | Los dos están en una membresía en curso (aunque sea la misma) | **Se bloquea** (`409 both_in_membership`): «Los dos pacientes están en una membresía. Quite a uno como afiliado o cancele una membresía antes de fusionar.» |
| 2c | Membresías canceladas o afiliados dados de baja | Pasan al principal como historia, sin bloquear. |
| 3 | Historia del paciente y alergias | Se crea una **versión nueva** de la historia del principal que combina las dos (auditoría `patient.history_saved`, solo nombres de campos). Las versiones antiguas del duplicado se quedan en el duplicado como rastro. En cada apartado de texto: si solo uno tiene texto, ese; si los dos y son distintos, el del principal, una línea en blanco, «Del registro fusionado P-000123:» y el del duplicado. Alergias: si cualquiera las tiene registradas, «registradas» (con los textos); si no, «Sin alergias conocidas» si alguno lo marcó; si no, «Alergias no registradas». «Sin alergias conocidas» nunca tapa una alergia registrada. La versión combinada no tiene visita: `patient_histories.source` (`assessment` o `merge`) y la visita vacía solo con `merge`. |
| 4 | Recibos, saldos, «Crédito a favor» y kiosco | Los recibos pasan al principal y su instantánea no cambia: al reimprimir sale el nombre y el código del día en que se emitió. Saldos y «Crédito a favor» van por visita y pasan con ella; aparecen juntos en Saldos del principal y no se compensan entre sí (en V1 no hay reembolsos ni traspasos). Los registros del kiosco del duplicado pasan al principal; los pendientes siguen en la cola de Recepción. |
| 5 | Otros bloqueos | Los dos registros activos, distintos y sin fusionar (`409 patient_not_active` / `patient_merged`); un inactivo se reactiva antes. Las citas que se cruzan y las visitas abiertas en sedes distintas no bloquean. |
| 6 | Datos personales del principal | No se copia nada del duplicado (teléfono, fuente de referido, sede de alta). La página muestra los dos registros lado a lado; lo que falte se edita en el principal. |
| 7 | «Incluir fusionados» (S-PAC-01) | Fuera. Un fusionado se alcanza por su código (que lleva al principal) o por enlace directo, que muestra su banner. |
| 8 | Permiso y evento en vivo | `patients.merge` para el Propietario y el Administrador, que solo vale junto a `patients.access` (un rol clínico en la sede). Evento `patient.changed` (`{ id, mergedInto }`, sin nombres) a todas las sedes de la organización: quien tenga abierto el perfil del duplicado ve una vez el aviso con «Abrir registro principal». |

Además, la palabra de confirmación es **«FUSIONAR»** (en el manual, «MERGE»).

## Cómo quedó implementada (T-030, 2026-11-07)

- **Base de datos:** migraciones `0049` y `0050`.
  - `patient_histories.source` (`assessment` o `merge`): la versión combinada de una fusión es la única sin visita (CHECK).
  - `app.merge_patient_rows(duplicado, principal)`: `SECURITY DEFINER` de `clinic_owner`, `search_path` vacío, solo la ejecuta `clinic_app`. Exige el contexto RLS y que el duplicado ya esté fusionado con ese principal (`merged_into`). Cambia solo la columna del paciente en `payments`, `receipts`, `patient_memberships` (titular), `patient_membership_members` y `patient_membership_events`, y devuelve los conteos.
  - Prueba con el rol real: `packages/db/test/patient-merge.test.ts` (sin fusionar, otra organización o sin contexto, se rechaza; la aplicación sigue sin poder cambiar un recibo).
- **Compartido** (`packages/shared/src/patient-merge.ts`): `mergePatientsSchema` (con «FUSIONAR», sin distinguir mayúsculas), los bloqueos y sus mensajes, `combineHistories()` (decisión 3) y el permiso `patients.merge` (Propietario y Administrador, solo junto a `patients.access`).
- **API** (`apps/api/src/patient-merge.ts`, con el reloj inyectable):
  - `GET /api/patients/:id/merge-preview?with=<id>`: las dos tarjetas (citas, visitas, sedes con visita abierta, membresía en curso) y los bloqueos. Lectura auditada (`patient.merge_preview`).
  - `POST /api/patients/:id/merge` (`:id` es el duplicado), con `Idempotency-Key`. En una transacción: los dos pacientes bloqueados en el mismo orden, sus versiones (409), el estado de sus membresías al día (`settleMembership`), los bloqueos (`409 same_patient`, `patient_merged`, `patient_not_active`, `open_visits_same_location` con las sedes, `both_in_membership`), la historia combinada, `merged_into` (también en los que ya apuntaban al duplicado), citas, visitas y registros del kiosco con su versión nueva, la función de la base, la auditoría `patient.merge` y los eventos.
  - `MERGE_PATIENT_TABLES` enumera cómo se trata cada tabla con referencia a `patients`; la prueba falla si aparece una que no está.
  - Buscar el código de un fusionado devuelve al principal; el perfil trae `mergedInto` (id y código).
  - Eventos: `patient.changed` con los ids a todas las sedes activas, y `encounter.changed` de las visitas abiertas que pasaron.
- **Web:**
  - S-PAC-13 en `/app/<SEDE>/pacientes/<id>/fusionar`: búsqueda de un solo campo sin el paciente abierto, tarjetas «Principal (se conserva)» y «Duplicado (se fusiona)», «Invertir dirección», los bloqueos explicados, motivo, «Escriba FUSIONAR para confirmar» y el diálogo S-PAC-14 con los dos nombres.
  - S-PAC-05: «Fusionar con…», el chip «Fusionado», el aviso con «Abrir registro principal», sin «Editar» ni «Nueva cita», y el snackbar en vivo, una vez.
- **Pruebas:** `apps/api/test/patient-merge.test.ts` (todo pasa al principal, bloqueos, versiones, quién fusiona, idempotencia y auditoría sin nombres), `packages/shared/test/patient-merge.test.ts` y la E2E `apps/web/e2e/fusionar.spec.ts`.
