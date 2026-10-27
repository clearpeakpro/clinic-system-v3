# T-006 — Usuarios, invitaciones y perfil

**Tamaño:** 3–4 días · **Depende de:** T-005 · **Pantallas:** S-ADM-01 a 09, S-GEN-09, 10, 21 a 25

## Incluye

- Administración → Usuarios:
  - lista con filtros;
  - invitar con roles por sede;
  - editar nombre, roles y sedes;
  - desactivar y reactivar con motivo;
  - restablecer el MFA de otro usuario;
  - diálogo de secreto de un solo uso para enlaces de invitación y restablecimiento.
- Aceptar invitación: crear la contraseña y, si el rol lo exige, inscribirse en MFA.
- Perfil:
  - cambiar contraseña y desactivar o regenerar el MFA (condición 3 del ADR 0023), con sus pruebas y los permisos mínimos que necesitan;
  - regla: un Propietario o Administrador no puede desactivar su propio MFA.
- Rol Propietario: permisos administrativos y ningún permiso clínico. Una prueba lo comprueba.
- Auditoría de cada acción, guardando motivo, actor y sede.
- Pruebas E2E: invitar, aceptar e iniciar sesión; desactivar a un usuario y comprobar que su sesión se corta.

**No incluye:** el rol de contabilidad, salvo que P-04 se resuelva antes.
