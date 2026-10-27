# 0018. Auditoría

- **Estado:** Aceptada
- **Fecha:** 2026-10-24

## Contexto

La auditoría no debe copiar registros clínicos ni confundirse con los logs.

## Decisión

Guarda actor, acción, entidad, sede, hora, IP o dispositivo, motivo y request id. En cambios clínicos, solo los nombres de los campos; en cambios administrativos y financieros, antes y después. `clinic_app` solo inserta; leen el Propietario y el Administrador. Cadena de hash con verificación diaria y anclaje en S3 con Object Lock. Retención configurable por organización y definida con su asesor (propuesta inicial: 6 años, que no es obligatoria para todo). Los logs técnicos van aparte, sin PHI y con 30 días de retención.
