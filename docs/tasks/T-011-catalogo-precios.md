# T-011 — Catálogo mínimo y precios por sede

**Tamaño:** 3 días · **Depende de:** fase 1 · **Pantallas:** S-ADM-13, 14, 15, 18, 19, 20 · **ADR:** 0016, 0019

**Objetivo:** que cada clínica configure lo que se agenda y lo que se cobra, antes de que existan las citas y la Caja.

**Incluye**
1. Tablas, con RLS, claves foráneas compuestas y `version`:
   - `appointment_types`: código, nombre, duración por defecto, ruta sugerida, color de la agenda, orden y activo.
   - `procedures`: código, nombre y tipo (Procedimiento o Inyección).
   - `lab_tests`: código y nombre.
   - `referral_sources`: código y nombre.
   - `prices`: ítem, sede, importe en centavos y vigencia desde.
   - El código de cada ítem es único por organización.
2. Reglas:
   - Se desactiva, nunca se borra.
   - Un precio nuevo no modifica los anteriores: se crea con su fecha de vigencia y el historial se conserva.
   - El precio vigente se calcula en el servidor para una sede y un momento dados.
3. Pantallas:
   - **Catálogos** con pestañas: Tipos de cita, Procedimientos, Pruebas de laboratorio y Fuentes de referido.
   - Formulario Nuevo/Editar.
   - Confirmación «¿Desactivar…?» con motivo.
   - Precios por sede dentro de Procedimientos y Pruebas, con un selector de sede.
4. Permisos: solo Propietario y Administrador gestionan el catálogo. Los demás roles solo leen lo activo, para usarlo en citas y órdenes.
5. Auditoría: crear, editar, desactivar y cambiar precios. En los precios se guardan el importe anterior y el nuevo, porque son datos financieros, no clínicos.
6. Semilla: un catálogo básico ficticio para cada clínica (por ejemplo, Consulta general, Seguimiento, Inyección de vitamina B12 y Prueba rápida de estreptococo), con precios distintos por sede.

**Cambio decidido durante la tarea (2026-10-30):** el precio de venta (lo que paga el paciente) es un **precio general de la organización**, con fecha de vigencia, que vale en todas las sedes. Una sede puede tener **su propio precio**, también con vigencia, que reemplaza al general solo en ella. El precio vigente de una sede es su precio propio si existe; si no, el general. El historial se conserva igual. En la pantalla: «Precio general» y, por sede, «Precio en {sede}» opcional, con «Usa el precio general» cuando la sede no tiene precio propio. Los costos de laboratorio van aparte ([ADR 0028](../decisions/0028-laboratorios-costos.md), [T-011b](T-011b-laboratorios-costos.md)).

**No incluye:** laboratorios proveedores ni sus precios (S-ADM-16, 17), planes de membresía ni reglas de bono. Llegan con las órdenes y la cobertura, en la fase 3 o 5.

**Terminada cuando:**
- un Administrador crea un procedimiento, le pone precio en NOR1 y NOR2 y cambia el de NOR1 desde mañana;
- el precio vigente de hoy sigue siendo el anterior, y una prueba lo comprueba;
- el catálogo de Norte no se ve desde Sur.
