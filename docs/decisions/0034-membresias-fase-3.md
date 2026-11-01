# 0034. Membresías en la fase 3

- **Estado:** Aceptada
- **Fecha:** 2026-11-01
- **Resuelve:** P-18.
- **Relacionadas:** [ADR 0029](0029-precio-general-excepcion-sede.md) (precios con vigencia) y [ADR 0035](0035-reparto-importe-seguro.md) (cobertura con seguro).
- **Implementación:** T-017 (sin membresía) y T-026b ([FASE-3](../tasks/FASE-3.md)).

## Contexto

El paso «Cobertura» de la llegada (S-REC-24 y 25) ofrece «Membresía», y la Caja aplica sus beneficios (S-CAJ-07). Los planes (S-ADM-21) y sus beneficios (S-ADM-22) no existían todavía: la fase 2 los dejó para «la fase 3 o la 5». La clínica Lancaster ya vende membresías.

## Decisión

- Las membresías entran **completas en la parte 3B**, en la tarea T-026b: planes, beneficios, membresía del paciente, «Membresía» en el paso Cobertura y beneficios en Caja.
- En la parte 3A, el paso Cobertura ofrece **solo «Pago directo» y «Seguro»**.
- **Antes de programar T-026b**, se entrega al dueño la lista de datos de los planes que hay que conseguir en la clínica. Solo datos de los planes, nunca de pacientes: nombre, precio, qué incluye, descuentos, vigencia, renovación, cuántas personas cubre y si cambia por sede.

## Consecuencias

- La tabla de coberturas de T-017 ya admite el tipo membresía, sin usarlo, para no tener que migrar después.
- El manual no tiene pantalla para dar de alta la membresía de un paciente (quién la vende, cómo se cobran las cuotas, cómo vence). T-026b lo pregunta en su paso 0, y la respuesta será un ADR nuevo.
- Los beneficios solo se aplican con cobertura Membresía y una membresía activa el día de la visita, sobre cargos de orden sin descuento manual (S-CAJ-07). Los calcula el servidor.
- «Reglas de bono» (S-ADM-23) y la cifra «Bono» de los reportes no entran: siguen en la fase 5.
