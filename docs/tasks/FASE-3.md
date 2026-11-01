# Fase 3 — Flujo de la visita (MVP): desglose en tareas

**Objetivo de la fase:** al terminar, en tu computadora puedes seguir a un paciente ficticio de principio a fin:

- llega con cita, sin cita o registrándose él mismo en el kiosco (en español o en inglés);
- pasa por enfermería y por el proveedor;
- recibe órdenes con su cargo y el laboratorio sugerido;
- paga en Caja (pago directo, seguro o membresía) y se lleva su recibo.

Todo en vivo entre varias ventanas y aislado entre las dos clínicas ficticias.

La fase es demasiado grande para una sola demo (unos 50 días de trabajo). Se divide en dos partes, cada una con su demo de cierre:

- **3A — Llegada, kiosco, Panel, enfermería y proveedor** (T-017 a T-024).
- **3B — Órdenes, membresías, Caja, pagos, recibo, fusión de pacientes y reporte diario** (T-025 a T-032).

**Orden** (una tarea por vez, cada una en su rama y con su PR):

- 3A: T-017 → T-018 → T-019 → T-022 → T-023 → T-020 → T-021 → T-024 (demo 3A).
- 3B: T-025 → T-026 → T-026b → T-027 → T-028 → T-029 → T-030 → T-031 → T-032 (demo 3B).

El kiosco va al final de 3A porque necesita el asistente de llegada (T-017) y el Panel (T-019).

## Reglas para todas las tareas

Las de `CLAUDE.md` y las de la fase 2, más estas:

- **`Idempotency-Key` obligatorio** en:
  - la llegada (con cita, sin cita y la confirmación de un registro del kiosco);
  - el envío del kiosco;
  - los pagos;
  - las anulaciones: de cargo, de pago y la cancelación de una orden, que anula su cargo.

  Se usa el `IdempotencyService` que ya existe (`apps/api/src/idempotency.ts`, [ADR 0019](../decisions/0019-operaciones-criticas.md)): misma clave → mismo recurso; otro contenido → 409.
- **Orden y cargo en una sola transacción**, con el precio vigente de la sede que calcula el servidor ([ADR 0029](../decisions/0029-precio-general-excepcion-sede.md)). Cancelar la orden anula su cargo en esa misma transacción.
- **Dinero en centavos, calculado en el servidor.** Cargos, descuentos, beneficios de membresía, la parte del seguro, totales y saldo los calcula la API. La web solo da formato y nunca suma.
- **Toda transición de la visita pasa por la máquina de estados compartida** (`packages/shared/src/visit.ts`), la misma para la web y la API.
  - Cada transición queda en `encounter_events` con actor, sede, hora y, cuando se exige, el motivo.
  - Ningún endpoint cambia `encounters.status` sin pasar por ella.
- **Ninguna prueba depende de la fecha ni de la hora actual:**
  - las funciones puras reciben `now` como parámetro (como `appointmentActions()` de la fase 2);
  - la API y el worker leen la hora de un reloj inyectable que las pruebas fijan;
  - las E2E usan fechas relativas al día de la sede, creadas por su propia semilla;
  - el cambio de día se prueba aparte (vencimiento del kiosco, «Completadas hoy», recibos por año, reporte diario), con relojes fijados a las 11:59 p. m. y a las 12:01 a. m. de la sede y en un día con cambio de horario.
- **Solo datos ficticios**, con las dos organizaciones («Clínica Demo Norte» y «Clínica Demo Sur»), y prueba de aislamiento con el rol real en cada tabla nueva.
- **Mínimo necesario:**
  - los eventos en vivo, los avisos y la cola de órdenes llevan códigos (`NOR1-V-000123`, `NOR1-O-000045`) y estados, nunca nombres ni datos clínicos;
  - las lecturas de la visita, de enfermería y del estado de cuenta se auditan.
- **Concurrencia optimista** con `version` en visita, cobertura, signos vitales, valoración, orden y estado de cuenta: 409 y recarga, nunca «guardar igualmente».
- **Códigos** con `code_counters` en la misma transacción (ADR 0019):
  - visita `NOR1-V-000123` y orden `NOR1-O-000123`, por sede;
  - recibo `NOR1-R-2026-000045`, por sede y año, sin huecos.

  Mandan los formatos del ADR, no los del manual (`LAN-E-…`, `LAN-R-000045`).
- **Permisos administrativos en el flujo clínico** ([ADR 0033](../decisions/0033-acciones-administrativas-flujo-clinico.md)): forzar estado, anular y la excepción de «Enviar al proveedor» son del Propietario y el Administrador, pero solo valen junto a un rol clínico en la sede.
- La tarea no está terminada sin `pnpm lint`, `pnpm typecheck`, `pnpm test`, sus E2E y la CI (check y e2e) en verde.

## Índice

| Tarea | Parte | Tamaño | Depende de | Decisiones |
| --- | --- | --- | --- | --- |
| T-017 — Llegada con cita y sin cita | 3A | 4 días | fase 2 | [0034](../decisions/0034-membresias-fase-3.md) |
| T-018 — Pantalla de la visita y su circuito | 3A | 4 días | T-017 | [0033](../decisions/0033-acciones-administrativas-flujo-clinico.md) |
| T-019 — Panel en vivo | 3A | 2–3 días | T-018 | — |
| T-022 — Enfermería | 3A | 4 días | T-018 | [0033](../decisions/0033-acciones-administrativas-flujo-clinico.md), [0036](../decisions/0036-valoracion-paciente-visita.md) |
| T-023 — Proveedor | 3A | 2–3 días | T-022 | — |
| T-020 — Kiosco: tableta y formulario | 3A | 3–4 días | T-017 | [0031](../decisions/0031-kiosco-idioma-consentimientos-ruta.md) |
| T-021 — Llegadas del kiosco en Recepción | 3A | 3 días | T-019, T-020 | [0031](../decisions/0031-kiosco-idioma-consentimientos-ruta.md) |
| T-024 — Cierre de 3A: semilla, guion y demo | 3A | 1–2 días | T-017 a T-023 | — |
| T-025 — Órdenes con cargo y laboratorio sugerido | 3B | 4 días | T-024 | [0033](../decisions/0033-acciones-administrativas-flujo-clinico.md) |
| T-026 — Ejecutar órdenes y cola de órdenes | 3B | 3 días | T-025 | — |
| T-026b — Planes de membresía y beneficios | 3B | 3–4 días | T-026 | [0034](../decisions/0034-membresias-fase-3.md) |
| T-027 — Caja: cola y estado de cuenta | 3B | 4 días | T-026b | [0034](../decisions/0034-membresias-fase-3.md), [0035](../decisions/0035-reparto-importe-seguro.md) |
| T-028 — Pagos, anulaciones y saldos | 3B | 3 días | T-027 | [0033](../decisions/0033-acciones-administrativas-flujo-clinico.md) |
| T-029 — Recibos | 3B | 2–3 días | T-028 | [0037](../decisions/0037-recibo-80mm-es-en.md) |
| T-030 — Fusionar pacientes | 3B | 2–3 días | T-028 | [0032](../decisions/0032-fusionar-pacientes.md) |
| T-031 — Reporte diario de la sede | 3B | 2–3 días | T-029 | [0038](../decisions/0038-reporte-diario-antes-piloto.md) |
| T-032 — Cierre de 3B: semilla, guion y demo | 3B | 1–2 días | T-025 a T-031 | — |

