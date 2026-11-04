# T-026b — Datos de los planes de membresía y decisiones del dueño

Fuente: documento «Cuidado extendido de SALUD» de Clínica Hispana Lancaster, entregado por el dueño el 2026-11-03.
Solo contiene datos de los planes, ningún dato de pacientes. Las decisiones están tomadas por el dueño; no se reinterpretan.

## 1. Planes

| Plan | Cuota inicial | Mensualidad | Personas |
| --- | --- | --- | --- |
| Cuidado esencial de SALUD | $100.00 | $39.00 | 1 |
| Cuidado extendido de SALUD | $150.00 | $59.00 | 1 |
| Cuidado total de SALUD | $175.00 | $89.00 | 1 |
| Cuidado de SALUD Familiar | $250.00 | $99.00 | Hasta 4 (titular + 3 afiliados) |

Descripciones (para la pantalla del plan):

- **Esencial:** atención médica básica asequible con consultas esenciales, chequeos anuales, ECG y descuentos en tratamientos y procedimientos.
- **Extendido:** atención individual ampliada que incluye más visitas, exámenes preventivos y mayores descuentos en servicios.
- **Total:** atención individual que incluye visitas ilimitadas, exámenes preventivos y máximos descuentos en servicios.
- **Familiar:** atención completa para familias (4 miembros) con beneficios en exámenes de laboratorio, atención médica y descuentos en servicios.

## 2. Servicios incluidos (todos los planes, por persona)

Cada uno se cuenta por persona y por año de la membresía:

- 1 Consulta médica inicial (examen general y evaluación).
- 1 Chequeo general al año (exámenes de laboratorio). El Administrador define qué servicios del catálogo forman el chequeo.
- ECG (1 al año).
- 1 prueba de Papanicolaou al año (para mujeres).
- 1 prueba de PSA al año (para hombres).
- 3 consultas gratis de seguimiento o enfermedad.
  - En el plan **Total**, esas 3 consultas incluyen su examen de laboratorio sin costo.

Recepción o el personal eligen el servicio; el sistema no decide por el sexo del paciente, solo cuenta cuántos se usaron.

## 3. Descuentos por categoría

| Categoría | Esencial | Extendido | Total | Familiar |
| --- | --- | --- | --- | --- |
| Consultas (desde la 4.ª en el año) | 35 % | 50 % | 100 % (ilimitadas, todas gratis) | 35 % |
| Tratamientos (inyecciones y medicamentos) | 0 % | 25 % | 50 % | 25 % |
| Exámenes de laboratorio | 25 % | 50 % | 50 % | 20 % |
| Cirugías menores y procedimientos | 15 % | 25 % | 50 % | 15 % |

- El Administrador marca cada servicio del catálogo con una categoría: Consulta, Tratamiento, Laboratorio o Cirugía menor/procedimiento.
- Primero se usan los servicios incluidos (gratis); después se aplica el descuento.
- El descuento se calcula en el servidor, en centavos, sobre el precio vigente de la sede (ADR 0029).

## 4. Decisiones del dueño (2026-11-03)

| # | Tema | Decisión |
| --- | --- | --- |
| 1 | Año de beneficios | Cuenta desde la fecha de inicio de la suscripción (aniversario), no desde el 1 de enero. |
| 2 | Cuota inicial | Incluye el primer mes. La primera mensualidad se cobra un mes después del inicio, el día de cobro elegido. |
| 3 | Plan Total | Consultas ilimitadas, todas gratis. Las «3 consultas con examen de laboratorio» incluyen ese laboratorio sin costo. |
| 4 | Plan Familiar | Todos los beneficios son **por persona** (incluidas las 3 consultas gratis). Máximo 4 personas. |
| 5 | Después de las 3 consultas gratis | Se aplica el % de descuento en consultas del plan. |
| 6 | Falta de pago | Si una mensualidad vence sin pagarse, los beneficios se **suspenden automáticamente** (sin días de gracia) y vuelven en cuanto se paga. |
| 7 | Cancelación | (a) Por el paciente: aviso con 15 días de anticipación; los beneficios valen hasta el final del mes pagado. (b) Automática: si a los **30 días** de vencida la mensualidad sigue sin pagarse, la membresía se **cancela automáticamente**. |
| 8 | Permanencia mínima | No hay. |
| 9 | «Tratamientos» | Inyecciones y medicamentos del catálogo. |
| 10 | Telesalud | Fuera de V1. Solo consultas presenciales. |
| 11 | Descuento manual en Caja | **Caja no aplica descuentos manuales.** Los únicos descuentos son los de la membresía, automáticos. |

