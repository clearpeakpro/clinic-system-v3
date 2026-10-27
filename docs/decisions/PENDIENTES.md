# Decisiones pendientes

Cuando una se resuelva, crear su ADR y quitarla de esta lista.

| # | Decisión | Propuesta actual | Se necesita antes de |
| --- | --- | --- | --- |
| P-01 | Cifrado de campos frente a búsqueda parcial | Sin cifrado de aplicación en nombre, apellidos, fecha de nacimiento y teléfono (búsqueda con `pg_trgm` + `unaccent`). Cifrado con KMS en datos de seguro e identificación; HMAC si hace falta coincidencia exacta. | Esquema de pacientes (fase 2) |
| P-02 | Resultado de la prueba de Better Auth | **Prueba hecha:** recomienda adoptarlo con condiciones ([informe](../spikes/T-002-better-auth.md), [ADR 0023 propuesto](0023-autenticacion.md)). Falta aprobar el ADR. | Fin de la fase 0 |
| P-03 | Reportes por rango para Recepción | Solo el resumen diario de su sede, o también rango y CSV | Fase 5 |
| P-04 | Rol de solo lectura para contabilidad | ¿Entra en V1? | Fase 1 (catálogo de roles) |
| P-05 | Modelo de precio del SaaS | Por sede, por usuario o por volumen (el cobro es manual en V1) | Fase 6 |
| P-06 | Kiosco: idioma, consentimientos y tabla motivo → ruta | ¿Ofrecerlo en inglés? ¿Dónde se firman los consentimientos? ¿Qué director médico aprueba, o no, las sugerencias de ruta? | Fase 3 |
| P-07 | Retención de auditoría y de expedientes para Lancaster | Definirla con su asesor (propuesta inicial: 6 años para la auditoría) | Fase 4 |
| P-08 | Responsable de privacidad y seguridad (HIPAA) | Persona que firma la evaluación de riesgos | Fase 4 |
| P-09 | Región de AWS y dominio | us-east-1 o us-east-2; subdominio de clearpeak.pro u otro | Fase 4 |
| P-10 | Precios de CloudWatch en el presupuesto B | Confirmar en la calculadora de AWS (estimados en $1.03/mes) | Fase 4 |
