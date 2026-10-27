# 0017. Entornos A/B/C y presupuesto de US$25

- **Estado:** Aceptada
- **Fecha:** 2026-10-24

## Contexto

El límite actual es de US$25 al mes en AWS; la propuesta anterior era de US$250–350.

## Decisión

A: desarrollo local, sin costo en AWS. B: un EC2 t4g.small con Caddy, API, worker y Postgres en contenedores; EBS cifrado con KMS; WAL a S3 (PITR) y snapshots; Session Manager. Unos US$22.83/mes sin franja gratuita (tabla y fuentes en `docs/architecture.md`). C: Fargate + RDS Multi-AZ + ALB/WAF, a recalcular.

## Consecuencias

B no tiene alta disponibilidad, WAF, subredes privadas ni staging en la nube; queda documentado. Alcance viable: demos y un piloto con una sola organización tras la puerta de la fase 4.
