# <a id="p-adm--10--pantallas-de-administracion-s-adm"></a>10 — Pantallas de administración (S-ADM)

Este capítulo describe la sección **Administración** de la aplicación, que es de toda la compañía (no depende de la sede activa) y en la práctica es exclusiva del rol Administrador: la **gestión de usuarios** (invitaciones, roles, sedes, restablecimientos de contraseña y de verificación en dos pasos, cierre de sesiones, baja, reactivación y eliminación), las **sedes**, los **catálogos** (tipos de cita, procedimientos, pruebas de laboratorio con sus precios por proveedor, proveedores de laboratorio, fuentes de referido, planes de membresía con sus beneficios y reglas de bono), los **reportes de la compañía**, el **registro de auditoría**, la **configuración** operativa en caliente (estado del sistema, ajustes, integraciones y mantenimiento de claves) y las **alertas de seguridad**. Recepción, Enfermería y el Proveedor no ven esta sección; si escriben una URL `/admin/…` vuelven a su Panel sin mensaje, y el servidor rechaza cualquier operación administrativa. Los catálogos que se mantienen aquí sí los consumen las pantallas operativas de los demás roles. Los textos entre «…» son etiquetas reales de la interfaz y todos los ejemplos (correos, nombres, códigos como `LAN`, `INJ_B12` u `OFFICE_VISIT`) son ficticios.

## <a id="p-adm--como-leer-cada-ficha"></a>Cómo leer cada ficha

