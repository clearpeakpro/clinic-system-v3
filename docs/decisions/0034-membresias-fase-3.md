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
- El manual no tiene pantalla para dar de alta la membresía de un paciente (quién la vende, cómo se cobran las cuotas, cómo vence). T-026b lo preguntó en su paso 0; las respuestas del dueño están abajo, en este mismo ADR.
- Los beneficios solo se aplican con cobertura Membresía y una membresía activa el día de la visita. Los calcula el servidor. Desde el 2026-11-04 no hay descuentos manuales ni cargos de precio libre en Caja ([ADR 0041](0041-sin-descuento-manual-caja.md)): ya no existe la regla «un descuento manual prevalece».
- «Reglas de bono» (S-ADM-23) y la cifra «Bono» de los reportes no entran: siguen en la fase 5.

## Decisiones del dueño (2026-11-03 y 2026-11-04)

Respuestas al paso 0 de T-026b. Los datos completos de los planes (nombres, cuotas, servicios incluidos y descuentos por categoría) están en [T-026b-membresias-datos.md](../tasks/T-026b-membresias-datos.md). Aquí van las reglas.

### Planes y beneficios (2026-11-03)

- **Cuatro planes:** Esencial, Extendido y Total (1 persona) y Familiar (hasta 4: titular y 3 afiliados). Cada uno con su cuota inicial y su mensualidad.
- **Servicios incluidos, por persona y año de la membresía:**
  - consulta médica inicial;
  - chequeo general (el Administrador define qué servicios del catálogo lo forman);
  - ECG, Papanicolaou y PSA;
  - 3 consultas de seguimiento o enfermedad.
- **Descuentos por categoría:** Consulta, Tratamiento (inyecciones y medicamentos), Laboratorio y Cirugía menor o procedimiento, con un porcentaje por plan. El Administrador marca la categoría de cada servicio del catálogo.
- **Orden:** primero se usan los servicios incluidos, sin costo; después se aplica el descuento. Se calcula en el servidor, en centavos, sobre el precio vigente de la sede ([ADR 0029](0029-precio-general-excepcion-sede.md)).
- **El sistema no decide por el sexo del paciente:** Recepción o el personal eligen el servicio, y el sistema solo cuenta cuántos se usaron.

| # | Tema | Decisión |
| --- | --- | --- |
| 1 | Año de beneficios | Cuenta desde la fecha de inicio de la suscripción (aniversario), no desde el 1 de enero. |
| 2 | Cuota inicial | Incluye el primer mes. La primera mensualidad se cobra un mes después del inicio, el día de cobro elegido. |
| 3 | Plan Total | Consultas ilimitadas, todas gratis. Sus 3 consultas de seguimiento incluyen sin costo el laboratorio. |
| 4 | Plan Familiar | Todos los beneficios son por persona, también las 3 consultas gratis. Máximo 4 personas. |
| 5 | Después de las consultas gratis | Se aplica el porcentaje de descuento en consultas del plan. |
| 6 | Falta de pago | Si una mensualidad vence sin pagarse, los beneficios se suspenden automáticamente, sin días de gracia, y vuelven en cuanto se paga. |
| 7 | Cancelación | (a) Por el paciente: aviso con 15 días de anticipación; los beneficios valen hasta el final del mes pagado. (b) Automática: a los 30 días de vencida una mensualidad sin pagar. |
| 8 | Permanencia mínima | No hay. |
| 9 | «Tratamientos» | Inyecciones y medicamentos del catálogo. |
| 10 | Telesalud | Fuera de V1: solo consultas presenciales. |
| 11 | Descuento manual en Caja | Caja no aplica descuentos manuales: los únicos descuentos son los de la membresía, automáticos ([ADR 0041](0041-sin-descuento-manual-caja.md)). |

### Inscripción y seguridad (2026-11-03)

- **Etapa 1 (T-026b, para el piloto):** inscripción en Recepción, desde el perfil del paciente, con el plan, la fecha de inicio, el día de cobro del mes y, en el plan Familiar, hasta 3 afiliados que deben ser pacientes registrados. La cuota inicial y las mensualidades se cobran en Caja con la terminal de la clínica (efectivo o tarjeta); el sistema solo registra el pago.
- **Etapa 2 (después del despliegue):** inscripción en línea con la página de pago de un procesador y un webhook firmado. Está pendiente: P-24 en [PENDIENTES.md](PENDIENTES.md).
- **Datos que nunca se guardan:**
  - números de tarjeta, CVV ni fechas de expiración;
  - números de ID ni de pasaporte. Recepción mira el documento y el sistema anota «Identidad verificada», con quién y cuándo.