Todas las decisiones de la fase están tomadas (2026-11-01). Ver el resumen al final.

---

# Parte 3A — Llegada, kiosco, Panel, enfermería y proveedor

## T-017 — Llegada con cita y sin cita

**Decisiones (resueltas el 2026-11-01):** P-18 ([ADR 0034](../decisions/0034-membresias-fase-3.md)). En 3A, el paso Cobertura ofrece solo «Pago directo» y «Seguro». «Membresía» llega en T-026b.

**Objetivo:** Recepción registra la llegada de un paciente con cita o sin cita, y la visita queda abierta en «Registrado».

**Pantallas:** S-REC-18, S-REC-19, S-REC-20 a S-REC-27; S-REC-12 (reutilizado); S-REC-09 (se habilita «Registrar llegada»).

**ADR:** [0005](../decisions/0005-ruta-en-llegada.md) (la ruta elegida se guarda), [0019](../decisions/0019-operaciones-criticas.md), [0026](../decisions/0026-cifrado-campos-busqueda.md) (datos del seguro cifrados), [0027](../decisions/0027-acceso-clinico-propietario-administrador.md), [0034](../decisions/0034-membresias-fase-3.md).

**Incluye**
1. Tablas `encounters`, `encounter_events` y `coverages`, con RLS, claves compuestas, `version` y pruebas de aislamiento.
   - Índices únicos parciales: una visita abierta por cita, y una por paciente y sede.
   - `coverages` ya admite el tipo `membership`, sin usarlo hasta T-026b, para no tener que migrar después.
2. Máquina de estados de la visita en `packages/shared/src/visit.ts`: transiciones, rol dueño de cada paso y reglas del manual («Estados de la visita», `docs/manual/README.md`). Pruebas unitarias de cada transición permitida y prohibida.
3. Asistente de llegada (S-REC-20 a 26): Paciente, Sede, Ruta, Cobertura, Datos del pagador y Confirmar.
   - Con cita, la ruta que elige Recepción **sí se guarda** (ADR 0005; el manual no la enviaba).
   - Datos del seguro: nombre, ID de miembro y un solo término (copago, coaseguro o deducible).
   - Nombre e ID, cifrados con `FieldCipher`; importes en centavos y el coaseguro en centésimas de punto.
   - Al cambiar de término se vacía el valor (en el manual se conservaba y causaba errores).
4. «Sin cita» (S-REC-19): elegir al paciente o «Crear paciente», y un tipo de cita opcional que sugiere la ruta.
5. Llegada en una sola transacción, con `Idempotency-Key`: visita, cobertura, primer evento, cita «Llegó», código `NOR1-V-…` y auditoría. Si la cobertura falla se deshace todo (no existe el estado «abierta sin cobertura» del manual).
6. «Llegada registrada» (S-REC-27) con el código de la visita y «Abrir visita». Si ya hay una visita abierta: «Esta acción no está permitida en el estado actual.» con «Abrir la visita existente».
7. Agenda y perfil: «Registrar llegada» habilitado en las citas de hoy (se quita «Llega en la fase 3»).
8. Eventos en vivo `encounter.changed` (id y estado) a la sala de la sede, y `appointment.changed` de la cita.

**No incluye:** la pantalla de la visita (T-018), el Panel (T-019), el kiosco (T-020 y T-021), las membresías (T-026b).

**Terminada cuando:**
- Recepción de NOR1 registra la llegada de una cita de hoy y la cita pasa a «Llegó» en otra ventana sin recargar;
- registra una visita sin cita de un paciente nuevo;
- repetir el envío con la misma `Idempotency-Key` no crea otra visita, y con otro contenido responde 409;
- un segundo registro del mismo paciente en la sede se rechaza;
- los datos del seguro están cifrados en la base;
- la máquina de estados tiene pruebas de todas sus transiciones;
- E2E `llegada.spec.ts`.

## T-018 — Pantalla de la visita y su circuito

**Decisiones (resueltas el 2026-11-01):** P-17 ([ADR 0033](../decisions/0033-acciones-administrativas-flujo-clinico.md)). «Forzar estado…» y reabrir una visita son del Propietario y el Administrador, solo con un rol clínico en la sede.

**Objetivo:** cualquier rol clínico abre la visita y ve su encabezado, su cobertura y su historial. Recepción la envía a su circuito, le asigna proveedor o la cierra.

**Pantallas:** S-CLI-04, S-CLI-05, S-CLI-06, S-CLI-07, S-CLI-09, S-CLI-10, S-CLI-11, S-CLI-12, S-CLI-24, S-CLI-26; S-PAC-08 (pestaña Visitas) y «Última visita» del perfil.

**ADR:** [0003](../decisions/0003-enviar-al-proveedor.md), [0005](../decisions/0005-ruta-en-llegada.md), [0008](../decisions/0008-historial-notificaciones.md), [0018](../decisions/0018-auditoria.md), [0027](../decisions/0027-acceso-clinico-propietario-administrador.md), [0033](../decisions/0033-acciones-administrativas-flujo-clinico.md).

**Incluye**
1. Pantalla de la visita con sus secciones según el rol. Enfermería, Órdenes y Facturación se completan en sus tareas.
2. Barra de acciones (S-CLI-07), calculada con la máquina de estados según el estado y el rol:
   - «Enviar a enfermería» (ruta Estándar) y «Enviar a procedimiento» (rutas directas), para Recepción;
   - banner «Esta visita está cerrada.».
