# <a id="g-adm--guia-del-rol-administrador"></a>Guía del rol Administrador

El Administrador tiene todos los permisos. Pone en marcha el sistema, gestiona al personal, las sedes, los catálogos, los precios y las reglas de bono; vigila la seguridad, la auditoría y los reportes de toda la compañía; y es el único que puede hacer correcciones excepcionales (fusionar pacientes, forzar el estado de una visita, anular cargos y pagos). También puede cubrir cualquier puesto del flujo clínico. Esta guía describe su trabajo paso a paso; la visión general está en el [README](README.md).

## <a id="g-adm--en-resumen"></a>En resumen

| Destino del menú | Para qué lo usa el Administrador |
| --- | --- |
| Panel, Pacientes, Citas, Cola de enfermería, Cola de proveedor, Cola de órdenes, Caja, Reportes | Lo mismo que cada rol operativo, sin restricciones (ver las guías [01](01_recepcion.md), [02](02_enfermeria.md) y [03](03_proveedor.md)). El Panel abre con «Todos los abiertos». |
| **Usuarios** [S-ADM-02](#s-adm-02) | Invitaciones, roles, sedes, contraseñas, verificación en dos pasos, sesiones, baja, reactivación y eliminación. |
| **Sedes** [S-ADM-10](#s-adm-10) | Alta, edición, activación y desactivación de sedes. |
| **Catálogos** [S-ADM-13](#s-adm-13) | Tipos de cita, procedimientos, pruebas de laboratorio y sus precios por proveedor, proveedores de laboratorio y fuentes de referido. |
| **Planes de membresía** [S-ADM-21](#s-adm-21) | Planes, cuotas y beneficios. |
| **Reglas de bono** [S-ADM-23](#s-adm-23) | Bono diario por tramo de ingreso recibido. |
| **Reportes de la compañía** [S-ADM-24](#s-adm-24) | Actividad y dinero de todas las sedes o de una, por día o por rango. |
| **Auditoría** [S-ADM-26](#s-adm-26) | Rastro inmutable de acciones. |
| **Configuración** [S-ADM-28](#s-adm-28) | Estado del sistema, ajustes operativos, integraciones y mantenimiento de claves. |
| **Seguridad** [S-ADM-34](#s-adm-34) | Alertas de seguridad (con insignia de alertas sin reconocer). |

Las pantallas de Administración son de toda la compañía: viven en `/admin/…`, no llevan sede en la URL y no dependen de la sede activa. En teléfono solo se alcanzan desde el menú (cajón). La verificación en dos pasos es obligatoria para el Administrador con la política por defecto (`auth.mfa.required_roles`).

## <a id="g-adm--un-dia-del-administrador"></a>Un día del Administrador

Marta, administradora de la compañía, inicia sesión con su contraseña y el código de su aplicación de autenticación. La insignia de «Seguridad» marca 1. Abre la alerta: «Inicios de sesión fallidos repetidos» sobre la cuenta de un recepcionista, severidad «Media». Lee «Qué significa», abre las entradas de auditoría que la originaron y confirma con el recepcionista que había olvidado la contraseña. Pulsa «Reconocer», escribe el número de incidente en la nota y la alerta queda «Reconocida».

Después atiende al personal: invita a la enfermera que empieza el lunes en las sedes LAN y DAL, copia el enlace de invitación que aparece una sola vez y lo pega enseguida en el canal interno (al cerrar el diálogo la app lo quita del portapapeles); crea un restablecimiento de contraseña para el recepcionista y le entrega el token.

A media mañana actualiza el precio de un laboratorio externo: cierra la ventana vigente con «Vigente hasta» y crea una nueva con el precio nuevo desde el día siguiente. Una recepcionista le avisa de que registró dos veces a la misma paciente: abre el perfil del duplicado, pulsa «Fusionar con…», selecciona el registro correcto, escribe MERGE y confirma.

Al final del día abre «Reportes de la compañía», compara las sedes en la tabla diaria, toca una sede para ver su detalle y exporta el CSV del mes para contabilidad.

## <a id="g-adm--flujos-de-trabajo"></a>Flujos de trabajo

### <a id="g-adm--a-puesta-en-marcha"></a>A. Puesta en marcha

#### <a id="g-adm--1-primer-arranque-crear-el-primer-administrador-y-completar-la-configuracion"></a>1. Primer arranque: crear el primer Administrador y completar la configuración

1. Abrir la app en una instalación nueva: [S-GEN-01](#s-gen-01) lleva a «Configuración inicial» [S-GEN-02](#s-gen-02).
2. Paso 1, «Token de instalación»: pegar el token tal como lo entrega el servidor (en desarrollo se imprime como «SETUP TOKEN: …»; también se guarda en `setup-token.txt` junto al servidor cuando el directorio admite escritura; el operador puede emitir uno nuevo con `clinic-backend setup-token`) → «Siguiente».
3. Paso 2, «Administrador»: «Correo electrónico», «Nombre para mostrar», «Contraseña» (10 a 128 caracteres con al menos una letra y un dígito) y «Confirmar contraseña» → «Crear administrador». Si el token no es válido, la app vuelve al paso 1 con el error.
4. «Configurar la verificación en dos pasos» [S-GEN-07](#s-gen-07): instalar una aplicación de autenticación, escanear el QR (o escribir la clave) y escribir el código → «Confirmar».
5. «Guarde sus códigos de recuperación» [S-GEN-08](#s-gen-08): guardarlos en un lugar seguro, marcar «Guardé estos códigos» → «Continuar». La sesión empieza.
6. La app abre «Configuración» [S-ADM-28](#s-adm-28). En todas las páginas aparece el banner de configuración incompleta [S-ADM-38](#s-adm-38).
7. La «Lista de configuración inicial» [S-ADM-29](#s-adm-29) muestra las claves que faltan y la infraestructura que no responde; tocar cada chip salta al campo en «Ajustes» [S-ADM-31](#s-adm-31) o «Integraciones» [S-ADM-32](#s-adm-32).
8. Rellenar los valores (los secretos con «Reemplazar») y pulsar «Guardar cambios» en la barra inferior → «Ajustes guardados.».
9. En «Integraciones», «Probar conexión» de NATS y de MinIO (permitido antes de terminar) hasta ver «Correcto».
10. «Estado del sistema» [S-ADM-30](#s-adm-30) pasa a «Listo»; el banner desaparece y la operación clínica queda habilitada.
11. Continuar con las sedes (flujo 2), los catálogos (flujos 3 a 6) y el personal (flujo 7). Mantener al menos dos Administradores.

#### <a id="g-adm--2-abrir-una-sede"></a>2. Abrir una sede

1. «Sedes» [S-ADM-10](#s-adm-10) → «Nueva sede» → [S-ADM-11](#s-adm-11).
2. «Código» (2 a 8 letras mayúsculas, p. ej. `LAN`; no se puede cambiar después: aparece en las URL y en los códigos humanos), «Nombre», «Zona horaria» (buscador IANA [S-ADM-12](#s-adm-12), p. ej. `America/New_York`), «Dirección» y «Teléfono» opcionales → «Crear» → «Guardado.».
3. La sede ya aparece en el selector de la cabecera. Asignarla al personal con «Editar sedes» (flujo 8) o al invitar.
4. Para cerrarla: «Más acciones» › «Desactivar» → «¿Desactivar {name}?» → «Desactivar». El personal no puede trabajar en ella y el historial se conserva. «Activar» la reabre sin confirmación.

#### <a id="g-adm--3-mantener-los-catalogos-operativos"></a>3. Mantener los catálogos operativos

1. «Catálogos» abre «Tipos de cita» [S-ADM-13](#s-adm-13); los chips superiores cambian de catálogo: «Procedimientos» [S-ADM-14](#s-adm-14), «Pruebas de laboratorio» [S-ADM-15](#s-adm-15), «Proveedores de laboratorio» [S-ADM-17](#s-adm-17), «Fuentes de referido» [S-ADM-18](#s-adm-18), «Planes de membresía», «Reglas de bono».
2. «Nuevo» (o «+» en teléfono) o tocar una fila para editar → formulario [S-ADM-19](#s-adm-19). Los campos opcionales dicen «(opcional)»; el «Código» (`^[A-Z][A-Z0-9_]{1,40}$`) solo se escribe al crear.
3. Tipos de cita: nombres EN/ES, «Duración predeterminada (opcional)» (1 a 1440 min; las citas exigen 5 a 480), «Ruta sugerida (opcional)» («Estándar», «Solo inyección», «Solo laboratorio», «Solo procedimiento») y «Orden». Procedimientos: «Precio de venta» en USD.
4. «Crear» / «Guardar» → «Guardado.».
5. Para retirar una opción: «Más acciones» › «Desactivar» → [S-ADM-20](#s-adm-20): deja de ofrecerse al personal y se conserva en el historial. «Mostrar inactivos» + «Activar» la recupera.
6. El personal ve los tipos de cita y planes nuevos al volver a iniciar sesión (se guardan en caché durante la sesión).

#### <a id="g-adm--4-configurar-un-laboratorio-externo-y-sus-precios"></a>4. Configurar un laboratorio externo y sus precios

1. «Proveedores de laboratorio» [S-ADM-17](#s-adm-17) → «Nuevo»: «Código» y «Nombre».
2. «Pruebas de laboratorio» [S-ADM-15](#s-adm-15) → «Nuevo»: código, nombres EN/ES y «Precio de venta predeterminado».
3. En la prueba, «Más acciones» › «Precios por proveedor» → [S-ADM-16](#s-adm-16) → «Nuevo»: «Proveedor de laboratorio», «Código externo (opcional)», «Costo interno», «Precio de venta», «Vigente desde» y «Vigente hasta (opcional)».
4. Para cambiar un precio a futuro: editar la ventana actual fijando «Vigente hasta» y crear otra con el nuevo «Vigente desde». Proveedor y fecha de inicio no se editan después. Las ventanas vencidas se ven con «Mostrar vencidos».

#### <a id="g-adm--5-crear-un-plan-de-membresia-con-beneficios"></a>5. Crear un plan de membresía con beneficios

1. «Planes de membresía» [S-ADM-21](#s-adm-21) → «Nuevo»: código, nombres, «Cuota inicial», «Cuota mensual», «Máximo de miembros» (1 a 1000).
2. «Más acciones» › «Beneficios» → [S-ADM-22](#s-adm-22) → «Nuevo»: «Tipo de beneficio» («Descuento» o «Incluido»; no se puede cambiar después), «Categoría» (código, p. ej. `OFFICE_VISIT`), «Descuento» (%) o «Cantidad incluida» según el tipo, y «Periodo» («Mes», «Año», «Vitalicio»).
3. En caja, los beneficios solo descuentan cargos de órdenes de pacientes con cobertura Membresía y membresía activa el día de la visita, y nunca líneas con descuento manual.

#### <a id="g-adm--6-definir-reglas-de-bono"></a>6. Definir reglas de bono

1. «Reglas de bono» [S-ADM-23](#s-adm-23) → «Nuevo»: «Sede (opcional)» (vacío = «Toda la compañía»), «Nombre», «Ingreso diario mínimo», «Ingreso diario máximo (opcional)», «Tipo de bono» («Monto fijo» o «Porcentaje del ingreso»), «Valor», «Vigente desde» y «Vigente hasta (opcional)».
2. Aplica a un día cuyo ingreso recibido está en el tramo (mínimo ≤ recibido < máximo) dentro de la vigencia. La regla de sede gana a la de compañía; entre varias gana el mínimo más alto.
3. Se ve en el reporte diario de la sede, tarjeta «Dinero» → «Bono» con el nombre de la regla o «Ninguna regla de bono aplicó».
4. «Desactivar» cierra la vigencia en el día de hoy: los días pasados conservan su bono.

### <a id="g-adm--b-personal"></a>B. Personal

#### <a id="g-adm--7-dar-de-alta-a-un-empleado-invitacion"></a>7. Dar de alta a un empleado (invitación)

1. «Usuarios» [S-ADM-02](#s-adm-02) → «Invitar usuario» → [S-ADM-03](#s-adm-03).
2. «Correo electrónico», «Nombre para mostrar», al menos un rol («Administrador», «Recepción», «Enfermería / MA», «Proveedor») y al menos una sede activa → «Crear invitación».
3. Aparece «Invitación creada» [S-ADM-04](#s-adm-04) con «Enlace de invitación» y «Token de invitación» y su vencimiento. Copiar con «Copiar» y entregarlo por un canal propio: **solo se muestra una vez**. Lo copiado sale del portapapeles al pulsar «Cerrar» y al cabo de un minuto (salvo que se haya copiado otra cosa encima): pegarlo antes; el historial o la sincronización del portapapeles del sistema pueden conservar una copia. En Android el enlace es solo la ruta `/invite/<token>`.
4. La fila queda «Invitado». La persona abre el enlace [S-GEN-09](#s-gen-09), elige nombre, contraseña, idioma y tema; si su rol exige verificación en dos pasos, la configura en ese momento.
5. Pulsar «Actualizar» en Usuarios: la fila pasa a «Activo».
6. Si el enlace se perdió y la persona sigue «Invitado», volver a invitar el mismo correo emite un enlace nuevo; o «Revocar invitación» [S-ADM-07](#s-adm-07) e invitar de nuevo.

#### <a id="g-adm--8-cambiar-nombre-roles-o-sedes"></a>8. Cambiar nombre, roles o sedes

1. «Más acciones» › «Editar nombre» [S-ADM-05](#s-adm-05), «Editar roles» o «Editar sedes» [S-ADM-06](#s-adm-06).
2. Marcar las casillas (al menos una) → «Guardar». Los permisos efectivos son la unión de roles en las sedes asignadas.
3. La persona ve los cambios de navegación en su próxima sesión (los roles se leen al iniciar sesión). Si se le concede un rol que exige verificación en dos pasos, el servidor cierra sus sesiones para que la configure.
4. Si era el último Administrador activo aparece «Es el último administrador activo. Primero asigne el rol de administrador a otra persona.».

#### <a id="g-adm--9-contrasena-olvidada"></a>9. Contraseña olvidada

1. Verificar la identidad de la persona fuera de la app.
2. «Más acciones» › «Crear restablecimiento de contraseña» (solo usuarios «Activo»).
3. Aparece «Restablecimiento de contraseña creado» [S-ADM-04](#s-adm-04) con el token (sin enlace). Entregar el enlace `/reset/<token>` construido con la dirección de la app. El portapapeles se vacía igual que en el flujo 7.
4. La persona fija la contraseña nueva en [S-GEN-10](#s-gen-10) e inicia sesión.
5. Si había un restablecimiento de verificación en dos pasos pendiente, se abre [S-ADM-08](#s-adm-08) en su vista «pendiente» → «Emitir un token nuevo».

#### <a id="g-adm--10-telefono-perdido-o-verificacion-en-dos-pasos-bloqueada"></a>10. Teléfono perdido o verificación en dos pasos bloqueada

1. Confirmar la identidad en persona o por un número conocido.
2. «Más acciones» › «Restablecer la verificación en dos pasos» → [S-ADM-08](#s-adm-08) (no disponible sobre la propia cuenta ni sobre invitados). El diálogo lee primero el estado: «Configurada el {date}…», «Bloqueada desde el {date}…» (con el origen de los códigos erróneos: contraseña, sesión o Google) o «… no tiene verificación en dos pasos que restablecer.».
3. Si está bloqueada, tratarlo como incidente de seguridad. Si se pide, marcar la casilla de la cuenta de Google.
4. Escribir el «Motivo» (obligatorio, máx. 500) → «Restablecer la verificación en dos pasos».
5. Para un usuario «Activo» aparece «Verificación en dos pasos restablecida» [S-ADM-04](#s-adm-04) con el token de contraseña y el aviso «Se restableció la verificación en dos pasos de {name}.». La contraseña anterior y el inicio con Google dejan de funcionar.
6. La persona fija la contraseña en `/reset/<token>` y, al entrar, configura de nuevo la verificación [S-GEN-07](#s-gen-07).
7. Si el token se pierde: volver a [S-ADM-08](#s-adm-08) (vista pendiente) → «Emitir un token nuevo».

#### <a id="g-adm--11-cortar-el-acceso-dar-de-baja-y-recontratar"></a>11. Cortar el acceso, dar de baja y recontratar

1. **Cortar el acceso ya, sin baja:** «Cerrar sesión en todos los dispositivos» → [S-ADM-07](#s-adm-07) → «{count} sesiones cerradas.».
2. **Baja:** «Deshabilitar» → «¿Deshabilitar a {name}?» → «Deshabilitar». Cierra todas sus sesiones al instante; chip «Deshabilitado».
3. **Recontratación:** filtro «Deshabilitado» → «Reactivar» → [S-ADM-09](#s-adm-09): escribir el motivo (obligatorio, sin datos de pacientes; se guarda cifrado en la auditoría) → «Reactivar».
4. En el aviso que aparece pulsar «Crear restablecimiento de contraseña» (o hacerlo luego desde el menú): la contraseña anterior ya no funciona y, si tenía verificación en dos pasos, se restablece.

#### <a id="g-adm--12-revocar-una-invitacion-o-eliminar-un-usuario"></a>12. Revocar una invitación o eliminar un usuario

1. «Revocar invitación» (solo «Invitado») → confirmar → «Invitación revocada.».
2. «Eliminar» → «¿Eliminar a {name}?» / «Esta acción no se puede deshacer…» → «Eliminar» → «Usuario eliminado.». La fila solo se ve con el filtro «Eliminado» y queda sin acciones. No se puede eliminar al último Administrador activo ni a uno mismo; no hay restauración.

#### <a id="g-adm--13-nadie-puede-entrar-como-administrador-break-glass"></a>13. Nadie puede entrar como Administrador (break-glass)

No se hace desde la aplicación. Es un procedimiento de servidor (docs/10 y docs/compliance/06 §8.1):

1. Un operador con acceso al servidor ejecuta en el contenedor del núcleo `clinic-backend break-glass --email <correo> --reason -` (el motivo se lee de la entrada estándar).
2. La cuenta queda «Activo» con rol Administrador, sin contraseña, sin sesiones y con la verificación en dos pasos pendiente; el comando imprime un token de restablecimiento de un solo uso (30 minutos).
3. La persona fija la contraseña en `/reset/<token>` y configura la verificación al entrar.
4. Queda la entrada `admin.break_glass` en Auditoría [S-ADM-26](#s-adm-26) y la alerta «Crítica» «Acceso de emergencia (break-glass) usado» en Seguridad [S-ADM-34](#s-adm-34). Otro Administrador debe revisarla y reconocerla.

### <a id="g-adm--c-operacion-y-control"></a>C. Operación y control

#### <a id="g-adm--14-cambiar-un-ajuste-operativo"></a>14. Cambiar un ajuste operativo

1. «Configuración» [S-ADM-28](#s-adm-28) → pestaña «Ajustes» [S-ADM-31](#s-adm-31). Grupos: «Autenticación», «Valores predeterminados», «Procesos de fondo», «CORS», «Documentos», «Tiempo real», «Activación de servicios», «NATS», «Almacenamiento de objetos (MinIO)», «Inicio de sesión con Google», «SMTP», «SMS», «Calendario», «Laboratorios», «CRM», «Resultados de pruebas de integración» y «Otros» (alertas de seguridad, mantenimiento y copias de seguridad).
2. Editar el campo (p. ej. `auth.idle_logout_minutes`, 5 a 120): se marca y aparece la barra «1 cambio sin guardar».
3. «Guardar cambios» → «Ajustes guardados.». Se aplica en caliente, sin reiniciar. Los cambios de varias pestañas se guardan juntos.
4. Si el servidor rechaza un valor aparece «Valor no válido: {reason}» en el campo y la app salta a su pestaña. Si otro Administrador cambió la misma clave aparece el conflicto con «Actualizar».
5. Para volver al valor por defecto: icono «Restablecer valor predeterminado» → confirmar (se aplica de inmediato, fuera del lote).
6. Los secretos nunca se muestran: «Configurado · \*\*\*\*{pista}», con «Reemplazar» y «Vaciar».
7. Relajar alertas de seguridad, límites de intentos o el SMTP genera la alerta «Alertas de seguridad relajadas»; si después el correo de alertas deja de entregarse durante horas, aparece «Correos de alerta sin entregar».
8. Salir con el menú lateral no pregunta por los cambios sin guardar: el borrador queda en memoria y reaparece al volver.

#### <a id="g-adm--15-probar-integraciones-y-vigilar-el-estado-del-sistema"></a>15. Probar integraciones y vigilar el estado del sistema

1. «Integraciones» [S-ADM-32](#s-adm-32): cada tarjeta (NATS, MinIO, Google, SMTP, SMS, Calendario, Laboratorios, CRM) tiene su interruptor, sus ajustes y «Probar conexión» → «Correcto» o «Falló» con fecha y mensaje. Con cambios sin guardar en la tarjeta aparece «Guarde los cambios pendientes antes de probar.».
2. «Estado del sistema» [S-ADM-30](#s-adm-30): chip de configuración («Listo», «Esperando configuración», «Degradado: el trabajo clínico continúa», «Comprobando…»), infraestructura (mensajería y almacenamiento), cambios de estado recientes y latidos de cada servicio («Sin latido» en rojo si un proceso dejó de reportar). Se actualiza cada 30 segundos mientras algo no está activo.

#### <a id="g-adm--16-seguir-una-rotacion-de-claves"></a>16. Seguir una rotación de claves

1. «Mantenimiento de claves» [S-ADM-33](#s-adm-33): «{n} filas pendientes» o «Completo», versiones de claves configuradas y trabajos.
2. Si los trabajos están en pausa, «Iniciar» → «Mantenimiento de claves iniciado: los trabajos corren en segundo plano.»; «Pausar» los detiene tras el lote actual. El panel se actualiza cada 15 segundos.
3. Una columna con versión desconocida (en rojo) exige que el operador vuelva a configurar esa clave en el servidor. Las claves nunca llegan a la app.

#### <a id="g-adm--17-revisar-y-reconocer-alertas-de-seguridad"></a>17. Revisar y reconocer alertas de seguridad

1. Llega el aviso «Alerta de seguridad» a la campana [S-ADM-39](#s-adm-39) y sube la insignia de «Seguridad» [S-ADM-01](#s-adm-01).
2. «Alertas de seguridad» [S-ADM-34](#s-adm-34): comprobar primero que la detección esté al día (si no, recuadro «La detección de seguridad no está al día: puede faltar alguna alerta»). Filtrar por «Alerta», «Severidad mínima» o «Estado» («Sin reconocer»).
3. Abrir la alerta [S-ADM-35](#s-adm-35): «Qué significa», «Quién», «Cuándo», «Conteo» frente al umbral, «Correo al personal» y reconocimientos previos.
4. Investigar con las «Entradas de auditoría que originaron la alerta» (cada ID abre [S-ADM-37](#s-adm-37)) o con el registro completo (flujo 18).
5. «Reconocer» → [S-ADM-36](#s-adm-36): nota opcional (número de incidente o por qué es esperada; nunca datos de pacientes, máx. 1000) → «Reconocer» → «Alerta reconocida». La insignia baja y otros Administradores lo ven en vivo.
6. Una alerta sobre uno mismo debe reconocerla otro Administrador («Esta alerta es sobre ti: debe reconocerla otro administrador.»), salvo que sea el único.
7. Responder según la regla: «Cerrar sesión en todos los dispositivos», restablecer contraseña o verificación (flujos 9 a 11).

Reglas de alerta que conoce la app: «Inicios de sesión fallidos repetidos», «Adivinación lenta de contraseña», «Muchos inicios de sesión fallidos en total», «Códigos MFA fallidos repetidos», «Segundo factor bloqueado», «Solicitudes denegadas repetidas», «Token de sesión reutilizado», «Lectura de muchas fichas de pacientes», «Exportación masiva», «Acceso de emergencia (break-glass) usado», «Límite de intentos de inicio de sesión alcanzado repetidamente», «Alertas de seguridad relajadas», «Revisión incompleta», «Archivado de WAL con retraso», «Fila append-only reescrita fuera de un job de mantenimiento» y «Correos de alerta sin entregar». Las tres últimas vigilan procesos del servidor, no a una persona: «Quién» muestra «El archivado de WAL de la base de datos», «La credencial de mantenimiento de claves» o «El canal de correo de alertas», y «Qué significa» dice qué revisar (el contenedor walarchiver, su credencial del almacén y wal-verify.sh; quién tiene la credencial de mantenimiento de la base; los ajustes smtp.\*).

#### <a id="g-adm--18-investigar-en-el-registro-de-auditoria"></a>18. Investigar en el registro de auditoría

1. «Auditoría» [S-ADM-26](#s-adm-26): filtros «Actor» (ID de usuario), «Tipo de entidad», «ID de entidad», «Prefijo de acción» (p. ej. `billing.` o `patient.create`), «Sede», «Desde» y «Hasta» → «Aplicar filtros» (o Enter).
2. «Cargar más» para las páginas siguientes (50 por página); tocar una fila abre el detalle [S-ADM-27](#s-adm-27) con los metadatos censurados (sin PHI).
3. «Limpiar filtros» vuelve a la vista completa. La propia consulta queda auditada.
4. El filtro «Sede» solo funciona con sedes asignadas al Administrador; otra sede responde «No está autorizado para esta sede.».

#### <a id="g-adm--19-reportes-de-la-compania-e-impresion-o-exportacion"></a>19. Reportes de la compañía e impresión o exportación

1. «Reportes de la compañía» [S-ADM-24](#s-adm-24) con «Todas las sedes»: pestaña «Diario» con la tabla por sede y la fila «Totales de la compañía» (columnas de Administrador «Saldo pendiente» y «Bono» incluidas). Navegar con ‹, ›, «Hoy» o el campo «Fecha».
2. Tocar una sede de la tabla (o elegirla en «Sede») muestra su reporte diario detallado.
3. Pestaña «Rango» [S-ADM-25](#s-adm-25): «Desde» y «Hasta» (máx. 92 días) o los atajos de 7 y 30 días; gráfico «Recibido por día» y tabla con «Total».
4. «Imprimir» o «Exportar CSV»: la app registra primero la exportación en la auditoría y luego produce el archivo; si no puede registrarla, cancela con «Exportación cancelada: no se pudo registrar en la auditoría…». En la vista diaria de una sola sede no hay CSV (sí en Rango).
5. Muchas exportaciones seguidas generan la alerta «Exportación masiva».

### <a id="g-adm--d-correcciones-exclusivas-del-administrador-en-el-flujo-clinico"></a>D. Correcciones exclusivas del Administrador en el flujo clínico

#### <a id="g-adm--20-fusionar-dos-registros-del-mismo-paciente"></a>20. Fusionar dos registros del mismo paciente

1. Abrir el perfil del registro **duplicado** [S-PAC-05](#s-pac-05) → «Fusionar con…» → «Fusionar pacientes» [S-PAC-13](#s-pac-13).
2. En «Buscar al otro paciente», buscar por código o nombre/apellido (exactos) → «Seleccionar» en el registro correcto.
3. Revisar «Principal (se conserva)» y «Duplicado (se fusiona)»; si la dirección es al revés, «Invertir dirección». Por defecto el paciente abierto es el duplicado.
4. Escribir MERGE en «Escriba MERGE para confirmar» → «Fusionar» → «¿Fusionar estos pacientes?» [S-PAC-14](#s-pac-14) → «Fusionar».
5. «Pacientes fusionados.» y se abre el principal. Citas, visitas, documentos, referencias, membresías y códigos (de sedes donde el principal no tenía) pasan al principal; el duplicado queda «Fusionado». Es irreversible.
6. Para ver registros fusionados en la búsqueda, activar «Incluir fusionados» en [S-PAC-01](#s-pac-01).

#### <a id="g-adm--21-forzar-el-estado-de-una-visita"></a>21. Forzar el estado de una visita

1. En la visita, barra de acciones [S-CLI-07](#s-cli-07) → «Forzar estado…» (disponible también en visitas cerradas).
2. En [S-CLI-10](#s-cli-10) elegir «Nuevo estado» y escribir el «Motivo» (obligatorio, máx. 500) → «Forzar».
3. «Visita movida a {estado}.»; en el «Historial» [S-CLI-24](#s-cli-24) la entrada lleva el chip «Forzado» y el motivo. Sirve para reabrir una visita cerrada por error o corregir un estado; para cerrar se usa «Cerrar visita…».
4. La lista de destinos no incluye los pasos regulares ni el cierre; la interfaz no permite forzar el paso a caja con órdenes abiertas.

#### <a id="g-adm--22-anular-un-cargo-o-un-pago-y-reemitir-el-recibo"></a>22. Anular un cargo o un pago y reemitir el recibo

1. En el checkout de una visita abierta [S-CAJ-03](#s-caj-03):
   - Cargo **manual** erróneo: icono «Anular cargo» [S-CAJ-07](#s-caj-07) → «Motivo» (máx. 200) en [S-CAJ-10](#s-caj-10) → «Anular» → «Cargo anulado.». Los cargos de órdenes se anulan cancelando la orden.
   - Pago erróneo: icono «Anular pago» en la lista [S-CAJ-12](#s-caj-12) → «Motivo» en [S-CAJ-13](#s-caj-13) → «Anular» → «Pago anulado.».
2. Los recibos ya emitidos no cambian: generar uno nuevo [S-CAJ-14](#s-caj-14) e imprimirlo.
3. Si el saldo queda negativo se muestra en rojo como crédito a favor del paciente (no hay reembolsos en V1).

#### <a id="g-adm--23-documentos-eliminados-y-otras-vistas-ampliadas"></a>23. Documentos eliminados y otras vistas ampliadas

- En el panel de documentos [S-PAC-09](#s-pac-09), «Mostrar eliminados» enseña los documentos ocultos (chip «Eliminado» con la fecha); no se pueden ver, descargar ni restaurar. El Administrador puede eliminar cualquier documento disponible [S-PAC-18](#s-pac-18).
- En «Nueva orden» [S-CLI-18](#s-cli-18) el Administrador ve además el «Costo interno» del laboratorio.
- En «Cola de órdenes» [S-CLI-03](#s-cli-03) puede iniciar órdenes asignadas a otra persona y cancelar cualquiera, incluso de visitas cerradas.

#### <a id="g-adm--24-cubrir-cualquier-puesto"></a>24. Cubrir cualquier puesto

El Administrador puede ejecutar todos los pasos de Recepción, Enfermería y Proveedor siguiendo sus guías. Diferencias: el Panel abre con «Todos los abiertos»; en la Cola de proveedor el filtro inicial es «Todos» y, sin el rol Proveedor, «Iniciar consulta» inicia la visita sin asignarle proveedor; «Mis pacientes» solo aparece si además tiene el rol Proveedor.

## <a id="g-adm--que-puede-y-que-no-puede-hacer"></a>Qué puede y qué no puede hacer

| Puede | No puede (ni siquiera el Administrador) |
| --- | --- |
| Todo lo que pueden Recepción, Enfermería y Proveedor, en cualquier sede asignada. | Deshabilitarse, eliminarse, quitarse el rol Administrador, cerrar sus propias sesiones desde Usuarios o restablecer su propia verificación en dos pasos. |
| Invitar, editar, deshabilitar, reactivar y eliminar usuarios; asignar roles y sedes. | Dejar la compañía sin un Administrador activo (`last_administrator`) ni restaurar un usuario eliminado. |
| Restablecer contraseñas y la verificación en dos pasos de otros. | Desactivar su propia verificación en dos pasos mientras el rol la exija. |
| Crear, editar, activar y desactivar sedes. | Cambiar el código de una sede ya creada. |
| Mantener catálogos, precios por proveedor, planes, beneficios y reglas de bono. | Cambiar después el tipo de un beneficio, el proveedor o la fecha de inicio de un precio, o la sede de una regla de bono. |
| Fusionar pacientes y ver registros fusionados. | Deshacer una fusión o corregir la fecha de nacimiento de un paciente. |
| Forzar el estado de una visita con motivo, incluso reabrirla. | Forzar desde la interfaz el paso a caja con órdenes abiertas. |
| Anular cargos manuales y pagos. | Anular un recibo (no existe) ni anular desde caja cargos que vienen de órdenes. |
| Ver documentos eliminados y eliminar cualquier documento. | Restaurar o abrir un documento eliminado. |
| Ver reportes de toda la compañía con «Saldo pendiente» y «Bono», imprimir y exportar CSV. | Exportar más de 30 veces por minuto. |
| Revisar la auditoría y las alertas de seguridad; reconocer alertas. | Reconocer una alerta sobre sí mismo si existe otro Administrador activo. |
| Gestionar ajustes, integraciones y el mantenimiento de claves. | Ver valores de secretos o claves de cifrado. |
|  | Recuperar el acceso cuando no queda ningún Administrador: requiere el comando de servidor break-glass. |

## <a id="g-adm--errores-frecuentes-y-que-significan"></a>Errores frecuentes y qué significan

| Mensaje | Cuándo aparece | Qué hacer |
| --- | --- | --- |
| «Es el último administrador activo. Primero asigne el rol de administrador a otra persona.» | Deshabilitar, eliminar o quitar el rol al único Administrador activo. | Dar el rol a otra persona primero. |
| «Esta acción no está permitida en el estado actual.» | Deshabilitarse, eliminarse o quitarse el propio rol Administrador; fusionar registros no activos; reporte de una sede inactiva no asignada. | Pedirlo a otro Administrador o revisar el estado del registro. |
| «Su propia sesión o su acceso de administrador terminó mientras este cambio esperaba, así que no se cambió nada. Vuelva a iniciar sesión.» | Otro Administrador cambió su acceso en el mismo momento. | Volver a iniciar sesión. |
| «Este registro ya existe.» | Invitar un correo ya usado por una cuenta no invitada; código de sede o de catálogo repetido. | Usar otro correo o código, o editar el existente. |
| «Solo se pueden reactivar usuarios deshabilitados. Actualice la lista.» | El usuario ya no está deshabilitado. | «Actualizar». |
| «Este registro fue actualizado por otro usuario. Actualice para continuar. Actualice la lista e intente de nuevo.» | Otro Administrador modificó la fila o el ajuste. | Pulsar «Actualizar» y repetir. |
| «Valor no válido: {reason}» | El servidor rechazó un ajuste al guardar. | Corregir el campo señalado. |
| «Guarde los cambios pendientes antes de probar.» | «Probar conexión» con cambios sin guardar en la tarjeta. | «Guardar cambios» y probar. |
| «No está autorizado para esta sede.» | Filtro de auditoría con una sede no asignada. | Elegir una sede asignada o «Todas las sedes». |
| «Esta alerta es sobre ti. Debe reconocerla otro administrador.» | Reconocer una alerta sobre la propia cuenta. | Pedírselo a otro Administrador. |
| «La detección de seguridad no está al día: puede faltar alguna alerta» | El detector no ha revisado la auditoría reciente. | Revisar «Estado del sistema»: el servicio scheduler debe estar activo. |
| «La verificación en dos pasos está bloqueada tras demasiados códigos erróneos seguidos…» | Diez códigos erróneos en la propia cuenta. | Otro Administrador la restablece; si no hay otro, break-glass. |
| «Exportación cancelada: no se pudo registrar en la auditoría. Inténtelo de nuevo en un momento.» / «Demasiados intentos. Intente de nuevo en {seconds} segundos.» | Falló el registro previo a la exportación o se superaron 30 por minuto. | Esperar y reintentar. |
| «La fecha inicial debe ser igual o anterior a la final.» / «El rango no puede exceder 92 días.» | Rango de reporte inválido. | Ajustar las fechas. |
| «Use de 2 a 41 letras mayúsculas, dígitos o guiones bajos, empezando con una letra.» / «Use de 2 a 8 letras mayúsculas (p. ej. LAN).» | Código de catálogo o de sede inválido. | Corregir el código. |
| «Algunos campos no son válidos. Revíselos.» | Valores fuera de rango (p. ej. intentar fusionar un paciente consigo mismo). | Revisar los datos. |

## <a id="g-adm--pantallas-que-usa-este-rol"></a>Pantallas que usa este rol

Todas las pantallas del catálogo salvo las heredadas sin ruta [S-GEN-31](#s-gen-31). Exclusivas del Administrador: [S-GEN-18](#s-gen-18), [S-PAC-13](#s-pac-13), [S-PAC-14](#s-pac-14), [S-CLI-10](#s-cli-10), [S-CAJ-10](#s-caj-10), [S-CAJ-13](#s-caj-13), [S-CAJ-22](#s-caj-22), [S-CAJ-23](#s-caj-23) y [S-ADM-01](#s-adm-01) a [S-ADM-39](#s-adm-39). La configuración inicial [S-GEN-02](#s-gen-02) no es de ningún rol con sesión: la usa el instalador sin sesión en el primer arranque y crea la primera cuenta Administrador; con la sesión iniciada, `/setup` redirige a «Configuración».
