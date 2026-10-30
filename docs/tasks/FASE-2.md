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
