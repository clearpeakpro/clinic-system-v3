# Fase 2 — Pacientes, agenda y catálogo mínimo: desglose en tareas

**Objetivo de la fase:** al terminar, en tu computadora puedes:

- configurar el catálogo de cada clínica (tipos de cita, procedimientos, pruebas de laboratorio y fuentes de referido) con precios por sede;
- buscar, crear y editar pacientes ficticios, con detección de duplicados;
- abrir el perfil de un paciente y agendar, confirmar, reprogramar o cancelar sus citas en la agenda de la sede, viendo los cambios en vivo en otra ventana.

Todo sigue aislado entre las dos clínicas ficticias.

**Orden:** T-011 → T-011b → T-012 → T-013 → T-014 → T-015 → T-016 (demo de cierre). Una tarea por vez, cada una en su rama y con su PR, con commit y push por bloque.

**Reglas para todas las tareas:** las de `CLAUDE.md`, más estas:

- Los datos de pacientes siguen el **ADR 0026**:
  - nombre, apellidos, fecha de nacimiento y teléfono sin cifrado a nivel de aplicación;
  - búsqueda parcial con `pg_trgm` + `unaccent`, siempre por acción explícita (botón o Enter), nunca en vivo;
  - número de miembro del seguro, identificación y notas de cobertura cifrados en la aplicación.
- **Cifrado de campos en local:** se usa una interfaz de cifrado con una clave local de desarrollo. AWS KMS se conecta en la fase 4 sin cambiar el código que la usa.
- **Mínimo necesario:**
  - ni nombres de pacientes ni datos clínicos en eventos en vivo, notificaciones ni logs;
  - las lecturas del perfil y las búsquedas se auditan (el criterio de búsqueda, como hash).
- Cada pantalla se construye con su ficha del manual, su captura de `design/stitch/` y los componentes de `packages/ui`, fiel a Stitch y sin datos ni funciones inventadas.
- Siempre se trabaja con las dos organizaciones ficticias, con pruebas de aislamiento en cada tabla nueva.
- La tarea no está terminada sin `pnpm lint`, `pnpm typecheck`, `pnpm test`, E2E y la CI en verde.

**Decisión P-14 (resuelta, [ADR 0027](../decisions/0027-acceso-clinico-propietario-administrador.md)):** el Propietario y el Administrador **sin rol clínico** no ven Pacientes ni Citas.

- Solo los ven si además tienen un rol de Recepción, Enfermería o Proveedor en esa sede, y asignarse ese rol queda auditado.
- Así se cumple el «mínimo necesario» de HIPAA y es coherente con lo ya decidido.

## Índice

| Tarea | Tamaño | Depende de |
| --- | --- | --- |
| [T-011 — Catálogo mínimo y precios por sede](T-011-catalogo-precios.md) | 3 días | fase 1 |
| [T-011b — Laboratorios y costos por prueba](T-011b-laboratorios-costos.md) | 2–3 días | T-011 |
| [T-012 — Pacientes: modelo, búsqueda y alta](T-012-pacientes-busqueda-alta.md) | 3–4 días | T-011 y P-14 |
| [T-013 — Perfil y edición del paciente](T-013-perfil-paciente.md) | 3 días | T-012 |
| [T-014 — Agenda: vistas e información de la cita](T-014-agenda-vistas.md) | 3 días | T-013 |
| [T-015 — Gestión de citas](T-015-gestion-citas.md) | 4 días | T-014 |
| [T-016 — Cierre de la fase 2: semilla, demo y guion](T-016-cierre-fase-2.md) | 1–2 días | T-011 a T-015 |

## Para la fase 3

- **Órdenes de laboratorio:** la tarea de órdenes de la fase 3 debe usar la función de selección de laboratorio de T-011b, `suggestLabs()` de `packages/shared/src/labs.ts` ([ADR 0028](../decisions/0028-laboratorios-costos.md)):
  - recibe las pruebas, los laboratorios, el historial de costos, el día de la orden en la sede y la cobertura (`self_pay`, `membership` o `insurance`);
  - la API de órdenes lee los costos en el servidor y solo devuelve al personal el **nombre** del laboratorio sugerido;
  - una sola orden y una sola muestra cuando un laboratorio hace todas las pruebas;
  - sin sugerencia por costo con seguro;
  - cambio del laboratorio sugerido con motivo obligatorio y auditado;
  - los costos, nunca visibles para Enfermería ni Proveedor.

## Cierre de la fase 2 (T-016, 2026-11-01)

**Guion:** [`docs/DEMO-FASE-2.md`](../DEMO-FASE-2.md). Lo recorre `apps/web/e2e/demo-fase-2.spec.ts`, con su propia base preparada con `pnpm demo:reset` (`playwright.demo2.config.ts`).

**Qué quedó hecho:**

