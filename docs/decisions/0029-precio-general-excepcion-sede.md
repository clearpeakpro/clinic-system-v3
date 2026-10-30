# 0029. Precio de venta general con excepción por sede

- **Estado:** Aceptada
- **Fecha:** 2026-10-30
- **Resuelve:** P-15 (volver al precio general en una sede).
- **Relacionadas:** [ADR 0019](0019-operaciones-criticas.md) (dinero en centavos) y [ADR 0028](0028-laboratorios-costos.md) (los costos de laboratorio van aparte).
- **Implementación:** T-011 (`prices`, Catálogos y precios).

## Contexto

T-011 empezó con un precio por sede. Lo habitual es que todas las sedes de una clínica cobren lo mismo y alguna, distinto. Además, una vez que una sede tenía precio propio no podía volver al general, porque los precios no se modifican ni se borran (P-15).

## Decisión

### Precio general y precio de la sede
- Cada procedimiento y cada prueba tiene un **precio general** de la organización, con fecha de vigencia, que vale en todas las sedes.
- Una sede puede tener **su propio precio**, también con vigencia, que reemplaza al general solo en esa sede.
- El **precio vigente de una sede** es su precio propio si existe; si no, el general.
- **Nada se modifica ni se borra:** cada cambio es un registro nuevo con su fecha de vigencia, de hoy o después, y el historial se conserva.

### Volver al precio general (P-15)
- Una sede con precio propio puede volver al general registrando **«Usa el precio general desde {fecha}»**: un registro **sin importe** con su vigencia, que no borra ni modifica nada.
- Desde esa fecha, el precio vigente de la sede vuelve a ser el general.
- Después, la sede puede volver a tener precio propio con otro registro.

### En la pantalla
- Columnas **«Precio general»** y **«Precio en {sede}»**. Cuando la sede no tiene precio propio, la segunda muestra **«Usa el precio general»**.
- Junto al precio propio de la sede, la acción **«Volver al precio general»** pide la fecha de vigencia (mínimo hoy) y queda auditada.

## Consecuencias

- **En `prices`:**
  - `location_id` nulo es el precio general;
  - una fila de sede sin importe es «Usa el precio general desde»;
  - el general siempre tiene importe, y lo exige un CHECK.
- **Precio vigente en una sede un día** (la fecha de la sede): la última fila de la sede vigente ese día. Si tiene importe, rige ese. Si no tiene importe, o la sede no tiene ninguna fila, rige el general.
- **Fecha mínima del precio general:** el día más adelantado entre las sedes activas, para no cambiar el pasado de ninguna.
- **Auditoría:**
  - `catalog.price_set` (general o de una sede) y `catalog.price_use_general`;
  - las dos guardan el importe que regía ese día antes del cambio.
- **Las órdenes y la Caja de la fase 3** toman el precio vigente que calcula el servidor; nunca lo calcula la web.
