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

## Contenido del recibo y quién lo usa (decisiones del dueño del 2026-11-05, al planificar T-029)

1. **Encabezado:**
   - el nombre de la clínica;
   - el código y el nombre de la sede y, si los tiene, su dirección y su teléfono (si faltan, la línea no sale);
   - sin EIN ni nota legal, por ahora.

   Después van el código del recibo, la fecha y la hora en la zona de la sede, la visita (o la membresía) y quién lo generó.
2. **Paciente:** su nombre completo y su código (`P-000123`), sin fecha de nacimiento ni teléfono. En el recibo de una cuota de membresía, el titular.
3. **Beneficios de membresía:**
   - cada línea lleva su precio;
   - con beneficio, debajo «Membresía −$X», o «Incluido en la membresía» si la línea sale a $0.00;
   - en los totales, «Descuento de membresía», y arriba el nombre del plan.
4. **Seguro:** «A cargo del seguro», aparte de los descuentos, con el tipo («Seguro · copago», «coaseguro 20 %» o «deducible») y el nombre de la aseguradora. Nunca el número de miembro.
5. **Totales:**
   - el total a pagar, lo pagado y una sola de «Saldo» o «Crédito a favor $X», nunca un saldo negativo;
   - los pagos anulados no salen entre los pagos, pero las cifras ya los descuentan;
   - con una visita «Cancelada» (estado de cuenta «Anulado», [ADR 0042](0042-pagos-saldos-visitas-cerradas.md)) no se genera recibo. Con «Se retiró» o con la visita completada, sí.
6. **Cuotas de membresía:** también llevan recibo, con la misma serie `NOR1-R-2026-…`. Se generan desde la cuota pagada en la tarjeta «Membresía» y van siempre vinculadas a su pago.
7. **Quién:**
   - generan quienes tienen el rol Recepción en la sede (permiso `receipts.generate`), incluido el Propietario o el Administrador cuando lo tiene;
   - ven, imprimen y reimprimen también el Propietario y el Administrador con otro rol clínico en la sede (`receipts.print`, que solo vale junto a `patients.access`, como anular en el [ADR 0033](0033-acciones-administrativas-flujo-clinico.md)), pero no generan;
   - Enfermería y el Proveedor, no.
8. **Idioma:** español por defecto, con «Español» / «English» visibles en la hoja del recibo y en el diálogo de imprimir desde la lista. Así se ve en qué idioma saldrá.

## Cómo quedó implementada (T-029, 2026-11-05)

- **Base de datos:** migraciones `0047` y `0048`.
  - `receipts`:
    - el código, único por organización;
    - el año de la sede;
    - el destino: la visita o la cuota, exactamente uno (CHECK);
    - el pago vinculado, siempre en una cuota;
    - la instantánea cifrada, que lleva el nombre del paciente y el de la aseguradora;
    - quién lo generó y cuándo.
  - `receipt_prints`: cada impresión, con el idioma, quién y cuándo. Sirve para el límite por minuto.
  - Las dos con RLS forzada y solo `SELECT` e `INSERT`: los recibos no se cambian ni se anulan. Aislamiento en `packages/db/test/receipts.test.ts`.
  - Código con `nextReceiptCode()` (`packages/db/src/codes.ts`): el contador `receipt:<sede>:<año>` en la misma transacción. Si la transacción se deshace, el número no se gasta. El año sale de la hora del reloj inyectable en la zona de la sede, así que el 1 de enero de la sede empieza en `000001`.
- **Compartido** (`packages/shared/src/receipts.ts`):
  - la instantánea guarda los datos y no el texto (`receiptSnapshotSchema`, versión 1);
  - `renderReceipt(instantánea, 'es' | 'en')` es una función pura que da el texto de 42 columnas. El mismo recibo sale en los dos idiomas sin cambiar lo guardado. Los nombres del catálogo salen como se guardaron (el catálogo tiene un solo nombre), y el del plan, en su idioma;
  - los permisos `receipts.generate` y `receipts.print`.
