# T-012 — Pacientes: modelo, búsqueda y alta

**Tamaño:** 3–4 días · **Depende de:** T-011 y P-14 · **Pantallas:** S-PAC-01, 02, 03, 04 · **ADR:** 0026, 0019, 0007, 0027

**Incluye**
1. Tabla `patients`, con RLS y claves compuestas:
   - código humano `P-000123` por organización, generado con `code_counters`;
   - nombre, apellidos, fecha de nacimiento, teléfono, fuente de referido y detalles del referido;
   - estado (activo o inactivo), `merged_into` (preparado, sin pantalla todavía) y `version`.
   - Los detalles del referido van cifrados en la aplicación, porque son texto libre.
2. Interfaz de cifrado de campos (`packages/shared` o `packages/db`): una implementación local para desarrollo y pruebas, preparada para KMS. Los campos cifrados nunca aparecen en logs ni en la auditoría.
3. Búsqueda (S-PAC-01):
   - por nombre, apellidos, fecha de nacimiento, teléfono o código, incluido un código escaneado;
   - parcial y sin distinguir tildes ni mayúsculas, con `pg_trgm` + `unaccent` («maria lop» encuentra a «María López García»);
   - por botón o Enter, nunca en vivo, con un máximo de resultados por página;
   - cada búsqueda se audita con el criterio guardado como hash.
4. Alta (S-PAC-02) con detección de duplicados (S-PAC-03): antes de crear, se buscan coincidencias por nombre parecido + fecha de nacimiento, o por teléfono, y se muestra «Posible paciente existente» con «Abrir existente» y «Crear de todos modos». Esa elección se audita.
5. «¿Descartar cambios sin guardar?» (S-PAC-04), con el componente de T-005.
6. **«Buscar pacientes» en la cabecera** (pendiente desde T-004): abre la búsqueda de S-PAC-01. Solo lo ve quien tiene permiso.
7. Semilla: unos 20 pacientes ficticios por clínica, con nombres hispanos variados, tildes, homónimos y algún par de posibles duplicados para la demo.
8. **El Propietario se asigna roles clínicos** (excepción del ADR 0027):
   - el Propietario puede asignarse y quitarse a sí mismo solo Recepción, Enfermería/MA o Proveedor, en sedes activas de su organización, con motivo obligatorio;
   - nunca puede asignarse Administrador ni Propietario;
   - la regla «nadie cambia sus propios roles» sigue igual en todos los demás casos;
   - cada cambio queda auditado y genera un aviso para los Administradores de esa organización, por el outbox.
   - Pruebas:
     - el Propietario se asigna Recepción en NOR1 y ya ve Pacientes;
     - no puede asignarse Administrador;
     - un Administrador no puede usar esta excepción.

**Terminada cuando:**
- buscar «maria», «MARÍA» o «Lopez» encuentra a «María López»;
- crear un duplicado muestra el aviso;
- los detalles del referido no aparecen en claro en la base de datos;
- un paciente de Norte no aparece nunca en una búsqueda desde Sur, y una prueba lo comprueba con el rol real.
