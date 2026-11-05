# 0042. Pagos, saldos de visitas cerradas y cobro de cuotas

- **Estado:** Aceptada
- **Fecha:** 2026-11-05
- **Decide:** el dueño del producto, al planificar T-028 (2026-11-05). Responde la pregunta que dejó T-027.
- **Relacionadas:**
  - [ADR 0004](0004-cobro-tras-completar.md): cobrar después de completar;
  - [ADR 0019](0019-operaciones-criticas.md): pagos con `FOR UPDATE` e `Idempotency-Key`, anulaciones como filas inversas;
  - [ADR 0033](0033-acciones-administrativas-flujo-clinico.md): quién anula;
  - [ADR 0034](0034-membresias-fase-3.md): cuotas de membresía.
- **Implementación:** T-028 ([FASE-3](../tasks/FASE-3.md)).

## Contexto

T-027 dejó en solo lectura el estado de cuenta de una visita cerrada, con su saldo calculado. No decidió qué pasa con el saldo de una visita cerrada como «Cancelada» o «Se retiró» que tiene cargos activos. Las dos opciones eran:

- que se le siga debiendo al paciente, en la pestaña Saldos;
- que el estado de cuenta quede «Anulado».

Además, los cargos de orden solo se anulan cancelando la orden, y con la visita cerrada ya no se cancelan órdenes. Si una visita «Cancelada» tuviera un cargo de orden, ese cargo no se podría quitar nunca.

T-028 también tenía que precisar cuatro cosas:

- cómo se cobran las cuotas de membresía;
- qué pasa al anular el pago de una cuota;
- qué se guarda de la referencia del pago;
- quién ve la pestaña Saldos.

## Decisión

### Saldo de las visitas cerradas

- **«Se retiró» se sigue debiendo.** El saldo aparece en la pestaña Saldos y se cobra igual que el de una visita completada (ADR 0004).
- **«Cancelada» deja el estado de cuenta «Anulado».**
  - El total a pagar es $0.00: no hay nada que cobrar y la visita no aparece en Saldos.
  - Los cargos y los pagos siguen registrados. Lo que ya se había pagado queda como **«Crédito a favor»**; en V1 no hay reembolsos.
  - Un estado de cuenta anulado no admite cambios: ni pagos ni anulaciones.
- **Regla nueva:** una visita con **órdenes completadas** no se puede cerrar como «Cancelada», solo como «Se retiró». Si se intenta, el servidor lo rechaza y la pantalla lo explica.

### Cuotas de membresía

- **Se cobran completas:** un pago por cuota, sin pagos parciales. El monto lo pone el servidor; la web no lo envía.
- Se cobran desde la tarjeta «Membresía» del perfil y aparecen en la pestaña Saldos.
- Pagar la cuota inicial activa la membresía, y pagar una mensualidad vencida reactiva una suspendida. Las dos cosas pasan en la misma transacción del pago.
- **Anular el pago de una cuota** la devuelve a pendiente, y el estado de la membresía se recalcula:
  - **(a)** si eso cancelaría la membresía (por ejemplo, la cuota inicial cuando ya pasaron los 30 días desde la inscripción), la cancela. El diálogo de anular **lo avisa antes**: «Esto cancelará la membresía». La cuota queda anulada, sin deuda;
  - **(b)** si la membresía ya está cancelada, la cuota queda **«Anulada»**, sin deuda, en lugar de volver a pendiente.

### Referencia, Saldos y quién anula

- **Referencia del pago:** el servidor guarda **solo los últimos 4 caracteres**, cifrados, en cualquier método, y descarta el resto. Se ve como «Ref. ••••1234». Nunca se guardan datos de tarjeta.
- **Pestaña Saldos:**
  - Recepción ve la lista con «Cobrar»;
  - el Proveedor ve la lista en solo lectura, con «Abrir visita»;
  - Enfermería no ve la pestaña. El manual se la mostraba siempre con un error.
- **Anular** (ADR 0033): el Propietario o el Administrador con un rol clínico en la sede.
  - Si su rol clínico no es Recepción, también abre la Caja de la visita: ve el estado de cuenta completo y los botones de anular, pero no cobra.
  - Se anula también con la visita cerrada. Si se anula un cargo de Caja de una visita ya completada, sus beneficios de membresía no se recalculan, porque quedaron fijos al completarla.
- **Cuándo se cobra:**
  - en cualquier estado abierto (por adelantado), con la visita completada y con «Se retiró»;
  - «Agregar cargo» sigue siendo solo con la visita abierta.
