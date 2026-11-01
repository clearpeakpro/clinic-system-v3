# 0035. Reparto del importe con seguro

- **Estado:** Aceptada
- **Fecha:** 2026-11-01
- **Resuelve:** P-19.
- **Relacionadas:** [ADR 0016](0016-alcance-v1.md) (sin integraciones con aseguradoras), [ADR 0019](0019-operaciones-criticas.md) (centavos) y [ADR 0026](0026-cifrado-campos-busqueda.md) (datos del seguro cifrados).
- **Implementación:** T-017 (captura) y T-027 (estado de cuenta) ([FASE-3](../tasks/FASE-3.md)).

## Contexto

En V1 no hay integración con aseguradoras: la clínica reclama al seguro fuera del sistema. El manual (S-CAJ-07) mete la parte que no paga el paciente como «ajuste del seguro» dentro de «Descuento total». Eso la confunde con los descuentos y esconde cuánto hay que reclamar.

## Decisión

- **Lo que paga el paciente**, según el único término capturado en la llegada:
  - **copago:** una vez por visita, y como máximo el total de la visita;
  - **coaseguro:** el porcentaje sobre el total;
  - **deducible:** el monto completo.
- **El resto** se muestra en una fila propia, **«A cargo del seguro»**, y **no cuenta como descuento**.
- Todo lo calcula el servidor en centavos. La web solo da formato.

## Consecuencias

- El estado de cuenta tiene las filas «Subtotal», «Descuento total», «A cargo del seguro», «Total a pagar», «Pagado» y «Saldo».
- El redondeo del coaseguro a centavos se escribe y se prueba en T-027 con casos calculados a mano.
- Los reportes podrán decir cuánto hay que reclamar a las aseguradoras sin mezclarlo con los descuentos.
- Si cambia la cobertura de la visita, el servidor recalcula el estado de cuenta.
