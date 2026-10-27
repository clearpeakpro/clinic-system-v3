# 0020. El worker es un proceso separado

- **Estado:** Aceptada
- **Fecha:** 2026-10-24

## Contexto

Había que definir dónde vive el worker.

## Decisión

`apps/worker` es un proceso aparte que comparte `packages/*`. En local corre en docker compose; en B, en un contenedor del mismo EC2 con límite de memoria; en C, en un servicio de Fargate. Usa `clinic_app` y `withTenant` por trabajo. Nunca corre dentro de la API.
