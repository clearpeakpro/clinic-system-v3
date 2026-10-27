# 11 — Kiosco de autorregistro (S-KIO) — nuevo en v3

No existe en el manual de Lancaster; se especifica aquí para v3.

El paciente se registra en **un solo formulario** en una tableta de la recepción y toma asiento. El kiosco **solo envía datos y nunca muestra los de otros pacientes**. Cada registro llega a Recepción como una «llegada pendiente» y Recepción la confirma con el asistente de llegada ([S-REC-20](07_pantallas_recepcion.md)), con los datos precargados.

## Campos del formulario

Texto de cabecera: «Regístrese aquí y tome asiento. Le llamaremos por su nombre.»

| Campo | Tipo | Obligatorio | Uso en Recepción |
| --- | --- | --- | --- |
| Nombre | Texto | Sí | Buscar o crear al paciente |
| Apellidos | Texto | Sí | Buscar o crear al paciente |
| Fecha de nacimiento | Fecha (mm/dd/aaaa) | Sí | Distinguir homónimos |
| Teléfono celular | Teléfono de EE. UU. | Sí | Contacto y confirmación de identidad |
| ¿Es su primera vez en nuestra clínica? | «Sí, primera vez» / «No, ya soy paciente» | Sí | Crear un paciente nuevo o buscar el existente |
| ¿A qué viene hoy? | «Me siento enfermo» / «Vengo por resultados» / «Vengo por una inyección» / «Otro motivo» | Sí | Sugerir la ruta de atención |
| Describa brevemente sus síntomas | Texto libre | No | Nota para enfermería |

Botón: «Registrarme».

## Pantallas

| ID | Pantalla | Qué muestra |
| --- | --- | --- |
| S-KIO-01 | Registro | El formulario completo y el botón «Registrarme» |
| S-KIO-02 | Listo | «Gracias, tome asiento. Le llamaremos por su nombre», con cuenta regresiva antes de volver a S-KIO-01 |
| S-REC-28 | Llegadas del kiosco | Bandeja de Recepción en el Panel |

## Lado de Recepción (S-REC-28)

Cada registro aparece al instante en la bandeja «Llegadas del kiosco» del Panel, con aviso sonoro y el motivo indicado con icono, texto y color.

- **Primera vez:** Recepción crea al paciente pasando por la detección de duplicados (S-PAC-03).
- **Ya es paciente:** la app propone coincidencias por nombre, fecha de nacimiento y teléfono; Recepción elige una. Si tenía cita hoy, la cita pasa a «Llegó».
- **El motivo no decide nada clínico:** es un dato declarado por el paciente que se muestra a Recepción, y **Recepción elige la ruta**. Las sugerencias motivo → ruta están desactivadas hasta que el director médico de la organización apruebe una tabla configurable; esa aprobación queda auditada.
- **Al confirmar:** Recepción captura la cobertura y abre la visita en «Registrado». El texto de síntomas pasa a la visita como «motivo declarado por el paciente», sin interpretarlo.

## Funcionamiento interno

- **Ruta y dispositivo:** `/kiosk/<SEDE>`. El Administrador vincula cada tableta con un código de un solo uso desde Sedes. La tableta recibe un token de dispositivo limitado a esa sede y al permiso `kiosk.submit`, sin lectura. Revocable en cualquier momento.
- **Datos:** tabla `kiosk_checkins` (organización, sede, datos capturados, estado, paciente vinculado, visita creada). Los registros sin confirmar vencen al cerrar el día.
- **Credencial del dispositivo frente a datos del paciente:** el token del dispositivo es persistente, está en una cookie httpOnly + Secure y dura 90 días renovables. Los datos del paciente viven solo en la memoria de la página: nada en localStorage, sessionStorage, IndexedDB ni en la caché del service worker. La API responde con `Cache-Control: no-store`.
- **Limpieza:** el formulario se borra al enviar, tras 60 s de inactividad (con aviso de 10 s), al ocultar la pestaña y al recargar. «Listo» no muestra el nombre del paciente.
- **Expiración en el servidor:** un registro sin confirmar vence al cierre del día y su contenido se borra a las 24 h. Al confirmarse, se borra el contenido y quedan solo los metadatos.
- **Protecciones:** límite de envíos por dispositivo, validación en el servidor e `Idempotency-Key` por envío.
- **Hardware:** tableta Android con la PWA en modo de pantalla fija, orientación vertical, soporte antirrobo.
- **Diseño:** texto grande, alto contraste, botones de 64 dp o más, lenguaje sencillo.

## Pendiente de decidir

- ¿Se ofrece también en inglés?
- ¿Los consentimientos se firman en Recepción o se añaden al kiosco?
- ¿«Vengo por resultados» pasa siempre por el proveedor?
