# <a id="p-gen--05--pantallas-generales-s-gen"></a>05 — Pantallas generales (S-GEN)

Este capítulo describe, pantalla por pantalla, todo lo que es común a los cuatro roles: el arranque de la app y sus redirecciones, la configuración inicial del primer administrador, el inicio de sesión (con contraseña, con Google y con verificación en dos pasos), la aceptación de invitaciones y el restablecimiento de contraseña, la selección de sede, el marco de navegación con su cabecera (selector de sede, indicador en vivo, notificaciones y menú de cuenta), los banners globales, el cierre automático por inactividad, el Perfil del usuario y los componentes y estados que reutilizan todas las demás pantallas. Está pensado como referencia para el equipo que hará el rediseño visual (qué hace cada elemento y qué no se puede perder) y para el personal que aprende a moverse por la aplicación. Los textos entre comillas angulares («…») son las etiquetas reales de la interfaz en español; los nombres técnicos (`AuthService/LoginWithPassword`, `auth.idle_logout_minutes`…) se dan para el equipo de desarrollo. La sede activa forma parte de la URL con el prefijo `/app/<código>/` (por ejemplo `/app/LAN/dashboard`); algunos documentos de planificación antiguos usan `/l/<código>/`, pero la app real usa `/app/`.

## <a id="p-gen--como-leer-cada-ficha"></a>Cómo leer cada ficha

- **Acceso por rol**: «Completo» (ve y usa todo), «Limitado» (ve una parte o solo puede hacer algunas acciones), «Sin acceso» (no lo ve; si fuerza la URL la app lo devuelve al Panel o el servidor rechaza la petición), «Público» (no requiere sesión).
- **PHI**: «Sí» indica información de salud protegida o datos personales del paciente; se cifran en el servidor y nunca viajan en notificaciones ni en eventos en vivo. En este capítulo casi no hay PHI: los datos son del propio usuario (correo, nombre, contraseña) o secretos de seguridad.
- Los ejemplos (códigos `LAN-P-000123`, nombres, correos) son ficticios.
- La visibilidad de botones y menús es solo presentación: el servidor vuelve a comprobar rol y sede en cada petición.

## <a id="p-gen--indice-de-pantallas"></a>Índice de pantallas

