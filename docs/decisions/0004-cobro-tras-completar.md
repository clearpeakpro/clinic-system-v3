# 0004. Cobrar después de completar la visita

- **Estado:** Aceptada
- **Fecha:** 2026-10-22

## Contexto

El servidor del prototipo permitía cobrar en visitas completadas pero la interfaz dejaba el checkout en solo lectura (S-CAJ-05, S-CAJ-17).

## Decisión

Sí se puede. El saldo pendiente pasa a la pestaña Saldos del paciente y se cobra desde ahí.

## Cómo quedó (T-028, 2026-11-05)

- El saldo de una visita **completada** o cerrada como **«Se retiró»** aparece en la pestaña Saldos del perfil (S-CAJ-17 / S-PAC-10). Se cobra desde ahí: «Cobrar» abre la Caja de la visita en su sede, que con la visita cerrada sigue registrando pagos (no agrega cargos).
- Una visita **«Cancelada»** deja el estado de cuenta «Anulado», sin saldo, y no aparece en Saldos. Lo decidió el dueño el 2026-11-05: [ADR 0042](0042-pagos-saldos-visitas-cerradas.md).
