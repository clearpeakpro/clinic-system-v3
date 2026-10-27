# T-007 — Organizaciones, sedes y operador de la plataforma

**Tamaño:** 2–3 días · **Depende de:** T-006 y P-11 · **Pantallas:** S-ADM-10, 11, 12

## Incluye

- Sedes: lista, crear y editar (código único por organización, nombre, zona horaria con selector, dirección). Se desactivan, nunca se borran.
- Rol de base de datos del operador de la plataforma (condición 5 del ADR 0023 y P-11), según lo que se decida. Debe ser distinto de `clinic_app` y de `clinic_migrator`, sus lecturas se auditan y es el único que lee los eventos de auditoría sin organización.
- Script de línea de comandos (`pnpm org:create`), que usa el operador, para dar de alta una organización nueva con su Propietario por invitación. En V1 no tiene pantalla.
- Pruebas: una sede de A no es visible desde B; el código de sede repetido se rechaza dentro de la misma organización y se permite en otra; `clinic_app` no puede leer los eventos sin organización.