3. Asignar proveedor (S-CLI-05/06) y «Asignarme», con el aviso **«Paciente asignado a usted»** por el outbox (solo el código de la visita).
4. Cerrar visita (S-CLI-09): «Se retiró antes» o «Cancelada», con motivo obligatorio.
5. Cobertura (S-CLI-11/12): ver y editar con la visita abierta, con `version` y auditoría (solo nombres de campos).
6. Historial (S-CLI-24) desde `encounter_events`, con el chip «Forzado».
7. «Forzar estado…» (S-CLI-10), con motivo obligatorio, según el ADR 0033.
8. Perfil: pestaña Visitas (S-PAC-08) y «Última visita».
9. Lectura de la visita auditada y conflicto de versión en todas las acciones.

**No incluye:** enfermería (T-022), consulta (T-023), órdenes (T-025), facturación (T-027), documentos de la visita (S-CLI-25, fase 4, con S3).

**Terminada cuando:**
- Recepción envía una visita Estándar a enfermería y una «Solo inyección» a procedimiento;
- el proveedor recibe «Paciente asignado a usted» en la campana, sin el nombre del paciente;
- cerrar sin motivo no se permite;
- una transición fuera de orden responde «Esta transición no está permitida en el estado actual.»;
- dos ventanas que actúan a la vez: la segunda recibe 409;
- «Forzar estado…» se niega a un Administrador sin rol clínico en la sede;
- E2E `visita.spec.ts`.

## T-019 — Panel en vivo

**Decisiones:** ninguna.

**Objetivo:** cada rol ve en el Panel quién está en la clínica, en qué estación y desde cuándo, en vivo.

**Pantallas:** S-REC-01, S-REC-02, S-REC-03, S-REC-04, S-REC-05.

**ADR:** [0012](../decisions/0012-accesos-faltantes.md) (búsqueda en colas), [0027](../decisions/0027-acceso-clinico-propietario-administrador.md).

**Incluye**
1. Tarjetas de métricas (S-REC-02), calculadas en el servidor con el día de la sede. «En espera» incluye las visitas abiertas de días anteriores.
2. Filtros por estación y proveedor (S-REC-03), con el filtro inicial de cada rol (Enfermería: chip «Enfermería»; Proveedor: «Mis pacientes»).
3. Lista en vivo (S-REC-04), ordenada por mayor espera, con el cronómetro calculado desde la hora del servidor y la búsqueda del ADR 0012.
4. Indicador de conexión (S-REC-05) y modo degradado (refresco cada 30 s), con el tiempo real de T-009 y T-015.
5. El «N citas hoy» de la fase 2 pasa al Panel nuevo.

**No incluye:** la bandeja «Llegadas del kiosco» (T-021).

**Terminada cuando:**
- al registrar una llegada en una ventana, la tarjeta y la lista cambian en otra en menos de 2 s;
- el cronómetro se prueba con reloj fijado;
- un rol sin `panel.view` no lo ve;
- E2E `panel.spec.ts`.

## T-022 — Enfermería

**Decisiones (resueltas el 2026-11-01):**
- P-20 ([ADR 0036](../decisions/0036-valoracion-paciente-visita.md)): Alergias, Antecedentes personales, Antecedentes familiares, Cirugías, Estilo de vida e Historia reproductiva son **del paciente**, versionados y con aviso en cada visita. Síntomas / motivo de consulta y Notas de enfermería son **de la visita**. Edita Enfermería; el Proveedor solo lee.
- P-17 ([ADR 0033](../decisions/0033-acciones-administrativas-flujo-clinico.md)): la excepción de «Enviar al proveedor» sin signos vitales la autorizan el Propietario o el Administrador con rol clínico en la sede, con motivo.

**Objetivo:** Enfermería toma al paciente de su cola, registra signos vitales y valoración, y lo envía al proveedor.

**Pantallas:** S-CLI-01, S-CLI-13, S-CLI-14, S-CLI-15, S-CLI-16, S-CLI-26.

**ADR:** [0003](../decisions/0003-enviar-al-proveedor.md), [0006](../decisions/0006-alergias-por-paciente.md), [0018](../decisions/0018-auditoria.md) (solo nombres de campos), [0027](../decisions/0027-acceso-clinico-propietario-administrador.md), [0033](../decisions/0033-acciones-administrativas-flujo-clinico.md), [0036](../decisions/0036-valoracion-paciente-visita.md).

**Incluye**
1. Cola de enfermería (S-CLI-01) con «Iniciar» y «Abrir», en vivo y ordenada por espera. Las visitas de ruta directa aparecen como «Procedimiento pendiente», solo con «Abrir».
2. Tablas de signos vitales, historia del paciente y valoración de la visita, versionadas, con RLS y pruebas de aislamiento.
3. Signos vitales (S-CLI-14) con los rangos del manual.
   - El IMC lo calcula el servidor; la web solo lo previsualiza.
   - El primer guardado en «Esperando enfermería» pasa la visita a «Con enfermería» por la máquina de estados.
4. Valoración (S-CLI-15) con la división del ADR 0036. Las alergias se ven como aviso en el encabezado de la visita.
5. **Un solo «Enviar al proveedor»** (ADR 0003): exige peso o presión arterial completa guardados; la excepción, con motivo, según el ADR 0033.
6. Vista limitada para Recepción: solo estado y fechas, sin valores.
7. Bloqueo de cambios en «Listo para caja», «En caja» y en visitas cerradas.
8. Auditoría con solo los nombres de los campos, y lecturas auditadas.

**No incluye:** ejecutar órdenes (T-026).

**Terminada cuando:**
- Enfermería inicia, guarda signos vitales y valoración, y envía al proveedor;
- sin peso ni presión, el servidor rechaza el envío;
- Recepción no ve los valores;
- una prueba comprueba que la auditoría no contiene ningún valor clínico;
- las alergias registradas en una visita aparecen en la siguiente;
- E2E `enfermeria.spec.ts`.

## T-023 — Proveedor

**Decisiones:** ninguna.

**Objetivo:** el Proveedor toma pacientes de su cola, hace la consulta y la termina.

**Pantallas:** S-CLI-02, S-CLI-07 (acciones del Proveedor), S-CLI-08, S-CLI-14 (corrección de signos vitales por el Proveedor).

**ADR:** [0003](../decisions/0003-enviar-al-proveedor.md), [0027](../decisions/0027-acceso-clinico-propietario-administrador.md).