- **Acceso por rol**: «Completo», «Limitado» (ve una parte o solo algunas acciones), «Sin acceso» (destino oculto en el menú y ruta redirigida en silencio al Panel; el servidor también lo rechaza con `PERMISSION_DENIED` y lo registra como `access.denied`).
- **PHI / PII**: «Sí» = dato protegido (nombre del personal, motivos y notas que se guardan cifrados, secretos de configuración). La auditoría guarda metadatos censurados: identificadores, códigos y versiones, nunca datos de pacientes.
- **Doble guarda de `/admin/*`**: rol Administrador (`isAdminProvider`) + el permiso de la ruta (`routePermissions`). Las llamadas de estas pantallas no envían la cabecera de sede activa (`x-active-location-id`), salvo los reportes de una sede concreta.
- **Concurrencia optimista**: toda modificación envía la versión de la fila mostrada; si otro administrador la cambió, aparece «Este registro fue actualizado por otro usuario. Actualice para continuar. Actualice la lista e intente de nuevo.» con la acción «Actualizar».
- **Formularios de administración**: diálogo en tablet y escritorio, pantalla completa en teléfono (menos de 600 px), no se cierran tocando fuera, muestran el error en un banner rojo y piden «¿Descartar cambios sin guardar?» al salir con cambios ([S-GEN-26](05_pantallas_generales.md#p-gen--s-gen-26--descartar-cambios-sin-guardar)), salvo las excepciones indicadas en cada ficha.
- **Código fuente**: las rutas de archivo son relativas a `frontend/lib/`.
- Los comportamientos comunes (estados de carga, vacío y error; marco y navegación) están en [05 — Pantallas generales](05_pantallas_generales.md); las vistas de reportes compartidas con Recepción, en [09 — Pantallas de caja](09_pantallas_caja.md).

## <a id="p-adm--matriz-rapida-del-modulo"></a>Matriz rápida del módulo

| Capacidad | Administrador | Recepción | Enfermería / asistente médico | Proveedor |
| --- | --- | --- | --- | --- |
| Ver la sección «Administración» | Sí | No | No | No |
| Invitar, editar nombre, roles y sedes de usuarios | Sí | No | No | No |
| Restablecer contraseña o verificación en dos pasos de otro usuario | Sí (nunca la propia) | No | No | No |
| Cerrar sesiones, deshabilitar, reactivar y eliminar usuarios | Sí (nunca la propia cuenta ni el último administrador) | No | No | No |
| Crear, editar, activar y desactivar sedes | Sí | No | No | No |
| Mantener catálogos, planes de membresía y reglas de bono | Sí | No (los consume en su trabajo) | No (los consume) | No (los consume) |
| Reportes de la compañía | Sí | No (usa los de su sede) | No | No |
| Registro de auditoría | Sí | No | No | No |
| Configuración, integraciones y mantenimiento de claves | Sí | No | No | No |
| Alertas de seguridad y su reconocimiento | Sí (una alerta sobre uno mismo la reconoce otro administrador) | No | No | No |
| Banner de configuración incompleta | Lo ve | Solo recibe el error en sus acciones | Ídem | Ídem |

## <a id="p-adm--indice-de-pantallas"></a>Índice de pantallas

| Id | Pantalla | Ruta / ubicación | Tipo |
| --- | --- | --- | --- |
| [S-ADM-01](10_pantallas_admin.md#p-adm--s-adm-01--menu-administracion-navegacion-del-shell-y-distintivo-de-seguridad) | Menú «Administración» (navegación del shell) y distintivo de Seguridad | Marco de la aplicación | Panel |
| [S-ADM-02](10_pantallas_admin.md#p-adm--s-adm-02--usuarios) | Usuarios | `/admin/users` | Página |
| [S-ADM-03](10_pantallas_admin.md#p-adm--s-adm-03--invitar-usuario) | Invitar usuario | Usuarios | Diálogo |
| [S-ADM-04](10_pantallas_admin.md#p-adm--s-adm-04--dialogo-de-secreto-de-un-solo-uso-invitacion--token-de-restablecimiento) | Diálogo de secreto de un solo uso (invitación / token de restablecimiento) | Usuarios | Diálogo |
| [S-ADM-05](10_pantallas_admin.md#p-adm--s-adm-05--editar-nombre) | Editar nombre | Usuarios | Diálogo |
| [S-ADM-06](10_pantallas_admin.md#p-adm--s-adm-06--editar-roles--editar-sedes-seleccion-multiple) | Editar roles / Editar sedes (selección múltiple) | Usuarios | Diálogo |
| [S-ADM-07](10_pantallas_admin.md#p-adm--s-adm-07--confirmaciones-de-acciones-sobre-usuarios) | Confirmaciones de acciones sobre usuarios | Usuarios | Diálogo |
| [S-ADM-08](10_pantallas_admin.md#p-adm--s-adm-08--restablecer-la-verificacion-en-dos-pasos) | Restablecer la verificación en dos pasos | Usuarios | Diálogo |
| [S-ADM-09](10_pantallas_admin.md#p-adm--s-adm-09--reactivar-usuario) | Reactivar usuario | Usuarios | Diálogo |
| [S-ADM-10](10_pantallas_admin.md#p-adm--s-adm-10--sedes) | Sedes | `/admin/locations` | Página |
| [S-ADM-11](10_pantallas_admin.md#p-adm--s-adm-11--nueva-sede--editar-sede) | Nueva sede / Editar sede | Sedes | Diálogo |
| [S-ADM-12](10_pantallas_admin.md#p-adm--s-adm-12--selector-de-zona-horaria) | Selector de zona horaria | Sedes, Configuración | Diálogo |
| [S-ADM-13](10_pantallas_admin.md#p-adm--s-adm-13--catalogos--tipos-de-cita-patron-crud-comun-de-catalogos) | Catálogos › Tipos de cita (patrón CRUD común de catálogos) | `/admin/catalog/appointment-types` | Página |
| [S-ADM-14](10_pantallas_admin.md#p-adm--s-adm-14--catalogos--procedimientos) | Catálogos › Procedimientos | `/admin/catalog/procedures` | Página |
| [S-ADM-15](10_pantallas_admin.md#p-adm--s-adm-15--catalogos--pruebas-de-laboratorio) | Catálogos › Pruebas de laboratorio | `/admin/catalog/labs` | Página |
| [S-ADM-16](10_pantallas_admin.md#p-adm--s-adm-16--precios-por-proveedor--prueba) | Precios por proveedor · | `/admin/catalog/labs/<prueba>/prices` | Página |
| [S-ADM-17](10_pantallas_admin.md#p-adm--s-adm-17--catalogos--proveedores-de-laboratorio) | Catálogos › Proveedores de laboratorio | `/admin/catalog/lab-providers` | Página |
| [S-ADM-18](10_pantallas_admin.md#p-adm--s-adm-18--catalogos--fuentes-de-referido) | Catálogos › Fuentes de referido | `/admin/catalog/referral-sources` | Página |
| [S-ADM-19](10_pantallas_admin.md#p-adm--s-adm-19--formulario-de-catalogo-nuevo-catalogo--editar-catalogo) | Formulario de catálogo «Nuevo: {catálogo}» / «Editar: {catálogo}» | Catálogos | Diálogo |
| [S-ADM-20](10_pantallas_admin.md#p-adm--s-adm-20--confirmacion-desactivar-nombre-catalogos) | Confirmación «¿Desactivar {nombre}?» (catálogos) | Catálogos | Diálogo |
| [S-ADM-21](10_pantallas_admin.md#p-adm--s-adm-21--planes-de-membresia) | Planes de membresía | `/admin/membership-plans` | Página |
| [S-ADM-22](10_pantallas_admin.md#p-adm--s-adm-22--beneficios--plan) | Beneficios · | `/admin/membership-plans/<plan>/benefits` | Página |
| [S-ADM-23](10_pantallas_admin.md#p-adm--s-adm-23--reglas-de-bono) | Reglas de bono | `/admin/bonus-rules` | Página |
| [S-ADM-24](10_pantallas_admin.md#p-adm--s-adm-24--reportes-de-la-compania-pestana-diario) | Reportes de la compañía (pestaña «Diario») | `/admin/reports` | Página |
| [S-ADM-25](10_pantallas_admin.md#p-adm--s-adm-25--reportes-de-la-compania--pestana-rango) | Reportes de la compañía › pestaña «Rango» | `/admin/reports` | Panel |
| [S-ADM-26](10_pantallas_admin.md#p-adm--s-adm-26--registro-de-auditoria) | Registro de auditoría | `/admin/audit` | Página |
| [S-ADM-27](10_pantallas_admin.md#p-adm--s-adm-27--entrada-de-auditoria-detalle) | Entrada de auditoría (detalle) | Auditoría | Diálogo |
| [S-ADM-28](10_pantallas_admin.md#p-adm--s-adm-28--configuracion-marco-con-pestanas-y-barra-de-cambios-pendientes) | Configuración (marco con pestañas y barra de cambios pendientes) | `/admin/settings` | Página |
| [S-ADM-29](10_pantallas_admin.md#p-adm--s-adm-29--lista-de-configuracion-inicial) | Lista de configuración inicial | Configuración | Banner |
| [S-ADM-30](10_pantallas_admin.md#p-adm--s-adm-30--configuracion--estado-del-sistema) | Configuración › Estado del sistema | Configuración, pestaña 1 | Panel |
| [S-ADM-31](10_pantallas_admin.md#p-adm--s-adm-31--configuracion--ajustes-campo-de-ajuste) | Configuración › Ajustes (campo de ajuste) | Configuración, pestaña 2 | Panel |
| [S-ADM-32](10_pantallas_admin.md#p-adm--s-adm-32--configuracion--integraciones) | Configuración › Integraciones | Configuración, pestaña 3 | Panel |
| [S-ADM-33](10_pantallas_admin.md#p-adm--s-adm-33--configuracion--mantenimiento-de-claves) | Configuración › Mantenimiento de claves | Configuración, pestaña 4 | Panel |
| [S-ADM-34](10_pantallas_admin.md#p-adm--s-adm-34--alertas-de-seguridad) | Alertas de seguridad | `/admin/security` | Página |
| [S-ADM-35](10_pantallas_admin.md#p-adm--s-adm-35--alerta-de-seguridad-detalle) | Alerta de seguridad (detalle) | `/admin/security/<alerta>` | Página |
| [S-ADM-36](10_pantallas_admin.md#p-adm--s-adm-36--reconocer-alerta) | Reconocer alerta | Detalle de alerta | Diálogo |
| [S-ADM-37](10_pantallas_admin.md#p-adm--s-adm-37--entrada-de-auditoria-desde-una-alerta) | Entrada de auditoría (desde una alerta) | Detalle de alerta | Diálogo |
| [S-ADM-38](10_pantallas_admin.md#p-adm--s-adm-38--banner-la-configuracion-del-sistema-esta-incompleta) | Banner «La configuración del sistema está incompleta» | Bajo la cabecera | Banner |
| [S-ADM-39](10_pantallas_admin.md#p-adm--s-adm-39--aviso-alerta-de-seguridad-en-notificaciones) | Aviso «Alerta de seguridad» en notificaciones | Campana de notificaciones | Panel |

## <a id="p-adm--recorridos-que-pasan-por-estas-pantallas"></a>Recorridos que pasan por estas pantallas

| Recorrido | Roles | Pantallas, en orden |
| --- | --- | --- |
| Dar de alta a un empleado (invitación) | Administrador; la persona invitada acepta | [S-ADM-01](10_pantallas_admin.md#p-adm--s-adm-01--menu-administracion-navegacion-del-shell-y-distintivo-de-seguridad) → [S-ADM-02](10_pantallas_admin.md#p-adm--s-adm-02--usuarios) → [S-ADM-03](10_pantallas_admin.md#p-adm--s-adm-03--invitar-usuario) → [S-ADM-04](10_pantallas_admin.md#p-adm--s-adm-04--dialogo-de-secreto-de-un-solo-uso-invitacion--token-de-restablecimiento) → aceptación pública ([S-GEN-09](05_pantallas_generales.md#p-gen--s-gen-09--aceptar-invitacion)) → [S-ADM-02](10_pantallas_admin.md#p-adm--s-adm-02--usuarios) «Actualizar» |
| Cambiar roles o sedes | Administrador | [S-ADM-02](10_pantallas_admin.md#p-adm--s-adm-02--usuarios) → [S-ADM-06](10_pantallas_admin.md#p-adm--s-adm-06--editar-roles--editar-sedes-seleccion-multiple) |
| Olvido de contraseña | Administrador; el empleado usa el token | [S-ADM-02](10_pantallas_admin.md#p-adm--s-adm-02--usuarios) «Crear restablecimiento de contraseña» → [S-ADM-04](10_pantallas_admin.md#p-adm--s-adm-04--dialogo-de-secreto-de-un-solo-uso-invitacion--token-de-restablecimiento) (o [S-ADM-08](10_pantallas_admin.md#p-adm--s-adm-08--restablecer-la-verificacion-en-dos-pasos) si hay un restablecimiento pendiente) → [S-GEN-10](05_pantallas_generales.md#p-gen--s-gen-10--restablecer-contrasena) |
| Teléfono perdido o verificación bloqueada | Otro Administrador; el empleado afectado | [S-ADM-02](10_pantallas_admin.md#p-adm--s-adm-02--usuarios) → [S-ADM-08](10_pantallas_admin.md#p-adm--s-adm-08--restablecer-la-verificacion-en-dos-pasos) → [S-ADM-04](10_pantallas_admin.md#p-adm--s-adm-04--dialogo-de-secreto-de-un-solo-uso-invitacion--token-de-restablecimiento) → [S-GEN-10](05_pantallas_generales.md#p-gen--s-gen-10--restablecer-contrasena) → [S-GEN-07](05_pantallas_generales.md#p-gen--s-gen-07--configurar-la-verificacion-en-dos-pasos-inscripcion-obligatoria-al-iniciar-sesio) |
| Baja temporal y recontratación | Administrador | [S-ADM-07](10_pantallas_admin.md#p-adm--s-adm-07--confirmaciones-de-acciones-sobre-usuarios) (cerrar sesiones / deshabilitar) → [S-ADM-09](10_pantallas_admin.md#p-adm--s-adm-09--reactivar-usuario) → [S-ADM-04](10_pantallas_admin.md#p-adm--s-adm-04--dialogo-de-secreto-de-un-solo-uso-invitacion--token-de-restablecimiento) |
| Eliminar un usuario | Administrador | [S-ADM-02](10_pantallas_admin.md#p-adm--s-adm-02--usuarios) → [S-ADM-07](10_pantallas_admin.md#p-adm--s-adm-07--confirmaciones-de-acciones-sobre-usuarios) |
| Recuperación de emergencia (break-glass) | Operador del servidor; otro Administrador revisa | Comando de servidor → [S-GEN-10](05_pantallas_generales.md#p-gen--s-gen-10--restablecer-contrasena) → [S-ADM-26](10_pantallas_admin.md#p-adm--s-adm-26--registro-de-auditoria) / [S-ADM-27](10_pantallas_admin.md#p-adm--s-adm-27--entrada-de-auditoria-detalle) → [S-ADM-34](10_pantallas_admin.md#p-adm--s-adm-34--alertas-de-seguridad) → [S-ADM-35](10_pantallas_admin.md#p-adm--s-adm-35--alerta-de-seguridad-detalle) → [S-ADM-36](10_pantallas_admin.md#p-adm--s-adm-36--reconocer-alerta) |
| Abrir una sede y asignar personal | Administrador | [S-ADM-10](10_pantallas_admin.md#p-adm--s-adm-10--sedes) → [S-ADM-11](10_pantallas_admin.md#p-adm--s-adm-11--nueva-sede--editar-sede) / [S-ADM-12](10_pantallas_admin.md#p-adm--s-adm-12--selector-de-zona-horaria) → [S-ADM-06](10_pantallas_admin.md#p-adm--s-adm-06--editar-roles--editar-sedes-seleccion-multiple) o [S-ADM-03](10_pantallas_admin.md#p-adm--s-adm-03--invitar-usuario) → (opcional) [S-ADM-23](10_pantallas_admin.md#p-adm--s-adm-23--reglas-de-bono) |
| Desactivar una sede | Administrador | [S-ADM-10](10_pantallas_admin.md#p-adm--s-adm-10--sedes) «Desactivar» |
| Laboratorio externo y sus precios | Administrador | [S-ADM-17](10_pantallas_admin.md#p-adm--s-adm-17--catalogos--proveedores-de-laboratorio) → [S-ADM-15](10_pantallas_admin.md#p-adm--s-adm-15--catalogos--pruebas-de-laboratorio) → [S-ADM-16](10_pantallas_admin.md#p-adm--s-adm-16--precios-por-proveedor--prueba) → [S-ADM-19](10_pantallas_admin.md#p-adm--s-adm-19--formulario-de-catalogo-nuevo-catalogo--editar-catalogo) |
| Mantener catálogos operativos | Administrador | [S-ADM-13](10_pantallas_admin.md#p-adm--s-adm-13--catalogos--tipos-de-cita-patron-crud-comun-de-catalogos) / [S-ADM-14](10_pantallas_admin.md#p-adm--s-adm-14--catalogos--procedimientos) / [S-ADM-18](10_pantallas_admin.md#p-adm--s-adm-18--catalogos--fuentes-de-referido) → [S-ADM-19](10_pantallas_admin.md#p-adm--s-adm-19--formulario-de-catalogo-nuevo-catalogo--editar-catalogo) → [S-ADM-20](10_pantallas_admin.md#p-adm--s-adm-20--confirmacion-desactivar-nombre-catalogos) |
| Plan de membresía con beneficios | Administrador | [S-ADM-21](10_pantallas_admin.md#p-adm--s-adm-21--planes-de-membresia) → [S-ADM-19](10_pantallas_admin.md#p-adm--s-adm-19--formulario-de-catalogo-nuevo-catalogo--editar-catalogo) → [S-ADM-22](10_pantallas_admin.md#p-adm--s-adm-22--beneficios--plan) |
| Regla de bono y su reflejo en el reporte | Administrador | [S-ADM-23](10_pantallas_admin.md#p-adm--s-adm-23--reglas-de-bono) → [S-ADM-24](10_pantallas_admin.md#p-adm--s-adm-24--reportes-de-la-compania-pestana-diario) (tarjeta «Dinero», «Bono») |
| Reportes de la compañía, impresión y CSV | Administrador | [S-ADM-24](10_pantallas_admin.md#p-adm--s-adm-24--reportes-de-la-compania-pestana-diario) → [S-ADM-25](10_pantallas_admin.md#p-adm--s-adm-25--reportes-de-la-compania--pestana-rango) → registro de exportación ([S-CAJ-24](09_pantallas_caja.md#p-caj--s-caj-24--impresion-y-exportacion-dialogo-del-sistema-y-auditoria)) |
| Primer arranque: completar la configuración | Primer Administrador | [S-GEN-02](05_pantallas_generales.md#p-gen--s-gen-02--configuracion-inicial-asistente-de-primer-arranque) → [S-ADM-28](10_pantallas_admin.md#p-adm--s-adm-28--configuracion-marco-con-pestanas-y-barra-de-cambios-pendientes) → [S-ADM-29](10_pantallas_admin.md#p-adm--s-adm-29--lista-de-configuracion-inicial) → [S-ADM-31](10_pantallas_admin.md#p-adm--s-adm-31--configuracion--ajustes-campo-de-ajuste) / [S-ADM-32](10_pantallas_admin.md#p-adm--s-adm-32--configuracion--integraciones) → [S-ADM-30](10_pantallas_admin.md#p-adm--s-adm-30--configuracion--estado-del-sistema) «Listo» → [S-ADM-10](10_pantallas_admin.md#p-adm--s-adm-10--sedes) → [S-ADM-03](10_pantallas_admin.md#p-adm--s-adm-03--invitar-usuario) |
| Cambiar un ajuste operativo | Administrador | [S-ADM-31](10_pantallas_admin.md#p-adm--s-adm-31--configuracion--ajustes-campo-de-ajuste) → barra de [S-ADM-28](10_pantallas_admin.md#p-adm--s-adm-28--configuracion-marco-con-pestanas-y-barra-de-cambios-pendientes) «Guardar cambios» |
| Seguir una rotación de claves | Administrador (el operador rota en el servidor) | [S-ADM-33](10_pantallas_admin.md#p-adm--s-adm-33--configuracion--mantenimiento-de-claves) |
| Revisar y reconocer una alerta | Administrador | [S-ADM-39](10_pantallas_admin.md#p-adm--s-adm-39--aviso-alerta-de-seguridad-en-notificaciones) / [S-ADM-01](10_pantallas_admin.md#p-adm--s-adm-01--menu-administracion-navegacion-del-shell-y-distintivo-de-seguridad) → [S-ADM-34](10_pantallas_admin.md#p-adm--s-adm-34--alertas-de-seguridad) → [S-ADM-35](10_pantallas_admin.md#p-adm--s-adm-35--alerta-de-seguridad-detalle) → [S-ADM-37](10_pantallas_admin.md#p-adm--s-adm-37--entrada-de-auditoria-desde-una-alerta) → [S-ADM-36](10_pantallas_admin.md#p-adm--s-adm-36--reconocer-alerta) |
| Investigar en la auditoría | Administrador | [S-ADM-26](10_pantallas_admin.md#p-adm--s-adm-26--registro-de-auditoria) → [S-ADM-27](10_pantallas_admin.md#p-adm--s-adm-27--entrada-de-auditoria-detalle) |
| Un rol no administrador intenta entrar | Recepción, Enfermería, Proveedor | URL `/admin/…` → vuelve a su Panel sin mensaje |

Los pasos detallados están en la guía de rol [04 — Administrador](04_administrador.md).

---

### <a id="p-adm--s-adm-01--menu-administracion-navegacion-del-shell-y-distintivo-de-seguridad"></a>S-ADM-01 Menú «Administración» (navegación del shell) y distintivo de Seguridad

**Ruta:** marco común a `/app/<código>/…` y `/admin/…`; `/admin` sin sub-ruta redirige a `/admin/users` · **Tipo:** panel

**Propósito**

Dar acceso a las pantallas de administración de la compañía (no dependen de la sede activa) y avisar de las alertas de seguridad pendientes.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Ve los nueve destinos de Administración y el distintivo numérico de «Seguridad». |
| Recepción | Sin acceso | Los nueve destinos se ocultan: ninguno de sus permisos (`manageUsers`, `manageLocations`, `manageCatalog`, `manageProceduresLabs`, `managePricing`, `viewCompanyReports`, `viewAuditLog`, `viewSecurityEvents`) está en su rol. |
| Enfermería / asistente médico | Sin acceso | Ídem. |
| Proveedor | Sin acceso | Ídem. |

Guarda de ruta: cualquier ruta `/admin/*` exige además el rol Administrador y el permiso de la ruta; si falla, redirección silenciosa al inicio (Panel de la sede activa, o `/select-location`). El servidor vuelve a validar cada operación.

**Cómo se llega**

Siempre visible para el Administrador: navegación lateral persistente (más de 1024 px), riel desplazable (600–1024 px) o cajón (icono de menú) en teléfono (menos de 600 px). En teléfono la barra inferior solo muestra los cinco primeros destinos (todos operativos), así que Administración solo se alcanza desde el cajón.

**Distribución**

- Cabecera común ([S-GEN-12](05_pantallas_generales.md#p-gen--s-gen-12--marco-de-la-aplicacion-y-navegacion-principal)): selector de sede ([S-GEN-13](05_pantallas_generales.md#p-gen--s-gen-13--selector-de-sede-cabecera)), indicador en vivo («En vivo» / «Reconectando…» / «Sin conexión»; solo icono con tooltip en menos de 600 px, [S-GEN-14](05_pantallas_generales.md#p-gen--s-gen-14--indicador-de-actualizaciones-en-vivo)), botón «Buscar» (va a Pacientes de la sede activa), campana de notificaciones ([S-GEN-15](05_pantallas_generales.md#p-gen--s-gen-15--centro-de-notificaciones)) y avatar «Cuenta» ([S-GEN-16](05_pantallas_generales.md#p-gen--s-gen-16--menu-de-cuenta)).
- Debajo de la cabecera (40 px), según prioridad: banner de configuración incompleta (solo Administrador, [S-ADM-38](10_pantallas_admin.md#p-adm--s-adm-38--banner-la-configuracion-del-sistema-esta-incompleta)) o banner de modo degradado (todos, [S-GEN-19](05_pantallas_generales.md#p-gen--s-gen-19--banner-de-modo-degradado-emergencia-de-infraestructura)).
- Navegación: primero los destinos operativos permitidos (Panel, Pacientes, Citas, Cola de enfermería, Cola de proveedor, Cola de órdenes, Caja, Reportes), luego un divisor y el encabezado «Administración» (solo en la navegación lateral y en el cajón; en el riel, solo un espacio de 16 px).
- Destinos de Administración, en este orden: «Usuarios», «Sedes», «Catálogos», «Planes de membresía», «Reglas de bono», «Reportes de la compañía», «Auditoría», «Configuración», «Seguridad» (con distintivo numérico = alertas sin reconocer).

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Tocar un destino | Administrador | Navega a su ruta fija: `/admin/users`, `/admin/locations`, `/admin/catalog/appointment-types`, `/admin/membership-plans`, `/admin/bonus-rules`, `/admin/reports`, `/admin/audit`, `/admin/settings`, `/admin/security`. | No | La pantalla elegida. |
| Cambiar de sede en la cabecera estando en `/admin/…` | Administrador | Ejecuta el cambio de sede (pregunta si hay formularios sucios registrados). | Solo con cambios sin guardar | Panel de la nueva sede (sale de Administración). |

**Estados y mensajes**

- Destino resaltado: solo cuando la ruta actual coincide con la del destino o empieza por ella. «Catálogos» apunta a Tipos de cita, así que en Procedimientos, Pruebas, Proveedores de laboratorio, Fuentes de referido y Precios por proveedor ningún destino queda resaltado.
- Distintivo de «Seguridad»: oculto con 0; se lee al iniciar sesión (una lectura de una fila) y se refresca con eventos en vivo, con cada carga de la lista de alertas y tras un reconocimiento. Etiqueta para lectores: «Seguridad, {n} alertas por reconocer».
- Usuario sin permisos de administración: la sección no aparece; si escribe una URL `/admin/…` vuelve a su inicio sin mensaje.

**Tiempo real**

El distintivo se actualiza con `security.event_raised.v1` y `security.event_acknowledged.v1` del canal `admin:security` (agrupados cada 2 s) y en cada reconexión que incluya ese canal. Vuelve a 0 al cerrar sesión.

**Reglas de negocio**

- Las rutas `/admin/*` son de compañía: no llevan la sede en la URL ni envían la cabecera de sede activa.
- Permiso efectivo = unión de los roles; en la práctica todas las pantallas de esta sección son exclusivas del rol Administrador.
- `/admin` sin sub-ruta redirige a `/admin/users`.

**Notas para el rediseño**

- Preservar el orden y la separación visual entre operación y Administración; un Administrador tiene unos 17 destinos, así que el riel debe seguir siendo desplazable.
- Preservar el distintivo numérico de Seguridad (no solo color).
- «Catálogos» no se marca como activo en cinco de sus siete sub-pantallas; «Planes de membresía» y «Reglas de bono» tienen destino propio y además aparecen como chips del selector de catálogos ([S-ADM-13](10_pantallas_admin.md#p-adm--s-adm-13--catalogos--tipos-de-cita-patron-crud-comun-de-catalogos)).
- En teléfono Administración queda escondida en el cajón: considerar un acceso más directo para administradores.
- La redirección silenciosa al intentar abrir `/admin` sin permiso no explica nada al usuario.

**Código fuente:** `core/navigation/nav_items.dart`, `core/widgets/app_shell.dart`, `core/routing/shell_screen.dart`, `core/routing/routes.dart`, `core/routing/app_router.dart`, `features/security/application/security_badge.dart`, `core/permissions/role_permissions.dart`.

---

### <a id="p-adm--s-adm-02--usuarios"></a>S-ADM-02 Usuarios

**Ruta:** `/admin/users` · **Tipo:** página

**Propósito**

Gestionar las cuentas del personal: invitación, nombre, roles, sedes, restablecimientos de contraseña y de verificación en dos pasos, cierre de sesiones, deshabilitar y reactivar, y eliminar.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Guarda de rol + permiso `manageUsers`; `UserService` solo para Administrador. |
| Recepción | Sin acceso | Destino oculto. |
| Enfermería / asistente médico | Sin acceso | Destino oculto. |
| Proveedor | Sin acceso | Destino oculto. |

**Cómo se llega**

Administración › «Usuarios» (también es el destino por defecto de `/admin`).

**Distribución**

- Encabezado: título «Usuarios», subtítulo «Cuentas del personal por invitación, roles y sedes.»; a la derecha, icono «Actualizar» y botón principal «Invitar usuario».
- Filtro de estado: botones segmentados (600 px o más) o desplegable (menos de 600 px): «Todos (excepto eliminados)», «Invitado», «Activo», «Deshabilitado», «Eliminado».
- Lista: tabla (600 px o más) con las columnas «Nombre», «Correo», «Roles», «Sedes», «Estado», «Acciones»; en teléfono, tarjetas con nombre, correo, roles, códigos de sede, chip de estado y el menú «Más acciones» (⋮).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| Filtro de estado | Selección única | Sí (por defecto «Todos (excepto eliminados)») | — | No |
| «Nombre» | Texto (solo lectura) | — | — | Sí (nombre del personal, cifrado en el servidor) |
| «Correo» | Texto en claro (solo lectura) | — | — | Sí (dato de identificación del personal, visible solo a administradores) |
| «Roles» | Etiquetas «Administrador», «Recepción», «Enfermería / MA», «Proveedor» separadas por comas | — | — | No |
| «Sedes» | Códigos de sede separados por comas; «Sin sedes» si no tiene; «…» mientras cargan | — | — | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Invitar usuario» | Administrador | Abre el diálogo de invitación. | — | [S-ADM-03](10_pantallas_admin.md#p-adm--s-adm-03--invitar-usuario); al terminar, recarga la lista y muestra [S-ADM-04](10_pantallas_admin.md#p-adm--s-adm-04--dialogo-de-secreto-de-un-solo-uso-invitacion--token-de-restablecimiento) «Invitación creada». |
| «Actualizar» (icono) | Administrador | Recarga la lista (`UserService/ListUsers`). | No | Barra fina. |
| «Más acciones» › «Editar nombre» | Administrador; cualquier estado salvo Eliminado | `UserService/UpdateUser` con `expected_version`. | Diálogo [S-ADM-05](10_pantallas_admin.md#p-adm--s-adm-05--editar-nombre) | Recarga la lista (sin snackbar de éxito). |
| › «Editar roles» | Ídem | `UserService/SetUserRoles`. | Diálogo [S-ADM-06](10_pantallas_admin.md#p-adm--s-adm-06--editar-roles--editar-sedes-seleccion-multiple) | Recarga (sin snackbar de éxito). |
| › «Editar sedes» | Ídem | `UserService/SetUserLocations`. | Diálogo [S-ADM-06](10_pantallas_admin.md#p-adm--s-adm-06--editar-roles--editar-sedes-seleccion-multiple) | Recarga (sin snackbar de éxito). |
| › «Crear restablecimiento de contraseña» | Administrador; solo Activo | Primero consulta `GetUserMfaStatus`: si hay un restablecimiento de verificación pendiente abre [S-ADM-08](10_pantallas_admin.md#p-adm--s-adm-08--restablecer-la-verificacion-en-dos-pasos) en su vista «pendiente»; si no, `UserService/CreatePasswordReset`. | No | [S-ADM-04](10_pantallas_admin.md#p-adm--s-adm-04--dialogo-de-secreto-de-un-solo-uso-invitacion--token-de-restablecimiento) «Restablecimiento de contraseña creado» (solo token). |
| › «Cerrar sesión en todos los dispositivos» (rojo) | Administrador; solo Activo y no la propia cuenta | `UserService/RevokeUserSessions`. | [S-ADM-07](10_pantallas_admin.md#p-adm--s-adm-07--confirmaciones-de-acciones-sobre-usuarios) | Snackbar «No había sesiones activas.» / «1 sesión cerrada.» / «{count} sesiones cerradas.» |
| › «Restablecer la verificación en dos pasos» (rojo) | Administrador; Activo o Deshabilitado, nunca la propia cuenta ni un Invitado | Abre el diálogo de restablecimiento. | [S-ADM-08](10_pantallas_admin.md#p-adm--s-adm-08--restablecer-la-verificacion-en-dos-pasos) | Ver [S-ADM-08](10_pantallas_admin.md#p-adm--s-adm-08--restablecer-la-verificacion-en-dos-pasos). |
| › «Revocar invitación» (rojo) | Administrador; solo Invitado | `UserService/RevokeInvitation`. | [S-ADM-07](10_pantallas_admin.md#p-adm--s-adm-07--confirmaciones-de-acciones-sobre-usuarios) | Snackbar «Invitación revocada.» |
| › «Deshabilitar» (rojo) | Administrador; solo Activo | `UserService/DisableUser`. | [S-ADM-07](10_pantallas_admin.md#p-adm--s-adm-07--confirmaciones-de-acciones-sobre-usuarios) | El chip pasa a «Deshabilitado» (sin snackbar). |
| › «Reactivar» | Administrador; solo Deshabilitado | Abre el diálogo de reactivación. | [S-ADM-09](10_pantallas_admin.md#p-adm--s-adm-09--reactivar-usuario) | Snackbar «La cuenta de {name} vuelve a estar activa. Cree un restablecimiento de contraseña para que pueda iniciar sesión.» con la acción «Crear restablecimiento de contraseña». |
| › «Eliminar» (rojo) | Administrador; cualquier estado salvo Eliminado | `UserService/DeleteUser`. | [S-ADM-07](10_pantallas_admin.md#p-adm--s-adm-07--confirmaciones-de-acciones-sobre-usuarios) | Snackbar «Usuario eliminado.» |
| — errores de cualquier modificación | — | — | — | Snackbar traducido; en conflicto de versión: «Este registro fue actualizado por otro usuario. Actualice para continuar. Actualice la lista e intente de nuevo.» + acción «Actualizar». |

**Estados y mensajes**

- Cargando: indicador circular centrado; recarga en segundo plano: barra fina superior sin borrar la lista.
- Vacío: icono + «Ningún usuario coincide con este filtro.»
- Error sin datos: «Algo salió mal» + mensaje + «Reintentar»; error en la recarga: banner rojo compacto sobre la lista.
- Chips de estado: «Invitado» (azul, info), «Activo» (verde, éxito), «Deshabilitado» (ámbar, advertencia), «Eliminado» (rojo, peligro).
- Fila Eliminado: menú «Más acciones» deshabilitado.
- Errores con texto propio: último administrador → «Es el último administrador activo. Primero asigne el rol de administrador a otra persona.»; reactivar un usuario no deshabilitado → «Solo se pueden reactivar usuarios deshabilitados. Actualice la lista.»; acceso del propio administrador terminado durante el cambio → «Su propia sesión o su acceso de administrador terminó mientras este cambio esperaba, así que no se cambió nada. Vuelva a iniciar sesión.»
- Errores sin texto propio (caen en los genéricos): deshabilitarse o eliminarse a sí mismo (`cannot_modify_self`) y quitarse el rol Administrador (`cannot_remove_own_admin`) → «Esta acción no está permitida en el estado actual.»; correo ya usado (`email_taken`) → «Este registro ya existe.»
- Sesión renovada durante una modificación → «Su sesión fue renovada. Repita la acción.»

**Tiempo real**

Sin actualización en vivo: la lista solo se recarga tras una acción propia o con «Actualizar». Los cambios de otro administrador se detectan como conflicto de versión.

**Reglas de negocio**

- Alta solo por invitación. Estados: Invitado → Activo (al aceptar la invitación) → Deshabilitado ⇄ Activo (Reactivar); cualquiera salvo Eliminado → Eliminado (borrado lógico, irreversible).
- Concurrencia optimista: editar nombre, roles y sedes, deshabilitar, reactivar y eliminar envían la versión de la fila mostrada.
- El último Administrador ACTIVO no puede deshabilitarse, eliminarse ni perder el rol (`last_administrator`). Un administrador no puede quitarse su propio rol, ni deshabilitarse, eliminarse, cerrar sus propias sesiones o restablecer su propia verificación en dos pasos (servidor).
- Volver a invitar el correo de una persona aún Invitada emite una invitación nueva (token nuevo); cualquier otro correo existente se rechaza.
- Deshabilitar o eliminar revoca todas las sesiones al instante.
- Las listas de usuarios y sedes se limpian al cerrar sesión.

**Notas para el rediseño**

- Preservar que las acciones dependan del estado y de si la fila es la propia cuenta, y que los tokens se muestren una sola vez ([S-ADM-04](10_pantallas_admin.md#p-adm--s-adm-04--dialogo-de-secreto-de-un-solo-uso-invitacion--token-de-restablecimiento)) y no queden en pantalla ni en registros.
- Preservar las confirmaciones rojas en las acciones destructivas y el botón «Actualizar» del snackbar de conflicto.
- «Deshabilitar» y «Eliminar» aparecen en la propia fila aunque el servidor los rechaza con un mensaje genérico; ocultarlos o deshabilitarlos con una explicación.
- El servidor permite deshabilitar a un usuario Invitado, pero la interfaz solo lo ofrece para Activo.
- Algunas modificaciones (editar nombre, roles o sedes, deshabilitar) no confirman con snackbar; otras sí.
- «Editar roles» y «Editar sedes» envían la petición aunque no se haya cambiado nada (la versión aumenta).
- No hay búsqueda por nombre o correo ni orden de columnas; con muchos usuarios solo se filtra por estado.
- El filtro de estado no se conserva al salir de la página.

**Código fuente:** `features/admin/presentation/users/users_page.dart`, `user_labels.dart`, `features/admin/infrastructure/user_gateway.dart`, `features/admin/application/admin_providers.dart`, `features/admin/presentation/widgets/admin_failure.dart`.

---

### <a id="p-adm--s-adm-03--invitar-usuario"></a>S-ADM-03 Invitar usuario

**Ruta:** diálogo sobre `/admin/users` · **Tipo:** diálogo

**Propósito**

Crear la invitación de un empleado con sus roles y sedes iniciales.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | El servidor exige `manageUsers` y `assignRolesLocations`. |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Botón «Invitar usuario» de [S-ADM-02](10_pantallas_admin.md#p-adm--s-adm-02--usuarios).

**Distribución**

- Diálogo «Invitar usuario» (ancho 560) en tablet y escritorio; en teléfono, pantalla completa con «Cerrar» (X) a la izquierda y el botón de envío en la barra.
- Banner rojo de error (si el envío falla) sobre el formulario.
- Campos «Correo electrónico» y «Nombre para mostrar»; bloque «Roles» con cuatro chips de filtro; bloque «Sedes» con un chip por sede activa «Nombre (CÓDIGO)».
- Botones «Cancelar» y «Crear invitación» (spinner mientras envía).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Correo electrónico» | Texto, teclado de correo | Sí («Este campo es obligatorio.») | Formato de correo válido, máx. 254 («Ingrese un correo electrónico válido.») | Sí (dato del personal) |
| «Nombre para mostrar» | Texto (mayúscula inicial por palabra), contador | Sí | Máx. 120 | Sí (se cifra en el servidor) |
| «Roles» | Selección múltiple: chips «Administrador», «Recepción», «Enfermería / MA», «Proveedor» | Sí, al menos uno («Seleccione al menos un rol.», tras intentar enviar) | — | No |
| «Sedes» | Selección múltiple de sedes activas | Sí, al menos una («Seleccione al menos una sede.») | Si las sedes no cargan, el error aparece en rojo; mientras cargan, barra de progreso | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Crear invitación» | Administrador | Valida y llama `UserService/InviteUser`. | No | Cierra; [S-ADM-02](10_pantallas_admin.md#p-adm--s-adm-02--usuarios) recarga y abre [S-ADM-04](10_pantallas_admin.md#p-adm--s-adm-04--dialogo-de-secreto-de-un-solo-uso-invitacion--token-de-restablecimiento). |
| «Cancelar» / X / atrás | Administrador | Cierra; deshabilitado mientras envía. | Con datos escritos: «¿Descartar cambios sin guardar?» («Tiene cambios sin guardar. Si sale ahora se perderán.», «Seguir editando» / «Descartar») | — |

No se cierra tocando fuera.

**Estados y mensajes**

- Envío en curso: chips y botones deshabilitados, spinner en el botón.
- Error del servidor en el banner: p. ej. «Este registro ya existe.» (correo ya usado por una cuenta que no está invitada), «Algunos campos no son válidos. Revíselos.», «No tiene permiso para realizar esta acción.»

**Tiempo real**

No aplica.

**Reglas de negocio**

- Solo se ofrecen sedes activas.
- El correo de una persona todavía Invitada reemite la invitación (token nuevo).
- Validación en vivo tras la primera interacción.

**Notas para el rediseño**

- Preservar la obligatoriedad de al menos un rol y una sede y la protección de cambios sin guardar.
- Preservar la pantalla completa en teléfono.
- Los errores de selección (roles, sedes) solo aparecen tras pulsar enviar, mientras que los campos de texto se validan al escribir.
- No se explica qué permite cada rol ni que la unión de roles suma permisos; sería útil una ayuda contextual.

**Código fuente:** `features/admin/presentation/users/invite_user_dialog.dart`, `features/admin/presentation/widgets/admin_dialog.dart`, `shared/validators/validators.dart`.

---

### <a id="p-adm--s-adm-04--dialogo-de-secreto-de-un-solo-uso-invitacion--token-de-restablecimiento"></a>S-ADM-04 Diálogo de secreto de un solo uso (invitación / token de restablecimiento)

**Ruta:** diálogo sobre `/admin/users` · **Tipo:** diálogo

**Propósito**

Mostrar una única vez el enlace o el token que el administrador debe entregar a mano a la persona.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Automático tras crear una invitación ([S-ADM-03](10_pantallas_admin.md#p-adm--s-adm-03--invitar-usuario)), «Crear restablecimiento de contraseña», restablecer la verificación en dos pasos de un usuario Activo, o «Emitir un token nuevo» ([S-ADM-08](10_pantallas_admin.md#p-adm--s-adm-08--restablecer-la-verificacion-en-dos-pasos)).

**Distribución**

- Título según el caso: «Invitación creada», «Restablecimiento de contraseña creado», «Verificación en dos pasos restablecida» o «Nuevo token de restablecimiento de contraseña».
- Texto explicativo con el nombre y la fecha y hora de vencimiento (zona horaria de la sede activa).
- Debajo, en letra pequeña, el aviso del portapapeles: «Al copiarlos, los códigos pasan al portapapeles de este dispositivo, que el historial o la sincronización del portapapeles pueden conservar. Péguelos enseguida en su gestor de contraseñas. La aplicación borra el portapapeles al continuar y lo intenta de nuevo al cabo de un minuto, pero algunos navegadores y dispositivos no lo permiten: si tiene dudas, copie otra cosa encima.» (el mismo texto de los códigos de recuperación, [S-GEN-08](05_pantallas_generales.md#p-gen--s-gen-08--guarde-sus-codigos-de-recuperacion-panel)).
- Una o dos filas: etiqueta («Enlace de invitación», «Token de invitación» o «Token de restablecimiento») + valor seleccionable en monoespaciado + botón «Copiar».
- Único botón «Cerrar».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Enlace de invitación» | Solo lectura | — | En web, la URL completa `<origen>/invite/<token>`; en Android solo la ruta `/invite/<token>` | Secreto de un solo uso |
| «Token de invitación» / «Token de restablecimiento» | Solo lectura, seleccionable | — | — | Secreto de un solo uso |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Copiar» | Administrador | Copia el valor al portapapeles y programa su retirada al cabo de un minuto. | No | Snackbar «Copiado al portapapeles.» |
| «Cerrar» | Administrador | Vacía el portapapeles (dentro del mismo toque, como exige la web) y cierra; el valor no puede volver a verse. | No | — |

No se cierra tocando fuera.

**Estados y mensajes**

- Invitación: «Compártalo con {name}. Se muestra una sola vez y vence el {expires}.»
- Contraseña: «Comparta este token con {name}. Se muestra una sola vez y vence el {expires}.»
- Verificación restablecida: «La contraseña de {name} ya no funciona y el inicio de sesión con Google queda cerrado para la cuenta hasta que entre con una nueva y vuelva a configurar la verificación en dos pasos. Entregue este token de restablecimiento de contraseña a {name} en persona o por un canal verificado: se muestra una sola vez y vence el {expires}…»; si estaba bloqueada, además «La verificación estaba bloqueada: regístrelo como incidente de seguridad y revise la actividad reciente de la cuenta.»
- Token nuevo: «Cualquier token de restablecimiento anterior de {name} deja de funcionar. Entregue este a {name} en persona o por un canal verificado: se muestra una sola vez y vence el {expires}…»

**Tiempo real**

No aplica.

**Reglas de negocio**

- El servidor devuelve el token una sola vez; emitir otro invalida el anterior.
- Para el restablecimiento de contraseña solo se muestra el token, no un enlace: la persona necesita abrir `/reset/<token>` ([S-GEN-10](05_pantallas_generales.md#p-gen--s-gen-10--restablecer-contrasena)).
- El portapapeles es el mismo que el de los secretos de la verificación en dos pasos ([S-GEN-07](05_pantallas_generales.md#p-gen--s-gen-07--configurar-la-verificacion-en-dos-pasos-inscripcion-obligatoria-al-iniciar-sesio)): se vacía al pulsar «Cerrar», al cabo de un minuto y si el diálogo desaparece de otro modo (por ejemplo con el botón atrás de Android). Solo se vigila el último valor copiado y, fuera de la web, solo se borra si el portapapeles aún lo contiene (si la persona copió otra cosa después, no se toca); en la web se vacía sin comprobar, y el navegador puede impedir el borrado del minuto o el de salida porque no salen de un toque.

**Notas para el rediseño**

- Preservar el cierre explícito (sin tocar fuera), el botón de copiar por valor, el aviso de un solo uso, la fecha de vencimiento, el aviso del portapapeles y su vaciado al cerrar.
- El aviso del portapapeles reutiliza el texto de los códigos de recuperación: habla de «los códigos», del «gestor de contraseñas» y de borrar «al continuar», aunque aquí se copia un enlace o un token y el botón es «Cerrar».
- La invitación muestra enlace + token, pero el restablecimiento solo el token; la pantalla de inicio de sesión no tiene dónde pegarlo, así que el administrador debe construir el enlace `/reset/<token>`.
- En Android el «enlace» es solo una ruta relativa, no compartible tal cual.
- No hay forma de enviarlo por un canal (correo o SMS) desde la app; la entrega es manual.

**Código fuente:** `features/admin/presentation/widgets/one_time_secret_dialog.dart`, `features/admin/presentation/users/users_page.dart`, `features/auth/presentation/mfa/sensitive_clipboard.dart`.

---

### <a id="p-adm--s-adm-05--editar-nombre"></a>S-ADM-05 Editar nombre

**Ruta:** diálogo sobre `/admin/users` · **Tipo:** diálogo

**Propósito**

Cambiar el nombre para mostrar de un usuario.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Menú «Más acciones» › «Editar nombre» en [S-ADM-02](10_pantallas_admin.md#p-adm--s-adm-02--usuarios).

**Distribución**

- Diálogo simple «Editar nombre» con un campo y los botones «Cancelar» / «Guardar».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Nombre para mostrar» | Texto, foco automático | Sí («Este campo es obligatorio.») | Máx. 120 | Sí (se cifra en el servidor) |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Guardar» | Administrador | Si el nombre no cambió, no hace nada; si cambió, `UserService/UpdateUser` con `expected_version`. | No | Recarga la lista (sin snackbar de éxito). |
| «Cancelar» | Administrador | Cierra sin preguntar. | No | — |

**Estados y mensajes**

- Errores en un snackbar de la página: conflicto de versión con la acción «Actualizar», u otros mensajes genéricos.

**Tiempo real**

No aplica.

**Reglas de negocio**

- Concurrencia optimista por la versión del usuario.

**Notas para el rediseño**

- No usa el marco de formularios de administración: no pasa a pantalla completa en teléfono, no avisa de cambios sin guardar, se puede cerrar tocando fuera y muestra los errores en un snackbar en lugar de dentro del diálogo.

**Código fuente:** `features/admin/presentation/users/users_page.dart`.

---

### <a id="p-adm--s-adm-06--editar-roles--editar-sedes-seleccion-multiple"></a>S-ADM-06 Editar roles / Editar sedes (selección múltiple)

**Ruta:** diálogo sobre `/admin/users` · **Tipo:** diálogo

**Propósito**

Asignar los roles de un usuario o las sedes donde puede trabajar.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | El servidor exige `assignRolesLocations`. |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Menú «Más acciones» › «Editar roles» o «Editar sedes» en [S-ADM-02](10_pantallas_admin.md#p-adm--s-adm-02--usuarios).

**Distribución**

- Diálogo simple (ancho 420) con el título «Editar roles» o «Editar sedes», una lista de casillas y los botones «Cancelar» / «Guardar».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| Roles | Casillas «Administrador», «Recepción», «Enfermería / MA», «Proveedor» | Al menos uno («Seleccione al menos un rol.») | — | No |
| Sedes | Casillas «Nombre (CÓDIGO)» de las sedes activas más las inactivas ya asignadas | Al menos una («Seleccione al menos una sede.») | — | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Guardar» | Administrador | Sin nada seleccionado muestra el error y no cierra; si no, `UserService/SetUserRoles` o `SetUserLocations` con `expected_version`. | No | Recarga la lista. |
| «Cancelar» | Administrador | Cierra sin cambios. | No | — |

**Estados y mensajes**

- Errores en snackbar: «Es el último administrador activo. Primero asigne el rol de administrador a otra persona.»; quitarse el propio rol Administrador → «Esta acción no está permitida en el estado actual.»; conflicto → texto + «Actualizar»; «Su propia sesión o su acceso de administrador terminó mientras este cambio esperaba, así que no se cambió nada. Vuelva a iniciar sesión.»

**Tiempo real**

No aplica (los cambios se ven en la sesión del usuario afectado al volver a entrar).

**Reglas de negocio**

- Permisos efectivos = unión de los roles, limitados a las sedes asignadas.
- Una sede inactiva ya asignada puede conservarse o quitarse, pero no añadirse.

**Notas para el rediseño**

- Preservar el mínimo de uno y el orden fijo de las opciones.
- Envía la petición aunque la selección no haya cambiado.
- No indica qué sedes están inactivas ni qué implica cada rol.

**Código fuente:** `features/admin/presentation/widgets/multi_select_dialog.dart`, `features/admin/presentation/users/users_page.dart`.

---

### <a id="p-adm--s-adm-07--confirmaciones-de-acciones-sobre-usuarios"></a>S-ADM-07 Confirmaciones de acciones sobre usuarios

**Ruta:** diálogo sobre `/admin/users` · **Tipo:** diálogo

**Propósito**

Confirmar acciones críticas o irreversibles sobre una cuenta.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Menú «Más acciones» › «Revocar invitación», «Cerrar sesión en todos los dispositivos», «Deshabilitar» o «Eliminar» en [S-ADM-02](10_pantallas_admin.md#p-adm--s-adm-02--usuarios).

**Distribución**

- Diálogo de confirmación genérico ([S-GEN-27](05_pantallas_generales.md#p-gen--s-gen-27--dialogo-de-confirmacion-generico)) con título, mensaje y los botones «Cancelar» / botón de confirmación rojo.

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Revocar invitación | Administrador | «¿Revocar la invitación de {name}?» / «El enlace de invitación dejará de funcionar. Podrá invitar a la persona de nuevo más tarde.» / botón «Revocar invitación». | Este diálogo | «Invitación revocada.» |
| Cerrar sesiones | Administrador | «¿Cerrar la sesión de {name} en todos los dispositivos?» / «Todas las sesiones activas de este usuario se revocan de inmediato. Conserva su cuenta y puede volver a iniciar sesión.» / botón «Cerrar sesión en todos los dispositivos». | Este diálogo | Snackbar con el número de sesiones cerradas. |
| Deshabilitar | Administrador | «¿Deshabilitar a {name}?» / «El usuario cierra sesión en todos los dispositivos de inmediato y ya no podrá iniciar sesión.» / botón «Deshabilitar». | Este diálogo | Chip «Deshabilitado». |
| Eliminar | Administrador | «¿Eliminar a {name}?» / «Esta acción no se puede deshacer. Todas las sesiones del usuario se revocan de inmediato.» / botón «Eliminar». | Este diálogo | «Usuario eliminado.» |
| «Cancelar» o tocar fuera | Administrador | No hace nada. | — | — |

**Estados y mensajes**

Sin estados propios; los errores se muestran en [S-ADM-02](10_pantallas_admin.md#p-adm--s-adm-02--usuarios).

**Tiempo real**

Las sesiones revocadas cierran sus WebSocket a través del canal de control del servidor.

**Reglas de negocio**

- Eliminar es un borrado lógico definitivo: no hay restauración desde la app (la recuperación de emergencia tampoco restaura eliminados).

**Notas para el rediseño**

- Preservar el botón destructivo en rojo y el texto que explica la consecuencia.
- Eliminar no pide escribir el nombre ni un motivo pese a ser irreversible; Reactivar sí pide motivo ([S-ADM-09](10_pantallas_admin.md#p-adm--s-adm-09--reactivar-usuario)).

**Código fuente:** `core/widgets/confirm_dialog.dart`, `features/admin/presentation/users/users_page.dart`.

---

### <a id="p-adm--s-adm-08--restablecer-la-verificacion-en-dos-pasos"></a>S-ADM-08 Restablecer la verificación en dos pasos

**Ruta:** diálogo sobre `/admin/users` · **Tipo:** diálogo

**Propósito**

Recuperar el acceso de alguien que perdió o cambió el teléfono o tiene la verificación bloqueada, tras confirmar su identidad; también elimina su contraseña y emite un token de restablecimiento.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Sobre usuarios Activos o Deshabilitados que no sean él mismo (opción oculta en la propia fila y en los Invitados; el servidor rechaza la propia cuenta). |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

- Menú «Más acciones» › «Restablecer la verificación en dos pasos» en [S-ADM-02](10_pantallas_admin.md#p-adm--s-adm-02--usuarios).
- Desde «Crear restablecimiento de contraseña» cuando ya hay un restablecimiento pendiente (se abre en la vista «pendiente»).

**Distribución**

- Diálogo simple (ancho 460) con icono rojo y el título «¿Restablecer la verificación en dos pasos de {name}?».
- Estado actual (`UserService/GetUserMfaStatus`): barra de progreso mientras carga; luego una línea o recuadros rojos de aviso.
- Texto explicativo largo: «Úselo cuando la persona perdió o cambió su teléfono, o tiene la verificación en dos pasos bloqueada, y solo después de confirmar su identidad (en persona o llamando a un número conocido). Su aplicación de autenticación, sus códigos de recuperación y su contraseña dejan de funcionar, se cierran todas sus sesiones…»
- Casilla de confirmación de la cuenta de Google (solo cuando aplica).
- Campo «Motivo»; mensaje de error en rojo si falla.
- Botones «Cancelar» y «Restablecer la verificación en dos pasos» (rojo, spinner al enviar).
- Vista alternativa «pendiente»: recuadro con el texto del restablecimiento pendiente, casilla de Google si aplica, botones «Cancelar» (o «Cerrar») y «Emitir un token nuevo».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Motivo» | Texto multilínea (2–4 líneas); pista «Por ejemplo: perdió el teléfono, identidad confirmada en persona» | Sí («Ingrese el motivo.») | Máx. 500; deshabilitado si no hay nada que restablecer | Sí (se guarda cifrado) |
| Casilla de Google | Casilla | Sí, cuando se muestra | Texto «{name} confirmó que nadie más puede usar su cuenta de Google, o no inicia sesión con Google.» (ayuda «Tras el restablecimiento, el inicio de sesión con Google pide la aplicación de autenticación nueva…») o, si hubo códigos erróneos vía Google, «La cuenta de Google de {name} ya está asegurada (contraseña nueva y todas sus sesiones cerradas).» | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Restablecer la verificación en dos pasos» | Administrador; deshabilitado mientras carga, si no está inscrito o si falta la casilla de Google | `UserService/ResetUserMfa` (motivo, cuenta de Google asegurada). | Este diálogo | Cierra, recarga la lista, muestra [S-ADM-04](10_pantallas_admin.md#p-adm--s-adm-04--dialogo-de-secreto-de-un-solo-uso-invitacion--token-de-restablecimiento) «Verificación en dos pasos restablecida» (solo si el usuario es Activo y llega el token) y el snackbar «Se restableció la verificación en dos pasos de {name}.» |
| — si la llamada falla | — | Vuelve a leer el estado. | — | Si el restablecimiento sí se hizo, pasa a la vista pendiente con «El restablecimiento se completó, pero ningún token de restablecimiento llegó a esta pantalla…»; si no, muestra el error. |
| «Emitir un token nuevo» (vista pendiente) | Administrador; solo usuario Activo, tras la casilla de Google si aplica | `UserService/CreatePasswordReset`. | No | [S-ADM-04](10_pantallas_admin.md#p-adm--s-adm-04--dialogo-de-secreto-de-un-solo-uso-invitacion--token-de-restablecimiento) «Nuevo token de restablecimiento de contraseña». |
| «Cancelar» | Administrador | Cierra (también se cierra tocando fuera). | No | — |

**Estados y mensajes**

- No inscrito: «{name} no tiene verificación en dos pasos que restablecer.» (botón deshabilitado).
- Activa: «Configurada el {date}. Códigos de recuperación sin usar: {count}.»
- Bloqueada (recuadro rojo): «Bloqueada desde el {date} tras 10 códigos erróneos seguidos, escritos por alguien que ya había pasado el paso de la contraseña (o de Google). Salvo que los haya escrito {name}, trátelo como un incidente de seguridad…» + el origen: vía contraseña «Llegaron tras una contraseña correcta: quien los escribió la conoce.»; vía sesión «Llegaron desde una sesión iniciada de {name}: alguien tuvo su dispositivo o su sesión.»; vía Google «Llegaron tras un inicio de sesión con Google: quien los escribió controla la cuenta de Google de {name}…»
- Códigos erróneos vía Google sin bloqueo por esa vía: recuadro «Algunos de los códigos erróneos desde el último correcto llegaron tras un inicio de sesión con Google…»
- Pendiente: «Restablecida el {date}, pendiente de {name}: hasta que fije una contraseña nueva con el token de restablecimiento, inicie sesión con ella y vuelva a configurar la verificación en dos pasos, la cuenta sigue cerrada… Si el token se perdió o venció, emita uno nuevo.»; usuario no Activo: «Podrá emitir un token nuevo cuando la cuenta vuelva a estar activa.» (sin botón de emitir).
- Estado ilegible: no se muestra la línea de estado, el restablecimiento sigue disponible y se pide la casilla de Google si el inicio con Google puede estar activo.

**Tiempo real**

No aplica (el servidor revoca todas las sesiones de la persona).

**Reglas de negocio**

- Efectos: invalida la aplicación de autenticación, los códigos de recuperación y la contraseña; cierra todas sus sesiones; cualquier otra entrada (también Google) queda cerrada hasta que fije una contraseña nueva e inscriba de nuevo la verificación, sea cual sea su rol.
- La casilla de Google se exige si hubo códigos erróneos vía Google, o si el inicio con Google puede estar activo y la verificación es opcional para esa persona (o su estado es desconocido); se registra en la auditoría `user.mfa_reset`.
- Mientras un restablecimiento está pendiente no se puede hacer otro: solo emitir un token nuevo.
- Las operaciones sobre el conjunto de administradores están serializadas en el servidor (`caller_access_revoked`).

**Notas para el rediseño**

- Preservar la lectura del estado antes de actuar, los recuadros de bloqueo con su origen, la casilla de Google obligatoria condicional, el motivo obligatorio, la recuperación ante una respuesta perdida y la entrega única del token.
- No usa el marco de formularios de administración: no pasa a pantalla completa en teléfono, se cierra tocando fuera y no avisa de cambios sin guardar pese a tener un motivo escrito.
- Textos muy largos en un diálogo de 460 px; considerar pasos o un panel lateral para mejorar la lectura.

**Código fuente:** `features/admin/presentation/users/reset_mfa_dialog.dart`, `features/admin/presentation/users/users_page.dart`, `features/admin/infrastructure/user_gateway.dart`.

---

### <a id="p-adm--s-adm-09--reactivar-usuario"></a>S-ADM-09 Reactivar usuario

**Ruta:** diálogo sobre `/admin/users` · **Tipo:** diálogo

**Propósito**

Devolver a Activo una cuenta deshabilitada (por ejemplo, una recontratación), con motivo obligatorio.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Solo filas Deshabilitado. |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Menú «Más acciones» › «Reactivar» en [S-ADM-02](10_pantallas_admin.md#p-adm--s-adm-02--usuarios).

**Distribución**

- Diálogo «¿Reactivar a {name}?» (pantalla completa en teléfono).
- Texto: «La cuenta vuelve a estar activa con sus roles y sedes. Su contraseña anterior deja de funcionar y, si tenía verificación en dos pasos, se restablece: cree después un restablecimiento de contraseña…»
- Campo «Motivo» y botones «Cancelar» / «Reactivar».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Motivo» | Texto multilínea (2–4 líneas); ayuda «Obligatorio (por ejemplo, recontratación). Se guarda cifrado en la auditoría y lo ven los administradores: no incluya información de pacientes.» | Sí | Máx. 500 | Sí (cifrado en la auditoría) |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Reactivar» | Administrador | `UserService/ReactivateUser` (motivo, `expected_version`). | Este diálogo | Cierra y [S-ADM-02](10_pantallas_admin.md#p-adm--s-adm-02--usuarios) muestra un snackbar con la acción «Crear restablecimiento de contraseña». |
| «Cancelar» / X | Administrador | Cierra. | Con motivo escrito: «¿Descartar cambios sin guardar?» | — |

No se cierra tocando fuera.

**Estados y mensajes**

- Error en banner rojo: p. ej. «Solo se pueden reactivar usuarios deshabilitados. Actualice la lista.» o el conflicto de versión.

**Tiempo real**

No aplica.

**Reglas de negocio**

- Solo Deshabilitado → Activo; la contraseña anterior deja de funcionar, así que hace falta un restablecimiento de contraseña para entrar.
- El motivo se guarda cifrado en la auditoría (`user.reactivated`) y se muestra descifrado a los administradores en [S-ADM-27](10_pantallas_admin.md#p-adm--s-adm-27--entrada-de-auditoria-detalle).

**Notas para el rediseño**

- Preservar el aviso de no incluir PHI en el motivo y la acción encadenada hacia el restablecimiento de contraseña.
- El siguiente paso obligatorio (crear el restablecimiento) solo se ofrece en un snackbar efímero; si se pierde, hay que buscar la opción en el menú.

**Código fuente:** `features/admin/presentation/users/reactivate_user_dialog.dart`, `features/admin/presentation/widgets/admin_dialog.dart`.

---

### <a id="p-adm--s-adm-10--sedes"></a>S-ADM-10 Sedes

**Ruta:** `/admin/locations` · **Tipo:** página

**Propósito**

Crear, editar, activar y desactivar las sedes de la clínica (código, nombre, zona horaria, contacto).

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Guarda de rol + permiso `manageLocations`. |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Administración › «Sedes»; también el botón «Administrar sedes» de Seleccionar sede cuando el Administrador no tiene sedes ([S-GEN-11](05_pantallas_generales.md#p-gen--s-gen-11--seleccionar-sede)).

**Distribución**

- Encabezado: «Sedes», subtítulo «Sedes de la clínica, su zona horaria y datos de contacto.»; icono «Actualizar» y botón «Nueva sede».
- Tabla: «Código», «Nombre», «Zona horaria», «Teléfono», «Estado», «Acciones»; en teléfono, tarjetas con «Nombre · CÓDIGO», zona horaria, dirección, teléfono, chip y menú.

**Campos**

Sin campos de filtro; los datos de cada sede se editan en [S-ADM-11](10_pantallas_admin.md#p-adm--s-adm-11--nueva-sede--editar-sede).

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Nueva sede» | Administrador | Abre el formulario en modo creación. | — | [S-ADM-11](10_pantallas_admin.md#p-adm--s-adm-11--nueva-sede--editar-sede); al terminar, snackbar «Guardado.» |
| Tocar una fila o «Más acciones» › «Editar» | Administrador | Abre el formulario en modo edición. | — | [S-ADM-11](10_pantallas_admin.md#p-adm--s-adm-11--nueva-sede--editar-sede); «Guardado.» |
| › «Desactivar» (sede activa) | Administrador | `LocationService/SetLocationActive(false)` con `expected_version`. | «¿Desactivar {name}?» / «El personal no podrá trabajar en esta sede hasta que se active de nuevo. El historial se conserva.» / botón rojo «Desactivar» | Chip «Inactivo» (sin snackbar). |
| › «Activar» (sede inactiva) | Administrador | `SetLocationActive(true)`. | No | Chip «Activo» (sin snackbar). |
| «Actualizar» | Administrador | Recarga `ListLocations` y la lista de sedes de la cabecera. | No | Barra fina. |

**Estados y mensajes**

- Cargando / error con «Reintentar» / barra fina al recargar.
- Vacío: «Aún no hay sedes. Cree la primera.» + botón «Nueva sede».
- Chips: «Activo» (verde) / «Inactivo» (gris).
- Errores de activar o desactivar en snackbar; conflicto con la acción «Actualizar».

**Tiempo real**

Sin eventos en vivo; tras cada cambio se invalidan la lista y las sedes propias del usuario (el selector de sede de la cabecera se actualiza).

**Reglas de negocio**

- Se listan todas las sedes, incluidas las inactivas.
- Desactivar no borra el historial; el personal no puede operar en una sede inactiva.
- Concurrencia optimista por la versión de la sede.

**Notas para el rediseño**

- Preservar la confirmación al desactivar y el chip de estado con texto.
- La dirección solo se ve en teléfono (la tabla no tiene columna «Dirección»).
- Activar no confirma ni avisa del éxito; desactivar tampoco avisa del éxito.

**Código fuente:** `features/admin/presentation/locations/locations_page.dart`, `features/admin/infrastructure/admin_location_gateway.dart`.

---

### <a id="p-adm--s-adm-11--nueva-sede--editar-sede"></a>S-ADM-11 Nueva sede / Editar sede

**Ruta:** diálogo sobre `/admin/locations` · **Tipo:** diálogo

**Propósito**

Capturar los datos de una sede.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

«Nueva sede», tocar una fila o «Editar» en [S-ADM-10](10_pantallas_admin.md#p-adm--s-adm-10--sedes).

**Distribución**

- Diálogo «Nueva sede» o «Editar sede» (pantalla completa en teléfono); banner de error; campos; botones «Cancelar» y «Crear» / «Guardar».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Código» | Texto; se convierte a mayúsculas y solo admite letras A–Z, máx. 8; pista «p. ej. LAN» | Sí | Patrón de 2 a 8 letras mayúsculas: «Use de 2 a 8 letras mayúsculas (p. ej. LAN).»; solo editable al crear | No |
| «Nombre» | Texto | Sí | Máx. 120 | No |
| «Zona horaria» | Campo de solo lectura que abre [S-ADM-12](10_pantallas_admin.md#p-adm--s-adm-12--selector-de-zona-horaria) | Sí | Debe ser una zona IANA conocida: «Seleccione una zona horaria IANA válida.»; por defecto la de la sede activa (o `America/Chicago`) | No |
| «Dirección» | Texto de 2 líneas | No | Máx. 250 | No |
| «Teléfono» | Teclado telefónico | No | Máx. 30 (sin formato validado) | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Crear» | Administrador | `LocationService/CreateLocation`. | No | Cierra; «Guardado.» |
| «Guardar» | Administrador | `LocationService/UpdateLocation` con `expected_version` (el código no se envía). | No | Cierra; «Guardado.» |
| «Cancelar» / X | Administrador | Cierra. | Con cambios: «¿Descartar cambios sin guardar?» | — |

No se cierra tocando fuera.

**Estados y mensajes**

- Envío: campos deshabilitados y spinner.
- Error del servidor en el banner: p. ej. «Este registro ya existe.» (código duplicado) o el conflicto «Este registro fue actualizado por otro usuario…».

**Tiempo real**

No aplica.

**Reglas de negocio**

- El código es inmutable y aparece en las URL `/app/<código>/…` y en los códigos humanos (p. ej. `LAN-P-000001`).
- La zona horaria de la sede gobierna las fechas de citas y reportes de esa sede.

**Notas para el rediseño**

- Preservar la inmutabilidad del código y el selector IANA con buscador.
- El teléfono no tiene formato ni máscara.

**Código fuente:** `features/admin/presentation/locations/location_form_dialog.dart`, `features/admin/presentation/widgets/admin_dialog.dart`.

---

### <a id="p-adm--s-adm-12--selector-de-zona-horaria"></a>S-ADM-12 Selector de zona horaria

**Ruta:** diálogo sobre [S-ADM-11](10_pantallas_admin.md#p-adm--s-adm-11--nueva-sede--editar-sede) o sobre un ajuste de tipo zona horaria ([S-ADM-31](10_pantallas_admin.md#p-adm--s-adm-31--configuracion--ajustes-campo-de-ajuste)) · **Tipo:** diálogo

**Propósito**

Elegir una zona IANA de la base de datos incluida en la app.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Tocar el campo «Zona horaria».

**Distribución**

- Diálogo «Zona horaria» (420 × 480): campo «Buscar zona horaria» con lupa, lista desplazable de zonas (la actual resaltada) y el botón «Cancelar».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Buscar zona horaria» | Texto libre | No | Filtra por subcadena sin distinguir mayúsculas; los espacios se tratan como «\_» | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Tocar una zona | Administrador | La selecciona y cierra. | No | Campo relleno. |
| «Cancelar» | Administrador | Cierra sin cambios. | — | — |

**Estados y mensajes**

- Sin coincidencias: lista vacía (sin mensaje).

**Tiempo real**

No aplica.

**Reglas de negocio**

- Solo nombres IANA (p. ej. `America/New_York`); no muestra el desfase UTC.

**Notas para el rediseño**

- La lista vacía no tiene mensaje; no se muestran desfases ni nombres amigables; considerar agrupar por región.

**Código fuente:** `features/admin/presentation/widgets/timezone_picker_field.dart`.

---

### <a id="p-adm--s-adm-13--catalogos--tipos-de-cita-patron-crud-comun-de-catalogos"></a>S-ADM-13 Catálogos › Tipos de cita (patrón CRUD común de catálogos)

**Ruta:** `/admin/catalog/appointment-types` · **Tipo:** página

**Propósito**

Mantener los tipos de cita que usa la agenda (nombre bilingüe, duración por defecto, ruta sugerida, orden). Define además el patrón que comparten todas las pantallas de catálogo ([S-ADM-14](10_pantallas_admin.md#p-adm--s-adm-14--catalogos--procedimientos) a [S-ADM-23](10_pantallas_admin.md#p-adm--s-adm-23--reglas-de-bono)).

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Guarda de rol + permiso `manageCatalog`. |
| Recepción | Sin acceso a esta pantalla | Lee los tipos de cita en la agenda y el registro de llegada. |
| Enfermería / asistente médico | Sin acceso a esta pantalla | — |
| Proveedor | Sin acceso a esta pantalla | Los lee en la agenda. |

Las lecturas (`List*` / `Get*` de `CatalogService`) están abiertas a cualquier usuario autenticado porque las usan otras pantallas; las escrituras son solo de Administrador.

**Cómo se llega**

Administración › «Catálogos» (abre Tipos de cita); chips del selector de catálogos.

**Distribución**

- Encabezado: título del catálogo («Tipos de cita»); a la derecha, chip «Mostrar inactivos», icono «Actualizar» y botón «Nuevo» (en teléfono el chip baja bajo el encabezado y «Nuevo» pasa a botón flotante +).
- Selector de catálogos (chips desplazables horizontalmente): «Tipos de cita», «Procedimientos», «Pruebas de laboratorio», «Proveedores de laboratorio», «Fuentes de referido», «Planes de membresía», «Reglas de bono».
- Tabla: «Código», «Nombre (EN)», «Nombre (ES)», «Duración predeterminada» («{n} min»), «Ruta sugerida», «Orden», «Estado», «Acciones»; en teléfono, tarjetas con «Etiqueta: valor» por cada columna no vacía.

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| Chip «Mostrar inactivos» | Conmutador | No | Recarga incluyendo inactivos | No |
| Formulario ([S-ADM-19](10_pantallas_admin.md#p-adm--s-adm-19--formulario-de-catalogo-nuevo-catalogo--editar-catalogo)): «Código» | Código | Sí | Ver [S-ADM-19](10_pantallas_admin.md#p-adm--s-adm-19--formulario-de-catalogo-nuevo-catalogo--editar-catalogo); solo al crear | No |
| «Nombre (EN)» / «Nombre (ES)» | Texto | Sí | Longitud máxima del campo | No |
| «Duración predeterminada (opcional)» | Entero con sufijo «min» | No | 1 a 1440 | No |
| «Ruta sugerida (opcional)» | Desplegable «—», «Estándar», «Solo inyección», «Solo laboratorio», «Solo procedimiento» | No | — | No |
| «Orden (opcional)» | Entero | No | 0 a 100000 | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Nuevo» / botón flotante | Administrador | Abre [S-ADM-19](10_pantallas_admin.md#p-adm--s-adm-19--formulario-de-catalogo-nuevo-catalogo--editar-catalogo) en modo creación → `CatalogService/CreateAppointmentType`. | — | Snackbar «Guardado.» |
| Tocar una fila o «Más acciones» › «Editar» | Administrador | [S-ADM-19](10_pantallas_admin.md#p-adm--s-adm-19--formulario-de-catalogo-nuevo-catalogo--editar-catalogo) en edición → `UpdateAppointmentType` (vaciar duración o ruta las borra). | — | «Guardado.» |
| › «Desactivar» | Administrador | `SetAppointmentTypeActive(false)` con `expected_version`. | [S-ADM-20](10_pantallas_admin.md#p-adm--s-adm-20--confirmacion-desactivar-nombre-catalogos) | Fila «Inactivo» (oculta salvo con «Mostrar inactivos»). |
| › «Activar» | Administrador | `SetAppointmentTypeActive(true)`. | No | Fila «Activo». |
| «Actualizar» | Administrador | Recarga. | No | Barra fina. |

**Estados y mensajes**

- Cargando / error con «Reintentar» / barra fina al recargar (se mantienen las filas).
- Vacío: «Aún no hay entradas.» + botón «Nuevo».
- Chips «Activo» (verde) / «Inactivo» (gris).
- Errores de activar y desactivar en snackbar; conflicto con «Actualizar».

**Tiempo real**

Sin eventos en vivo; recarga tras cada modificación propia o con «Actualizar».

**Reglas de negocio**

- El nombre mostrado en títulos y confirmaciones depende del idioma de la interfaz (en español se usa «Nombre (ES)» si no está vacío).
- Inactivo = oculto al personal en los selectores, conservado en el historial; nunca se borra.
- La ruta sugerida orienta el circuito de la visita al registrar la llegada (solo inyección, solo laboratorio, etc.).
- El estado de «Mostrar inactivos» se conserva durante la sesión; las listas se limpian al cerrar sesión.

**Notas para el rediseño**

- Preservar el patrón común: lista + chip de inactivos + «Nuevo» + menú por fila + confirmación solo al desactivar.
- El selector de catálogos incluye «Planes de membresía» y «Reglas de bono», que también tienen destino propio en la navegación; y el destino «Catálogos» no queda resaltado en las demás sub-pantallas.
- Sin búsqueda ni ordenación por columna; el orden lo da el campo «Orden».
- Activar no confirma ni avisa del éxito.
- La duración por defecto admite 1–1440 min, mientras que una cita exige 5–480 ([S-REC-10](07_pantallas_recepcion.md#p-rec--s-rec-10--formulario-nueva-cita--editar-cita)).

**Código fuente:** `features/admin/presentation/catalogs/catalog_pages.dart`, `catalog_crud_page.dart`, `features/admin/application/catalog_descriptors.dart`, `catalog_list_notifier.dart`, `catalog_providers.dart`, `features/admin/infrastructure/catalog_gateway.dart`.

---

### <a id="p-adm--s-adm-14--catalogos--procedimientos"></a>S-ADM-14 Catálogos › Procedimientos

**Ruta:** `/admin/catalog/procedures` · **Tipo:** página

**Propósito**

Mantener los procedimientos facturables y su precio de venta.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Permiso `manageProceduresLabs`. |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso a esta pantalla | Elige procedimientos al crear órdenes ([S-CLI-18](08_pantallas_clinicas.md#p-cli--s-cli-18--dialogo-nueva-orden)). |

**Cómo se llega**

Chip «Procedimientos» del selector de catálogos.

**Distribución**

- Igual que [S-ADM-13](10_pantallas_admin.md#p-adm--s-adm-13--catalogos--tipos-de-cita-patron-crud-comun-de-catalogos). Columnas: «Código», «Nombre (EN)», «Nombre (ES)», «Precio de venta» (moneda formateada), «Orden», «Estado», «Acciones».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Código» | Código (solo al crear) | Sí | Ver [S-ADM-19](10_pantallas_admin.md#p-adm--s-adm-19--formulario-de-catalogo-nuevo-catalogo--editar-catalogo) | No |
| «Nombre (EN)» / «Nombre (ES)» | Texto | Sí | Longitud máxima | No |
| «Precio de venta» | Monto con sufijo «USD» | Sí | Hasta 2 decimales: «Ingrese un monto válido con hasta dos decimales (p. ej. 25.00).» | No |
| «Orden (opcional)» | Entero | No | 0 a 100000 | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Crear / Editar / Desactivar / Activar | Administrador | Como [S-ADM-13](10_pantallas_admin.md#p-adm--s-adm-13--catalogos--tipos-de-cita-patron-crud-comun-de-catalogos), con `CatalogService/CreateProcedure`, `UpdateProcedure` y `SetProcedureActive`. | Solo al desactivar ([S-ADM-20](10_pantallas_admin.md#p-adm--s-adm-20--confirmacion-desactivar-nombre-catalogos)) | «Guardado.» |

**Estados y mensajes**

- Como [S-ADM-13](10_pantallas_admin.md#p-adm--s-adm-13--catalogos--tipos-de-cita-patron-crud-comun-de-catalogos).

**Tiempo real**

Sin eventos en vivo.

**Reglas de negocio**

- Los montos se envían como dinero en centavos (USD), nunca como decimales de coma flotante.
- El precio de venta es la base del cargo estimado de las órdenes ([S-CLI-17](08_pantallas_clinicas.md#p-cli--s-cli-17--seccion-ordenes-de-la-visita)).

**Notas para el rediseño**

- Mostrar siempre la moneda; preservar el teclado decimal y el filtro de caracteres (dígitos y punto).

**Código fuente:** `features/admin/presentation/catalogs/catalog_pages.dart`, `features/admin/application/catalog_descriptors.dart`.

---

### <a id="p-adm--s-adm-15--catalogos--pruebas-de-laboratorio"></a>S-ADM-15 Catálogos › Pruebas de laboratorio

**Ruta:** `/admin/catalog/labs` · **Tipo:** página

**Propósito**

Mantener las pruebas de laboratorio y su precio de venta predeterminado, y acceder a sus precios por proveedor.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Permiso `manageProceduresLabs`. |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso a esta pantalla | Elige pruebas al crear órdenes. |

**Cómo se llega**

Chip «Pruebas de laboratorio» del selector de catálogos.

**Distribución**

- Igual que [S-ADM-13](10_pantallas_admin.md#p-adm--s-adm-13--catalogos--tipos-de-cita-patron-crud-comun-de-catalogos). Columnas: «Código», «Nombre (EN)», «Nombre (ES)», «Precio de venta predeterminado», «Orden», «Estado», «Acciones».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Código» | Código (solo al crear) | Sí | Ver [S-ADM-19](10_pantallas_admin.md#p-adm--s-adm-19--formulario-de-catalogo-nuevo-catalogo--editar-catalogo) | No |
| «Nombre (EN)» / «Nombre (ES)» | Texto | Sí | Longitud máxima | No |
| «Precio de venta predeterminado» | Monto USD | Sí | Hasta 2 decimales | No |
| «Orden (opcional)» | Entero | No | 0 a 100000 | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Crear / Editar / Desactivar / Activar | Administrador | Con `CatalogService/CreateLabTest`, `UpdateLabTest` y `SetLabTestActive`. | Solo al desactivar | «Guardado.» |
| «Más acciones» › «Precios por proveedor» | Administrador | Navega a `/admin/catalog/labs/<id>/prices`. | No | [S-ADM-16](10_pantallas_admin.md#p-adm--s-adm-16--precios-por-proveedor--prueba). |

**Estados y mensajes**

- Como [S-ADM-13](10_pantallas_admin.md#p-adm--s-adm-13--catalogos--tipos-de-cita-patron-crud-comun-de-catalogos).

**Tiempo real**

Sin eventos en vivo.

**Reglas de negocio**

- El precio predeterminado es el de venta cuando no aplica una ventana de precio por proveedor (definidas en [S-ADM-16](10_pantallas_admin.md#p-adm--s-adm-16--precios-por-proveedor--prueba)).

**Notas para el rediseño**

- La acción «Precios por proveedor» solo está dentro del menú ⋮ (tocar la fila edita); hacerla más visible.

**Código fuente:** `features/admin/presentation/catalogs/catalog_pages.dart`, `features/admin/application/catalog_descriptors.dart`.

---

### <a id="p-adm--s-adm-16--precios-por-proveedor--prueba"></a>S-ADM-16 Precios por proveedor · {prueba}

**Ruta:** `/admin/catalog/labs/<labTestId>/prices` · **Tipo:** página

**Propósito**

Definir ventanas de costo y precio por proveedor de laboratorio para una prueba.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Guarda `managePricing`. |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

«Precios por proveedor» en el menú de una prueba ([S-ADM-15](10_pantallas_admin.md#p-adm--s-adm-15--catalogos--pruebas-de-laboratorio)). La flecha atrás vuelve a `/admin/catalog/labs`.

**Distribución**

- Encabezado con flecha atrás, título «Precios por proveedor · {nombre de la prueba}» («Precios por proveedor» mientras carga) y subtítulo = código de la prueba; chip «Mostrar vencidos», «Actualizar», «Nuevo». Sin selector de catálogos.
- Tabla: «Proveedor de laboratorio», «Código externo», «Costo interno», «Precio de venta», «Vigente desde», «Vigente hasta», «Estado», «Acciones».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Proveedor de laboratorio» | Desplegable de proveedores activos «Nombre (CÓDIGO)» | Sí | No editable tras crear | No |
| «Código externo (opcional)» | Texto | No | Máx. 64 | No |
| «Costo interno» | Monto USD | Sí | Hasta 2 decimales | No |
| «Precio de venta» | Monto USD | Sí | Hasta 2 decimales | No |
| «Vigente desde» | Fecha `AAAA-MM-DD` (texto o calendario «Elegir fecha», 2000–2100) | Sí | «Ingrese una fecha como AAAA-MM-DD.»; no editable tras crear | No |
| «Vigente hasta (opcional)» | Fecha | No | Igual o posterior a «Vigente desde»: «La fecha final debe ser igual o posterior a la inicial.» | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Nuevo» | Administrador | [S-ADM-19](10_pantallas_admin.md#p-adm--s-adm-19--formulario-de-catalogo-nuevo-catalogo--editar-catalogo) (mientras cargan los proveedores el botón de envío está deshabilitado y hay barra de progreso) → `CatalogService/UpsertLabProviderPrice` con versión 0. | — | «Guardado.» |
| Editar | Administrador | `UpsertLabProviderPrice` sobre la clave natural (prueba, proveedor, vigente desde) con la versión actual. | — | «Guardado.» |
| «Mostrar vencidos» | Administrador | Incluye las ventanas cuya fecha «Vigente hasta» ya pasó. | No | Lista ampliada. |

No hay Activar ni Desactivar: una ventana se cierra fijando «Vigente hasta».

**Estados y mensajes**

- Chip «Activo» = ventana vigente (sin fin, o fin igual o posterior a hoy); «Inactivo» = vencida.
- Resto como [S-ADM-13](10_pantallas_admin.md#p-adm--s-adm-13--catalogos--tipos-de-cita-patron-crud-comun-de-catalogos).

**Tiempo real**

Sin eventos en vivo.

**Reglas de negocio**

- Clave natural (prueba, proveedor, vigente desde): crear con la misma clave actualiza la ventana existente o choca con ella.
- Se conserva el historial de precios; los nombres de proveedores inactivos se siguen resolviendo en las filas antiguas.
- El estado vigente se calcula con la fecha del dispositivo, no con la de la sede.
- El precio del proveedor vigente en el día de la sede es el que usa «Nueva orden» ([S-CLI-18](08_pantallas_clinicas.md#p-cli--s-cli-18--dialogo-nueva-orden)); el costo interno solo lo ve el Administrador.

**Notas para el rediseño**

- El filtro dice «Mostrar vencidos» pero los chips dicen «Activo» / «Inactivo».
- Preservar el bloqueo del proveedor y de la fecha de inicio en edición y la validación del orden de fechas.

**Código fuente:** `features/admin/presentation/catalogs/catalog_pages.dart`, `features/admin/application/catalog_descriptors.dart`, `features/admin/domain/catalog_validation.dart`.

---

### <a id="p-adm--s-adm-17--catalogos--proveedores-de-laboratorio"></a>S-ADM-17 Catálogos › Proveedores de laboratorio

**Ruta:** `/admin/catalog/lab-providers` · **Tipo:** página

**Propósito**

Mantener los laboratorios externos.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Permiso `manageProceduresLabs`. |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso a esta pantalla | Elige «Laboratorio proveedor» al crear órdenes. |

**Cómo se llega**

Chip «Proveedores de laboratorio» del selector de catálogos.

**Distribución**

- Igual que [S-ADM-13](10_pantallas_admin.md#p-adm--s-adm-13--catalogos--tipos-de-cita-patron-crud-comun-de-catalogos). Columnas: «Código», «Nombre», «Estado», «Acciones».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Código» | Código (solo al crear) | Sí | Ver [S-ADM-19](10_pantallas_admin.md#p-adm--s-adm-19--formulario-de-catalogo-nuevo-catalogo--editar-catalogo) | No |
| «Nombre» | Texto (único, no bilingüe) | Sí | Máx. 120 | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Crear / Editar / Desactivar / Activar | Administrador | Con `CreateLabProvider`, `UpdateLabProvider` y `SetLabProviderActive`. | Solo al desactivar | «Guardado.» |

**Estados y mensajes**

- Como [S-ADM-13](10_pantallas_admin.md#p-adm--s-adm-13--catalogos--tipos-de-cita-patron-crud-comun-de-catalogos).

**Tiempo real**

Sin eventos en vivo.

**Reglas de negocio**

- Un proveedor inactivo deja de ofrecerse al crear precios ([S-ADM-16](10_pantallas_admin.md#p-adm--s-adm-16--precios-por-proveedor--prueba)).

**Notas para el rediseño**

- Es el único catálogo con nombre no bilingüe; mantener la coherencia visual con los demás.

**Código fuente:** `features/admin/presentation/catalogs/catalog_pages.dart`, `features/admin/application/catalog_descriptors.dart`.

---

### <a id="p-adm--s-adm-18--catalogos--fuentes-de-referido"></a>S-ADM-18 Catálogos › Fuentes de referido

**Ruta:** `/admin/catalog/referral-sources` · **Tipo:** página

**Propósito**

Mantener las opciones de «cómo nos conoció» del paciente, usadas en el alta de pacientes y en los reportes.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Permiso `manageCatalog`. |
| Recepción | Sin acceso a esta pantalla | Elige la fuente al crear un paciente ([S-PAC-02](06_pantallas_pacientes.md#p-pac--s-pac-02--nuevo-paciente)). |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Chip «Fuentes de referido» del selector de catálogos.

**Distribución**

- Igual que [S-ADM-13](10_pantallas_admin.md#p-adm--s-adm-13--catalogos--tipos-de-cita-patron-crud-comun-de-catalogos). Columnas: «Código», «Nombre (EN)», «Nombre (ES)», «Orden», «Estado», «Acciones».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Código» | Código (solo al crear) | Sí | Ver [S-ADM-19](10_pantallas_admin.md#p-adm--s-adm-19--formulario-de-catalogo-nuevo-catalogo--editar-catalogo) | No |
| «Nombre (EN)» / «Nombre (ES)» | Texto | Sí | Longitud máxima | No |
| «Orden (opcional)» | Entero | No | 0 a 100000 | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Crear / Editar / Desactivar / Activar | Administrador | Con `CreateReferralSource`, `UpdateReferralSource` y `SetReferralSourceActive`. | Solo al desactivar | «Guardado.» |

**Estados y mensajes**

- Como [S-ADM-13](10_pantallas_admin.md#p-adm--s-adm-13--catalogos--tipos-de-cita-patron-crud-comun-de-catalogos).

**Tiempo real**

Sin eventos en vivo.

**Reglas de negocio**

- Los reportes resuelven también las fuentes inactivas en los días pasados ([S-CAJ-19](09_pantallas_caja.md#p-caj--s-caj-19--pestana-diario-reporte-diario-de-una-sede)).

**Notas para el rediseño**

- Vocabulario distinto entre pantallas: aquí «Fuentes de referido», en los reportes «Fuentes de referencia de pacientes nuevos» y en el alta de paciente «Fuente de referencia».

**Código fuente:** `features/admin/presentation/catalogs/catalog_pages.dart`, `features/admin/application/catalog_descriptors.dart`.

---

### <a id="p-adm--s-adm-19--formulario-de-catalogo-nuevo-catalogo--editar-catalogo"></a>S-ADM-19 Formulario de catálogo «Nuevo: {catálogo}» / «Editar: {catálogo}»

**Ruta:** diálogo sobre [S-ADM-13](10_pantallas_admin.md#p-adm--s-adm-13--catalogos--tipos-de-cita-patron-crud-comun-de-catalogos) a [S-ADM-18](10_pantallas_admin.md#p-adm--s-adm-18--catalogos--fuentes-de-referido), [S-ADM-21](10_pantallas_admin.md#p-adm--s-adm-21--planes-de-membresia), [S-ADM-22](10_pantallas_admin.md#p-adm--s-adm-22--beneficios--plan) y [S-ADM-23](10_pantallas_admin.md#p-adm--s-adm-23--reglas-de-bono) · **Tipo:** diálogo

**Propósito**

Formulario genérico que se genera a partir de la descripción de cada catálogo.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

«Nuevo», botón flotante +, tocar una fila o «Editar».

**Distribución**

- Diálogo (560) o pantalla completa en teléfono; título «Nuevo: {catálogo}» o «Editar: {catálogo}».
- Barra de progreso si se cargan opciones dinámicas (proveedores, sedes); banner rojo de error general.
- Campos en el orden definido para el catálogo; los opcionales llevan «(opcional)» en la etiqueta; botones «Cancelar» y «Crear» / «Guardar».

**Campos**

Tipos de campo que puede tener un catálogo:

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| Código | Mayúsculas automáticas; solo A–Z, 0–9 y `_`; contador, máx. 41 | Sí (solo al crear; deshabilitado en edición) | «Use de 2 a 41 letras mayúsculas, dígitos o guiones bajos, empezando con una letra.» | No |
| Texto | Texto | Según el campo | «Use como máximo {max} caracteres.» | No |
| Monto | Teclado decimal, solo dígitos y punto, sufijo «USD» | Según el campo | «Ingrese un monto válido con hasta dos decimales (p. ej. 25.00).» | No |
| Entero | Solo dígitos | Según el campo | «Ingrese un número entero entre {min} y {max}.» | No |
| Decimal / porcentaje | Hasta 2 decimales | Según el campo | «Ingrese un número con hasta dos decimales.» / «Ingrese un porcentaje entre 0 y 100.» | No |
| Fecha | `AAAA-MM-DD` + botón de calendario «Elegir fecha» | Según el campo | «Ingrese una fecha como AAAA-MM-DD.» | No |
| Selección | Desplegable; si es opcional incluye «—» u otra opción vacía (p. ej. «Toda la compañía») | Según el campo | — | No |
| Interruptor | Conmutador (soportado por el formulario) | Según el campo | — | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Crear» / «Guardar» | Administrador | Valida los campos y las reglas entre campos; envía solo los campos visibles. | No | Cierra, recarga la lista y la página muestra «Guardado.» |
| — error de validación del servidor que nombra un campo | — | — | — | Error bajo ese campo. |
| — conflicto | — | — | — | Banner «Este registro fue actualizado por otro usuario. Actualice para continuar. Actualice la lista e intente de nuevo.» |
| — otros errores | — | — | — | Banner. |
| «Cancelar» / X | Administrador | Cierra. | Con cambios: «¿Descartar cambios sin guardar?» | — |

No se cierra tocando fuera.

**Estados y mensajes**

- Enviando: campos deshabilitados y spinner.
- Opciones cargando: botón de envío deshabilitado.
- Campos condicionales que aparecen o desaparecen (beneficios, [S-ADM-22](10_pantallas_admin.md#p-adm--s-adm-22--beneficios--plan)).

**Tiempo real**

No aplica.

**Reglas de negocio**

- Los campos no editables (código, proveedor y fecha de inicio de un precio, tipo de beneficio, sede de una regla de bono) se muestran deshabilitados en edición.
- Validación en vivo tras la primera interacción; el servidor es la autoridad.

**Notas para el rediseño**

- Preservar la marca «(opcional)», los sufijos de unidad, la protección de cambios sin guardar y la asignación de los errores del servidor al campo.
- Los campos deshabilitados en edición no explican por qué (salvo el tipo de beneficio).

**Código fuente:** `features/admin/presentation/catalogs/catalog_form_dialog.dart`, `features/admin/presentation/widgets/catalog_field_input.dart`, `features/admin/domain/catalog_descriptor.dart`, `catalog_validation.dart`, `features/admin/presentation/widgets/admin_dialog.dart`.

---

### <a id="p-adm--s-adm-20--confirmacion-desactivar-nombre-catalogos"></a>S-ADM-20 Confirmación «¿Desactivar {nombre}?» (catálogos)

**Ruta:** diálogo sobre cualquier lista de catálogo con activación · **Tipo:** diálogo

**Propósito**

Confirmar la desactivación de una entrada de catálogo.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

«Más acciones» › «Desactivar» en una entrada activa.

**Distribución**

- Diálogo de confirmación: «¿Desactivar {nombre}?» / «Las entradas inactivas se ocultan al personal pero se conservan en el historial.» / «Cancelar» + «Desactivar» (rojo).

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Desactivar» | Administrador | `Set*Active(false)` con `expected_version` y recarga. | Este diálogo | Fila «Inactivo»; errores en snackbar (conflicto con «Actualizar»). |
| «Cancelar» | Administrador | Cierra sin cambios. | — | — |

**Estados y mensajes**

Sin estados propios.

**Tiempo real**

No aplica.

**Reglas de negocio**

- En las reglas de bono, desactivar además cierra la ventana en la fecha de hoy si no tenía fin o era posterior (servidor), aunque el texto no lo dice ([S-ADM-23](10_pantallas_admin.md#p-adm--s-adm-23--reglas-de-bono)).

**Notas para el rediseño**

- El mensaje genérico no explica los efectos específicos de cada catálogo (p. ej. el cierre de la ventana en las reglas de bono).

**Código fuente:** `features/admin/presentation/catalogs/catalog_crud_page.dart`, `core/widgets/confirm_dialog.dart`.

---

### <a id="p-adm--s-adm-21--planes-de-membresia"></a>S-ADM-21 Planes de membresía

**Ruta:** `/admin/membership-plans` · **Tipo:** página

**Propósito**

Definir los planes de membresía (cuotas y máximo de miembros) y acceder a sus beneficios.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Guarda `managePricing`. |
| Recepción | Sin acceso a esta pantalla | Elige el plan en el registro de llegada y en la cobertura de la visita. |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Administración › «Planes de membresía», o el chip «Planes de membresía» del selector de catálogos.

**Distribución**

- Patrón de [S-ADM-13](10_pantallas_admin.md#p-adm--s-adm-13--catalogos--tipos-de-cita-patron-crud-comun-de-catalogos) con selector de catálogos. Columnas: «Código», «Nombre (EN)», «Nombre (ES)», «Cuota inicial», «Cuota mensual», «Máximo de miembros», «Orden», «Estado», «Acciones».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Código» | Código (solo al crear) | Sí | Ver [S-ADM-19](10_pantallas_admin.md#p-adm--s-adm-19--formulario-de-catalogo-nuevo-catalogo--editar-catalogo) | No |
| «Nombre (EN)» / «Nombre (ES)» | Texto | Sí | Longitud máxima | No |
| «Cuota inicial» | Monto USD | Sí | Hasta 2 decimales | No |
| «Cuota mensual» | Monto USD | Sí | Hasta 2 decimales | No |
| «Máximo de miembros» | Entero | Sí | 1 a 1000 | No |
| «Orden (opcional)» | Entero | No | 0 a 100000 | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Crear / Editar / Desactivar / Activar | Administrador | Con `CreateMembershipPlan`, `UpdateMembershipPlan` y `SetMembershipPlanActive`. | Solo al desactivar | «Guardado.» |
| «Más acciones» › «Beneficios» | Administrador | Navega a la página de beneficios del plan. | No | [S-ADM-22](10_pantallas_admin.md#p-adm--s-adm-22--beneficios--plan). |

**Estados y mensajes**

- Como [S-ADM-13](10_pantallas_admin.md#p-adm--s-adm-13--catalogos--tipos-de-cita-patron-crud-comun-de-catalogos).

**Tiempo real**

Sin eventos en vivo.

**Reglas de negocio**

- Montos en dinero USD exacto.
- Los beneficios de un plan descuentan cargos de origen «Orden» en el estado de cuenta cuando la cobertura es Membresía y la membresía está activa ([S-CAJ-07](09_pantallas_caja.md#p-caj--s-caj-07--tarjeta-estado-de-cuenta-lineas-cobertura-totales)).

**Notas para el rediseño**

- El acceso a «Beneficios» solo está en el menú ⋮.

**Código fuente:** `features/admin/presentation/catalogs/catalog_pages.dart`, `features/admin/application/catalog_descriptors.dart`.

---

### <a id="p-adm--s-adm-22--beneficios--plan"></a>S-ADM-22 Beneficios · {plan}

**Ruta:** `/admin/membership-plans/<planId>/benefits` · **Tipo:** página

**Propósito**

Definir los beneficios de un plan (descuento o cantidad incluida por periodo).

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Permiso `managePricing`. |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

«Beneficios» en el menú de un plan ([S-ADM-21](10_pantallas_admin.md#p-adm--s-adm-21--planes-de-membresia)). La flecha atrás vuelve a `/admin/membership-plans`.

**Distribución**

- Encabezado con flecha atrás, «Beneficios · {nombre del plan}» y subtítulo = código del plan; «Mostrar inactivos», «Actualizar», «Nuevo». Sin selector de catálogos.
- Columnas: «Tipo de beneficio», «Categoría», «Valor» («15.00 %» o la cantidad), «Periodo», «Estado», «Acciones».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Tipo de beneficio» | Desplegable «Descuento» / «Incluido»; ayuda «El tipo de beneficio no se puede cambiar después de crearlo.» | Sí | No editable tras crear | No |
| «Categoría» | Código en mayúsculas (pista `OFFICE_VISIT`) | Sí | Mismo patrón que los códigos | No |
| «Descuento» | Porcentaje con sufijo «%», visible solo con tipo Descuento | Sí (si visible) | 0 a 100 | No |
| «Cantidad incluida» | Entero, visible solo con tipo Incluido | Sí (si visible) | 1 a 100000 | No |
| «Periodo» | Desplegable «Mes» / «Año» / «Vitalicio» | Sí | — | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Crear / Editar / Desactivar / Activar | Administrador | Con `CreateMembershipBenefit`, `UpdateMembershipBenefit` y `SetMembershipBenefitActive`. | Solo al desactivar | «Guardado.» |

**Estados y mensajes**

- Como [S-ADM-13](10_pantallas_admin.md#p-adm--s-adm-13--catalogos--tipos-de-cita-patron-crud-comun-de-catalogos); en las confirmaciones el nombre de la entrada es «{Tipo} {CATEGORÍA}».

**Tiempo real**

Sin eventos en vivo.

**Reglas de negocio**

- El porcentaje se normaliza a 2 decimales (15 → 15.00).
- La categoría es un código libre (p. ej. `OFFICE_VISIT`, `LAB`, `PROCEDURE`): no hay lista de valores.

**Notas para el rediseño**

- La categoría como texto libre es propensa a errores; considerar un selector.
- Preservar el campo condicional según el tipo.

**Código fuente:** `features/admin/presentation/catalogs/catalog_pages.dart`, `features/admin/application/catalog_descriptors.dart`.

---

### <a id="p-adm--s-adm-23--reglas-de-bono"></a>S-ADM-23 Reglas de bono

**Ruta:** `/admin/bonus-rules` · **Tipo:** página

**Propósito**

Definir el bono diario por tramo de ingreso recibido, por sede o para toda la compañía; se refleja en los reportes (solo para el Administrador).

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Permiso `managePricing`. |
| Recepción | Sin acceso | No ve el bono ni en sus reportes. |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Administración › «Reglas de bono», o el chip «Reglas de bono».

**Distribución**

- Patrón de [S-ADM-13](10_pantallas_admin.md#p-adm--s-adm-13--catalogos--tipos-de-cita-patron-crud-comun-de-catalogos) con selector. Columnas: «Nombre», «Sede» («Toda la compañía» si no tiene), «Ingreso diario mínimo», «Ingreso diario máximo» («sin límite» si está vacío), «Tipo de bono», «Valor» («{v} %» si es porcentaje), «Vigente desde», «Vigente hasta», «Estado», «Acciones».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Sede (opcional)» | Desplegable de sedes activas «Nombre (CÓDIGO)», opción vacía «Toda la compañía» | No | No editable tras crear | No |
| «Nombre» | Texto | Sí | Máx. 120 | No |
| «Ingreso diario mínimo» | Decimal con sufijo «USD» | Sí | Hasta 2 decimales | No |
| «Ingreso diario máximo (opcional)» | Decimal con sufijo «USD» | No (vacío = sin límite) | Hasta 2 decimales | No |
| «Tipo de bono» | Desplegable «Monto fijo» / «Porcentaje del ingreso» | Sí | — | No |
| «Valor» | Decimal | Sí | Con porcentaje, máximo 100: «Ingrese un porcentaje entre 0 y 100.» | No |
| «Vigente desde» | Fecha | Sí | `AAAA-MM-DD` | No |
| «Vigente hasta (opcional)» | Fecha | No | Igual o posterior a «Vigente desde» | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Crear / Editar / Desactivar / Activar | Administrador | Con `ReportService/CreateBonusRule`, `UpdateBonusRule` y `SetBonusRuleActive` (`expected_version`). | Solo al desactivar ([S-ADM-20](10_pantallas_admin.md#p-adm--s-adm-20--confirmacion-desactivar-nombre-catalogos)) | «Guardado.» |

**Estados y mensajes**

- Como [S-ADM-13](10_pantallas_admin.md#p-adm--s-adm-13--catalogos--tipos-de-cita-patron-crud-comun-de-catalogos).

**Tiempo real**

Sin eventos en vivo.

**Reglas de negocio**

- Un día con ingreso recibido R aplica la regla si está dentro de su ventana y mínimo ≤ R < máximo; la regla de sede gana a la de compañía; entre varias, gana la de mínimo más alto.
- Desactivar cierra la ventana hoy (zona de la sede o de la compañía) para que los días pasados conserven su bono; una regla inactiva sin fin nunca aplica.
- Se gestiona con `ReportService`, no con `CatalogService`.
- El bono aplicado aparece en la tarjeta «Dinero» del reporte diario ([S-ADM-24](10_pantallas_admin.md#p-adm--s-adm-24--reportes-de-la-compania-pestana-diario), [S-CAJ-19](09_pantallas_caja.md#p-caj--s-caj-19--pestana-diario-reporte-diario-de-una-sede)).

**Notas para el rediseño**

- Los mínimos, máximos y el valor fijo se muestran como decimal crudo (p. ej. `500.00`) sin símbolo de moneda, mientras otros catálogos formatean la moneda.
- La regla de precedencia (sede antes que compañía, mayor mínimo) no se explica en pantalla.

**Código fuente:** `features/admin/presentation/catalogs/catalog_pages.dart`, `features/admin/application/catalog_descriptors.dart`, `features/admin/infrastructure/bonus_rule_gateway.dart`.

---

### <a id="p-adm--s-adm-24--reportes-de-la-compania-pestana-diario"></a>S-ADM-24 Reportes de la compañía (pestaña «Diario»)

**Ruta:** `/admin/reports` · **Tipo:** página

**Propósito**

Ver la actividad y el dinero de todas las sedes en un día, o de una sede concreta, e imprimir o exportar con el registro de auditoría previo. Las vistas que comparte con Recepción están detalladas en [S-CAJ-19](09_pantallas_caja.md#p-caj--s-caj-19--pestana-diario-reporte-diario-de-una-sede), [S-CAJ-22](09_pantallas_caja.md#p-caj--s-caj-22--reportes-de-la-compania) y [S-CAJ-23](09_pantallas_caja.md#p-caj--s-caj-23--vista-diaria-de-la-compania-tabla-por-sede).

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Guarda de rol + `viewCompanyReports`; el servidor responde `admin_only` a las vistas de compañía para los demás. |
| Recepción | Sin acceso aquí | Usa los Reportes de su sede (`/app/<código>/reports`, [S-CAJ-18](09_pantallas_caja.md#p-caj--s-caj-18--reportes-de-la-sede-activa)), sin saldo pendiente ni bono. |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Administración › «Reportes de la compañía».

**Distribución**

- Encabezado: «Reportes de la compañía»; subtítulo = alcance («Todas las sedes» o «CÓDIGO · Nombre»). Banner rojo compacto si fallan las sedes.
- Filtro «Sede» (desplegable de 320 px): «Todas las sedes» + todas las sedes ordenadas por código (incluidas las inactivas).
- Pestañas «Diario» / «Rango» ([S-ADM-25](10_pantallas_admin.md#p-adm--s-adm-25--reportes-de-la-compania--pestana-rango)).
- Barra del Diario: «Día anterior» (‹), campo «Fecha» (calendario hasta hoy), «Día siguiente» (›, deshabilitado en hoy), «Hoy» (deshabilitado si ya es hoy), «Actualizar», «Imprimir» y «Exportar CSV» (solo con «Todas las sedes»).
- Vista de compañía: tabla «Sede», «Pacientes», «Nuevos», «Seguimiento», «Consultas», «Sin cita», «Facturado», «Recibido» y, si llegan las cifras de administrador, «Saldo pendiente» y «Bono»; última fila «Totales de la compañía».
- Vista de una sede: tarjetas «Visitas» (Pacientes atendidos, Pacientes nuevos, Seguimiento, Consultas, Sin cita), «Cobertura» (Pago directo, Seguro, Membresía), «Citas» (Programadas, Confirmadas, Llegaron, Canceladas, No se presentaron), «Dinero» (Total facturado, Total recibido, Saldo pendiente, Bono con el nombre de la regla o «Ninguna regla de bono aplicó»), «Recibido por método» (Efectivo, Tarjeta de crédito, Tarjeta de débito, Otro) y «Fuentes de referencia de pacientes nuevos» (tabla «Fuente» / «Pacientes»).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Sede» | Selección única | Sí (por defecto «Todas las sedes») | Se conserva al navegar | No |
| «Fecha» | Fecha de calendario | Sí | Máximo hoy en la zona de la sede activa; compartida con la página de Reportes de sede | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Cambiar «Sede» | Administrador | Recarga con `GetDailyLocationReport` (una sede) o `GetDailyCompanyReport` (todas). | No | Vista de sede o de compañía. |
| Tocar una fila de sede en la tabla | Administrador | Fija el filtro en esa sede. | No | Tarjetas de esa sede. |
| ‹ / › / «Hoy» / calendario | Administrador | Cambia el día. | No | Recarga. |
| «Imprimir» | Administrador | Primero `AuditService/RecordClientExport` (PRINT; recurso `report.daily_company` o `report.daily_location`; filtros `date` y `location_id`); después el diálogo de impresión con el PDF («Reporte diario de la compañía» / «Reporte diario»). | Diálogo del sistema | Si la auditoría falla: «Exportación cancelada: no se pudo registrar en la auditoría. Inténtelo de nuevo en un momento.» y no imprime; si falla la impresión: «No se pudo imprimir el reporte.» ([S-CAJ-24](09_pantallas_caja.md#p-caj--s-caj-24--impresion-y-exportacion-dialogo-del-sistema-y-auditoria)). |
| «Exportar CSV» (solo compañía) | Administrador | `RecordClientExport` (CSV) y después descarga (web) o compartir (Android) de `report-daily-company-AAAA-MM-DD.csv`. | No | «CSV exportado.» / «No se pudo exportar el CSV.» |
| «Actualizar» | Administrador | Recarga (deshabilitado mientras carga). | No | Barra fina. |

**Estados y mensajes**

- Cargando / error con «Reintentar».
- Compañía sin filas: «Sin actividad en este rango.»
- Sede sin actividad: aviso «No se registró actividad este día.» sobre las tarjetas; referidos vacíos: «No hubo pacientes nuevos este día.»
- «Imprimir» y «Exportar CSV» deshabilitados hasta que hay datos.
- Sede no asignada al administrador: se permite si está activa; si está inactiva → «Esta acción no está permitida en el estado actual.» (`location_inactive`).

**Tiempo real**

Sin eventos en vivo; los datos se leen al abrir y con «Actualizar».

**Reglas de negocio**

- La app solo da formato: los totales los calcula el servidor.
- Exportación con auditoría previa; sin auditoría no hay archivo; límite de 30 exportaciones por minuto («Demasiados intentos. Intente de nuevo en {seconds} segundos.»).
- El CSV solo contiene agregados (sin nombres ni PHI) con encabezados técnicos estables en inglés (`date`, `location`, `patients_seen`, …; `open_balance`, `bonus_rule` y `bonus_amount` solo para administrador).
- Los días se calculan en la zona horaria de la sede activa del usuario.

**Notas para el rediseño**

- Preservar el registro de la exportación antes de imprimir o descargar, las columnas de administrador condicionadas a la respuesta y la fila de totales diferenciada.
- En la vista de una sede no hay «Exportar CSV» en el Diario (sí en el Rango).
- El texto de vacío del Diario de compañía habla de «rango» («Sin actividad en este rango.»).
- No se indica en qué zona horaria se calculan los días (la página de sede sí muestra «Días en {zona}»); con sedes en zonas distintas el día de la sede activa puede no coincidir con el de la sede filtrada.
- El filtro incluye sedes inactivas que, si no están asignadas, producen error.

**Código fuente:** `features/reports/presentation/admin_reports_page.dart`, `daily_report_tab.dart`, `widgets/company_daily_view.dart`, `widgets/daily_report_view.dart`, `report_sections.dart`, `report_actions.dart`, `features/reports/application/report_providers.dart`, `features/reports/infrastructure/report_gateway.dart`, `features/exports/application/export_audit.dart`.

---

### <a id="p-adm--s-adm-25--reportes-de-la-compania--pestana-rango"></a>S-ADM-25 Reportes de la compañía › pestaña «Rango»

**Ruta:** `/admin/reports` (pestaña Rango) · **Tipo:** panel

**Propósito**

Resumen día a día y totales de un rango de fechas, con el gráfico de lo recibido por día, CSV e impresión. Es la misma pestaña descrita en [S-CAJ-20](09_pantallas_caja.md#p-caj--s-caj-20--pestana-rango-resumen-por-rango-de-fechas), aquí con el alcance de toda la compañía.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Sin sede = toda la compañía (solo Administrador). |
| Recepción | Sin acceso en esta página | Tiene la pestaña Rango de su sede ([S-CAJ-20](09_pantallas_caja.md#p-caj--s-caj-20--pestana-rango-resumen-por-rango-de-fechas)). |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Pestaña «Rango» de [S-ADM-24](10_pantallas_admin.md#p-adm--s-adm-24--reportes-de-la-compania-pestana-diario).

**Distribución**

- Barra: «Desde», «Hasta» (calendarios hasta hoy), chips «Últimos 7 días» / «Últimos 30 días», texto «{n} días» (rojo si hay error), «Actualizar», «Exportar CSV», «Imprimir».
- Tarjeta «Recibido por día» con gráfico de barras (detalle al pasar el ratón o tocar).
- Tabla: «Fecha» + las métricas de [S-ADM-24](10_pantallas_admin.md#p-adm--s-adm-24--reportes-de-la-compania-pestana-diario) + fila «Total».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Desde» / «Hasta» | Fechas | Sí (por defecto, últimos 30 días) | Máx. 92 días inclusive; «Desde» ≤ «Hasta» | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Cambiar fechas o preset | Administrador | Recarga `GetDateRangeSummary` (con la sede si hay filtro). | No | Tabla y gráfico nuevos. |
| «Exportar CSV» | Administrador | `RecordClientExport` (recurso `report.range`, filtros `from`, `to` y `location_id` si aplica) y archivo `report-range-<alcance>-<desde>_<hasta>.csv`. | No | «CSV exportado.» / «No se pudo exportar el CSV.» |
| «Imprimir» | Administrador | `RecordClientExport` (PRINT) y PDF «Resumen por rango». | Diálogo del sistema | [S-CAJ-24](09_pantallas_caja.md#p-caj--s-caj-24--impresion-y-exportacion-dialogo-del-sistema-y-auditoria). |

**Estados y mensajes**

- Rango inválido (no se llama al servidor): «La fecha inicial debe ser igual o anterior a la final.» o «El rango no puede exceder 92 días.»
- Vacío: «Sin actividad en este rango.»

**Tiempo real**

Sin eventos en vivo.

**Reglas de negocio**

- El rango se comparte con la página de Reportes de sede (mismo estado de la sesión).
- Las mismas reglas de exportación auditada que [S-ADM-24](10_pantallas_admin.md#p-adm--s-adm-24--reportes-de-la-compania-pestana-diario).

**Notas para el rediseño**

- Preservar la validación previa del rango y el gráfico accesible (etiqueta para lectores con el número de días y el día máximo).
- El orden de los botones difiere del Diario (aquí CSV antes que Imprimir).

**Código fuente:** `features/reports/presentation/range_report_tab.dart`, `widgets/range_summary_view.dart`, `widgets/received_bar_chart.dart`, `features/reports/domain/report_range.dart`, `report_csv.dart`.

---

### <a id="p-adm--s-adm-26--registro-de-auditoria"></a>S-ADM-26 Registro de auditoría

**Ruta:** `/admin/audit` · **Tipo:** página

**Propósito**

Consultar el rastro inmutable de acciones (quién, qué, cuándo, dónde) con filtros y paginación.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Guarda `viewAuditLog`; `AuditService` solo para Administrador. |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Administración › «Auditoría»; botón «Abrir registro de auditoría» en [S-ADM-35](10_pantallas_admin.md#p-adm--s-adm-35--alerta-de-seguridad-detalle).

**Distribución**

- Encabezado: «Registro de auditoría», subtítulo «Rastro inmutable de cada cambio. Los metadatos están censurados (sin PHI).»; icono «Actualizar».
- Panel de filtros en una tarjeta (en teléfono, plegable «Filtros»): «Actor», «Tipo de entidad», «ID de entidad», «Prefijo de acción», «Sede», chips «Desde» y «Hasta», botones «Aplicar filtros» y «Limpiar filtros».
- Tabla: «Cuándo», «Actor», «Acción» (monoespaciado), «Entidad» (tipo + identificador corto), «Sede» (código); en teléfono, tarjetas con acción, fecha, actor y entidad.
- Pie: «Cargar más» o «No hay más entradas.»

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Actor» | Texto libre, pista «ID de usuario» (UUID del usuario) | No | — | No |
| «Tipo de entidad» | Texto libre | No | — | No |
| «ID de entidad» | Texto libre | No | — | No |
| «Prefijo de acción» | Texto, pista «p. ej. billing. o patient.create» | No | — | No |
| «Sede» | Desplegable «Todas las sedes» + sedes «Nombre (CÓDIGO)» | No | El servidor solo admite sedes asignadas al administrador | No |
| «Desde» / «Hasta» | Chip con calendario (2020 a mañana); muestra «Desde: AAAA-MM-DD», se borra con la x | No | Días completos en la zona de la sede activa («Hasta» inclusive) | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Aplicar filtros» o Enter en un campo de texto | Administrador | `AuditService/ListAuditLogs` desde la primera página (50 por página). | No | Lista filtrada. |
| «Limpiar filtros» | Administrador | Vacía los campos y recarga sin filtros. | No | Lista completa. |
| «Cargar más» | Administrador | Siguiente página por cursor (spinner mientras carga). | No | Más filas. |
| Tocar una fila | Administrador | Abre el detalle. | No | [S-ADM-27](10_pantallas_admin.md#p-adm--s-adm-27--entrada-de-auditoria-detalle). |
| «Actualizar» | Administrador | Recarga con el filtro aplicado. | No | Barra fina. |

**Estados y mensajes**

- Cargando / error con «Reintentar» / barra fina al recargar.
- Vacío: «Ninguna entrada coincide con estos filtros.»
- Actor vacío = «Sistema»; actor desconocido = los 8 primeros caracteres de su identificador + «…».
- Elegir una sede no asignada al administrador → «No está autorizado para esta sede.»

**Tiempo real**

Sin eventos en vivo.

**Reglas de negocio**

- Solo lectura; la propia consulta queda auditada (`audit.list` / `audit.view`).
- El administrador ve las entradas globales (sin sede) y las de sus sedes asignadas.
- Los metadatos están censurados (identificadores, códigos, versiones; nunca PHI), salvo el motivo de `admin.break_glass` y de `user.reactivated`, que llega descifrado.

**Notas para el rediseño**

- Preservar la paginación por cursor y el aviso de metadatos censurados.
- El filtro «Actor» exige pegar un UUID; «Tipo de entidad» y «Prefijo de acción» son texto libre sin sugerencias; las acciones se muestran como códigos técnicos sin traducir.
- El desplegable «Sede» ofrece sedes no asignadas que el servidor rechaza.
- El filtro aplicado se conserva en memoria al salir y volver, pero los campos del panel aparecen vacíos: la lista sigue filtrada sin que se vea por qué.
- El filtro y sus filas no se limpian al cerrar sesión.

**Código fuente:** `features/admin/presentation/audit/audit_page.dart`, `features/admin/application/audit_controller.dart`, `features/admin/domain/audit_filter.dart`, `features/admin/infrastructure/audit_gateway.dart`.

---

### <a id="p-adm--s-adm-27--entrada-de-auditoria-detalle"></a>S-ADM-27 Entrada de auditoría (detalle)

**Ruta:** diálogo (600 px o más) u hoja inferior arrastrable (menos de 600 px) sobre `/admin/audit` · **Tipo:** diálogo

**Propósito**

Ver todos los campos de una entrada de auditoría.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Tocar una fila en [S-ADM-26](10_pantallas_admin.md#p-adm--s-adm-26--registro-de-auditoria).

**Distribución**

- Título «Entrada de auditoría» con botón de cerrar (X); filas etiqueta / valor seleccionables: «Acción», «Ocurrió el», «Actor», «Tipo de entidad», «ID de entidad», «Sede», «ID de solicitud», «ID de correlación»; bloque «Metadatos (censurados)» con el JSON formateado o «Sin metadatos.»

**Campos**

Sin campos editables (todo es seleccionable para copiar).

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| X «Cerrar» o deslizar la hoja | Administrador | Cierra. | No | — |

**Estados y mensajes**

- Los valores vacíos se muestran como «—».

**Tiempo real**

No aplica.

**Reglas de negocio**

- Usa los datos ya cargados en la lista (no vuelve a pedir la entrada al servidor).

**Notas para el rediseño**

- Preservar el texto seleccionable y el JSON legible; los identificadores técnicos ocupan mucho espacio para usuarios no técnicos.

**Código fuente:** `features/admin/presentation/audit/audit_page.dart`, `features/admin/domain/setting_view.dart`.

---

### <a id="p-adm--s-adm-28--configuracion-marco-con-pestanas-y-barra-de-cambios-pendientes"></a>S-ADM-28 Configuración (marco con pestañas y barra de cambios pendientes)

**Ruta:** `/admin/settings` · **Tipo:** página

**Propósito**

Administrar la configuración operativa en caliente (sin reiniciar), probar integraciones, ver el estado del sistema y seguir el mantenimiento de claves.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Guarda de rol + permiso de ruta `manageLocations`; `SettingsService` solo para Administrador. Tras el asistente de primer arranque, el primer administrador aterriza aquí. |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

- Administración › «Configuración».
- Botón «Abrir configuración» del banner de configuración incompleta ([S-ADM-38](10_pantallas_admin.md#p-adm--s-adm-38--banner-la-configuracion-del-sistema-esta-incompleta)) o de la notificación «Configuración incompleta» ([S-GEN-15](05_pantallas_generales.md#p-gen--s-gen-15--centro-de-notificaciones)).
- Redirección tras `/setup` ([S-GEN-02](05_pantallas_generales.md#p-gen--s-gen-02--configuracion-inicial-asistente-de-primer-arranque)).

**Distribución**

- Encabezado: «Configuración», subtítulo «La configuración operativa se aplica en caliente; no requiere reinicio.»; icono «Actualizar» (recarga los ajustes y el estado).
- Banner «Lista de configuración inicial» ([S-ADM-29](10_pantallas_admin.md#p-adm--s-adm-29--lista-de-configuracion-inicial)) cuando falta configuración.
- Pestañas: «Estado del sistema» ([S-ADM-30](10_pantallas_admin.md#p-adm--s-adm-30--configuracion--estado-del-sistema)), «Ajustes» ([S-ADM-31](10_pantallas_admin.md#p-adm--s-adm-31--configuracion--ajustes-campo-de-ajuste)), «Integraciones» ([S-ADM-32](10_pantallas_admin.md#p-adm--s-adm-32--configuracion--integraciones)) y «Mantenimiento de claves» ([S-ADM-33](10_pantallas_admin.md#p-adm--s-adm-33--configuracion--mantenimiento-de-claves)).
- Barra inferior fija (solo con cambios): «{n} cambio(s) sin guardar», «Descartar cambios», «Guardar cambios».

**Campos**

Los campos están en las pestañas ([S-ADM-31](10_pantallas_admin.md#p-adm--s-adm-31--configuracion--ajustes-campo-de-ajuste), [S-ADM-32](10_pantallas_admin.md#p-adm--s-adm-32--configuracion--integraciones)).

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Guardar cambios» | Administrador; deshabilitado si algún campo tiene error | `SettingsService/UpdateSettings` en un único lote atómico con la `expected_version` de cada clave. | No | Snackbar «Ajustes guardados.» y se vacía el borrador. |
| — valor rechazado (`invalid_setting_value '<clave>: <motivo>'`) | — | — | — | Error «Valor no válido: {motivo}» en ese campo y salto a su pestaña. |
| — conflicto (otro administrador cambió una clave) | — | — | — | Snackbar con «Actualizar». |
| «Descartar cambios» | Administrador | Vacía el borrador. | «¿Descartar cambios sin guardar?» | Ajustes sin cambios. |
| Atrás del sistema con cambios | Administrador | — | «¿Descartar cambios sin guardar?» | — |

**Estados y mensajes**

- La pestaña abierta se recuerda durante la sesión.

**Tiempo real**

Sin eventos en vivo; el estado del sistema y el mantenimiento de claves se consultan periódicamente (ver [S-ADM-30](10_pantallas_admin.md#p-adm--s-adm-30--configuracion--estado-del-sistema) y [S-ADM-33](10_pantallas_admin.md#p-adm--s-adm-33--configuracion--mantenimiento-de-claves)).

**Reglas de negocio**

- Los cambios de todas las pestañas se acumulan en un borrador común y se guardan juntos.
- Los ajustes operativos viven en la base de datos (tabla de ajustes de la aplicación) y se recargan en caliente; nunca se cambian con variables de entorno.
- Guardar invalida el estado del sistema (la puerta de configuración puede cambiar).

**Notas para el rediseño**

- Preservar el guardado por lotes con concurrencia optimista y el salto al campo con error.
- Riesgo: navegar con el menú lateral no pregunta por los cambios sin guardar (solo el botón atrás); el borrador sigue en memoria y reaparece al volver, y no se limpia al cerrar sesión.
- «Guardar cambios» deshabilitado no indica qué campo tiene error cuando está en otra pestaña.

**Código fuente:** `features/admin/presentation/settings/settings_page.dart`, `features/admin/application/settings_controller.dart`, `features/admin/infrastructure/settings_gateway.dart`, `core/widgets/dirty_form_guard.dart`.

---

### <a id="p-adm--s-adm-29--lista-de-configuracion-inicial"></a>S-ADM-29 Lista de configuración inicial

**Ruta:** banner en `/admin/settings` · **Tipo:** banner

**Propósito**

Guiar el primer arranque mostrando qué claves faltan o qué infraestructura no responde.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Aparece solo en Configuración mientras la configuración está incompleta.

**Distribución**

- Franja de color terciario: icono de lista + «Lista de configuración inicial», texto «Defina estas claves (y verifique que la infraestructura responda) para terminar la configuración:» y chips de acción.
- Chip de clave: icono de llave + nombre técnico de la clave. Chip de infraestructura: icono de nube tachada + «{TIPO} no responde».

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Tocar un chip (tooltip «Ir al ajuste») | Administrador | Abre la pestaña dueña del ajuste (Integraciones para `infra.nats.*`, `infra.minio.*`, `google.*`, `smtp.*`, `sms.*`, `calendar.*`, `labs.*`, `crm.*`; Ajustes para el resto), desplaza hasta el campo y lo resalta con un borde durante 4 s. «NATS no responde» salta a `infra.nats.url` y «MINIO no responde» a `infra.minio.endpoint`. | No | Campo resaltado en [S-ADM-31](10_pantallas_admin.md#p-adm--s-adm-31--configuracion--ajustes-campo-de-ajuste) o [S-ADM-32](10_pantallas_admin.md#p-adm--s-adm-32--configuracion--integraciones). |

**Estados y mensajes**

- Oculto si el estado es «Listo» o «Degradado», o si no falta nada.

**Tiempo real**

Se actualiza con la consulta periódica del estado del sistema (cada 30 s).

**Reglas de negocio**

- Mientras falten claves, el servidor responde `setup_incomplete` a la operación clínica ([S-ADM-38](10_pantallas_admin.md#p-adm--s-adm-38--banner-la-configuracion-del-sistema-esta-incompleta)).

**Notas para el rediseño**

- Los chips muestran claves técnicas (p. ej. `smtp.host`) sin traducción ni descripción.

**Código fuente:** `features/admin/presentation/settings/checklist_banner.dart`, `features/admin/domain/setting_view.dart`, `system_status_rules.dart`.

---

### <a id="p-adm--s-adm-30--configuracion--estado-del-sistema"></a>S-ADM-30 Configuración › Estado del sistema

**Ruta:** `/admin/settings` (pestaña 1) · **Tipo:** panel

**Propósito**

Mostrar la puerta de configuración, la infraestructura (mensajería NATS y almacenamiento MinIO), los cambios de estado recientes y los latidos de cada proceso.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Pestaña «Estado del sistema»; la menciona también el aviso de detección de seguridad atrasada ([S-ADM-34](10_pantallas_admin.md#p-adm--s-adm-34--alertas-de-seguridad)).

**Distribución**

- Tarjeta «Estado de la configuración» con «Actualizar»: chip de estado, chip «Entorno: {entorno}», «Desde {hora}», «Ajustes faltantes» (chips que saltan al campo) y la línea de actualización automática.
- Sección «Infraestructura»: «Mensajería (NATS) · actualizaciones en vivo» y «Almacenamiento de documentos (MinIO)», con chip y último mensaje o «Desde {hora}».
- Sección «Cambios de estado recientes»: «{de} → {a}», fecha y «Sin conexión: {componentes}».
- Sección «Servicios»: una tarjeta por proceso con «Último latido», «Versión», «Host», «Ajustes faltantes» y chips de estado.

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Actualizar» | Administrador | `SettingsService/GetSystemStatus`. | No | Estado releído. |
| Chips de «Ajustes faltantes» | Administrador | Saltan al campo (como [S-ADM-29](10_pantallas_admin.md#p-adm--s-adm-29--lista-de-configuracion-inicial)). | No | Campo resaltado. |

**Estados y mensajes**

- Chip de configuración: «Listo» (verde), «Esperando configuración» (ámbar), «Degradado: el trabajo clínico continúa» (rojo), «Comprobando…» (azul).
- Infraestructura: «Disponible» (verde), «Sin conexión» (rojo), «Verificando…» (ámbar), «Sin verificar» (gris).
- Servicios: «Activo» / «Listo» (verde), «Pausado» (ámbar), «En espera» (azul), «Degradado» (rojo), y además «Sin latido» (rojo) si el latido está obsoleto; sin procesos: «Aún no hay latidos de servicios.»
- Sin transiciones: «Sin cambios de estado desde que arrancó el servidor.»
- Línea de actualización: «Se actualiza cada 30 segundos hasta que todos los servicios estén activos.» o «Todos los servicios están activos. Actualice cuando lo necesite.»

**Tiempo real**

Consulta cada 30 s mientras no esté «Listo», no haya procesos, alguno no esté activo o listo, o alguno no tenga latido; se detiene cuando todo está estable.

**Reglas de negocio**

- «Degradado» = configuración completa pero NATS o MinIO no responden: todas las operaciones se siguen atendiendo (solo se ven afectados los documentos y el tiempo real, [S-GEN-19](05_pantallas_generales.md#p-gen--s-gen-19--banner-de-modo-degradado-emergencia-de-infraestructura)).

**Notas para el rediseño**

- Preservar el texto junto al color en todos los chips y la explicación de que el trabajo clínico continúa en modo degradado.
- Los nombres de procesos y hosts son técnicos.

**Código fuente:** `features/admin/presentation/settings/system_status_card.dart`, `features/admin/application/system_status_controller.dart`, `features/admin/domain/system_status_rules.dart`.

---

### <a id="p-adm--s-adm-31--configuracion--ajustes-campo-de-ajuste"></a>S-ADM-31 Configuración › Ajustes (campo de ajuste)

**Ruta:** `/admin/settings` (pestaña 2) · **Tipo:** panel

**Propósito**

Editar cada ajuste del registro de configuración, agrupado por sección.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Pestaña «Ajustes»; saltos desde [S-ADM-29](10_pantallas_admin.md#p-adm--s-adm-29--lista-de-configuracion-inicial) y [S-ADM-30](10_pantallas_admin.md#p-adm--s-adm-30--configuracion--estado-del-sistema).

**Distribución**

- Tarjetas por grupo, en este orden: «Autenticación», «Valores predeterminados», «Procesos de fondo», «CORS», «Documentos», «Tiempo real», «Activación de servicios», «NATS», «Almacenamiento de objetos (MinIO)», «Inicio de sesión con Google», «SMTP», «SMS», «Calendario», «Laboratorios», «CRM», «Resultados de pruebas de integración», «Otros» (aquí caen `security.alerts.*`, `maintenance.*` y `backups.*`).
- Cada campo: clave técnica en monoespaciado + chips «Obligatorio» (ámbar si falta configurarlo, gris si no), «Mantenido por el sistema» (candado) o «Personalizado» (azul) / «Predeterminado» (gris); la descripción del registro; el editor; pie «Predeterminado: {valor} · Actualizado el {fecha}» e icono «Restablecer valor predeterminado»; borde izquierdo de color si está resaltado o modificado.

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| Booleano | Interruptor | Según el ajuste | — | No |
| Entero / puerto | Solo dígitos, ayuda «min..max» | Según el ajuste | «Ingrese un número entero.» / «Ingrese un número entero entre {min} y {max}.»; vacío = «Sin valor» si admite nulo, si no «Este campo es obligatorio.» | No |
| Decimal | Número | Según el ajuste | «Ingrese un número con hasta dos decimales.» | No |
| Texto / versión / URL / correo | Texto, pistas «1.2.3», «https://…», «name@example.com» | Según el ajuste | «Ingrese una versión como MAYOR.MENOR.PARCHE (p. ej. 1.4.0).», «Ingrese una URL http(s) válida.», «Ingrese un correo electrónico válido.», «Use como máximo {max} caracteres.» | No |
| Zona horaria | Selector [S-ADM-12](10_pantallas_admin.md#p-adm--s-adm-12--selector-de-zona-horaria) | Según el ajuste | Zona IANA válida | No |
| Enumeración | Desplegable con los valores crudos (p. ej. `EN`/`ES`, `LIGHT`/`DARK`, `NONE`/`TWILIO`) | Según el ajuste | — | No |
| Lista / lista de orígenes | Chips borrables + campo «Escriba un valor y presione Enter» (u «https://app.example.com») con botón «Agregar» | Según el ajuste | Origen inválido: «Ingrese un origen como esquema://host[:puerto] sin ruta.» | No |
| Secreto | Candado + «Configurado · \*\*\*\*{pista}» o «Sin configurar»; «Reemplazar» abre «Nuevo valor» oculto («Cancelar» lo cierra); «Vaciar» si está configurado y no es obligatorio | Según el ajuste | Nunca se muestra el valor | Sí (secreto) |
| Solo lectura (JSON) | Caja monoespaciada con el JSON formateado o «Sin valor» | — | — | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Editar un campo | Administrador | Lo añade al borrador común ([S-ADM-28](10_pantallas_admin.md#p-adm--s-adm-28--configuracion-marco-con-pestanas-y-barra-de-cambios-pendientes)); volver al valor actual lo quita. | No | Barra «{n} cambios sin guardar». |
| «Restablecer valor predeterminado» (solo personalizado y no de solo lectura) | Administrador | `SettingsService/ResetSetting` inmediato (fuera del lote). | «¿Restablecer {clave} a su valor predeterminado?» / «El valor guardado se elimina y el predeterminado se aplica de inmediato.» / botón rojo | «Guardado.» |

**Estados y mensajes**

- Cargando / error con «Reintentar».
- Grupo vacío: «No hay ajustes en este grupo.»
- Campo resaltado durante 4 s tras un salto.

**Tiempo real**

Sin eventos en vivo.

**Reglas de negocio**

- Un valor inválido no entra en el borrador: se mantiene el último valor válido mientras se ve el error.
- El servidor vuelve a validar todo.
- Los ajustes de las integraciones aparecen aquí y también en [S-ADM-32](10_pantallas_admin.md#p-adm--s-adm-32--configuracion--integraciones) (mismo borrador).
- Ejemplo: `auth.idle_logout_minutes` (5–120) fija el cierre automático por inactividad ([S-GEN-20](05_pantallas_generales.md#p-gen--s-gen-20--cierre-automatico-por-inactividad-aviso-y-cubierta)).

**Notas para el rediseño**

- Preservar el enmascarado de los secretos, los chips Obligatorio / Personalizado / Predeterminado y el restablecimiento con confirmación.
- Las descripciones vienen del registro del servidor en inglés y las etiquetas son claves técnicas; no hay búsqueda de ajustes.
- Las listas de valores enumerados (p. ej. `auth.mfa.required_roles`) se editan como texto libre en chips, sin selector.
- Los ajustes de alertas de seguridad, mantenimiento y copias quedan en «Otros» sin grupo propio, aunque el panel de claves remite a «Configuración > maintenance».
- Tras escribir un valor inválido, el borrador conserva el valor anterior válido, lo que puede confundir.

**Código fuente:** `features/admin/presentation/settings/settings_tab.dart`, `setting_field.dart`, `features/admin/domain/setting_view.dart`, `setting_value_rules.dart`.

---

### <a id="p-adm--s-adm-32--configuracion--integraciones"></a>S-ADM-32 Configuración › Integraciones

**Ruta:** `/admin/settings` (pestaña 3) · **Tipo:** panel

**Propósito**

Configurar y probar NATS, MinIO, el inicio de sesión con Google, SMTP, SMS, Calendario, Laboratorios y CRM.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Pestaña «Integraciones»; saltos desde la lista de configuración inicial ([S-ADM-29](10_pantallas_admin.md#p-adm--s-adm-29--lista-de-configuracion-inicial)).

**Distribución**

- Una tarjeta por integración: «NATS», «Almacenamiento de objetos (MinIO)», «Inicio de sesión con Google», «SMTP», «SMS», «Calendario», «Laboratorios», «CRM»; NATS y MinIO llevan un icono con el tooltip «Disponible antes de completar la configuración.»
- Dentro: el interruptor `<prefijo>.enabled` (si existe) y luego sus ajustes (mismo componente que [S-ADM-31](10_pantallas_admin.md#p-adm--s-adm-31--configuracion--ajustes-campo-de-ajuste)).
- Pie: botón «Probar conexión» y el resultado.

**Campos**

Los ajustes de cada integración (ver [S-ADM-31](10_pantallas_admin.md#p-adm--s-adm-31--configuracion--ajustes-campo-de-ajuste)).

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Probar conexión» | Administrador; deshabilitado si la tarjeta tiene cambios sin guardar («Guarde los cambios pendientes antes de probar.») | `SettingsService/TestIntegration` del tipo; muestra «Probando…» con spinner. | No | Resultado en la tarjeta; después recarga los ajustes y el estado del sistema. |

**Estados y mensajes**

- Sin prueba: «Última prueba: Nunca probado».
- Resultado: chip «Correcto» (verde) o «Falló» (rojo) + fecha · mensaje (el resultado de esta sesión o el último guardado en `integrations.<tipo>.last_test`).
- Error de la llamada: texto rojo traducido.

**Tiempo real**

No aplica.

**Reglas de negocio**

- Las pruebas de NATS y MinIO se permiten antes de completar la configuración; el resultado se guarda en el servidor.

**Notas para el rediseño**

- Preservar el bloqueo de la prueba con cambios pendientes y el resultado persistido.
- El mensaje del resultado es texto técnico del servidor.

**Código fuente:** `features/admin/presentation/settings/integrations_tab.dart`, `features/admin/application/settings_controller.dart`.

---

### <a id="p-adm--s-adm-33--configuracion--mantenimiento-de-claves"></a>S-ADM-33 Configuración › Mantenimiento de claves

**Ruta:** `/admin/settings` (pestaña 4) · **Tipo:** panel

**Propósito**

Seguir el recifrado en segundo plano tras una rotación de claves e iniciarlo o pausarlo; las claves nunca llegan al dispositivo.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | `MaintenanceService` solo para Administrador, independiente de la sede. |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Pestaña «Mantenimiento de claves».

**Distribución**

- Tarjeta «Mantenimiento de claves» con «Actualizar» y «Iniciar» (si algún trabajo está en pausa) o «Pausar»; subtítulo «Recifrado en segundo plano tras una rotación de claves (HIPAA 164.312(a)(2)(iv)): los trabajos reescriben las filas selladas con una clave retirada, cifran las columnas heredadas en claro y recalculan los índices ciegos. Las claves nunca salen del servidor.»
- Chips: «Completo» (verde) o «{n} filas pendientes» (ámbar si hay pausa, azul si no); «Desactivado (maintenance.reencrypt.enabled)» (ámbar); «Clave de cifrado v{versión} (configuradas: …)», «Clave de índices ciegos v{versión} (configuradas: …)», «Clave de tokens {kid} (configuradas: …)».
- Línea «Lotes de {lote} filas, {pausa} ms entre lotes (Configuración > maintenance).»; si está completo, el texto «Todas las filas están en las versiones de clave actuales y ningún texto heredado en claro espera su cifrado: las versiones retiradas pueden quitarse del entorno.»
- «Trabajos»: «Recifrado (clave de la aplicación)», «Cifrado de texto heredado en claro», «Recálculo de índices ciegos (clave HMAC)», con «Próxima ejecución {hora}» y chip «En pausa» (ámbar) / «En ejecución» (azul) / «Programado» / «Inactivo».
- «Columnas con filas pendientes»: tabla.columna, tipo («Cifrada», «Índice ciego», «Verificador»), «solo inserción», «actual v{n} · v1: …», filas heredadas, versiones desconocidas (rojo), «Última ejecución», «Último error» (rojo) y chip de pendientes (rojo si hay una versión desconocida); o «Ninguna columna tiene filas pendientes.»
- Tarjeta «Texto heredado en claro listo para el paso de contracción» cuando corresponde.

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Iniciar» | Administrador | `MaintenanceService/StartReencryption` con la versión de control. | No | Snackbar «Mantenimiento de claves iniciado: los trabajos corren en segundo plano.» |
| «Pausar» | Administrador | `PauseReencryption`. | No | Snackbar «Mantenimiento de claves en pausa tras el lote actual.» |
| — conflicto (otro administrador lo cambió) | — | — | — | Snackbar con «Actualizar». |
| «Actualizar» | Administrador | Relee el estado. | No | — |

**Estados y mensajes**

- Cargando / error con «Reintentar».
- Versión de clave desconocida: «La versión de clave {versiones} no está configurada: vuelva a ponerla en el entorno para que el trabajo pueda reescribir estas filas.»

**Tiempo real**

Consulta cada 15 s mientras quedan filas pendientes y algún trabajo está programado o en ejecución.

**Reglas de negocio**

- Solo se muestran versiones, conteos y nombres; nunca claves ni valores.
- La eliminación del texto heredado la hace un operador por consola (`legacy-contract`).
- Las filas «solo inserción» (append-only: recibos, motivos clínicos de override, notas de acuse) solo deben reescribirlas estos trabajos: una reescritura por las funciones de mantenimiento de claves que ningún trabajo programado anunció genera la alerta «Fila append-only reescrita fuera de un job de mantenimiento» ([S-ADM-34](10_pantallas_admin.md#p-adm--s-adm-34--alertas-de-seguridad)).

**Notas para el rediseño**

- Panel muy técnico para un administrador clínico; preservar los avisos en rojo de versiones desconocidas y errores.
- Si unos trabajos están en pausa y otros no, solo aparece «Iniciar»; no hay confirmación para iniciar ni para pausar.

**Código fuente:** `features/admin/presentation/settings/key_maintenance_panel.dart`, `features/admin/application/key_maintenance_controller.dart`, `features/admin/domain/key_maintenance_rules.dart`, `features/admin/infrastructure/maintenance_gateway.dart`.

---

### <a id="p-adm--s-adm-34--alertas-de-seguridad"></a>S-ADM-34 Alertas de seguridad

**Ruta:** `/admin/security` · **Tipo:** página

**Propósito**

Revisar las alertas que la detección genera a partir de la auditoría y saber si la detección está al día.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Permiso `security.events.view` (guarda de rol + `viewSecurityEvents`), independiente de la sede. |
| Recepción | Sin acceso | El servidor responde `PERMISSION_DENIED` y registra `access.denied`. |
| Enfermería / asistente médico | Sin acceso | Ídem. |
| Proveedor | Sin acceso | Ídem. |

**Cómo se llega**

Administración › «Seguridad» (con distintivo); aviso «Alerta de seguridad» de la campana ([S-ADM-39](10_pantallas_admin.md#p-adm--s-adm-39--aviso-alerta-de-seguridad-en-notificaciones)); «Atrás» desde [S-ADM-35](10_pantallas_admin.md#p-adm--s-adm-35--alerta-de-seguridad-detalle).

**Distribución**

- Encabezado: «Alertas de seguridad», subtítulo «Actividad sospechosa detectada en el registro de auditoría. Revisa y reconoce cada alerta.»; «Actualizar».
- Aviso del detector: si está atrasado, recuadro ámbar «La detección de seguridad no está al día: puede faltar alguna alerta» con las líneas de estado (ver abajo); si está al día, una línea «Registro de auditoría revisado hasta {hora}.»
- Filtros: «Alerta», «Severidad mínima», «Estado».
- Tabla: «Severidad», «Alerta», «Quién», «Cuándo» (inicio – fin de la ventana), «Conteo», «Estado»; en teléfono, tarjetas con icono de severidad, alerta, sujeto, fecha y chips.
- Pie: «Cargar más» o «No hay más entradas.»

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Alerta» | Desplegable «Todas las alertas» + 16 reglas: «Inicios de sesión fallidos repetidos», «Adivinación lenta de contraseña», «Muchos inicios de sesión fallidos en total», «Códigos MFA fallidos repetidos», «Segundo factor bloqueado», «Solicitudes denegadas repetidas», «Token de sesión reutilizado», «Lectura de muchas fichas de pacientes», «Exportación masiva», «Acceso de emergencia (break-glass) usado», «Límite de intentos de inicio de sesión alcanzado repetidamente», «Alertas de seguridad relajadas», «Revisión incompleta», «Archivado de WAL con retraso», «Fila append-only reescrita fuera de un job de mantenimiento», «Correos de alerta sin entregar» | No | — | No |
| «Severidad mínima» | Desplegable «Cualquier severidad», «Baja», «Media», «Alta», «Crítica» | No | — | No |
| «Estado» | Desplegable «Todas», «Sin reconocer», «Reconocidas» | No | — | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Cambiar un filtro | Administrador | Se aplica al instante (`SecurityService/ListSecurityEvents`, 50 por página), manteniendo las filas visibles mientras carga. | No | Lista filtrada. |
| Tocar una fila | Administrador | Abre el detalle. | No | [S-ADM-35](10_pantallas_admin.md#p-adm--s-adm-35--alerta-de-seguridad-detalle). |
| «Cargar más» | Administrador | Siguiente página (deshabilitado mientras recarga o si el filtro cambió). | No | Más filas. |
| «Actualizar» | Administrador | Relee en el sitio lo que hay en pantalla. | No | — |

**Estados y mensajes**

- Vacío: «Ninguna alerta de seguridad coincide con estos filtros.»
- Detector atrasado: «Todavía no ha revisado el registro de auditoría.» / «La última revisión de estas reglas falló o quedó incompleta: {reglas}.» / «La actividad de auditoría posterior a {hora} aún no se ha revisado.» + «Última ejecución: {hora}.» + «Debería ejecutarse cada {minutos} min. Comprueba que el servicio scheduler esté en marcha (Administración > Configuración, estado del sistema).»
- Severidad: «Baja» (azul), «Media» (ámbar), «Alta» (rojo, icono de error), «Crítica» (rojo, icono de escudo).
- Estado: «Sin reconocer» (ámbar) / «Reconocida» (verde).
- «Quién»: nombre del usuario, «Usuario {id}», «Email desconocido · huella {huella}», «Dirección de red · huella {huella}», «Todas las cuentas (inicios de sesión de todo el sistema)», «Sin atribuir (…)», «La propia detección de alertas», «El archivado de WAL de la base de datos», «La credencial de mantenimiento de claves» o «El canal de correo de alertas».

**Tiempo real**

Canal `admin:security`: `security.event_raised.v1` y `security.event_acknowledged.v1` refrescan la lista en el sitio (agrupados cada 2 s, conservando el filtro y las filas) y el distintivo; cada reconexión vuelve a leer.

**Reglas de negocio**

- Cada lectura queda auditada (`security_event.list`).
- Las alertas solo contienen identificadores, códigos, tiempos y conteos; los correos y las direcciones IP aparecen como una huella HMAC, nunca en claro.
- Paginación por cursor; se descarta la respuesta de un filtro anterior.
- Tres reglas vigilan procesos del servidor y no a una persona (severidad «Alta», sin sujeto): «Archivado de WAL con retraso» (segmentos de WAL terminados sin copia off-site verificada durante más de `backups.wal.max_lag_minutes`), «Fila append-only reescrita fuera de un job de mantenimiento» (la credencial de mantenimiento de la base se usó a mano, [S-ADM-33](10_pantallas_admin.md#p-adm--s-adm-33--configuracion--mantenimiento-de-claves)) y «Correos de alerta sin entregar» (alertas que llevan horas esperando su correo al personal). Su ayuda en [S-ADM-35](10_pantallas_admin.md#p-adm--s-adm-35--alerta-de-seguridad-detalle) dice qué revisar.
- Una regla que la app no conozca se muestra como «Alerta {code}», sin ayuda ni opción en el filtro; hoy la app conoce las 16 reglas del servidor.

**Notas para el rediseño**

- Preservar el aviso de detector atrasado (que no haya alertas no significa que se haya revisado), la severidad con texto e icono y las huellas en lugar de datos personales.
- Una regla nueva del servidor exige añadir en la app su código, nombre, ayuda y sujeto (`security_filter.dart`, `security_labels.dart`, `app_es.arb`, `app_en.arb`); si no, aparece como «Alerta {code}».
- «Alta» y «Crítica» comparten color; los textos de seguridad tutean («Revisa», «Comprueba») mientras el resto de Administración usa usted.
- Aquí los filtros se aplican al cambiar; en Auditoría hay que pulsar «Aplicar filtros».
- Reutiliza el texto «No hay más entradas.» de Auditoría.

**Código fuente:** `features/security/presentation/security_events_page.dart`, `security_labels.dart`, `features/security/application/security_providers.dart`, `features/security/domain/security_filter.dart`, `features/security/infrastructure/security_gateway.dart`, `features/security/security_feature.dart`.

---

### <a id="p-adm--s-adm-35--alerta-de-seguridad-detalle"></a>S-ADM-35 Alerta de seguridad (detalle)

**Ruta:** `/admin/security/<eventId>` · **Tipo:** página

**Propósito**

Entender una alerta, ver el correo enviado al personal, los reconocimientos y las entradas de auditoría que la originaron, y reconocerla.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Botón «Reconocer» si tiene `security.events.ack` y no la ha reconocido él. |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Tocar una alerta en [S-ADM-34](10_pantallas_admin.md#p-adm--s-adm-34--alertas-de-seguridad); aviso de la campana ([S-ADM-39](10_pantallas_admin.md#p-adm--s-adm-39--aviso-alerta-de-seguridad-en-notificaciones)); enlace «Continúa una alerta anterior».

**Distribución**

- Encabezado: flecha «Atrás» (va a `/admin/security`), «Alerta de seguridad», «Actualizar» y botón «Reconocer».
- Tarjeta: chip de severidad, chip de estado y nombre de la regla; «Qué significa» + la ayuda de la regla; filas «Quién», «Cuándo», «Regla afectada» (en «Revisión incompleta»), «Conteo» («{n} (umbral {umbral} en {minutos} min)» o los registros descartados), «Contados» (en «Lectura de muchas fichas de pacientes»: «Pacientes mostrados en listas y resultados de búsqueda» / «Fichas abiertas una a una»), «Sede» (nombre o «Varias o ninguna») y «Detectada»; enlace «Continúa una alerta anterior»; avisos «Esta alerta es sobre ti: debe reconocerla otro administrador.» (rojo) o «Reconociste esta alerta».
- «Correo al personal»: una frase de estado (p. ej. «Enviado a 2 destinatarios el {cuándo}.», «Pendiente de envío.», «En espera: el correo (SMTP) está desactivado o incompleto…», «Sin correo: las alertas de severidad baja solo se muestran en la aplicación.», «Falló: …») + las direcciones no entregadas.
- «Reconocimientos»: tarjetas «Nombre · fecha» con la nota (o «Sin nota») y, si aplica, «Reconocida por la persona a la que se refiere la alerta (el único administrador).»; vacío: «Nadie ha reconocido esta alerta todavía.»
- «Entradas de auditoría que originaron la alerta» + botón «Abrir registro de auditoría» + ayuda «La entrada que alcanzó el umbral está marcada. Abre una para ver su detalle.»; lista de identificadores (la que disparó la alerta, con bandera y «Alcanzó el umbral»).

**Campos**

Sin campos (la nota se escribe en [S-ADM-36](10_pantallas_admin.md#p-adm--s-adm-36--reconocer-alerta)).

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Reconocer» | Administrador | Abre [S-ADM-36](10_pantallas_admin.md#p-adm--s-adm-36--reconocer-alerta) → `SecurityService/AcknowledgeSecurityEvent` (nota). | Sí (diálogo) | «Alerta reconocida»; si la alerta es sobre uno mismo y hay otro administrador: «Esta alerta es sobre ti. Debe reconocerla otro administrador.» |
| «Continúa una alerta anterior» | Administrador | Navega al detalle de la alerta previa. | No | Otra [S-ADM-35](10_pantallas_admin.md#p-adm--s-adm-35--alerta-de-seguridad-detalle). |
| «Abrir registro de auditoría» | Administrador | Navega a `/admin/audit` (sin filtro previo). | No | [S-ADM-26](10_pantallas_admin.md#p-adm--s-adm-26--registro-de-auditoria). |
| Tocar un identificador de auditoría | Administrador | Abre la entrada. | No | [S-ADM-37](10_pantallas_admin.md#p-adm--s-adm-37--entrada-de-auditoria-desde-una-alerta). |
| «Actualizar» | Administrador | Relee el detalle. | No | — |

**Estados y mensajes**

- Cargando / error con «Reintentar» (p. ej. «No se encontró el registro solicitado.»).

**Tiempo real**

`security.event_acknowledged.v1` invalida el detalle abierto.

**Reglas de negocio**

- Reconocer es idempotente por administrador (se conserva la primera nota); varios administradores pueden reconocer la misma alerta.
- La nota se guarda cifrada y solo se devuelve en el detalle.
- Una alerta sobre el propio administrador debe reconocerla otro, salvo que sea el único (queda marcada como autorreconocida).
- Abrir el detalle queda auditado (`security_event.view`).
- «Correos de alerta sin entregar» aparece cuando el «Correo al personal» de otras alertas lleva horas en «Pendiente de envío.», «Enviándose.» o una de las frases «En espera: …»; su ayuda manda revisar los ajustes `smtp.*` y ese estado.

**Notas para el rediseño**

- Preservar el aviso «sobre ti», la explicación de la regla y la trazabilidad hasta la auditoría.
- El botón «Reconocer» sigue visible en alertas sobre uno mismo aunque el servidor lo rechace.
- Las entradas de auditoría se listan como UUID crudos y «Abrir registro de auditoría» no aplica ningún filtro.

**Código fuente:** `features/security/presentation/security_event_detail_page.dart`, `security_labels.dart`, `features/security/application/security_providers.dart`.

---

### <a id="p-adm--s-adm-36--reconocer-alerta"></a>S-ADM-36 Reconocer alerta

**Ruta:** diálogo sobre `/admin/security/<eventId>` · **Tipo:** diálogo

**Propósito**

Confirmar la revisión de una alerta con una nota opcional.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Con `security.events.ack`. |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Botón «Reconocer» de [S-ADM-35](10_pantallas_admin.md#p-adm--s-adm-35--alerta-de-seguridad-detalle).

**Distribución**

- Diálogo «Reconocer alerta»: texto «Confirma que revisaste esta alerta. Añade un número de incidente o por qué es esperada; nunca datos de pacientes.», campo «Nota (opcional)», botones «Cancelar» / «Reconocer».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Nota (opcional)» | Texto de 2 a 5 líneas, contador | No | Máx. 1000; si se excede, «Como máximo {max} caracteres» y el botón se deshabilita | No debe contener PHI (se cifra) |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Reconocer» | Administrador | Devuelve la nota recortada y [S-ADM-35](10_pantallas_admin.md#p-adm--s-adm-35--alerta-de-seguridad-detalle) llama a `AcknowledgeSecurityEvent`. | Este diálogo | «Alerta reconocida». |
| «Cancelar» o tocar fuera | Administrador | Cierra sin cambios. | — | — |

**Estados y mensajes**

Sin estados propios.

**Tiempo real**

Tras reconocer se refrescan de inmediato el detalle, la lista y el distintivo.

**Reglas de negocio**

- La nota no debe contener PHI; se guarda cifrada.

**Notas para el rediseño**

- Preservar el aviso de no incluir datos de pacientes y el límite de 1000 caracteres.

**Código fuente:** `features/security/presentation/acknowledge_dialog.dart`.

---

### <a id="p-adm--s-adm-37--entrada-de-auditoria-desde-una-alerta"></a>S-ADM-37 Entrada de auditoría (desde una alerta)

**Ruta:** diálogo sobre `/admin/security/<eventId>` · **Tipo:** diálogo

**Propósito**

Ver una entrada de auditoría concreta relacionada con la alerta.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Tocar un identificador en «Entradas de auditoría que originaron la alerta» ([S-ADM-35](10_pantallas_admin.md#p-adm--s-adm-35--alerta-de-seguridad-detalle)).

**Distribución**

- Diálogo «Entrada de auditoría» con texto monoespaciado: «Acción», «Ocurrió el», «Actor», «Tipo de entidad» + identificador, «Metadatos (censurados)» (JSON en una línea); botón «Cerrar».

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Abrir | Administrador | Carga la entrada con `AuditService/GetAuditEntry` (lectura auditada). | No | Detalle. |
| «Cerrar» | Administrador | Cierra. | No | — |

**Estados y mensajes**

- Cargando / error con «Reintentar»; una entrada de otra sede puede responder «No se encontró el registro solicitado.»

**Tiempo real**

No aplica.

**Reglas de negocio**

- Metadatos censurados.

**Notas para el rediseño**

- A diferencia de [S-ADM-27](10_pantallas_admin.md#p-adm--s-adm-27--entrada-de-auditoria-detalle), aquí el JSON va sin formato y faltan los identificadores de solicitud y correlación y la sede.

**Código fuente:** `features/security/presentation/security_event_detail_page.dart`, `features/admin/infrastructure/audit_gateway.dart`.

---

### <a id="p-adm--s-adm-38--banner-la-configuracion-del-sistema-esta-incompleta"></a>S-ADM-38 Banner «La configuración del sistema está incompleta»

**Ruta:** bajo la cabecera de cualquier página del marco · **Tipo:** banner

**Propósito**

Avisar al Administrador de que falta configuración y llevarlo a Configuración. Es el mismo banner descrito en [S-GEN-18](05_pantallas_generales.md#p-gen--s-gen-18--banner-de-configuracion-incompleta).

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Lo ve. |
| Recepción | Sin acceso | No se muestra; solo recibe el error «La configuración del sistema está incompleta.» en las acciones que fallan. |
| Enfermería / asistente médico | Sin acceso | Ídem. |
| Proveedor | Sin acceso | Ídem. |

**Cómo se llega**

Aparece solo mientras el servidor responde `setup_incomplete`.

**Distribución**

- Franja ámbar de 40 px: icono de aviso + «La configuración del sistema está incompleta. Solo Administración → Configuración está disponible hasta terminarla.» + «{n} pendiente(s)» + botón «Abrir configuración».

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Abrir configuración» | Administrador | Navega a `/admin/settings`. | No | [S-ADM-28](10_pantallas_admin.md#p-adm--s-adm-28--configuracion-marco-con-pestanas-y-barra-de-cambios-pendientes). |

**Estados y mensajes**

- Tiene prioridad sobre el banner de modo degradado ([S-GEN-19](05_pantallas_generales.md#p-gen--s-gen-19--banner-de-modo-degradado-emergencia-de-infraestructura)).

**Tiempo real**

Se reevalúa en cada reconexión (la resincronización invalida el estado del sistema).

**Reglas de negocio**

- Mientras dure, el servidor rechaza la operación clínica.

**Notas para el rediseño**

- Una sola línea con elipsis: en teléfono el número de pendientes puede cortarse.

**Código fuente:** `features/setup/presentation/setup_incomplete_banner.dart`, `core/routing/shell_screen.dart`.

---

### <a id="p-adm--s-adm-39--aviso-alerta-de-seguridad-en-notificaciones"></a>S-ADM-39 Aviso «Alerta de seguridad» en notificaciones

**Ruta:** panel de la campana de notificaciones (cabecera) · **Tipo:** panel

**Propósito**

Avisar dentro de la app de cada alerta de seguridad nueva. El centro de notificaciones completo está en [S-GEN-15](05_pantallas_generales.md#p-gen--s-gen-15--centro-de-notificaciones).

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Con `security.events.view`. |
| Recepción | Sin acceso | El aviso solo se acepta si llega por `admin:security` y el usuario tiene el permiso. |
| Enfermería / asistente médico | Sin acceso | Ídem. |
| Proveedor | Sin acceso | Ídem. |

**Cómo se llega**

Campana de notificaciones de la cabecera.

**Distribución**

- Entrada con icono de escudo, título «Alerta de seguridad» y texto «Revísala en Administración > Seguridad».

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Tocar la entrada | Administrador | La marca como leída, cierra el panel y navega a `/admin/security/<id>`. | No | [S-ADM-35](10_pantallas_admin.md#p-adm--s-adm-35--alerta-de-seguridad-detalle). |

**Estados y mensajes**

Sin estados propios (leída / no leída como el resto de avisos).

**Tiempo real**

Se crea con `security.event_raised.v1` del canal `admin:security`.

**Reglas de negocio**

- Las alertas de severidad Baja no se envían por correo; solo se muestran en la app.
- Las notificaciones viven solo en memoria: se pierden al recargar o cerrar sesión.

**Notas para el rediseño**

- El aviso no indica la severidad ni la regla; considerar mostrarlas.

**Código fuente:** `features/notifications/notifications_realtime.dart`, `features/notifications/application/notifications_controller.dart`, `features/notifications/presentation/notifications_panel.dart`, `notification_labels.dart`.

---

## <a id="p-adm--preguntas-abiertas-detectadas-en-estas-pantallas"></a>Preguntas abiertas detectadas en estas pantallas

1. La recuperación de emergencia (break-glass) solo existe como comando del servidor (`clinic-backend break-glass`). ¿Se documenta en el manual de usuario o solo en el manual de operaciones? ([S-ADM-26](10_pantallas_admin.md#p-adm--s-adm-26--registro-de-auditoria), [S-ADM-34](10_pantallas_admin.md#p-adm--s-adm-34--alertas-de-seguridad))
2. Para el restablecimiento de contraseña la app solo muestra el token y la pantalla de inicio de sesión no tiene dónde pegarlo. ¿Cómo debe entregar el administrador el enlace `/reset/<token>`, sobre todo desde Android, donde el enlace de invitación es solo una ruta? ([S-ADM-04](10_pantallas_admin.md#p-adm--s-adm-04--dialogo-de-secreto-de-un-solo-uso-invitacion--token-de-restablecimiento))
3. **Resuelta.** La app ya conoce la regla `wal_archive_lag` («Archivado de WAL con retraso», con ayuda, sujeto y opción en el filtro), igual que las otras dos reglas nuevas del servidor, `maintenance_rewrite_outside_job` y `alert_delivery_stalled`. ([S-ADM-34](10_pantallas_admin.md#p-adm--s-adm-34--alertas-de-seguridad))
4. ¿Deben ocultarse «Deshabilitar» y «Eliminar» en la propia fila y añadirse textos propios para `cannot_modify_self` y `cannot_remove_own_admin`, que hoy se muestran como «Esta acción no está permitida en el estado actual.»? ([S-ADM-02](10_pantallas_admin.md#p-adm--s-adm-02--usuarios), [S-ADM-06](10_pantallas_admin.md#p-adm--s-adm-06--editar-roles--editar-sedes-seleccion-multiple))
5. El servidor permite deshabilitar usuarios Invitados, pero la interfaz solo lo ofrece para Activos. ¿Es intencional? ([S-ADM-02](10_pantallas_admin.md#p-adm--s-adm-02--usuarios))
6. ¿Qué zona horaria deben usar las vistas de compañía (reportes, auditoría, alertas) cuando hay sedes en zonas distintas? Hoy usan la de la sede activa del administrador. ([S-ADM-24](10_pantallas_admin.md#p-adm--s-adm-24--reportes-de-la-compania-pestana-diario), [S-ADM-26](10_pantallas_admin.md#p-adm--s-adm-26--registro-de-auditoria))
7. ¿El filtro «Sede» de la Auditoría debería limitarse a las sedes asignadas al administrador (el servidor rechaza las demás)? ¿Y el de Reportes de la compañía debería excluir las sedes inactivas no asignadas? ([S-ADM-24](10_pantallas_admin.md#p-adm--s-adm-24--reportes-de-la-compania-pestana-diario), [S-ADM-26](10_pantallas_admin.md#p-adm--s-adm-26--registro-de-auditoria))
8. ¿Se quiere un selector de usuario en lugar del UUID para el filtro «Actor» de la Auditoría, y un filtro por alerta al pulsar «Abrir registro de auditoría» desde una alerta? ([S-ADM-26](10_pantallas_admin.md#p-adm--s-adm-26--registro-de-auditoria), [S-ADM-35](10_pantallas_admin.md#p-adm--s-adm-35--alerta-de-seguridad-detalle))
9. ¿Deben limpiarse al cerrar sesión el borrador de Configuración y el estado de la Auditoría (hoy siguen en memoria)? ([S-ADM-26](10_pantallas_admin.md#p-adm--s-adm-26--registro-de-auditoria), [S-ADM-28](10_pantallas_admin.md#p-adm--s-adm-28--configuracion-marco-con-pestanas-y-barra-de-cambios-pendientes))
10. Los ajustes `security.alerts.*`, `maintenance.*` y `backups.*` caen en el grupo «Otros»: ¿tendrán grupo propio? ¿Se traducirán las descripciones del registro de ajustes? ([S-ADM-31](10_pantallas_admin.md#p-adm--s-adm-31--configuracion--ajustes-campo-de-ajuste))
11. Un comentario del código dice que el motivo de reactivación «nunca se guarda», mientras la ayuda de la pantalla y la auditoría indican que se guarda cifrado; el manual sigue lo que hace el servidor (se guarda cifrado). Confirmar. ([S-ADM-09](10_pantallas_admin.md#p-adm--s-adm-09--reactivar-usuario))
12. Existe una página antigua de configuración sin ruta (código aparentemente muerto, [S-GEN-31](05_pantallas_generales.md#p-gen--s-gen-31--pantallas-heredadas-sin-ruta)). Confirmar que no está en uso.
13. No se pudo verificar desde el código del cliente qué ocurre con el personal conectado a una sede en el momento de desactivarla (expulsión inmediata o al siguiente intento de operación). ([S-ADM-10](10_pantallas_admin.md#p-adm--s-adm-10--sedes))
14. El aviso del portapapeles del diálogo de secreto de un solo uso reutiliza el texto de los códigos de recuperación («los códigos», «gestor de contraseñas», «al continuar»), aunque copia un enlace o un token y se cierra con «Cerrar». ¿Se escribe un texto propio? ([S-ADM-04](10_pantallas_admin.md#p-adm--s-adm-04--dialogo-de-secreto-de-un-solo-uso-invitacion--token-de-restablecimiento))