| Id | Pantalla | Ruta / ubicación | Tipo |
| --- | --- | --- | --- |
| [S-GEN-01](05_pantallas_generales.md#p-gen--s-gen-01--arranque-y-redireccion-inicial) | Arranque y redirección inicial | `/` y cualquier URL inicial | Página |
| [S-GEN-02](05_pantallas_generales.md#p-gen--s-gen-02--configuracion-inicial-asistente-de-primer-arranque) | Configuración inicial (asistente de primer arranque) | `/setup` | Página |
| [S-GEN-03](05_pantallas_generales.md#p-gen--s-gen-03--iniciar-sesion) | Iniciar sesión | `/login` | Página |
| [S-GEN-04](05_pantallas_generales.md#p-gen--s-gen-04--sin-conexion-arranque-sin-servidor) | Sin conexión (arranque sin servidor) | `/login` (estado) | Página |
| [S-GEN-05](05_pantallas_generales.md#p-gen--s-gen-05--actualizacion-necesaria) | Actualización necesaria | Páginas públicas (estado) | Página |
| [S-GEN-06](05_pantallas_generales.md#p-gen--s-gen-06--verificacion-en-dos-pasos-codigo-al-iniciar-sesion) | Verificación en dos pasos (código al iniciar sesión) | `/login`, `/invite/:token`, `/setup` | Página |
| [S-GEN-07](05_pantallas_generales.md#p-gen--s-gen-07--configurar-la-verificacion-en-dos-pasos-inscripcion-obligatoria-al-iniciar-sesio) | Configurar la verificación en dos pasos (inscripción obligatoria) | `/login`, `/invite/:token`, `/setup` | Página |
| [S-GEN-08](05_pantallas_generales.md#p-gen--s-gen-08--guarde-sus-codigos-de-recuperacion-panel) | Guarde sus códigos de recuperación (panel) | Inicio de sesión y Perfil | Panel |
| [S-GEN-09](05_pantallas_generales.md#p-gen--s-gen-09--aceptar-invitacion) | Aceptar invitación | `/invite/:token` | Página |
| [S-GEN-10](05_pantallas_generales.md#p-gen--s-gen-10--restablecer-contrasena) | Restablecer contraseña | `/reset/:token` | Página |
| [S-GEN-11](05_pantallas_generales.md#p-gen--s-gen-11--seleccionar-sede) | Seleccionar sede | `/select-location` | Página |
| [S-GEN-12](05_pantallas_generales.md#p-gen--s-gen-12--marco-de-la-aplicacion-y-navegacion-principal) | Marco de la aplicación y navegación principal | `/app/<código>/…` y `/admin/…` | Página |
| [S-GEN-13](05_pantallas_generales.md#p-gen--s-gen-13--selector-de-sede-cabecera) | Selector de sede (cabecera) | Cabecera | Panel |
| [S-GEN-14](05_pantallas_generales.md#p-gen--s-gen-14--indicador-de-actualizaciones-en-vivo) | Indicador de actualizaciones en vivo | Cabecera | Panel |
| [S-GEN-15](05_pantallas_generales.md#p-gen--s-gen-15--centro-de-notificaciones) | Centro de notificaciones | Cabecera (campana) | Hoja |
| [S-GEN-16](05_pantallas_generales.md#p-gen--s-gen-16--menu-de-cuenta) | Menú de cuenta | Cabecera (avatar) | Panel |
| [S-GEN-17](05_pantallas_generales.md#p-gen--s-gen-17--confirmaciones-de-cierre-de-sesion) | Confirmaciones de cierre de sesión | Diálogo | Diálogo |
| [S-GEN-18](05_pantallas_generales.md#p-gen--s-gen-18--banner-de-configuracion-incompleta) | Banner de configuración incompleta | Bajo la cabecera | Banner |
| [S-GEN-19](05_pantallas_generales.md#p-gen--s-gen-19--banner-de-modo-degradado-emergencia-de-infraestructura) | Banner de modo degradado | Bajo la cabecera | Banner |
| [S-GEN-20](05_pantallas_generales.md#p-gen--s-gen-20--cierre-automatico-por-inactividad-aviso-y-cubierta) | Cierre automático por inactividad (aviso y cubierta) | Global | Diálogo |
| [S-GEN-21](05_pantallas_generales.md#p-gen--s-gen-21--perfil) | Perfil | `/app/<código>/profile` | Página |
| [S-GEN-22](05_pantallas_generales.md#p-gen--s-gen-22--verificacion-en-dos-pasos-seccion-del-perfil) | Verificación en dos pasos (sección del Perfil) | `/app/<código>/profile` | Panel |
| [S-GEN-23](05_pantallas_generales.md#p-gen--s-gen-23--dialogo-configurar-la-verificacion-en-dos-pasos-desde-el-perfil) | Diálogo «Configurar la verificación en dos pasos» (Perfil) | Diálogo sobre el Perfil | Diálogo |
| [S-GEN-24](05_pantallas_generales.md#p-gen--s-gen-24--dialogo-de-codigo-nuevos-codigos-de-recuperacion--desactivar) | Diálogo de código («Nuevos códigos de recuperación» / «Desactivar») | Diálogo sobre el Perfil | Diálogo |
| [S-GEN-25](05_pantallas_generales.md#p-gen--s-gen-25--dialogo-guarde-sus-codigos-de-recuperacion-perfil) | Diálogo «Guarde sus códigos de recuperación» (Perfil) | Diálogo sobre el Perfil | Diálogo |
| [S-GEN-26](05_pantallas_generales.md#p-gen--s-gen-26--descartar-cambios-sin-guardar) | ¿Descartar cambios sin guardar? | Diálogo sobre formularios | Diálogo |
| [S-GEN-27](05_pantallas_generales.md#p-gen--s-gen-27--dialogo-de-confirmacion-generico) | Diálogo de confirmación genérico | Diálogo | Diálogo |
| [S-GEN-28](05_pantallas_generales.md#p-gen--s-gen-28--estados-comunes-de-carga-vacio-y-error) | Estados comunes de carga, vacío y error | Dentro de cualquier pantalla | Panel |
| [S-GEN-29](05_pantallas_generales.md#p-gen--s-gen-29--pagina-no-encontrada) | Página no encontrada | Ruta inexistente | Página |
| [S-GEN-30](05_pantallas_generales.md#p-gen--s-gen-30--componentes-compartidos-de-presentacion) | Componentes compartidos de presentación | Dentro de las pantallas | Panel |
| [S-GEN-31](05_pantallas_generales.md#p-gen--s-gen-31--pantallas-heredadas-sin-ruta) | Pantallas heredadas sin ruta | Ninguna | Página |

---

### <a id="p-gen--s-gen-01--arranque-y-redireccion-inicial"></a>S-GEN-01 Arranque y redirección inicial

**Ruta:** `/` y cualquier URL con la que se abra la app · **Tipo:** página sin contenido propio

**Propósito**

Ejecuta la secuencia de arranque (preferencias locales → canal gRPC → restaurar sesión → `AuthService/GetCurrentUser` → `LocationService/ListMyLocations` → sede activa → WebSocket) y decide a qué pantalla debe ir el usuario. La guarda de rutas (`RouteGuard`) repite esta decisión en cada navegación y cada vez que cambian la sesión, las sedes, la sede activa o el estado de la configuración inicial.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Sin sesión | Público | Termina en [S-GEN-02](05_pantallas_generales.md#p-gen--s-gen-02--configuracion-inicial-asistente-de-primer-arranque) (instalación pendiente) o en [S-GEN-03](05_pantallas_generales.md#p-gen--s-gen-03--iniciar-sesion). |
| Administrador | Completo | Aterriza en el Panel de su sede activa; es el único que puede entrar a `/admin/…`. |
| Recepción | Completo | Aterriza en el Panel de su sede activa. |
| Enfermería / asistente médico | Completo | Aterriza en el Panel de su sede activa. |
| Proveedor | Completo | Aterriza en el Panel de su sede activa. |

**Cómo se llega**

Abriendo la app, recargando la pestaña del navegador o abriendo cualquier enlace profundo (por ejemplo una notificación o un enlace compartido).

**Distribución**

- Pantalla en blanco con un indicador circular centrado mientras la sesión está en estado «desconocido» o mientras se espera `SetupService/GetSetupStatus` en `/`.
- No muestra el marco ni datos hasta que la guarda decide el destino.

**Campos**

Sin campos de entrada.

**Acciones (todas automáticas)**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Sin sesión en `/` | Sistema | Consulta `GetSetupStatus.needs_setup`. | No | `true` → `/setup` ([S-GEN-02](05_pantallas_generales.md#p-gen--s-gen-02--configuracion-inicial-asistente-de-primer-arranque)); `false` → `/login` ([S-GEN-03](05_pantallas_generales.md#p-gen--s-gen-03--iniciar-sesion)). |
| Sin sesión en una URL protegida | Sistema | Guarda la URL de origen. | No | `/login?from=<URL codificada>`. Si la sesión terminó por inactividad → `/login?reason=idle` sin `from` (también elimina un `from` presente). |
| Sin sesión en `/setup` o `/login` | Sistema | Compara con `needs_setup`. | No | `/setup` con instalación hecha → `/login`; `/login` con instalación pendiente → `/setup`. |
| Con sesión en `/`, `/login` o página pública | Sistema | Calcula el «inicio». | No | `/app/<código de la sede activa>/dashboard`. Sin sede activa y con una sola sede → Panel de esa sede; con varias → `/select-location` ([S-GEN-11](05_pantallas_generales.md#p-gen--s-gen-11--seleccionar-sede)). |
| Con sesión y `/login?from=<ruta>` | Sistema | Valida la ruta de retorno. | No | Vuelve a `from` solo si es interna y segura (empieza por `/`, no por `//`, no es pública ni `/`); si no, al inicio. |
| Con sesión en `/setup` | Sistema | — | No | Administrador → `/admin/settings`; otros roles → inicio. |
| `/app/<código>` sin sub-ruta, `/admin` sin sub-ruta | Sistema | Completa la ruta. | No | `/app/<código>/dashboard` y `/admin/users`. |
| `/app/<código>/…` con un código que no es sede asignada | Sistema | Compara sin distinguir mayúsculas. | No | Inicio, o `/select-location` si el usuario no tiene sedes. |
| `/app/<código de otra sede propia>/…` | Sistema | Cambia la sede activa (misma secuencia que [S-GEN-13](05_pantallas_generales.md#p-gen--s-gen-13--selector-de-sede-cabecera)). | No | Si hay formularios con cambios sin guardar, se rechaza sin diálogo y se vuelve a la última URL de sede permitida. |
| `/admin/…` sin rol Administrador | Sistema | — | No | Inicio, sin mensaje. |
| Ruta cuyo permiso no tiene el usuario | Sistema | Consulta `routePermissions`. | No | Inicio, sin mensaje. |
| Ruta inexistente | Sistema | — | No | [S-GEN-29](05_pantallas_generales.md#p-gen--s-gen-29--pagina-no-encontrada) «Página no encontrada». |

**Estados y mensajes**

- Cargando: indicador circular (arranque sin terminar o estado de instalación cargando).
- Sesión guardada cuya marca de inactividad está vencida o es ilegible: se cierra como cierre por inactividad antes de cualquier renovación; aterriza en `/login?reason=idle` con el aviso de [S-GEN-03](05_pantallas_generales.md#p-gen--s-gen-03--iniciar-sesion).
- Error de red al restaurar: los tokens se conservan y `/login` muestra [S-GEN-04](05_pantallas_generales.md#p-gen--s-gen-04--sin-conexion-arranque-sin-servidor) «Sin conexión».
- `GetCurrentUser` devuelve un estado distinto de activo: cierre forzado; `/login` muestra «Tu cuenta ya no está activa. Contacta a un administrador.»
- Sede activa rechazada por el servidor (`location_denied` / `location_not_allowed`): se descarta esa sede y se reintenta una vez sin ella.
- `UNAUTHENTICATED` en `GetCurrentUser`: una renovación del token y un reintento; si sigue rechazado, cierre forzado.

**Tiempo real**

Al terminar el arranque se abre el WebSocket (si `realtime.enabled` está activo) y arranca el vigilante de modo degradado ([S-GEN-19](05_pantallas_generales.md#p-gen--s-gen-19--banner-de-modo-degradado-emergencia-de-infraestructura)); ambos acompañan a la sesión durante toda la vida de la app.

**Reglas de negocio**

- Orden de las guardas: autenticado → usuario activo → sede autorizada → permiso de rol. Es solo presentación: el servidor valida rol y sede en cada petición.
- La sede activa va en la URL (`/app/<código>/…`) y en cada petición de sede como cabecera `x-active-location-id`; el servidor la valida y la confirma en `GetCurrentUser.active_location_id`.
- Prioridad de la sede activa: la ya seleccionada en memoria > la que confirma el servidor > la recordada en el dispositivo (clave `clinic.active_location_id`) > la única sede si solo hay una. Una sede recordada que ya no está asignada se olvida.
- Un cierre forzado (sesión revocada, usuario desactivado, renovación rechazada, inactividad) olvida la sede recordada; un cierre voluntario la conserva.
- Todo cierre de sesión ejecuta la misma limpieza local ([S-GEN-17](05_pantallas_generales.md#p-gen--s-gen-17--confirmaciones-de-cierre-de-sesion)), también el que se hace aquí con una marca de inactividad vencida o ilegible: en Android vacía, por ejemplo, las carpetas de caché de los selectores de archivos y de compartir, por si una sesión anterior dejó copias.
- Web: el token de acceso vive solo en memoria; el de renovación y la marca de inactividad, en el `sessionStorage` de la pestaña (una pestaña nueva pide iniciar sesión). Android: almacenamiento seguro del sistema; la app está excluida de la copia de seguridad automática de Android (`allowBackup=false`, `fullBackupContent=false`), así que ni ese almacenamiento ni las preferencias se suben a la copia en la nube (restaurado en otro dispositivo, el almacenamiento seguro tampoco serviría: la clave del Keystore no viaja con él).
- Zona horaria por defecto `America/Chicago` si la sede no tiene una.

**Notas para el rediseño**

- Mantener la pantalla neutra durante el arranque: nada de datos ni del marco antes de que la guarda decida (evita mostrar por un instante la pantalla de otro usuario).
- Las redirecciones por falta de permiso o de sede son silenciosas (vuelven al Panel); si se añade un aviso, no debe revelar la existencia del recurso.
- No reintroducir `from` después de un cierre por inactividad (regla HIPAA: el siguiente usuario empieza en su propio inicio).

**Código fuente:** `frontend/lib/main.dart`, `bootstrap.dart`, `app.dart`, `core/routing/app_router.dart`, `core/routing/routes.dart`, `core/auth/session_controller.dart`, `core/auth/session_state.dart`, `core/auth/session_store_web.dart`, `core/auth/session_store_io.dart`, `core/locations/active_location_controller.dart`, `features/setup/application/setup_status_provider.dart`.

---

### <a id="p-gen--s-gen-02--configuracion-inicial-asistente-de-primer-arranque"></a>S-GEN-02 Configuración inicial (asistente de primer arranque)

**Ruta:** `/setup` · **Tipo:** página pública

**Propósito**

Crear la primera cuenta de administrador con el token de instalación que imprime el servidor, e iniciar sesión con ella.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Sin sesión (instalador) | Público | Solo mientras el servidor responde `needs_setup = true`; si la instalación ya está hecha, `/setup` redirige a `/login`. La cuenta creada recibe el rol Administrador. |
| Administrador | Sin acceso | Con sesión iniciada, `/setup` redirige a `/admin/settings`. |
| Recepción | Sin acceso | Con sesión iniciada, redirige al inicio. |
| Enfermería / asistente médico | Sin acceso | Con sesión iniciada, redirige al inicio. |
| Proveedor | Sin acceso | Con sesión iniciada, redirige al inicio. |

**Cómo se llega**

Automáticamente en el primer arranque desde `/`; también con el botón «Ir a la configuración inicial» del banner de error del login cuando el servidor responde `setup_incomplete`.

**Distribución**

- Barra superior: nombre de la app (`app_name` del servidor o «Clínica Hispana Lancaster») y menú de idioma (icono de globo, tooltip «Idioma»).
- Tarjeta centrada (máx. 560 px): icono de administrador, título «Configuración inicial», subtítulo «Bienvenido. Crea la primera cuenta de administrador para empezar a usar el sistema.» (oculto en el paso Listo).
- Encabezado de pasos: 1 «Token de instalación» — 2 «Administrador» — 3 «Listo»; círculos numerados, los completados muestran ✓ y la línea se colorea hasta el paso actual.
- Cuerpo del paso actual: formulario, banner de error y botones.

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| Paso 1 — «Token de instalación» | Texto monoespaciado, sin autocorrección | Sí («Este campo es obligatorio.») | Se recortan espacios; no se valida contra el servidor hasta crear el administrador. Ayuda: «El servidor lo imprime una vez al arrancar como “SETUP TOKEN: …” y también lo guarda en setup-token.txt junto al servidor. Pégalo exactamente como aparece.» | No (secreto de instalación) |
| Paso 2 — «Correo electrónico» | Email | Sí | Formato válido, máx. 254 («Ingrese un correo electrónico válido.») | No |
| Paso 2 — «Nombre para mostrar» | Texto, mayúscula inicial por palabra | Sí | Se recorta | No |
| Paso 2 — «Contraseña» | Oculta, con botón ojo («Mostrar contraseña» / «Ocultar contraseña») | Sí | 10–128 caracteres, al menos una letra y un dígito. Ayuda «Al menos 10 caracteres con una letra y un dígito.» Errores: «La contraseña debe tener al menos 10 caracteres.», «La contraseña debe tener como máximo 128 caracteres.», «La contraseña debe contener al menos una letra y un dígito.» | No (no se guarda en el cliente) |
| Paso 2 — «Confirmar contraseña» | Oculta | Sí | Debe coincidir («Las contraseñas no coinciden.») | No |

En el paso 2 se muestra el texto «Esta cuenta recibe el rol ADMINISTRADOR. Después podrás invitar al resto del equipo.»

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Siguiente» (paso 1) | Instalador | Guarda el token en memoria y pasa al paso 2 (sin llamar al servidor). Deshabilitado durante un bloqueo por intentos. | No | Paso 2. |
| «Atrás» (paso 2) | Instalador | Vuelve al paso 1 conservando el token. | No | Paso 1. |
| «Crear administrador» | Instalador | `SetupService/CreateFirstAdmin` (token, correo, contraseña, nombre, dispositivo «clinic-app web» o «clinic-app android»); spinner en el botón. | No | Con tokens: inicia sesión y pasa a Listo. Con reto de verificación en dos pasos (por defecto `auth.mfa.required_roles` = Administrador): [S-GEN-07](05_pantallas_generales.md#p-gen--s-gen-07--configurar-la-verificacion-en-dos-pasos-inscripcion-obligatoria-al-iniciar-sesio) con la introducción «Un último paso: proteja la cuenta de administrador con la verificación en dos pasos.» |
| «Volver a iniciar sesión» (dentro de la verificación en dos pasos) | Instalador | Cancela el reto, vuelve a leer el estado de instalación. | No | `/login` (el administrador ya existe). |
| «Ir a configuración» (paso Listo) | Administrador | — | No | `/admin/settings`. |
| «Ir a iniciar sesión» (pantalla «Ya completada») | Cualquiera | Vuelve a leer el estado. | No | `/login`. |
| «Reintentar» | Cualquiera | Repite `GetSetupStatus` cuando falló. | No | Recarga el asistente. |

**Estados y mensajes**

- Cargando el estado de instalación: spinner dentro de la tarjeta.
- Error al cargar `GetSetupStatus`: icono de error, «Algo salió mal», mensaje traducido y «Reintentar».
- Token inválido (`invalid_setup_token`): vuelve al paso 1 con banner rojo «El token de instalación no es válido, caducó o ya se usó. Revisa el registro del servidor e inténtalo de nuevo.»
- Correo en uso (`email_taken`): «Ese correo ya está en uso.»
- Ya completada (`setup_already_done` o `needs_setup = false`): «La instalación ya se completó» / «Ya existe un administrador. Inicia sesión con tu cuenta de administrador.» + «Ir a iniciar sesión».
- Demasiados intentos (`RESOURCE_EXHAUSTED`): banner con cuenta regresiva «Demasiados intentos. Podrás intentarlo de nuevo en {N} s.»; formulario bloqueado hasta 0.
- Versión de la app no admitida (`client_outdated`): [S-GEN-05](05_pantallas_generales.md#p-gen--s-gen-05--actualizacion-necesaria).
- Paso Listo: icono ✓, «Instalación completada» / «Tu cuenta de administrador está lista y ya iniciaste sesión. Termina la configuración en Admin → Configuración.»

**Tiempo real**

Ninguno (página pública).

**Reglas de negocio**

- Solo se puede crear un primer administrador; el token de instalación es de un solo uso.
- La guarda alterna `/setup` y `/login` según `needs_setup` (se consulta una vez por sesión de la app y se guarda en caché).
- Con la configuración por defecto, el administrador no obtiene sesión sin activar antes la verificación en dos pasos ([S-GEN-07](05_pantallas_generales.md#p-gen--s-gen-07--configurar-la-verificacion-en-dos-pasos-inscripcion-obligatoria-al-iniciar-sesio) y [S-GEN-08](05_pantallas_generales.md#p-gen--s-gen-08--guarde-sus-codigos-de-recuperacion-panel)).

**Notas para el rediseño**

- Preservar el orden token → datos → (verificación en dos pasos → códigos) → listo, y que un token inválido devuelva al paso 1.
- Probable: con el router real, al quedar autenticado la guarda redirige `/setup` → `/admin/settings`, así que el paso «Listo» puede no llegar a verse (las pruebas lo comprueban montando la página sin router). Confirmar antes de diseñarlo.
- Inconsistencia de texto: «Admin → Configuración» frente al menú «Administración».
- El token debe poder pegarse tal cual (monoespaciado, sin autocorrección ni sugerencias).

**Código fuente:** `features/setup/presentation/setup_wizard_page.dart`, `features/setup/application/setup_wizard_controller.dart`, `setup_status_provider.dart`, `features/setup/infrastructure/setup_gateway.dart`, `features/setup/application/app_name_provider.dart`, `features/auth/presentation/widgets/auth_scaffold.dart`, `password_field.dart`, `shared/validators/validators.dart`.

---

### <a id="p-gen--s-gen-03--iniciar-sesion"></a>S-GEN-03 Iniciar sesión

**Ruta:** `/login` (variantes `?from=<url>` y `?reason=idle`) · **Tipo:** página pública

**Propósito**

Autenticarse con correo y contraseña o con Google; si la cuenta tiene verificación en dos pasos, el segundo paso continúa en la misma URL.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Sin sesión | Público | Igual para los cuatro roles. No existe «crear cuenta»: se entra por invitación ([S-GEN-09](05_pantallas_generales.md#p-gen--s-gen-09--aceptar-invitacion)). |
| Administrador | Público | Por defecto su rol exige verificación en dos pasos ([S-GEN-06](05_pantallas_generales.md#p-gen--s-gen-06--verificacion-en-dos-pasos-codigo-al-iniciar-sesion) / [S-GEN-07](05_pantallas_generales.md#p-gen--s-gen-07--configurar-la-verificacion-en-dos-pasos-inscripcion-obligatoria-al-iniciar-sesio)). |
| Recepción | Público | Segundo paso solo si lo activó voluntariamente o su rol se añade a `auth.mfa.required_roles`. |
| Enfermería / asistente médico | Público | Igual que Recepción. |
| Proveedor | Público | Igual que Recepción. |

Con sesión iniciada la guarda redirige al destino.

**Cómo se llega**

Automáticamente sin sesión; después de cerrar sesión; después de un cierre por inactividad; con los botones «Ir a iniciar sesión» / «Volver a iniciar sesión» de las páginas públicas.

**Distribución**

- Barra superior: nombre de la app y menú de idioma (Inglés / Español, marcado el actual).
- Tarjeta centrada (máx. 460 px): icono de hospital, título «Iniciar sesión», subtítulo «Inicia sesión para continuar.»
- Banner informativo (color secundario, icono ⓘ) si la sesión anterior terminó, con el motivo.
- Campos «Correo electrónico» y «Contraseña».
- Banner de error rojo (con acción opcional) bajo los campos.
- Botón principal «Iniciar sesión».
- Si Google está habilitado: separador «O» y botón «Continuar con Google».
- Texto al pie: «¿Olvidaste tu contraseña? Pide a un administrador un enlace de restablecimiento.» (no es un enlace).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Correo electrónico» | Email, foco automático, autocompletado de usuario | Sí | «Este campo es obligatorio.» / «Ingrese un correo electrónico válido.»; se recorta al enviar | No |
| «Contraseña» | Oculta, botón ojo (tooltip «Mostrar contraseña» / «Ocultar contraseña») | Sí | Obligatoria; Enter envía el formulario | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Iniciar sesión» | Todos | `AuthService/LoginWithPassword` (correo, contraseña, nombre de dispositivo) → tokens → `GetCurrentUser`. Spinner en el botón; campos deshabilitados mientras envía y hasta navegar. | No | La guarda navega a `?from=` o al inicio. Si el servidor pide segundo paso: VERIFY → [S-GEN-06](05_pantallas_generales.md#p-gen--s-gen-06--verificacion-en-dos-pasos-codigo-al-iniciar-sesion); ENROLL → [S-GEN-07](05_pantallas_generales.md#p-gen--s-gen-07--configurar-la-verificacion-en-dos-pasos-inscripcion-obligatoria-al-iniciar-sesio). |
| «Continuar con Google» | Todos, si está habilitado | Android: selector nativo de cuentas → token de identidad → `AuthService/LoginWithGoogle`. Web: botón dibujado por Google Identity Services (píldora «Continuar con Google» en el idioma de la app). | No | Igual que con contraseña. Cancelar el selector nativo no muestra error. |
| «Ir a la configuración inicial» (dentro del banner) | Cualquiera | Solo cuando el error es `setup_incomplete`. | No | `/setup` ([S-GEN-02](05_pantallas_generales.md#p-gen--s-gen-02--configuracion-inicial-asistente-de-primer-arranque)). |
| Menú de idioma | Cualquiera | Cambia el idioma local (guardado en el dispositivo). | No | Textos en el idioma elegido. |

**Estados y mensajes**

- Errores del formulario (banner rojo con región en vivo para lectores de pantalla):
- «Correo o contraseña incorrectos.»
- Cuenta desactivada o eliminada, o `PERMISSION_DENIED`: «Tu cuenta ya no está activa. Contacta a un administrador.»
- «El acceso con Google no está habilitado. Inicia sesión con tu correo y contraseña.»
- «El acceso con Google no se completó. Inténtalo de nuevo o usa tu contraseña.»
- «Se canceló el acceso con Google.»
- Dominio no permitido: «Esta cuenta de Google no pertenece al Google Workspace de la clínica. Use su cuenta de Google de la clínica, o inicie sesión con su correo y contraseña.»
- Dominio sin configurar: «El inicio de sesión con Google aún no está disponible: un administrador debe limitarlo antes al dominio de la clínica. Inicie sesión con su correo y contraseña.»
- Restablecimiento de verificación pendiente (Google): «Un administrador restableció la verificación en dos pasos de esta cuenta…»
- Instalación incompleta: «El sistema aún se está configurando. Un administrador debe terminar la configuración antes de continuar.» + botón «Ir a la configuración inicial».
- Red: «No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.»
- El resto, según el mapeo central de [S-GEN-28](05_pantallas_generales.md#p-gen--s-gen-28--estados-comunes-de-carga-vacio-y-error).
- Demasiados intentos (`RESOURCE_EXHAUSTED`, con el `retry-after` del servidor o 60 s si falta): banner con cuenta regresiva «Demasiados intentos. Podrás intentarlo de nuevo en {N} s.»; formulario y Google deshabilitados hasta 0; luego se desbloquea solo.
- Banner informativo de sesión terminada:
- Inactividad: «Se cerró tu sesión tras {minutes} minutos de inactividad.» (o «Se cerró tu sesión por inactividad.» si no se conoce el límite).
- Sesión revocada o expirada: «Tu sesión terminó. Inicia sesión de nuevo.»
- Verificación en dos pasos ahora exigida: «Su cuenta ahora está protegida con la verificación en dos pasos. Inicie sesión de nuevo para continuar.»
- Reautenticación fallida: «Se cerró su sesión en todos los dispositivos tras demasiadas contraseñas incorrectas. Inicie sesión de nuevo.»
- Cuenta inactiva: «Tu cuenta ya no está activa. Contacta a un administrador.»
- Otros motivos con el texto central (por ejemplo, versión desactualizada).
- Sesión guardada sin red: [S-GEN-04](05_pantallas_generales.md#p-gen--s-gen-04--sin-conexion-arranque-sin-servidor) reemplaza el formulario.
- Respuesta `client_outdated` del formulario: [S-GEN-05](05_pantallas_generales.md#p-gen--s-gen-05--actualizacion-necesaria).
- Segundo paso en curso: [S-GEN-06](05_pantallas_generales.md#p-gen--s-gen-06--verificacion-en-dos-pasos-codigo-al-iniciar-sesion), [S-GEN-07](05_pantallas_generales.md#p-gen--s-gen-07--configurar-la-verificacion-en-dos-pasos-inscripcion-obligatoria-al-iniciar-sesio) o [S-GEN-08](05_pantallas_generales.md#p-gen--s-gen-08--guarde-sus-codigos-de-recuperacion-panel) reemplazan el formulario.

**Tiempo real**

Ninguno.

**Reglas de negocio**

- El botón de Google aparece solo si la compilación tiene identificador de cliente para la plataforma **y** el servidor lo habilita (`GetSetupStatus.google_sign_in_enabled`). Google solo autentica: roles y sedes los decide el servidor; puede restringirse a dominios de Workspace (`auth.google.allowed_domains`).
- Tras un inicio correcto: `?from=` si es una ruta interna segura; si no, Panel de la sede activa o [S-GEN-11](05_pantallas_generales.md#p-gen--s-gen-11--seleccionar-sede).
- Después de un cierre por inactividad nunca se conserva `from`.
- El idioma elegido aquí es local; al iniciar sesión se aplica la preferencia guardada en el servidor (puede sobrescribirlo).

**Notas para el rediseño**

- Preservar el autocompletado (usuario y contraseña), Enter para enviar, el banner con región en vivo y la cuenta regresiva que desbloquea sola.
- En web el botón de Google lo dibuja Google: solo admite sus temas (contorno en tema claro, relleno negro en oscuro), tamaño grande y forma de píldora.
- «¿Olvidaste tu contraseña?» es texto informativo: no existe recuperación autoservicio.
- Inconsistencia de tono: el login tutea («Inicia sesión») y otros mensajes usan usted («Inicie sesión», «Revise su conexión»).

**Código fuente:** `features/auth/presentation/login_page.dart`, `features/auth/application/login_controller.dart`, `auth_failure_text.dart`, `widgets/auth_failure_banner.dart`, `widgets/auth_scaffold.dart`, `widgets/password_field.dart`, `widgets/google_sign_in_button.dart`, `widgets/google_button_native.dart`, `widgets/google_button_web.dart`, `widgets/retry_countdown.dart`, `widgets/language_menu_button.dart`, `features/auth/infrastructure/google_auth.dart`, `device_name.dart`, `core/auth/auth_gateway.dart`, `shared/validators/validators.dart`.

---

### <a id="p-gen--s-gen-04--sin-conexion-arranque-sin-servidor"></a>S-GEN-04 Sin conexión (arranque sin servidor)

**Ruta:** `/login` (estado de la página) · **Tipo:** página

**Propósito**

Explicar que el servidor no responde y permitir reintentar sin perder la sesión guardada en el dispositivo.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Si tenía una sesión guardada que no se pudo restaurar por falta de red. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Completo | Ídem. |
| Proveedor | Completo | Ídem. |

**Cómo se llega**

Automáticamente en `/login` cuando la restauración de la sesión terminó con error de red y el formulario no tiene otro error.

**Distribución**

- Barra superior con nombre de la app y menú de idioma.
- Tarjeta: icono de nube tachada, título «Sin conexión», texto «No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.», botón «Reintentar».

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Reintentar» | Todos | Vuelve a ejecutar la restauración (`RefreshSession` si hace falta y `GetCurrentUser`); spinner y botón deshabilitado mientras reintenta. | No | Si funciona, la guarda navega al destino. |

**Estados y mensajes**

- Reintentando: spinner.
- Vuelve a fallar por red: la pantalla sigue.
- Otro error: se muestra el formulario de [S-GEN-03](05_pantallas_generales.md#p-gen--s-gen-03--iniciar-sesion) con el motivo.

**Tiempo real**

Ninguno.

**Reglas de negocio**

- Los errores transitorios (red, límite de intentos, error del servidor) no cierran la sesión: los tokens se conservan para reintentar.

**Notas para el rediseño**

- Hoy no ofrece el formulario de login ni «usar otra cuenta»: solo reintentar.

**Código fuente:** `features/auth/presentation/offline_page.dart`, `login_page.dart`, `core/auth/session_controller.dart`.

---

### <a id="p-gen--s-gen-05--actualizacion-necesaria"></a>S-GEN-05 Actualización necesaria

**Ruta:** estado de `/login`, `/invite/:token`, `/reset/:token` y `/setup` · **Tipo:** página

**Propósito**

Bloquear el uso de una versión de la app que el servidor ya no admite.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Sin sesión | Público | En las páginas públicas. |
| Administrador | Completo | Dentro de la app recibe el error y la notificación equivalentes. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Completo | Ídem. |
| Proveedor | Completo | Ídem. |

**Cómo se llega**

Automáticamente cuando la petición del formulario público responde `client_outdated` (`FAILED_PRECONDITION`) o `invalid_client_version` (`INVALID_ARGUMENT`).

**Distribución**

- Tarjeta: icono de actualización, «Actualización necesaria», «Esta versión de la aplicación ya no es compatible. Instala la versión más reciente desde la tienda o recarga la página si usas la versión web.», «Versión instalada: {version}», botón «Ir a iniciar sesión».

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Ir a iniciar sesión» | Todos | Descarta el error. | No | Vuelve a mostrar el formulario de la misma página (útil tras actualizar en otra pestaña). |

**Estados y mensajes**

- Dentro de la app (con sesión) el mismo motivo aparece como error «Esta versión de la aplicación está desactualizada. Actualícela.» y como notificación «Actualización requerida» ([S-GEN-15](05_pantallas_generales.md#p-gen--s-gen-15--centro-de-notificaciones)).

**Tiempo real**

Ninguno.

**Reglas de negocio**

- Cada petición envía `x-client-version`; el servidor la compara con `auth.min_client_version`. El cliente no bloquea por sí mismo.

**Notas para el rediseño**

- El botón dice «Ir a iniciar sesión» también en invitación, restablecimiento e instalación, donde en realidad solo vuelve al mismo formulario: etiqueta engañosa.

**Código fuente:** `features/auth/presentation/client_outdated_view.dart`, `core/grpc/grpc_error_mapper.dart`, `core/grpc/clinic_interceptor.dart`.

---

### <a id="p-gen--s-gen-06--verificacion-en-dos-pasos-codigo-al-iniciar-sesion"></a>S-GEN-06 Verificación en dos pasos (código al iniciar sesión)

**Ruta:** `/login`, `/invite/:token` o `/setup` (la URL no cambia) · **Tipo:** página

**Propósito**

Completar el inicio de sesión con un código de la aplicación de autenticación (TOTP) o con un código de recuperación.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Por defecto obligatorio (`auth.mfa.required_roles` = Administrador). |
| Recepción | Limitado | Solo si activó la verificación voluntariamente o su rol pasa a ser obligatorio. |
| Enfermería / asistente médico | Limitado | Ídem. |
| Proveedor | Limitado | Ídem. |

**Cómo se llega**

Después de una contraseña o cuenta de Google válida, cuando el servidor responde `mfa_step = VERIFY`.

**Distribución**

- Tarjeta (máx. 520 px): icono de escudo, título «Verificación en dos pasos», subtítulo «Ingrese el código de 6 dígitos de su aplicación de autenticación.» (en modo recuperación: «Ingrese uno de los códigos de recuperación que guardó al configurar la verificación en dos pasos.»).
- Campo de código, banner de error, botón «Verificar», botón de texto para alternar el modo, botón de texto «Volver a iniciar sesión».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Código de verificación» | Numérico, solo dígitos, máx. 6, monoespaciado, foco automático, autocompletado de código de un solo uso | Sí | «Ingrese los 6 dígitos del código.»; ayuda «6 dígitos; cambia cada 30 segundos.»; se envía solo al escribir el sexto dígito | No (secreto) |
| «Código de recuperación» (modo alternativo) | Texto en mayúsculas, monoespaciado | Sí | 12 símbolos ignorando espacios y guiones (formato XXXX-XXXX-XXXX): «Ingrese los 12 caracteres del código de recuperación.»; ayuda «Cada código de recuperación sirve una sola vez.» | No (secreto) |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Verificar» | Usuario con el reto | `AuthService/VerifyMfa` (reto + código o código de recuperación + dispositivo). | No | Tokens → sesión iniciada → la guarda navega. |
| «Usar un código de recuperación» / «Usar un código de la aplicación de autenticación» | Ídem | Alterna el modo y vacía los campos. | No | Cambia el campo visible. |
| «Volver a iniciar sesión» | Ídem | Descarta el reto. | No | En login vuelve al formulario; en invitación e instalación va a `/login`. |

**Estados y mensajes**

- Enviando: spinner en «Verificar», campos deshabilitados.
- Código incorrecto: «Ese código no es válido. Revise la aplicación e inténtelo de nuevo.» y el campo se vacía.
- Reto vencido, usado o con 5 códigos erróneos: «Este intento de inicio de sesión venció o tuvo demasiados códigos incorrectos. Inicie sesión de nuevo.» → solo queda «Volver a iniciar sesión».
- Bloqueada (10 códigos erróneos seguidos): «La verificación en dos pasos está bloqueada tras demasiados códigos erróneos seguidos. Pida a un administrador que la restablezca: también fijará una contraseña nueva.» → solo «Volver a iniciar sesión».
- Demasiados intentos: cuenta regresiva y formulario bloqueado.
- Usuario desactivado justo después: banner con el motivo.

**Tiempo real**

Ninguno.

**Reglas de negocio**

- El reto y cualquier secreto viven solo en memoria y se descartan al salir; nada se guarda en el dispositivo.

**Notas para el rediseño**

- Preservar el envío automático al sexto dígito, el teclado numérico, el autocompletado de códigos de un solo uso y el vaciado del campo tras un rechazo.
- Mantener el formato monoespaciado del código y del código de recuperación.

**Código fuente:** `features/auth/presentation/mfa/mfa_flow_view.dart`, `mfa/mfa_code_field.dart`, `features/auth/application/mfa_flow_controller.dart`, `mfa_failure_text.dart`, `core/auth/mfa_models.dart`, `core/auth/auth_gateway.dart`.

---

### <a id="p-gen--s-gen-07--configurar-la-verificacion-en-dos-pasos-inscripcion-obligatoria-al-iniciar-sesio"></a>S-GEN-07 Configurar la verificación en dos pasos (inscripción obligatoria al iniciar sesión)

**Ruta:** `/login`, `/invite/:token` o `/setup` (la URL no cambia) · **Tipo:** página

**Propósito**

Vincular una aplicación de autenticación (por código QR o clave manual) y confirmarla con su primer código antes de obtener la sesión.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Obligatoria por defecto: primer administrador en la instalación, invitación de un administrador, inicio de sesión tras una reactivación o tras un restablecimiento. |
| Recepción | Limitado | Solo si su rol se añade a `auth.mfa.required_roles` o tras un restablecimiento de la verificación por un administrador. |
| Enfermería / asistente médico | Limitado | Ídem. |
| Proveedor | Limitado | Ídem. |

**Cómo se llega**

Cuando el servidor responde `mfa_step = ENROLL` a la primera credencial (contraseña, Google, invitación o creación del primer administrador).

**Distribución**

- Tarjeta (máx. 520 px): icono de teléfono con candado, título «Configurar la verificación en dos pasos», subtítulo «Esta cuenta necesita un código de una aplicación de autenticación cada vez que inicia sesión. Configurarla toma un minuto.» (en la instalación: «Un último paso: proteja la cuenta de administrador con la verificación en dos pasos.»).
- «1. Instale en su teléfono una aplicación de autenticación, como Google Authenticator o Microsoft Authenticator.»
- «2. En la aplicación, agregue una cuenta y escanee este código QR.» + código QR de 196 px.
- «¿No puede escanearlo? Ingrese esta clave en la aplicación:» + clave seleccionable en grupos de 4 + icono «Copiar clave».
- «3. Ingrese el código de 6 dígitos que muestra la aplicación para confirmar.» + campo de código.
- Banner de error, botón «Confirmar», botón de texto «Volver a iniciar sesión».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| Clave secreta | Base32 en grupos de 4, solo lectura | — | — | No (secreto; solo en memoria) |
| «Código de verificación» | 6 dígitos | Sí | Igual que [S-GEN-06](05_pantallas_generales.md#p-gen--s-gen-06--verificacion-en-dos-pasos-codigo-al-iniciar-sesion); aquí **no** se envía solo: Enter o «Confirmar» | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Al entrar (automático) | Sistema | `AuthService/BeginMfaEnrollment(reto)`; spinner. | No | Muestra QR y clave; en error, banner + «Reintentar». |
| «Copiar clave» | Usuario | Copia al portapapeles. | No | Snackbar «Clave copiada. Péguela ahora en su aplicación de autenticación. El portapapeles se borra al confirmar y, cuando el dispositivo lo permite, al cabo de un minuto.» |
| «Confirmar» | Usuario | `AuthService/ConfirmMfaEnrollment(reto, código)`. | No | [S-GEN-08](05_pantallas_generales.md#p-gen--s-gen-08--guarde-sus-codigos-de-recuperacion-panel) con los códigos de recuperación (la sesión queda pendiente hasta guardarlos). |
| «Volver a iniciar sesión» | Usuario | Descarta el reto. | No | Formulario de login; en invitación o instalación va a `/login`. |

**Estados y mensajes**

- Cargando la inscripción: spinner.
- Error de carga: banner + «Reintentar».
- Código incorrecto: banner; el código se vacía si cambia el secreto.
- Reto inválido, ya inscrito («La verificación en dos pasos ya está configurada en esta cuenta.») o bloqueado: solo queda «Volver a iniciar sesión».
- Demasiados intentos: cuenta regresiva.

**Tiempo real**

Ninguno.

**Reglas de negocio**

- El QR se genera en el dispositivo (nada sale de la app): módulos negros sobre fondo blanco con zona de silencio, legible también en tema oscuro.
- El portapapeles se vacía al confirmar, al minuto y al salir (solo si aún contiene la clave copiada; en web se vacía sin comprobar).

**Notas para el rediseño**

- Mantener el QR en blanco y negro con su margen aunque el tema sea oscuro.
- Mantener la clave en grupos de 4, seleccionable, y los avisos sobre el portapapeles.

**Código fuente:** `features/auth/presentation/mfa/mfa_flow_view.dart`, `mfa/mfa_enrollment_panel.dart`, `mfa/qr_code_view.dart`, `mfa/sensitive_clipboard.dart`, `mfa/mfa_code_field.dart`, `features/auth/application/mfa_flow_controller.dart`.

---

### <a id="p-gen--s-gen-08--guarde-sus-codigos-de-recuperacion-panel"></a>S-GEN-08 Guarde sus códigos de recuperación (panel)

**Ruta:** estado de `/login`, `/invite/:token`, `/setup` y contenido de los diálogos del Perfil ([S-GEN-23](05_pantallas_generales.md#p-gen--s-gen-23--dialogo-configurar-la-verificacion-en-dos-pasos-desde-el-perfil), [S-GEN-25](05_pantallas_generales.md#p-gen--s-gen-25--dialogo-guarde-sus-codigos-de-recuperacion-perfil)) · **Tipo:** panel

**Propósito**

Mostrar una única vez los códigos de recuperación y exigir que el usuario confirme que los guardó.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Quien acaba de activar la verificación o de generar códigos nuevos. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Completo | Ídem. |
| Proveedor | Completo | Ídem. |

**Cómo se llega**

Tras «Confirmar» en [S-GEN-07](05_pantallas_generales.md#p-gen--s-gen-07--configurar-la-verificacion-en-dos-pasos-inscripcion-obligatoria-al-iniciar-sesio) o [S-GEN-23](05_pantallas_generales.md#p-gen--s-gen-23--dialogo-configurar-la-verificacion-en-dos-pasos-desde-el-perfil), o tras regenerar códigos en [S-GEN-24](05_pantallas_generales.md#p-gen--s-gen-24--dialogo-de-codigo-nuevos-codigos-de-recuperacion--desactivar).

**Distribución**

- Título «Guarde sus códigos de recuperación».
- Texto «Si pierde su teléfono, cada código le permite iniciar sesión una vez. Guárdelos en un lugar seguro y privado: solo se muestran ahora.»
- Caja con la lista de códigos (monoespaciados, seleccionables).
- Botón de texto «Copiar códigos» + aviso largo sobre el historial del portapapeles.
- Casilla «Guardé estos códigos».
- Botón «Continuar».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Guardé estos códigos» | Casilla | Sí | «Continuar» deshabilitado hasta marcarla | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Copiar códigos» | Usuario | Copia al portapapeles. | No | Snackbar «Códigos de recuperación copiados. Péguelos ahora en su gestor de contraseñas. El portapapeles se borra al continuar y, cuando el dispositivo lo permite, al cabo de un minuto.» |
| «Continuar» | Usuario | Vacía el portapapeles. | La casilla es la confirmación | En el inicio de sesión: empieza la sesión (los tokens estaban retenidos) y la guarda navega. En el Perfil: cierra el diálogo. |

**Estados y mensajes**

- Ocupado: spinner en «Continuar», casilla deshabilitada.
- En el inicio de sesión, si la sesión falla al continuar (por ejemplo, usuario desactivado): banner de error encima del panel.

**Tiempo real**

Ninguno.

**Reglas de negocio**

- Los códigos se muestran una sola vez y cada uno sirve una vez.
- En el inicio de sesión la sesión no empieza hasta que el usuario confirma que los guardó.

**Notas para el rediseño**

- No permitir salir sin marcar la casilla; no hay botón Cancelar.
- Conservar el aviso sobre historial y sincronización del portapapeles.

**Código fuente:** `features/auth/presentation/mfa/recovery_codes_panel.dart`, `mfa/sensitive_clipboard.dart`, `mfa/mfa_flow_view.dart`.

---

### <a id="p-gen--s-gen-09--aceptar-invitacion"></a>S-GEN-09 Aceptar invitación

**Ruta:** `/invite/:token` · **Tipo:** página pública

**Propósito**

Activar la cuenta invitada eligiendo nombre, contraseña, idioma y tema, e iniciar sesión.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Sin sesión (persona invitada) | Público | Persona invitada por un administrador desde Administración › Usuarios, con cualquier rol. |
| Cualquier rol con sesión iniciada | Sin acceso | La guarda redirige al inicio: no se puede aceptar una invitación estando dentro. |

**Cómo se llega**

Con el enlace de invitación que entrega el administrador (`/invite/<token>`).

**Distribución**

- Barra superior con nombre de la app y menú de idioma.
- Tarjeta: icono de persona con «+», título «Aceptar invitación», subtítulo «Elige tu nombre y contraseña para unirte al equipo.»
- Campos de nombre y contraseñas.
- «Idioma»: selector segmentado Inglés / Español.
- «Tema»: selector segmentado Claro / Oscuro (con iconos de sol y luna).
- Banner de error y botón «Aceptar invitación».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Nombre para mostrar» | Texto, foco automático | Sí | Se recorta | No |
| «Contraseña» | Oculta | Sí | 10–128 caracteres, letra + dígito; ayuda «Al menos 10 caracteres con una letra y un dígito.» | No |
| «Confirmar contraseña» | Oculta | Sí | Debe coincidir («Las contraseñas no coinciden.») | No |
| «Idioma» | Selector segmentado | Sí (con valor) | Por defecto, el idioma actual de la app | No |
| «Tema» | Selector segmentado | Sí (con valor) | Por defecto, el tema actual (Claro si el tema es «sistema») | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Aceptar invitación» | Persona invitada | `AuthService/AcceptInvitation` (token, contraseña, nombre, dispositivo) → tokens → sesión → aplica y sincroniza idioma y tema (`AuthService/UpdatePreferences`). | No | La guarda lleva a [S-GEN-11](05_pantallas_generales.md#p-gen--s-gen-11--seleccionar-sede) o al Panel. Si el servidor pide segundo paso → [S-GEN-06](05_pantallas_generales.md#p-gen--s-gen-06--verificacion-en-dos-pasos-codigo-al-iniciar-sesion) o [S-GEN-07](05_pantallas_generales.md#p-gen--s-gen-07--configurar-la-verificacion-en-dos-pasos-inscripcion-obligatoria-al-iniciar-sesio)/[S-GEN-08](05_pantallas_generales.md#p-gen--s-gen-08--guarde-sus-codigos-de-recuperacion-panel) (las preferencias se sincronizan después). |
| «Volver a iniciar sesión» (dentro del segundo paso) | Persona invitada | — | No | `/login` (la invitación ya quedó aceptada). |
| «Ir a iniciar sesión» (enlace inválido) | Cualquiera | — | No | `/login`. |

**Estados y mensajes**

- Enviando: spinner en el botón; campos y selectores deshabilitados.
- Token inválido, caducado, usado (`invalid_token`) o vacío: pantalla «Invitación no válida» / «Este enlace de invitación no es válido, caducó o ya se usó. Pide a un administrador uno nuevo.» + «Ir a iniciar sesión».
- Demasiados intentos: cuenta regresiva.
- Versión desactualizada: [S-GEN-05](05_pantallas_generales.md#p-gen--s-gen-05--actualizacion-necesaria).
- Otros errores: texto central ([S-GEN-28](05_pantallas_generales.md#p-gen--s-gen-28--estados-comunes-de-carga-vacio-y-error)).

**Tiempo real**

Ninguno.

**Reglas de negocio**

- El token solo se valida al enviar; el servidor agrupa todas las causas en `invalid_token`.
- Correo, roles y sedes los fijó el administrador; aquí no se ven ni se cambian.

**Notas para el rediseño**

- La página no muestra a qué correo ni rol corresponde la invitación.
- El usuario descubre que el enlace es inválido después de llenar el formulario (no hay validación previa).

**Código fuente:** `features/auth/presentation/invitation_page.dart`, `features/auth/application/token_form_controller.dart`, `features/profile/application/preferences_controller.dart`, `core/auth/auth_gateway.dart`, `features/auth/presentation/widgets/password_field.dart`.

---

### <a id="p-gen--s-gen-10--restablecer-contrasena"></a>S-GEN-10 Restablecer contraseña

**Ruta:** `/reset/:token` · **Tipo:** página pública

**Propósito**

Fijar una contraseña nueva con el enlace de un solo uso que emite un administrador.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Sin sesión | Público | Cualquier rol con un enlace emitido por un administrador (`UserService.CreatePasswordReset`). |
| Cualquier rol con sesión iniciada | Sin acceso | La guarda redirige al inicio. |

**Cómo se llega**

Con el enlace `/reset/<token>` que entrega el administrador.

**Distribución**

- Tarjeta: icono de candado con flecha, título «Define una nueva contraseña», subtítulo «Elige una nueva contraseña para tu cuenta.»
- Dos campos de contraseña, banner de error y botón «Cambiar contraseña».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Nueva contraseña» | Oculta | Sí | 10–128 caracteres, letra + dígito; ayuda «Al menos 10 caracteres con una letra y un dígito.» | No |
| «Confirmar nueva contraseña» | Oculta | Sí | Debe coincidir | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Cambiar contraseña» | Titular del enlace | `AuthService/ResetPassword(token, contraseña)`. | No | Pantalla de éxito. |
| «Ir a iniciar sesión» (éxito o enlace inválido) | Cualquiera | — | No | `/login`. |

**Estados y mensajes**

- Enviando: spinner.
- Éxito: «Contraseña actualizada» / «Ya puedes iniciar sesión con tu nueva contraseña.» + «Ir a iniciar sesión».
- Enlace inválido: «Enlace no válido» / «Este enlace para restablecer la contraseña no es válido, caducó o ya se usó. Pide a un administrador uno nuevo.»
- Demasiados intentos: cuenta regresiva.
- Versión desactualizada: [S-GEN-05](05_pantallas_generales.md#p-gen--s-gen-05--actualizacion-necesaria).

**Tiempo real**

Ninguno.

**Reglas de negocio**

- No inicia sesión automáticamente.
- Tras un restablecimiento de la verificación en dos pasos por un administrador, este enlace es el camino de vuelta: hay que entrar con la contraseña nueva (Google se rechaza con `mfa_reset_pending` hasta entonces) y volver a configurar la verificación ([S-GEN-07](05_pantallas_generales.md#p-gen--s-gen-07--configurar-la-verificacion-en-dos-pasos-inscripcion-obligatoria-al-iniciar-sesio)).

**Notas para el rediseño**

- Un usuario con sesión abierta no puede usar el enlace sin cerrar sesión antes (la guarda lo saca).

**Código fuente:** `features/auth/presentation/reset_password_page.dart`, `features/auth/application/token_form_controller.dart`, `core/auth/auth_gateway.dart`.

---

### <a id="p-gen--s-gen-11--seleccionar-sede"></a>S-GEN-11 Seleccionar sede

**Ruta:** `/select-location` · **Tipo:** página (fuera del marco, sin navegación lateral)

**Propósito**

Elegir la sede en la que se trabaja hoy.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Ve además el botón «Administrar sedes» en el estado vacío. |
| Recepción | Completo | Con exactamente una sede, se selecciona sola y la guarda lleva al Panel. |
| Enfermería / asistente médico | Completo | Ídem. |
| Proveedor | Completo | Ídem. |

**Cómo se llega**

Automáticamente tras iniciar sesión sin sede activa (varias sedes y ninguna recordada); desde el menú de cuenta «Perfil» cuando no hay sede activa; al abrir una URL de sede no asignada cuando el usuario no tiene sedes.

**Distribución**

- Barra superior: título «Seleccionar sede» + icono de cerrar sesión (tooltip «Cerrar sesión»).
- Subtítulo «Elige dónde trabajas hoy.»
- Cuadrícula de tarjetas (máx. 360 px de ancho cada una): avatar con el código de la sede (monoespaciado), nombre, «Zona horaria: » y dirección si existe. La sede activa lleva borde de color primario de 2 px y ✓ con tooltip «Actual».

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Tocar una tarjeta | Todos | Guarda la sede activa en el dispositivo, limpia el registro de formularios sucios, vuelve a suscribir el WebSocket (o recarga por gRPC si no hay socket). | [S-GEN-26](05_pantallas_generales.md#p-gen--s-gen-26--descartar-cambios-sin-guardar) si hay formularios con cambios sin guardar («Seguir editando» cancela) | `/app/<código>/dashboard`. |
| Icono de cerrar sesión | Todos | — | [S-GEN-17](05_pantallas_generales.md#p-gen--s-gen-17--confirmaciones-de-cierre-de-sesion) «¿Cerrar sesión?» | `/login`. |
| «Administrar sedes» (estado vacío) | Solo Administrador | — | No | `/admin/locations`. |
| «Reintentar» (estado de error) | Todos | Vuelve a pedir `LocationService/ListMyLocations`. | No | Recarga la lista. |

**Estados y mensajes**

- Cargando: spinner centrado.
- Error de `ListMyLocations`: icono de error, «Algo salió mal», mensaje y «Reintentar».
- Vacío: icono de sede tachada, «Sin sedes asignadas» / «Tu cuenta no tiene ninguna sede activa. Pide a un administrador que te asigne una.» (+ «Administrar sedes» para el Administrador).
- Recargando con datos: barra fina superior.

**Tiempo real**

Al elegir sede, el socket se limita a sus canales: `location:<id>:workflow`, `location:<id>:appointments`, `provider:<usuario>:queue` (proveedores), `user:<usuario>:notifications` y `admin:security` (administradores). La confirmación del servidor dispara la recarga de datos.

**Reglas de negocio**

- Solo se listan las sedes activas asignadas al usuario.
- La elección se recuerda en el dispositivo para el siguiente inicio de sesión.
- Un usuario no administrador sin sedes no puede abrir ninguna pantalla de sede (tampoco su Perfil).

**Notas para el rediseño**

- Aquí no hay menú de cuenta ni de idioma: solo cerrar sesión.
- Mantener la autoselección con una sola sede y la confirmación de descarte.
- El usuario sin sedes no puede llegar a su Perfil ni a su verificación en dos pasos.

**Código fuente:** `features/locations/presentation/select_location_page.dart`, `location_card.dart`, `features/locations/application/location_switch_controller.dart`, `core/locations/active_location_controller.dart`, `core/locations/location_gateway.dart`.

---

### <a id="p-gen--s-gen-12--marco-de-la-aplicacion-y-navegacion-principal"></a>S-GEN-12 Marco de la aplicación y navegación principal

**Ruta:** `/app/<código>/…` y `/admin/…` (ShellRoute) · **Tipo:** página (marco común)

**Propósito**

Marco común a todas las pantallas de sede y de administración: cabecera con sede, estado en vivo, búsqueda, notificaciones y cuenta; navegación adaptada al tamaño de pantalla; franja para un banner global.

**Acceso por rol (destinos visibles)**

| Rol | Acceso | Destinos de navegación |
| --- | --- | --- |
| Administrador | Completo | Panel, Pacientes, Citas, Cola de enfermería, Cola de proveedor, Cola de órdenes, Caja, Reportes y la sección «Administración»: Usuarios, Sedes, Catálogos, Planes de membresía, Reglas de bono, Reportes de la compañía, Auditoría, Configuración, Seguridad (con insignia). 17 destinos. |
| Recepción | Limitado | Panel, Pacientes, Citas, Caja, Reportes. |
| Enfermería / asistente médico | Limitado | Panel, Pacientes, Cola de enfermería, Cola de órdenes. |
| Proveedor | Limitado | Panel, Pacientes, Citas, Cola de enfermería, Cola de proveedor, Cola de órdenes. |

Un usuario con varios roles ve la unión (por ejemplo, Recepción + Enfermería: Panel, Pacientes, Citas, Cola de enfermería, Cola de órdenes, Caja, Reportes). Los elementos se ocultan con `visibleNavItems`, la guarda de ruta los protege y el servidor los valida.

**Cómo se llega**

Siempre presente en las pantallas de sede y de administración.

**Distribución**

- Barra superior: a la izquierda el selector de sede ([S-GEN-13](05_pantallas_generales.md#p-gen--s-gen-13--selector-de-sede-cabecera)); a la derecha el indicador en vivo ([S-GEN-14](05_pantallas_generales.md#p-gen--s-gen-14--indicador-de-actualizaciones-en-vivo)), el botón Buscar (lupa, tooltip «Buscar»), la campana ([S-GEN-15](05_pantallas_generales.md#p-gen--s-gen-15--centro-de-notificaciones)) y el avatar ([S-GEN-16](05_pantallas_generales.md#p-gen--s-gen-16--menu-de-cuenta)).
- Franja de 40 px bajo la barra para un único banner: configuración incompleta ([S-GEN-18](05_pantallas_generales.md#p-gen--s-gen-18--banner-de-configuracion-incompleta), con prioridad) o modo degradado ([S-GEN-19](05_pantallas_generales.md#p-gen--s-gen-19--banner-de-modo-degradado-emergencia-de-infraestructura)).
- Ancho > 1024 px: navegación lateral fija de 260 px (icono + etiqueta en una línea con elipsis); separador y encabezado «Administración» antes de los destinos de administración; divisor vertical y contenido.
- Ancho 600–1024 px: riel de navegación con etiquetas (se desplaza si no cabe; los destinos de administración solo se separan con un espacio, sin encabezado).
- Ancho < 600 px: botón de menú (cajón con todos los destinos y el encabezado «Administración») + barra inferior con los 5 primeros destinos (solo si hay 2 o más).

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Tocar un destino | Según rol | Navega a la ruta del destino con el código de la sede activa (los de administración no llevan sede). En el cajón compacto, cierra primero el cajón. | No (ver nota de [S-GEN-26](05_pantallas_generales.md#p-gen--s-gen-26--descartar-cambios-sin-guardar)) | Pantalla del destino. |
| «Buscar» (lupa) | Todos | Abre la búsqueda de pacientes. Deshabilitado sin sede activa. | No | `/app/<código>/patients` ([S-PAC-01](06_pantallas_pacientes.md#p-pac--s-pac-01--pacientes-busqueda)). |

**Estados y mensajes**

- Destino resaltado cuando la URL es su ruta o una sub-ruta (por ejemplo, la ficha de un paciente resalta «Pacientes»); en el Perfil y otras rutas no listadas no se resalta ninguno.
- Insignia numérica en «Seguridad» con los eventos de seguridad sin reconocer (solo Administrador).
- Barra inferior compacta cuando la página actual no está entre los 5 primeros: el indicador se vuelve transparente.
- Sin sede activa (por ejemplo, un administrador sin sedes en `/admin`): los destinos de sede llevan a `/select-location`.
- Servidor sin permiso: «No tiene permiso para realizar esta acción.»; sede no autorizada: «No está autorizado para esta sede.»

**Tiempo real**

La insignia de Seguridad se refresca con los eventos de `admin:security` y en cada reconexión; el contenido de cada pantalla se recarga mediante los ganchos de resincronización de su módulo.

**Reglas de negocio**

- Permisos efectivos = unión de los roles (`role_permissions.dart`, espejo de `rbac.rs` en el servidor). La navegación es solo presentación.
- Las rutas `/admin/…` son de toda la compañía (no llevan sede) y exigen el rol Administrador.
- «Catálogos» es visible con `manageCatalog` o `manageProceduresLabs` y lleva a Tipos de cita.
- El inicio de todos los roles es el Panel (`/app/<código>/dashboard`, [S-REC-01](07_pantallas_recepcion.md#p-rec--s-rec-01--panel-tablero-operativo-de-la-sede)).

**Notas para el rediseño**

- La lista y el orden de destinos salen de `nav_items.dart`; preservar el filtro por permisos y la separación de «Administración».
- Administrador: en tableta el riel se desplaza; en móvil la barra inferior muestra Panel, Pacientes, Citas, Cola de enfermería y Cola de proveedor y el resto queda en el cajón. Proveedor: «Cola de órdenes» solo está en el cajón.
- Probable inconsistencia: cuando la página actual no está en la barra inferior se pasa el índice 0 con indicador transparente, así que «Panel» muestra su icono relleno como si estuviera seleccionado.
- En el riel de tableta falta el encabezado «Administración» que sí tienen la lateral y el cajón.
- En las sub-páginas de catálogo (procedimientos, laboratorios…) no se resalta ningún destino porque «Catálogos» apunta a Tipos de cita.
- Mantener objetivos táctiles de 48 dp y la regla de no comunicar nada solo con color.

**Código fuente:** `core/widgets/app_shell.dart`, `core/routing/shell_screen.dart`, `core/navigation/nav_items.dart`, `core/widgets/breakpoints.dart`, `core/permissions/permission.dart`, `core/permissions/role_permissions.dart`, `core/permissions/permission_providers.dart`, `core/routing/routes.dart`, `features/security/application/security_badge.dart`.

---

### <a id="p-gen--s-gen-13--selector-de-sede-cabecera"></a>S-GEN-13 Selector de sede (cabecera)

**Ruta:** título de la cabecera en cualquier `/app/…` o `/admin/…` · **Tipo:** panel

**Propósito**

Ver y cambiar la sede activa sin salir de la app.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Con 0 o 1 sede es solo texto (icono + nombre, o «Seleccionar sede» si no hay activa); con 2 o más es un menú (tooltip «Sede»). |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Completo | Ídem. |
| Proveedor | Completo | Ídem. |

**Cómo se llega**

Título de la barra superior del marco ([S-GEN-12](05_pantallas_generales.md#p-gen--s-gen-12--marco-de-la-aplicacion-y-navegacion-principal)).

**Distribución**

- Icono de ubicación + nombre de la sede activa (con elipsis) + flecha desplegable.
- Menú: una opción por sede « · » con marca de verificación en la activa.

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Elegir otra sede | Todos con 2 o más sedes | Selecciona y recuerda la sede, limpia el registro de formularios sucios, invalida los datos de sede, vuelve a suscribir el WebSocket a los canales de la nueva sede (o fuerza la recarga por gRPC si no hay socket). | [S-GEN-26](05_pantallas_generales.md#p-gen--s-gen-26--descartar-cambios-sin-guardar) si hay formularios con cambios («Seguir editando» cancela todo) | `/app/<código nuevo>/dashboard`. |
| Elegir la sede ya activa | Ídem | No cambia nada. | No | Navega a su Panel. |

**Estados y mensajes**

- Solo texto (0–1 sedes) o menú (2 o más sedes).

**Tiempo real**

Re-suscripción a `location:<id>:workflow`, `location:<id>:appointments`, `provider:<usuario>:queue` (Proveedor), `user:<usuario>:notifications` y `admin:security` (Administrador).

**Reglas de negocio**

- La sede activa viaja en cada petición de sede como `x-active-location-id` y el servidor la valida.
- Cambiar la sede editando la URL (o por un enlace) hace el mismo cambio, pero si hay formularios sucios se rechaza sin preguntar y se vuelve a la URL anterior.

**Notas para el rediseño**

- Siempre se aterriza en el Panel de la nueva sede (se pierde la pantalla actual).
- En móvil el nombre compite con cuatro acciones y se trunca.
- Mantener la confirmación de descarte antes de cambiar.

**Código fuente:** `core/routing/shell_screen.dart`, `features/locations/application/location_switch_controller.dart`, `features/locations/application/dirty_forms.dart`, `core/widgets/dirty_form_guard.dart`, `core/locations/active_location_controller.dart`.

---

### <a id="p-gen--s-gen-14--indicador-de-actualizaciones-en-vivo"></a>S-GEN-14 Indicador de actualizaciones en vivo

**Ruta:** cabecera del marco · **Tipo:** panel informativo

**Propósito**

Mostrar si la app recibe los cambios al instante por WebSocket.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Solo informativo. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Completo | Ídem. |
| Proveedor | Completo | Ídem. |

**Cómo se llega**

Siempre visible en la cabecera.

**Distribución**

- Ancho ≥ 600 px: icono + texto. Ancho < 600 px: solo icono con tooltip.

**Campos**

Sin campos.

**Acciones**

Ninguna (informativo).

**Estados y mensajes**

| Estado | Texto | Icono / color |
| --- | --- | --- |
| Conectado | «En vivo» | Rayo, color primario |
| Conectando | «Reconectando…» | Sincronizar, color terciario |
| Desconectado (también con `realtime.enabled` desactivado o sin token) | «Sin conexión» | Nube tachada, color de error |

Semántica para lectores de pantalla: «Actualizaciones en vivo: ».

**Tiempo real**

Reconexión con retroceso exponencial con variación aleatoria de 1 s a 30 s (se reinicia tras 60 s estable). El cierre 4408 reconecta al instante; el cierre 4401 renueva la sesión y reconecta, o cierra la sesión («Tu sesión terminó. Inicia sesión de nuevo.»). Tras cada (re)conexión se vuelven a leer los datos por gRPC.

**Reglas de negocio**

- El socket solo transporta identificadores y versiones, nunca PHI.
- Mientras no está conectado, la pantalla visible se refresca sola cada 30 s ([S-GEN-19](05_pantallas_generales.md#p-gen--s-gen-19--banner-de-modo-degradado-emergencia-de-infraestructura)).

**Notas para el rediseño**

- No depender solo del color: icono + texto (o tooltip y semántica en móvil).
- El Panel tiene su propio indicador con textos distintos ([S-REC-05](07_pantallas_recepcion.md#p-rec--s-rec-05--indicador-de-conexion-del-panel)); conviene unificarlos.

**Código fuente:** `core/routing/shell_screen.dart`, `core/realtime/realtime_client.dart`, `core/realtime/realtime_providers.dart`, `core/realtime/invalidations.dart`, `core/realtime/realtime_event.dart`.

---

### <a id="p-gen--s-gen-15--centro-de-notificaciones"></a>S-GEN-15 Centro de notificaciones

**Ruta:** cabecera del marco (campana) · **Tipo:** hoja / panel flotante

**Propósito**

Avisar de asignaciones y alertas dirigidas al usuario y llevarlo a la pantalla correspondiente.

**Acceso por rol**

| Rol | Acceso | Qué recibe |
| --- | --- | --- |
| Administrador | Completo | «Configuración incompleta», «Alerta de seguridad», órdenes asignadas («Orden asignada a ti», «Orden asignada actualizada») y «Actualización requerida». |
| Recepción | Limitado | Ve la campana; normalmente no recibe avisos de este tipo salvo «Actualización requerida». |
| Enfermería / asistente médico | Limitado | Solo avisos de órdenes y de versión: «Orden asignada a ti», «Orden asignada actualizada», «Actualización requerida». |
| Proveedor | Completo | «Paciente asignado a ti», «Cita actualizada» (sus citas), órdenes asignadas y «Actualización requerida». |

**Cómo se llega**

Campana de la cabecera (tooltip «Notificaciones»; semántica «Notificaciones, {N} sin leer»).

**Distribución**

- Botón campana con insignia del número de no leídas (icono de campana activa si hay alguna).
- Panel: en móvil hoja inferior de 480 px con asa; en tableta y escritorio, diálogo de 400×520 px anclado arriba a la derecha sin oscurecer el fondo.
- Encabezado «Notificaciones» + botón «Marcar todo como leído» (si hay no leídas) + icono de papelera «Borrar» (si la lista no está vacía).
- Lista: icono por tipo (color primario si no leída, gris si leída), título (negrita si no leída), subtítulo « · » y punto a la derecha si no leída.

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Tocar una notificación | Todos | La marca como leída; si faltan datos de enlace los lee (`OrderService/GetOrder`, `EncounterService/GetEncounter` o `AppointmentService/GetAppointment`); cierra el panel. | No | Paciente asignado / Orden → `/app/<sede>/encounters/<visita>`; Cita actualizada → `/app/<sede>/appointments`; Configuración incompleta → `/admin/settings`; Alerta de seguridad → `/admin/security/<evento>`; Actualización requerida → solo cierra. |
| «Marcar todo como leído» | Todos | Marca todas como leídas. | No | Insignia a 0. |
| «Borrar» | Todos | Vacía la lista. | **No** | Lista vacía (irreversible). |

**Estados y mensajes**

- Vacío: icono de campana, «Estás al día» / «Las asignaciones y alertas para ti aparecerán aquí.»
- Títulos y cuerpos:

| Tipo | Título | Cuerpo |
| --- | --- | --- |
| Visita asignada | «Paciente asignado a ti» | «Visita {code}» / «Se le asignó una visita» |
| Cita | «Cita actualizada» | «Cita {code}» / «Una de sus citas cambió» |
| Orden | «Orden asignada a ti» / «Orden asignada actualizada» | «Orden {item}» / «Una orden asignada a usted» |
| Sistema | «Configuración incompleta» | «Faltan ajustes. Abre Configuración para terminar.» |
| Sistema | «Actualización requerida» | «Esta versión de la aplicación ya no es compatible.» |
| Seguridad | «Alerta de seguridad» | «Revísala en Administración > Seguridad» |

- Antigüedad: «Ahora mismo», «hace {N} min», «hace {N} h».

**Tiempo real**

Las notificaciones llegan solo por WebSocket: canal personal `user:<id>:notifications` (`encounter.provider_assigned.v1`, `appointment.changed.v1`, `order.created.v1`, `order.changed.v1`) y `admin:security` (`security.event_raised.v1`). Los avisos de sistema nacen de errores `setup_incomplete` (administradores) y `client_outdated`. Sin socket no llegan avisos.

**Reglas de negocio**

- Solo en memoria: máximo 100, las más nuevas primero; se vacían al cerrar sesión y al recargar la app; no hay historial en el servidor.
- Sin PHI: solo códigos humanos (por ejemplo `LAN-E-000123`), códigos de catálogo e identificadores.
- Un aviso no leído sobre la misma entidad y tipo se reemplaza por el nuevo; los avisos de sistema son uno por tipo.
- El enlace usa la sede del evento si el usuario la tiene asignada; si no, la sede activa.

**Notas para el rediseño**

- Preservar que nunca aparezcan nombres de pacientes.
- «Borrar» es irreversible y no pide confirmación.
- La antigüedad no se actualiza mientras el panel está abierto; no hay unidad de días.
- «Cita actualizada» lleva a la agenda general, no a la cita concreta.
- Mezcla de tú/usted en los textos («asignado a ti» / «asignada a usted»).

**Código fuente:** `features/notifications/presentation/notifications_button.dart`, `notifications_panel.dart`, `notification_labels.dart`, `features/notifications/application/notifications_controller.dart`, `features/notifications/domain/app_notification.dart`, `features/notifications/infrastructure/notifications_gateway.dart`, `features/notifications/notifications_realtime.dart`.

---

### <a id="p-gen--s-gen-16--menu-de-cuenta"></a>S-GEN-16 Menú de cuenta

**Ruta:** cabecera del marco (avatar) · **Tipo:** menú

**Propósito**

Acceso al Perfil, cambio rápido de idioma y tema, y cierre de sesión.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Completo | — |
| Enfermería / asistente médico | Completo | — |
| Proveedor | Completo | — |

**Cómo se llega**

Avatar circular con iniciales (o «?») a la derecha de la cabecera; tooltip «Cuenta».

**Distribución**

- Cabecera no seleccionable con nombre para mostrar y correo.
- «Perfil».
- «Idioma: Inglés» / «Idioma: Español» (marcado el actual).
- «Tema: Claro» / «Tema: Oscuro» (marcado el actual).
- «Cerrar sesión».
- «Cerrar sesión en todos los dispositivos».

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Perfil» | Todos | — | No | `/app/<sede>/profile` ([S-GEN-21](05_pantallas_generales.md#p-gen--s-gen-21--perfil)); sin sede activa → `/select-location`. |
| «Idioma: …» / «Tema: …» | Todos | Se aplica al instante, se guarda en el dispositivo y se sincroniza con `AuthService/UpdatePreferences`. | No | Sin snackbar fuera del Perfil. |
| «Cerrar sesión» / «Cerrar sesión en todos los dispositivos» | Todos | — | [S-GEN-17](05_pantallas_generales.md#p-gen--s-gen-17--confirmaciones-de-cierre-de-sesion) | `/login`. |

**Estados y mensajes**

- Opciones de idioma y tema con marca en la actual (si el tema es «sistema» ninguna aparece marcada).

**Tiempo real**

Ninguno.

**Reglas de negocio**

- Las preferencias guardadas en el servidor se aplican al iniciar sesión.

**Notas para el rediseño**

- El área táctil del avatar es de 48 dp.
- El aviso «Preferencias guardadas.» solo se ve si se cambia desde el Perfil.

**Código fuente:** `core/routing/shell_screen.dart`, `features/profile/application/preferences_controller.dart`, `features/profile/presentation/profile_page.dart`.

---

### <a id="p-gen--s-gen-17--confirmaciones-de-cierre-de-sesion"></a>S-GEN-17 Confirmaciones de cierre de sesión

**Ruta:** diálogo sobre la pantalla actual · **Tipo:** diálogo

**Propósito**

Evitar cierres de sesión accidentales.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Completo | — |
| Enfermería / asistente médico | Completo | — |
| Proveedor | Completo | — |

**Cómo se llega**

Desde el menú de cuenta ([S-GEN-16](05_pantallas_generales.md#p-gen--s-gen-16--menu-de-cuenta)); desde el icono de [S-GEN-11](05_pantallas_generales.md#p-gen--s-gen-11--seleccionar-sede) (solo «Cerrar sesión»); desde Perfil › Sesiones ([S-GEN-21](05_pantallas_generales.md#p-gen--s-gen-21--perfil), solo todos los dispositivos).

**Distribución**

- Variante simple: «¿Cerrar sesión?» / «Tendrás que iniciar sesión de nuevo para seguir trabajando.» — «Cancelar» y «Cerrar sesión».
- Variante global: «¿Cerrar sesión en todos los dispositivos?» / «Cerrará tu sesión en todos los dispositivos, incluido este.» — «Cancelar» y «Cerrar sesión en todos los dispositivos» (rojo, destructivo).

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Confirmar | Todos | `AuthService/Logout` o `AuthService/LogoutAll` (si la petición falla, igual se cierra localmente); borra tokens, marca de inactividad, cachés de sesión y notificaciones; vacía la cola de subidas (aborta lo que esté subiendo y borra las copias locales de los archivos, [S-PAC-16](06_pantallas_pacientes.md#p-pac--s-pac-16--subidas-cola-de-subida)), las carpetas de caché de los selectores de archivos y de compartir en Android y las vistas previas de imágenes en memoria. | Es la confirmación | La guarda lleva a `/login?from=<pantalla actual>`. |
| «Cancelar» o tocar fuera | Todos | — | — | No hace nada. |

**Estados y mensajes**

Sin estados adicionales.

**Tiempo real**

El socket se desconecta al cerrar sesión.

**Reglas de negocio**

- El cierre voluntario conserva la sede recordada en el dispositivo.
- Si el almacenamiento del dispositivo falla, los tokens se sobrescriben con una marca inválida: nunca queda un token de renovación usable.
- La limpieza local (cola de subidas, copias de archivos, vistas previas, cachés, notificaciones) es la misma en todo cierre: voluntario, en todos los dispositivos, forzado o por inactividad ([S-GEN-20](05_pantallas_generales.md#p-gen--s-gen-20--cierre-automatico-por-inactividad-aviso-y-cubierta)). El siguiente usuario del dispositivo no ve, no puede reintentar ni encuentra en disco lo que eligió el anterior.

**Notas para el rediseño**

- Tras un cierre voluntario se conserva `?from=`, de modo que el siguiente usuario del dispositivo vuelve a esa pantalla si tiene acceso (distinto del cierre por inactividad).
- El botón «Cerrar sesión» del aviso de inactividad ([S-GEN-20](05_pantallas_generales.md#p-gen--s-gen-20--cierre-automatico-por-inactividad-aviso-y-cubierta)) cierra sin esta confirmación (intencional).

**Código fuente:** `features/profile/presentation/profile_page.dart`, `core/widgets/confirm_dialog.dart`, `core/auth/session_controller.dart`, `features/documents/documents_realtime.dart` (limpieza de documentos al cerrar sesión).

---

### <a id="p-gen--s-gen-18--banner-de-configuracion-incompleta"></a>S-GEN-18 Banner de configuración incompleta

**Ruta:** franja bajo la cabecera del marco · **Tipo:** banner

**Propósito**

Indicar que faltan ajustes obligatorios del sistema y llevar a Configuración.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Único rol que ve el banner. |
| Recepción | Sin acceso | No ve el banner; recibe el error «La configuración del sistema está incompleta.» en las pantallas cuyas peticiones fallan. |
| Enfermería / asistente médico | Sin acceso | Ídem. |
| Proveedor | Sin acceso | Ídem. |

**Cómo se llega**

Aparece solo.

**Distribución**

- Franja de 40 px en color de advertencia: icono ⚠, texto «La configuración del sistema está incompleta. Solo Administración → Configuración está disponible hasta terminarla.» + «{N} pendientes» («1 pendiente»), botón «Abrir configuración».

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Abrir configuración» | Administrador | — | No | `/admin/settings`. |

**Estados y mensajes**

- Visible cuando `SettingsService/GetSystemStatus.setup_state` no es «listo» ni «degradado», o (sin estado) cuando alguna petición respondió `setup_incomplete`; desaparece al quedar listo.
- Tiene prioridad sobre el banner de modo degradado ([S-GEN-19](05_pantallas_generales.md#p-gen--s-gen-19--banner-de-modo-degradado-emergencia-de-infraestructura)).

**Tiempo real**

`GetSystemStatus` se vuelve a leer en cada (re)conexión del socket; también se genera la notificación «Configuración incompleta» ([S-GEN-15](05_pantallas_generales.md#p-gen--s-gen-15--centro-de-notificaciones)).

**Reglas de negocio**

- Con la configuración incompleta el servidor bloquea las peticiones operativas (`FAILED_PRECONDITION setup_incomplete` con la cabecera `x-missing-settings`).

**Notas para el rediseño**

- Texto de una línea con elipsis: en móvil se corta casi entero; valorar un formato expandible.

**Código fuente:** `features/setup/presentation/setup_incomplete_banner.dart`, `features/setup/application/setup_status_provider.dart`, `features/setup/infrastructure/system_status_gateway.dart`, `core/routing/shell_screen.dart`.

---

### <a id="p-gen--s-gen-19--banner-de-modo-degradado-emergencia-de-infraestructura"></a>S-GEN-19 Banner de modo degradado (emergencia de infraestructura)

**Ruta:** franja bajo la cabecera del marco · **Tipo:** banner

**Propósito**

Avisar, sin bloquear, que los documentos o las actualizaciones en vivo no funcionan.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Oculto si se muestra el banner de configuración incompleta. |
| Recepción | Completo | — |
| Enfermería / asistente médico | Completo | — |
| Proveedor | Completo | — |

**Cómo se llega**

Aparece solo cuando el servidor informa componentes caídos.

**Distribución**

- Franja de 40 px en color de advertencia: icono de nube tachada (documentos) o de sincronización con problema (solo actualizaciones en vivo) + texto de una línea.
- Tooltip y etiqueta para lector de pantalla con el detalle: «Parte de la infraestructura del servidor no responde. Pacientes, visitas, signos vitales, facturación y todos los demás registros se siguen guardando con normalidad. Los documentos no se pueden subir ni abrir hasta que vuelva el almacenamiento, y las pantallas se actualizan cada 30 segundos en lugar de al instante.»

**Campos**

Sin campos.

**Acciones**

Ninguna.

**Estados y mensajes**

| Componente caído | Texto |
| --- | --- |
| Almacenamiento (MinIO) | «Los documentos no están disponibles por el momento. Todo lo demás funciona con normalidad.» |
| Mensajería (NATS) | «Las actualizaciones en vivo están demoradas: las pantallas se actualizan solas cada 30 segundos.» |
| Ambos | «Documentos no disponibles y actualizaciones en vivo demoradas. El trabajo clínico continúa con normalidad.» |

Error de documentos dentro de las pantallas: «Los documentos no están disponibles por el momento. Inténtelo de nuevo en unos minutos; todo lo demás sigue funcionando.»

**Tiempo real**

`SettingsService/GetClientSettings` se consulta cada 60 s (cada 30 s si hay degradación o el socket no está conectado). Mientras NATS está caído o el socket no está conectado, la pantalla visible se refresca cada 30 s con los mismos ganchos de resincronización.

**Reglas de negocio**

- Nunca bloquea el trabajo clínico; las consultas de fondo no cuentan como actividad para el cierre por inactividad.
- Región en vivo para lectores de pantalla.

**Notas para el rediseño**

- El detalle solo está en el tooltip (difícil de descubrir en pantallas táctiles).
- Queda oculto si se muestra el banner de configuración incompleta.

**Código fuente:** `core/degraded/degraded_banner.dart`, `core/degraded/degraded_mode.dart`, `core/config/client_settings.dart`, `core/routing/shell_screen.dart`.

---

### <a id="p-gen--s-gen-20--cierre-automatico-por-inactividad-aviso-y-cubierta"></a>S-GEN-20 Cierre automático por inactividad (aviso y cubierta)

**Ruta:** global, cualquier pantalla con sesión · **Tipo:** diálogo modal + cubierta

**Propósito**

Cumplir el cierre automático de sesión (HIPAA 164.312(a)(2)(iii)) protegiendo la PHI que haya en pantalla.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Aplica a todos por igual. |
| Recepción | Completo | — |
| Enfermería / asistente médico | Completo | — |
| Proveedor | Completo | — |

**Cómo se llega**

Aparece solo 60 s antes del límite de inactividad.

**Distribución**

- Diálogo modal (no se cierra tocando fuera): icono de reloj, título «¿Sigues ahí?», mensaje «Tu sesión se cerrará en {N} segundos por inactividad.» (singular «1 segundo»), botones «Cerrar sesión» (texto) y «Mantener la sesión» (principal, con el foco).
- Al expirar: cubierta opaca a pantalla completa con spinner y «Cerrando sesión…».

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Mantener la sesión» (o botón atrás) | Todos | Cuenta como actividad y reinicia el periodo. | No | Se cierra el aviso. |
| «Cerrar sesión» | Todos | Cierre voluntario inmediato. | No | `/login`. |
| Sin respuesta al llegar a 0 | Sistema | Cubre la pantalla; cierra diálogos, hojas, menús, snackbars y banners; envía `AuthService/Logout` con motivo `IDLE_TIMEOUT` (máx. 5 s); borra tokens, sede recordada y cachés, y hace la misma limpieza local que un cierre voluntario (cola de subidas, copias de archivos, vistas previas; [S-GEN-17](05_pantallas_generales.md#p-gen--s-gen-17--confirmaciones-de-cierre-de-sesion)). | No | `/login?reason=idle` con el aviso «Se cerró tu sesión tras {minutes} minutos de inactividad.» |

**Estados y mensajes**

- Activo → Aviso (último minuto, cuenta regresiva cada segundo) → Expirado (cubierta).

**Tiempo real**

Mientras hay actividad se envía `AuthService/RecordActivity` como máximo una vez por minuto; su respuesta trae el límite vigente y se aplica al instante. El servidor corta la sesión tras límite + 2 min sin actividad reportada (`session_idle_timeout`), lo que también lleva al login con el aviso.

**Reglas de negocio**

- Límite `auth.idle_logout_minutes` (por defecto 15), configurable por el Administrador y aplicado en caliente.
- Solo cuenta la entrada real: toques, ratón que realmente se mueve, rueda o trackpad, teclas físicas y texto escrito en el campo con foco. Temporizadores, sondeos, eventos en vivo, peticiones y cambios de foco no cuentan.
- Con el aviso abierto solo cuentan sus botones.
- El tiempo en segundo plano o con el equipo suspendido cuenta; al volver a la app o a la pestaña se evalúa al instante; una sesión restaurada continúa el periodo guardado.

**Notas para el rediseño**

- La cubierta debe ser opaca, inmediata y ocultar la pantalla anterior a la vista, al tacto y a los lectores de pantalla; se mantiene 600 ms tras llegar al login.
- El aviso debe quedar por encima de todo, con el foco en «Mantener la sesión».

**Código fuente:** `core/auth/idle_logout_guard.dart`, `core/auth/idle_logout.dart`, `core/auth/idle_clock.dart`, `core/auth/session_controller.dart`, `core/config/client_settings.dart`.

---

### <a id="p-gen--s-gen-21--perfil"></a>S-GEN-21 Perfil

**Ruta:** `/app/<código>/profile` · **Tipo:** página

**Propósito**

Ver la propia cuenta, roles y sedes; cambiar idioma y tema; gestionar la verificación en dos pasos; cerrar sesión en todos los dispositivos.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Requiere una sede activa en la URL. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Completo | Ídem. |
| Proveedor | Completo | Ídem. |

La ruta no exige permisos extra y no aparece en la navegación.

**Cómo se llega**

Menú de cuenta ([S-GEN-16](05_pantallas_generales.md#p-gen--s-gen-16--menu-de-cuenta)) › «Perfil».

**Distribución**

- Título de página «Perfil».
- Tarjeta «Cuenta»: avatar con iniciales, nombre para mostrar y correo; «Roles» como chips (Administrador, Recepción, Enfermería / asistente médico, Proveedor); «Sedes» como chips « · » o «Sin sedes asignadas.»
- Tarjeta «Preferencias» (spinner pequeño mientras sincroniza): «Idioma» Inglés / Español; «Tema» Claro / Oscuro.
- Tarjeta «Verificación en dos pasos» ([S-GEN-22](05_pantallas_generales.md#p-gen--s-gen-22--verificacion-en-dos-pasos-seccion-del-perfil)).
- Tarjeta «Sesiones»: «Cerrará tu sesión en todos los dispositivos, incluido este.» + botón «Cerrar sesión en todos los dispositivos».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Idioma» | Selector segmentado | Sí (con valor) | Inglés / Español | No |
| «Tema» | Selector segmentado | Sí (con valor) | Claro / Oscuro | No |
| Nombre, correo, roles y sedes | Solo lectura | — | — | No (datos del propio usuario) |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Cambiar idioma o tema | Todos | Se aplica al instante, se guarda en el dispositivo y llama a `AuthService/UpdatePreferences` (se reintenta tras renovar la sesión). | No | Snackbar «Preferencias guardadas.» o «Las preferencias se guardaron en este dispositivo, pero no se pudieron sincronizar con el servidor.» |
| «Cerrar sesión en todos los dispositivos» | Todos | — | [S-GEN-17](05_pantallas_generales.md#p-gen--s-gen-17--confirmaciones-de-cierre-de-sesion) | `/login`. |

**Estados y mensajes**

- Sin usuario cargado: página vacía.
- Sincronizando preferencias: spinner junto al título de la tarjeta.

**Tiempo real**

Ninguno: roles y sedes son los de `GetCurrentUser` al iniciar sesión (los cambios del administrador se ven al volver a entrar).

**Reglas de negocio**

- La preferencia guardada en el servidor se aplica en cada inicio de sesión.
- Los roles se muestran con su etiqueta traducida; los códigos desconocidos aparecen tal cual.

**Notas para el rediseño**

- No hay edición de nombre ni de correo, ni cambio de contraseña (solo por enlace del administrador).
- El tema «sistema» no se ofrece.
- Un usuario sin sedes no puede abrir esta página.

**Código fuente:** `features/profile/presentation/profile_page.dart`, `role_label.dart`, `features/profile/application/preferences_controller.dart`, `features/profile/presentation/two_step_section.dart`.

---

### <a id="p-gen--s-gen-22--verificacion-en-dos-pasos-seccion-del-perfil"></a>S-GEN-22 Verificación en dos pasos (sección del Perfil)

**Ruta:** `/app/<código>/profile` · **Tipo:** panel

**Propósito**

Ver el estado de la propia verificación en dos pasos y activarla, regenerar los códigos de recuperación o desactivarla.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Limitado | Gestiona su propio factor; por defecto su rol la exige, así que no puede desactivarla. |
| Recepción | Completo | Puede activarla, regenerar códigos y desactivarla (salvo que su rol pase a ser obligatorio). |
| Enfermería / asistente médico | Completo | Ídem. |
| Proveedor | Completo | Ídem. |

**Cómo se llega**

Tarjeta dentro del Perfil ([S-GEN-21](05_pantallas_generales.md#p-gen--s-gen-21--perfil)).

**Distribución**

- Título «Verificación en dos pasos» y texto «Cada inicio de sesión pide su contraseña y un código de una aplicación de autenticación en su teléfono.»
- Chips de estado: «Activada» / «Activada desde el {date}» (escudo verificado, color primario) o «Desactivada» (escudo con interrogación, color de error); «Obligatoria para su rol»; «Bloqueada» (candado rojo).
- Texto de ayuda según el estado y botones de acción.

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Configurar» | No inscritos | Abre [S-GEN-23](05_pantallas_generales.md#p-gen--s-gen-23--dialogo-configurar-la-verificacion-en-dos-pasos-desde-el-perfil). | Contraseña dentro del diálogo | Snackbar «La verificación en dos pasos está activada.» |
| «Nuevos códigos de recuperación» | Inscritos y no bloqueados | Abre [S-GEN-24](05_pantallas_generales.md#p-gen--s-gen-24--dialogo-de-codigo-nuevos-codigos-de-recuperacion--desactivar) (`AuthService/RegenerateRecoveryCodes`). | Código actual | [S-GEN-25](05_pantallas_generales.md#p-gen--s-gen-25--dialogo-guarde-sus-codigos-de-recuperacion-perfil) con los códigos nuevos. |
| «Desactivar» | Inscritos, no bloqueados y sin rol que la exija | Abre [S-GEN-24](05_pantallas_generales.md#p-gen--s-gen-24--dialogo-de-codigo-nuevos-codigos-de-recuperacion--desactivar) en variante destructiva (`AuthService/DisableMfa`). | Código actual | Snackbar «La verificación en dos pasos está desactivada.» |
| «Reintentar» | Todos | Repite `AuthService/GetMfaStatus` si falló. | No | Recarga la sección. |

**Estados y mensajes**

- Cargando: barra de progreso lineal.
- Error: mensaje traducido + «Reintentar».
- Bloqueada: «Demasiados códigos erróneos seguidos: se rechaza cualquier código hasta que un administrador le restablezca la verificación en dos pasos. El restablecimiento también reemplaza su contraseña: el administrador le da un token para fijar una nueva.» — sin acciones.
- Activada: «Le quedan {N} códigos de recuperación.» / «Le queda 1 código de recuperación.» / «No le quedan códigos de recuperación: genere nuevos.»
- Obligatoria sin configurar: «Su rol la exige: la configurará en su próximo inicio de sesión, o ahora.»

**Tiempo real**

Ninguno; el estado se vuelve a leer tras cada acción.

**Reglas de negocio**

- Diez códigos erróneos seguidos bloquean el factor; solo un Administrador lo desbloquea (restablecimiento, que también reemplaza la contraseña).
- No se puede desactivar si un rol del usuario la exige (`mfa_required_for_role`).

**Notas para el rediseño**

- El texto introductorio describe la verificación como activa aunque esté desactivada.
- Mantener chips con icono + texto (no solo color).

**Código fuente:** `features/profile/presentation/two_step_section.dart`, `features/profile/application/mfa_status_provider.dart`, `features/profile/infrastructure/mfa_gateway.dart`.

---

### <a id="p-gen--s-gen-23--dialogo-configurar-la-verificacion-en-dos-pasos-desde-el-perfil"></a>S-GEN-23 Diálogo «Configurar la verificación en dos pasos» (desde el Perfil)

**Ruta:** diálogo sobre `/app/<código>/profile` · **Tipo:** diálogo

**Propósito**

Inscribir una aplicación de autenticación desde la sesión abierta, con reautenticación por contraseña.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Si no tiene la verificación activa. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Completo | Ídem. |
| Proveedor | Completo | Ídem. |

**Cómo se llega**

Perfil › Verificación en dos pasos › «Configurar».

**Distribución**

- Título «Configurar la verificación en dos pasos» (en la última etapa, «Guarde sus códigos de recuperación»); ancho 480 px con desplazamiento.
- Etapa 1: «Por seguridad, escriba su contraseña para configurar la verificación en dos pasos.» + campo + «Continuar».
- Etapa 2: panel de inscripción igual a [S-GEN-07](05_pantallas_generales.md#p-gen--s-gen-07--configurar-la-verificacion-en-dos-pasos-inscripcion-obligatoria-al-iniciar-sesio) (pasos 1–3, QR, clave, código, «Confirmar»).
- Etapa 3: panel [S-GEN-08](05_pantallas_generales.md#p-gen--s-gen-08--guarde-sus-codigos-de-recuperacion-panel).
- Botón «Cancelar» en las etapas 1 y 2.

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Contraseña actual» | Oculta | Sí | «Escriba su contraseña.»; se borra al recibir la inscripción | No |
| «Código de verificación» | 6 dígitos | Sí | «Ingrese los 6 dígitos del código.» | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Continuar» (etapa 1) | Titular | `AuthService/BeginMfaEnrollment(contraseña actual)`. | La contraseña es la confirmación | Etapa 2. |
| «Confirmar» (etapa 2) | Titular | `AuthService/ConfirmMfaEnrollment(código)`. | No | Etapa 3 con los códigos de recuperación. |
| «Continuar» (etapa 3, con la casilla marcada) | Titular | Cierra y devuelve éxito. | Casilla «Guardé estos códigos» | Snackbar de [S-GEN-22](05_pantallas_generales.md#p-gen--s-gen-22--verificacion-en-dos-pasos-seccion-del-perfil). |
| «Cancelar» | Titular | Cierra sin activar. | No | Sin cambios. |

**Estados y mensajes**

- Contraseña incorrecta: «La contraseña no es correcta.» (campo vaciado).
- Quinta contraseña errónea seguida: el servidor cierra todas las sesiones del usuario; el login muestra «Se cerró su sesión en todos los dispositivos tras demasiadas contraseñas incorrectas. Inicie sesión de nuevo.»
- Código incorrecto, bloqueo o demasiados intentos (cuenta regresiva).
- Cargando: spinner en el botón.

**Tiempo real**

Ninguno.

**Reglas de negocio**

- La sesión sola no basta para vincular un autenticador: exige la contraseña (único paso de reautenticación del ámbito general).
- Contraseña, secreto y códigos viven solo dentro del diálogo; no se cierra tocando fuera.

**Notas para el rediseño**

- Mantener la barrera no descartable y la etapa de códigos sin «Cancelar».

**Código fuente:** `features/profile/presentation/two_step_section.dart`, `features/auth/presentation/mfa/mfa_enrollment_panel.dart`, `mfa/recovery_codes_panel.dart`, `features/auth/presentation/widgets/password_field.dart`, `features/profile/infrastructure/mfa_gateway.dart`.

---

### <a id="p-gen--s-gen-24--dialogo-de-codigo-nuevos-codigos-de-recuperacion--desactivar"></a>S-GEN-24 Diálogo de código («Nuevos códigos de recuperación» / «Desactivar»)

**Ruta:** diálogo sobre `/app/<código>/profile` · **Tipo:** diálogo

**Propósito**

Confirmar con un código actual de la aplicación de autenticación una acción sensible sobre el propio factor.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Limitado | Regenerar códigos sí; «Desactivar» no, mientras su rol la exija (por defecto). |
| Recepción | Completo | Con la verificación activa y no bloqueada. |
| Enfermería / asistente médico | Completo | Ídem. |
| Proveedor | Completo | Ídem. |

**Cómo se llega**

Botones de [S-GEN-22](05_pantallas_generales.md#p-gen--s-gen-22--verificacion-en-dos-pasos-seccion-del-perfil).

**Distribución**

- Título, mensaje, campo «Código de verificación», banner de error, botones «Cancelar» y confirmar.
- Variante regenerar: «¿Generar nuevos códigos de recuperación?» / «Sus códigos de recuperación actuales dejarán de funcionar. Ingrese un código de su aplicación de autenticación para continuar.» / botón «Nuevos códigos de recuperación».
- Variante desactivar: «¿Desactivar la verificación en dos pasos?» / «Para iniciar sesión solo se pedirá su contraseña y sus códigos de recuperación dejarán de funcionar. Ingrese un código de su aplicación de autenticación para confirmar.» / botón «Desactivar» (rojo).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Código de verificación» | 6 dígitos | Sí | «Ingrese los 6 dígitos del código.»; se envía con Enter o con el botón | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Nuevos códigos de recuperación» | Titular | `AuthService/RegenerateRecoveryCodes(código)`. | El código es la confirmación | [S-GEN-25](05_pantallas_generales.md#p-gen--s-gen-25--dialogo-guarde-sus-codigos-de-recuperacion-perfil). |
| «Desactivar» | Titular sin rol que la exija | `AuthService/DisableMfa(código)`. | El código es la confirmación | Snackbar «La verificación en dos pasos está desactivada.» |
| «Cancelar» | Titular | Cierra. | No | Se vuelve a leer el estado. |

**Estados y mensajes**

- Código incorrecto: el diálogo sigue abierto, el campo se vacía, «Ese código no es válido. Revise la aplicación e inténtelo de nuevo.»
- Bloqueado (`mfa_locked`): solo queda «Cancelar».
- Obligatoria por rol: «Su rol exige la verificación en dos pasos, así que no se puede desactivar.»
- Demasiados intentos: cuenta regresiva.
- Enviando: spinner.

**Tiempo real**

Ninguno.

**Reglas de negocio**

- No se cierra tocando fuera; al cerrar se vuelve a leer el estado (un código erróneo puede haber bloqueado el factor).

**Notas para el rediseño**

- A diferencia del login, aquí el código no se envía solo al sexto dígito: inconsistencia.

**Código fuente:** `features/profile/presentation/two_step_section.dart`, `features/auth/presentation/mfa/mfa_code_field.dart`, `features/profile/infrastructure/mfa_gateway.dart`.

---

### <a id="p-gen--s-gen-25--dialogo-guarde-sus-codigos-de-recuperacion-perfil"></a>S-GEN-25 Diálogo «Guarde sus códigos de recuperación» (Perfil)

**Ruta:** diálogo sobre `/app/<código>/profile` · **Tipo:** diálogo

**Propósito**

Mostrar una única vez los códigos de recuperación recién generados.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Quien acaba de regenerar sus códigos. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Completo | Ídem. |
| Proveedor | Completo | Ídem. |

**Cómo se llega**

Tras confirmar la variante «Nuevos códigos de recuperación» de [S-GEN-24](05_pantallas_generales.md#p-gen--s-gen-24--dialogo-de-codigo-nuevos-codigos-de-recuperacion--desactivar).

**Distribución**

- Diálogo de 460 px con título «Guarde sus códigos de recuperación» y el panel [S-GEN-08](05_pantallas_generales.md#p-gen--s-gen-08--guarde-sus-codigos-de-recuperacion-panel).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Guardé estos códigos» | Casilla | Sí | «Continuar» deshabilitado hasta marcarla | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Copiar códigos» | Titular | Igual que en [S-GEN-08](05_pantallas_generales.md#p-gen--s-gen-08--guarde-sus-codigos-de-recuperacion-panel). | No | Snackbar de copia. |
| «Continuar» | Titular | Vacía el portapapeles y cierra. | Casilla | Sin snackbar. |

**Estados y mensajes**

Sin estados adicionales.

**Tiempo real**

Ninguno.

**Reglas de negocio**

- No se cierra tocando fuera; los códigos anteriores ya no sirven.

**Notas para el rediseño**

- Igual que [S-GEN-08](05_pantallas_generales.md#p-gen--s-gen-08--guarde-sus-codigos-de-recuperacion-panel).

**Código fuente:** `features/profile/presentation/two_step_section.dart`, `features/auth/presentation/mfa/recovery_codes_panel.dart`.

---

### <a id="p-gen--s-gen-26--descartar-cambios-sin-guardar"></a>S-GEN-26 ¿Descartar cambios sin guardar?

**Ruta:** diálogo sobre formularios · **Tipo:** diálogo

**Propósito**

Evitar perder datos escritos.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Completo | — |
| Enfermería / asistente médico | Completo | — |
| Proveedor | Completo | — |

**Cómo se llega**

Al retroceder (botón atrás del sistema, de la barra o del navegador) en un formulario protegido con cambios; al cambiar de sede desde el selector ([S-GEN-13](05_pantallas_generales.md#p-gen--s-gen-13--selector-de-sede-cabecera)) o desde [S-GEN-11](05_pantallas_generales.md#p-gen--s-gen-11--seleccionar-sede) con formularios registrados como sucios.

**Distribución**

- «¿Descartar cambios sin guardar?» / «Tiene cambios sin guardar. Si sale ahora se perderán.» — «Seguir editando» y «Descartar» (rojo).

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Descartar» | Todos | Continúa la salida o el cambio de sede. | Es la confirmación | Se pierden los cambios. |
| «Seguir editando» o tocar fuera | Todos | — | — | Se queda en el formulario. |

**Estados y mensajes**

Sin estados adicionales.

**Tiempo real**

Ninguno.

**Reglas de negocio**

- Al retroceder o cerrar lo usan: alta y edición de paciente, formulario de cita, signos vitales, valoración de enfermería, configuración de administración y los diálogos de formulario de Administración (`DirtyFormGuard` / `AdminFormDialog`).
- Al cambiar de sede lo usan los formularios registrados como sucios (`dirtyFormsProvider`): signos vitales, valoración de enfermería, registro de llegada (desde el paso 2), pago manual y pagador (cobertura). El registro de llegada, el pago manual y la cobertura no interceptan el retroceso; el alta y la edición de paciente, la cita y la configuración no se registran para el cambio de sede.
- Las variantes de cada módulo se documentan en [S-PAC-04](06_pantallas_pacientes.md#p-pac--s-pac-04--descartar-cambios-sin-guardar) y [S-REC-17](07_pantallas_recepcion.md#p-rec--s-rec-17--descartar-cambios-sin-guardar).
- Cambio de sede por URL con formularios sucios: se rechaza sin diálogo y se vuelve a la URL anterior.

**Notas para el rediseño**

- Observado en el código: la protección intercepta retrocesos (`PopScope`) y el cambio de sede, pero el router no tiene `onExit`: navegar con el menú lateral, la lupa o una notificación probablemente no pide confirmación. Verificar antes de prometerlo en el manual o al diseñar.

**Código fuente:** `core/widgets/dirty_form_guard.dart`, `features/locations/application/dirty_forms.dart`, `core/widgets/confirm_dialog.dart`.

---

### <a id="p-gen--s-gen-27--dialogo-de-confirmacion-generico"></a>S-GEN-27 Diálogo de confirmación genérico

**Ruta:** diálogo · **Tipo:** diálogo (componente)

**Propósito**

Patrón único para confirmar acciones críticas en todas las pantallas.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Lo usan los módulos para sus acciones críticas. |
| Recepción | Completo | — |
| Enfermería / asistente médico | Completo | — |
| Proveedor | Completo | — |

**Cómo se llega**

Desde las acciones que requieren confirmación (cerrar sesión, descartar cambios, fusionar pacientes, marcar no presentado, etc.).

**Distribución**

- Título, mensaje, botón «Cancelar» (o etiqueta propia) y botón principal «Confirmar» (o etiqueta propia; rojo si la acción es destructiva).

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Botón principal | Todos | Devuelve «confirmado». | — | La pantalla de origen ejecuta la acción. |
| «Cancelar» o tocar fuera | Todos | Devuelve «no confirmado». | — | No pasa nada. |

**Estados y mensajes**

Sin estados adicionales.

**Tiempo real**

Ninguno.

**Reglas de negocio**

- Tocar fuera equivale a cancelar.

**Notas para el rediseño**

- Mantener el estilo rojo para las acciones destructivas y que la acción segura sea la secundaria.

**Código fuente:** `core/widgets/confirm_dialog.dart`.

---

### <a id="p-gen--s-gen-28--estados-comunes-de-carga-vacio-y-error"></a>S-GEN-28 Estados comunes de carga, vacío y error

**Ruta:** dentro de cualquier pantalla · **Tipo:** panel (patrón común)

**Propósito**

Los cinco estados de interfaz y el texto de error uniforme de toda la app.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Aparecen automáticamente en todas las pantallas. |
| Recepción | Completo | — |
| Enfermería / asistente médico | Completo | — |
| Proveedor | Completo | — |

**Cómo se llega**

Automático.

**Distribución**

- Cargando sin datos: spinner centrado.
- Refrescando con datos: barra de 2 px arriba; el contenido no se reconstruye (conserva scroll y formularios).
- Vacío: icono (bandeja por defecto), «Aún no hay nada» / «No hay datos para mostrar.» y acción opcional.
- Error sin datos: icono de error, «Algo salió mal», mensaje traducido y «Reintentar».
- Error con datos: banner rojo compacto arriba con el mensaje + «Reintentar», con los datos visibles debajo.

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Reintentar» | Todos | Vuelve a pedir los datos. | No | Recarga. |

**Estados y mensajes (por motivo del servidor)**

| Motivo | Texto |
| --- | --- |
| Sesión expirada | «Su sesión expiró. Inicie sesión de nuevo.» |
| Permiso | «No tiene permiso para realizar esta acción.» |
| Sede | «No está autorizado para esta sede.» |
| Validación | «Algunos campos no son válidos. Revíselos.» / «El campo “{field}” es obligatorio.» / «La fecha no es válida.» / «El monto no es válido.» / «Se requiere un motivo.» / «Un valor está fuera del rango permitido.» |
| Conflicto de versión (`ABORTED`) | «Este registro fue actualizado por otro usuario. Actualice para continuar.» |
| Paciente duplicado | «Ya existe un paciente con el mismo nombre y fecha de nacimiento.» |
| Ya existe | «Este registro ya existe.» |
| No encontrado | «No se encontró el registro solicitado.» |
| Estado | «Esta acción no está permitida en el estado actual.» |
| Instalación | «La configuración del sistema está incompleta.» |
| Infraestructura | «Un servicio del sistema no está disponible temporalmente. Intente de nuevo en un momento.» |
| Límite de intentos | «Demasiados intentos. Intente de nuevo en {seconds} segundos.» |
| Sesión renovada | «Su sesión fue renovada. Repita la acción.» |
| Red | «No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.» |
| Cancelado | «La solicitud fue cancelada.» |
| Servidor | «Ocurrió un error inesperado. Intente de nuevo.» |

**Tiempo real**

Las recargas provocadas por eventos en vivo usan el estado «refrescando» (no vacían la pantalla).

**Reglas de negocio**

- Nunca se muestra el mensaje técnico del servidor; el texto sale del motivo (`x-reason`).
- Lecturas: ante `UNAUTHENTICATED` se renueva la sesión y se reintenta una vez. Escrituras: nunca se repiten solas; tras renovar se pide repetir («Su sesión fue renovada. Repita la acción.»).
- No existe un diálogo común de conflicto de versión: cada módulo decide cómo mostrar `ABORTED` (por ejemplo [S-PAC-12](06_pantallas_pacientes.md#p-pac--s-pac-12--actualizado-por-otro-usuario) o [S-REC-16](07_pantallas_recepcion.md#p-rec--s-rec-16--actualizada-por-otro-usuario-conflicto-de-version)).

**Notas para el rediseño**

- Mantener el árbol estable durante el refresco (sin parpadeo ni pérdida de scroll).
- Conservar el banner compacto de error sobre los datos existentes en lugar de reemplazarlos.

**Código fuente:** `core/widgets/async_view.dart`, `core/widgets/empty_view.dart`, `core/errors/failure_view.dart`, `core/errors/failure_l10n.dart`, `core/errors/app_failure.dart`, `core/grpc/grpc_error_mapper.dart`, `core/grpc/gateway.dart`.

---

### <a id="p-gen--s-gen-29--pagina-no-encontrada"></a>S-GEN-29 Página no encontrada

**Ruta:** cualquier ruta inexistente (página de error del router) · **Tipo:** página

**Propósito**

Informar de que la ruta no existe.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Sin sesión | Público | — |
| Administrador | Completo | Se muestra fuera del marco aunque haya sesión. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Completo | Ídem. |
| Proveedor | Completo | Ídem. |

**Cómo se llega**

URL mal escrita o enlace roto.

**Distribución**

- Barra superior con el nombre de la app (sin navegación ni menú).
- Icono de lupa tachada, «Página no encontrada» / «La página solicitada no existe.», botón «Atrás».

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Atrás» | Todos | Navega a `/`. | No | `/` redirige al inicio o al login ([S-GEN-01](05_pantallas_generales.md#p-gen--s-gen-01--arranque-y-redireccion-inicial)). |

**Estados y mensajes**

Sin estados adicionales.

**Tiempo real**

Ninguno.

**Reglas de negocio**

Sin reglas adicionales.

**Notas para el rediseño**

- El botón dice «Atrás» pero lleva al inicio.
- Se muestra fuera del marco aunque haya sesión.

**Código fuente:** `core/routing/placeholder_pages.dart`, `core/routing/app_router.dart`.

---

### <a id="p-gen--s-gen-30--componentes-compartidos-de-presentacion"></a>S-GEN-30 Componentes compartidos de presentación

**Ruta:** dentro de las pantallas · **Tipo:** panel (sistema de componentes)

**Propósito**

Piezas visuales reutilizadas que el rediseño debe tratar como sistema de diseño.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Usados por todos los módulos. |
| Recepción | Completo | — |
| Enfermería / asistente médico | Completo | — |
| Proveedor | Completo | — |

**Cómo se llega**

Forman parte de todas las pantallas.

**Distribución**

| Componente | Descripción |
| --- | --- |
| PageScaffold | Título grande, subtítulo opcional, acciones a la derecha que pasan a una segunda línea (máx. 60 % del ancho), cuerpo y botón flotante opcional. |
| StatusChip | Píldora con color + icono + texto; tonos neutro (○), información (ⓘ), éxito (✓), advertencia (⚠) y peligro (⊗); semántica «Estado: {label}». |
| HumanCodeText | Códigos humanos (por ejemplo `LAN-P-000001`) en monoespaciado con cifras tabulares; versión corta sin prefijo de sede; mantener pulsado copia el código completo. |
| MoneyText | Importe formateado según el idioma, cifras tabulares, alineado a la derecha, negativos en color de error. |
| ResponsiveTableOrCards | Tabla con desplazamiento horizontal desde 600 px; tarjetas por debajo; tabla vacía «Sin filas». |
| ResponsiveCardGrid | Dos columnas en > 1024 px; lista en el resto. |
| Tema | Color semilla `#0E7C86`, fuente Roboto, modos claro y oscuro. |

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Mantener pulsado un código humano | Todos | Copia el código completo al portapapeles. | No | Sin aviso visible. |

**Estados y mensajes**

Ver los tonos de StatusChip.

**Tiempo real**

Ninguno.

**Reglas de negocio**

- Los UUID nunca se muestran: siempre códigos humanos.
- Los estados nunca se comunican solo por color (icono + texto).
- Puntos de corte: compacto < 600 px, medio 600–1024 px, expandido > 1024 px; la tableta es el objetivo principal.

**Notas para el rediseño**

- La copia del código humano no da ninguna respuesta visual (sin snackbar).
- Cualquier cambio de tokens de color debe mantener el contraste de los cinco tonos en claro y oscuro.

**Código fuente:** `core/widgets/page_scaffold.dart`, `status_chip.dart`, `human_code_text.dart`, `money_text.dart`, `responsive_table_or_cards.dart`, `responsive_card_grid.dart`, `breakpoints.dart`, `core/theme/status_colors.dart`, `core/theme/app_theme.dart`.

---

### <a id="p-gen--s-gen-31--pantallas-heredadas-sin-ruta"></a>S-GEN-31 Pantallas heredadas sin ruta

**Ruta:** ninguna (código sin uso) · **Tipo:** página

**Propósito**

Restos de oleadas de desarrollo anteriores: la página «Próximamente» y la primera lista de estado del sistema de `/admin/settings` (hoy la sirve la página de Configuración del módulo de administración).

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Sin acceso | Ninguna ruta las construye. |
| Recepción | Sin acceso | Ídem. |
| Enfermería / asistente médico | Sin acceso | Ídem. |
| Proveedor | Sin acceso | Ídem. |

**Cómo se llega**

No son accesibles.

**Distribución**

- «Próximamente» / «La pantalla {name} aún no está disponible.»
- Lista de estado: «Estado de la instalación» («Entorno: {env}»), «Configuración pendiente» («Todo lo obligatorio está configurado.» / «Configuración sin definir» / «{kind} no responde con la configuración actual»), «Servicios» («Ningún servicio ha reportado todavía.», «Versión {version}», «Última señal {time}», «Sin señal desde hace más de 3 minutos»; chips Activo / Listo / Pausado / En espera).

**Campos**

Sin campos.

**Acciones**

Ninguna.

**Estados y mensajes**

- El chip de estado de esta lista trata «degradado» como «Comprobando».

**Tiempo real**

Ninguno.

**Reglas de negocio**

Sin reglas.

**Notas para el rediseño**

- No rediseñar: no están en uso; considerar eliminarlas para no confundir el inventario.

**Código fuente:** `core/routing/placeholder_pages.dart`, `features/setup/presentation/admin_settings_page.dart`, `features/setup/presentation/system_status_checklist.dart`.

---

## <a id="p-gen--preguntas-abiertas-detectadas-en-estas-pantallas"></a>Preguntas abiertas detectadas en estas pantallas

Puntos que el código no resuelve y que conviene decidir antes o durante el rediseño:

1. Con el router real, al quedar autenticado en `/setup` la guarda redirige a `/admin/settings`: ¿llega a verse el paso 3 «Instalación completada» del asistente ([S-GEN-02](05_pantallas_generales.md#p-gen--s-gen-02--configuracion-inicial-asistente-de-primer-arranque))? Las pruebas lo verifican sin router.
2. Navegar con el menú lateral, la lupa o una notificación mientras un formulario tiene cambios no parece pedir confirmación (no hay `onExit` en el router; la protección solo intercepta retrocesos). ¿Es intencional? ([S-GEN-26](05_pantallas_generales.md#p-gen--s-gen-26--descartar-cambios-sin-guardar))
3. Tras un cierre de sesión voluntario la guarda conserva `?from=` con la pantalla anterior, así que el siguiente usuario del dispositivo vuelve allí si tiene acceso. ¿Debe tratarse igual que el cierre por inactividad? ([S-GEN-17](05_pantallas_generales.md#p-gen--s-gen-17--confirmaciones-de-cierre-de-sesion))
4. Un usuario no administrador sin sedes asignadas solo ve Seleccionar sede: no puede abrir su Perfil ni gestionar su verificación en dos pasos o sus preferencias. ¿Es aceptable? ([S-GEN-11](05_pantallas_generales.md#p-gen--s-gen-11--seleccionar-sede), [S-GEN-21](05_pantallas_generales.md#p-gen--s-gen-21--perfil))
5. Las notificaciones viven solo en memoria y llegan solo por WebSocket: se pierden al recargar o si el socket está caído. ¿Se espera un historial persistente? ([S-GEN-15](05_pantallas_generales.md#p-gen--s-gen-15--centro-de-notificaciones))
6. El idioma elegido en la pantalla de login se sobrescribe con la preferencia del servidor al iniciar sesión. ¿Comportamiento deseado? ([S-GEN-03](05_pantallas_generales.md#p-gen--s-gen-03--iniciar-sesion))
7. No existe cambio de contraseña desde el Perfil ni recuperación autoservicio (solo enlace del administrador). Confirmar que es la política.
8. Aparte de la contraseña para configurar la verificación en dos pasos desde el Perfil, no hay ninguna otra reautenticación («step-up»). ¿Hay otras acciones que deban pedirla?
9. La página de invitación no muestra el correo ni el rol y no valida el token hasta enviar. ¿Se quiere mostrar esa información? ([S-GEN-09](05_pantallas_generales.md#p-gen--s-gen-09--aceptar-invitacion))
10. El controlador de tema admite el modo «sistema», pero la interfaz solo ofrece Claro / Oscuro. ¿Se añade «Sistema»?
11. En tamaño compacto, cuando la página actual no está entre los 5 destinos de la barra inferior, «Panel» parece seleccionado. Confirmar visualmente en un dispositivo. ([S-GEN-12](05_pantallas_generales.md#p-gen--s-gen-12--marco-de-la-aplicacion-y-navegacion-principal))
12. El botón de [S-GEN-05](05_pantallas_generales.md#p-gen--s-gen-05--actualizacion-necesaria) dice «Ir a iniciar sesión» también en invitación, restablecimiento e instalación, donde solo vuelve al mismo formulario. ¿Se renombra?
13. Las pantallas de [S-GEN-31](05_pantallas_generales.md#p-gen--s-gen-31--pantallas-heredadas-sin-ruta) no tienen ruta. ¿Se eliminan?
14. Qué recibe exactamente cada rol por el canal personal `user:<id>:notifications` lo decide el servidor; desde el cliente solo se deduce que Recepción normalmente no recibe avisos. Confirmar con `docs/09_WEBSOCKET_PROTOCOL.md`.
