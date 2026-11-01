# 0031. Kiosco: idioma, consentimientos y ruta

- **Estado:** Aceptada
- **Fecha:** 2026-11-01
- **Resuelve:** P-06.
- **Precisa:** [ADR 0014](0014-kiosco.md) (kiosco de autorregistro).
- **Implementación:** T-020 y T-021 ([FASE-3](../tasks/FASE-3.md)).

## Contexto

El kiosco (`docs/manual/11_kiosco.md`) dejaba cuatro preguntas abiertas: si se ofrece en inglés, dónde se firman los consentimientos, si el motivo de visita sugiere una ruta (con aprobación del director médico) y si «Vengo por resultados» pasa siempre por el proveedor.

## Decisión

- **Idioma:** español e inglés.
  - Un botón grande en la cabecera cambia todos los textos del formulario y de «Listo».
  - El idioma elegido no se guarda en ninguna parte: se vuelve a español al limpiar el formulario.
- **Consentimientos:** se firman en papel en Recepción, como hoy. El kiosco no los muestra ni los menciona.
- **Ruta:** no hay sugerencias motivo → ruta en V1, ni tabla configurable.
  - El kiosco solo muestra a Recepción el motivo declarado, con icono, texto y color.
  - **Recepción elige siempre la ruta** en el asistente, sin ninguna preselección por el motivo.
- **«Vengo por resultados»:** sin regla propia. Lo decide Recepción, como cualquier otro motivo.

## Consecuencias

- Los textos del kiosco en inglés viven en el mismo catálogo de textos que los de español. Hacen falta las traducciones antes de cerrar T-020.
- Sigue en pie lo del ADR 0014: el motivo no decide nada clínico.
- Escanear los consentimientos firmados llegará con los Documentos del paciente (fase 4, con S3).
- Si una organización pide sugerencias de ruta, se hará con un ADR nuevo: tabla configurable, desactivada hasta que su director médico la apruebe por escrito, con la aprobación auditada. El kiosco no cambia.
