# 0014. Kiosco de autorregistro

- **Estado:** Aceptada (revisada 2026-10-24)
- **Fecha:** 2026-10-24

## Contexto

Las clínicas usan un kiosco en el que el paciente se registra al llegar.

## Decisión

Formulario único (`docs/manual/11_kiosco.md`). El token de dispositivo es persistente, guarda solo su hash y tiene el permiso `kiosk.submit`, sin lectura. Los datos del paciente viven solo en memoria: nada en almacenamiento del navegador ni en caché del service worker; `Cache-Control: no-store`. El formulario se limpia al enviar, tras 60 s de inactividad, al ocultar la pestaña y al recargar. Los registros sin confirmar vencen al cierre del día y su contenido se borra a las 24 h. **El motivo no decide nada clínico**: Recepción elige la ruta. La sugerencia motivo → ruta queda desactivada hasta que el director médico la apruebe.

## Cómo quedó implementado (T-020, 2026-11-02)

- **Tablas:** `kiosk_devices` y `kiosk_checkins` (migraciones `0033` y `0034`), con RLS y sin `DELETE` para `clinic_app`. La tableta no tiene organización en su sesión: las funciones `SECURITY DEFINER` `app.kiosk_device_by_token()` y `app.kiosk_pairing_by_code()` la encuentran por el hash y devuelven solo ids.
- **Vincular y revocar:** desde Sedes, con el permiso `kiosks.manage` (Propietario y Administrador). El código de un solo uso dura 10 minutos y solo se guarda su hash; los fallos de vinculación tienen un límite por IP. Revocar exige motivo y corta la tableta en su siguiente petición.
- **Token:** 32 bytes aleatorios en la cookie `clinic_kiosk` (`Path=/api/kiosk`, `HttpOnly`, `SameSite=Strict`, `Secure` en producción), 90 días renovables con el uso. `kiosk.submit` es su único permiso: ningún rol lo tiene. Con el token solo se puede renovar la sesión, que devuelve el código y el nombre de la sede (decisión del 2026-11-02), y enviar registros. Una prueba recorre todas las rutas de la API con el token y comprueba que responden igual que sin sesión.
- **Envío:** `POST /api/kiosk/checkins` con `Idempotency-Key`, el esquema compartido `kioskCheckinSchema`, la fecha de nacimiento comprobada con el día de la sede y un límite de 20 envíos por tableta cada 10 minutos (decisión del 2026-11-02; `KIOSK_SUBMIT_MAX`, `KIOSK_SUBMIT_WINDOW_SECONDS`). El contenido va cifrado con `FieldCipher`. La auditoría usa el actor `kiosk` y no guarda datos del paciente.
- **Vencimiento:** el registro vence a la medianoche siguiente de la sede (calculada en Postgres con su zona horaria, también el día del cambio de horario) y su contenido se vacía a las 24 h. Lo hace el worker cada hora (`KIOSK_MAINTENANCE_CRON`) con la hora de su reloj inyectable.
- **Web:** `/kiosk/<SEDE>`, fuera de la app del personal. Fecha de nacimiento con mes, día y año (decisión del 2026-11-02). El formulario vive en el estado de React, con `autoComplete="off"`, y se limpia al enviar, a los 60 s (aviso a los 50 s), al ocultar la pestaña y al recargar. Tema claro de alto contraste y botones de 64 px.
- **Pruebas:** `packages/db/test/kiosk.test.ts`, `packages/shared/test/kiosk.test.ts`, `apps/api/test/kiosk.test.ts` (reloj fijado: 11:59 p. m. / 12:01 a. m. y día del cambio de horario), `apps/worker/test/worker.test.ts`, `apps/web/src/lib/kiosk.test.ts` y la E2E `apps/web/e2e/kiosco.spec.ts`, que comprueba que tras enviar no queda nada en el almacenamiento del navegador ni respuestas de la API en la caché.
- **Tableta Android:** [`docs/KIOSCO-TABLETA.md`](../KIOSCO-TABLETA.md).

## Cómo quedó implementada la confirmación en Recepción (T-021, 2026-11-02)

- **Bandeja «Llegadas del kiosco» (S-REC-28)** en el Panel de Recepción: los pendientes de la sede que no han vencido, en vivo con el evento `kiosk.checkin` (solo el id) y con aviso sonoro que se puede silenciar.
- **Confirmar** pasa por la llegada de siempre (`POST /api/encounters` con `Idempotency-Key` y `kioskCheckinId`). En la misma transacción: el registro se bloquea y se comprueba que siga pendiente y sin vencer, se abre la visita, el motivo declarado pasa cifrado a la visita y **el contenido del registro se borra**; quedan el paciente, la visita, quién lo confirmó y cuándo. Confirmar dos veces con la misma clave devuelve la misma visita; con otra, 409.
- **Descartar** (un envío de prueba, un duplicado) exige motivo, que queda en la auditoría, y también borra el contenido.
- Pruebas: `apps/api/test/kiosk-arrivals.test.ts` y la E2E `apps/web/e2e/kiosco-recepcion.spec.ts`.
