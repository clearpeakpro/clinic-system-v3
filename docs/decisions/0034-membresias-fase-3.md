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
