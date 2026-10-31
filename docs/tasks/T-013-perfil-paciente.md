# T-013 — Perfil y edición del paciente

**Tamaño:** 3 días · **Depende de:** T-012 · **Pantallas:** S-PAC-05, 06, 07, 08, 10, 11, 12 · **ADR:** 0009, 0012

**Incluye**
1. Perfil (S-PAC-05) con su encabezado (código, fecha de nacimiento · edad · teléfono, estado) y las pestañas:
   - **Resumen**: próximas citas y última visita (vacía hasta la fase 3).
   - **Citas**: las del paciente, que se llenarán con T-014 y T-015.
   - **Visitas** y **Saldos**: con su estado vacío y un texto que explica que llegan en la fase 3.
   - Documentos queda fuera.
2. El botón **«Nueva cita»** en el perfil (ADR 0012) queda listo para conectarse en T-015.
3. Editar (S-PAC-11):
   - nombre, apellidos, teléfono y fuente de referido;
   - **la fecha de nacimiento solo la cambia un Administrador, con motivo obligatorio** (ADR 0009);
   - conflicto de versión (S-PAC-12) con «Actualizar», sin «guardar igualmente»;
   - **al cambiar el teléfono, el mismo diálogo del alta** si coincide con otro paciente: «Este teléfono ya está registrado en otro paciente», hasta 3 coincidencias, «Guardar de todos modos» como botón principal y «Volver y corregir» como secundario (regresa al formulario con los datos intactos y el foco en el teléfono); solo al pulsar «Guardar», nunca mientras se escribe, y la elección se audita con el teléfono como HMAC (ADR 0030, `SharedPhoneDialog` de `new-patient-dialog.tsx`).
4. Inactivar y reactivar un paciente, con motivo, solo el Administrador. Un paciente inactivo no aparece en la búsqueda por defecto (hay un filtro para verlo) y no se le pueden agendar citas.
5. Auditoría:
   - cada apertura del perfil (lectura de PHI);
   - las ediciones, guardando solo los nombres de los campos cambiados;
   - inactivar y reactivar.

**Decisiones (2026-10-31, con el dueño del producto):**
- «Nueva cita» se ve deshabilitada, con «Llega con la agenda», hasta T-015. No se muestra para pacientes inactivos ni para quien no tiene `appointments.access`.
- En el encabezado, «Origen: {fuente}» de Stitch sí; la sede no (es ambigua: el paciente es de toda la organización). «Fusionar con…» queda fuera (S-PAC-13).
- «Inactivar paciente» y «Reactivar paciente», al pie de «Editar paciente», como acción secundaria que abre su diálogo con motivo.
- La búsqueda por código encuentra siempre al paciente, también inactivo, con el chip «Inactivo».
- Los detalles del referido también se editan; si se quita la fuente, se borran.
- La fecha de nacimiento, inactivar y reactivar los puede hacer el Propietario o el Administrador, siempre que tengan un rol clínico en esa sede, con motivo y auditado ([ADR 0009](../decisions/0009-editar-nacimiento-inactivar.md), revisado).
- El Proveedor solo cambia el teléfono (S-PAC-11 del manual); Enfermería no edita.

**Terminada cuando:**
- Recepción edita el teléfono y otra ventana con el perfil abierto recibe el conflicto de versión al guardar;
- Recepción no puede cambiar la fecha de nacimiento;
- el Administrador sí puede, con motivo, y queda auditado.
