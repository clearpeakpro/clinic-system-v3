# @clinic/worker

Proceso separado de la API (ADR 0020, T-008). Usa solo `clinic_app` y abre `withTenant` en cada trabajo.

## Qué hace

- **Outbox** (ADR 0019):
  - un aviso de `LISTEN/NOTIFY` (`clinic_outbox`) y un barrido cada `OUTBOX_SWEEP_SECONDS` buscan los eventos pendientes;
  - cada uno va a pg-boss (`outbox-deliver`, `singletonKey` = id del evento) y se entrega dentro de `withTenant` (`src/deliver.ts`);
  - reintentos con espera creciente hasta `OUTBOX_MAX_ATTEMPTS`; después, `failed` y `mail.failed` en la auditoría.
- **Cada día** (cron en UTC):
  - verificación de las cadenas de auditoría (`AUDIT_VERIFY_CRON`, por defecto `0 3 * * *`);
  - purga de las claves de idempotencia vencidas (`IDEMPOTENCY_PURGE_CRON`, por defecto `30 3 * * *`).
- **Log técnico:** una línea JSON por evento, solo con ids y contadores (`src/log.ts`).

## Configuración

| Variable | Obligatoria | Uso |
| --- | --- | --- |
| `DATABASE_APP_URL` | Sí | Conexión como `clinic_app`; cualquier otro usuario se rechaza al arrancar |
| `OUTBOX_KEY` | Sí | La misma clave que la API y `org:create` (al menos 32 caracteres) |
| `SMTP_URL`, `MAIL_FROM` | No | En local, Mailpit (`smtp://127.0.0.1:1025`) |
| `OUTBOX_MAX_ATTEMPTS`, `OUTBOX_SWEEP_SECONDS` | No | 8 intentos y 30 s |

## Comandos

- `pnpm dev` (en la raíz) lo arranca junto con la API y la web.
- `pnpm --filter @clinic/worker test`: pruebas con Postgres desechable (Testcontainers):
  - entrega y descarte de duplicados;
  - caída a mitad del trabajo;
  - reintentos;
  - proceso completo con pg-boss;
  - verificación y purga.
