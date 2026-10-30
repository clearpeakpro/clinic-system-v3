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
   - conflicto de versión (S-PAC-12) con «Actualizar», sin «guardar igualmente».
4. Inactivar y reactivar un paciente, con motivo, solo el Administrador. Un paciente inactivo no aparece en la búsqueda por defecto (hay un filtro para verlo) y no se le pueden agendar citas.
5. Auditoría:
   - cada apertura del perfil (lectura de PHI);
   - las ediciones, guardando solo los nombres de los campos cambiados;
   - inactivar y reactivar.

**Terminada cuando:**
- Recepción edita el teléfono y otra ventana con el perfil abierto recibe el conflicto de versión al guardar;
- Recepción no puede cambiar la fecha de nacimiento;
- el Administrador sí puede, con motivo, y queda auditado.