### Precisiones del 2026-11-04

1. **Consultas:** nuevo tipo de catálogo, «Consulta», con precio por sede, que Recepción agrega en Caja desde el catálogo. Se elimina el cargo manual de precio libre ([ADR 0041](0041-sin-descuento-manual-caja.md)).
2. **Consulta inicial:** va aparte de las 3 de seguimiento, así que son 4 gratis en total. El descuento de consultas se aplica cuando se agotan las 3 de seguimiento.
3. **Plan Total:** son sin costo los laboratorios ordenados en la misma visita que una de esas 3 consultas.
4. **Activación:** la membresía queda «Pendiente de pago», sin beneficios, hasta que se paga la cuota inicial. Se activa con el pago (T-028).
5. **Primera mensualidad:** vence el primer día de cobro que caiga al cumplirse un mes desde el inicio, o después. Por ejemplo, con inicio el 3 de noviembre y día de cobro 15, vence el 15 de diciembre. Los días de cobro 29, 30 y 31 pasan al último día de los meses más cortos.
6. **Vencimiento:** si una mensualidad vence el día D y no se paga, la membresía se suspende a las 12:00 a. m. de D+1 en la hora de la sede, y se cancela a las 12:00 a. m. de D+30.
7. **Aviso con menos de 15 días:** si el paciente avisa con menos de 15 días antes del próximo cobro, esa mensualidad se debe igual y los beneficios duran un mes más.
8. **Afiliados:**
   - un paciente solo puede estar en una membresía activa;
   - el año de beneficios de un afiliado cuenta desde el inicio de la membresía;
   - se pueden añadir y quitar afiliados después.
9. **Precio por sede:** los planes cuestan lo mismo en todas las sedes.

**Reparto de T-026b en dos PR:**
- **(A)** planes, cuotas de plan, beneficios, categorías y el tipo «Consulta»;
- **(B)** inscripción, cuotas del paciente, trabajo del worker, cobertura «Membresía» y aplicación de los beneficios.

Las cuotas del paciente quedan como cuotas pendientes en T-026b y se cobran con los pagos de T-028.

### Precisiones del 2026-11-04 (plan de la parte B)

| # | Tema | Decisión |
| --- | --- | --- |
| 1 | Cantidad mayor que los incluidos que quedan | Se reparte **por unidad**: de una cantidad 2 con 1 incluido restante, 1 sale sin costo y la otra lleva el descuento de su categoría. |
| 2 | Cuándo se calculan los beneficios | Mientras la visita está abierta, el servidor **recalcula los beneficios de todos sus cargos activos en el orden en que se crearon**; al completarse la visita quedan fijos. |
| 3 | «Pendiente de pago» que nunca se paga | Se **cancela sola a los 30 días de la inscripción**. |
| 4 | Cuotas pendientes al cancelarse sola en D+30 | Se **anulan, sin dejar deuda**. |
| 5 | Volver después de una cancelación | Es una **inscripción nueva**, con cuota inicial y un año de beneficios nuevo. La suspendida vuelve al pagar, con el mismo año. |
| 6 | Cambio de cuota del plan | Cada membresía **mantiene la cuota inicial y la mensualidad vigentes el día de su inscripción** («Monto fijo» del formulario firmado). Un cambio de cuota del plan aplica solo a las inscripciones nuevas. |
| 7 | Cómo se cuenta la cantidad de un incluido con varios servicios | Cada incluido tiene un **tipo que elige el Administrador**: **«Paquete»** (como el Chequeo general): cada servicio del paquete hasta su cantidad por año; **«Cupo compartido»** (como las 3 consultas de seguimiento o enfermedad): la cantidad es el total entre todos sus servicios. En la semilla, el chequeo es Paquete y las consultas de seguimiento, Cupo compartido. |
| 8 | Plan Total: laboratorio de la misma visita que también es un incluido | **Gasta cupo**: primero se usa el chequeo o el PSA como incluido; el laboratorio de la misma visita cubre lo que quede. |
| 9 | Aviso de cancelación de una «Pendiente de pago» | Se **cancela en el momento** y se anula la cuota inicial, sin deuda. |
| 10 | Mensualidad debida por un aviso con menos de 15 días que sigue sin pagar al final | Al cancelarse se **anula, sin deuda**, igual que en la cancelación sola en D+30. |
| — | Fichas nuevas del manual | La tarjeta «Membresía» del perfil es **S-PAC-22** y el diálogo «Inscribir en un plan», **S-PAC-23** (S-PAC-21 ya era «Registro de exportación previo»). |