| Objetivo de la fase | Tareas | E2E |
| --- | --- | --- |
| Catálogo de cada clínica con precio general y precio propio por sede, con vigencia e historial | [T-011](T-011-catalogo-precios.md) ([ADR 0029](../decisions/0029-precio-general-excepcion-sede.md)) | `catalog.spec.ts` |
| Laboratorios, costos por prueba y la función `suggestLabs()` | [T-011b](T-011b-laboratorios-costos.md) ([ADR 0028](../decisions/0028-laboratorios-costos.md)) | `catalog.spec.ts` |
| Búsqueda de pacientes en un campo (también en la cabecera, por fecha MMDDAAAA, teléfono y código), alta con duplicados y teléfono compartido, y la excepción del Propietario | [T-012](T-012-pacientes-busqueda-alta.md) ([ADR 0027](../decisions/0027-acceso-clinico-propietario-administrador.md), [ADR 0030](../decisions/0030-busqueda-pacientes-un-campo.md)) | `patients.spec.ts`, `users.spec.ts` |
| Perfil y edición del paciente, con conflicto de versión, fecha de nacimiento con motivo, inactivar y reactivar | [T-013](T-013-perfil-paciente.md) ([ADR 0009](../decisions/0009-editar-nacimiento-inactivar.md)) | `patient-profile.spec.ts` |
| Agenda Día y Lista y detalle de la cita, en la hora de la sede | [T-014](T-014-agenda-vistas.md) | `appointments.spec.ts` |
| Crear, editar, confirmar, reprogramar (con aviso de solapamiento), cancelar y marcar no presentado, en vivo y con avisos en la campana | [T-015](T-015-gestion-citas.md) | `citas-gestion.spec.ts` |
| Semilla completa en `pnpm demo:reset`, guion y su E2E | T-016 | `demo-fase-2.spec.ts` |

Todo sigue aislado entre «Clínica Demo Norte» y «Clínica Demo Sur», con pruebas de aislamiento con el rol real en cada tabla nueva.

**Ajustes de T-016:**
- La semilla añade una cita de ayer a las 4:00 p. m., **Programada** y sin marcar, en cada sede (21 por sede). Así el guion puede marcar «No se presentó» a cualquier hora.
- El guion corrige la fecha de nacimiento con la **Propietaria** después de asignarse Recepción, no con el Administrador: desde T-013 hace falta un rol clínico en la sede, y el Administrador no puede asignárselo él mismo (ADR 0009 revisado y ADR 0027).

**Lo que pasa a fases siguientes.** Todavía no existe `FASE-3.md`: la tarea se nombra por su flujo, y se le pondrá número al desglosar la fase 3.

| Qué | Origen | Fase y tarea |
| --- | --- | --- |
| Usar `suggestLabs()` en la orden, cambiar el laboratorio sugerido con motivo y la cobertura de la visita (detalle en «Para la fase 3», arriba) | T-011b, [ADR 0028](../decisions/0028-laboratorios-costos.md) | 3 · Órdenes |
| Tomar el precio vigente de la sede, calculado en el servidor, en la orden y en la Caja | T-011, [ADR 0029](../decisions/0029-precio-general-excepcion-sede.md) | 3 · Órdenes y Caja |
| «Registrar llegada» (hoy deshabilitado, con «Llega en la fase 3»), «Sin cita», las pestañas Visitas y Saldos y la «Última visita» del perfil | T-013, T-014, T-015 | 3 · Llegada y visita |
| Avisos «Paciente asignado a usted» y «Orden asignada…» | T-009 | 3 · Llegada y Órdenes |
| `Idempotency-Key` en llegada, kiosco, pagos y anulaciones (ya existe `IdempotencyService`) | T-008, [ADR 0019](../decisions/0019-operaciones-criticas.md) | 3 · Llegada, Kiosco y Caja |
| Kiosco: idioma, consentimientos y tabla motivo → ruta (P-06, pendiente de decisión) | [ADR 0014](../decisions/0014-kiosco.md) | 3 · Kiosco |
| Planes de membresía y reglas de bono | T-011 | 3 o 5 |
| Pestaña Documentos del perfil (necesita S3) | T-013 | 4 |
| Cifrado de campos con AWS KMS, sin cambiar el código que usa `FieldCipher` | [ADR 0026](../decisions/0026-cifrado-campos-busqueda.md) | 4 |
| Fusionar pacientes duplicados (S-PAC-13; `merged_into` ya existe): pendiente nuevo **P-16** | T-012, T-013 | Antes del piloto |

**Decisiones pendientes:** ninguna era de la fase 2. Se añade P-16 (fusionar pacientes) a [`PENDIENTES.md`](../decisions/PENDIENTES.md). P-06 (kiosco) es la única que bloquea una parte de la fase 3.

**Límites conocidos:**
- La búsqueda de pacientes solo se hace al pulsar Enter o «Buscar», nunca mientras se escribe ([ADR 0030](../decisions/0030-busqueda-pacientes-un-campo.md)).
- En local, el cifrado de campos usa una clave de desarrollo (`FIELD_ENCRYPTION_KEY`); KMS llega en la fase 4.
- Los avisos y los eventos en vivo no llevan nombres de pacientes: solo el código de la cita, la fecha y la hora.
- Un aviso sin leer de la misma cita y del mismo tipo se reemplaza por el nuevo (S-GEN-15): el número de la campana no sube con cada cambio.
- La web agrupa los cambios en vivo cada 500 ms; sin conexión, se actualiza sola cada 30 segundos.
- Las citas solo se crean o reprograman para hoy o días futuros en la sede, y «No se presentó» solo después de la hora de la cita.
- El Propietario y el Administrador sin rol clínico no ven Pacientes ni Citas. Solo el Propietario puede asignarse un rol clínico (con motivo, auditado y con aviso a los Administradores).
