# Pruebas E2E (Playwright)

`pnpm test:e2e` compila la web y ejecuta dos configuraciones:

- `playwright.config.ts`: los flujos de cada rol (todas las `*.spec.ts` salvo `demo.spec.ts`);
- `playwright.demo.config.ts`: el guion de la demo (`demo.spec.ts`, ver `docs/DEMO-FASE-1.md`).

## Base de datos desechable

Cada configuración levanta su propio Postgres 16 con Testcontainers (`global-setup.ts` y `global-setup-demo.ts`):

- lo prepara con bootstrap, migraciones y la semilla ficticia; la demo lo prepara con el mismo `demo:reset` que usa la persona;
- arranca la API (y el worker) contra él;
- lo destruye al terminar.

Las pruebas nunca usan la base local de `pnpm dev`, ni la de `.env`. Las que llaman a `pnpm org:create` le pasan la URL del operador de ese contenedor (`E2E_OPERATOR_URL`, que fija `global-setup.ts`).

## Organizaciones

La semilla (`pnpm db:seed`) y `pnpm demo:reset` crean solo las dos organizaciones ficticias:

- «Clínica Demo Norte»;
- «Clínica Demo Sur».

La demo sigue empezando con esas dos. Algunas pruebas crean además una organización ficticia **solo en la base desechable**, con `org:create`, y desaparece con el contenedor:

| Prueba | Organización y sede | Por qué |
| --- | --- | --- |
| `patient-profile.spec.ts` (T-013) | «Clínica Demo Este (ficticia)», EST1, `propietario.este@example.test` | Prueba al Propietario con Recepción asignada (ADR 0009 y 0027). Necesita un Propietario que ninguna otra prueba use, porque esta le activa el MFA y se asigna un rol. El de Norte ya lo usa `users.spec.ts`, y `profile.spec.ts` necesita al de Sur sin MFA. |
| `locations.spec.ts` (T-007) | «Clínica Demo Oeste (ficticia)», OES1, `propietaria.oeste@example.test` | Prueba el alta de una clínica con `org:create` y la administración de sus sedes, sin tocar los usuarios de las demás pruebas. |
| `demo.spec.ts` (T-010) | «Clínica Demo Este», EST1, `propietaria.este@example.test` | Sigue el paso opcional del guion de la demo, «Dar de alta una clínica nueva». Corre con su propia base desechable, así que no choca con la de `patient-profile.spec.ts`. |

Si una prueba nueva necesita un Propietario o un Administrador cuyo estado vaya a cambiar (MFA, roles, sedes), cree su organización igual: en la base desechable y con un código de sede propio. No toque los usuarios de Norte y Sur que usan las demás pruebas.
