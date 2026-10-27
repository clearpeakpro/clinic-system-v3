# Clinic System v3

Plataforma SaaS de flujo de pacientes para clínicas: kiosco de autorregistro, recepción y citas, enfermería, proveedor, órdenes, caja y recibos, reportes y administración multi-sede. Una sola instalación en AWS, con los datos de cada organización aislados.

> Estado: **especificación lista, código por empezar (fase 1).**

## Documentación

| Documento | Contenido |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Stack, arquitectura, modelo de datos, seguridad/HIPAA, infraestructura y fases |
| [docs/manual/](docs/manual/README.md) | Manual funcional: 4 roles, 168 pantallas del prototipo + kiosco |
| [docs/decisions/](docs/decisions/README.md) | Decisiones de producto y técnicas (ADR) |
| [design/stitch/](design/stitch/README.md) | Pantallas de Google Stitch (referencia visual) |
| [CLAUDE.md](CLAUDE.md) | Reglas para desarrollar con Claude Code |

## Stack

TypeScript · React 19 + Vite + Tailwind + shadcn/ui (PWA) · NestJS · PostgreSQL 16 con Row-Level Security · Drizzle · Better Auth · AWS (ECS Fargate, RDS, S3, CloudFront, SES) con CDK.

## Fases

0. Pruebas técnicas: [T-001 aislamiento multi-tenant](docs/tasks/T-001-aislamiento-multitenant.md), Better Auth, evaluación de riesgos
1. Cimientos (dos organizaciones ficticias desde el inicio)
2. Pacientes, agenda y catálogo mínimo con precios
3. Flujo de la visita + kiosco — **MVP**
4. Entorno B (unos US$23/mes) y puerta del piloto: BAA, evaluación de riesgos, restauración probada
5. Administración y reportes
6. Comercial (C)

Decisiones abiertas: [docs/decisions/PENDIENTES.md](docs/decisions/PENDIENTES.md)