**Incluye**
1. Cola de proveedor (S-CLI-02) con los filtros «Mis pacientes», «Sin asignar» y «Todos», orden por grupo y por espera, y «Enfermería lista {hora}».
2. «Iniciar consulta» se autoasigna la visita si no tenía proveedor, **desde la cola y desde la barra** (el manual solo lo hacía desde la cola), en una sola transacción.
3. «Listo para pago» y «Enviar a procedimiento» desde «Con proveedor». «Órdenes abiertas» (S-CLI-08) queda preparado y se activa en T-025.
4. El Proveedor corrige signos vitales; la valoración es de solo lectura para él.
5. Cola de enfermería de solo lectura para el Proveedor.

**No incluye:** crear órdenes (T-025).

**Terminada cuando:**
- el Proveedor inicia la consulta de una visita sin asignar y queda asignada a él;
- «Listo para pago» la deja en «Listo para caja»;
- si otro proveedor la toma a la vez, recibe 409;
- E2E `proveedor.spec.ts`.

## T-020 — Kiosco: tableta y formulario

**Decisiones (resueltas el 2026-11-01):** P-06 ([ADR 0031](../decisions/0031-kiosco-idioma-consentimientos-ruta.md)).
- El kiosco está en **español e inglés**, con un botón grande que cambia todos los textos. El idioma no se guarda.
- Los consentimientos se firman **en papel en Recepción**: el kiosco no los menciona.
- Sin sugerencias de ruta (ver T-021).

**Objetivo:** una tableta vinculada a una sede muestra el formulario del kiosco y envía registros sin poder leer nada.

**Pantallas:** S-KIO-01, S-KIO-02; S-ADM-10 (sección de kioscos de la sede: vincular y revocar).

**ADR:** [0014](../decisions/0014-kiosco.md), [0019](../decisions/0019-operaciones-criticas.md), [0023](../decisions/0023-autenticacion.md) (criterio 7: el token va separado de las sesiones), [0026](../decisions/0026-cifrado-campos-busqueda.md), [0031](../decisions/0031-kiosco-idioma-consentimientos-ruta.md).

**Incluye**
1. Tablas `kiosk_devices` (hash del token, sede, vencimiento, revocado) y `kiosk_checkins` (contenido cifrado, estado, vencimiento), con RLS y pruebas de aislamiento.
2. Vincular la tableta con un código de un solo uso desde Sedes (Propietario y Administrador).
   - Cookie httpOnly + Secure de 90 días, renovable, con el único permiso `kiosk.submit`.
   - Revocar corta el dispositivo al instante.
   - Ningún endpoint de lectura acepta el token: una prueba los recorre todos.
3. Formulario `/kiosk/<SEDE>` con los campos de `11_kiosco.md`, botones de 64 dp o más, alto contraste y el botón de idioma. Los textos en inglés van en el mismo catálogo de textos.
4. Datos del paciente solo en memoria:
   - nada en localStorage, sessionStorage ni IndexedDB, y la API fuera de la caché del service worker;
   - el idioma elegido tampoco se guarda;
   - autocompletado desactivado;
   - limpieza al enviar, tras 60 s de inactividad (con aviso a los 10 s), al ocultar la pestaña y al recargar;
   - «Listo» no muestra el nombre.
5. Envío con `Idempotency-Key`, validación en el servidor y límite de envíos por dispositivo. Auditoría con actor `kiosk`.
6. Trabajo diario del worker: un registro sin confirmar vence al cierre del día de la sede y su contenido se borra a las 24 h. Se prueba con reloj fijado.

**No incluye:** la bandeja de Recepción ni la confirmación (T-021). El modo de pantalla fija de Android es configuración de la tableta: se documenta, no se programa.

**Terminada cuando:**
- una tableta vinculada envía un registro, en español y en inglés, y una revocada recibe 401;
- con el token del kiosco no se lee ningún dato;
- una E2E comprueba que, tras enviar, no queda nada en el almacenamiento del navegador ni en la caché;
- con el reloj simulado, el registro vence y se vacía;
- E2E `kiosco.spec.ts`.

## T-021 — Llegadas del kiosco en Recepción

**Decisiones (resueltas el 2026-11-01):** P-06 c y d ([ADR 0031](../decisions/0031-kiosco-idioma-consentimientos-ruta.md)). No hay sugerencias de ruta ni tabla motivo → ruta en V1: **Recepción elige siempre la ruta**, también con «Vengo por resultados».

**Objetivo:** cada registro del kiosco aparece al instante en el Panel de Recepción, que lo confirma con el asistente de llegada precargado.

**Pantallas:** S-REC-28; S-REC-20 a 27 (precargado); S-PAC-03 (duplicados).

**ADR:** [0005](../decisions/0005-ruta-en-llegada.md), [0014](../decisions/0014-kiosco.md), [0019](../decisions/0019-operaciones-criticas.md), [0031](../decisions/0031-kiosco-idioma-consentimientos-ruta.md).

**Incluye**
1. Bandeja «Llegadas del kiosco» en el Panel, con aviso sonoro y el motivo con icono, texto y color. El evento en vivo lleva solo el id del registro.
2. «Primera vez»: alta pasando por la detección de duplicados. «Ya soy paciente»: coincidencias por nombre, fecha de nacimiento y teléfono, y Recepción elige.
3. Si el paciente tenía cita hoy, la cita pasa a «Llegó» al confirmar.
4. Confirmar con el asistente precargado, con `Idempotency-Key`.
   - Los síntomas pasan a la visita como «motivo declarado por el paciente», sin interpretarlos.
   - Al confirmar se borra el contenido del registro y quedan solo los metadatos.
5. Descartar un registro (por ejemplo, un envío de prueba) con motivo.
6. La ruta se elige en el asistente sin ninguna preselección por el motivo.

**Terminada cuando:**
- un envío del kiosco aparece en el Panel de otra ventana en menos de 2 s y se confirma como visita;
- confirmar dos veces no crea dos visitas;
- tras confirmar, el contenido del registro ya no existe en la base;
- E2E `kiosco-recepcion.spec.ts`.

## T-024 — Cierre de 3A: semilla, guion y demo

**Decisiones:** ninguna.

**Incluye:**
- semilla de `pnpm demo:reset` con visitas en varios estados en cada sede y una tableta de kiosco vinculada;
- guion `docs/DEMO-FASE-3A.md`;
- su E2E (`demo-fase-3a.spec.ts`), con su propia base, como en la fase 2;
- el cierre de 3A en este archivo, con lo que pasa a 3B.