## 5. Inscripción

**Etapa 1 (T-026b, para el piloto):** inscripción en Recepción, desde el perfil del paciente: plan, fecha de inicio, día de cobro del mes y, en el plan Familiar, hasta 3 afiliados que deben ser pacientes registrados. La cuota inicial y las mensualidades se cobran en Caja con la terminal de la clínica (efectivo o tarjeta); el sistema solo registra el pago.

**Etapa 2 (después del despliegue, no en la fase 3):** inscripción en línea desde https://clinicahispanamedicalgroup.com con la página de pago de un procesador (Stripe o Square). El procesador guarda la tarjeta y cobra cada mes; avisa al sistema con un webhook firmado; el sistema crea una «Solicitud de membresía» en una bandeja de Recepción, que verifica la identidad, vincula al paciente y la activa. Depende de la marca de la terminal de la clínica (pendiente de confirmar).

## 6. Reglas de seguridad

- El sistema **nunca** guarda números de tarjeta, CVV ni fechas de expiración.
- El sistema **no** guarda números de ID ni de pasaporte. Recepción mira el documento y el sistema anota «Identidad verificada», con quién y cuándo.
- El formulario en papel de la clínica pide el CVV; eso es un tema de la clínica fuera del sistema.

## 7. Decisiones del dueño (2026-11-04)

Respuestas a las preguntas del plan de T-026b. Están también en el [ADR 0034](../decisions/0034-membresias-fase-3.md) y en el [ADR 0041](../decisions/0041-sin-descuento-manual-caja.md).

| # | Tema | Decisión |
| --- | --- | --- |
| 1 | Cobro de las consultas | Nuevo tipo de catálogo **«Consulta»**, con precio por sede, que Recepción agrega en Caja desde el catálogo. Se **elimina el cargo manual de precio libre** (S-CAJ-08): todo cargo sale del catálogo, porque un precio libre sería un descuento manual (decisión 11). |
| 2 | Consulta inicial y «3 gratis» | La consulta inicial va **aparte** de las 3 de seguimiento: **4 gratis en total**. El descuento de consultas se aplica cuando se agotan las 3 de seguimiento. |
| 3 | Plan Total, laboratorio sin costo | Sin costo los laboratorios **ordenados en la misma visita** que una de esas 3 consultas. |
| 4 | Activación | **«Pendiente de pago»**, sin beneficios, hasta pagar la cuota inicial. Se activa con el pago (T-028). |
| 5 | Primera mensualidad | El primer día de cobro que caiga al cumplirse un mes desde el inicio, o después (inicio el 3 de noviembre y día de cobro 15: vence el 15 de diciembre). Los días 29 a 31 pasan al último día de los meses más cortos. |
| 6 | Vencimiento | Si vence el día D sin pagarse, se suspende a las 12:00 a. m. de D+1 en la hora de la sede y se cancela a las 12:00 a. m. de D+30. |
| 7 | Aviso con menos de 15 días | Esa mensualidad se debe igual y los beneficios duran un mes más. |
| 8 | Afiliados | Un paciente solo puede estar en una membresía activa; el año de beneficios de un afiliado cuenta desde el inicio de la membresía; se pueden añadir y quitar afiliados después. |
| 9 | Precio por sede | Los planes cuestan lo mismo en todas las sedes. |

**Trabajo:** T-026b se hace en dos PR:
- **(A)** planes, cuotas de plan, beneficios, categorías y el tipo «Consulta»;
- **(B)** inscripción, cuotas del paciente, trabajo del worker, cobertura y aplicación de beneficios.

## 8. Decisiones del dueño (2026-11-04, plan de la parte B)

Respuestas a las preguntas del plan de la parte B. Están también en el [ADR 0034](../decisions/0034-membresias-fase-3.md).

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
