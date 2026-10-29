# 0020. El worker es un proceso separado

- **Estado:** Aceptada
- **Fecha:** 2026-10-24

## Contexto

Había que definir dónde vive el worker.

## Decisión

`apps/worker` es un proceso aparte que comparte `packages/*`. En local corre en docker compose; en B, en un contenedor del mismo EC2 con límite de memoria; en C, en un servicio de Fargate. Usa `clinic_app` y `withTenant` por trabajo. Nunca corre dentro de la API.

## Desarrollo local (T-008, 2026-10-29)

En desarrollo, el worker arranca con `pnpm dev` (`tsx watch`), igual que la API, que tampoco está en docker compose. Su contenedor llegará con la infraestructura del entorno B.

pg-boss guarda sus tablas en el esquema `pgboss`. Lo instala `pnpm db:migrate` como `clinic_owner`, con sus colas fijas, y `clinic_app` solo recibe permisos de lectura y escritura: el worker nunca crea esquemas, tablas ni índices. Versión fijada: `pg-boss@12.38.0`.