Además, del plan aprobado:
- cada mensualidad se crea **14 días antes de vencer** (cuando faltan menos de 15): desde ese momento un aviso de cancelación ya no la evita (decisión 7);
- la fecha de inicio va de hoy a 30 días después;
- el estado de la membresía se calcula con el reloj en la hora de la sede de inscripción, así que la suspensión y la cancelación valen a las 12:00 a. m. aunque el trabajo del worker todavía no lo haya guardado.

## Cómo quedó implementada la parte A (T-026b, 2026-11-04)

- **Base de datos:** migraciones `0039` y `0040`.
  - `consultations`, con precio en `prices` (`consultation_id`), como los procedimientos y las pruebas.
  - `membership_category` (nula: sin descuento) en `procedures` y `lab_tests`.
  - `membership_plans`: código inmutable, nombre y descripción en español e inglés, máximo de personas, orden, activo y `version`.
  - `membership_plan_fees`: cuota inicial y mensualidad con vigencia. Como los precios, solo `SELECT` e `INSERT`.
  - `membership_benefits`: «Incluido» (nombre, cantidad por persona y año, laboratorios de la misma visita) o «Descuento» (categoría y porcentaje en centésimas de punto). Cada tipo, solo con sus campos (CHECK). Un descuento activo por categoría en cada plan (índice único parcial). El tipo y el plan no cambian (GRANT por columnas).
  - `membership_benefit_items`: los servicios del catálogo de cada incluido. Es configuración, así que al editar el beneficio se reemplazan, con la auditoría del antes y el después.
  - Todas con RLS forzada y pruebas de aislamiento con `clinic_app` (`packages/db/test/membership-plans.test.ts`).
- **Vigencia:** las cuotas del plan tienen vigencia, como los precios. Los beneficios se editan con `version` y valen desde que se guardan. Los cargos guardarán el beneficio aplicado (parte B), así que editar un beneficio no cambia lo ya cobrado.
- **API:** `/api/admin/membership-plans` (`catalog.manage`): lista, detalle, crear, editar, desactivar y activar planes, y crear, editar, desactivar y activar beneficios.
  - Las cuotas nuevas valen desde el día más adelantado de las sedes activas, como el precio general.
  - Auditoría: `membership_plan.*` y `membership_benefit.*`, con el antes y el después (importes, porcentajes y códigos del catálogo; no son datos clínicos).
  - Las consultas usan las rutas del catálogo (`/api/admin/catalog/consultations`).
- **Web:** en Catálogos, la pestaña «Consultas» y la columna y el campo «Categoría de membresía» en Procedimientos y Pruebas.
  - La pestaña «Planes de membresía» (S-ADM-21) va sin sede y con «Beneficios» en la fila.
  - La página `/admin/catalogos/planes-de-membresia/<plan>` (S-ADM-22) tiene un selector de categoría en lugar del código libre, los servicios del catálogo en cada incluido y el periodo fijo «por persona y año de la membresía».
- **Semilla:** consultas ficticias con precio, la categoría de cada procedimiento y prueba, y los cuatro planes con nombres genéricos, sus cuotas, sus incluidos (consulta inicial, chequeo A1c + TSH, PSA y 3 de seguimiento) y sus descuentos, en las dos organizaciones. El catálogo ficticio no tiene ECG ni Papanicolaou.

## Cómo quedó implementada la parte B (T-026b, 2026-11-04)

