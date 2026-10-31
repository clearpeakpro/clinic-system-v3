# T-014 — Agenda: vistas e información de la cita

**Tamaño:** 3 días · **Depende de:** T-013 · **Pantallas:** S-REC-06, 07, 08, 09

**Incluye**
1. Tabla `appointments`, con RLS:
   - sede, paciente, proveedor (opcional), tipo, inicio, duración, notas cifradas y `version`;
   - código `A-000045` por sede;
   - estado: Programada, Confirmada, Llegó, Cancelada o No se presentó.
2. **Citas** (S-REC-06):
   - día anterior y siguiente, selector de fecha y «Hoy»;
   - conmutador Día / Lista;
   - filtro de proveedor («Todos», «Mis citas» solo para Proveedor, «Sin asignar»);
   - chips de estado.
   - «Hoy» y todas las horas, en la zona horaria de la sede.
3. Vista Día (S-REC-07), agrupada por hora, con tarjetas, y vista Lista (S-REC-08).
   - El color del tipo de cita (T-011) se usa solo como franja lateral de la tarjeta, nunca como chip, para no confundirlo con el estado.
4. Detalle de la cita (S-REC-09), en solo lectura en esta tarea; las acciones llegan en T-015.
5. El subtítulo del Panel («N citas hoy») pasa a usar datos reales.
6. Semilla: citas ficticias de hoy, ayer y los próximos días, en las dos clínicas y con todos los estados.

**Decisiones (2026-10-31, con el dueño del producto):**
- **Colores de los estados** (mezcla de Stitch y del manual), cada uno con su propio icono para que no dependa solo del color:
  - Programada, gris;
  - Confirmada, azul;
  - Llegó, verde;
  - Cancelada, gris, con el nombre del paciente tachado;
  - No se presentó, ámbar.
- **«Nueva cita»** se ve deshabilitada, con «Llega con la agenda», hasta T-015. **«Sin cita»** no aparece hasta la fase 3.
- **«N citas hoy»** del Panel cuenta todas las citas del día en la sede menos las Canceladas y las No se presentó (S-REC-01 del manual).
- **Acceso:** Enfermería no accede a Citas. Solo Recepción y Proveedor (`appointments.access`), y el Propietario o el Administrador que tengan uno de esos dos roles en la sede (ADR 0027).
- **Perfil del paciente:** en esta tarea se llenan, en solo lectura, la pestaña Citas (S-PAC-07) y la «Próxima cita» del Resumen.
- **Código de la cita:** no va en la tarjeta (como en Stitch); sí en la vista Lista y en el detalle.
- **Lo que no se construye de Stitch:**
  - los botones de las tarjetas («Registrar llegada», «En sala de espera», «Ver expediente», «Reprogramar»): llegan con T-015 y la fase 3;
  - el motivo de cancelación al pie de la tarjeta: va solo en el detalle;
  - «Consultorio» junto al proveedor: no existe en el modelo;
  - un icono por tipo de cita: el catálogo no tiene iconos.
- **El detalle (S-REC-09) es de solo lectura,** sin botonera. Las acciones llegan con T-015.
- **Código por sede:** se guarda completo (`NOR1-A-000045`) y se muestra el corto (`A-000045`). Cada sede tiene su contador en `code_counters`.
- **Semilla:** el único proveedor ficticio de Norte está en NOR2, así que se añade una proveedora ficticia en NOR1 (`proveedora.nor1@example.test`) para que la agenda de NOR1 tenga citas con proveedor.

**Cómo quedó (2026-10-31):**
- **API** (`apps/api/src/appointments.ts`):
  - `GET /api/appointments?date=`: el día de la sede activa, con los proveedores para el filtro. Auditoría `appointment.list`.
  - `GET /api/appointments/:id`: el detalle. Auditoría `appointment.view`.
  - `GET /api/patients/:id/appointments`: la pestaña Citas y la próxima cita, solo de las sedes donde quien llama tiene Citas. Auditoría `patient.appointments_read`.
  - `GET /api/appointments/today-count`: «N citas hoy». Exige `panel.view` y no `appointments.access`, porque en el manual todos los roles del Panel ven el subtítulo (también Enfermería) y el total no lleva PHI.
- **Web:**
  - `/app/<SEDE>/citas?fecha=AAAA-MM-DD` y el Panel con su subtítulo;
  - el detalle se abre en un diálogo de 560 px y, en el teléfono, en una hoja inferior (sin arrastre);
  - las citas Canceladas y No se presentó se atenúan con el color secundario, no con transparencia, para mantener el contraste (axe).
- **Tiempo real:** la agenda todavía no escucha `appointment.changed`, porque en esta tarea nada cambia una cita. Llega con T-015, junto con las acciones.
- **Cambios de horario:** los prueban la API y la E2E con citas propias el 1 de noviembre de 2026, el 7 de noviembre de 2027 y el 14 de marzo de 2027. La semilla es relativa al día en que se siembra.

**Terminada cuando:**
- la agenda de NOR1 muestra solo citas de NOR1, en hora Central, incluido un día con cambio de horario (prueba);
- los filtros funcionan;
- desde Sur no se ve nada de Norte.
