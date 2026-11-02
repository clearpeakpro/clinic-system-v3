# 0040. Alergias: «Sin alergias conocidas» como estado explícito

- **Estado:** Aceptada
- **Fecha:** 2026-11-01
- **Decide:** el dueño del producto, al planificar T-022.
- **Precisa:** [ADR 0006](0006-alergias-por-paciente.md) (alergias a nivel del paciente) y [ADR 0036](0036-valoracion-paciente-visita.md) (qué es del paciente y qué de la visita).
- **Implementación:** [T-022](../tasks/FASE-3.md#t-022--enfermería).

## Contexto

En el manual, «Alergias» es un texto libre. Un texto vacío no distingue dos situaciones clínicamente distintas: que el paciente no tenga alergias conocidas o que nadie haya preguntado todavía. El diseño de Stitch proponía un atajo «Sin alergias conocidas (NKDA)».

## Decisión

- La sección Alergias de la historia del paciente tiene un **estado explícito** con tres valores:
  - **registradas:** hay texto con las alergias;
  - **«Sin alergias conocidas»:** se marcó expresamente, sin texto;
  - **«Alergias no registradas»:** no hay texto ni se marcó (el estado de partida).
- El **encabezado de la visita** muestra los tres casos de forma distinta, con icono, texto y color:
  - alergias registradas, con su lista;
  - «Sin alergias conocidas»;
  - «Alergias no registradas».
- Recepción no ve el aviso (decisión B de T-022): es un dato clínico.
- Los demás extras de Stitch (atajos de alergias concretas, teclado numérico, barra del IMC…) quedan fuera.

## Consecuencias

- **Base de datos:** `patient_histories.allergy_status` (`not_recorded`, `none_known`, `recorded`) con la restricción «`recorded` ⇔ hay texto». Cada cambio de estado es una versión nueva de la historia (ADR 0036).
- **Regla única:** `allergyStatusOf()` en `packages/shared/src/nursing.ts`: con texto, «registradas»; sin texto y con «Sin alergias conocidas» marcado, ese estado; si no, «no registradas». La API vuelve a aplicarla al guardar.
- **Auditoría:** el cambio de estado se registra como el campo `allergyStatus`, sin valores (ADR 0018).

## Cómo quedó implementada (T-022, 2026-11-01)

- **API:** `PUT /api/encounters/:id/assessment` recibe `allergyStatus` junto a los apartados cambiados; `GET /api/encounters/:id` devuelve `allergies: { status, text }` solo a quien tiene `nursing.view` (nulo para Recepción).
- **Web:**
  - en «Valoración», casilla «Sin alergias conocidas» en el apartado Alergias; al marcarla se vacía y bloquea el texto, y al escribir una alergia se desmarca;
  - `AllergyBanner` (`apps/web/src/components/nursing/allergy-banner.tsx`): rojo con escudo de alerta y la lista; verde con escudo de verificación «Sin alergias conocidas»; ámbar con escudo de interrogación «Alergias no registradas».
- **Pruebas:** restricción de la base (`packages/db/test/nursing.test.ts`), regla compartida (`packages/shared/test/nursing.test.ts`), API (`apps/api/test/nursing.test.ts`: los tres estados y su paso a la visita siguiente) y E2E (`apps/web/e2e/enfermeria.spec.ts`).
