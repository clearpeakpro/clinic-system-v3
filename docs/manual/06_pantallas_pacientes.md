# <a id="p-pac--06--pantallas-de-pacientes-s-pac"></a>06 — Pantallas de pacientes (S-PAC)

Este capítulo cubre todo lo relativo al expediente administrativo del paciente: la búsqueda (compartida por toda la empresa), el alta con control de duplicados, el perfil con sus pestañas (Resumen, Citas, Visitas, Documentos y Saldos), la edición de datos, la fusión de registros duplicados, la gestión de documentos (subida, cola de subidas, vista previa y eliminación) y el registro de auditoría que se exige antes de imprimir, descargar o compartir. Lo usan los cuatro roles con alcances distintos: Recepción y Administración crean y corrigen pacientes, el Proveedor solo puede actualizar el teléfono, Enfermería consulta, y solo el Administrador fusiona. Aquí sí hay PHI: nombres, fecha de nacimiento, teléfono, detalles de referencia y nombres de archivo se guardan cifrados en el servidor, toda lectura queda auditada y la interfaz los muestra en claro solo a quien tiene acceso. Los textos entre «…» son las etiquetas reales de la interfaz; los ejemplos son ficticios.

## <a id="p-pac--como-leer-cada-ficha"></a>Cómo leer cada ficha

- **Acceso por rol**: «Completo», «Limitado» (ve una parte o solo algunas acciones), «Sin acceso» (botón oculto o ruta redirigida al Panel; el servidor también lo rechaza).
- **PHI**: «Sí» = información de salud protegida o dato personal del paciente, cifrado en el servidor y auditado al leerlo.
- Los pacientes son de **toda la empresa**: la búsqueda y el perfil no se limitan a la sede activa; en cambio citas, visitas, saldos y documentos de visita se limitan a las sedes asignadas al usuario, y el código humano del paciente es **por sede** (`LAN-P-000001`, `DAL-P-000042`…).
- Las pantallas comunes (estados de carga y error, confirmación genérica, descarte de cambios) se describen en [05 — Pantallas generales](05_pantallas_generales.md).

## <a id="p-pac--matriz-rapida-del-modulo"></a>Matriz rápida del módulo

| Capacidad | Administrador | Recepción | Enfermería / asistente médico | Proveedor |
| --- | --- | --- | --- | --- |
| Buscar pacientes y ver el perfil | Sí | Sí | Sí | Sí |
| Crear paciente | Sí | Sí | No | No |
| Editar datos | Nombre, apellido, teléfono | Nombre, apellido, teléfono | No | Solo teléfono |
| Asignar código en la sede | Sí | Sí | No | Ve el botón, el servidor lo rechaza |
| Fusionar y «Incluir fusionados» | Sí | No | No | No |
| Documentos: subir, ver, descargar | Sí | Sí | Sí | Sí |
| Documentos: eliminar | Siempre | Los propios, 24 h | Los propios, 24 h | Los propios, 24 h |
| Ver documentos eliminados | Sí | No | No | No |
| Pestaña Saldos | Sí (con cobro) | Sí (con cobro) | Ve la pestaña, siempre da error | Sí (abre la visita) |

## <a id="p-pac--indice-de-pantallas"></a>Índice de pantallas

