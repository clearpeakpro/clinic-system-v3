# T-011b — Laboratorios y costos por prueba

**Tamaño:** 2–3 días · **Depende de:** T-011 · **Pantallas:** S-ADM-16, 17 · **ADR:** 0028, 0019

**Objetivo:** que cada clínica registre con qué laboratorios trabaja y cuánto le cuesta cada prueba en cada uno, y que exista la función que sugiere el laboratorio. Su uso en la orden queda para la fase 3.

**Incluye**
1. **Tablas**, con RLS, claves foráneas compuestas y `version`:
   - **laboratorios:** nombre, estado activo o inactivo y orden de preferencia, por organización;
   - **costos por prueba y laboratorio:** la prueba, el laboratorio, el costo para la clínica en centavos y la fecha de vigencia.
   - **Reglas de los costos:**
     - nunca se modifican: un cambio es una fila nueva;
     - desmarcar un laboratorio en una prueba deja de considerarlo para ella y conserva su historial de costos;
     - el costo no toca el precio que paga el paciente (T-011).
2. **Pantallas.** En `design/stitch/admin` no hay captura de estas pantallas: se usan los componentes de `packages/ui` y el patrón de Catálogos de T-011.
   - **Administración › Proveedores de laboratorio (S-ADM-17):** nombre, estado y orden de preferencia; nuevo, editar y desactivar con motivo.
   - **«Laboratorios que la realizan» (S-ADM-16):** sección del formulario de **Catálogos › Pruebas de laboratorio**.
     - Se marca cada laboratorio que hace la prueba y se escribe su costo para la clínica, con fecha de vigencia.
     - Una prueba sin laboratorios se puede guardar, y la lista muestra «Sin laboratorio asignado».
3. **Permisos:** los costos solo los ven y editan el Propietario y el Administrador. Enfermería y Proveedor no ven la sección de costos; solo verán el nombre del laboratorio sugerido.
4. **Función de selección** en `packages/shared`, como función pura (ADR 0028):
   - **Entrada:** las pruebas, los laboratorios activos con su preferencia, los costos vigentes en una fecha y el tipo de cobertura.
   - **Regla:** entre los laboratorios que hacen todas las pruebas, el de menor costo total; si hay empate, el de mayor preferencia. Si ninguno las hace todas, el menor número de laboratorios y, con ese número, el menor costo total. Avisa de las pruebas sin laboratorio.
   - **Con seguro** no sugiere por costo: el personal elige el laboratorio de la red del seguro.
   - **Pruebas:**
     - A1c + tiroides + próstata: LabCorp gana en total aunque CPL sea más barato en A1c;
     - empates;
     - un laboratorio que no hace una de las pruebas;
     - ningún laboratorio que las haga todas;
     - un laboratorio inactivo;
     - un costo con vigencia futura;
     - desmarcar un laboratorio en una prueba, que deja de considerarlo para ella conservando el historial de costos.
5. **Pruebas de permisos y aislamiento:**
   - Enfermería y Proveedor no pueden leer los costos, en ninguna respuesta de la API;
   - aislamiento entre las dos clínicas con el rol real;
   - los costos no aparecen en logs ni en eventos en vivo.
6. **Auditoría:** alta, edición y desactivación de laboratorios; marcar y desmarcar un laboratorio en una prueba; cada costo, con el importe anterior y el nuevo.
7. **Semilla:** LabCorp, CPL y Quest Diagnostics en cada clínica, con costos ficticios distintos en cada uno, también dentro de `pnpm demo:reset`.

**No incluye:** el uso de la sugerencia en la orden, el cambio de laboratorio con motivo y la cobertura de la visita. Llegan con las órdenes, en la fase 3.

**Terminada cuando:**
- un Administrador da de alta un laboratorio y marca con su costo las pruebas que hace;
- la función de selección pasa todos los casos de arriba;
- Enfermería y Proveedor no pueden leer los costos;
- los costos de Norte no se ven desde Sur.
