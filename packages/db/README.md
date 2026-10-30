# @clinic/db

Esquema Drizzle, migraciones, políticas RLS y semilla ficticia. Ver ADR 0002 y `docs/architecture.md` («Multi-tenant y permisos»).

## Roles de base de datos

| Rol | Atributos | Uso |
| --- | --- | --- |
| `clinic_owner` | NOLOGIN | Dueño de los esquemas `app` y `drizzle` y de todas las tablas. Nadie inicia sesión con él. |
| `clinic_migrator` | LOGIN, miembro de `clinic_owner`; NOSUPERUSER, NOBYPASSRLS | Migraciones (hace `SET ROLE clinic_owner`) y la semilla de desarrollo. Nunca lo usan la API ni el worker. |
| `clinic_app` | LOGIN; NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE; no es dueño ni miembro de nada | API y worker. Solo tiene los `GRANT` de `migrations/0001_rls.sql`. |
| `clinic_operator` | LOGIN; NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE; no es dueño ni miembro de nada | Operador de la plataforma (ADR 0024): `pnpm org:create` y `pnpm audit:platform`. Sus permisos están en `migrations/0012_platform_operator.sql`. Sin acceso a pacientes. Contraseña: `CLINIC_OPERATOR_PASSWORD` (opcional en desarrollo). |

Los roles los crea `sql/bootstrap.sql`, que ejecuta un **superusuario** (`pnpm db:bootstrap`; es idempotente y `pnpm dev` lo ejecuta en cada arranque). `clinic_migrator` no puede crear roles, así que esto no va en las migraciones.

## RLS

Cada tabla del esquema `app` tiene `ENABLE` + `FORCE ROW LEVEL SECURITY` y una política `tenant_isolation` con `USING` y `WITH CHECK`:

```sql
organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid
```

Se usa `NULLIF` porque, después de que una sesión fijó `app.org_id` en una transacción, el valor vuelve a `''` (no a NULL). Sin `NULLIF`, `''::uuid` lanzaría un error en una conexión reutilizada del pool, en vez de devolver cero filas.

Las comprobaciones de claves foráneas **no pasan por RLS**. Por eso las referencias entre tablas son compuestas: `(organization_id, x_id) → (organization_id, id)`.

### Al añadir una tabla

1. `organization_id`, `UNIQUE (organization_id, id)` y claves foráneas compuestas en `src/schema.ts`.
2. `pnpm --filter @clinic/db db:generate` y una migración a mano (`drizzle-kit generate --custom`) con `ENABLE`/`FORCE`, la política y los `GRANT` mínimos.
3. Su prueba de aislamiento. La prueba de configuración de `test/roles.test.ts` falla si una tabla del esquema `app` no tiene RLS forzada o política.

## `withTenant`

```ts
import pg from 'pg';
import { createTenantDb, patients } from '@clinic/db';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_APP_URL }); // clinic_app
const { withTenant } = createTenantDb(pool);

// orgId sale de la sesión validada, nunca de un encabezado del cliente.
const rows = await withTenant(orgId, (tx) => tx.select().from(patients));
```

Abre una transacción, ejecuta `set_config('app.org_id', orgId, true)` (local a la transacción) y luego `fn(tx)`. Fuera de `withTenant`, `clinic_app` no ve ninguna fila.

## `withUser` (ADR 0023)

`withUser(userId, fn)` fija solo `app.user_id`, siempre a partir de la sesión validada. Con las políticas `own_memberships_read` y `own_membership_roles_read`, que son **solo `FOR SELECT`**, la persona lee sus membresías y roles en todas sus organizaciones y nada más. Escribir sigue exigiendo `withTenant`. Pruebas: `test/memberships.test.ts`.

**Condición 2 del ADR 0023:** `scripts/check-rls-context.ts` (`pnpm check:rls-context`, también dentro de `pnpm lint` y en la CI) falla si `app.org_id` o `app.user_id` se fijan fuera de `withTenant` / `withUser` o sin `true` como tercer argumento.

## Identidad (T-003)

- **Esquema `auth`:** las tablas de Better Auth (`user`, `session`, `account`, `verification`, `two_factor`). Son globales y no tienen RLS de organización. `clinic_app` solo tiene los GRANT medidos en T-002 (ver `migrations/0003_identity_rls.sql`).
- **Esquema `app`:** `memberships`, `membership_roles`, `invitations` y `audit_log`, con RLS + `FORCE`.
  - `audit_log` es append-only: `clinic_app` solo puede insertar.
  - Los eventos sin organización solo los lee el operador de la plataforma (T-007).