### Demo 3A — qué podrás hacer tú

En tu computadora, con varias ventanas abiertas como si fueran distintos puestos de la clínica:

1. En la tableta (una ventana en modo kiosco), un paciente ficticio elige inglés y se registra solo. En la ventana de Recepción suena el aviso y aparece en «Llegadas del kiosco».
2. Recepción lo confirma, elige la ruta y la cobertura, y la visita aparece en el Panel de todos.
3. Recepción registra también la llegada de un paciente con cita y la de uno sin cita.
4. Enfermería, en otra ventana, lo toma de su cola, anota signos vitales y alergias y lo envía al proveedor. Si intenta enviarlo sin peso ni presión, el sistema no la deja.
5. El Proveedor recibe el aviso «Paciente asignado a usted», inicia la consulta y la deja «Lista para caja».
6. En la siguiente visita de ese paciente, sus alergias aparecen solas.
7. Cierras con su motivo la visita de un paciente que se fue, y ves el historial de cambios de la visita.
8. Compruebas que «Clínica Demo Sur» no ve nada de «Clínica Demo Norte».

---

# Parte 3B — Órdenes, membresías, Caja, pagos, recibo, fusión y reporte diario

## T-025 — Órdenes con cargo y laboratorio sugerido

**Decisiones (resueltas el 2026-11-01):** P-17 ([ADR 0033](../decisions/0033-acciones-administrativas-flujo-clinico.md)). Las órdenes las crea **solo quien tiene el rol Proveedor** en la sede (el manual decía «Proveedor o Administrador»).

**Objetivo:** el Proveedor indica procedimientos, inyecciones y laboratorios. Cada orden nace con su cargo al precio vigente de la sede, y en laboratorio el sistema sugiere a qué laboratorio enviarla.

**Pantallas:** S-CLI-17, S-CLI-18, S-CLI-21; S-CLI-08 (se activa).

**ADR:** [0018](../decisions/0018-auditoria.md), [0019](../decisions/0019-operaciones-criticas.md), [0028](../decisions/0028-laboratorios-costos.md), [0029](../decisions/0029-precio-general-excepcion-sede.md), [0033](../decisions/0033-acciones-administrativas-flujo-clinico.md).

**Incluye**
1. Tablas `orders`, `order_items` y `charges`, con RLS, CHECK de centavos ≥ 0, sin `DELETE` y con pruebas de aislamiento. `charges` es la parte mínima de facturación: un cargo por línea, con origen «Orden» y anulación con motivo cifrado.
2. «Nueva orden» (S-CLI-18):
   - tipo: Procedimiento, Inyección o Laboratorio;
   - ítem del catálogo activo, con su precio vigente calculado por el servidor;
   - cantidad (1 a 1000) y notas cifradas;
   - el «Cargo estimado» lo devuelve la API.
3. **Orden y cargo en una sola transacción**, con código `NOR1-O-…`.
4. **Laboratorio:** una orden puede llevar varias pruebas. `suggestLabs()` corre en el servidor con los costos vigentes el día de la orden en la sede y con la cobertura de la visita:
   - una sola orden cuando un laboratorio hace todas las pruebas; si no, el reparto del ADR 0028, con una orden por laboratorio;
   - aviso «Sin laboratorio asignado»;
   - con seguro no se sugiere: el personal elige el laboratorio;
   - la respuesta lleva solo el **nombre** del laboratorio, nunca costos (una prueba revisa todas las respuestas que reciben Enfermería y Proveedor);
   - cambiar el laboratorio sugerido exige motivo y queda auditado.
5. Cancelar orden (S-CLI-21) con motivo y `Idempotency-Key`: anula su cargo en la misma transacción. Si era la última orden abierta en «Procedimiento pendiente», la visita pasa a «Listo para caja» por la máquina de estados.
6. Las órdenes se crean en los estados del manual (Esperando o Con proveedor, Procedimiento pendiente y, en rutas directas, Registrado). «Listo para pago» se bloquea con órdenes abiertas (S-CLI-08).

**No incluye:** ejecutar órdenes (T-026), el estado de cuenta (T-027).

**Terminada cuando:**
- crear una orden crea su cargo con el precio propio de la sede si lo hay, o con el general si no (pruebas con precios fechados y reloj fijado);
- si falla el cargo, no queda la orden;
- tres pruebas de laboratorio salen en una sola orden con el laboratorio más barato, y con seguro no hay sugerencia;
- ninguna respuesta a Enfermería ni al Proveedor contiene costos;
- cancelar la orden anula su cargo;
- E2E `ordenes.spec.ts`.

## T-026 — Ejecutar órdenes y cola de órdenes

**Decisiones:** ninguna.

**Objetivo:** Enfermería y el Proveedor ejecutan las órdenes desde su cola o desde la visita, y la visita avanza sola cuando se resuelve la última.

**Pantallas:** S-CLI-03, S-CLI-19, S-CLI-20, S-CLI-22.

**ADR:** [0008](../decisions/0008-historial-notificaciones.md), [0019](../decisions/0019-operaciones-criticas.md).

**Incluye**
1. Cola de órdenes (S-CLI-03) con las pestañas Pendientes, En curso, «Completadas hoy» (día de la sede) y Canceladas, y el conmutador «Asignadas a mí». Las tarjetas muestran códigos, no nombres ni notas.
2. Asignar, iniciar y completar con nota (S-CLI-19, 20 y 22), con las reglas de quién puede ejecutar en la sede.
3. Aviso **«Orden asignada a usted»** por el outbox, con el código de la orden.
4. Cuando se completa o cancela la última orden en «Procedimiento pendiente», la visita pasa a «Listo para caja» en la misma transacción, por la máquina de estados.
5. Eventos en vivo de la orden (id y estado).

**Terminada cuando:**
- Enfermería se asigna una orden, la inicia y la completa, y la visita pasa sola a «Listo para caja»;
- una orden asignada a otra persona no se puede iniciar;
- «Completadas hoy» se prueba con reloj fijado en el cambio de día;
- E2E `ordenes-cola.spec.ts`.

## T-026b — Planes de membresía y beneficios

**Decisiones (resueltas el 2026-11-01):** P-18 ([ADR 0034](../decisions/0034-membresias-fase-3.md)). Lancaster ya vende membresías: entran completas en 3B. Esta tarea añade «Membresía» al paso Cobertura de la llegada y sus beneficios en Caja.

