# 0014. Kiosco de autorregistro

- **Estado:** Aceptada (revisada 2026-10-24)
- **Fecha:** 2026-10-24

## Contexto

Las clínicas usan un kiosco en el que el paciente se registra al llegar.

## Decisión

Formulario único (`docs/manual/11_kiosco.md`). El token de dispositivo es persistente, guarda solo su hash y tiene el permiso `kiosk.submit`, sin lectura. Los datos del paciente viven solo en memoria: nada en almacenamiento del navegador ni en caché del service worker; `Cache-Control: no-store`. El formulario se limpia al enviar, tras 60 s de inactividad, al ocultar la pestaña y al recargar. Los registros sin confirmar vencen al cierre del día y su contenido se borra a las 24 h. **El motivo no decide nada clínico**: Recepción elige la ruta. La sugerencia motivo → ruta queda desactivada hasta que el director médico la apruebe.