| Id | Pantalla | Ruta / ubicación | Tipo |
| --- | --- | --- | --- |
| [S-PAC-01](06_pantallas_pacientes.md#p-pac--s-pac-01--pacientes-busqueda) | Pacientes (búsqueda) | `/app/<código>/patients` | Página |
| [S-PAC-02](06_pantallas_pacientes.md#p-pac--s-pac-02--nuevo-paciente) | Nuevo paciente | Diálogo / pantalla completa en móvil | Diálogo |
| [S-PAC-03](06_pantallas_pacientes.md#p-pac--s-pac-03--posible-paciente-existente) | Posible paciente existente | Diálogo / hoja inferior | Diálogo |
| [S-PAC-04](06_pantallas_pacientes.md#p-pac--s-pac-04--descartar-cambios-sin-guardar) | ¿Descartar cambios sin guardar? | Diálogo | Diálogo |
| [S-PAC-05](06_pantallas_pacientes.md#p-pac--s-pac-05--perfil-del-paciente) | Perfil del paciente | `/app/<código>/patients/<id>` | Página |
| [S-PAC-06](06_pantallas_pacientes.md#p-pac--s-pac-06--pestana-resumen) | Pestaña Resumen | Perfil, pestaña 1 | Panel |
| [S-PAC-07](06_pantallas_pacientes.md#p-pac--s-pac-07--pestana-citas) | Pestaña Citas | Perfil, pestaña 2 | Panel |
| [S-PAC-08](06_pantallas_pacientes.md#p-pac--s-pac-08--pestana-visitas) | Pestaña Visitas | Perfil, pestaña 3 | Panel |
| [S-PAC-09](06_pantallas_pacientes.md#p-pac--s-pac-09--documentos-pestana-del-perfil--panel-de-documentos) | Documentos (pestaña del perfil / panel de documentos) | Perfil, pestaña 4 | Panel |
| [S-PAC-10](06_pantallas_pacientes.md#p-pac--s-pac-10--pestana-saldos) | Pestaña Saldos | Perfil, pestaña 5 | Panel |
| [S-PAC-11](06_pantallas_pacientes.md#p-pac--s-pac-11--editar-paciente) | Editar paciente | Diálogo sobre el perfil | Diálogo |
| [S-PAC-12](06_pantallas_pacientes.md#p-pac--s-pac-12--actualizado-por-otro-usuario) | Actualizado por otro usuario | Diálogo | Diálogo |
| [S-PAC-13](06_pantallas_pacientes.md#p-pac--s-pac-13--fusionar-pacientes) | Fusionar pacientes | `/app/<código>/patients/<id>/merge` | Página |
| [S-PAC-14](06_pantallas_pacientes.md#p-pac--s-pac-14--fusionar-estos-pacientes) | ¿Fusionar estos pacientes? | Diálogo | Diálogo |
| [S-PAC-15](06_pantallas_pacientes.md#p-pac--s-pac-15--categoria-del-documento-subir) | Categoría del documento (subir) | Hoja inferior | Hoja |
| [S-PAC-16](06_pantallas_pacientes.md#p-pac--s-pac-16--subidas-cola-de-subida) | Subidas (cola de subida) | Tarjeta dentro del panel de documentos | Panel |
| [S-PAC-17](06_pantallas_pacientes.md#p-pac--s-pac-17--vista-previa-de-imagen) | Vista previa de imagen | Diálogo | Diálogo |
| [S-PAC-18](06_pantallas_pacientes.md#p-pac--s-pac-18--eliminar-documento) | Eliminar documento | Diálogo | Diálogo |
| [S-PAC-19](06_pantallas_pacientes.md#p-pac--s-pac-19--documentos-pagina-del-paciente) | Documentos (página del paciente) | `/app/<código>/patients/<id>/documents` | Página |
| [S-PAC-20](06_pantallas_pacientes.md#p-pac--s-pac-20--documentos-de-la-visita) | Documentos de la visita | `/app/<código>/encounters/<id>/documents` | Página |
| [S-PAC-21](06_pantallas_pacientes.md#p-pac--s-pac-21--registro-de-exportacion-previo-auditoria-antes-de-imprimir--descargar--compartir) | Registro de exportación previo (auditoría antes de imprimir / descargar / compartir) | Comportamiento sin ruta | Aviso |

---

### <a id="p-pac--s-pac-01--pacientes-busqueda"></a>S-PAC-01 Pacientes (búsqueda)

**Ruta:** `/app/<código>/patients` · **Tipo:** página

**Propósito**

Encontrar un paciente de toda la empresa (todas las sedes) por nombre, apellido, fecha de nacimiento, teléfono o por código humano, etiqueta escaneada o identificador, y servir de punto de entrada para crear un paciente nuevo.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Buscar, crear y el interruptor «Incluir fusionados» (depende del rol Administrador, no de un permiso). |
| Recepción | Limitado | Buscar y crear; sin el interruptor «Incluir fusionados» (solo Administrador). |
| Enfermería / asistente médico | Limitado | Solo buscar (botón crear oculto). |
| Proveedor | Limitado | Solo buscar (botón crear oculto). |

Guarda de ruta: permiso `searchPatient` (los cuatro roles); sin él, redirección al Panel. El servidor exige `SearchPatient` en la sede activa; sede no asignada → «No está autorizado para esta sede.»

**Cómo se llega**

Menú lateral «Pacientes» (icono de personas); icono de lupa de la cabecera (tooltip «Buscar»); botón atrás «Volver a pacientes» del perfil; URL directa `/app/<SEDE>/patients`.

**Distribución**

- Encabezado: título «Pacientes»; a la derecha botón relleno «Crear paciente» (icono de persona con +) en anchos ≥ 600 px; en móvil, botón flotante con el mismo icono y tooltip «Crear paciente». Ambos solo si el usuario puede crear.
- Tarjeta de criterios: campos en filas que se ajustan (200 px cada uno; por debajo de 420 px, dos por fila): «Nombre», «Apellido», «Fecha de nacimiento», «Teléfono», «Código del paciente» (260 px).
- Fila de botones: «Buscar» (relleno, lupa), «Limpiar» (texto) y, solo Administrador, interruptor «Incluir fusionados».
- Resultados: antes de buscar, estado vacío «Buscar pacientes» / «Ingrese nombre, fecha de nacimiento, teléfono o código del paciente y busque.»; después, tabla (≥ 600 px) con columnas «Código», «Nombre», «Fecha de nacimiento», «Edad», «Teléfono», «Estado», o tarjetas (móvil) con nombre y código arriba, «fecha · edad», teléfono y chip de estado.
- Pie: banner de error de «cargar más» (si falla) y botón «Cargar más» (o spinner) mientras haya más páginas.

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Nombre» | Texto, mayúscula inicial por palabra; Enter busca | No | El servidor normaliza (NFKC, recorta, colapsa espacios, MAYÚSCULAS) y compara por índice ciego **exacto**: no hay coincidencia parcial y las tildes cuentan («Maria» no encuentra «María») | Sí (cifrado; búsqueda por HMAC) |
| «Apellido» | Texto | No | Igual que «Nombre» | Sí |
| «Fecha de nacimiento» | Selector de fecha (1900–hoy; abre en hoy menos 30 años) | No | Icono calendario (tooltip «Elegir fecha»); con valor el icono cambia a X (tooltip «Borrar fecha»); se muestra en formato local (por ejemplo «3 feb 1985») y se envía AAAA-MM-DD | Sí |
| «Teléfono» | Teclado telefónico | No | El servidor lo reduce a dígitos (conserva un «+» inicial) y exige 7–15 dígitos si se usa (fuera de rango → «Algunos campos no son válidos. Revíselos.»); coincidencia exacta | Sí |
| «Código del paciente» | Texto en MAYÚSCULAS, pista «LAN-P-000001 o etiqueta escaneada», icono QR decorativo | No | Acepta el código humano (normaliza «lan-p-1» → «LAN-P-000001»), cualquier texto escaneado que contenga un código o el UUID del paciente. Si tiene contenido, es búsqueda directa y tiene prioridad (se ignoran los demás campos) | No (código administrativo) |
| «Incluir fusionados» | Interruptor | No | Solo Administrador; apagado por defecto | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Buscar» o Enter en cualquier campo | Todos | `PatientService/SearchPatients` (20 por página) tras un antirrebote de 300 ms; nunca por pulsación de tecla. Sin ningún criterio no llama al servidor y vuelve al estado inicial. | No | Lista de resultados o error. |
| «Limpiar» | Todos | Vacía campos y resultados. | No | Estado inicial. |
| «Incluir fusionados» | Administrador | Repite la búsqueda actual manteniendo las filas visibles. | No | Muestra los registros fusionados en lugar de resolverlos al principal. |
| «Cargar más» | Todos | Pide la siguiente página y la añade (sin duplicados). | No | Más filas; si falla, banner rojo compacto con «Reintentar» sin perder lo cargado. |
| Tocar una fila o tarjeta | Todos | — | No | Perfil `/app/<SEDE>/patients/<id>` ([S-PAC-05](06_pantallas_pacientes.md#p-pac--s-pac-05--perfil-del-paciente)). |
| «Abrir registro principal» (filas «Fusionado») | Todos | — | No | Perfil del paciente principal. |
| «Crear paciente» (encabezado, botón flotante o estado vacío) | Administrador, Recepción | Abre [S-PAC-02](06_pantallas_pacientes.md#p-pac--s-pac-02--nuevo-paciente). | No | Al crear, navega al perfil del nuevo paciente. |
| Mantener pulsado un código | Todos | Copia el código. | No | Sin aviso visible. |

**Estados y mensajes**

- Inicial: ilustración + «Buscar pacientes» / «Ingrese nombre, fecha de nacimiento, teléfono o código del paciente y busque.»
- Cargando la primera búsqueda: spinner centrado.
- Refrescando (misma búsqueda, cambio del interruptor o tras crear, editar o fusionar en esta sesión): barra lineal fina arriba con las filas visibles.
- Vacío: «No se encontraron pacientes» / «Ningún paciente coincide con estos criterios.» + «Crear paciente» solo si puede crear.
- Error sin datos: icono + «Algo salió mal» + mensaje según el motivo + «Reintentar»; error con datos: banner rojo compacto arriba + «Reintentar».
- Chips de estado: «Activo» (verde, check), «Fusionado» (ámbar, icono de fusión, acompañado de «Abrir registro principal»), «Inactivo» (gris).
- Columna «Código»: el de la sede activa; si no tiene, el primer código de otra sede (sin indicar cuál); si no tiene ninguno, «Sin código en esta sede». Teléfono vacío: «No indicado». Edad: «1 año» / «N años», calculada con la fecha de la zona horaria de la sede activa.
- Errores del servidor: «No tiene permiso para realizar esta acción.»; «No está autorizado para esta sede.»; «No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.»

**Tiempo real**

Sin suscripción a eventos. Las filas se refrescan solo cuando esta misma sesión crea, edita, fusiona o asigna un código. Los cambios de otros usuarios no aparecen hasta repetir la búsqueda. El estado (criterios + filas) es global: persiste al navegar y al volver del perfil; se borra al cerrar sesión y también al abrir el selector «Elegir paciente» de Citas o «Sin cita» ([S-REC-12](07_pantallas_recepcion.md#p-rec--s-rec-12--elegir-paciente-selector-de-paciente)), que comparte el mismo estado.

**Reglas de negocio**

- Los pacientes son de toda la empresa: la búsqueda no se limita a la sede activa; solo el código mostrado prioriza la sede activa.
- Los criterios se combinan con «Y»; coincidencia exacta por campo normalizado; orden: pacientes creados más recientemente primero.
- Por código o identificador: devuelve el paciente que tiene ese código en cualquier sede; si está fusionado y no se incluyen fusionados, devuelve el principal.
- Cada búsqueda queda auditada en el servidor como lectura de PHI (`patient.search`, con los nombres de los campos usados, nunca sus valores, y los pacientes devueltos); si la auditoría falla, la búsqueda falla.
- Los nombres se guardan en MAYÚSCULAS y cifrados; la interfaz los muestra en formato Título.

**Notas para el rediseño**

- Preservar la búsqueda solo por acción explícita (botón, Enter o lector) con antirrebote; nunca búsqueda en vivo por tecla (PHI + auditoría por cada consulta).
- Preservar que el campo de código acepte un lector tipo teclado que termina en Enter, y su prioridad sobre los demás campos.
- Preservar que una búsqueda nueva borre las filas anteriores (no mostrar PHI de otra consulta) y que un refresco no deje la pantalla en blanco.
- Preservar la visibilidad condicional de «Crear paciente» (Administrador y Recepción) y de «Incluir fusionados» (Administrador); tabla ≥ 600 px y tarjetas + botón flotante en móvil.
- Inconsistencia: el icono QR parece un botón de escaneo pero es decorativo (no abre la cámara).
- Inconsistencia: un código de otra sede se muestra igual que el de la sede activa.
- Nada explica que la coincidencia es exacta (un nombre parcial o sin tilde no encuentra); no hay contador de resultados.
- El interruptor «Incluir fusionados» no explica su efecto; el estado compartido con el selector de Citas hace que abrir ese selector borre la búsqueda de esta pantalla.

**Código fuente:** `features/patients/presentation/patient_search_page.dart`, `patient_search_form.dart`, `patient_results_view.dart`, `features/patients/application/patient_search_notifier.dart`, `features/patients/domain/patient_search_query.dart`, `patient_display.dart`, `features/patients/presentation/patient_labels.dart`, `features/patients/infrastructure/patient_gateway.dart`, `core/navigation/nav_items.dart`, `core/routing/shell_screen.dart`, `core/routing/routes.dart`; servidor `backend/src/patients/service.rs` (`search_patients`), `repo.rs` (`search`).

---

### <a id="p-pac--s-pac-02--nuevo-paciente"></a>S-PAC-02 Nuevo paciente

**Ruta:** sin ruta propia: diálogo sobre la pantalla que lo abre (en móvil, página de pantalla completa) · **Tipo:** diálogo

**Propósito**

Registrar un paciente nuevo con sus datos de identidad mínimos y la fuente de referencia, con control de duplicados.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Completo | — |
| Enfermería / asistente médico | Sin acceso | Botón oculto; el servidor exige `CreatePatient` y respondería `PERMISSION_DENIED`. |
| Proveedor | Sin acceso | Ídem. |

**Cómo se llega**

«Crear paciente» en [S-PAC-01](06_pantallas_pacientes.md#p-pac--s-pac-01--pacientes-busqueda) (encabezado, botón flotante o estado vacío) y en el selector «Elegir paciente» de Citas › «Nueva cita» o «Sin cita» ([S-REC-12](07_pantallas_recepcion.md#p-rec--s-rec-12--elegir-paciente-selector-de-paciente)).

**Distribución**

- Diálogo de ancho máximo 640 px con título «Nuevo paciente» (en móvil: pantalla completa con barra superior «Nuevo paciente»).
- Banner de error compacto (rojo) arriba cuando el envío falla.
- Campos apilados: Nombre, Apellido, Fecha de nacimiento, Teléfono, Fuente de referencia, Detalles de la referencia.
- Pie a la derecha: «Cancelar» (texto) y «Crear» (relleno; spinner mientras envía).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Nombre» | Texto, foco automático, mayúscula inicial por palabra | Sí («Este campo es obligatorio.») | Servidor: máx. 100 caracteres, sin caracteres de control, guardado en MAYÚSCULAS | Sí (cifrado + índice ciego) |
| «Apellido» | Texto | Sí («Este campo es obligatorio.») | Igual que «Nombre» | Sí |
| «Fecha de nacimiento» | Selector de fecha (1900–hoy) | Sí («Seleccione la fecha de nacimiento.») | No futura («La fecha de nacimiento no puede ser futura.»); servidor: edad máxima 130 años | Sí |
| «Teléfono» | Teclado telefónico | No | Si se escribe, al menos 7 dígitos («Ingrese un teléfono válido (al menos 7 dígitos).»); servidor 7–15 dígitos (más de 15 → «Algunos campos no son válidos. Revíselos.») | Sí |
| «Fuente de referencia» | Desplegable | No | «Ninguna» + fuentes activas del catálogo por orden, con el nombre en el idioma de la interfaz; si el catálogo no carga, el error aparece como texto de ayuda bajo el campo | No |
| «Detalles de la referencia» | Texto de 2 líneas; Enter envía | No | Servidor: máx. 500 caracteres y exige que haya una fuente seleccionada (`referral_details_without_source`) | Sí (cifrado) |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Crear» | Administrador, Recepción | Valida en el cliente y llama a `PatientService/CreatePatient` (`force_create = false`). | No | Éxito: snackbar «Paciente creado.», cierra y navega al perfil (desde Pacientes) o devuelve el paciente al selector de Citas. Si el servidor responde `possible_duplicate` → [S-PAC-03](06_pantallas_pacientes.md#p-pac--s-pac-03--posible-paciente-existente). Otros errores: banner en el formulario. |
| «Cancelar», atrás del sistema, tocar fuera o cerrar la pantalla completa | Ídem | Cierra. | [S-PAC-04](06_pantallas_pacientes.md#p-pac--s-pac-04--descartar-cambios-sin-guardar) si hay cambios | Vuelve a la pantalla de origen. |

**Estados y mensajes**

- Editando: validación automática al interactuar; el error de fecha solo aparece después de tocar algo o intentar enviar.
- Enviando: «Cancelar» y «Crear» deshabilitados, spinner en «Crear», selector de fecha y desplegable inactivos.
- Error en el formulario: por ejemplo «No tiene permiso para realizar esta acción.», «No está autorizado para esta sede.», «Algunos campos no son válidos. Revíselos.», «La fecha no es válida.», «No se pudo conectar con el servidor…».
- Catálogo de referencias con error: mensaje en la ayuda del desplegable (el resto del formulario sigue usable).

**Tiempo real**

Ninguno.

**Reglas de negocio**

- Al crear, el servidor asigna en la misma transacción el código humano de la sede activa (por ejemplo `LAN-P-000001`); el paciente nace en estado Activo.
- Detección de duplicados: mismo nombre + apellido + fecha de nacimiento normalizados (huella); se serializa para evitar dos altas idénticas simultáneas en dos recepciones.
- Crear «de todos modos» queda auditado como alta forzada junto con los candidatos detectados.
- La referencia (fuente + detalles) solo se registra en el alta; no hay interfaz para añadir referencias después.
- El alta queda auditada (`patient.create`) y emite un evento, todo en la misma transacción.

**Notas para el rediseño**

- Preservar la fecha de nacimiento obligatoria y no futura, la protección de cambios sin guardar y el flujo de duplicados (no permitir saltarlo) con reenvío forzado.
- Preservar pantalla completa en móvil y diálogo en tableta y escritorio.
- «Detalles de la referencia» puede llenarse sin fuente y el servidor lo rechaza con un mensaje genérico.
- No se muestran los límites (100 caracteres de nombre, 500 de detalles, 15 dígitos de teléfono); el teléfono no tiene máscara ni formato.
- Probable inconsistencia (verificar en dispositivo): «Cancelar» con cambios confirma y luego vuelve a mostrar la confirmación (dos diálogos seguidos). La edición ([S-PAC-11](06_pantallas_pacientes.md#p-pac--s-pac-11--editar-paciente)) no tiene este problema.
- Solo se capturan nombre, apellido, fecha de nacimiento, teléfono y referencia (no hay dirección, sexo, idioma ni correo).

**Código fuente:** `features/patients/presentation/patient_create_page.dart`, `features/patients/application/patient_commands.dart` (`create`), `patient_providers.dart` (`referralSourcesProvider`), `features/patients/infrastructure/patient_catalog_gateway.dart`, `patient_gateway.dart`, `shared/validators/validators.dart`, `core/widgets/dirty_form_guard.dart`; servidor `backend/src/patients/service.rs` (`create_patient`), `domain.rs`.

---

### <a id="p-pac--s-pac-03--posible-paciente-existente"></a>S-PAC-03 Posible paciente existente

**Ruta:** sin ruta: diálogo (≥ 600 px) u hoja inferior (móvil) sobre [S-PAC-02](06_pantallas_pacientes.md#p-pac--s-pac-02--nuevo-paciente) · **Tipo:** diálogo

**Propósito**

Evitar duplicados: mostrar los pacientes existentes con el mismo nombre y fecha de nacimiento y decidir si abrir uno, cancelar o crear igualmente.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Ve «Crear de todos modos». |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | No llega (no puede crear). Si llegara, vería «Su rol no puede crear un registro duplicado. Abra el paciente existente o cancele.» |
| Proveedor | Sin acceso | Ídem. |

**Cómo se llega**

Automáticamente al pulsar «Crear» en [S-PAC-02](06_pantallas_pacientes.md#p-pac--s-pac-02--nuevo-paciente) cuando el servidor responde `ALREADY_EXISTS` / `possible_duplicate`.

**Distribución**

- Cabecera: icono de advertencia (color de error) + título «Posible paciente existente».
- Texto: «Ya existe un paciente con el mismo nombre y fecha de nacimiento. Abra el registro existente o cree uno nuevo de todos modos.»
- Lista de candidatos separada por líneas: nombre, fecha de nacimiento y todos sus códigos por sede (o «Sin código en esta sede»); botón tonal «Abrir existente» por fila.
- Pie: «Cancelar» (texto) y «Crear de todos modos» (contorno).

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Abrir existente» | Administrador, Recepción | Cierra el formulario sin crear. | No | Perfil del existente (desde Pacientes) o lo devuelve al selector de Citas; sin snackbar. |
| «Cancelar» | Ídem | — | No | Vuelve al formulario con los datos intactos. |
| «Crear de todos modos» | Ídem | Reenvía `CreatePatient` con `force_create = true`. | Este diálogo es la confirmación | «Paciente creado.» y perfil; si falla, banner en el formulario. |

**Estados y mensajes**

- Los candidatos se resuelven con `GetPatient` por cada identificador recibido en `x-duplicates`; si ninguno se puede leer se usa `FindDuplicates`; si también falla, la lista queda vacía (el diálogo puede aparecer sin candidatos y sin mensaje).

**Tiempo real**

Ninguno.

**Reglas de negocio**

- La consulta de candidatos queda auditada en el servidor como búsqueda de duplicados (lectura de PHI).

**Notas para el rediseño**

- Preservar las tres salidas y que «Crear de todos modos» sea secundaria (no el botón principal).
- Preservar los códigos por sede de cada candidato para distinguirlos.
- Lista vacía posible sin explicación; los candidatos no muestran teléfono ni edad (ayudarían a distinguir); el texto «sin permiso» es prácticamente inalcanzable.

**Código fuente:** `features/patients/presentation/duplicate_patient_sheet.dart`, `features/patients/application/patient_commands.dart` (`_resolveCandidates`), `core/grpc/grpc_error_mapper.dart` (`x-duplicates`).

---

### <a id="p-pac--s-pac-04--descartar-cambios-sin-guardar"></a>S-PAC-04 ¿Descartar cambios sin guardar?

**Ruta:** sin ruta: diálogo de confirmación · **Tipo:** diálogo (variante de [S-GEN-26](05_pantallas_generales.md#p-gen--s-gen-26--descartar-cambios-sin-guardar))

**Propósito**

Evitar perder datos escritos por accidente en el alta o la edición de un paciente.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | En [S-PAC-02](06_pantallas_pacientes.md#p-pac--s-pac-02--nuevo-paciente) y [S-PAC-11](06_pantallas_pacientes.md#p-pac--s-pac-11--editar-paciente). |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | No abre esos formularios. |
| Proveedor | Limitado | Solo en [S-PAC-11](06_pantallas_pacientes.md#p-pac--s-pac-11--editar-paciente) (edición del teléfono). |

**Cómo se llega**

Automáticamente al cancelar, pulsar atrás, tocar fuera del diálogo o cerrar la pantalla completa con cambios sin guardar.

**Distribución**

- Título «¿Descartar cambios sin guardar?»; texto «Tiene cambios sin guardar. Si sale ahora se perderán.»; botones «Seguir editando» (texto) y «Descartar» (relleno rojo).

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Descartar» | Quien edita | Cierra el formulario. | Es la confirmación | Se pierden los cambios. |
| «Seguir editando» | Quien edita | — | — | Vuelve al formulario. |

**Estados y mensajes**

Sin estados adicionales.

**Tiempo real**

Ninguno.

**Reglas de negocio**

- Los formularios de paciente interceptan el retroceso, pero no se registran en el registro global de formularios sucios: el cambio de sede por URL no los tiene en cuenta (al ser modales tapan el selector de sede de la cabecera).

**Notas para el rediseño**

- Preservar la acción destructiva en rojo y la acción segura como alternativa.
- Preservar la interceptación del botón atrás del sistema y del navegador.

**Código fuente:** `core/widgets/dirty_form_guard.dart`, `core/widgets/confirm_dialog.dart`.

---

### <a id="p-pac--s-pac-05--perfil-del-paciente"></a>S-PAC-05 Perfil del paciente

**Ruta:** `/app/<código>/patients/<patientId>` · **Tipo:** página

**Propósito**

Ficha central del paciente: identidad, códigos por sede, referencia e historial de citas, visitas, documentos y saldos.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Ver, «Editar» (completo) y «Fusionar con…». |
| Recepción | Limitado | Ver y «Editar» (completo); sin «Fusionar con…» (solo Administrador). |
| Enfermería / asistente médico | Limitado | Solo ver; «Editar» oculto. |
| Proveedor | Limitado | Ver y «Editar» limitado al teléfono. |

Guarda de ruta `searchPatient`; el servidor (`GetPatient`) exige `SearchPatient`. «Editar» y «Fusionar con…» se ocultan si el paciente está Fusionado.

**Cómo se llega**

Tocando una fila en [S-PAC-01](06_pantallas_pacientes.md#p-pac--s-pac-01--pacientes-busqueda); tras crear ([S-PAC-02](06_pantallas_pacientes.md#p-pac--s-pac-02--nuevo-paciente) / [S-PAC-03](06_pantallas_pacientes.md#p-pac--s-pac-03--posible-paciente-existente)); con «Abrir registro principal»; con el icono de persona «Abrir perfil del paciente» de la página de visita y de caja; con el nombre del paciente en el detalle de cita ([S-REC-09](07_pantallas_recepcion.md#p-rec--s-rec-09--detalle-de-cita-cita)); con la acción del snackbar de fusión; por URL directa.

**Distribución**

- Encabezado: botón atrás (tooltip «Volver a pacientes»); título = nombre del paciente en formato Título («Paciente» mientras carga); acciones: icono «Actualizar» y, una vez cargado, «Editar» (lápiz) y «Fusionar con…» (icono de fusión) como botones de contorno; en móvil, menú de tres puntos con esas opciones.
- Banner (solo si está Fusionado): icono de fusión + «Este registro fue fusionado con otro paciente.» + botón «Abrir registro principal».
- Fila de identidad: código humano (de la sede activa o, si no hay, el primero conocido; monoespaciado; mantener pulsado copia) o «Sin código en esta sede»; «fecha de nacimiento · N años · teléfono»; chip de estado.
- Pestañas desplazables: «Resumen», «Citas», «Visitas», «Documentos», «Saldos» ([S-PAC-06](06_pantallas_pacientes.md#p-pac--s-pac-06--pestana-resumen) a [S-PAC-10](06_pantallas_pacientes.md#p-pac--s-pac-10--pestana-saldos)).

**Campos**

Sin campos (los datos de identidad son de solo lectura; PHI: nombre, fecha de nacimiento, edad y teléfono).

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Atrás «Volver a pacientes» | Todos | — | No | [S-PAC-01](06_pantallas_pacientes.md#p-pac--s-pac-01--pacientes-busqueda) con la última búsqueda. |
| «Actualizar» | Todos | Vuelve a leer `GetPatient` (cabecera y Resumen; no recarga las demás pestañas). | No | Datos frescos. |
| «Editar» | Administrador, Recepción, Proveedor | Abre [S-PAC-11](06_pantallas_pacientes.md#p-pac--s-pac-11--editar-paciente). | No | Diálogo de edición. |
| «Fusionar con…» | Administrador | — | No | [S-PAC-13](06_pantallas_pacientes.md#p-pac--s-pac-13--fusionar-pacientes). |
| «Abrir registro principal» (banner o snackbar) | Todos | — | No | Perfil del principal. |

**Estados y mensajes**

- Cargando: spinner centrado; título «Paciente».
- Error: «Algo salió mal» + mensaje + «Reintentar» (`NOT_FOUND`: «No se encontró el registro solicitado.»).
- Refrescando: barra fina sobre el contenido.
- Chip de estado: «Activo» (verde), «Fusionado» (ámbar con icono de fusión), «Inactivo» (gris).
- Fusionado: banner visible, sin «Editar» ni «Fusionar con…».
- Snackbar en tiempo real: «Este registro fue fusionado con otro paciente.» con acción «Abrir registro principal».

**Tiempo real**

`patient.changed.v1` de este paciente vuelve a leer paciente y referencias. Si el evento trae un identificador relacionado (fusión), quien tiene abierto el duplicado ve una sola vez el snackbar con enlace al principal y se recargan citas, visitas y saldos del principal. En modo degradado el refresco periódico de 30 s no incluye la cabecera (solo las pestañas).

**Reglas de negocio**

- El paciente es compartido entre sedes; `GetPatient` se audita como lectura de PHI (`patient.view`) y si la auditoría falla, la lectura falla.
- La fecha de nacimiento no se puede editar desde ninguna pantalla.
- La pestaña seleccionada no forma parte de la URL: al volver de una visita o de caja el perfil abre en «Resumen».

**Notas para el rediseño**

- Preservar la ocultación de «Editar» y «Fusionar con…» en registros fusionados y el banner con enlace al principal.
- Preservar «Editar» visible para el Proveedor, en modo limitado.
- En móvil el menú de tres puntos aparece aunque no tenga opciones (Enfermería) y no hace nada al tocarlo.
- El código de la cabecera puede pertenecer a otra sede sin indicarlo.
- «Actualizar» no refresca las pestañas.
- Faltan acciones rápidas «Nueva cita» o «Sin cita» desde el perfil (hay que ir a Citas y volver a buscar al paciente); no se muestran membresías.

**Código fuente:** `features/patients/presentation/patient_profile_page.dart`, `features/patients/domain/patient_display.dart`, `features/patients/presentation/patient_labels.dart`, `features/patients/application/patient_providers.dart`, `features/patients/patients_realtime.dart`, `core/widgets/human_code_text.dart`, `core/widgets/status_chip.dart`.

---

### <a id="p-pac--s-pac-06--pestana-resumen"></a>S-PAC-06 Pestaña Resumen

**Ruta:** `/app/<código>/patients/<patientId>` (pestaña 1, abierta por defecto) · **Tipo:** panel

**Propósito**

Mostrar los códigos del paciente en cada sede, sus datos de identidad y las referencias registradas; permitir asignar un código en la sede activa.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Ve y usa «Asignar código en esta sede». |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Limitado | Solo lectura (sin el botón). |
| Proveedor | Limitado | Lectura; ve «Asignar código en esta sede» (tiene `editPatientBasic`) pero el servidor exige `CreatePatient` y responde «No tiene permiso para realizar esta acción.» |

**Cómo se llega**

Pestaña «Resumen» del perfil ([S-PAC-05](06_pantallas_pacientes.md#p-pac--s-pac-05--perfil-del-paciente)).

**Distribución**

- Tarjeta «Códigos por sede»: lista con icono de ubicación (relleno si es la sede activa), código monoespaciado y «Nombre de la sede · Asignado el {fecha}» (si la sede no está entre las del usuario: «Sede {code}»); sin códigos: «Sin código en esta sede»; botón de contorno «Asignar código en esta sede».
- Tarjeta «Detalles»: pares etiqueta/valor «Nombre», «Fecha de nacimiento», «Edad», «Teléfono», «Fuente de referencia», «Estado» (chip), «Creado», «Actualizado» (fecha y hora en la zona horaria de la sede activa).
- Tarjeta «Referencias»: lista (icono de campaña, nombre de la fuente, «detalles · fecha») o «No hay referencias registradas.»

**Campos**

Sin campos (lectura; PHI: nombre, fecha de nacimiento, teléfono, detalles de referencia).

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Asignar código en esta sede» | Administrador, Recepción (Proveedor lo ve pero es rechazado) | `PatientService/EnsureLocationIdentifier` (idempotente; reintenta una vez tras renovar la sesión); spinner en el botón. Visible si el paciente no está fusionado y no tiene código en la sede activa. | No | Snackbar «Código {code} asignado.» (por ejemplo «Código DAL-P-000042 asignado.»); error: snackbar con el mensaje traducido. |

**Estados y mensajes**

- Referencias: cargando (barra lineal), error (texto rojo con el mensaje), vacío («No hay referencias registradas.»).
- Valores vacíos: «No indicado» (teléfono, edad, fuente).

**Tiempo real**

`patient.changed.v1` refresca paciente y referencias; tras asignar un código se invalida el paciente y se refresca la búsqueda.

**Reglas de negocio**

- Formato del código: `<CÓDIGO DE SEDE>-P-<secuencia de 6 dígitos>` por sede (por ejemplo `LAN-P-000001`); un paciente puede tener un código por sede.
- El código de una sede también se crea automáticamente al registrar la llegada (con o sin cita) en esa sede.
- Un paciente fusionado no puede recibir código (`patient_merged`).
- Los detalles de referencia están cifrados en la base de datos y se muestran en claro.

**Notas para el rediseño**

- Preservar la lista de códigos por sede distinguiendo la sede activa.
- El Proveedor ve «Asignar código en esta sede» pero el servidor lo rechaza.
- «Estado» repite el chip de la cabecera; la fuente de referencia del paciente se rotula buscando la referencia coincidente (si no la hay, muestra el código crudo).

**Código fuente:** `features/patients/presentation/tabs/patient_overview_tab.dart`, `features/patients/application/patient_commands.dart` (`ensureLocationIdentifier`), `features/patients/infrastructure/patient_gateway.dart`; servidor `backend/src/patients/service.rs`.

---

### <a id="p-pac--s-pac-07--pestana-citas"></a>S-PAC-07 Pestaña Citas

**Ruta:** `/app/<código>/patients/<patientId>` (pestaña 2) · **Tipo:** panel

**Propósito**

Historial de citas del paciente en todas las sedes del usuario, de la más reciente a la más antigua.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Lista y navegación a la agenda. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Limitado | Ve la lista; «Abrir citas» y las filas llevan a la agenda, cuya guarda (`manageAppointment`) la devuelve en silencio al Panel. |
| Proveedor | Completo | Lista y agenda. |

La lista usa `AppointmentService/ListPatientAppointments` y solo incluye citas de las sedes asignadas al usuario.

**Cómo se llega**

Pestaña «Citas» del perfil.

**Distribución**

- Arriba a la derecha: botón de texto «Abrir citas» (icono de abrir).
- Tabla: «Fecha», «Hora», «Código» (de la cita), «Sede», «Tipo» (código del tipo de cita), «Proveedor» («Sin asignar» si vacío), «Estado».
- Móvil: tarjetas con «fecha · hora», «sede · tipo · proveedor», código corto y chip.
- Pie: «Cargar más» (50 por página).

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Abrir citas» | Todos (Enfermería rebota al Panel) | — | No | Agenda de la sede activa ([S-REC-06](07_pantallas_recepcion.md#p-rec--s-rec-06--citas-agenda-del-dia-de-la-sede)). |
| Tocar una fila | Ídem | Abre la agenda de la sede de la cita en su fecha (`?date=AAAA-MM-DD`). | No | Si es otra sede, la sede activa cambia por URL. |
| «Cargar más» | Todos | Siguiente página. | No | Más filas; error en snackbar. |

**Estados y mensajes**

- Cargando: spinner; vacío: «Aún no hay citas.»; error: vista de error + «Reintentar».
- Chips: «Programada» (azul / información), «Confirmada» (verde), «Llegó» (verde), «Cancelada» (gris), «No se presentó» (ámbar), «Desconocido» (gris).

**Tiempo real**

`appointment.changed.v1` recarga la lista; también se recarga en cada reconexión del WebSocket y cada 30 s en modo degradado.

**Reglas de negocio**

- Fechas y horas en la zona horaria de la sede activa aunque la cita sea de otra sede.
- Solo lectura: las citas se crean y modifican en la agenda.

**Notas para el rediseño**

- Preservar la navegación a la agenda del día de la cita.
- «Tipo» muestra el código crudo y no el nombre del tipo de cita.
- En móvil se muestra el código corto (sin prefijo de sede) aunque la lista mezcla sedes.
- Enfermería ve «Abrir citas» y filas tocables que no llevan a ninguna parte (rebote silencioso al Panel).
- Falta «Nueva cita para este paciente».

**Código fuente:** `features/patients/presentation/tabs/patient_appointments_tab.dart`, `tabs/load_more_footer.dart`, `features/patients/application/patient_providers.dart` (`patientAppointmentsProvider`), `features/patients/infrastructure/patient_history_gateway.dart`.

---

### <a id="p-pac--s-pac-08--pestana-visitas"></a>S-PAC-08 Pestaña Visitas

**Ruta:** `/app/<código>/patients/<patientId>` (pestaña 3) · **Tipo:** panel

**Propósito**

Historial de visitas (abiertas y cerradas) del paciente, la más reciente primero, con acceso a cada visita.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Completo | — |
| Enfermería / asistente médico | Completo | — |
| Proveedor | Completo | — |

`EncounterService/ListPatientEncounters` exige `ViewQueue`; solo incluye visitas de las sedes asignadas. Abrir la visita usa la guarda `viewQueue` (los cuatro roles).

**Cómo se llega**

Pestaña «Visitas» del perfil.

**Distribución**

- Tabla: «Visita» (código de la visita), «Registro» (fecha y hora de llegada), «Sede», «Proveedor» («Sin asignar»), «Ruta», «Estado».
- Móvil: tarjetas con código corto, fecha de registro, «sede · ruta · proveedor» y chip.
- Pie: «Cargar más» (50 por página).

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Tocar una fila | Todos | Abre `/app/<sede de la visita>/encounters/<id>` ([S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita)). | No | Si es otra sede, la sede activa cambia por URL (si hay formularios sin guardar registrados se rechaza y se queda en la URL anterior). |
| «Cargar más» | Todos | Siguiente página. | No | Más filas; error en snackbar. |

**Estados y mensajes**

- Vacío: «Aún no hay visitas.»; error: vista de error + «Reintentar».
- Chips de estado: «Registrado», «Esperando enfermería», «Con enfermería», «Esperando proveedor», «Con proveedor», «Procedimiento pendiente», «Listo para caja», «En caja» (todos azul / información); «Completada» (verde); «Se retiró» y «Cancelada» (gris); «Desconocido».
- Ruta: «Estándar», «Solo inyección», «Solo laboratorio», «Solo procedimiento», «Desconocida».

**Tiempo real**

`encounter.created.v1`, `encounter.state_changed.v1` y `encounter.provider_assigned.v1` recargan la lista; también en cada reconexión y cada 30 s en modo degradado.

**Reglas de negocio**

- Horas en la zona horaria de la sede activa.
- Solo lectura; el flujo de la visita se gestiona en las colas y en la página de visita.

**Notas para el rediseño**

- Preservar la navegación a la visita y los chips con icono + color + texto.
- El cambio implícito de sede al abrir una visita de otra sede no se avisa; el rechazo por formularios sucios tampoco muestra mensaje.

**Código fuente:** `features/patients/presentation/tabs/patient_visits_tab.dart`, `tabs/load_more_footer.dart`, `features/patients/application/patient_providers.dart` (`patientVisitsProvider`), `features/patients/infrastructure/patient_history_gateway.dart`.

---

### <a id="p-pac--s-pac-09--documentos-pestana-del-perfil--panel-de-documentos"></a>S-PAC-09 Documentos (pestaña del perfil / panel de documentos)

**Ruta:** `/app/<código>/patients/<patientId>` (pestaña 4); el mismo panel se usa en [S-PAC-19](06_pantallas_pacientes.md#p-pac--s-pac-19--documentos-pagina-del-paciente) y [S-PAC-20](06_pantallas_pacientes.md#p-pac--s-pac-20--documentos-de-la-visita) · **Tipo:** panel

**Propósito**

Listar, filtrar, subir, ver, descargar y eliminar (borrado lógico) los documentos del paciente: identificación, tarjeta de seguro, consentimientos, resultados, referidos e imágenes clínicas.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Subir, ver, descargar, «Eliminar» cualquier documento disponible y «Mostrar eliminados». |
| Recepción | Limitado | Subir, ver, descargar; «Eliminar» solo los documentos que subió, dentro de las 24 h posteriores. |
| Enfermería / asistente médico | Limitado | Ídem. |
| Proveedor | Limitado | Ídem. |

Permiso `uploadPatientDocuments` (los cuatro roles). Los documentos adjuntos a visitas de sedes no asignadas no se listan; los documentos del paciente sin visita se ven desde cualquier sede asignada. Servidor: `delete_not_allowed` si no se cumple la regla de eliminación; «Mostrar eliminados» es solo para administradores.

**Cómo se llega**

Pestaña «Documentos» del perfil ([S-PAC-05](06_pantallas_pacientes.md#p-pac--s-pac-05--perfil-del-paciente)).

**Distribución**

- Barra superior: desplegable «Categoría» («Todas las categorías» + 7 categorías), chip de filtro «Mostrar eliminados» (Administrador), icono «Actualizar», botón relleno «Subir» (icono de subir).
- Tarjeta «Subidas» ([S-PAC-16](06_pantallas_pacientes.md#p-pac--s-pac-16--subidas-cola-de-subida)) cuando hay subidas de este paciente en la cola.
- Tabla: «Archivo» (icono PDF o imagen + nombre truncado), «Categoría» (chip), «Tamaño» (KB / MB), «Subido» («fecha hora · Usted» o «· nombre de quien subió»), «Estado» (chip), «Acciones» (iconos Ver, Descargar, Eliminar).
- Móvil: tarjetas con nombre + chip, «categoría · tamaño», «Subido» y acciones a la derecha.

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Categoría» (filtro) | Desplegable | No | «Todas las categorías», «Documento de identidad», «Tarjeta de seguro», «Consentimiento», «Resultado de laboratorio», «Referido», «Imagen clínica», «Otro»; no se conserva al salir | No |
| «Mostrar eliminados» | Chip de filtro | No | Solo Administrador | No |
| Nombre del archivo (columna) | Lectura | — | — | Sí (cifrado en la base de datos) |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Subir» | Todos | Abre [S-PAC-15](06_pantallas_pacientes.md#p-pac--s-pac-15--categoria-del-documento-subir) (categoría inicial = filtro actual u «Otro»); al elegir archivos los encola. | No | Snackbar «1 archivo añadido a la cola de subida.» / «N archivos añadidos a la cola de subida.» |
| «Ver» (icono de imagen o de ojo) | Todos, solo si «Disponible» y no eliminado | `DocumentService/GetDownloadUrl` (en línea). | No | Imagen → [S-PAC-17](06_pantallas_pacientes.md#p-pac--s-pac-17--vista-previa-de-imagen); PDF u otros → pestaña nueva (web) o app externa (Android). Error: snackbar; si no se puede abrir: «No se pudo abrir el archivo.» |
| «Descargar» | Todos, solo si disponible | `GetDownloadUrl` (como adjunto) y abre la URL. | No | Pestaña nueva / app externa. |
| «Eliminar» (papelera) | Administrador, o quien lo subió dentro de 24 h | Abre [S-PAC-18](06_pantallas_pacientes.md#p-pac--s-pac-18--eliminar-documento). | Motivo obligatorio | Borrado lógico. |
| «Actualizar» | Todos | Vuelve a leer `ListDocuments`. | No | Lista fresca. |

**Estados y mensajes**

- Cargando: spinner; error: vista de error + «Reintentar».
- Vacío sin filtros: «Aún no hay documentos.» + (si puede subir) «Suba una imagen o un PDF para adjuntarlo a este expediente.»; vacío con filtro: «Ningún documento coincide con el filtro actual.»
- Chips: «Disponible» (verde), «Pendiente» (ámbar; en la práctica el servidor solo lista documentos disponibles), «Eliminado» (gris, tooltip «Eliminado {fecha hora}»).
- «Ver» y «Descargar» deshabilitados si no está disponible o está eliminado; tooltip de «Ver»: «Este documento aún no está disponible.»
- Almacenamiento caído (`storage_unavailable`): «Los documentos no están disponibles por el momento. Inténtelo de nuevo en unos minutos; todo lo demás sigue funcionando.» + franja global de modo degradado ([S-GEN-19](05_pantallas_generales.md#p-gen--s-gen-19--banner-de-modo-degradado-emergencia-de-infraestructura)).

**Tiempo real**

`document.changed.v1` (de cualquier documento; el evento solo trae el identificador) vuelve a leer todas las listas de documentos abiertas; también en cada reconexión, cada 30 s en modo degradado y tras una subida o eliminación local.

**Reglas de negocio**

- Orden: fecha de subida descendente.
- `ListDocuments` se audita como lectura de PHI (`document.list`) y cada enlace emitido como `document.download`; los enlaces son firmados y de corta vida, nunca se guardan ni se registran.
- Eliminar es borrado lógico: el archivo se conserva para auditoría y no se puede restaurar desde la app.
- Subir a un paciente Fusionado o Inactivo falla (`patient_merged` / `patient_inactive` → «Esta acción no está permitida en el estado actual.»).
- Los documentos subidos desde el perfil quedan asociados al paciente (no a una visita) y a la sede activa.
- La tarjeta «Subidas» y las vistas previas de imágenes no sobreviven al cierre de sesión ([S-PAC-16](06_pantallas_pacientes.md#p-pac--s-pac-16--subidas-cola-de-subida), [S-PAC-17](06_pantallas_pacientes.md#p-pac--s-pac-17--vista-previa-de-imagen)).

**Notas para el rediseño**

- Preservar que cada «Ver» o «Descargar» pida un enlace nuevo (sin caché ni precarga de URL).
- Preservar la regla de visibilidad de «Eliminar» (24 h / Administrador) y «Mostrar eliminados» solo para el Administrador.
- Preservar tabla en tableta y escritorio y tarjetas en móvil; acciones con tooltip.
- «Subir» sigue visible en un paciente fusionado (fallará en el servidor).
- En documentos eliminados el tooltip de «Ver» dice «aún no está disponible».
- El chip «Pendiente» nunca aparece; el rechazo de borrado muestra «No tiene permiso para realizar esta acción.» (existe el texto «Solo quien lo subió (dentro de 24 horas) o un administrador puede eliminar un documento.» sin usar); no se indica cuánto dura el enlace (el texto «Enlace válido por {minutes} min.» existe sin usar).

**Código fuente:** `features/patients/presentation/tabs/patient_documents_tab.dart`, `features/documents/presentation/documents_panel.dart`, `document_labels.dart`, `features/documents/application/documents_providers.dart`, `document_actions.dart`, `features/documents/domain/document_rules.dart`, `documents_query.dart`, `features/documents/infrastructure/document_gateway.dart`, `document_opener.dart`, `features/documents/documents_realtime.dart`; servidor `backend/src/documents/service.rs`, `repo.rs`.

---

### <a id="p-pac--s-pac-10--pestana-saldos"></a>S-PAC-10 Pestaña Saldos

**Ruta:** `/app/<código>/patients/<patientId>` (pestaña 5) · **Tipo:** panel

**Propósito**

Ver las cuentas abiertas o con saldo del paciente en las sedes del usuario y saltar a cobrarlas.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Lista con botón «Abrir checkout». |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | La pestaña aparece, pero el servidor responde `PERMISSION_DENIED totals_only` → estado de error «No tiene permiso para realizar esta acción.» |
| Proveedor | Limitado | Lista con botón «Abrir visita» (sin cobro). |

`BillingService/ListPatientOpenBalances` exige `ViewCharges` y ver el detalle (permiso `RecordManualPayment` o rol Proveedor).

**Cómo se llega**

Pestaña «Saldos» del perfil. Detalle del flujo de cobro en [S-CAJ-17](09_pantallas_caja.md#p-caj--s-caj-17--pestana-saldos-del-perfil-del-paciente).

**Distribución**

- Tabla: «Sede», «Visita», «Registro» (fecha), «Total», «Pagado», «Saldo» (resaltado), «Estado», botón de acción.
- Móvil: tarjetas con código corto de visita, «sede · fecha», chip, saldo resaltado y botón.

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Abrir checkout» | Administrador, Recepción | — | No | `/app/<sede>/checkout/<visita>` ([S-CAJ-03](09_pantallas_caja.md#p-caj--s-caj-03--checkout-de-la-visita)). |
| «Abrir visita» | Proveedor (y quien no tenga `recordManualPayment`) | — | No | `/app/<sede>/encounters/<visita>` ([S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita)). |
| Tocar una fila | Ídem | Igual que el botón. | No | Si la sede no está entre las del usuario: snackbar «Cambie a {code} para abrir esta visita.» |

**Estados y mensajes**

- Vacío: «No hay saldos pendientes.»; error: vista de error + «Reintentar».
- Chips: «Abierto» (ámbar), «Pago parcial» (azul), «Pagado» (verde), «Anulado» (gris), «Desconocido».

**Tiempo real**

`billing.changed.v1` recarga; también en cada reconexión y cada 30 s en modo degradado.

**Reglas de negocio**

- Los montos vienen calculados del servidor (decimal exacto); nada se suma en el cliente.
- Orden por fecha de llegada descendente.

**Notas para el rediseño**

- Preservar los montos sin recalcular en el cliente y el botón según permiso.
- La pestaña se muestra a Enfermería aunque siempre falla para ese rol.
- «checkout» aparece en inglés en una interfaz en español; el snackbar sugiere cambiar a una sede a la que el usuario no tiene acceso.

**Código fuente:** `features/patients/presentation/tabs/patient_balances_tab.dart`, `features/billing/presentation/patient_balances_panel.dart`, `billing_labels.dart`, `features/patients/application/patient_providers.dart` (`patientBalancesProvider`); servidor `backend/src/billing/service.rs`.

---

### <a id="p-pac--s-pac-11--editar-paciente"></a>S-PAC-11 Editar paciente

**Ruta:** sin ruta: diálogo sobre [S-PAC-05](06_pantallas_pacientes.md#p-pac--s-pac-05--perfil-del-paciente) (pantalla completa en móvil) · **Tipo:** diálogo

**Propósito**

Corregir el nombre o el apellido, o actualizar o borrar el teléfono del paciente.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Nombre, apellido y teléfono. |
| Recepción | Completo | Nombre, apellido y teléfono. |
| Enfermería / asistente médico | Sin acceso | Botón oculto; el servidor exige `EditPatientBasic`. |
| Proveedor | Limitado | Solo teléfono: nombres deshabilitados con el texto «Su rol solo puede actualizar el teléfono.» El servidor responde `identity_fields_locked` si un rol distinto de Administrador o Recepción intenta cambiar nombres. |

**Cómo se llega**

«Editar» en el encabezado de [S-PAC-05](06_pantallas_pacientes.md#p-pac--s-pac-05--perfil-del-paciente) (o menú de tres puntos en móvil).

**Distribución**

- Diálogo de ancho máximo 560 px con título «Editar paciente» (móvil: pantalla completa con la misma barra).
- Banner de error compacto si falla.
- Texto «Su rol solo puede actualizar el teléfono.» (solo Proveedor).
- Campos «Nombre», «Apellido» (precargados en formato Título) y «Teléfono».
- Pie: «Cancelar» y «Guardar» (spinner mientras guarda).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Nombre» | Texto | Sí para Administrador y Recepción; deshabilitado para Proveedor | Servidor: máx. 100, MAYÚSCULAS | Sí |
| «Apellido» | Texto | Ídem | Ídem | Sí |
| «Teléfono» | Teclado telefónico; Enter guarda | No | Si se escribe, al menos 7 dígitos («Ingrese un teléfono válido (al menos 7 dígitos).»); vaciarlo borra el teléfono; servidor 7–15 dígitos | Sí |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Guardar» (o Enter en Teléfono) | Administrador, Recepción, Proveedor | Sin cambios: cierra sin llamar al servidor. Con cambios: `PatientService/UpdatePatient` con `expected_version` y solo los campos modificados. | No | Éxito: snackbar «Paciente actualizado.» y cierra. Conflicto (`ABORTED`): [S-PAC-12](06_pantallas_pacientes.md#p-pac--s-pac-12--actualizado-por-otro-usuario). Otros errores: banner en el formulario. |
| «Cancelar» / atrás | Ídem | Cierra. | [S-PAC-04](06_pantallas_pacientes.md#p-pac--s-pac-04--descartar-cambios-sin-guardar) si hay cambios | Sin cambios. |

**Estados y mensajes**

- Guardando: campos y botones deshabilitados, spinner.
- Error en el formulario: por ejemplo «No tiene permiso para realizar esta acción.», «Esta acción no está permitida en el estado actual.» (paciente fusionado), «Algunos campos no son válidos. Revíselos.»

**Tiempo real**

El formulario no se actualiza si otro usuario cambia el paciente mientras se edita; el conflicto se detecta al guardar.

**Reglas de negocio**

- Concurrencia optimista: cada guardado envía la versión leída; si cambió, el servidor responde `ABORTED`.
- Un paciente fusionado no se puede editar (`patient_merged`).
- Cambiar nombre o apellido recalcula la huella de duplicados.
- La fecha de nacimiento no es editable.
- El cambio se audita con la lista de campos modificados (nunca los valores) y emite un evento.

**Notas para el rediseño**

- Preservar el envío solo de los campos cambiados con `expected_version` y la deshabilitación de nombres para el Proveedor con la explicación visible.
- Preservar la confirmación al salir con cambios.
- No se puede corregir la fecha de nacimiento (error de captura frecuente) desde ninguna pantalla.
- Sin límites visibles de longitud ni de dígitos.

**Código fuente:** `features/patients/presentation/patient_edit_dialog.dart`, `features/patients/application/patient_commands.dart` (`update`), `patient_providers.dart` (`patientEditScopeProvider`); servidor `backend/src/patients/service.rs` (`update_patient`), `domain.rs` (`enforce_update_scope`).

---

### <a id="p-pac--s-pac-12--actualizado-por-otro-usuario"></a>S-PAC-12 Actualizado por otro usuario

**Ruta:** sin ruta: diálogo sobre [S-PAC-11](06_pantallas_pacientes.md#p-pac--s-pac-11--editar-paciente) · **Tipo:** diálogo

**Propósito**

Avisar de un conflicto de concurrencia optimista y recargar el registro.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Cuando guarda una versión desactualizada. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | No edita pacientes. |
| Proveedor | Completo | Ídem (edición del teléfono). |

**Cómo se llega**

Automáticamente cuando `UpdatePatient` responde `ABORTED` / `version_conflict`.

**Distribución**

- Título «Actualizado por otro usuario»; texto «Otro usuario actualizó este paciente. Actualice el registro para continuar.»; único botón relleno «Actualizar».

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Actualizar» | Quien editaba | Vuelve a leer el paciente y cierra el editor. | No | Los cambios escritos se pierden; hay que volver a abrir «Editar». |

**Estados y mensajes**

Sin estados adicionales.

**Tiempo real**

Ninguno.

**Reglas de negocio**

- Concurrencia optimista: nunca se sobrescribe un cambio ajeno.

**Notas para el rediseño**

- Preservar el bloqueo (no ofrecer «guardar igualmente»).
- Mejora posible: conservar o mostrar lo que el usuario había escrito; hoy se pierde.

**Código fuente:** `features/patients/presentation/patient_edit_dialog.dart` (`_conflict`).

---

### <a id="p-pac--s-pac-13--fusionar-pacientes"></a>S-PAC-13 Fusionar pacientes

**Ruta:** `/app/<código>/patients/<patientId>/merge` · **Tipo:** página

**Propósito**

Unir dos registros del mismo paciente real: el duplicado queda Fusionado y su historial pasa al principal.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Guarda de ruta `mergePatients`; el servidor exige `MergePatients`. |
| Recepción | Sin acceso | Botón «Fusionar con…» oculto; la URL redirige al Panel. |
| Enfermería / asistente médico | Sin acceso | Ídem. |
| Proveedor | Sin acceso | Ídem. |

**Cómo se llega**

«Fusionar con…» en [S-PAC-05](06_pantallas_pacientes.md#p-pac--s-pac-05--perfil-del-paciente) (paciente no fusionado); URL directa.

**Distribución**

- Encabezado: botón atrás (tooltip «Atrás») hacia el perfil; título «Fusionar pacientes».
- Texto: «El registro duplicado se fusiona con el registro principal. Los códigos, visitas y saldos pasan al paciente principal. Esta acción no se puede deshacer.»
- Tarjeta «Buscar al otro paciente»: «Código del paciente» (pista «LAN-P-000001 o etiqueta escaneada»), «Nombre», «Apellido», botón tonal «Buscar»; barra de progreso; resultados (excluye al paciente abierto): primer código o icono de persona, nombre, fecha de nacimiento y botón «Seleccionar» (o chip «Fusionado»); la fila elegida queda resaltada.
- Dos tarjetas comparativas lado a lado (apiladas en móvil): «Principal (se conserva)» (cabecera color primario) y «Duplicado (se fusiona)» (cabecera color de error), cada una con nombre, «Fecha de nacimiento», «Teléfono», «Creado», «Estado» y «Códigos por sede»; sin selección: «Aún no se ha seleccionado un paciente.»
- Botón de texto «Invertir dirección» (icono de intercambio).
- Banner de error compacto.
- Campo «Escriba MERGE para confirmar».
- Botón rojo «Fusionar» (icono de fusión) a la derecha.

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Código del paciente» | Texto en MAYÚSCULAS | No | Igual que en la búsqueda ([S-PAC-01](06_pantallas_pacientes.md#p-pac--s-pac-01--pacientes-busqueda)) | No |
| «Nombre» / «Apellido» | Texto | No | Coincidencia exacta (no hay filtro por fecha de nacimiento ni teléfono) | Sí |
| «Escriba MERGE para confirmar» | Texto | Sí para habilitar «Fusionar» | Habilitado solo tras seleccionar al otro paciente; no distingue mayúsculas («merge» vale); ayuda «Aún no se ha seleccionado un paciente.» mientras no hay selección | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Buscar» (o Enter) | Administrador | `SearchPatients` con código o nombres (sin fusionados). | No | Resultados sin el paciente actual. |
| «Seleccionar» | Administrador | Elige al otro paciente (no disponible en filas «Fusionado»). | No | Rellena la tarjeta comparativa. |
| «Invertir dirección» | Administrador | Habilitado tras seleccionar; intercambia cuál se conserva. | No | Por defecto el paciente abierto es el **duplicado** y el buscado el **principal**. |
| «Fusionar» | Administrador | Habilitado con otro paciente seleccionado, distinto, y «MERGE» escrito. | [S-PAC-14](06_pantallas_pacientes.md#p-pac--s-pac-14--fusionar-estos-pacientes) | `PatientService/MergePatients(principal, duplicado)`; éxito: snackbar «Pacientes fusionados.» y perfil del principal; error: banner. |
| Atrás | Administrador | — | No | Perfil del paciente abierto. |

**Estados y mensajes**

- Cargando el paciente abierto: spinner; error: vista de error + «Reintentar».
- Búsqueda: barra lineal; error en texto rojo; sin resultados: no se muestra nada (sin mensaje).
- Fusionando: spinner en el botón, campo de confirmación deshabilitado.
- Errores típicos: «Esta acción no está permitida en el estado actual.» (`canonical_not_active` / `duplicate_not_active`), «Algunos campos no son válidos. Revíselos.» (mismo paciente).

**Tiempo real**

Tras fusionar, `patient.changed.v1` con identificador relacionado avisa a cualquier usuario que tenga abierto el duplicado (snackbar en [S-PAC-05](06_pantallas_pacientes.md#p-pac--s-pac-05--perfil-del-paciente)) y refresca las listas del principal.

**Reglas de negocio**

- Ambos registros deben estar Activos y ser distintos.
- Se mueven al principal los códigos de las sedes donde el principal no tiene código; los demás quedan en el duplicado para que sigan resolviendo (buscar ese código lleva al principal).
- Se reasignan al principal: citas, visitas, documentos, referencias y membresías (incluida la titularidad).
- El duplicado queda en estado Fusionado con un puntero al principal; no se borra nada (el historial clínico y de facturación nunca se elimina).
- Irreversible desde la app; auditado (`patient.merge`) con conteos y evento `patient.merged` en la misma transacción.

**Notas para el rediseño**

- Preservar la doble confirmación (escribir la palabra + diálogo destructivo) y los colores distintos para Principal y Duplicado.
- Preservar la dirección por defecto, «Invertir dirección», la exclusión del propio paciente y la imposibilidad de elegir un registro fusionado.
- La palabra a escribir es «MERGE» (inglés) en una interfaz en español.
- Búsqueda sin fecha de nacimiento ni teléfono; sin mensaje de «sin resultados» (el texto «Seleccione un paciente distinto.» existe sin usar).
- El texto introductorio solo menciona códigos, visitas y saldos; el servidor también traslada citas, documentos, referencias y membresías.

**Código fuente:** `features/patients/presentation/patient_merge_page.dart`, `features/patients/application/patient_commands.dart` (`merge`), `features/patients/infrastructure/patient_gateway.dart`; servidor `backend/src/patients/service.rs` (`merge_patients`), `domain.rs` (`validate_merge_pair`), `repo.rs` (`move_identifiers`).

---

### <a id="p-pac--s-pac-14--fusionar-estos-pacientes"></a>S-PAC-14 ¿Fusionar estos pacientes?

**Ruta:** sin ruta: diálogo de confirmación sobre [S-PAC-13](06_pantallas_pacientes.md#p-pac--s-pac-13--fusionar-pacientes) · **Tipo:** diálogo

**Propósito**

Última confirmación de una acción destructiva e irreversible.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Botón «Fusionar» habilitado en [S-PAC-13](06_pantallas_pacientes.md#p-pac--s-pac-13--fusionar-pacientes).

**Distribución**

- Título «¿Fusionar estos pacientes?»
- Texto «{duplicado} se fusionará con {principal}. Esta acción no se puede deshacer.» (por ejemplo «Ana Prueba se fusionará con Ana Prueba Demo. …»).
- Botones «Cancelar» y «Fusionar» (rojo).

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Fusionar» | Administrador | Ejecuta `MergePatients`. | Es la confirmación | Ver [S-PAC-13](06_pantallas_pacientes.md#p-pac--s-pac-13--fusionar-pacientes). |
| «Cancelar» | Administrador | — | — | Vuelve a [S-PAC-13](06_pantallas_pacientes.md#p-pac--s-pac-13--fusionar-pacientes) sin cambios. |

**Estados y mensajes**

Sin estados adicionales.

**Tiempo real**

Ninguno.

**Reglas de negocio**

- Los nombres mostrados respetan la dirección elegida (incluida la inversión).

**Notas para el rediseño**

- Preservar los nombres de ambos registros y el estilo destructivo.

**Código fuente:** `features/patients/presentation/patient_merge_page.dart` (`_merge`), `core/widgets/confirm_dialog.dart`.

---

### <a id="p-pac--s-pac-15--categoria-del-documento-subir"></a>S-PAC-15 Categoría del documento (subir)

**Ruta:** sin ruta: hoja inferior modal sobre el panel de documentos · **Tipo:** hoja

**Propósito**

Elegir la categoría y el origen de los archivos (archivo, cámara o galería) antes de encolarlos.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Quien ve el botón «Subir». |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Completo | Ídem. |
| Proveedor | Completo | Ídem. |

**Cómo se llega**

«Subir» en [S-PAC-09](06_pantallas_pacientes.md#p-pac--s-pac-09--documentos-pestana-del-perfil--panel-de-documentos), [S-PAC-19](06_pantallas_pacientes.md#p-pac--s-pac-19--documentos-pagina-del-paciente) o [S-PAC-20](06_pantallas_pacientes.md#p-pac--s-pac-20--documentos-de-la-visita).

**Distribución**

- Título «Categoría del documento» y texto «Elija la categoría para el/los archivo(s) seleccionado(s).»
- Desplegable «Categoría».
- Texto pequeño «JPEG, PNG, WebP, HEIC o PDF, hasta {limit}.» (límite de `documents.max_size_bytes`, por defecto 25 MB).
- Error en rojo «No se pudo leer el archivo seleccionado.» cuando falla la lectura.
- Botones: «Elegir archivo» (relleno), «Tomar foto» (tonal, solo Android), «Elegir imagen» (tonal), «Cancelar».
- Barra lineal mientras el selector del sistema está abierto.

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Categoría» | Desplegable | Sí (siempre con valor) | «Documento de identidad», «Tarjeta de seguro», «Consentimiento», «Resultado de laboratorio», «Referido», «Imagen clínica», «Otro»; se aplica a todos los archivos elegidos | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Elegir archivo» | Todos | Selector del sistema de selección múltiple, filtrado por las extensiones permitidas (jpg/jpeg/png/webp/heic/pdf según `documents.allowed_mime_types`). | No | Se cierra y encola ([S-PAC-16](06_pantallas_pacientes.md#p-pac--s-pac-16--subidas-cola-de-subida)). |
| «Tomar foto» | Todos, solo Android (no aparece en web) | Abre la cámara; una foto. | No | Encola. |
| «Elegir imagen» | Todos | Galería (en web, diálogo de archivos de imagen); una imagen. | No | Encola. |
| «Cancelar» | Todos | Cierra sin encolar. | No | — |
| Cancelar el selector del sistema | Todos | — | — | La hoja sigue abierta. |

**Estados y mensajes**

- Ocupado: botones y desplegable deshabilitados + barra lineal.
- Error de lectura: texto rojo; la hoja sigue abierta.

**Tiempo real**

Ninguno.

**Reglas de negocio**

- La validación de tamaño, tipo y nombre se hace al encolar ([S-PAC-16](06_pantallas_pacientes.md#p-pac--s-pac-16--subidas-cola-de-subida)), no aquí.
- En Android los tres orígenes entregan a la app un archivo en su caché privada (una copia del archivo elegido o la propia foto de la cámara), nunca el archivo original del usuario; la cola lo borra cuando ya no lo necesita ([S-PAC-16](06_pantallas_pacientes.md#p-pac--s-pac-16--subidas-cola-de-subida)). En la web el archivo queda en memoria y no se guarda nada en disco.

**Notas para el rediseño**

- Preservar que el selector se abra directamente desde el gesto del botón (requisito del navegador web).
- Preservar «Tomar foto» solo donde hay cámara (Android).
- El texto de tipos permitidos está fijo («JPEG, PNG, WebP, HEIC o PDF») aunque la lista es configurable; solo el límite de tamaño es dinámico.

**Código fuente:** `features/documents/presentation/upload_sheet.dart`, `features/documents/infrastructure/document_picker.dart`, `picked_upload.dart`, `local_file_cleanup.dart`, `core/config/client_settings.dart`.

---

### <a id="p-pac--s-pac-16--subidas-cola-de-subida"></a>S-PAC-16 Subidas (cola de subida)

**Ruta:** sin ruta: tarjeta dentro del panel de documentos · **Tipo:** panel

**Propósito**

Mostrar el avance de cada archivo y permitir cancelar, reintentar o descartar.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Quien sube. El servidor (`CreateUpload`) exige `UploadPatientDocuments` en la sede activa. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Completo | Ídem. |
| Proveedor | Completo | Ídem. |

**Cómo se llega**

Aparece en [S-PAC-09](06_pantallas_pacientes.md#p-pac--s-pac-09--documentos-pestana-del-perfil--panel-de-documentos), [S-PAC-19](06_pantallas_pacientes.md#p-pac--s-pac-19--documentos-pagina-del-paciente) o [S-PAC-20](06_pantallas_pacientes.md#p-pac--s-pac-20--documentos-de-la-visita) después de elegir archivos.

**Distribución**

- Tarjeta con título «Subidas» y, si hay terminados, botón «Limpiar finalizados».
- Una fila por archivo: icono (nube = en curso, check = subido, error, cancelado), nombre, «{etapa} · {tamaño}» (en Android durante la subida añade «· NN%»), detalle de error en rojo y botones de icono «Cancelar» (X), «Reintentar» (refrescar), «Descartar» (X).
- Barra de progreso bajo la fila mientras está activa (determinada en Android al subir; indeterminada en web y en las demás etapas).

**Campos**

Sin campos (el nombre del archivo es PHI).

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Cancelar» | Quien sube, en espera o en curso | Aborta (el permiso de subida pendiente se abandona en el servidor) y borra la copia local del archivo. | No | Fila «Cancelado». |
| «Reintentar» | Ídem, solo fallos no rechazados | Rehace todo el flujo con un permiso nuevo desde la misma copia local (solo mientras exista: hasta «Descartar», «Limpiar finalizados» o el cierre de sesión). | No | Vuelve a «En espera». |
| «Descartar» | Ídem, terminados | Quita la fila y borra su copia local. | No | — |
| «Limpiar finalizados» | Ídem | Quita todas las filas terminadas de este panel y borra sus copias locales. | No | — |

**Estados y mensajes**

- Etapas: «En espera» → «Preparando (suma de verificación)» → «Solicitando subida» → «Subiendo» → «Verificando» → «Subido»; o «Error» / «Cancelado».
- Rechazos en el cliente (sin llamar al servidor, sin reintento): «El archivo está vacío.», «El archivo supera {limit}.», «Tipo de archivo no permitido. Permitidos: JPEG, PNG, WebP, HEIC, PDF.», «El nombre del archivo está vacío o supera los 200 caracteres.»
- Fallos del servidor: mensaje traducido + pista: «El archivo no llegó íntegro. Inténtelo de nuevo.» (suma, tamaño, objeto ausente, sin cifrar o subida rechazada) o «El permiso de subida caducó. Inicie la subida de nuevo.» (`upload_expired` / `already_finalized`).
- Almacenamiento no disponible: «Los documentos no están disponibles por el momento…»

**Tiempo real**

Al terminar cada archivo se recargan las listas de documentos; los demás usuarios lo ven por `document.changed.v1`.

**Reglas de negocio**

- Un archivo a la vez: SHA-256 local → `DocumentService/CreateUpload` (permiso + URL firmada) → subida HTTPS directa al almacenamiento con las cabeceras firmadas (los bytes nunca pasan por gRPC) → `DocumentService/FinalizeUpload` (verifica suma y tamaño, con versión) → «Disponible».
- El permiso de subida pendiente caduca a la hora; los pendientes nunca se listan.
- Cola única para toda la app: sobrevive al cambio de pestaña o pantalla; se pierde al recargar la app y se vacía en cada cierre de sesión (voluntario, en todos los dispositivos, forzado o por inactividad): lo que está subiendo se aborta, lo que está en espera ya no empieza y no queda ninguna fila que el siguiente usuario pueda ver o reintentar.
- Copias locales (Android): cada archivo de la cola es una copia en la caché privada de la app ([S-PAC-15](06_pantallas_pacientes.md#p-pac--s-pac-15--categoria-del-documento-subir)). Se borra en cuanto la subida termina («Subido») o se cancela; un archivo con «Error» (también los rechazados en el cliente) la conserva hasta «Descartar», «Limpiar finalizados» o el cierre de sesión, que además vacía las carpetas de caché de los selectores (`cache/file_picker/`) y de compartir (`cache/share/`). En la web no hay copias en disco.
- Panel del paciente: ve todas las subidas de ese paciente (incluidas las de visitas); panel de visita: solo las de esa visita.
- Si la subida es para una visita, la visita debe ser del paciente y de la sede activa.

**Notas para el rediseño**

- Preservar el estado por archivo con texto + icono + color (no solo color) y las acciones cancelar / reintentar / descartar.
- Preservar el progreso indeterminado en web (el navegador no informa progreso real).
- Preservar el vaciado de la cola y el borrado de las copias locales en cada cierre de sesión: en un dispositivo compartido el siguiente usuario no debe ver nombres de archivo ajenos ni poder reintentar subidas ajenas.
- Una foto de «Tomar foto» o «Elegir imagen» cuya subida quedó a medias porque la app se cerró a la fuerza se borra en el siguiente cierre de sesión: además de `cache/file_picker/` y `cache/share/`, la limpieza borra las copias que el selector de imágenes guarda en la caché con un nombre aleatorio (UUID), y nada más.
- Compartir un recibo en Android ([S-CAJ-15](09_pantallas_caja.md#p-caj--s-caj-15--hoja-recibo-codigo-vista-de-texto)) no toca `cache/file_picker/`: los archivos que sigan en la cola (en espera o con error pendiente de reintento) conservan su copia.
- El mensaje de tipo no permitido lista tipos fijos aunque son configurables.

**Código fuente:** `features/documents/presentation/upload_queue_view.dart`, `features/documents/application/upload_queue_notifier.dart`, `features/documents/domain/upload_item.dart`, `document_rules.dart`, `features/documents/infrastructure/upload_client.dart`, `sha256_hasher.dart`, `document_gateway.dart`, `picked_upload.dart`, `local_file_cleanup.dart`, `features/documents/documents_realtime.dart` (vaciado al cerrar sesión); servidor `backend/src/documents/service.rs` (`create_upload`, `finalize`).

---

### <a id="p-pac--s-pac-17--vista-previa-de-imagen"></a>S-PAC-17 Vista previa de imagen

**Ruta:** sin ruta: diálogo sobre el panel de documentos · **Tipo:** diálogo

**Propósito**

Ver una imagen (identificación, tarjeta de seguro, imagen clínica) sin salir de la app.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Cualquiera que pueda «Ver». |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Completo | Ídem. |
| Proveedor | Completo | Ídem. |

**Cómo se llega**

«Ver» sobre un documento de tipo imagen en el panel de documentos.

**Distribución**

- Cabecera: nombre del archivo, botón «Abrir» (icono de abrir en ventana nueva), icono «Cerrar».
- Imagen ajustada con zoom y desplazamiento (pellizcar o rueda).

**Campos**

Sin campos (la imagen es PHI).

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Abrir» | Todos | Abre la misma URL firmada en pestaña nueva o app externa. | No | — |
| «Cerrar» | Todos | Cierra el diálogo. | No | — |

**Estados y mensajes**

- Cargando: spinner.
- Error: icono de imagen rota + «Vista previa no disponible. Abra el archivo.»

**Tiempo real**

Ninguno.

**Reglas de negocio**

- La URL es firmada y de corta vida; obtenerla ya quedó auditado (`document.download`).
- La imagen decodificada puede quedar en la caché de imágenes en memoria de la app; cada cierre de sesión la vacía (`imageCache.clear()` y `clearLiveImages()`), así que el siguiente usuario no hereda ninguna vista previa.

**Notas para el rediseño**

- Preservar el zoom y la salida «Abrir»; los PDF no usan este diálogo (se abren directamente en el navegador).

**Código fuente:** `features/documents/presentation/document_preview_dialog.dart`, `features/documents/documents_realtime.dart` (vaciado al cerrar sesión).

---

### <a id="p-pac--s-pac-18--eliminar-documento"></a>S-PAC-18 Eliminar documento

**Ruta:** sin ruta: diálogo sobre el panel de documentos · **Tipo:** diálogo

**Propósito**

Ocultar un documento subido por error indicando un motivo obligatorio, conservando el archivo.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Cualquier documento disponible. |
| Recepción | Limitado | Solo los documentos que subió, dentro de 24 h (el icono solo aparece en ese caso). |
| Enfermería / asistente médico | Limitado | Ídem. |
| Proveedor | Limitado | Ídem. |

Servidor: `delete_not_allowed` si no se cumple la regla.

**Cómo se llega**

Icono «Eliminar» de una fila del panel de documentos.

**Distribución**

- Título «Eliminar documento».
- Texto «“{filename}” se ocultará de este expediente. El archivo se conserva para auditoría y no puede restaurarse desde la app.»
- Campo «Motivo» (pista «Por qué se elimina este documento», contador hasta 500).
- Botones «Cancelar» y «Eliminar» (rojo).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Motivo» | Texto de 1–3 líneas, foco automático; Enter confirma | Sí («El motivo es obligatorio.») | Máx. 500 caracteres | No se guarda en la auditoría (solo se registra que hubo motivo) |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Eliminar» | Según la regla | Valida el motivo; `DocumentService/DeleteDocument` con `expected_version`. | Este diálogo | Éxito: snackbar «Documento eliminado.» y recarga las listas. Conflicto (`ABORTED`): recarga la lista + snackbar «Este registro fue actualizado por otro usuario. Actualice para continuar.» No permitido: «No tiene permiso para realizar esta acción.» |
| «Cancelar» | Todos | Cierra sin cambios. | — | — |

**Estados y mensajes**

Ver la columna Resultado.

**Tiempo real**

Emite `document.deleted`; los demás usuarios ven la lista actualizada por `document.changed.v1`.

**Reglas de negocio**

- Borrado lógico: el objeto se conserva; solo documentos Disponibles; auditado (`document.delete` con `has_reason`) con evento en la misma transacción.
- Concurrencia optimista por versión.

**Notas para el rediseño**

- Preservar el motivo obligatorio y el botón destructivo en rojo.
- El motivo se exige pero no se guarda en la auditoría (solo que hubo motivo); conviene aclararlo o no prometer trazabilidad del texto.

**Código fuente:** `features/documents/presentation/delete_document_dialog.dart`, `features/documents/application/document_actions.dart` (`delete`); servidor `backend/src/documents/service.rs` (`delete`).

---

### <a id="p-pac--s-pac-19--documentos-pagina-del-paciente"></a>S-PAC-19 Documentos (página del paciente)

**Ruta:** `/app/<código>/patients/<patientId>/documents` · **Tipo:** página

**Propósito**

El mismo panel de documentos del paciente en una página completa.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Guarda `uploadPatientDocuments`; dentro, mismas reglas que [S-PAC-09](06_pantallas_pacientes.md#p-pac--s-pac-09--documentos-pestana-del-perfil--panel-de-documentos). |
| Recepción | Limitado | Ídem (eliminar solo lo propio en 24 h). |
| Enfermería / asistente médico | Limitado | Ídem. |
| Proveedor | Limitado | Ídem. |

**Cómo se llega**

Solo por URL directa: ningún botón de la app enlaza a esta ruta.

**Distribución**

- Encabezado: botón atrás (tooltip «Volver al paciente») y título «Documentos».
- Cuerpo: panel de documentos ([S-PAC-09](06_pantallas_pacientes.md#p-pac--s-pac-09--documentos-pestana-del-perfil--panel-de-documentos)) a pantalla completa.

**Campos**

Igual que [S-PAC-09](06_pantallas_pacientes.md#p-pac--s-pac-09--documentos-pestana-del-perfil--panel-de-documentos).

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Atrás «Volver al paciente» | Todos | — | No | [S-PAC-05](06_pantallas_pacientes.md#p-pac--s-pac-05--perfil-del-paciente). |
| Resto | Según [S-PAC-09](06_pantallas_pacientes.md#p-pac--s-pac-09--documentos-pestana-del-perfil--panel-de-documentos) | Igual que [S-PAC-09](06_pantallas_pacientes.md#p-pac--s-pac-09--documentos-pestana-del-perfil--panel-de-documentos). | — | — |

**Estados y mensajes**

- Igual que [S-PAC-09](06_pantallas_pacientes.md#p-pac--s-pac-09--documentos-pestana-del-perfil--panel-de-documentos) (el título no muestra el nombre del paciente).

**Tiempo real**

Igual que [S-PAC-09](06_pantallas_pacientes.md#p-pac--s-pac-09--documentos-pestana-del-perfil--panel-de-documentos).

**Reglas de negocio**

- Documentos a nivel paciente (sin visita).

**Notas para el rediseño**

- Decidir si se enlaza desde el perfil o se elimina; hoy es una ruta huérfana.
- El título no identifica al paciente (riesgo de subir al expediente equivocado).

**Código fuente:** `features/documents/presentation/patient_documents_page.dart`, `documents_panel.dart`.

---

### <a id="p-pac--s-pac-20--documentos-de-la-visita"></a>S-PAC-20 Documentos de la visita

**Ruta:** `/app/<código>/encounters/<encounterId>/documents` · **Tipo:** página (también catalogada como [S-CLI-25](08_pantallas_clinicas.md#p-cli--s-cli-25--documentos-de-la-visita))

**Propósito**

Ver y subir documentos adjuntos a una visita concreta (por ejemplo, el consentimiento o el resultado de esa visita).

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Guarda `uploadPatientDocuments`. Listar exige el permiso en la sede de la visita; subir exige que la visita sea de la sede activa (`encounter_location_mismatch`). |
| Recepción | Limitado | Ídem (eliminar solo lo propio en 24 h). |
| Enfermería / asistente médico | Limitado | Ídem. |
| Proveedor | Limitado | Ídem. |

**Cómo se llega**

Solo por URL directa: la página de visita no tiene enlace a esta ruta.

**Distribución**

- Encabezado: botón atrás (tooltip «Volver a la visita») y título «Documentos de la visita».
- Cuerpo: carga la visita (`EncounterService/GetEncounter`) para conocer al paciente y muestra el panel de documentos limitado a esa visita.

**Campos**

Igual que [S-PAC-09](06_pantallas_pacientes.md#p-pac--s-pac-09--documentos-pestana-del-perfil--panel-de-documentos).

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Atrás «Volver a la visita» | Todos | — | No | Página de la visita ([S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita)). |
| Resto | Según [S-PAC-09](06_pantallas_pacientes.md#p-pac--s-pac-09--documentos-pestana-del-perfil--panel-de-documentos) | Igual que [S-PAC-09](06_pantallas_pacientes.md#p-pac--s-pac-09--documentos-pestana-del-perfil--panel-de-documentos); las subidas quedan adjuntas a la visita. | — | — |

**Estados y mensajes**

- Cargando la visita: spinner; error: vista de error + «Reintentar».
- Resto igual que [S-PAC-09](06_pantallas_pacientes.md#p-pac--s-pac-09--documentos-pestana-del-perfil--panel-de-documentos).

**Tiempo real**

Igual que [S-PAC-09](06_pantallas_pacientes.md#p-pac--s-pac-09--documentos-pestana-del-perfil--panel-de-documentos).

**Reglas de negocio**

- La cola de subidas de esta página muestra solo las subidas de esta visita.

**Notas para el rediseño**

- Ruta huérfana: enlazarla desde la página de visita o integrar el panel allí.
- El título no identifica la visita ni el paciente.

**Código fuente:** `features/documents/presentation/encounter_documents_page.dart`, `features/documents/application/documents_providers.dart` (`documentsEncounterProvider`), `features/documents/infrastructure/encounter_lookup_gateway.dart`.

---

### <a id="p-pac--s-pac-21--registro-de-exportacion-previo-auditoria-antes-de-imprimir--descargar--compartir"></a>S-PAC-21 Registro de exportación previo (auditoría antes de imprimir / descargar / compartir)

**Ruta:** sin ruta propia: comportamiento invocado desde Reportes y Recibos; su única interfaz es un snackbar · **Tipo:** aviso

**Propósito**

Cumplir HIPAA 164.312(b): toda salida de datos de la app (impresión, CSV, PDF, compartir) queda registrada en la auditoría **antes** de producirse; si no se puede registrar, no se produce.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Para cualquier sede existente; lo dispara desde Reportes, Reportes de la compañía y Recibos. |
| Recepción | Completo | Para sus sedes; lo dispara desde Reportes (su sede) y Recibos. |
| Enfermería / asistente médico | Limitado | El servidor se lo permite para sus sedes, pero no tiene pantallas que exporten. |
| Proveedor | Limitado | Ídem. |

`AuditService.RecordClientExport`: límite de 30 por minuto por usuario.

**Cómo se llega**

Botones «Imprimir» y «Exportar CSV» en Reportes (diario y por rango, [S-CAJ-19](09_pantallas_caja.md#p-caj--s-caj-19--pestana-diario-reporte-diario-de-una-sede), [S-CAJ-20](09_pantallas_caja.md#p-caj--s-caj-20--pestana-rango-resumen-por-rango-de-fechas)); «Imprimir» / «Reimprimir» y «Compartir» (Android) en Recibos ([S-CAJ-14](09_pantallas_caja.md#p-caj--s-caj-14--panel-recibos-generar-ver-imprimir-y-reimprimir), [S-CAJ-15](09_pantallas_caja.md#p-caj--s-caj-15--hoja-recibo-codigo-vista-de-texto)). Detalle de la secuencia en [S-CAJ-24](09_pantallas_caja.md#p-caj--s-caj-24--impresion-y-exportacion-dialogo-del-sistema-y-auditoria).

**Distribución**

- No tiene pantalla: si el registro falla aparece el snackbar «Exportación cancelada: no se pudo registrar en la auditoría. Inténtelo de nuevo en un momento.»

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Reportes «Imprimir» | Administrador, Recepción | Registra PRINT (filas = filas de las secciones) y abre el diálogo de impresión. | No | Fallo de impresión: «No se pudo imprimir el reporte.» |
| Reportes «Exportar CSV» | Administrador, Recepción | Registra CSV y descarga (web) o comparte (Android). | No | «CSV exportado.» / «No se pudo exportar el CSV.» |
| Recibos «Imprimir» / «Reimprimir» | Administrador, Recepción | Obtiene el PDF del servidor, registra PRINT (identificador del recibo, 1 fila, filtro `language` si se eligió idioma) y abre la impresión. | No | Fallo: «No se pudo imprimir el recibo.» |
| Recibos «Compartir» (Android) | Administrador, Recepción | Obtiene el PDF, registra SHARE y abre la hoja de compartir. | No | Fallo: «No se pudo compartir el recibo.» |

**Estados y mensajes**

- Registro rechazado o fallido (red, permiso, límite de 30 por minuto, sede no permitida): snackbar «Exportación cancelada: …» y no se imprime, descarga ni comparte nada.

**Tiempo real**

Ninguno.

**Reglas de negocio**

- Solo viajan identificadores, conteos y **nombres** de filtros (`date`, `from`, `to`, `location_id`, `language`), nunca nombres de pacientes, valores de fechas ni el archivo.
- Recursos aceptados (lista cerrada): `report.daily_location`, `report.daily_company`, `report.range`, `receipt`.
- La sede viaja en el cuerpo de la petición (no en la cabecera de sede activa) y la valida el servidor.
- Tras renovar la sesión se reintenta una vez (una petición rechazada no escribió nada).
- Las pantallas de pacientes no tienen impresión ni exportación propias; ver o descargar documentos no usa este registro: el servidor audita cada enlace emitido como `document.download`.

**Notas para el rediseño**

- Cualquier botón nuevo de imprimir, exportar, descargar a archivo o compartir debe llamar primero a este registro y abortar si falla; nunca generar el archivo antes.
- No mostrar el motivo técnico del fallo: el mensaje es único para cualquier causa (incluido el límite por minuto).

**Código fuente:** `features/exports/domain/client_export.dart`, `features/exports/application/export_audit.dart`, `features/exports/infrastructure/export_audit_gateway.dart`, `features/reports/presentation/report_actions.dart`, `features/receipts/application/receipt_commands.dart`, `features/receipts/presentation/receipts_panel.dart`, `receipt_text_sheet.dart`.

---

## <a id="p-pac--preguntas-abiertas-detectadas-en-estas-pantallas"></a>Preguntas abiertas detectadas en estas pantallas

1. Proveedor «limitado» al editar datos (`docs/06_RBAC_MATRIX.md` marca ◐; el comentario de `EditPatientBasic` en `backend/src/shared/rbac.rs` y `permission.dart` dice «own encounters' patients, non-identity fields», es decir, solo pacientes de sus propias visitas y campos no identitarios): ni la app ni el servidor restringen a pacientes de sus visitas; solo se limita al teléfono. ¿Es la regla deseada? ([S-PAC-11](06_pantallas_pacientes.md#p-pac--s-pac-11--editar-paciente))
2. Membresías: el perfil no muestra membresías (solo aparecen en el paso de cobertura del registro de llegada «Membresía activa: {plan} (desde {since})» y se trasladan al fusionar). ¿Se espera una sección de membresías en el perfil?
3. Estado «Inactivo»: existe en los datos y en los chips, pero no hay petición ni interfaz para inactivar o reactivar un paciente. ¿Cómo llega un paciente a Inactivo?
4. No hay forma de corregir la fecha de nacimiento ni de añadir referencias después del alta. ¿Es intencional?
5. Las rutas de documentos del paciente y de la visita ([S-PAC-19](06_pantallas_pacientes.md#p-pac--s-pac-19--documentos-pagina-del-paciente), [S-PAC-20](06_pantallas_pacientes.md#p-pac--s-pac-20--documentos-de-la-visita)) no tienen enlace en la app; la página de visita no tiene sección de documentos. ¿Deben enlazarse o integrarse?
6. ¿Debe el Proveedor poder asignar código en una sede? El botón se le muestra pero el servidor exige `CreatePatient`. ([S-PAC-06](06_pantallas_pacientes.md#p-pac--s-pac-06--pestana-resumen))
7. ¿Debe Enfermería ver la pestaña «Saldos»? `docs/06` marca «View charges» como ◐ y el comentario de `ViewCharges` en `backend/src/shared/rbac.rs` lo limita a «read-only totals for the current encounter» (totales de la visita actual), y el servidor responde `totals_only`. ([S-PAC-10](06_pantallas_pacientes.md#p-pac--s-pac-10--pestana-saldos))
8. **Resuelta.** La cola de subidas (con nombres de archivo) se vacía en cada cierre de sesión, también el automático por inactividad, y se borran las copias locales de los archivos. ([S-PAC-16](06_pantallas_pacientes.md#p-pac--s-pac-16--subidas-cola-de-subida))
9. Cancelar el formulario «Nuevo paciente» con cambios probablemente muestra dos confirmaciones seguidas; verificar en dispositivo. ([S-PAC-02](06_pantallas_pacientes.md#p-pac--s-pac-02--nuevo-paciente))
10. La búsqueda es exacta y sensible a tildes (índice ciego). ¿Se necesita búsqueda parcial, sin tildes o fonética para Recepción? ([S-PAC-01](06_pantallas_pacientes.md#p-pac--s-pac-01--pacientes-busqueda))
11. Fusión: por defecto el paciente desde el que se pulsa «Fusionar con…» es el duplicado; confirmar que es la dirección que esperan los administradores. ([S-PAC-13](06_pantallas_pacientes.md#p-pac--s-pac-13--fusionar-pacientes))
12. El texto introductorio de la fusión menciona solo códigos, visitas y saldos, aunque el servidor también mueve citas, documentos, referencias y membresías y deja en el duplicado los códigos de sedes donde el principal ya tiene código. ¿Ajustar el texto?
13. Ver y descargar documentos no pasa por el registro de exportación del cliente (queda como `document.download` en el servidor). Confirmar que es la política deseada. ([S-PAC-21](06_pantallas_pacientes.md#p-pac--s-pac-21--registro-de-exportacion-previo-auditoria-antes-de-imprimir--descargar--compartir))
14. El motivo de eliminación de un documento es obligatorio pero no se guarda (solo `has_reason`). ¿Debe quedar trazable? ([S-PAC-18](06_pantallas_pacientes.md#p-pac--s-pac-18--eliminar-documento))
15. Los tipos de archivo permitidos son configurables (`documents.allowed_mime_types`) pero los textos «JPEG, PNG, WebP, HEIC o PDF» están fijos en la interfaz; ¿deben ser dinámicos? ([S-PAC-15](06_pantallas_pacientes.md#p-pac--s-pac-15--categoria-del-documento-subir))
16. **Resuelta (cierre HIPAA):** limpieza de las copias locales en Android. Compartir un recibo ya no vacía `cache/file_picker/` (las copias de la cola se conservan), y el cierre de sesión borra también las fotos de una subida cortada por un cierre forzado ([S-PAC-16](06_pantallas_pacientes.md#p-pac--s-pac-16--subidas-cola-de-subida)).