**Paso 0, antes de programar:** la tarea empieza con un documento corto para el dueño del producto, con dos partes.

1. **Datos de los planes que hay que conseguir en la clínica.** Solo datos de los planes, **nunca de pacientes**:
   - nombre de cada plan, en español y en inglés;
   - precio: cuota inicial y cuota mensual o anual;
   - qué incluye: qué servicios y cuántos por periodo (mes, año o sin límite);
   - descuentos: sobre qué servicios y de qué porcentaje;
   - vigencia: desde cuándo vale y cuánto dura;
   - renovación: automática o manual, y qué pasa si el paciente no paga;
   - cuántas personas cubre un plan (máximo de miembros);
   - si el precio cambia según la sede.
2. **Preguntas sobre un hueco del manual:** el manual define los planes (S-ADM-21) y sus beneficios (S-ADM-22), pero **no tiene ninguna pantalla para dar de alta la membresía de un paciente**. No dice quién la vende, desde qué pantalla, cómo se cobran las cuotas ni cómo vence. La tarea se detiene a preguntar antes de inventarlo (`CLAUDE.md`), y las respuestas se escriben como ADR.

**Objetivo:** el Administrador define los planes y sus beneficios; Recepción elige «Membresía» al registrar la llegada, y la Caja aplica los beneficios del plan.

**Pantallas:** S-ADM-21, S-ADM-22; S-REC-24 y S-REC-25 (se añade «Membresía»); S-CLI-12 (cobertura de la visita); S-CAJ-07 (beneficios). Más la pantalla de alta de la membresía del paciente que salga del paso 0.

**ADR:** [0029](../decisions/0029-precio-general-excepcion-sede.md), [0034](../decisions/0034-membresias-fase-3.md) y el que salga del paso 0.

**Incluye**
1. Planes y beneficios por organización, con vigencia y `version`, que se desactivan y no se borran (como los precios del ADR 0029).
2. La membresía del paciente, según las respuestas del paso 0.
3. «Membresía» en el paso Cobertura, con el aviso «Membresía activa: {plan} (desde {fecha})» y el plan en «Datos del pagador».
4. Beneficios calculados en el servidor solo con cobertura Membresía y una membresía activa el día de la visita en la sede, sobre los cargos de orden sin descuento manual (S-CAJ-07). Un descuento manual siempre prevalece.
5. RLS, pruebas de aislamiento y auditoría con el antes y el después.

**No incluye:** «Reglas de bono» (S-ADM-23) ni la cifra «Bono» de los reportes, que siguen en la fase 5.

**Terminada cuando:**
- un plan ficticio con un descuento y un servicio incluido aplica bien sus beneficios en el cálculo del estado de cuenta (pruebas con reloj fijado en el primer y el último día de la vigencia);
- un descuento manual prevalece sobre la membresía;
- E2E `membresias.spec.ts`.

## T-027 — Caja: cola y estado de cuenta

**Decisiones (resueltas el 2026-11-01):**
- P-19 ([ADR 0035](../decisions/0035-reparto-importe-seguro.md)): con seguro, el paciente paga el copago (una vez por visita y como máximo el total) o el coaseguro (% del total); con deducible, el monto completo. El resto se muestra aparte como **«A cargo del seguro»** y **no** cuenta como descuento.
- P-18 ([ADR 0034](../decisions/0034-membresias-fase-3.md)): los beneficios de membresía de T-026b se aplican aquí.

**Objetivo:** Recepción ve en Caja las visitas listas, abre su estado de cuenta, ajusta cargos y descuentos, y completa la visita.

**Pantallas:** S-CAJ-01, S-CAJ-02, S-CAJ-03, S-CAJ-04, S-CAJ-05, S-CAJ-06, S-CAJ-07, S-CAJ-08, S-CAJ-09, S-CAJ-16; S-CLI-23.

**ADR:** [0004](../decisions/0004-cobro-tras-completar.md), [0012](../decisions/0012-accesos-faltantes.md) (búsqueda en Caja), [0015](../decisions/0015-terminologia.md) («Caja», no «Checkout»), [0019](../decisions/0019-operaciones-criticas.md), [0029](../decisions/0029-precio-general-excepcion-sede.md), [0034](../decisions/0034-membresias-fase-3.md), [0035](../decisions/0035-reparto-importe-seguro.md).

**Incluye**
1. Estado de cuenta por visita, con `version`, calculado **solo en el servidor** a partir de los cargos activos y los pagos registrados.
   - Reparto con seguro del ADR 0035, beneficios de membresía de T-026b y reglas de redondeo en centavos, escritas y probadas.
   - Filas: «Subtotal», «Descuento total», «A cargo del seguro», «Total a pagar», «Pagado» y «Saldo».
2. Cola de Caja (S-CAJ-01/02) con búsqueda. «Iniciar caja» (el manual decía «Iniciar checkout») se bloquea con órdenes abiertas (S-CAJ-06).
3. Página de Caja de la visita (S-CAJ-03/04) y «Completar visita», con confirmación si queda saldo (S-CAJ-05).
4. Cargo manual (S-CAJ-08: código sin texto libre, precio, cantidad y descuento) y descuento de línea (S-CAJ-09), auditados con el antes y el después.
5. Sección Facturación de la visita (S-CAJ-16 / S-CLI-23): totales para todos, e «Ir a Caja» para Recepción. Se puede cobrar por adelantado desde cualquier estado abierto.
6. Evento en vivo `billing.changed` (id de la visita), que refresca el estado de cuenta.

**No incluye:** pagos y anulaciones (T-028), recibos (T-029).

**Terminada cuando:**
- con pago directo, seguro con copago, seguro con coaseguro, seguro con deducible y membresía, los totales coinciden con casos calculados a mano en pruebas unitarias;
- un copago mayor que el total deja «Total a pagar» igual al total;
- la web no hace ninguna suma (revisión y prueba);
- «Iniciar caja» con órdenes abiertas se rechaza;
- completar con saldo pide confirmación;
- E2E `caja.spec.ts`.

## T-028 — Pagos, anulaciones y saldos

**Decisiones (resueltas el 2026-11-01):** P-17 ([ADR 0033](../decisions/0033-acciones-administrativas-flujo-clinico.md)). Anulan cargos y pagos el Propietario o el Administrador **con rol clínico en la sede**; Recepción cobra, pero no anula.

