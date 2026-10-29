# Decisiones pendientes

Cuando una se resuelva, crear su ADR y quitarla de esta lista.

| # | Decisión | Propuesta actual | Se necesita antes de |
| --- | --- | --- | --- |
| P-01 | Cifrado de campos frente a búsqueda parcial | Sin cifrado de aplicación en nombre, apellidos, fecha de nacimiento y teléfono (búsqueda con `pg_trgm` + `unaccent`). Cifrado con KMS en datos de seguro e identificación; HMAC si hace falta coincidencia exacta. | Esquema de pacientes (fase 2) |
| P-03 | Reportes por rango para Recepción | Solo el resumen diario de su sede, o también rango y CSV | Fase 5 |
| P-05 | Modelo de precio del SaaS | Por sede, por usuario o por volumen (el cobro es manual en V1) | Fase 6 |
| P-06 | Kiosco: idioma, consentimientos y tabla motivo → ruta | ¿Ofrecerlo en inglés? ¿Dónde se firman los consentimientos? ¿Qué director médico aprueba, o no, las sugerencias de ruta? | Fase 3 |
| P-07 | Retención de auditoría y de expedientes para Lancaster | Definirla con su asesor (propuesta inicial: 6 años para la auditoría) | Fase 4 |
| P-08 | Responsable de privacidad y seguridad (HIPAA) | Persona que firma la evaluación de riesgos | Fase 4 |
| P-09 | Región de AWS y dominio | us-east-1 o us-east-2; subdominio de clearpeak.pro u otro | Fase 4 |
| P-10 | Precios de CloudWatch en el presupuesto B | Confirmar en la calculadora de AWS (estimados en $1.03/mes) | Fase 4 |
| P-13 | Anclaje de la cadena de auditoría | Guardar cada día el hash de la cabeza de cada cadena en S3 con Object Lock (modo gobernanza), como pide el [ADR 0018](0018-auditoria.md). Hasta entonces queda en la propia auditoría (`audit.chain_verified`). Requiere el entorno B. | Fase 4 |
| P-12 | Operador: cuentas globales | El operador debe poder desactivar una cuenta global y resolver los `409 account_shared` (nombre, MFA o contraseña de una cuenta con membresías activas en varias organizaciones). Comandos del operador, como `org:create` ([ADR 0024](0024-operador-plataforma.md)). | Piloto (fase 4) |

## Resueltas

| # | Decisión | Resolución |
| --- | --- | --- |
| P-04 | Rol de solo lectura para contabilidad | **Resuelta:** no entra en V1. [ADR 0025](0025-contabilidad-fuera-v1.md). |
| P-11 | Rol de base de datos del operador de la plataforma | **Resuelta:** `clinic_operator`, el dueño del sistema; da de alta organizaciones con `pnpm org:create` y es el único que lee la auditoría sin organización, con lecturas auditadas. [ADR 0024](0024-operador-plataforma.md). |
| P-02 | Resultado de la prueba de Better Auth | **Resuelta:** se adopta Better Auth con condiciones. [Informe de la prueba](../spikes/T-002-better-auth.md) · [ADR 0023](0023-autenticacion.md) (aceptada con condiciones). |
