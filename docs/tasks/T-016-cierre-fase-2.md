# T-016 — Cierre de la fase 2: semilla, demo y guion

**Tamaño:** 1–2 días · **Depende de:** T-011 a T-015

**Incluye**
1. Semilla completa de la fase 2 en las dos clínicas (catálogo, precios, pacientes y citas), dentro de `pnpm demo:reset`.
2. `docs/DEMO-FASE-2.md`, con el mismo formato que el de la fase 1 («Usuario / Haga / Debe ver»):
   - configurar el catálogo y un cambio de precio;
   - buscar pacientes con y sin tildes;
   - crear un duplicado;
   - editar con conflicto de versión;
   - cambiar la fecha de nacimiento como Administrador;
   - agendar, reprogramar con solapamiento, cancelar y marcar no presentado;
   - ver los cambios y los avisos en vivo en otra ventana;
   - comprobar el aislamiento entre clínicas.
3. Una E2E que recorre ese guion.
4. Cierre de la fase en `docs/tasks/FASE-2.md`: qué quedó hecho, qué pasa a la fase 3 y en qué tarea, y los límites conocidos.

**Terminada cuando:** completas el guion de `DEMO-FASE-2.md` en tu computadora sin ayuda.
