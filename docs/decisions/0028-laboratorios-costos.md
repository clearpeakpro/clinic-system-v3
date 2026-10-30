# 0028. Laboratorios, costos por prueba y sugerencia de laboratorio

- **Estado:** Aceptada
- **Fecha:** 2026-10-30
- **Relacionadas:** [ADR 0018](0018-auditoria.md) (auditoría), [ADR 0019](0019-operaciones-criticas.md) (dinero en centavos) y [ADR 0027](0027-acceso-clinico-propietario-administrador.md) (mínimo necesario).
- **Implementación:** [T-011b](../tasks/T-011b-laboratorios-costos.md) (fase 2); su uso en la orden, en la fase 3.

## Contexto

El manual (S-ADM-15 a 17) mezclaba en «Precios por proveedor» el costo interno y el precio de venta de cada prueba por laboratorio. En V3 el precio que paga el paciente es el del catálogo: general de la organización, con excepción opcional por sede (T-011). Hacía falta decidir aparte cuánto le cuesta cada prueba a la clínica en cada laboratorio y cómo se sugiere a qué laboratorio enviarla.

## Decisión

### Laboratorios
- Los da de alta el Propietario o el Administrador en **Administración › Proveedores de laboratorio** (por ejemplo, LabCorp, CPL o Quest Diagnostics).
- Cada uno tiene nombre, estado activo o inactivo y **orden de preferencia**.
- Son por organización.

### Costos por prueba
- Al crear o editar una prueba en **Catálogos › Pruebas de laboratorio**, el mismo formulario incluye la sección **«Laboratorios que la realizan»**.
- Ahí se marca cada laboratorio que hace esa prueba y se escribe **su costo para la clínica**, en centavos y con fecha de vigencia.
- **Ese costo es distinto del precio que paga el paciente y no lo modifica.**
- **Un laboratorio no marcado no hace esa prueba.**
- Una prueba sin ningún laboratorio se puede guardar, pero aparece con el aviso **«Sin laboratorio asignado»** y no se podrá sugerir laboratorio para ella.

### Selección
Cuando se ordenan una o varias pruebas en una visita:
1. Entre los laboratorios **activos** que hacen **todas** las pruebas, el sistema sugiere el de **menor costo total**, para todas: una sola orden y una sola muestra.
2. **Si hay empate**, gana el de mayor preferencia.
3. **Si ningún laboratorio las hace todas**, se reparten entre el **menor número de laboratorios** posible y, con ese número, con el **menor costo total**.
4. **Si una prueba no tiene laboratorio**, se avisa.

Para el cálculo, cada laboratorio cuenta con el costo vigente el día de la orden.

### Cobertura
- La sugerencia aplica a **pago directo** y **membresía**.
- **Con seguro no se sugiere por costo:** el personal elige el laboratorio de la red del seguro.

### Cambio de laboratorio
El proveedor o la enfermera pueden cambiar el laboratorio sugerido, con **motivo obligatorio y auditado**.

### Confidencialidad
- Los costos **solo los ven y editan el Propietario y el Administrador**.
- Enfermería y Proveedor no ven la sección de costos; solo ven el **nombre** del laboratorio sugerido.
- Los costos **nunca** aparecen en logs ni en eventos en vivo.

### Fuera del sistema
La orden al laboratorio externo se hace fuera del sistema. En la orden se informa con qué laboratorio debe crearse.

## Consecuencias

- **Tablas nuevas (T-011b):** laboratorios y costos por prueba y laboratorio, con RLS, `version` y vigencia. Como los precios, un costo nunca se modifica: un cambio es una fila nueva con su fecha.
- **Desmarcar un laboratorio en una prueba** deja de considerarlo para ella, y su historial de costos se conserva.
- **La selección es una función pura en `packages/shared`,** con sus pruebas. La usará la tarea de órdenes de la fase 3.
- **El servidor no devuelve costos** a quien no tiene el permiso de verlos, en ninguna respuesta.
- **Reemplaza a S-ADM-16 del manual:** ya no hay un «precio de venta» por laboratorio. El precio que paga el paciente es el del catálogo (T-011).
