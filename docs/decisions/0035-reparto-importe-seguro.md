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
- El redondeo del coaseguro a centavos se escribe y se prueba en T-027 con casos calculados a mano (ver abajo).
- Los reportes podrán decir cuánto hay que reclamar a las aseguradoras sin mezclarlo con los descuentos.
- Si cambia la cobertura de la visita, el servidor recalcula el estado de cuenta.

## Redondeo del coaseguro (T-027, decisión del dueño del 2026-11-04)

- La **parte del paciente** es el porcentaje del total redondeado al **centavo más cercano, con la mitad hacia arriba**, sin coma flotante (`percentOfCents()`, el mismo cálculo que los descuentos de membresía).
- **«A cargo del seguro»** es el resto exacto: total − parte del paciente. Las dos partes suman siempre el total.
- Ejemplos: 12.5 % de $1.00 = 12.5 ¢ → $0.13 el paciente y $0.87 el seguro; 33.33 % de $10.00 = 333.3 ¢ → $3.33 y $6.67; 15 % de $0.30 = 4.5 ¢ → $0.05 y $0.25.

## Cómo quedó implementado (T-027, 2026-11-04)

- `computeStatement()` y `patientShareCents()` en `packages/shared/src/billing.ts`: Subtotal, «Descuento total» (solo membresía), «A cargo del seguro», «Total a pagar», «Pagado» y «Saldo», en centavos. El copago se aplica una vez sobre el total de la visita y como máximo el total; con deducible, el paciente debe el monto completo (el importe del deducible capturado en la llegada no interviene).
- Estado del estado de cuenta: «Pagado» con saldo $0.00 o menos, también cuando el total a pagar es $0.00 (decisión del 2026-11-04); «Pago parcial» con algo pagado y saldo; «Abierto» sin pagos y con saldo.
- Si cambia la cobertura de la visita, el servidor recalcula los beneficios y sube la versión del estado de cuenta.
- Pruebas: `packages/shared/test/billing.test.ts` y `apps/api/test/billing.test.ts`, con casos calculados a mano.
