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
4. Detalle de la cita (S-REC-09), en solo lectura en esta tarea; las acciones llegan en T-015.
5. El subtítulo del Panel («N citas hoy») pasa a usar datos reales.
6. Semilla: citas ficticias de hoy, ayer y los próximos días, en las dos clínicas y con todos los estados.

**Terminada cuando:**
- la agenda de NOR1 muestra solo citas de NOR1, en hora Central, incluido un día con cambio de horario (prueba);
- los filtros funcionan;
- desde Sur no se ve nada de Norte.