## Desarrollo local

```sh
cp .env.example .env          # en la raíz del repositorio
docker compose up -d
pnpm db:bootstrap
pnpm db:migrate
pnpm db:seed                  # «Clínica Demo Norte» y «Clínica Demo Sur» (sedes en hora Central, America/Chicago, con direcciones ficticias)
```

## Worker: pg-boss, outbox e idempotencia (T-008)

- **pg-boss** (`src/jobs.ts`): `migrate()` instala el esquema `pgboss` y sus colas como `clinic_owner`, y da a `clinic_app` solo permisos de lectura y escritura.
- **Outbox** (`src/outbox.ts`): `enqueueMail(tx, OUTBOX_KEY, …)` escribe el evento cifrado en la transacción del cambio y avisa con `pg_notify('clinic_outbox')`.
- **Cadena de auditoría** (migración 0014):
  - el trigger `audit_log_chain`;
  - `verify_audit_chain` y `audit_chains`;
  - `outbox_due` y `purge_idempotency_keys`.

  Todas son `SECURITY DEFINER` de `clinic_owner` y no devuelven datos de las filas.

## Notificaciones y tiempo real (T-009)

- **Tabla `notifications`** (`src/notifications-schema.ts`, migraciones 0015 y 0016), con RLS forzado. `clinic_app` tiene `SELECT`, `INSERT` y `UPDATE`; borra solo `purge_notifications()` (30 días).
- **`enqueueNotification(tx, OUTBOX_KEY, …)`** (`src/outbox.ts`) escribe el aviso en el outbox, en la transacción del cambio.
- **Canal `clinic_realtime`** (`src/realtime.ts`):
  - `notifyRealtime(tx, mensaje)` publica al confirmarse la transacción;
  - `parseRealtimeMessage` valida lo recibido;
  - el trigger `session_revoked_notify` de `auth.session` avisa de cada sesión borrada.

## Catálogo y precios por sede (T-011)

- **Tablas** (`src/catalog-schema.ts`, migraciones 0017 y 0018): `appointment_types`, `procedures`, `lab_tests`, `referral_sources` y `prices`, con RLS forzado y claves compuestas.
- **Reglas en la base de datos:** código único por organización (`^[A-Z][A-Z0-9_-]{1,40}$`), duración de 5 a 480 min, ruta, color de agenda y tipo con CHECK, y un solo ítem por precio.
- **Precios** ([ADR 0029](../../docs/decisions/0029-precio-general-excepcion-sede.md)): `location_id` nulo es el precio general de la organización; con sede, una excepción que lo reemplaza solo en ella. Una fila de sede sin importe es «Usa el precio general desde» (el general siempre tiene importe).
- **Permisos de `clinic_app`:** sin `DELETE` en ninguna; en `prices`, solo `SELECT` e `INSERT`: un cambio de precio es una fila nueva.
- **Semilla:** un catálogo básico ficticio en las dos organizaciones, con precio general y, en Norte, excepciones en NOR2 (`DEMO_CATALOG`).

## Laboratorios y costos por prueba (T-011b)

- **Tablas** (`src/catalog-schema.ts`, migraciones 0020 y 0021): `lab_providers` y `lab_test_costs`, con RLS forzado y claves compuestas hacia `lab_tests` y `lab_providers` ([ADR 0028](../../docs/decisions/0028-laboratorios-costos.md)).
- **Reglas en la base de datos:** nombre del laboratorio único por organización sin distinguir mayúsculas (índice sobre `lower(name)`), preferencia de 1 a 1000 y costo no negativo.
- **Costos:** una fila sin importe es «No la realiza desde» (desmarcar el laboratorio en la prueba conserva su historial). Un laboratorio hace una prueba un día si su última fila vigente ese día tiene importe.
- **Permisos de `clinic_app`:** sin `DELETE`; en `lab_test_costs`, solo `SELECT` e `INSERT`.
- **Semilla** (`DEMO_LABS`, también en `pnpm demo:reset`): LabCorp, Quest Diagnostics y CPL en cada clínica, con costos ficticios distintos en las pruebas A1c, TSH y PSA (Quest no hace PSA). La de estreptococo queda sin laboratorio.

## Pruebas

`pnpm test` levanta Postgres 16 con Testcontainers (Docker en ejecución), aplica bootstrap, migraciones y semilla, y ejecuta las pruebas conectando como `clinic_app` mediante `pg.Pool`. Las contraseñas de prueba se generan al azar en cada ejecución.
