# 0037. Recibo de 80 mm en español e inglés

- **Estado:** Aceptada
- **Fecha:** 2026-11-01
- **Resuelve:** P-21.
- **Relacionadas:** [ADR 0017](0017-entornos-presupuesto.md) (presupuesto B), [ADR 0018](0018-auditoria.md) (impresiones auditadas) y [ADR 0019](0019-operaciones-criticas.md) (códigos sin huecos).
- **Implementación:** T-029 ([FASE-3](../tasks/FASE-3.md)).

## Contexto

La arquitectura preveía generar los PDF con Playwright en el worker. Para el recibo del mostrador, eso consume memoria del servidor del entorno B (2 GiB) sin aportar nada, porque la clínica imprime en una impresora de tickets.

## Decisión

- **Formato:** recibo de rollo de **80 mm** para la impresora de tickets de la clínica.
  - Lo arma el servidor.
  - Se imprime con el diálogo de impresión del navegador y una hoja de estilos de 80 mm.
  - **Sin PDF.**
- **Idioma:** español o inglés, a elección al ver o imprimir el recibo, sin depender del idioma de la interfaz.
- Sigue igual lo del manual: el recibo es una instantánea inmutable que no se anula, y cada impresión se audita **antes** de imprimir. Si la auditoría falla, no se imprime.

## Consecuencias

- El worker no necesita Playwright para los recibos.
- Si más adelante se pide enviar el recibo por correo, el PDF se añadirá con un ADR nuevo.
- Nada del recibo se guarda en el navegador ni en la caché del service worker.