- **API** (`apps/api/src/receipts.ts`, todo con el reloj inyectable):
  - `GET /api/encounters/:id/receipts` y `GET /api/membership-fees/:id/receipts`: la lista, sin datos del paciente, con `canGenerate`, `canPrint`, `blocked` y el último pago vigente para «Vincular al último pago».
  - `POST /api/encounters/:id/receipts` (`{ paymentId }`) y `POST /api/membership-fees/:id/receipts`, con `Idempotency-Key`:
    - en una sola transacción: la visita bloqueada (o la cuota), los beneficios al día, el estado de cuenta, el código, la instantánea, la auditoría `receipt.generated` (códigos e importes, sin nombres) y `billing.changed`;
    - rechazos: `409 statement_voided`, `409 payment_voided`, `404 payment_not_found` y `409 fee_not_paid`.
  - `GET /api/receipts/:id?lang=es|en`: la vista previa, con la lectura auditada (`receipt.view`, con el idioma).
  - `POST /api/receipts/:id/print` (`{ language }`):
    - en una transacción, el límite de 30 por persona y minuto (`429 print_rate_limited`), la fila de `receipt_prints` y la auditoría `receipt.printed` (con el idioma y si es una reimpresión);
    - **solo después de confirmarla** devuelve el texto. Si la auditoría falla, la respuesta no trae texto y la web no tiene nada que imprimir.
  - Un recibo de visita se ve en la sede de la visita; uno de cuota, en cualquier sede de la organización, porque la membresía es de la organización.
- **Web:**
  - tarjeta «Recibos» (S-CAJ-14) debajo de «Pagos» en la Caja de la visita, y «Recibos» en cada cuota pagada de la tarjeta «Membresía»;
  - «Generar recibo» pide confirmación, con la casilla «Vincular al último pago ($X)» marcada, y conserva la `Idempotency-Key` hasta que el recibo se genera;
  - «Imprimir» en el más reciente y «Reimprimir» en los anteriores, con el diálogo del idioma;
  - hoja «Recibo {código}» (S-CAJ-15): el texto del servidor, no seleccionable, con el selector de idioma e «Imprimir»;
  - impresión (S-CAJ-24): el texto se monta en un iframe temporal con `@page { size: 80mm auto }` y se llama a `print()`. El iframe se borra al cerrar el diálogo.
  - Nada del recibo va a localStorage, sessionStorage, IndexedDB ni al service worker, que nunca guarda `/api`. Las consultas usan `gcTime: 0`.
  - La lista se relee con `billing.changed` y `encounter.changed` de la visita. No hace falta un evento `receipt.generated` aparte.
- **Pruebas:**
  - `apps/api/test/receipts.test.ts`, con el reloj fijado:
    - códigos consecutivos, también después de una transacción fallida;
    - el cambio de año a las 11:59 p. m. y a las 12:01 a. m. del 31 de diciembre al 1 de enero en Chicago;
    - sin auditoría no hay texto;
    - reimprimir da la instantánea original en los dos idiomas;
    - seguro, crédito a favor, «Se retiró» y «Cancelada»;
    - idempotencia;
    - el límite de 30 por minuto;
    - permisos y aislamiento;
    - el recibo de una cuota.
  - `packages/shared/test/receipts.test.ts`: 42 columnas, los dos idiomas, membresía, crédito a favor y cuotas.
  - `apps/web/src/components/billing/receipts-card.test.tsx`.
  - E2E `apps/web/e2e/recibos.spec.ts`.
- **Diferencias con el manual:**
  - el código es `NOR1-R-2026-000045`, por sede y año (ADR 0019);
  - «Generar recibo» pide confirmación;
  - no hay «Compartir», porque es solo web;
  - el panel dice en qué idioma se imprimirá;
  - el Proveedor no lee recibos.
