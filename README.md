# Clinic System v3

Plataforma SaaS de flujo de pacientes para clínicas: kiosco de autorregistro, recepción y citas, enfermería, proveedor, órdenes, caja y recibos, reportes y administración multi-sede. Una sola instalación en AWS, con los datos de cada organización aislados.

> Estado: **fase 1 en curso.** Hecho: aislamiento multi-tenant (T-001), identidad (T-003) y acceso y marco (T-004).

## Probarlo en su computadora

Requisitos: Node 24, pnpm 12 y Docker.

```sh
cp .env.example .env     # solo la primera vez; cambie los secretos
pnpm install
docker compose up -d     # Postgres y Mailpit
pnpm db:bootstrap        # roles de base de datos (una vez)
pnpm db:migrate
pnpm db:seed             # clínicas y usuarios ficticios
pnpm dev                 # API + web (y vuelve a asegurar docker compose)
```

Abra **http://localhost:5173**. Los correos simulados se ven en http://localhost:8025 (Mailpit).

### Usuarios de prueba (ficticios)

Todos usan la contraseña `DEV_SEED_PASSWORD` de `.env`.

| Correo | Rol | Sede |
| --- | --- | --- |
| `recepcion.norte@example.test` | Recepción | NOR1 |
| `proveedor.norte@example.test` | Proveedor | NOR2 |
| `enfermeria.sur@example.test` | Enfermería | SUR2 |
| `multi@example.test` | Recepción en Norte y Enfermería en Sur | NOR1 y SUR1 |
| `admin.norte@example.test` | Administrador, **sin MFA**: al entrar debe inscribirse | toda Clínica Demo Norte |
| `propietario.norte@example.test` | Propietario (debe inscribir MFA) | toda Clínica Demo Norte |
| `propietario.sur@example.test` | Propietario (debe inscribir MFA) | toda Clínica Demo Sur |

Para el MFA, use cualquier aplicación de autenticación (Google Authenticator, Microsoft Authenticator…) con el código QR o la clave que muestra la pantalla.

### Pruebas

`pnpm lint`, `pnpm typecheck`, `pnpm test` (Testcontainers, requiere Docker) y `pnpm test:e2e` (Playwright; la primera vez, `pnpm --filter @clinic/web exec playwright install chromium`).

## Documentación

| Documento | Contenido |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Stack, arquitectura, modelo de datos, seguridad/HIPAA, infraestructura y fases |
| [docs/manual/](docs/manual/README.md) | Manual funcional: 4 roles, 168 pantallas del prototipo + kiosco |
| [docs/decisions/](docs/decisions/README.md) | Decisiones de producto y técnicas (ADR) |
| [design/stitch/](design/stitch/README.md) | Pantallas de Google Stitch (referencia visual) y cómo se sacan los tokens |
| [docs/tasks/FASE-1.md](docs/tasks/FASE-1.md) | Tareas de la fase 1 |
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
