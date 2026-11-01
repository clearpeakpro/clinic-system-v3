# T-015 — Gestión de citas

**Tamaño:** 4 días · **Depende de:** T-014 · **Pantallas:** S-REC-10, 11, 12, 13, 14, 15, 16, 17

**Incluye**
1. Nueva cita y Editar cita (S-REC-10):
   - selector de paciente (S-REC-12) con la búsqueda de T-012;
   - tipo de cita (la duración por defecto sale del catálogo), fecha, hora, duración, proveedor y notas;
   - en edición, la fecha y la hora no se cambian: se reprograman.
   - Desde la agenda y desde el perfil del paciente («Nueva cita»).
2. **Aviso de solapamiento del proveedor** (S-REC-11): no bloquea, y aparece **igual** al crear, editar y reprogramar (el manual lo hacía distinto en cada caso).
3. Acciones:
   - Confirmar.
   - Reprogramar (S-REC-13).
   - Cancelar con motivo obligatorio (S-REC-14), con el botón seguro «Volver» en lugar de «Seguir editando».
   - Marcar como no presentado con confirmación (S-REC-15), solo después de la hora de la cita.
   - Conflicto de versión (S-REC-16) y descartar cambios (S-REC-17).
   - No se puede agendar a un paciente inactivo ni en una sede inactiva.
4. Tiempo real:
   - cada cambio emite un evento en vivo (solo ids y estado), y la agenda y el Panel abiertos en otra ventana se actualizan sin recargar;
   - **incluye editar y marcar no presentado** (en el manual no se propagaban).
5. **Primeros avisos reales de la campana**, a través del outbox:
   - «Cita asignada a usted» al proveedor, cuando le asignan una cita;
   - «Cita actualizada» cuando cambia una cita suya.
   - Sin nombres de pacientes: solo el código de la cita y la hora.
   - Al tocar el aviso, abre el detalle de la cita.
6. Auditoría de cada acción, con el motivo cuando se exige.
7. «Registrar llegada» aparece en las citas de hoy, pero **deshabilitado**, con el texto «Llega en la fase 3».

**Terminada cuando:**
- Recepción crea una cita para el proveedor de NOR1;
- el proveedor, en otra ventana, ve el aviso en la campana y la cita aparece en su agenda sin recargar;
- reprogramar un horario solapado muestra el aviso;
- cancelar sin motivo no se permite;
- todo queda auditado.

**Decisiones (2026-10-31, con el dueño del producto):**
- **Permiso `appointments.manage`:** Recepción y Proveedor (el Proveedor, solo en sus citas: `provider_scope`). El Propietario y el Administrador lo tienen solo si además tienen uno de esos roles en la sede (ADR 0027), aunque el manual daba acceso completo al Administrador.
- **Solapamiento del proveedor, como en Stitch:** se comprueba **antes de guardar**, al cambiar la fecha, la hora, la duración o el proveedor:
  - banner ámbar arriba del formulario, «Ocupado» junto al Proveedor y «Se permite guardar como sobrecupo»;
  - se vuelve a comprobar al guardar, y el aviso es igual al crear, editar y reprogramar;
  - nunca bloquea.
- **Solo desde hoy en la sede:** se puede crear o reprogramar una cita hoy a cualquier hora o en días futuros, nunca en días anteriores.
  - Se valida en el formulario y en el servidor (`appointment_in_past`), con un mensaje claro.
  - Las citas pasadas que ya existen se siguen viendo, y sus acciones siguen la matriz de estados.
- **Avisos de la campana** (por el outbox, sin nombres de pacientes). El cuerpo lleva el código y la fecha y la hora en la sede: «Cita NOR1-A-000045 · 3 nov, 9:00 a. m.».
  - «Cita asignada a usted»: al proveedor nuevo, cuando se crea una cita para él o se la asignan.
  - «Cita reasignada»: al proveedor anterior, cuando la cita sale de su agenda.
  - «Cita actualizada»: al proveedor de la cita, cuando otra persona la cambia.
  - Nadie recibe un aviso por un cambio que hizo él mismo.
- **Al tocar un aviso de cita:**
  - abre el detalle en la agenda del día de la cita;
  - si la cita es de otra sede de la persona, cambia antes a esa sede;
  - si ya no tiene acceso a esa sede, solo marca el aviso como leído y muestra «No tiene acceso a esta cita.».
- **Lo que no se construye de Stitch (S-REC-10):** «Expediente validado» y «Programación integrada con el expediente clínico», porque no existen en el modelo. El campo se llama «Notas», como en el manual.

**Cómo quedó (2026-10-31):**
- **API** (`apps/api/src/appointment-commands.ts`, rutas en `http.ts`), todas con `appointments.access` y `appointments.manage`:
  - `GET /api/appointments/form-options`: proveedores activos de la sede, alcance de quien llama y hoy en la sede.
  - `POST /api/appointments/overlap`: solapamiento antes de guardar, sin datos del paciente (no se audita).
  - `POST /api/appointments` (con `Idempotency-Key`), `POST /api/appointments/:id` (editar), `/:id/reschedule`, `/:id/confirm`, `/:id/cancel` y `/:id/no-show`, con `expectedVersion` (409 `version_conflict`).
  - Errores propios: `appointment_in_past`, `provider_scope`, `patient_inactive`, `appointment_type_inactive`, `invalid_provider`, `appointment_not_editable`, `invalid_appointment_transition` y `no_show_before_start`.
  - Cada respuesta lleva solo ids, código, estado, versión y `warnings: ['provider_overlap']`; la web relee el detalle.
- **Auditoría:** `appointment.created`, `.updated` (solo los nombres de los campos), `.rescheduled`, `.confirmed`, `.cancelled` (con el motivo) y `.no_show`, en la misma transacción.
- **Tiempo real:** `appointment.changed` a la sala de la sede, con el id y el estado (el mensaje solo admite estados como constantes). La web agrupa las ráfagas cada 500 ms y relee la agenda, el detalle, «N citas hoy» y las citas del perfil. Incluye editar y no presentado.
- **Avisos:** `appointment.assigned`, `appointment.reassigned` y `appointment.changed`, con `notifications.starts_at` (migración 0026). La lista devuelve la fecha y la hora en la sede, el día y si la persona tiene acceso a Citas en esa sede.
- **Permisos nuevos:** `appointments.manage` (Recepción y Proveedor) y `appointments.check_in` (Recepción; solo muestra «Registrar llegada» deshabilitado hasta la fase 3).
- **Web:**
  - `appointment-form-dialog.tsx` (S-REC-10 y 11), `patient-picker-dialog.tsx` (S-REC-12) y `appointment-detail-dialog.tsx` (S-REC-09, 13 a 16);
  - S-REC-17 es `DiscardChangesDialog`;
  - `?cita=<id>` en la agenda abre el detalle.
  - El formulario y Reprogramar guardan con la versión que se vio al abrirlos, aunque el detalle se actualice en vivo mientras tanto.
- **Pruebas:**
  - `apps/api/test/appointment-commands.test.ts`: alcance, matriz, solapamiento, pasado, versión, idempotencia, avisos, evento en vivo y aislamiento;
  - `apps/web/e2e/citas-gestion.spec.ts`: el flujo con dos ventanas y axe.
