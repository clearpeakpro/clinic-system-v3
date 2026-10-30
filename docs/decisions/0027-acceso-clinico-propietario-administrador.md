# 0027. Propietario y Administrador sin acceso clínico implícito

- **Estado:** Aceptada
- **Fecha:** 2026-10-30
- **Resuelve:** P-14 (antes de T-012).
- **Relacionadas:** [ADR 0011](0011-roles-v3.md) (roles de V1), [ADR 0016](0016-alcance-v1.md) (el Propietario no tiene acceso clínico implícito) y [ADR 0018](0018-auditoria.md) (auditoría).

## Contexto

La fase 2 añade Pacientes y Citas, con datos de pacientes (PHI). Había que decidir si el Propietario y el Administrador, que son roles administrativos, pueden verlos sin tener además un rol clínico.

## Decisión

- **Sin rol clínico, el Propietario y el Administrador no ven Pacientes ni Citas.**
- **Solo los ven si además tienen un rol de Recepción, Enfermería o Proveedor en esa sede.** Los permisos se calculan, como siempre, con sus roles en la sede activa (`packages/shared/src/permissions.ts`).
- **Asignarse ese rol queda auditado.**

Así se cumple el «mínimo necesario» de HIPAA y se mantiene lo ya decidido: Propietario y Administrador son roles administrativos.

## Consecuencias

- **Permisos:** `ROLE_PERMISSIONS` no da (ni ha dado) al Propietario ni al Administrador `patients.access` ni `appointments.access`. Los nuevos permisos de la fase 2 se añaden solo a los roles clínicos que correspondan.
- **Menú:** con solo un rol administrativo, el menú sigue siendo «Administración». Con un rol clínico en la sede activa, aparecen también los destinos de ese rol.
- **El backend autoriza siempre:** cada endpoint de Pacientes y Citas exige su permiso. Las pruebas de T-012 a T-015 comprueban que un Propietario o Administrador sin rol clínico recibe 403.
- **Auditoría del rol:**
  - Hoy, dar un rol clínico a un Administrador lo hace el Propietario desde Usuarios (S-ADM-06), con motivo. Queda en la auditoría como `membership.roles_changed`.
  - **Pendiente de definir** antes de T-012: cómo obtiene un rol clínico el **Propietario**.
    - Con las reglas actuales, nadie puede cambiar sus propios roles (`cannot_modify_self`).
    - La regla escalonada impide además que alguien cambie los roles de un Propietario.
