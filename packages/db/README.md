# @clinic/db

Esquema Drizzle, migraciones, políticas RLS y semilla ficticia. Ver ADR 0002 y `docs/architecture.md` («Multi-tenant y permisos»).

## Roles de base de datos

| Rol | Atributos | Uso |
| --- | --- | --- |
| `clinic_owner` | NOLOGIN | Dueño de los esquemas `app` y `drizzle` y de todas las tablas. Nadie inicia sesión con él. |
| `clinic_migrator` | LOGIN, miembro de `clinic_owner`; NOSUPERUSER, NOBYPASSRLS | Migraciones (hace `SET ROLE clinic_owner`) y la semilla de desarrollo. Nunca lo usan la API ni el worker. |
| `clinic_app` | LOGIN; NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE; no es dueño ni miembro de nada | API y worker. Solo tiene los `GRANT` de `migrations/0001_rls.sql`. |

Los roles los crea `sql/bootstrap.sql`, que ejecuta un **superusuario** una vez por base de datos (`pnpm db:bootstrap`). `clinic_migrator` no puede crear roles, así que esto no va en las migraciones.

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

## Desarrollo local

```sh
cp .env.example .env          # en la raíz del repositorio
docker compose up -d
pnpm db:bootstrap
pnpm db:migrate
pnpm db:seed                  # «Clínica Demo Norte» y «Clínica Demo Sur»
```

## Pruebas

`pnpm test` levanta Postgres 16 con Testcontainers (Docker en ejecución), aplica bootstrap, migraciones y semilla, y ejecuta las pruebas conectando como `clinic_app` mediante `pg.Pool`. Las contraseñas de prueba se generan al azar en cada ejecución.
