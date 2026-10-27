# 0007. Búsqueda parcial y sin tildes

- **Estado:** Aceptada
- **Fecha:** 2026-10-22

## Contexto

La búsqueda del prototipo era exacta y sensible a tildes.

## Decisión

Búsqueda parcial con `pg_trgm` + `unaccent`, siempre por acción explícita (botón o Enter), nunca en vivo por tecla.