**Objetivo:** Recepción registra pagos manuales sin duplicarlos nunca, las anulaciones dejan rastro y el saldo que queda se cobra después desde el perfil.

**Pantallas:** S-CAJ-10, S-CAJ-11, S-CAJ-12, S-CAJ-13, S-CAJ-17; S-PAC-10.

**ADR:** [0004](../decisions/0004-cobro-tras-completar.md), [0018](../decisions/0018-auditoria.md), [0019](../decisions/0019-operaciones-criticas.md), [0033](../decisions/0033-acciones-administrativas-flujo-clinico.md).

**Incluye**
1. Tabla `payments` (método, monto en centavos, referencia cifrada de la que solo se ven los últimos 4 caracteres, anulación con motivo), sin `DELETE`, con RLS y pruebas de aislamiento.
2. Registrar pago (S-CAJ-11) con `Idempotency-Key`, en una transacción: `SELECT … FOR UPDATE` del estado de cuenta, insertar el pago, recalcular el saldo y auditar.
   - Un monto mayor que el saldo da un error con el saldo nuevo.
   - Enter no registra el pago sin pulsar el botón (en el manual sí lo hacía).
3. Anular pago (S-CAJ-13) y anular cargo manual (S-CAJ-10), como filas inversas, con motivo e `Idempotency-Key`. Los cargos de orden se anulan solo cancelando la orden.
4. Un saldo negativo se muestra como «Crédito a favor», no en rojo de error. En V1 no hay reembolsos.
5. Pestaña Saldos del perfil (S-CAJ-17 / S-PAC-10) y cobro de saldos de visitas completadas (ADR 0004).

**Terminada cuando:**
- dos pulsaciones, o un reintento de red con la misma clave, registran un solo pago;
- dos cajas cobrando a la vez no superan el saldo (prueba de concurrencia);
- una anulación no borra nada y queda auditada con el antes y el después;
- Recepción no puede anular, y un Administrador sin rol clínico tampoco;
- el saldo de una visita completada se cobra desde Saldos;
- E2E `pagos.spec.ts`.

## T-029 — Recibos

**Decisiones (resueltas el 2026-11-01):** P-21 ([ADR 0037](../decisions/0037-recibo-80mm-es-en.md)). Recibo de **rollo de 80 mm** para la impresora de tickets de la clínica: lo arma el servidor y se imprime con el diálogo del navegador, **sin PDF**. En **español o inglés**, a elección al verlo o imprimirlo.

**Objetivo:** Recepción genera el recibo de la visita, lo ve y lo imprime, y cada impresión queda auditada antes de salir.

**Pantallas:** S-CAJ-14, S-CAJ-15, S-CAJ-24.

**ADR:** [0018](../decisions/0018-auditoria.md), [0019](../decisions/0019-operaciones-criticas.md), [0037](../decisions/0037-recibo-80mm-es-en.md).

**Incluye**
1. Tabla `receipts` con código `NOR1-R-2026-000045` por sede y año, **sin huecos** (contador en la misma transacción), y una instantánea inmutable. Los recibos no se anulan.
2. «Generar recibo», con «Vincular al último pago» y una confirmación para no duplicarlo sin querer (en el manual, dos toques creaban dos recibos).
3. Vista del recibo (S-CAJ-15) generada por el servidor, con el selector «Español» / «English».
4. Imprimir y reimprimir: primero la auditoría y después la impresión; si la auditoría falla, no se imprime. Límite de 30 por minuto. Hoja de estilos de impresión para 80 mm.
5. Nada del recibo se guarda en el navegador ni en la caché.

**Terminada cuando:**
- dos recibos seguidos tienen códigos consecutivos, sin huecos aunque falle una transacción (prueba);
- el cambio de año se prueba con reloj fijado el 31 de diciembre a las 11:59 p. m. de la sede;
- sin auditoría no hay impresión;
- reimprimir muestra la instantánea original, en el idioma elegido;
- E2E `recibos.spec.ts`.

## T-030 — Fusionar pacientes (P-16)

**Va en 3B, antes del piloto:** en el piloto habrá duplicados reales, y la fusión tiene que mover visitas, órdenes y saldos, que no existen hasta 3B. La fase 4 es de infraestructura y no conviene mezclarlas.

**Decisiones (resueltas el 2026-11-01):** P-16 ([ADR 0032](../decisions/0032-fusionar-pacientes.md)).
- Fusionan el Propietario o el Administrador **con rol clínico en la sede**.
- **Todo pasa al paciente que se conserva:** citas pasadas y futuras, visitas, órdenes, cargos, pagos, saldos e historia clínica del paciente. Se bloquea si los dos tienen una visita abierta en la misma sede.
- **Irreversible**, con doble confirmación. El duplicado no se borra: queda «Fusionado», con `merged_into`.
- Auditoría `patient.merge` con los ids de ambos, quién, el motivo obligatorio y los conteos de lo movido, sin nombres.

**Objetivo:** unir dos registros del mismo paciente real sin perder historia.

**Pantallas:** S-PAC-13, S-PAC-14; S-PAC-01 y S-PAC-05 («Fusionado» y «Abrir registro principal»).

**ADR:** [0009](../decisions/0009-editar-nacimiento-inactivar.md), [0018](../decisions/0018-auditoria.md), [0027](../decisions/0027-acceso-clinico-propietario-administrador.md), [0030](../decisions/0030-busqueda-pacientes-un-campo.md), [0032](../decisions/0032-fusionar-pacientes.md).

**Incluye**
1. La fusión en una sola transacción, con `version` de los dos pacientes.
2. Búsqueda del otro paciente en un solo campo (ADR 0030), que excluye al paciente abierto y a los fusionados.
3. Tarjetas «Principal (se conserva)» y «Duplicado (se fusiona)», «Invertir dirección», motivo obligatorio, confirmación escribiendo **«FUSIONAR»** (en el manual era «MERGE») y diálogo destructivo.
4. Buscar el código del duplicado lleva al principal.
5. Evento en vivo para quien tenga abierto el perfil del duplicado.

**Terminada cuando:**
- tras fusionar, el perfil del principal muestra las citas, visitas y saldos de los dos;
- el duplicado queda «Fusionado» y su código lleva al principal;
- con dos visitas abiertas en la misma sede, se rechaza;
- la auditoría tiene los conteos y ningún nombre;
- E2E `fusionar.spec.ts`.

## T-031 — Reporte diario de la sede

