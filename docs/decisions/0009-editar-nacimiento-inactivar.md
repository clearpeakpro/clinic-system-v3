# 0009. Editar fecha de nacimiento e inactivar pacientes

- **Estado:** Aceptada (revisada 2026-10-31)
- **Fecha:** 2026-10-22
- **Relacionadas:** [ADR 0027](0027-acceso-clinico-propietario-administrador.md) (acceso clínico del Propietario y el Administrador), [ADR 0018](0018-auditoria.md) (auditoría) y [ADR 0030](0030-busqueda-pacientes-un-campo.md) (búsqueda).
- **Implementación:** [T-013](../tasks/T-013-perfil-paciente.md).

## Contexto

No había forma de hacerlo.

## Decisión

Solo el Administrador, con motivo auditado.

### Revisión del 2026-10-31 (T-013)

- **Quién:** el **Propietario o el Administrador**, siempre que tengan además un **rol clínico** (Recepción, Enfermería o Proveedor) en la sede activa. Sin rol clínico no llegan al paciente ([ADR 0027](0027-acceso-clinico-propietario-administrador.md)).
- **Qué:**
  - cambiar la fecha de nacimiento;
  - inactivar y reactivar a un paciente.
- **Cómo:** con **motivo obligatorio**, auditado.
- **Efecto de inactivar:**
  - el paciente no aparece en la búsqueda por defecto; la casilla «Incluir inactivos» de Pacientes lo muestra;
  - la búsqueda por código lo encuentra siempre, con el chip «Inactivo»;
  - no se le pueden agendar citas: «Nueva cita» no se muestra, y la API de citas (T-015) lo rechazará.
- **Dónde, en la interfaz:** la fecha de nacimiento, en «Editar paciente» (S-PAC-11); «Inactivar paciente» y «Reactivar paciente», al pie del mismo diálogo, como acción secundaria que abre su diálogo con motivo.

## Cómo quedó implementada (T-013, 2026-10-31)

- **Permisos** (`packages/shared/src/permissions.ts`): `patients.edit_birth_date` y `patients.deactivate` para Propietario y Administrador. Por sí solos no bastan: cada endpoint exige también `patients.access`, que solo dan los roles clínicos.
- **Fecha de nacimiento:** `POST /api/patients/:id` con `birthDate` y `birthDateReason`.
  - sin el permiso, `403 birth_date_locked`; sin motivo, `400`;
  - la auditoría `patient.updated` guarda el motivo y solo los nombres de los campos cambiados, nunca los valores.
- **Inactivar y reactivar:** `POST /api/patients/:id/deactivate` y `/reactivate`, con `reason` y `expectedVersion` (`409 version_conflict` si otro lo cambió).
  - se auditan `patient.deactivated` y `patient.reactivated`, con el motivo;
  - repetir el mismo estado da `409 patient_already_inactive` o `patient_already_active`.
- **Búsqueda:** `includeInactive` en `POST /api/patients/search`; por código no se filtra.
- **Pruebas:** `apps/api/test/patients-edit.test.ts` (Administrador sin rol clínico: 403; Administrador y Propietario con Recepción: sí) y `apps/web/e2e/patient-profile.spec.ts` (el Propietario de Sur se asigna Recepción, cambia la fecha, inactiva y reactiva).