- **Cargos:** se siguen anulando con el mecanismo de T-025. La fila no se borra: pasa a «Anulado» con su motivo, quién y cuándo. Los **pagos**, en cambio, se anulan con una fila inversa.

## Consecuencias

- El estado de cuenta tiene un estado más, «Anulado», y el servidor manda «Crédito a favor» ya en positivo. La web no resta nada.
- La máquina de estados de la visita bloquea «Cancelada» si la visita tiene órdenes completadas. La pantalla de la visita lo sabe por adelantado (`cancelBlocked`).
- Los totales de una visita cancelada siguen mostrando el subtotal, el descuento y la parte del seguro de sus cargos, para que se vea qué se anuló.

## Cómo quedó implementada (T-028, 2026-11-05)

- **Base de datos:** migraciones `0045` y `0046`.
  - `payments` guarda, en cada fila:
    - la sede, el paciente y el destino: la visita o la cuota de membresía, exactamente uno (CHECK);
    - el tipo (`payment` o `void`), el método y el monto en centavos, positivo en el pago y negativo en la anulación;
    - los últimos 4 de la referencia, cifrados;
    - en la anulación, el pago que anula y el motivo cifrado;
    - quién lo registró y cuándo.
  - Un índice único parcial impide anular un pago dos veces.
  - RLS forzada y solo `SELECT` e `INSERT`: nada se actualiza ni se borra.
  - Prueba de aislamiento con `clinic_app` en `packages/db/test/payments.test.ts`.
- **Compartido** (`packages/shared`):
  - en `src/billing.ts`, el estado `voided` («Anulado»), `creditCents` y `computeStatement({ voided })`;
  - también ahí, los esquemas estrictos `recordPaymentSchema`, `payMembershipFeeSchema` (sin monto) y `voidSchema` (motivo de hasta 200 caracteres), y `referenceLast4()`;
  - `voidCancelsMembership()` en `src/patient-memberships.ts`;
  - `blockedByCompletedOrders` y `completed_orders` en `src/visit.ts`;
  - los permisos `billing.void` (Propietario y Administrador) y `balances.view` (Recepción y Proveedor).
- **API** (`apps/api/src/payments.ts`, todo con el reloj inyectable):
  - `POST /api/encounters/:id/payments`:
    - en una sola transacción: la visita y su estado de cuenta bloqueados (`FOR UPDATE`), la versión comprobada, el saldo recalculado y el monto, que no puede superar el saldo (`409 amount_exceeds_balance` con el saldo);
    - después el pago, la versión nueva, la auditoría `payment.recorded` con el antes y el después y `billing.changed`.
  - `POST /api/charges/:id/void`: solo cargos de Caja (`409 charge_from_order`). Auditoría `charge.voided`.
  - `POST /api/payments/:id/void`: el pago de una visita o de una cuota, con fila inversa. Auditoría `payment.voided`.
  - `POST /api/membership-fees/:id/payments`: la cuota se marca como pagada y `settleMembership()` corre en la misma transacción. Auditoría `membership_fee.paid`, con el estado de la membresía antes y después.
  - `GET /api/patients/:id/balances`: la lectura se audita (`billing.balances_view`, sin nombres).
  - Todas las escrituras llevan `Idempotency-Key`. Ni la referencia ni el motivo van a la auditoría como datos: el motivo va en su campo de motivo.
  - `POST /api/encounters/:id/close` con «Cancelada» y órdenes completadas: `409 completed_orders`.
- **Web:**
  - tarjeta «Pagos» (S-CAJ-11/12), en la que Enter no registra el pago;
  - diálogos «Anular cargo» y «Anular pago» (S-CAJ-10/13), con su aviso;
  - «Crédito a favor» y «Anulado» en los totales;
  - pestaña Saldos (S-CAJ-17 / S-PAC-10);
  - «Cobrar» y «Anular pago» en las cuotas de la tarjeta «Membresía»;
  - en «Cerrar visita», «Cancelada» no se ofrece con órdenes completadas y se explica por qué.
- **Pruebas:**
  - `apps/api/test/payments.test.ts`, con el reloj fijado:
    - pago parcial;
    - idempotencia con dos peticiones a la vez;
    - dos cajas a la vez que nunca superan el saldo;
    - anulaciones sin borrar nada;
    - quién anula;
    - Saldos;
    - «Cancelada» y «Se retiró»;
    - activación y reactivación por cuota;
    - anular una cuota pasados los 30 días.
  - `packages/shared/test/billing.test.ts` y `apps/web/src/components/billing/payments-card.test.tsx`.
  - La E2E `apps/web/e2e/pagos.spec.ts`.
