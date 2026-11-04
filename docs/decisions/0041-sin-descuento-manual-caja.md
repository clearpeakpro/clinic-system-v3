# 0041. Caja sin descuentos manuales ni cargos de precio libre

- **Estado:** Aceptada
- **Fecha:** 2026-11-04
- **Decide:** el dueño del producto: decisión 11 del 2026-11-03 y su ampliación del 2026-11-04 ([datos de T-026b](../tasks/T-026b-membresias-datos.md)).
- **Reemplaza:** en el manual, «Aplicar descuento» (S-CAJ-09), el campo «Descuento (USD)» y el precio libre de «Agregar cargo manual» (S-CAJ-08), y la regla de S-CAJ-07 «Un descuento manual siempre prevalece».
- **Relacionadas:** [ADR 0029](0029-precio-general-excepcion-sede.md) (precio vigente de la sede), [ADR 0034](0034-membresias-fase-3.md) (membresías) y [ADR 0035](0035-reparto-importe-seguro.md) (reparto con seguro).
- **Implementación:** el catálogo «Consultas», en T-026b parte A; la Caja sin descuentos manuales y con cargos del catálogo, en T-027 ([FASE-3](../tasks/FASE-3.md)).

## Contexto

El manual permite en Caja dos formas de cambiar a mano lo que paga el paciente:

- **«Aplicar descuento»** (S-CAJ-09), un descuento en dólares sobre cualquier línea;
- **«Agregar cargo manual»** (S-CAJ-08), con un código de texto, un precio libre y un descuento opcional.

Además, S-CAJ-07 decía que un descuento manual prevalece sobre la membresía.

Con las membresías de T-026b, el dueño decidió que los únicos descuentos sean los automáticos de los planes. Un precio libre equivale a un descuento manual, porque permite cobrar menos que el precio del catálogo.

Las consultas no existían en el catálogo: en el manual se cobraban como cargo manual de precio libre, así que los beneficios de membresía (consultas incluidas y su descuento) no tenían a qué aplicarse.

## Decisión

### Sin descuentos manuales (decisión 11)

- **Caja no aplica descuentos manuales.** Desaparecen «Aplicar descuento» (S-CAJ-09) y el campo «Descuento (USD)» de S-CAJ-08.
- **Los únicos descuentos son los de la membresía**, automáticos y calculados por el servidor (ADR 0034), en centavos y sobre el precio vigente de la sede (ADR 0029).
- Deja de existir la regla «Un descuento manual siempre prevalece».

### Todo cargo sale del catálogo

- **Se elimina el cargo manual de precio libre.** «Agregar cargo» en Caja elige un servicio del catálogo (consulta, procedimiento o prueba), que se cobra al precio vigente de la sede ese día. Nadie escribe un precio.
- Nuevo catálogo **«Consultas»**, con su precio general y su excepción por sede, como los procedimientos y las pruebas (ADR 0029). Recepción las agrega en Caja desde el catálogo (T-027).
- La categoría de membresía de una consulta es siempre **«Consulta»**.

### Lo que no cambia

- La parte del seguro (ADR 0035) se muestra aparte, como **«A cargo del seguro»**, y no es un descuento.
- Los cargos de orden se siguen anulando solo al cancelar la orden. Un cargo agregado en Caja se anula con motivo (T-028). Nada se borra.

## Consecuencias

- **S-CAJ-07:**
  - la columna «Descuento» muestra solo la insignia «Membresía»; ya no existe la insignia «Manual»;
  - «Descuento total» es la suma de los descuentos de membresía;
  - el origen del cargo es «Orden» o «Caja»: un cargo de Caja sigue siendo un servicio del catálogo y recibe los beneficios de membresía, igual que los de orden.
- **S-CAJ-08** pasa a ser «Agregar cargo»: el servicio del catálogo y la cantidad. El precio lo pone el servidor.
- **S-CAJ-09** no se construye.
- **T-027** se actualiza: sin descuento de línea; «Agregar cargo» desde el catálogo; la Caja no hace sumas.
- Un error de precio se corrige en el catálogo (ADR 0029), no en la Caja.
