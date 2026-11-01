# Decisiones pendientes

Cuando una se resuelva, crear su ADR y quitarla de esta lista.

| # | Decisión | Propuesta actual | Se necesita antes de |
| --- | --- | --- | --- |
| P-03 | Reportes por rango para Recepción | Solo el resumen diario de su sede, o también rango y CSV | Fase 5 |
| P-05 | Modelo de precio del SaaS | Por sede, por usuario o por volumen (el cobro es manual en V1) | Fase 6 |
| P-06 | Kiosco: idioma, consentimientos y tabla motivo → ruta | ¿Ofrecerlo en inglés? ¿Dónde se firman los consentimientos? ¿Qué director médico aprueba, o no, las sugerencias de ruta? | Fase 3 |
| P-07 | Retención de auditoría y de expedientes para Lancaster | Definirla con su asesor (propuesta inicial: 6 años para la auditoría) | Fase 4 |
| P-08 | Responsable de privacidad y seguridad (HIPAA) | Persona que firma la evaluación de riesgos | Fase 4 |
| P-09 | Región de AWS y dominio | us-east-1 o us-east-2; subdominio de clearpeak.pro u otro | Fase 4 |
| P-10 | Precios de CloudWatch en el presupuesto B | Confirmar en la calculadora de AWS (estimados en $1.03/mes) | Fase 4 |
| P-13 | Anclaje de la cadena de auditoría | Guardar cada día el hash de la cabeza de cada cadena en S3 con Object Lock (modo gobernanza), como pide el [ADR 0018](0018-auditoria.md). Hasta entonces queda en la propia auditoría (`audit.chain_verified`). Requiere el entorno B. | Fase 4 |
| P-16 | Fusionar pacientes duplicados (S-PAC-13) | En el piloto habrá duplicados reales. Propuesta del manual: «Fusionar con…» en el perfil, que deja al duplicado inactivo con `merged_into` apuntando al que se conserva (la columna ya existe desde T-012). Falta decidir quién fusiona, qué pasa con sus citas y visitas, si se puede deshacer y cómo se audita. | Antes del piloto (fase 4) |
| P-12 | Operador: cuentas globales | El operador debe poder desactivar una cuenta global y resolver los `409 account_shared` (nombre, MFA o contraseña de una cuenta con membresías activas en varias organizaciones). Comandos del operador, como `org:create` ([ADR 0024](0024-operador-plataforma.md)). | Piloto (fase 4) |

## Resueltas

| # | Decisión | Resolución |
| --- | --- | --- |
| P-15 | Volver al precio general en una sede | **Resuelta:** la sede registra «Usa el precio general desde {fecha}», un registro sin importe con su vigencia que no borra ni modifica nada; después puede volver a tener precio propio. Acción «Volver al precio general», auditada. [ADR 0029](0029-precio-general-excepcion-sede.md). |
| P-14 | Acceso del Propietario y el Administrador sin rol clínico a Pacientes y Citas | **Resuelta:** no los ven; solo con un rol de Recepción, Enfermería o Proveedor en esa sede, y asignarse ese rol queda auditado. Única excepción a «nadie cambia sus propios roles»: el Propietario puede asignarse y quitarse roles clínicos en sedes activas de su organización, con motivo, auditado y con aviso a los Administradores. [ADR 0027](0027-acceso-clinico-propietario-administrador.md). |
| P-01 | Cifrado de campos frente a búsqueda parcial | **Resuelta:** nombre, apellidos, fecha de nacimiento y teléfono sin cifrado de aplicación (búsqueda con `pg_trgm` + `unaccent`, por acción explícita); seguro, identificación y notas de cobertura cifrados con KMS, con HMAC solo si hace falta coincidencia exacta. [ADR 0026](0026-cifrado-campos-busqueda.md). |
| P-04 | Rol de solo lectura para contabilidad | **Resuelta:** no entra en V1. [ADR 0025](0025-contabilidad-fuera-v1.md). |
| P-11 | Rol de base de datos del operador de la plataforma | **Resuelta:** `clinic_operator`, el dueño del sistema; da de alta organizaciones con `pnpm org:create` y es el único que lee la auditoría sin organización, con lecturas auditadas. [ADR 0024](0024-operador-plataforma.md). |
| P-02 | Resultado de la prueba de Better Auth | **Resuelta:** se adopta Better Auth con condiciones. [Informe de la prueba](../spikes/T-002-better-auth.md) · [ADR 0023](0023-autenticacion.md) (aceptada con condiciones). |