- **Base de datos:** migraciones `0041` y `0042`.
  - `patient_memberships`: plan, titular, sede de inscripción, código `NOR1-M-000012`, estado, fecha de inscripción, inicio, día de cobro, las cuotas con que se inscribió («Monto fijo»), «Identidad verificada» (quién y cuándo, nunca un número), aviso de cancelación (día, quién y último día con beneficios) y cancelación (día y motivo: aviso, mensualidad sin pagar o cuota inicial sin pagar). GRANT por columnas: plan, titular, inicio, día de cobro y cuotas no cambian.
  - `patient_membership_members`: titular y afiliados con su alta y su baja; un índice único parcial impide que un paciente esté en dos membresías en curso.
  - `patient_membership_events`: el historial (inscripción, activación, suspensión, reactivación, aviso, cancelación, afiliado añadido o quitado), con el actor «Sistema» en los pasos automáticos. Solo se inserta.
  - `membership_fees`: cuota inicial y mensualidades como cuotas pendientes, con su periodo y su importe; se pagan (T-028) o se anulan, nunca se borran.
  - `membership_benefits.quota_mode` («Paquete» o «Cupo compartido»), con la migración de los incluidos que ya existían.
  - `coverages.patient_membership_id` y, en `charges`, el beneficio guardado en el cargo: membresía, año de beneficios, incluido y unidades sin costo, laboratorio de la misma visita, descuento (porcentaje) y lo que resta la membresía en centavos.
  - RLS forzada y pruebas de aislamiento con `clinic_app` en `packages/db/test/patient-memberships.test.ts`.
- **Estado y cuotas:** `settleMembership()` (`packages/db/src/patient-memberships.ts`) deja guardado el estado según el reloj: crea las mensualidades, suspende, reactiva, cancela, anula las cuotas pendientes y da de baja a las personas. La usan la API antes de leer o cambiar una membresía y el trabajo del worker `memberships-daily`, que corre cada hora (`apps/worker/src/memberships.ts`). Las reglas de fechas son funciones puras de `packages/shared/src/patient-memberships.ts`.
- **Beneficios:** `applyMembershipBenefits()` (compartido, puro) y `recalculateVisitBenefits()` (`apps/api/src/membership-benefits.ts`). Se recalculan al crear y cancelar órdenes y al cambiar la cobertura; T-027 lo hará también con «Agregar cargo». Redondeo al centavo más cercano, la mitad hacia arriba, sin coma flotante.
- **API:** `GET|POST /api/patients/:id/membership` (tarjeta e inscripción con Idempotency-Key), `GET /api/patient-memberships/enrollment-options`, `POST /api/patient-memberships/:id/members`, `…/members/:patientId/remove` y `…/cancel`. Permiso nuevo `memberships.manage` (Recepción). La llegada y la cobertura de la visita aceptan `{ type: 'membership' }` solo con una membresía que da beneficios hoy (`409 membership_not_active`).
- **Web:** la tarjeta «Membresía» del perfil (S-PAC-22) con «Inscribir en un plan» (S-PAC-23), «Añadir afiliado», «Quitar» y «Registrar aviso de cancelación»; «Membresía activa: {plan} (desde {fecha})» y la opción «Membresía» en la llegada y en el diálogo Cobertura; «Membresía −{importe}» en la orden; «Cómo se cuenta la cantidad» en los incluidos de S-ADM-22.
- **Semilla:** Paula Romero Aguilar (NOR1) e Iván Peña Villalobos (SUR1) con el plan Esencial activo, y Lucía y Mateo Hernández Díaz con el plan Familiar, desde el día en que se siembra (la cuota inicial, marcada como pagada hasta que llegue T-028).
- **Pruebas:** `packages/shared/test/patient-memberships.test.ts`, `packages/db/test/patient-memberships.test.ts`, `apps/worker/test/memberships.test.ts` (reloj fijado justo antes y después de D+1 y de D+30), `apps/api/test/patient-memberships.test.ts` (primer y último día del año de beneficios, «Monto fijo», «Paquete» y «Cupo compartido») y la E2E `membresias.spec.ts`.
- **Para T-027 y T-028:** T-027 suma lo que resta la membresía de cada cargo («Descuento total») y llama al recálculo al agregar un cargo de Caja y al abrir el estado de cuenta. T-028 marca la cuota como pagada y llama a `settleMembership()` en la misma transacción, que activa o reactiva la membresía.
