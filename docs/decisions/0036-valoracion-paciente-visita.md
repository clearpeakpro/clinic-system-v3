# 0036. Valoración: datos del paciente y de la visita

- **Estado:** Aceptada
- **Fecha:** 2026-11-01
- **Resuelve:** P-20.
- **Precisa:** [ADR 0006](0006-alergias-por-paciente.md) (alergias y antecedentes a nivel del paciente).
- **Relacionadas:** [ADR 0018](0018-auditoria.md) (solo nombres de campos en los cambios clínicos).
- **Implementación:** T-022 ([FASE-3](../tasks/FASE-3.md)).

## Contexto

El ADR 0006 decidió que las alergias y los antecedentes se guardan en el paciente, pero la valoración del manual (S-CLI-15) tiene ocho apartados de texto libre, todos por visita. Faltaba decidir cuáles son del paciente.

## Decisión

- **Del paciente**, versionados y visibles en cada visita: Alergias, Antecedentes personales, Antecedentes familiares, Cirugías, Estilo de vida e Historia reproductiva.
- **De la visita:** Síntomas / motivo de consulta y Notas de enfermería.
- **Quién edita:** Enfermería. El Proveedor los lee, pero no los edita.
- Las alergias se muestran como aviso en el encabezado de la visita.

## Consecuencias

- Al abrir una visita nueva, la historia del paciente ya está ahí: se revisa con el paciente, no se vuelve a escribir.
- Cada cambio de la historia del paciente es una versión nueva. La auditoría guarda solo los nombres de los campos cambiados (ADR 0018).
- Al fusionar pacientes, la historia del duplicado pasa al principal ([ADR 0032](0032-fusionar-pacientes.md)).

## Cómo quedó implementada (T-022, 2026-11-01)

- **Tablas:** `patient_histories` (una fila por versión, append-only: `clinic_app` solo tiene `SELECT` e `INSERT`; la vigente es la de número mayor) y `encounter_assessments` (síntomas y notas de la visita, con `version`). Todo el texto va cifrado con `FieldCipher`.
- **Permisos:** `nursing.assessment` solo para Enfermería; el Proveedor tiene `nursing.view` y la lee. Los signos vitales los editan Enfermería y el Proveedor (`nursing.vitals`, como en el manual).
- **Un solo guardado** (`PUT /api/encounters/:id/assessment`): los apartados cambiados de la historia y de la visita, con la versión de cada una (409 si otra persona guardó antes). Si la historia no cambió, no se crea otra versión.
- **Alergias:** con un estado explícito ([ADR 0040](0040-alergias-sin-alergias-conocidas.md)) y aviso en el encabezado de cada visita.
- **Auditoría:** `patient.history_saved` y `encounter.assessment_saved`, con solo los nombres de los campos (ADR 0018). Una prueba busca los textos guardados en `audit_log` y no los encuentra.
