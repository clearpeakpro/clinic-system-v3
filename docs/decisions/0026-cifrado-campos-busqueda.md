# 0026. Cifrado de campos frente a búsqueda de pacientes

- **Estado:** Aceptada
- **Fecha:** 2026-10-29
- **Resuelve:** P-01 y el punto pendiente del [ADR 0019](0019-operaciones-criticas.md) (cifrado de campos).
- **Relacionada:** [ADR 0007](0007-busqueda-pacientes.md) (búsqueda parcial y sin tildes).

## Contexto

La búsqueda de pacientes es parcial y sin tildes ([ADR 0007](0007-busqueda-pacientes.md)). Un campo cifrado en la aplicación no se puede buscar así. Había que decidir qué campos se cifran antes del esquema de pacientes de la fase 2.

## Decisión

- **Sin cifrado en la aplicación:** nombre, apellidos, fecha de nacimiento y teléfono.
  - Se buscan con `pg_trgm` + `unaccent`, en búsqueda parcial y sin tildes.
  - La búsqueda se lanza siempre por acción explícita (botón o Enter), nunca en vivo por tecla.
  - Quedan protegidos por el cifrado del disco y de los respaldos con KMS, y por RLS.
- **Cifrados en la aplicación con KMS:** número de miembro del seguro, identificación y notas de cobertura.
- **Índice HMAC** sobre alguno de esos campos **solo si hace falta coincidencia exacta**, y con su propia clave.

## Consecuencias

- **El esquema de pacientes de la fase 2** sigue esta división. Los campos cifrados no se pueden ordenar, filtrar ni buscar parcialmente.
- **Buscar por número de miembro o identificación** exige un índice HMAC y coincidencia exacta. Se añade solo cuando una pantalla lo necesite.
- **El cifrado con KMS en la aplicación** necesita la clave del cliente en AWS (entorno B, fase 4). En local y en las pruebas se usa una clave de desarrollo con la misma interfaz.
- **Los campos sin cifrar** siguen siendo PHI: nunca en logs, errores, analítica, fixtures ni almacenamiento del navegador (CLAUDE.md).
