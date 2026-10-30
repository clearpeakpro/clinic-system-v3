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