**Decisiones (resueltas el 2026-11-01):** P-22 ([ADR 0038](../decisions/0038-reporte-diario-antes-piloto.md)). Antes del piloto entra **solo la pestaña «Diario» de la sede**, con impresión auditada. El «Rango», el CSV (P-03), los reportes de la compañía, «Saldo pendiente» y «Bono» siguen en la fase 5.

**Objetivo:** Recepción imprime al final del día lo cobrado por método en su sede, para cuadrar la caja con el efectivo y los comprobantes.

**Pantallas:** S-CAJ-18 (solo la pestaña «Diario»), S-CAJ-19, S-CAJ-21, S-CAJ-24.

**ADR:** [0018](../decisions/0018-auditoria.md), [0038](../decisions/0038-reporte-diario-antes-piloto.md).

**Incluye**
1. Visitas, cobertura, citas, total facturado, total recibido y recibido por método, en el día de la sede, calculados en el servidor.
2. Selector de fecha (S-CAJ-21), con hoy en la zona de la sede por defecto.
3. Impresión con auditoría previa (S-CAJ-24).
4. Lo ven Recepción, y el Propietario y el Administrador con rol clínico en la sede.

**Terminada cuando:**
- las cifras coinciden con los pagos de la semilla en un día fijado;
- un día con cambio de horario no pierde ni repite pagos;
- E2E `reporte-diario.spec.ts`.

## T-032 — Cierre de 3B: semilla, guion y demo

**Decisiones:** ninguna.

**Incluye:**
- semilla con planes de membresía ficticios, órdenes, cargos, pagos, un saldo pendiente y un par de pacientes duplicados en cada clínica;
- guion `docs/DEMO-FASE-3B.md`;
- su E2E (`demo-fase-3b.spec.ts`);
- el cierre de la fase en este archivo, con lo que pasa a la fase 4.

### Demo 3B — qué podrás hacer tú

1. El Proveedor indica a un paciente dos pruebas de laboratorio y una inyección. El sistema dice a qué laboratorio enviar las pruebas (sin mostrarle cuánto cuestan) y el cargo aparece solo en la cuenta del paciente.
2. Como Administrador, compruebas que el laboratorio sugerido es el más barato según los costos que cargaste en la fase 2.
3. Enfermería ejecuta las órdenes desde su cola. Al terminar la última, la visita aparece sola en Caja.
4. Recepción abre la Caja y ve el estado de cuenta:
   - con seguro: cuánto paga el paciente y cuánto queda «A cargo del seguro»;
   - con membresía: el descuento del plan, aplicado solo.
5. Registra un pago parcial y pulsa dos veces seguidas «Registrar pago»: el pago se registra una sola vez.
6. Genera el recibo, lo ve en español y en inglés y lo imprime en formato de ticket. Completa la visita con saldo y lo cobra al día siguiente desde la pestaña Saldos del paciente.
7. Como Administrador con rol clínico, anulas un pago con motivo y ves que nada se borró.
8. Fusionas dos registros del mismo paciente ficticio y ves todo su historial junto.
9. Imprimes el cierre de caja del día de la sede.

---

## Decisiones de la fase 3 (resueltas el 2026-11-01)

| # | Decisión | Resolución | ADR | Tareas |
| --- | --- | --- | --- | --- |
| P-06 | Kiosco: idioma, consentimientos, tabla motivo → ruta y «Vengo por resultados» | Español e inglés; consentimientos en papel en Recepción; sin sugerencias de ruta en V1: decide Recepción | [0031](../decisions/0031-kiosco-idioma-consentimientos-ruta.md) | T-020, T-021 |
| P-16 | Fusionar pacientes duplicados | Propietario o Administrador con rol clínico; todo pasa al principal; bloqueo con dos visitas abiertas en la sede; irreversible; auditado con conteos y sin nombres | [0032](../decisions/0032-fusionar-pacientes.md) | T-030 |
| P-17 | Acciones que el manual reserva al Administrador | Forzar estado, anular y la excepción de «Enviar al proveedor»: Propietario o Administrador con rol clínico en la sede; órdenes, solo el rol Proveedor | [0033](../decisions/0033-acciones-administrativas-flujo-clinico.md) | T-018, T-022, T-025, T-028 |
| P-18 | Membresías | Completas en 3B (T-026b); en 3A, solo «Pago directo» y «Seguro» | [0034](../decisions/0034-membresias-fase-3.md) | T-017, T-026b, T-027 |
| P-19 | Reparto del importe con seguro | «A cargo del seguro» aparte de los descuentos; copago una vez por visita y como máximo el total | [0035](../decisions/0035-reparto-importe-seguro.md) | T-027 |
| P-20 | Valoración: qué es del paciente y qué de la visita | Alergias, antecedentes, cirugías, estilo de vida e historia reproductiva, del paciente; síntomas y notas, de la visita | [0036](../decisions/0036-valoracion-paciente-visita.md) | T-022 |
| P-21 | Formato e idioma del recibo | Rollo de 80 mm desde el navegador, sin PDF; español e inglés | [0037](../decisions/0037-recibo-80mm-es-en.md) | T-029 |
| P-22 | Reporte diario antes del piloto | Solo la pestaña «Diario» de la sede, en 3B | [0038](../decisions/0038-reporte-diario-antes-piloto.md) | T-031 |

**Decisiones pendientes:** ninguna bloquea la fase 3. Siguen abiertas P-03, P-05, P-07, P-08, P-09, P-10, P-12 y P-13, que son de las fases 4 a 6 ([`PENDIENTES.md`](../decisions/PENDIENTES.md)). T-026b abrirá las suyas en su paso 0 (alta de la membresía del paciente).

## Fuera de la fase 3

| Qué | Fase |
| --- | --- |
| Documentos del paciente y de la visita (S-PAC-09, S-PAC-15 a 20, S-CLI-25), consentimientos escaneados | 4 (S3) |
| Cifrado con AWS KMS, sin cambiar el código que usa `FieldCipher` | 4 |
| Reportes por rango, CSV y de la compañía, «Saldo pendiente» (S-CAJ-20, 22 y 23; P-03) | 5 |
| Reglas de bono (S-ADM-23) y la cifra «Bono» de los reportes | 5 |
| PDF del recibo para enviarlo por correo | 5, si se pide |
| Tabla configurable motivo → ruta del kiosco, aprobada por el director médico | Cuando una organización la pida (ADR 0031) |
