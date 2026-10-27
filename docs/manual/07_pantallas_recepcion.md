# <a id="p-rec--07--pantallas-de-recepcion-panel-citas-y-registro-de-llegada-s-rec"></a>07 — Pantallas de recepción: Panel, Citas y Registro de llegada (S-REC)

Este capítulo describe las pantallas del mostrador y de la operación diaria de la sede: el **Panel** (tablero en vivo de la sede, punto de inicio de los cuatro roles), la **agenda de Citas** con su detalle, formulario, reprogramación, cancelación y no presentado, el **selector de pacientes** que comparte con el módulo de Pacientes, y el **asistente de Registro de llegada** (check-in de una cita y visita sin cita) con sus pasos de identidad, sede, ruta, cobertura, datos del pagador y confirmación. Recepción y Administración tienen acceso completo; el Proveedor gestiona solo sus propias citas y nunca registra llegadas; Enfermería solo usa el Panel. Todas las fechas y horas se muestran en la zona horaria de la sede activa, nunca la del dispositivo. Los textos entre «…» son etiquetas reales de la interfaz y los ejemplos (códigos `LAN-A-000045`, `LAN-E-000210`, nombres) son ficticios.

## <a id="p-rec--como-leer-cada-ficha"></a>Cómo leer cada ficha

- **Acceso por rol**: «Completo», «Limitado» (ve una parte o solo algunas acciones), «Sin acceso» (menú oculto o ruta redirigida al Panel; el servidor también lo rechaza).
- **PHI**: «Sí» = dato del paciente protegido (nombre, fecha de nacimiento, teléfono, notas de cita, motivo de cancelación, datos del seguro); se cifra en el servidor y su lectura se audita.
- Códigos humanos: paciente `LAN-P-NNNNNN`, cita `LAN-A-NNNNNN`, visita `LAN-E-NNNNNN`; en listas se ve la forma corta sin sede (`P-000123`) y mantener pulsado copia el código completo.
- Las pantallas comunes (estados de carga y error, descarte de cambios, confirmación genérica) están en [05 — Pantallas generales](05_pantallas_generales.md); el alta de paciente en [06 — Pantallas de pacientes](06_pantallas_pacientes.md).

## <a id="p-rec--matriz-rapida-del-modulo"></a>Matriz rápida del módulo

| Capacidad | Administrador | Recepción | Enfermería / asistente médico | Proveedor |
| --- | --- | --- | --- | --- |
| Panel (cola en vivo de la sede) | Sí, filtro «Todos los abiertos» | Sí, filtro «Todos los abiertos» | Sí, filtro «Enfermería» | Sí, filtro «Proveedor» + «Mis pacientes» |
| Agenda de citas | Sí | Sí | No | Sí (ve todas, gestiona las suyas) |
| Crear / editar / reprogramar / cancelar / no presentado | Sí | Sí | No | Solo sus citas |
| Confirmar cita | Sí | Sí | No | Solo sus citas |
| Registrar llegada y Visita sin cita | Sí | Sí | No | No |
| Crear paciente desde el selector | Sí | Sí | No | No |

## <a id="p-rec--indice-de-pantallas"></a>Índice de pantallas

| Id | Pantalla | Ruta / ubicación | Tipo |
| --- | --- | --- | --- |
| [S-REC-01](07_pantallas_recepcion.md#p-rec--s-rec-01--panel-tablero-operativo-de-la-sede) | Panel (tablero operativo de la sede) | `/app/<código>/dashboard` | Página |
| [S-REC-02](07_pantallas_recepcion.md#p-rec--s-rec-02--tarjetas-de-metricas-del-panel) | Tarjetas de métricas del Panel | Panel | Panel |
| [S-REC-03](07_pantallas_recepcion.md#p-rec--s-rec-03--barra-de-filtros-del-panel-estacion-y-proveedor) | Barra de filtros del Panel (estación y proveedor) | Panel | Panel |
| [S-REC-04](07_pantallas_recepcion.md#p-rec--s-rec-04--lista-en-vivo-cola-de-la-sede) | Lista en vivo (cola de la sede) | Panel | Panel |
| [S-REC-05](07_pantallas_recepcion.md#p-rec--s-rec-05--indicador-de-conexion-del-panel) | Indicador de conexión del Panel | Panel | Aviso |
| [S-REC-06](07_pantallas_recepcion.md#p-rec--s-rec-06--citas-agenda-del-dia-de-la-sede) | Citas (agenda del día de la sede) | `/app/<código>/appointments` | Página |
| [S-REC-07](07_pantallas_recepcion.md#p-rec--s-rec-07--vista-dia-de-la-agenda-y-tarjeta-de-cita) | Vista Día de la agenda y tarjeta de cita | Citas | Panel |
| [S-REC-08](07_pantallas_recepcion.md#p-rec--s-rec-08--vista-lista-de-la-agenda) | Vista Lista de la agenda | Citas | Panel |
| [S-REC-09](07_pantallas_recepcion.md#p-rec--s-rec-09--detalle-de-cita-cita) | Detalle de cita («Cita») | Diálogo / hoja inferior | Diálogo |
| [S-REC-10](07_pantallas_recepcion.md#p-rec--s-rec-10--formulario-nueva-cita--editar-cita) | Formulario «Nueva cita» / «Editar cita» | Diálogo / pantalla completa | Diálogo |
| [S-REC-11](07_pantallas_recepcion.md#p-rec--s-rec-11--aviso-guardada-con-una-advertencia-solapamiento-de-proveedor) | Aviso «Guardada con una advertencia» | Dentro del formulario | Banner |
| [S-REC-12](07_pantallas_recepcion.md#p-rec--s-rec-12--elegir-paciente-selector-de-paciente) | Elegir paciente (selector de paciente) | Diálogo / pantalla completa | Diálogo |
| [S-REC-13](07_pantallas_recepcion.md#p-rec--s-rec-13--reprogramar-cita) | Reprogramar cita | Diálogo | Diálogo |
| [S-REC-14](07_pantallas_recepcion.md#p-rec--s-rec-14--cancelar-esta-cita) | ¿Cancelar esta cita? | Diálogo | Diálogo |
| [S-REC-15](07_pantallas_recepcion.md#p-rec--s-rec-15--marcar-como-no-presentado) | ¿Marcar como no presentado? | Diálogo | Diálogo |
| [S-REC-16](07_pantallas_recepcion.md#p-rec--s-rec-16--actualizada-por-otro-usuario-conflicto-de-version) | Actualizada por otro usuario (conflicto de versión) | Diálogo | Diálogo |
| [S-REC-17](07_pantallas_recepcion.md#p-rec--s-rec-17--descartar-cambios-sin-guardar) | ¿Descartar cambios sin guardar? | Diálogo | Diálogo |
| [S-REC-18](07_pantallas_recepcion.md#p-rec--s-rec-18--registro-de-llegada-check-in-de-una-cita) | Registro de llegada (check-in de una cita) | `/app/<código>/checkin/<cita>` | Página |
| [S-REC-19](07_pantallas_recepcion.md#p-rec--s-rec-19--visita-sin-cita-walk-in) | Visita sin cita (walk-in) | `/app/<código>/checkin/walk-in` | Página |
| [S-REC-20](07_pantallas_recepcion.md#p-rec--s-rec-20--asistente-de-llegada-marco-comun) | Asistente de llegada (marco común) | Registro de llegada / Visita sin cita | Panel |
| [S-REC-21](07_pantallas_recepcion.md#p-rec--s-rec-21--paso-paciente-verificar-identidad) | Paso «Paciente» (verificar identidad) | Asistente, paso 1 | Panel |
| [S-REC-22](07_pantallas_recepcion.md#p-rec--s-rec-22--paso-sede-confirmar-sede-de-la-visita) | Paso «Sede» (confirmar sede de la visita) | Asistente, paso 2 | Panel |
| [S-REC-23](07_pantallas_recepcion.md#p-rec--s-rec-23--paso-ruta-ruta-de-atencion-y-tipo) | Paso «Ruta» (ruta de atención y tipo) | Asistente, paso 3 | Panel |
| [S-REC-24](07_pantallas_recepcion.md#p-rec--s-rec-24--paso-cobertura-tipo-de-pagador) | Paso «Cobertura» (tipo de pagador) | Asistente, paso 4 | Panel |
| [S-REC-25](07_pantallas_recepcion.md#p-rec--s-rec-25--paso-datos-del-pagador-seguro-o-membresia) | Paso «Datos del pagador» (seguro o membresía) | Asistente, paso 5 | Panel |
| [S-REC-26](07_pantallas_recepcion.md#p-rec--s-rec-26--paso-confirmar-revisar-y-confirmar) | Paso «Confirmar» (Revisar y confirmar) | Asistente, último paso | Panel |
| [S-REC-27](07_pantallas_recepcion.md#p-rec--s-rec-27--llegada-registrada-vista-de-exito) | Llegada registrada (vista de éxito) | Asistente | Panel |

---

### <a id="p-rec--s-rec-01--panel-tablero-operativo-de-la-sede"></a>S-REC-01 Panel (tablero operativo de la sede)

**Ruta:** `/app/<código-sede>/dashboard` (por ejemplo `/app/LAN/dashboard`); `/app/<código>` sin sub-ruta redirige aquí · **Tipo:** página

**Propósito**

Vista operativa en tiempo real de la sede activa: contadores del día, filtros por estación y proveedor, y la cola de visitas abiertas más las cerradas hoy. Es el punto de partida de cada rol para saber a quién atender y abrir su visita.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Filtro inicial «Todos los abiertos» + «Todos los proveedores». |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Completo (lectura) | Filtro inicial chip «Enfermería». |
| Proveedor | Completo (lectura) | Filtro inicial chip «Proveedor» + «Mis pacientes». |

Todos tienen `viewQueue`: guarda de ruta, ítem de menú visible y el servidor (`EncounterService/ListQueue` y `GetDashboardSummary`) exige `ViewQueue` en la sede. La sede de la URL debe ser una de las asignadas; si no, redirige a la sede activa o a `/select-location`. La única diferencia por rol es el filtro por defecto y la opción «Mis pacientes» (solo rol Proveedor).

**Cómo se llega**

Primer ítem del menú: «Panel» (icono de tablero). Es el inicio: destino tras iniciar sesión, tras elegir sede, tras cambiar de sede, cuando una ruta no está permitida para el rol y desde el botón atrás de la pantalla de visita.

**Distribución**

- Marco global ([S-GEN-12](05_pantallas_generales.md#p-gen--s-gen-12--marco-de-la-aplicacion-y-navegacion-principal)): cabecera con selector de sede, indicador global de conexión, Buscar, notificaciones y cuenta; debajo, banner de configuración incompleta (solo Administrador) o de modo degradado.
- Encabezado de página: título «Panel»; subtítulo « · N citas hoy» («Sin citas hoy» / «1 cita hoy» / «{n} citas hoy»; cuenta las citas del día excepto Canceladas y No se presentó).
- Acciones a la derecha del título: indicador de conexión del Panel ([S-REC-05](07_pantallas_recepcion.md#p-rec--s-rec-05--indicador-de-conexion-del-panel)) y botón de icono de recarga (tooltip «Actualizar»).
- Franja o cuadrícula de tarjetas de métricas ([S-REC-02](07_pantallas_recepcion.md#p-rec--s-rec-02--tarjetas-de-metricas-del-panel)).
- Barra de filtros: chips de estación + menú de proveedor ([S-REC-03](07_pantallas_recepcion.md#p-rec--s-rec-03--barra-de-filtros-del-panel-estacion-y-proveedor)).
- Lista en vivo de la cola ocupando el resto de la altura ([S-REC-04](07_pantallas_recepcion.md#p-rec--s-rec-04--lista-en-vivo-cola-de-la-sede)): tabla en pantallas medianas y grandes, tarjetas en teléfono.

**Campos**

Sin campos de entrada; pantalla de solo lectura. Los únicos controles son los filtros ([S-REC-02](07_pantallas_recepcion.md#p-rec--s-rec-02--tarjetas-de-metricas-del-panel), [S-REC-03](07_pantallas_recepcion.md#p-rec--s-rec-03--barra-de-filtros-del-panel-estacion-y-proveedor)).

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Actualizar» (icono) | Todos | Vuelve a pedir `EncounterService/GetDashboardSummary`, `EncounterService/ListQueue` (con cerradas, día = hoy local) y `AppointmentService/ListAppointments` (todas las páginas del día). | No | Barra de progreso fina sobre la lista; nunca deja la pantalla en blanco. |
| Tocar una fila (tabla) o tarjeta (teléfono) | Todos | — | No | `/app/<código>/encounters/<id>` ([S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita)). |

**Estados y mensajes**

- Carga inicial: las tarjetas muestran «–» en lugar del número; la lista muestra un spinner centrado.
- Recarga en segundo plano (tiempo real o botón): datos visibles + barra de 2 px sobre la lista; se conserva el scroll.
- Error de la cola sin datos previos: icono de error, «Algo salió mal», mensaje traducido y «Reintentar».
- Error de la cola con datos previos: banner rojo compacto sobre la lista con el mensaje y «Reintentar».
- Error del resumen (`GetDashboardSummary`): las tarjetas se quedan en «–» sin ningún mensaje.
- `setup_incomplete` en cualquiera de las dos lecturas: se informa al banner global «La configuración del sistema está incompleta. Solo Administración → Configuración está disponible hasta terminarla.» (solo lo ven administradores).
- Sin sede activa: resumen y lista vacíos.
- Lista vacía por filtros: ver [S-REC-04](07_pantallas_recepcion.md#p-rec--s-rec-04--lista-en-vivo-cola-de-la-sede).
- Conexión en tiempo real caída o mensajería degradada: indicador en ámbar ([S-REC-05](07_pantallas_recepcion.md#p-rec--s-rec-05--indicador-de-conexion-del-panel)) y refresco automático cada 30 s; banner global «Las actualizaciones en vivo están demoradas: las pantallas se actualizan solas cada 30 segundos.» cuando el servidor informa degradación.

**Tiempo real**

Recarga completa (resumen + cola + citas del día) al recibir, para la sede activa, cualquiera de: `encounter.created.v1`, `encounter.state_changed.v1`, `encounter.provider_assigned.v1`, `vitals.changed.v1`, `order.created.v1`, `order.changed.v1`, `billing.changed.v1`, `receipt.generated.v1`, `appointment.changed.v1`. Las ráfagas se agrupan en una sola recarga cada 500 ms; los eventos de otra sede se ignoran; al (re)conectar el socket recarga de inmediato. Con el socket desconectado o la mensajería degradada se repite cada 30 s. Los mensajes solo traen identificadores; los datos se releen por gRPC. El «Tiempo de espera» de cada fila se redibuja localmente cada 30 s sin recargar la página.

**Reglas de negocio**

- «Hoy» es el día calendario en la zona horaria de la sede activa, nunca la del dispositivo.
- La cola contiene las visitas abiertas de la sede (de cualquier día) más las visitas cerradas cuyo registro de llegada fue hoy.
- Los contadores los calcula el servidor para el día local de la sede; son orientativos, no totales de negocio (esos están en Reportes, [S-CAJ-18](09_pantallas_caja.md#p-caj--s-caj-18--reportes-de-la-sede-activa)).
- Filtro inicial según la unión de roles: con Administrador o Recepción → «Todos los abiertos» + «Todos los proveedores»; si no, con Proveedor → chip «Proveedor» + «Mis pacientes»; si no, con Enfermería → chip «Enfermería».
- El filtro dura toda la sesión (no se pierde al navegar y volver) y se reinicia al cambiar de usuario.
- Todas las filas son tocables para todos los roles; lo que cada rol puede hacer dentro de la visita lo decide la pantalla de visita y el servidor.
- Lectura de PHI auditada en el servidor (`ListQueue` registra `encounter.list` con pacientes y filtros).

**Notas para el rediseño**

- Preservar el filtro por defecto por rol, el cálculo de «hoy» en la zona de la sede, la recarga sin parpadeo (los datos previos permanecen y el scroll se conserva), los estados con icono + texto y el botón manual «Actualizar».
- Preservar que el Panel sea el destino por defecto de la app para todos los roles.
- En el Panel conviven dos indicadores de conexión (el global y el propio, [S-REC-05](07_pantallas_recepcion.md#p-rec--s-rec-05--indicador-de-conexion-del-panel)) con textos distintos («Reconectando…» frente a «Reconectando — los datos pueden estar desactualizados»).
- Un fallo de `GetDashboardSummary` deja las tarjetas en «–» sin aviso ni reintento; solo la lista muestra el error.
- El servidor devuelve las visitas sin cita de hoy y la app las recibe, pero no hay tarjeta que las muestre (el comentario del código habla de once tarjetas y se dibujan nueve).
- El subtítulo de citas del día es la única pista de agenda en el Panel; no hay acceso directo a «Nueva cita» ni a «Sin cita».

**Código fuente:** `features/dashboard/presentation/dashboard_page.dart`, `features/dashboard/application/dashboard_providers.dart`, `dashboard_filter_controller.dart`, `features/dashboard/domain/dashboard_filter.dart`, `dashboard_metrics.dart`, `local_day.dart`, `features/dashboard/infrastructure/dashboard_gateway.dart`, `features/dashboard/dashboard_realtime.dart`, `application/dashboard_realtime_coordinator.dart`, `application/realtime_debouncer.dart`, `core/routing/app_router.dart`, `core/routing/routes.dart`, `core/navigation/nav_items.dart`, `core/widgets/async_view.dart`, `core/widgets/page_scaffold.dart`.

---

### <a id="p-rec--s-rec-02--tarjetas-de-metricas-del-panel"></a>S-REC-02 Tarjetas de métricas del Panel

**Ruta:** parte de `/app/<código>/dashboard` · **Tipo:** panel

**Propósito**

Mostrar los contadores del día de la sede y servir de atajo para filtrar la lista por estación.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Mismo contenido para todos. |
| Recepción | Completo | — |
| Enfermería / asistente médico | Completo | — |
| Proveedor | Completo | — |

**Cómo se llega**

Bloque superior del Panel.

**Distribución**

- Nueve tarjetas, en este orden: «Pacientes hoy» (icono de personas), «En espera» (reloj de arena), «Con enfermería» (monitor cardíaco), «Esperando al proveedor» (reloj de arena invertido), «Con el proveedor» (maletín médico), «Procedimiento pendiente» (vacuna), «Listo para cobro» (punto de venta), «En cobro» (pagos), «Completados hoy» (check).
- Cada tarjeta: icono a la izquierda, número grande (cifras tabulares) y etiqueta de una línea (con elipsis).
- Teléfono (< 600 px): franja horizontal desplazable de tarjetas de 150 px para que la cola siga visible.
- Tableta (600–1024 px): cuadrícula de 3 columnas. Pantalla ancha (> 1024 px): cuadrícula de 5 columnas.
- Tarjeta seleccionada: fondo del contenedor primario y texto a juego.

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Tocar una tarjeta (todas menos «Pacientes hoy») | Todos | Filtra la lista por ese grupo de estados (sin nueva petición). | No | Lista filtrada; tocar de nuevo la tarjeta seleccionada vuelve a «Todos los abiertos». |

«Pacientes hoy» no es tocable.

**Estados y mensajes**

- Cargando: el número se muestra como «–».
- Seleccionada / no seleccionada (se anuncia como botón seleccionado para lectores de pantalla).

**Tiempo real**

Los números se actualizan con cada recarga del Panel ([S-REC-01](07_pantallas_recepcion.md#p-rec--s-rec-01--panel-tablero-operativo-de-la-sede)).

**Reglas de negocio**

| Tarjeta | Qué cuenta |
| --- | --- |
| «Pacientes hoy» | Pacientes distintos con registro de llegada hoy. |
| «En espera» | Visitas abiertas (de cualquier día) en Registrado o Esperando enfermería (una sola estación de recepción). |
| «Con enfermería» | Con enfermería. |
| «Esperando al proveedor» | Esperando proveedor. |
| «Con el proveedor» | Con proveedor. |
| «Procedimiento pendiente» | Procedimiento pendiente. |
| «Listo para cobro» | Listo para caja. |
| «En cobro» | En caja. |
| «Completados hoy» | Visitas completadas cuya finalización fue hoy (hora local de la sede). |

**Notas para el rediseño**

- Preservar la interacción tarjeta = filtro con alternancia y su estado seleccionado accesible.
- Vocabulario inconsistente: tarjetas «Listo para cobro» / «En cobro» frente al chip de estación «Listo para caja» / «En caja» y al menú «Caja»; «Esperando al proveedor» frente a «Esperando proveedor»; «Con el proveedor» frente a «Con proveedor».
- Al seleccionar una tarjeta cuyo grupo no es un chip (por ejemplo «Con enfermería»), ningún chip de [S-REC-03](07_pantallas_recepcion.md#p-rec--s-rec-03--barra-de-filtros-del-panel-estacion-y-proveedor) queda marcado: el usuario no ve en la barra qué filtro está activo.
- «En espera» incluye visitas abiertas de días anteriores, a diferencia de «Pacientes hoy» y «Completados hoy»; conviene explicitarlo.

**Código fuente:** `features/dashboard/presentation/widgets/metric_cards.dart`, `features/dashboard/domain/dashboard_metrics.dart`, `features/dashboard/presentation/dashboard_labels.dart`, `core/widgets/breakpoints.dart`.

---

### <a id="p-rec--s-rec-03--barra-de-filtros-del-panel-estacion-y-proveedor"></a>S-REC-03 Barra de filtros del Panel (estación y proveedor)

**Ruta:** parte de `/app/<código>/dashboard` · **Tipo:** panel

**Propósito**

Acotar la lista en vivo por estación de trabajo y por proveedor asignado.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Sin «Mis pacientes» salvo que también tenga el rol Proveedor. |
| Recepción | Completo | Sin «Mis pacientes». |
| Enfermería / asistente médico | Completo | Sin «Mis pacientes». |
| Proveedor | Completo | Con «Mis pacientes». |

La lista de proveedores viene de `UserService/ListProviders` (permitido a cualquier rol asignado a la sede).

**Cómo se llega**

Debajo de las tarjetas del Panel.

**Distribución**

- Izquierda: fila desplazable de chips de selección única: «Todos los abiertos», «Enfermería», «Proveedor», «En espera», «Cobro», «Completados hoy».
- Derecha: chip con icono de persona, etiqueta del filtro de proveedor actual y flecha desplegable (tooltip «Proveedor»); abre un menú con marcas de verificación.

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| Chip de estación | Selección única | Sí (siempre uno) | «Todos los abiertos» = 8 estados abiertos; «Enfermería» = Registrado, Esperando enfermería, Con enfermería, Procedimiento pendiente; «Proveedor» = Esperando proveedor, Con proveedor, Procedimiento pendiente; «En espera» = Registrado, Esperando enfermería; «Cobro» = Listo para caja, En caja; «Completados hoy» = completadas hoy | No |
| Menú de proveedor | Selección única | Sí | «Todos los proveedores»; «Mis pacientes» (solo rol Proveedor: visitas asignadas al usuario); «Sin asignar»; separador; cada proveedor activo de la sede excepto el propio usuario, en orden alfabético. Si el proveedor elegido ya no está en el directorio, la etiqueta muestra «Asignado» | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Tocar un chip | Todos | Cambia el grupo de estados (filtrado en el cliente, sin petición). | No | Lista filtrada. |
| Elegir una opción del menú de proveedor | Todos | Cambia el alcance de proveedor (filtrado en el cliente). | No | Lista filtrada. |

**Estados y mensajes**

- Chip activo resaltado; opción activa del menú con marca de verificación.
- Directorio de proveedores cargando o con error: el menú solo muestra las opciones fijas.

**Tiempo real**

El directorio de proveedores se relee en cada reconexión del socket; los filtros se aplican sobre la cola recargada en tiempo real.

**Reglas de negocio**

- Los dos filtros se combinan (estación **y** proveedor).
- Orden de la lista: llegada más antigua primero (mayor espera); con «Completados hoy», finalización más reciente primero.
- Las visitas cerradas como Se retiró o Cancelada que llegan en la cola no aparecen en ningún filtro.

**Notas para el rediseño**

- Preservar los filtros predefinidos por estación y su correspondencia con el filtro por defecto de cada rol.
- Ambigüedad: el chip de estación «Proveedor» y el menú de proveedor (tooltip «Proveedor») usan la misma palabra para conceptos distintos.
- Inconsistencia con Citas: allí «Mis citas» se ofrece a cualquier rol; aquí «Mis pacientes» solo al rol Proveedor.
- El usuario actual nunca aparece por nombre en el menú (solo vía «Mis pacientes» si es proveedor).

**Código fuente:** `features/dashboard/presentation/widgets/dashboard_filter_bar.dart`, `features/dashboard/domain/dashboard_filter.dart`, `features/dashboard/application/dashboard_filter_controller.dart`, `core/staff/provider_directory.dart`.

---

### <a id="p-rec--s-rec-04--lista-en-vivo-cola-de-la-sede"></a>S-REC-04 Lista en vivo (cola de la sede)

**Ruta:** parte de `/app/<código>/dashboard` · **Tipo:** panel

**Propósito**

Listar quién está en la clínica, desde cuándo, en qué estación, con qué proveedor y tipo de cita, y abrir su visita.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Completo | — |
| Enfermería / asistente médico | Completo | — |
| Proveedor | Completo | — |

El nombre del paciente solo viaja si quien llama tiene `SearchPatient` (los cuatro roles lo tienen); sin él se mostraría solo el código.

**Cómo se llega**

Cuerpo principal del Panel.

**Distribución**

- Tableta y escritorio: tabla con columnas «Paciente», «Llegada», «Tiempo de espera», «Estación actual», «Proveedor», «Tipo de cita»; filas tocables.
- Teléfono: tarjetas; fila 1 nombre y código del paciente + chip de estación; fila 2 icono de entrada + hora de llegada, icono de temporizador + tiempo de espera, insignia de ruta; fila 3 (texto pequeño) icono de proveedor + proveedor, icono de nota + tipo de cita.
- Celda «Paciente»: nombre en formato Título y debajo el código corto en monoespaciado (por ejemplo `P-000123`); mantener pulsado copia el completo (`LAN-P-000123`).
- Celda «Llegada»: hora local de la sede del registro de llegada.
- Celda «Tiempo de espera»: «12 min» o «1 h 05 min» (lector de pantalla: «Esperando {tiempo}»); «—» si no hay hora de llegada.
- Celda «Estación actual»: chip con icono + texto del estado y, al lado, insignia con borde con la ruta («Estándar», «Solo inyección», «Solo laboratorio», «Solo procedimiento»).
- Celda «Proveedor»: «Sin asignar» (atenuado), nombre del proveedor, nombre del usuario actual o «Asignado» si no se puede resolver.
- Celda «Tipo de cita»: nombre del catálogo en el idioma de la interfaz (incluye tipos inactivos) o «Sin cita» cuando la visita no tiene tipo.

**Campos**

Sin campos (PHI visible: nombre y código del paciente).

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Tocar fila o tarjeta | Todos | — | No | Pantalla de la visita (`/app/<código>/encounters/<id>`, [S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita)). |
| «Restablecer filtros» (estado vacío) | Todos | Vuelve al filtro por defecto del rol (no necesariamente a «Todos»). | No | Lista con el filtro por defecto. |

**Estados y mensajes**

- Vacío: icono de asiento, «No hay pacientes en esta vista», «Nada coincide con los filtros actuales.» y botón «Restablecer filtros».
- Colores del chip de estación: ámbar / advertencia = «Registrado», «Esperando enfermería», «Esperando proveedor»; azul / información = «Con enfermería», «Con proveedor», «Procedimiento pendiente»; verde / éxito = «Listo para caja», «En caja», «Completada»; gris / neutro = otros («Se retiró», «Cancelada», «Desconocido»).
- Carga, error y recarga: heredados de [S-REC-01](07_pantallas_recepcion.md#p-rec--s-rec-01--panel-tablero-operativo-de-la-sede).

**Tiempo real**

Se recarga con el Panel; cada fila tiene su propio temporizador de 30 s para el tiempo de espera (solo se redibuja ese texto).

**Reglas de negocio**

- El tiempo de espera se mide desde la hora de llegada (reloj del servidor) hasta ahora: es el tiempo total desde la llegada, no el tiempo en la estación actual.
- Orden: mayor espera primero; en «Completados hoy», la finalización más reciente primero.
- En la cola no se muestra fecha de nacimiento ni teléfono (PHI mínima: nombre + código).

**Notas para el rediseño**

- Preservar estado = icono + texto + color, la insignia de ruta, el código corto copiable y que cualquier fila abra la visita.
- Preservar tabla en pantallas anchas y tarjetas en teléfono.
- En «Completados hoy» la columna «Tiempo de espera» sigue contando desde la llegada hasta ahora (no se detiene al completar): engañoso.
- «Sin cita» en «Tipo de cita» solo aparece si la visita no tiene tipo; una visita sin cita a la que se le asignó tipo muestra el nombre del tipo.
- «Restablecer filtros» no hace nada visible si el usuario ya está en su filtro por defecto (por ejemplo, un proveedor sin pacientes propios).
- Posible discrepancia: la tarjeta «Completados hoy» cuenta finalizaciones de hoy, pero la lista solo trae cerradas con llegada hoy (ver preguntas abiertas).

**Código fuente:** `features/dashboard/presentation/widgets/queue_list.dart`, `widgets/queue_cells.dart`, `widgets/waiting_time_text.dart`, `features/dashboard/presentation/dashboard_labels.dart`, `features/patients/presentation/patient_labels.dart`, `core/widgets/responsive_table_or_cards.dart`, `human_code_text.dart`, `status_chip.dart`, `empty_view.dart`.

---

### <a id="p-rec--s-rec-05--indicador-de-conexion-del-panel"></a>S-REC-05 Indicador de conexión del Panel

**Ruta:** acciones del encabezado de `/app/<código>/dashboard` · **Tipo:** aviso

**Propósito**

Avisar si los datos del Panel llegan en vivo o pueden estar desactualizados.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Informativo. |
| Recepción | Completo | — |
| Enfermería / asistente médico | Completo | — |
| Proveedor | Completo | — |

**Cómo se llega**

Junto al botón «Actualizar» del Panel.

**Distribución**

- Chip de estado (icono + texto) en el encabezado de la página.

**Campos**

Sin campos.

**Acciones**

Ninguna (informativo).

**Estados y mensajes**

| Estado | Texto | Tono / icono |
| --- | --- | --- |
| Conectado | «En vivo» | Verde, rayo |
| Conectando | «Reconectando — los datos pueden estar desactualizados» | Ámbar, sincronizar |
| Desconectado | «Sin conexión — los datos pueden estar desactualizados» | Ámbar, nube tachada |

En la cabecera global existe otro indicador ([S-GEN-14](05_pantallas_generales.md#p-gen--s-gen-14--indicador-de-actualizaciones-en-vivo)): «En vivo» (color primario), «Reconectando…» (terciario), «Sin conexión» (rojo); en teléfono, solo icono con tooltip.

**Tiempo real**

Refleja el estado del WebSocket compartido. Mientras no está conectado, la app refresca las pantallas cada 30 s.

**Reglas de negocio**

- Estar «Sin conexión» no bloquea la pantalla: los datos visibles se mantienen y se intenta reconectar.

**Notas para el rediseño**

- Unificar con el indicador global (hoy se duplica en el Panel con textos y colores distintos: en el Panel «Sin conexión» es ámbar, en la cabecera es rojo).
- El texto largo se recorta con elipsis en espacios estrechos.

**Código fuente:** `features/dashboard/presentation/widgets/live_indicator.dart`, `core/routing/shell_screen.dart`, `core/degraded/degraded_mode.dart`.

---

### <a id="p-rec--s-rec-06--citas-agenda-del-dia-de-la-sede"></a>S-REC-06 Citas (agenda del día de la sede)

**Ruta:** `/app/<código-sede>/appointments?date=AAAA-MM-DD` (sin `date` o con fecha inválida = hoy en la zona de la sede) · **Tipo:** página

**Propósito**

Ver y gestionar las citas de un día de la sede activa (vista Día por horas o Lista), crear citas y arrancar visitas sin cita.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | «Nueva cita» y «Sin cita». |
| Recepción | Completo | «Nueva cita» y «Sin cita». |
| Enfermería / asistente médico | Sin acceso | No ve «Citas» en el menú; la guarda (`manageAppointment`) la redirige al Panel. |
| Proveedor | Limitado | Ve todas las citas de la sede pero solo gestiona las asignadas a sí mismo; filtro inicial «Mis citas»; ve «Nueva cita», no «Sin cita» (requiere `checkIn`). |

El servidor (`ListAppointments`) exige estar asignado a la sede y que `x-active-location-id` coincida (`location_denied` / `location_mismatch` → `PERMISSION_DENIED`).

**Cómo se llega**

Menú «Citas» (icono de calendario). También: pestaña Citas del perfil del paciente ([S-PAC-07](06_pantallas_pacientes.md#p-pac--s-pac-07--pestana-citas): una fila abre el día de esa cita en su sede), panel de notificaciones, «Volver a citas» y flecha atrás del Registro de llegada y de Visita sin cita.

**Distribución**

- Encabezado: título «Citas»; subtítulo con la fecha larga del día mostrado.
- Acciones (tableta y escritorio): botón de contorno «Sin cita» (icono de persona caminando) y botón relleno «Nueva cita» (icono +). En teléfono: botón de icono de persona caminando (tooltip «Sin cita») y botón flotante «+» (tooltip «Nueva cita»).
- Barra de herramientas, fila 1: «<» (tooltip «Día anterior»), botón con icono de calendario y la fecha larga (abre el selector de fecha), «>» (tooltip «Día siguiente»), botón «Hoy» (solo si no se está en hoy); conmutador segmentado «Día» / «Lista»; desplegable «Proveedor» (240 px).
- Barra de herramientas, fila 2: chips de estado de selección múltiple «Programada», «Confirmada», «Llegó», «Cancelada», «No se presentó» y, si hay alguno marcado, chip de acción «Quitar filtros» (icono x).
- Cuerpo: vista Día ([S-REC-07](07_pantallas_recepcion.md#p-rec--s-rec-07--vista-dia-de-la-agenda-y-tarjeta-de-cita)) o vista Lista ([S-REC-08](07_pantallas_recepcion.md#p-rec--s-rec-08--vista-lista-de-la-agenda)).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| Fecha (en la URL) | Selector de fecha | Sí (por defecto hoy) | Del 1 de enero de dos años atrás al 31 de diciembre de dos años adelante | No |
| Vista | Segmentado «Día» / «Lista» | Sí | «Día» por defecto; se conserva en la sesión | No |
| «Proveedor» | Desplegable | Sí | «Todos los proveedores» (por defecto, salvo rol Proveedor), «Mis citas» (se ofrece a cualquier usuario), «Sin asignar» y cada proveedor activo de la sede excepto el usuario actual | No |
| Estados | Chips de selección múltiple | No | Cualquier combinación; vacío = todos | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Nueva cita» | Administrador, Recepción, Proveedor | Abre [S-REC-10](07_pantallas_recepcion.md#p-rec--s-rec-10--formulario-nueva-cita--editar-cita) con la fecha del día mostrado precargada. | No | Al guardar: snackbar «Cita {código} creada.» |
| «Sin cita» | Administrador, Recepción | — | No | `/app/<código>/checkin/walk-in` ([S-REC-19](07_pantallas_recepcion.md#p-rec--s-rec-19--visita-sin-cita-walk-in)). |
| Tocar una cita | Administrador, Recepción, Proveedor | — | No | Detalle [S-REC-09](07_pantallas_recepcion.md#p-rec--s-rec-09--detalle-de-cita-cita). |
| «<» / «>» / «Hoy» / selector de fecha | Ídem | Cambia `?date=` en la URL (el historial del navegador funciona). | No | Otro día. |
| «Día» / «Lista» | Ídem | Cambia la vista. | No | — |
| Desplegable «Proveedor» y chips de estado | Ídem | Filtran en el cliente sin nueva petición. | No | — |
| Chip «Quitar filtros» (barra) | Ídem | Borra solo los estados. | No | — |
| «Quitar filtros» (estado vacío filtrado) | Ídem | Borra estados y pone el proveedor en «Todos los proveedores». | No | — |

**Estados y mensajes**

- Cargando: spinner centrado.
- Error: «Algo salió mal» + mensaje + «Reintentar».
- Vacío sin filtros: icono de calendario, «No hay citas», «No hay nada programado para este día.» y botón «Nueva cita» si puede crear.
- Vacío con filtros: «No hay citas», «Ninguna cita coincide con los filtros actuales.» y botón «Quitar filtros».
- Recargando: barra de progreso fina con los datos visibles.
- Chips de estado de cita: «Programada» azul (información), «Confirmada» verde, «Llegó» verde, «Cancelada» gris, «No se presentó» ámbar.

**Tiempo real**

`appointment.changed.v1` de la sede activa invalida la agenda de todos los días y el detalle de esa cita; los eventos de otra sede se ignoran; al reconectar se relee todo; sin socket, refresco cada 30 s. El servidor emite el evento al crear, reprogramar, cancelar, confirmar y registrar la llegada; **no** lo emite al editar (`UpdateAppointment`) ni al marcar no presentado (`MarkNoShow`), así que esos cambios no se ven en vivo en otras pantallas.

**Reglas de negocio**

- Muestra un único día local de la sede; se piden todas las páginas (100 por página) y se ordena por hora de inicio y luego por código.
- Todas las horas se muestran en la zona horaria de la sede.
- Filtro inicial: rol Proveedor (sin Administrador ni Recepción) → «Mis citas»; resto → «Todos los proveedores». Filtro y vista se conservan durante la sesión.
- Estados: Programada → Confirmada → Llegó; Programada o Confirmada → Cancelada o No se presentó; Llegó, Cancelada y No se presentó son finales.
- Los tipos de cita vienen del catálogo del servidor (nunca fijos en la app).
- Lectura auditada en el servidor (lectura de PHI).

**Notas para el rediseño**

- Preservar la fecha en la URL (enlaces desde el perfil del paciente y botón atrás), la zona horaria de la sede y la visibilidad de botones por permiso.
- Preservar que el botón flotante y el botón de icono sustituyan a los botones con texto en teléfono.
- «Mis citas» se ofrece también a Administrador y Recepción (normalmente vacío); en el Panel «Mis pacientes» solo aparece para proveedores.
- El chip «Quitar filtros» de la barra borra solo estados, pero el botón homónimo del estado vacío también reinicia el proveedor.
- El selector de fecha de la agenda abarca ±2 años; el del formulario va de 1 año atrás a 2 adelante y usa el reloj del dispositivo.
- Solo vistas Día y Lista; no hay vista semanal ni mensual. La interfaz de Google Calendar está oculta.

**Código fuente:** `features/appointments/presentation/appointments_page.dart`, `features/appointments/application/appointment_providers.dart`, `features/appointments/domain/agenda_query.dart`, `appointment_actions.dart`, `appointment_display.dart`, `features/appointments/presentation/appointment_labels.dart`, `features/appointments/infrastructure/appointment_gateway.dart`, `features/appointments/appointments_realtime.dart`, `core/staff/provider_directory.dart`.

---

### <a id="p-rec--s-rec-07--vista-dia-de-la-agenda-y-tarjeta-de-cita"></a>S-REC-07 Vista Día de la agenda y tarjeta de cita

**Ruta:** parte de `/app/<código>/appointments` (vista «Día») · **Tipo:** panel

**Propósito**

Ver el día agrupado por hora local, con una tarjeta por cita.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Completo | — |
| Enfermería / asistente médico | Sin acceso | No accede a Citas. |
| Proveedor | Completo (lectura de todas) | Gestiona solo las suyas desde el detalle. |

**Cómo se llega**

Vista por defecto de Citas o conmutador «Día».

**Distribución**

- Una sección por hora con citas: encabezado con la hora local (formato según el idioma, color primario) y una línea divisoria.
- Tableta y escritorio: tarjetas de 320 px una al lado de otra dentro de cada hora. Teléfono: tarjetas a todo el ancho, apiladas.
- Tarjeta: icono de reloj + rango «inicio – fin» (zona de la sede) y duración «N min» a la derecha; código corto del paciente (`P-000123`) + nombre en formato Título (o «Paciente no disponible»); nombre del tipo de cita (catálogo en el idioma de la interfaz; si el tipo está inactivo o no se conoce, el código); icono de maletín + proveedor («Sin proveedor» en cursiva atenuada, «Yo · », nombre o «Proveedor asignado») + chip de estado; código corto de la cita (`A-000045`).
- Relleno inferior de 88 px para que el botón flotante no tape la última tarjeta.

**Campos**

Sin campos (PHI visible: nombre del paciente).

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Tocar una tarjeta | Administrador, Recepción, Proveedor | — | No | [S-REC-09](07_pantallas_recepcion.md#p-rec--s-rec-09--detalle-de-cita-cita). |
| Mantener pulsado un código | Ídem | Copia el código completo (por ejemplo `LAN-A-000045`). | No | Sin aviso. |

**Estados y mensajes**

- Las citas en estado final están pensadas para verse atenuadas.

**Tiempo real**

Igual que [S-REC-06](07_pantallas_recepcion.md#p-rec--s-rec-06--citas-agenda-del-dia-de-la-sede).

**Reglas de negocio**

- La agrupación por hora usa la hora de inicio en la zona de la sede.
- Solo aparecen las horas que tienen citas (no es una cuadrícula de huecos libres).

**Notas para el rediseño**

- Preservar el orden cronológico, la agrupación por hora local y los datos mínimos de la tarjeta (hora, paciente, tipo, proveedor, estado, duración).
- No se representan huecos libres ni solapamientos visuales del mismo proveedor; el solapamiento solo se avisa al guardar ([S-REC-11](07_pantallas_recepcion.md#p-rec--s-rec-11--aviso-guardada-con-una-advertencia-solapamiento-de-proveedor)).
- El atenuado de las citas finales probablemente no alcanza al nombre del paciente (usa un estilo propio): verificar visualmente.
- Los tipos inactivos se muestran como código crudo en la agenda (el Panel sí muestra su nombre).

**Código fuente:** `features/appointments/presentation/agenda_views.dart`, `appointment_card.dart`, `provider_label.dart`, `appointment_labels.dart`.

---

### <a id="p-rec--s-rec-08--vista-lista-de-la-agenda"></a>S-REC-08 Vista Lista de la agenda

**Ruta:** parte de `/app/<código>/appointments` (vista «Lista») · **Tipo:** panel

**Propósito**

Ver las citas del día en formato de tabla.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Completo | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Completo (lectura de todas) | — |

**Cómo se llega**

Conmutador «Lista» en Citas.

**Distribución**

- Tableta y escritorio: tabla con columnas «Hora», «Código» (código corto de la cita), «Paciente» (código + nombre), «Tipo», «Proveedor», «Duración» (a la derecha, «N min»), «Estado» (chip).
- Teléfono: las mismas tarjetas de [S-REC-07](07_pantallas_recepcion.md#p-rec--s-rec-07--vista-dia-de-la-agenda-y-tarjeta-de-cita), sin agrupar por hora.

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Tocar fila o tarjeta | Administrador, Recepción, Proveedor | — | No | [S-REC-09](07_pantallas_recepcion.md#p-rec--s-rec-09--detalle-de-cita-cita). |

**Estados y mensajes**

- Tabla sin filas: «Sin filas» (en la práctica lo cubre el estado vacío de [S-REC-06](07_pantallas_recepcion.md#p-rec--s-rec-06--citas-agenda-del-dia-de-la-sede)).

**Tiempo real**

Igual que [S-REC-06](07_pantallas_recepcion.md#p-rec--s-rec-06--citas-agenda-del-dia-de-la-sede).

**Reglas de negocio**

- Mismo orden y filtros que la vista Día.

**Notas para el rediseño**

- Preservar las columnas y que toda la fila sea tocable; la tabla se desplaza horizontalmente si no cabe.

**Código fuente:** `features/appointments/presentation/agenda_views.dart`, `core/widgets/responsive_table_or_cards.dart`.

---

### <a id="p-rec--s-rec-09--detalle-de-cita-cita"></a>S-REC-09 Detalle de cita («Cita»)

**Ruta:** sin ruta propia: diálogo (máx. 560 px) sobre Citas; en teléfono, hoja inferior arrastrable (abre al 70 %, hasta 95 %) · **Tipo:** diálogo

**Propósito**

Ver todos los datos de una cita y ejecutar las acciones que su estado y el rol permiten.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Todas las acciones permitidas por el estado. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | No accede a Citas. |
| Proveedor | Limitado | Abre cualquier cita de la sede; las acciones de gestión (Editar, Reprogramar, Confirmar, Cancelar cita, Marcar no presentado) solo en citas asignadas a sí mismo; nunca «Registrar llegada». |

Los botones se ocultan según estado × alcance del rol × permiso `checkIn`; el servidor revalida (`ManageAppointment` + alcance de proveedor + sede activa → `PERMISSION_DENIED`).

**Cómo se llega**

Tocando una cita en la vista Día o Lista.

**Distribución**

- Cabecera: título «Cita», mini spinner mientras se relee, chip de estado a la derecha.
- Código completo de la cita (por ejemplo `LAN-A-000045`), copiable con pulsación larga.
- Filas icono + etiqueta + valor: «Paciente» (enlace en color primario: cierra y abre el perfil), «Fecha» (fecha y hora), «Duración» (rango horario · «N min»), «Tipo de cita», «Proveedor», «Notas» (si hay), «Motivo» (motivo de cancelación, si hay).
- Texto pequeño «Creada el {fecha}».
- Notas informativas: «Solo puede gestionar las citas asignadas a usted.» (proveedor ante una cita ajena no final); «Esta cita está cerrada; no hay más acciones disponibles.» (estado final).
- Botonera a la derecha (se ajusta en varias líneas): «Cancelar cita» (texto rojo), «Marcar no presentado», «Editar» (contorno), «Reprogramar» (contorno), «Confirmar» (tonal), «Registrar llegada» (relleno).

**Campos**

Solo lectura. PHI visible: nombre del paciente, notas y motivo de cancelación (cifrados en el servidor).

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Confirmar» | Solo en Programada; Administrador, Recepción o Proveedor dueño | `AppointmentService/ConfirmAppointment(expected_version)`. | **No** | Snackbar «Cita confirmada.» |
| «Marcar no presentado» | Programada o Confirmada; ídem | `AppointmentService/MarkNoShow(expected_version)`. | [S-REC-15](07_pantallas_recepcion.md#p-rec--s-rec-15--marcar-como-no-presentado) | Snackbar «Marcada como no presentado.» |
| «Cancelar cita» | Programada o Confirmada; ídem | Abre [S-REC-14](07_pantallas_recepcion.md#p-rec--s-rec-14--cancelar-esta-cita). | Motivo obligatorio | Snackbar «Cita cancelada.» |
| «Editar» | Programada o Confirmada; ídem | Abre [S-REC-10](07_pantallas_recepcion.md#p-rec--s-rec-10--formulario-nueva-cita--editar-cita) en modo edición. | No | Snackbar «Cita actualizada.» |
| «Reprogramar» | Programada o Confirmada; ídem | Abre [S-REC-13](07_pantallas_recepcion.md#p-rec--s-rec-13--reprogramar-cita). | No | Snackbar «Cita reprogramada.» o «Cita reprogramada. El proveedor ya tiene una cita en ese horario.» |
| «Registrar llegada» | Programada o Confirmada; solo Administrador y Recepción (`checkIn`) | Cierra el detalle. | No | `/app/<código>/checkin/<id>` ([S-REC-18](07_pantallas_recepcion.md#p-rec--s-rec-18--registro-de-llegada-check-in-de-una-cita)). |
| Enlace «Paciente» | Todos los que ven el detalle | Cierra el detalle. | No | `/app/<código>/patients/<id>` ([S-PAC-05](06_pantallas_pacientes.md#p-pac--s-pac-05--perfil-del-paciente)). |

**Estados y mensajes**

- Mientras corren Confirmar o No presentado, todos los botones se deshabilitan.
- Conflicto de versión (`ABORTED`) en Confirmar o No presentado: [S-REC-16](07_pantallas_recepcion.md#p-rec--s-rec-16--actualizada-por-otro-usuario-conflicto-de-version) y luego se relee la cita y la agenda.
- Otros errores: snackbar con el mensaje traducido (por ejemplo «Esta acción no está permitida en el estado actual.», «No tiene permiso para realizar esta acción.», «No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.»).
- El detalle permanece abierto tras Confirmar, No presentado, Cancelar, Editar o Reprogramar y se actualiza con el nuevo estado.

**Tiempo real**

Observa `AppointmentService/GetAppointment` de esa cita; se relee tras cada acción propia y al llegar `appointment.changed.v1` con ese identificador (o en la resincronización).

**Reglas de negocio**

| Estado | Acciones disponibles |
| --- | --- |
| Programada | Editar, Reprogramar, Confirmar, Cancelar cita, Marcar no presentado, Registrar llegada |
| Confirmada | Las mismas menos Confirmar |
| Llegó / Cancelada / No se presentó | Ninguna |

- Toda mutación envía `expected_version` (concurrencia optimista).
- Notas y motivo de cancelación se guardan cifrados y se muestran descifrados aquí.
- `GetAppointment` es una lectura auditada (`appointment.view`).

**Notas para el rediseño**

- Preservar la matriz estado × rol de botones, la confirmación destructiva de Cancelar y No presentado, el motivo obligatorio de cancelación y el manejo de conflicto.
- Preservar hoja inferior en teléfono y diálogo en pantallas anchas.
- Una cita «Llegó» no ofrece enlace a la visita que abrió; hay que ir por el Panel.
- Confirmar no pide confirmación ni deja deshacer; No presentado no tiene restricción de hora en el cliente (puede marcarse antes de la hora de la cita).
- Tras un conflicto dentro de los diálogos de Cancelar o Reprogramar el detalle no se relee explícitamente ([S-REC-16](07_pantallas_recepcion.md#p-rec--s-rec-16--actualizada-por-otro-usuario-conflicto-de-version)).

**Código fuente:** `features/appointments/presentation/appointment_detail_sheet.dart`, `features/appointments/domain/appointment_actions.dart`, `features/appointments/application/appointment_commands.dart`, `features/appointments/infrastructure/appointment_gateway.dart`, `core/widgets/confirm_dialog.dart`.

---

### <a id="p-rec--s-rec-10--formulario-nueva-cita--editar-cita"></a>S-REC-10 Formulario «Nueva cita» / «Editar cita»

**Ruta:** sin ruta propia: diálogo (máx. 640 px) en tableta y escritorio; página completa con barra superior (título y flecha) en teléfono · **Tipo:** diálogo

**Propósito**

Crear una cita para un paciente, o cambiar el tipo, el proveedor, la duración y las notas de una cita existente.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Crear; editar cualquier cita no final. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Limitado | Crear solo para sí mismo (campo Proveedor fijo); editar solo sus citas. |

El botón se oculta sin `manageAppointment` y según el alcance del rol; el servidor exige `ManageAppointment` en la sede, que la sede activa sea la de la cita (`location_mismatch`) y el alcance de proveedor (`provider_scope`).

**Cómo se llega**

«Nueva cita» (botón, botón flotante o botón del estado vacío) en Citas ([S-REC-06](07_pantallas_recepcion.md#p-rec--s-rec-06--citas-agenda-del-dia-de-la-sede)); «Editar» en el detalle ([S-REC-09](07_pantallas_recepcion.md#p-rec--s-rec-09--detalle-de-cita-cita)).

**Distribución**

- Título «Nueva cita» o «Editar cita».
- Banner rojo compacto de error (si lo hay) arriba del formulario.
- Campos en una columna: Paciente; Tipo de cita; Fecha y Hora en la misma fila; (en edición, texto «Use Reprogramar para cambiar la fecha o la hora.»); Duración; Proveedor; Notas.
- Botonera a la derecha: «Cancelar» y «Crear» (alta) o «Guardar» (edición), con spinner mientras guarda.

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| Paciente | Selector (toca para abrir [S-REC-12](07_pantallas_recepcion.md#p-rec--s-rec-12--elegir-paciente-selector-de-paciente); icono de buscar persona) | Sí en alta («Elija un paciente.» tras intentar guardar) | Muestra «LAN-P-000123 · Nombre» (código en la sede activa o el primero conocido). En edición, solo lectura | Sí |
| Tipo de cita | Desplegable | Sí («Elija un tipo de cita.») | Solo tipos activos, en el orden del catálogo, nombre en el idioma de la interfaz. Sin tipos activos: «No hay tipos de cita activos. Pida a un administrador que agregue uno.» en rojo; cargando: barra lineal; error: banner con «Reintentar». Al elegir un tipo se rellena su duración por defecto, salvo que el usuario ya haya escrito una | No |
| Fecha | Selector de fecha (1 de enero del año anterior a 31 de diciembre de dos años adelante) | Sí en alta («Elija una fecha y una hora.») | Precargada con el día de la agenda; deshabilitada en edición | No |
| Hora | Selector de hora (inicial 9:00) | Sí en alta (mismo mensaje) | Hora local de la sede; deshabilitada en edición | No |
| Duración | Número entero, solo dígitos, sufijo «min» | Sí | 5 a 480 («La duración debe estar entre 5 y 480 minutos.») | No |
| Proveedor | Desplegable | No | «Sin proveedor» (por defecto), «Yo · » (siempre listado para el usuario actual) y cada proveedor activo de la sede; ayuda «Cargando…» mientras carga; si la cita tiene un proveedor fuera del directorio aparece con su nombre o «Proveedor asignado». Para el rol Proveedor: campo fijo «Yo · » con ayuda «Solo puede gestionar las citas asignadas a usted.» | No |
| Notas | Texto de 3 líneas, contador | No | Máx. 1000 caracteres (el servidor admite hasta 4000) | Sí (cifradas) |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Crear» | Administrador, Recepción, Proveedor | `AppointmentService/CreateAppointment` (sede activa, paciente, tipo, proveedor, inicio en UTC calculado con la zona de la sede, duración, notas recortadas). | No | Sin advertencias: cierra y la agenda muestra «Cita {código} creada.»; con advertencia: [S-REC-11](07_pantallas_recepcion.md#p-rec--s-rec-11--aviso-guardada-con-una-advertencia-solapamiento-de-proveedor). |
| «Guardar» (edición) | Ídem, según alcance | `AppointmentService/UpdateAppointment` con `expected_version` y solo los campos cambiados. | No | Cierra y snackbar «Cita actualizada.» |
| «Cancelar» | Ídem | Cierra. | [S-REC-17](07_pantallas_recepcion.md#p-rec--s-rec-17--descartar-cambios-sin-guardar) si hay cambios | — |
| Atrás del sistema, Escape o tocar fuera con cambios | Ídem | — | [S-REC-17](07_pantallas_recepcion.md#p-rec--s-rec-17--descartar-cambios-sin-guardar) | — |

**Estados y mensajes**

- Validación en vivo tras la primera interacción; los errores de Paciente, Fecha y Hora aparecen tras intentar guardar.
- Guardando: todos los campos y botones bloqueados; spinner en el botón principal.
- Error del servidor: banner rojo compacto con el mensaje traducido; el formulario queda abierto.
- Conflicto de versión: [S-REC-16](07_pantallas_recepcion.md#p-rec--s-rec-16--actualizada-por-otro-usuario-conflicto-de-version); al pulsar «Actualizar» se releen cita y agenda y el formulario se cierra (se pierden los cambios).
- Cargando tipos o proveedores: indicadores descritos en cada campo.

**Tiempo real**

Ninguno propio; tras guardar invalida la agenda (todos los días) y el detalle.

**Reglas de negocio**

- El servidor exige: sede activa (`location_inactive`), tipo activo (`appointment_type_inactive` / `appointment_type_not_found`), paciente activo (`patient_merged`, `patient_inactive`), proveedor activo con rol Proveedor en la sede (`invalid_provider`), que un proveedor solo se asigne a sí mismo (`provider_scope`), duración 5–480 (`invalid_duration`) y notas ≤ 4000.
- El paciente recibe su código local de la sede (`LAN-P-…`) la primera vez que se le agenda allí; la cita recibe el código `LAN-A-NNNNNN`.
- Solo se editan citas no finales (`appointment_not_editable`).
- El solapamiento del proveedor es solo un aviso (no bloquea).
- Fecha y hora se introducen en hora local de la sede y viajan en UTC.

**Notas para el rediseño**

- Preservar la protección de cambios sin guardar, la validación 5–480, el bloqueo de fecha y hora en edición (se reprograma aparte), el campo Proveedor fijo para el rol Proveedor y la conversión de zona horaria.
- Preservar el formulario a pantalla completa en teléfono.
- La opción «Yo · » se ofrece también a Administrador y Recepción que no son proveedores; el servidor la rechaza (`invalid_provider`) con el genérico «Algunos campos no son válidos. Revíselos.»
- «Guardar» en edición sin cambiar nada envía una actualización vacía y el servidor responde `empty_update` → mensaje genérico de validación.
- No hay validación (ni en el cliente ni en el servidor) que impida crear citas en el pasado; el selector permite fechas del año anterior.
- El catálogo admite una duración por defecto de 1–1440 min, pero la cita exige 5–480: un tipo mal configurado rellena una duración inválida.
- La lista de tipos se guarda en caché toda la sesión y solo se refresca al cerrar sesión (o al reintentar tras un error): un tipo nuevo no aparece hasta volver a iniciar sesión.
- La API permite precargar un paciente pero ninguna pantalla lo usa: no hay «Nueva cita» desde el perfil del paciente.
- Las Notas no advierten «sin datos clínicos» (el motivo de cancelación sí).

**Código fuente:** `features/appointments/presentation/appointment_form.dart`, `features/appointments/application/appointment_commands.dart`, `appointment_providers.dart`, `features/appointments/domain/agenda_query.dart`, `features/appointments/presentation/provider_label.dart`, `core/widgets/dirty_form_guard.dart`, `core/errors/failure_view.dart`.

---

### <a id="p-rec--s-rec-11--aviso-guardada-con-una-advertencia-solapamiento-de-proveedor"></a>S-REC-11 Aviso «Guardada con una advertencia» (solapamiento de proveedor)

**Ruta:** dentro de [S-REC-10](07_pantallas_recepcion.md#p-rec--s-rec-10--formulario-nueva-cita--editar-cita) · **Tipo:** banner

**Propósito**

Avisar, sin bloquear, de que el proveedor ya tiene otra cita que se cruza con ese horario.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Quien guarda en [S-REC-10](07_pantallas_recepcion.md#p-rec--s-rec-10--formulario-nueva-cita--editar-cita). |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Completo | Ídem. |

**Cómo se llega**

Aparece al guardar cuando la respuesta trae la cabecera `x-warning`.

**Distribución**

- Banner ámbar con icono de advertencia, título «Guardada con una advertencia» y una línea por advertencia: «El proveedor ya tiene una cita en ese horario.» (código desconocido: «Advertencia: {código}»).
- Texto «Cita {código} creada.» (alta) o «Cita actualizada.» (edición).
- Botón «Cerrar».

**Campos**

Sin campos (el formulario se reemplaza por este resumen).

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Cerrar» | Quien guardó | Cierra el formulario. | No | La agenda muestra además el snackbar de éxito. |

**Estados y mensajes**

- La cita ya está guardada; el formulario deja de tener cambios pendientes.

**Tiempo real**

No aplica.

**Reglas de negocio**

- El servidor solo calcula el aviso en `CreateAppointment` y `RescheduleAppointment`; `UpdateAppointment` no lo devuelve, así que en edición este banner no aparece aunque se cambie a un proveedor ocupado.
- En Reprogramar el mismo aviso se muestra como sufijo del snackbar, no como banner.

**Notas para el rediseño**

- Preservar que el aviso no bloquee y que el usuario lo vea antes de salir.
- El mismo aviso se presenta como banner al crear, como snackbar al reprogramar y no existe al editar.

**Código fuente:** `features/appointments/presentation/appointment_form.dart`, `core/grpc/gateway.dart`.

---

### <a id="p-rec--s-rec-12--elegir-paciente-selector-de-paciente"></a>S-REC-12 Elegir paciente (selector de paciente)

**Ruta:** sin ruta propia: diálogo (máx. 760 × 640 px) con título y botón cerrar; página completa con barra «Elegir paciente» en teléfono · **Tipo:** diálogo

**Propósito**

Buscar y elegir (o crear) el paciente de la cita o de la visita sin cita.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Buscar, «Crear paciente» e interruptor «Incluir fusionados». |
| Recepción | Completo | Buscar y «Crear paciente». |
| Enfermería / asistente médico | Sin acceso | No llega (sin Citas ni registro de llegada). |
| Proveedor | Limitado | Desde el formulario de cita: buscar; «Crear paciente» oculto. |

Buscar requiere `searchPatient`; crear requiere `createPatient`.

**Cómo se llega**

Campo «Paciente» de [S-REC-10](07_pantallas_recepcion.md#p-rec--s-rec-10--formulario-nueva-cita--editar-cita); botón «Elegir paciente» o «Cambiar paciente» de [S-REC-19](07_pantallas_recepcion.md#p-rec--s-rec-19--visita-sin-cita-walk-in).

**Distribución**

- Cabecera: «Elegir paciente» y botón cerrar (tooltip «Cerrar»).
- Tarjeta de búsqueda: campos «Nombre», «Apellido», «Fecha de nacimiento», «Teléfono», «Código del paciente»; botones «Buscar» y «Limpiar»; interruptor «Incluir fusionados» (Administrador). Es el mismo formulario de [S-PAC-01](06_pantallas_pacientes.md#p-pac--s-pac-01--pacientes-busqueda).
- Zona de resultados: estado inicial, lista o estado vacío.

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Nombre» | Texto; Enter busca | No | Coincidencia exacta normalizada | Sí |
| «Apellido» | Texto; Enter busca | No | Ídem | Sí |
| «Fecha de nacimiento» | Selector (1900–hoy); iconos «Elegir fecha» / «Borrar fecha» | No | — | Sí |
| «Teléfono» | Teclado telefónico | No | 7–15 dígitos en el servidor | Sí |
| «Código del paciente» | Mayúsculas, pista «LAN-P-000001 o etiqueta escaneada», icono QR | No | Búsqueda directa por código o etiqueta escaneada | No |

Sin ningún criterio la búsqueda no se ejecuta.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Buscar» / Enter | Todos los que acceden | Busca pacientes (solo por acción explícita, nunca por tecla). | No | Resultados. |
| «Limpiar» | Ídem | Vacía campos y resultados. | No | Estado inicial. |
| Tocar un resultado | Ídem | Devuelve el paciente y cierra. | No | El paciente queda elegido en el formulario de origen. |
| «Cargar más» | Ídem | Siguiente página de resultados. | No | Más filas. |
| «Crear paciente» (estado inicial o vacío) | Administrador, Recepción | Abre el alta del módulo Pacientes ([S-PAC-02](06_pantallas_pacientes.md#p-pac--s-pac-02--nuevo-paciente), con detección de duplicados [S-PAC-03](06_pantallas_pacientes.md#p-pac--s-pac-03--posible-paciente-existente)). | No | El paciente nuevo se devuelve directamente al formulario (sin abrir el perfil). |
| Cerrar | Todos | — | No | Vuelve sin paciente. |

**Estados y mensajes**

- Inicial: icono, «Elegir paciente», «Busque por nombre, fecha de nacimiento, teléfono o código y elija un resultado.» y «Crear paciente» (si tiene permiso).
- Cargando; error con «Reintentar».
- Resultados: avatar con la inicial, nombre en formato Título, «fecha de nacimiento · teléfono», código corto a la derecha; los pacientes fusionados aparecen deshabilitados.
- Vacío: «No se encontraron pacientes», «Ningún paciente coincide con estos criterios.» y «Crear paciente» (si tiene permiso).

**Tiempo real**

Ninguno.

**Reglas de negocio**

- Al abrirse limpia la búsqueda anterior para no mostrar PHI de otra pantalla.
- La fuente de referencia se captura al crear el paciente, no en el registro de llegada.

**Notas para el rediseño**

- Preservar la búsqueda explícita, la limpieza de PHI al abrir, el bloqueo de pacientes fusionados y la ocultación de «Crear paciente» sin permiso.
- La lista muestra fecha de nacimiento y teléfono (PHI); mantener solo lo necesario para identificar.
- El estado de búsqueda es compartido con la pantalla Pacientes: abrir el selector borra la búsqueda que el usuario tenía allí.
- Los pacientes inactivos se pueden elegir aunque el servidor los rechace después (`patient_inactive` → «Esta acción no está permitida en el estado actual.»).

**Código fuente:** `features/appointments/presentation/patient_picker_dialog.dart`, `features/patients/presentation/patient_search_form.dart`, `features/patients/application/patient_search_notifier.dart`, `features/patients/presentation/patient_create_page.dart`, `features/patients/domain/patient_display.dart`.

---

### <a id="p-rec--s-rec-13--reprogramar-cita"></a>S-REC-13 Reprogramar cita

**Ruta:** diálogo sobre el detalle de cita · **Tipo:** diálogo

**Propósito**

Cambiar la fecha, la hora y opcionalmente la duración de una cita viva.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Cualquier cita Programada o Confirmada. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Limitado | Solo sus citas. |

Servidor: `ManageAppointment` + alcance de proveedor + sede activa; `appointment_not_editable` si la cita es final.

**Cómo se llega**

Botón «Reprogramar» de [S-REC-09](07_pantallas_recepcion.md#p-rec--s-rec-09--detalle-de-cita-cita).

**Distribución**

- Título «Reprogramar cita».
- Banner rojo compacto de error (si lo hay).
- Campos «Fecha», «Hora», «Duración» («min»).
- Botones «Cancelar» y «Reprogramar».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| Fecha | Selector (año anterior a dos años adelante) | Sí | Precargada con la fecha actual de la cita en la zona de la sede | No |
| Hora | Selector de hora | Sí | Precargada | No |
| Duración | Solo dígitos | Sí | Precargada; 5 a 480 | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Reprogramar» | Según alcance | `AppointmentService/RescheduleAppointment` (cita, `expected_version`, inicio en UTC, duración solo si cambió). | No | Cierra y el detalle muestra «Cita reprogramada.» (+ « El proveedor ya tiene una cita en ese horario.» si hay solapamiento). |
| «Cancelar» | Ídem | Cierra sin cambios (sin confirmación de descarte). | No | — |

**Estados y mensajes**

- Duración fuera de rango: banner rojo con el genérico «Algunos campos no son válidos. Revíselos.»
- Guardando: controles deshabilitados.
- Error del servidor: banner rojo; el diálogo sigue abierto.
- Conflicto de versión: [S-REC-16](07_pantallas_recepcion.md#p-rec--s-rec-16--actualizada-por-otro-usuario-conflicto-de-version) y el diálogo se cierra.

**Tiempo real**

El servidor emite `appointment.changed`; la agenda (todos los días) se invalida.

**Reglas de negocio**

- La cita conserva tipo, proveedor y notas.
- La hora se interpreta en la zona de la sede.

**Notas para el rediseño**

- Preservar `expected_version` y la conversión de zona horaria.
- Error de experiencia: el texto específico «La duración debe estar entre 5 y 480 minutos.» no se muestra; el usuario ve el genérico.
- No tiene protección de cambios sin guardar (el formulario de cita sí).

**Código fuente:** `features/appointments/presentation/appointment_dialogs.dart`, `features/appointments/application/appointment_commands.dart`.

---

### <a id="p-rec--s-rec-14--cancelar-esta-cita"></a>S-REC-14 ¿Cancelar esta cita?

**Ruta:** diálogo sobre el detalle de cita · **Tipo:** diálogo

**Propósito**

Cancelar una cita con un motivo operativo obligatorio (confirmación crítica).

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Cualquier cita Programada o Confirmada. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Limitado | Solo sus citas. |

Servidor: `ManageAppointment` + alcance de proveedor; `invalid_appointment_transition` si no aplica.

**Cómo se llega**

Botón «Cancelar cita» (rojo) de [S-REC-09](07_pantallas_recepcion.md#p-rec--s-rec-09--detalle-de-cita-cita).

**Distribución**

- Título «¿Cancelar esta cita?»
- Texto «La cita se cancelará. Esta acción no se puede deshacer. Indique un motivo operativo (sin datos clínicos).»
- Campo «Motivo».
- Botones «Seguir editando» y «Cancelar cita» (rojo).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Motivo» | Texto de 2 líneas, foco automático, contador; pista «p. ej. a petición del paciente» | Sí («Este campo es obligatorio.») | Máx. 500 caracteres; servidor `missing_reason` / `reason_too_long` | Sí (cifrado; no debe contener datos clínicos) |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Cancelar cita» | Según alcance | `AppointmentService/CancelAppointment` (cita, `expected_version`, motivo recortado). | Este diálogo | Cierra; snackbar «Cita cancelada.»; la cita queda «Cancelada» (final) y el detalle muestra «Motivo». |
| «Seguir editando» | Ídem | Cierra sin cambios. | — | — |

**Estados y mensajes**

- Guardando: controles deshabilitados.
- Error: banner rojo en el diálogo.
- Conflicto: [S-REC-16](07_pantallas_recepcion.md#p-rec--s-rec-16--actualizada-por-otro-usuario-conflicto-de-version) y cierre.

**Tiempo real**

Emite `appointment.changed` (se actualiza en otras pantallas).

**Reglas de negocio**

- Irreversible (Cancelada es final).
- El motivo se guarda cifrado; no debe contener datos clínicos.

**Notas para el rediseño**

- Preservar el motivo obligatorio, el botón destructivo en rojo y la advertencia de irreversibilidad.
- La etiqueta «Seguir editando» es extraña en un diálogo de confirmación (no se está editando nada).

**Código fuente:** `features/appointments/presentation/appointment_dialogs.dart`.

---

### <a id="p-rec--s-rec-15--marcar-como-no-presentado"></a>S-REC-15 ¿Marcar como no presentado?

**Ruta:** diálogo sobre el detalle de cita · **Tipo:** diálogo

**Propósito**

Cerrar una cita porque el paciente no llegó.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Cualquier cita Programada o Confirmada. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Limitado | Solo sus citas. |

**Cómo se llega**

Botón «Marcar no presentado» de [S-REC-09](07_pantallas_recepcion.md#p-rec--s-rec-09--detalle-de-cita-cita).

**Distribución**

- Título «¿Marcar como no presentado?»; texto «El paciente no llegó. La cita se cerrará como no presentado.»; botones «Cancelar» y «Marcar no presentado» (rojo).

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Marcar no presentado» | Según alcance | `AppointmentService/MarkNoShow` (cita, `expected_version`). | Este diálogo | Snackbar «Marcada como no presentado.» |
| «Cancelar» | Ídem | Cierra sin cambios. | — | — |

**Estados y mensajes**

- Conflicto: [S-REC-16](07_pantallas_recepcion.md#p-rec--s-rec-16--actualizada-por-otro-usuario-conflicto-de-version) y relectura.
- Error: snackbar con el mensaje traducido.

**Tiempo real**

El servidor no emite evento para el no presentado: otras pantallas no se enteran en vivo.

**Reglas de negocio**

- «No se presentó» es un estado final.

**Notas para el rediseño**

- Preservar la confirmación destructiva.
- No hay control de hora (se puede marcar antes de la hora de inicio).

**Código fuente:** `features/appointments/presentation/appointment_detail_sheet.dart`, `core/widgets/confirm_dialog.dart`.

---

### <a id="p-rec--s-rec-16--actualizada-por-otro-usuario-conflicto-de-version"></a>S-REC-16 Actualizada por otro usuario (conflicto de versión)

**Ruta:** diálogo sobre el detalle, el formulario o los diálogos de cita · **Tipo:** diálogo

**Propósito**

Avisar de que otra persona cambió la cita y obligar a refrescar.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Cuando una mutación de cita recibe `ABORTED` / `version_conflict`. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Completo | Ídem. |

**Cómo se llega**

Automáticamente al guardar con una versión desactualizada.

**Distribución**

- Título «Actualizada por otro usuario»; texto «Otro usuario actualizó esta cita. Actualice para continuar.»; único botón «Actualizar».

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Actualizar» | Quien guardaba | Cierra. Desde Confirmar o No presentado del detalle y desde el formulario, además relee la cita y la agenda (el formulario se cierra). Desde Cancelar o Reprogramar, solo cierra el diálogo de origen. | No | Datos actualizados (según el origen). |

**Estados y mensajes**

Sin estados adicionales.

**Tiempo real**

No aplica.

**Reglas de negocio**

- Concurrencia optimista: cada mutación envía `expected_version`; el servidor responde `ABORTED` si no coincide.

**Notas para el rediseño**

- Preservar que el usuario no pueda sobrescribir cambios ajenos.
- Tras un conflicto en Cancelar o Reprogramar el detalle no se relee explícitamente; si el cambio ajeno fue una edición o un no presentado (que no emiten evento en vivo), el siguiente intento vuelve a chocar.

**Código fuente:** `features/appointments/presentation/appointment_dialogs.dart`, `appointment_form.dart`, `core/errors/app_failure.dart`.

---

### <a id="p-rec--s-rec-17--descartar-cambios-sin-guardar"></a>S-REC-17 ¿Descartar cambios sin guardar?

**Ruta:** diálogo global · **Tipo:** diálogo (variante de [S-GEN-26](05_pantallas_generales.md#p-gen--s-gen-26--descartar-cambios-sin-guardar))

**Propósito**

Evitar perder los datos introducidos en el formulario de cita o en el asistente de llegada.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Formulario de cita y asistente de llegada. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | No usa estos formularios. |
| Proveedor | Limitado | Solo formulario de cita. |

**Cómo se llega**

«Cancelar» o atrás en el formulario de cita con cambios; cambiar de sede en la cabecera mientras el asistente de llegada está más allá del paso 1.

**Distribución**

- Título «¿Descartar cambios sin guardar?»; texto «Tiene cambios sin guardar. Si sale ahora se perderán.»; botones «Seguir editando» y «Descartar» (rojo).

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Descartar» | Quien edita | Sale. | Es la confirmación | Cierra el formulario, o completa el cambio de sede y abre el Panel de la nueva sede. |
| «Seguir editando» | Quien edita | — | — | Se queda. |

**Estados y mensajes**

Sin estados adicionales.

**Tiempo real**

No aplica.

**Reglas de negocio**

- Si se intenta cambiar de sede escribiendo otro `/app/<código>/` en la URL con formularios sucios, la navegación se rechaza en silencio y se queda en la URL anterior.

**Notas para el rediseño**

- Preservar. Ojo: salir del asistente de llegada por el menú lateral o con la flecha atrás **no** pregunta y se pierde lo introducido.

**Código fuente:** `core/widgets/dirty_form_guard.dart`, `features/locations/application/dirty_forms.dart`, `features/locations/application/location_switch_controller.dart`, `core/routing/app_router.dart`.

---

### <a id="p-rec--s-rec-18--registro-de-llegada-check-in-de-una-cita"></a>S-REC-18 Registro de llegada (check-in de una cita)

**Ruta:** `/app/<código-sede>/checkin/<appointmentId>` · **Tipo:** página

**Propósito**

Registrar la llegada del paciente a una cita programada o confirmada, abrir su visita y capturar la cobertura.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Permiso `checkIn`. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | La guarda (`checkIn`) redirige al Panel. |
| Proveedor | Sin acceso | El botón «Registrar llegada» no se le muestra; la guarda redirige al Panel. |

Servidor: `AppointmentService/CheckIn` exige `CheckIn` en la sede de la cita y que sea la sede activa (`location_mismatch`); `EncounterService/SetPayerSnapshot` exige `CheckIn`.

**Cómo se llega**

Botón «Registrar llegada» del detalle de cita ([S-REC-09](07_pantallas_recepcion.md#p-rec--s-rec-09--detalle-de-cita-cita)). No hay ítem de menú propio. Enlace directo.

**Distribución**

- Encabezado: flecha atrás (va a Citas) y título «Registro de llegada».
- Cuerpo: asistente de llegada ([S-REC-20](07_pantallas_recepcion.md#p-rec--s-rec-20--asistente-de-llegada-marco-comun) a [S-REC-26](07_pantallas_recepcion.md#p-rec--s-rec-26--paso-confirmar-revisar-y-confirmar)) o vista de éxito ([S-REC-27](07_pantallas_recepcion.md#p-rec--s-rec-27--llegada-registrada-vista-de-exito)).

**Campos**

Ver los pasos del asistente.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Flecha atrás | Administrador, Recepción | — | **No** (aunque haya datos introducidos) | Citas ([S-REC-06](07_pantallas_recepcion.md#p-rec--s-rec-06--citas-agenda-del-dia-de-la-sede)). |
| «Volver a citas» (estado no posible) | Ídem | — | No | Citas. |

**Estados y mensajes**

- Cargando la cita (`GetAppointment`) y luego el paciente (`GetPatient`): spinner.
- Error en cualquiera: «Algo salió mal» + mensaje + «Reintentar».
- Cita no apta (estado distinto de Programada o Confirmada y no registrada desde esta misma pantalla): icono de calendario tachado, «No es posible registrar la llegada», «Esta cita está {estado} y no admite registro de llegada.» y botón «Volver a citas».
- Tras registrar aquí, aunque la recarga en vivo traiga la cita como «Llegó», se mantiene la vista de éxito.

**Tiempo real**

Observa la cita; `appointment.changed.v1` la relee. Si otro puesto registra la llegada antes, la pantalla pasa a «No es posible registrar la llegada».

**Reglas de negocio**

- Solo las citas Programadas o Confirmadas admiten registro de llegada.
- `CheckIn` cambia la cita a Llegó y abre la visita en estado Registrado en la misma transacción.
- El servidor serializa registros simultáneos del mismo paciente en la misma sede y rechaza si ya hay una visita abierta (`encounter_already_open`) o si la cita ya tiene visita (`appointment_already_checked_in`).

**Notas para el rediseño**

- Preservar la comprobación de estado antes de mostrar el asistente y la persistencia de la vista de éxito.
- El texto de «no posible» inserta la etiqueta del estado tal cual y produce frases agramaticales («Esta cita está Llegó», «Esta cita está No se presentó»).
- Los planes de producto listaban «Check-in» en la navegación de Recepción; no existe ítem de menú, solo se llega desde la agenda.

**Código fuente:** `features/checkin/presentation/checkin_page.dart`, `checkin_wizard.dart`, `features/checkin/application/checkin_controller.dart`, `features/appointments/application/appointment_providers.dart`, `features/patients/application/patient_providers.dart`.

---

### <a id="p-rec--s-rec-19--visita-sin-cita-walk-in"></a>S-REC-19 Visita sin cita (walk-in)

**Ruta:** `/app/<código-sede>/checkin/walk-in` (sin paciente) y `/app/<código-sede>/checkin/walk-in?patientId=<id>` (con paciente) · **Tipo:** página

**Propósito**

Abrir una visita para un paciente que llega sin cita.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Permiso `checkIn`. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | Guarda → Panel. |
| Proveedor | Sin acceso | Botón «Sin cita» oculto; guarda → Panel. |

Servidor: `EncounterService/CreateWalkInEncounter` exige `CheckIn` en la sede.

**Cómo se llega**

Botón «Sin cita» (icono de persona caminando) del encabezado de Citas ([S-REC-06](07_pantallas_recepcion.md#p-rec--s-rec-06--citas-agenda-del-dia-de-la-sede)). Enlace directo con `?patientId=`.

**Distribución**

- Encabezado: flecha atrás (a Citas), título «Visita sin cita» y, si ya hay paciente, acción «Cambiar paciente» (icono de buscar persona).
- Sin paciente: estado vacío con icono de persona caminando, «Visita sin cita», «Elija al paciente que acaba de llegar para iniciar la visita sin cita.» y botón «Elegir paciente».
- Con paciente: asistente de llegada en variante sin cita ([S-REC-20](07_pantallas_recepcion.md#p-rec--s-rec-20--asistente-de-llegada-marco-comun) a [S-REC-26](07_pantallas_recepcion.md#p-rec--s-rec-26--paso-confirmar-revisar-y-confirmar)).

**Campos**

Ver los pasos del asistente (el paso Ruta incluye «Tipo de cita»).

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Elegir paciente» / «Cambiar paciente» | Administrador, Recepción | Abre [S-REC-12](07_pantallas_recepcion.md#p-rec--s-rec-12--elegir-paciente-selector-de-paciente). | No | Al elegir navega a `…walk-in?patientId=<id>` y reinicia el asistente. |
| Flecha atrás | Ídem | — | No | Citas. |

**Estados y mensajes**

- Cargando el paciente; error con «Reintentar».

**Tiempo real**

Ninguno propio.

**Reglas de negocio**

- La visita se crea en la sede activa, sin proveedor asignado, con la ruta elegida (la ruta explícita prevalece sobre la sugerida por el tipo) y el tipo opcional.

**Notas para el rediseño**

- Preservar el flujo elegir paciente → asistente.
- «Cambiar paciente» reinicia el asistente sin pedir confirmación.
- El identificador interno del paciente viaja en la URL (`patientId`), aunque la interfaz nunca muestra UUID.
- Solo hay entrada desde Citas; no desde el Panel ni desde el perfil del paciente.

**Código fuente:** `features/checkin/presentation/walkin_page.dart`, `checkin_wizard.dart`, `features/checkin/infrastructure/checkin_gateway.dart`, `features/appointments/presentation/patient_picker_dialog.dart`.

---

### <a id="p-rec--s-rec-20--asistente-de-llegada-marco-comun"></a>S-REC-20 Asistente de llegada (marco común)

**Ruta:** dentro de [S-REC-18](07_pantallas_recepcion.md#p-rec--s-rec-18--registro-de-llegada-check-in-de-una-cita) y [S-REC-19](07_pantallas_recepcion.md#p-rec--s-rec-19--visita-sin-cita-walk-in) · **Tipo:** panel

**Propósito**

Guiar el registro de llegada en pasos cortos: Paciente → Sede → Ruta → Cobertura → [Datos del pagador] → Confirmar.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Completo | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Contenido de Registro de llegada o de Visita sin cita.

**Distribución**

- Indicador de pasos: chips numerados (los completados muestran check; el actual, seleccionado). Los pasos completados son tocables para volver; los futuros no.
- Título del paso: «Paso {n} de {total}: {título}» (por ejemplo «Paso 3 de 5: Ruta»).
- Banner ámbar de incidencias de validación (una línea por incidencia) tras un «Continuar» bloqueado.
- Banner rojo compacto de error del servidor y, si aplica, enlace «Abrir la visita existente».
- Contenido del paso, desplazable.
- Divisor y botonera a la derecha: «Atrás» (salvo en el primer paso) y «Continuar»; en el último paso, «Registrar llegada» (cita) o «Iniciar visita sin cita» (sin cita), con spinner al enviar.

**Campos**

Pasos: Paciente ([S-REC-21](07_pantallas_recepcion.md#p-rec--s-rec-21--paso-paciente-verificar-identidad)), Sede ([S-REC-22](07_pantallas_recepcion.md#p-rec--s-rec-22--paso-sede-confirmar-sede-de-la-visita)), Ruta ([S-REC-23](07_pantallas_recepcion.md#p-rec--s-rec-23--paso-ruta-ruta-de-atencion-y-tipo)), Cobertura ([S-REC-24](07_pantallas_recepcion.md#p-rec--s-rec-24--paso-cobertura-tipo-de-pagador)), Datos del pagador ([S-REC-25](07_pantallas_recepcion.md#p-rec--s-rec-25--paso-datos-del-pagador-seguro-o-membresia), solo con Seguro o Membresía), Confirmar ([S-REC-26](07_pantallas_recepcion.md#p-rec--s-rec-26--paso-confirmar-revisar-y-confirmar)). Total: 5 pasos con Pago directo, 6 con Seguro o Membresía.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Continuar» | Administrador, Recepción | Valida el paso actual. | No | Avanza; si hay incidencias las muestra y no avanza. |
| «Atrás» | Ídem | Retrocede un paso (limpia incidencias y error). | No | Paso anterior. |
| Chip de paso completado | Ídem | — | No | Vuelve a ese paso. |
| «Registrar llegada» | Ídem | `AppointmentService/CheckIn` (cita, `expected_version`) y, si la cobertura no es Pago directo, `EncounterService/SetPayerSnapshot` (visita, `expected_version`, tipo de cobertura, datos del seguro o plan de membresía). | El paso Confirmar es la revisión | [S-REC-27](07_pantallas_recepcion.md#p-rec--s-rec-27--llegada-registrada-vista-de-exito). |
| «Iniciar visita sin cita» | Ídem | `EncounterService/CreateWalkInEncounter` (sede, paciente, ruta, tipo opcional) y, si aplica, `SetPayerSnapshot`. | Ídem | [S-REC-27](07_pantallas_recepcion.md#p-rec--s-rec-27--llegada-registrada-vista-de-exito). |
| «Abrir la visita existente» | Ídem | — | No | `/app/<código>/encounters/<id>` de la visita abierta encontrada. |

**Estados y mensajes**

- Enviando: botones deshabilitados y spinner.
- Paciente con una visita ya abierta en la sede (`encounter_already_open`): banner con el genérico «Esta acción no está permitida en el estado actual.» + enlace «Abrir la visita existente» (si se encuentra en la cola).
- Cita ya registrada (`appointment_already_checked_in`): mismo mensaje genérico.
- Conflicto de versión: «Este registro fue actualizado por otro usuario. Actualice para continuar.» (no hay botón de refrescar; la cita se actualiza por tiempo real).
- Permisos: «No tiene permiso para realizar esta acción.» / «No está autorizado para esta sede.»
- Éxito: se reemplaza por [S-REC-27](07_pantallas_recepcion.md#p-rec--s-rec-27--llegada-registrada-vista-de-exito).

**Tiempo real**

Ninguno propio (la página observa la cita).

**Reglas de negocio**

- Cualquier cambio en un campo borra las incidencias y el error mostrados.
- Pasar a Pago directo elimina el paso del pagador y ajusta el número de pasos.
- A partir del paso 2 el asistente cuenta como «cambios sin guardar»: cambiar de sede pide [S-REC-17](07_pantallas_recepcion.md#p-rec--s-rec-17--descartar-cambios-sin-guardar) y un cambio de sede por URL se rechaza.
- El borrador se pierde al salir de la pantalla (no se guarda).
- Los importes viajan como texto decimal («25.00»); la aritmética la hace el servidor.

**Notas para el rediseño**

- Preservar el orden de los pasos, la validación por paso, la revalidación completa al confirmar, el registro de «cambios sin guardar» y el manejo del éxito parcial.
- El mensaje para «el paciente ya tiene una visita abierta» es genérico; solo el enlace da contexto.
- Salir por el menú lateral o con la flecha atrás no pide confirmación (solo el cambio de sede la pide).

**Código fuente:** `features/checkin/presentation/checkin_wizard.dart`, `features/checkin/application/checkin_controller.dart`, `features/checkin/domain/checkin_draft.dart`, `features/checkin/presentation/checkin_labels.dart`, `features/locations/application/dirty_forms.dart`.

---

### <a id="p-rec--s-rec-21--paso-paciente-verificar-identidad"></a>S-REC-21 Paso «Paciente» (verificar identidad)

**Ruta:** paso 1 del asistente · **Tipo:** panel

**Propósito**

Confirmar que la persona presente es el paciente correcto.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Completo | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Primer paso del asistente.

**Distribución**

- Tarjeta: nombre del paciente (formato Título, grande); «Fecha de nacimiento»; «Código del paciente» (monoespaciado) o «Aún sin código en esta sede (se asigna al registrar la llegada)»; «Teléfono» (si existe).
- Casilla «Verifiqué la identidad del paciente» con el subtítulo «Confirme el nombre y la fecha de nacimiento con el paciente.»

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Verifiqué la identidad del paciente» | Casilla | Sí | «Verifique la identidad del paciente antes de continuar.» | No (los datos mostrados sí son PHI) |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Marcar o desmarcar la casilla | Administrador, Recepción | — | No | — |
| «Continuar» | Ídem | Valida la casilla. | No | Paso Sede. |

**Estados y mensajes**

- La incidencia se muestra en el banner ámbar del marco ([S-REC-20](07_pantallas_recepcion.md#p-rec--s-rec-20--asistente-de-llegada-marco-comun)).

**Tiempo real**

No aplica.

**Reglas de negocio**

- El código local del paciente se crea al agendar o al registrar la llegada en la sede si aún no existía.

**Notas para el rediseño**

- Preservar la verificación explícita (casilla obligatoria) antes de abrir la visita.
- Muestra PHI (fecha de nacimiento y teléfono) en pantalla; cuidar la exposición en el mostrador.
- Error visual: el texto «Aún sin código en esta sede…» se dibuja con el componente de códigos, que lo pasa a MAYÚSCULAS monoespaciadas.

**Código fuente:** `features/checkin/presentation/checkin_wizard.dart`.

---

### <a id="p-rec--s-rec-22--paso-sede-confirmar-sede-de-la-visita"></a>S-REC-22 Paso «Sede» (confirmar sede de la visita)

**Ruta:** paso 2 del asistente · **Tipo:** panel

**Propósito**

Confirmar que la visita se abre en la sede activa.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | El permiso de elegir la sede de la visita se materializa aquí y en el selector de la cabecera. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Segundo paso.

**Distribución**

- Tarjeta: icono de edificio, nombre de la sede, «CÓDIGO · zona horaria» (por ejemplo «LAN · America/New\_York»), chip «Activo» (verde) o «Inactivo» (rojo).
- Si está inactiva: texto rojo «Esta sede está inactiva. No es posible registrar llegadas aquí.»
- Ayuda «Para registrar la llegada en otra sede, cambie primero la sede en el encabezado.»
- Casilla «Confirmar esta sede».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Confirmar esta sede» | Casilla | Sí | «Confirme la sede antes de continuar.»; deshabilitada si la sede está inactiva (el asistente no puede avanzar) | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Marcar la casilla y «Continuar» | Administrador, Recepción | Valida. | No | Paso Ruta. |
| Cambiar de sede en la cabecera | Ídem | [S-GEN-13](05_pantallas_generales.md#p-gen--s-gen-13--selector-de-sede-cabecera). | [S-REC-17](07_pantallas_recepcion.md#p-rec--s-rec-17--descartar-cambios-sin-guardar) (el asistente ya tiene cambios) | Panel de la nueva sede. |

**Estados y mensajes**

- Sede activa / inactiva.

**Tiempo real**

No aplica.

**Reglas de negocio**

- La sede de la visita es siempre la sede activa de la cabecera y de la URL; no se elige dentro del asistente.

**Notas para el rediseño**

- Preservar la confirmación explícita y el bloqueo con sede inactiva.
- Cambiar de sede desde aquí obliga a reiniciar todo el flujo desde la agenda de la otra sede.

**Código fuente:** `features/checkin/presentation/checkin_wizard.dart`, `core/routing/shell_screen.dart`.

---

### <a id="p-rec--s-rec-23--paso-ruta-ruta-de-atencion-y-tipo"></a>S-REC-23 Paso «Ruta» (ruta de atención y tipo)

**Ruta:** paso 3 del asistente · **Tipo:** panel

**Propósito**

Elegir por qué circuito pasará el paciente dentro de la clínica.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Completo | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Tercer paso.

**Distribución**

- Sin cita: desplegable «Tipo de cita» con «Sin tipo de cita» + tipos activos (nombre en el idioma de la interfaz; ayuda «Cargando…»).
- Con cita: texto «Sugerida por el tipo de cita ({tipo}). Puede cambiarla.»
- Opciones de radio con ayuda:

| Ruta | Ayuda |
| --- | --- |
| «Estándar» | «Admisión de enfermería y luego proveedor.» |
| «Solo inyección» | «Directo a la cola de procedimientos para una inyección.» |
| «Solo laboratorio» | «Toma de laboratorio sin consulta con el proveedor.» |
| «Solo procedimiento» | «Directo a la cola de procedimientos.» |

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Tipo de cita» (solo sin cita) | Desplegable | No | Al elegirlo, la ruta se ajusta a la sugerencia del tipo, sobrescribiendo la elección previa | No |
| Ruta | Radio | Sí | «Elija una ruta de atención.» (en la práctica siempre hay una preseleccionada) | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Elegir tipo o ruta | Administrador, Recepción | — | No | — |
| «Continuar» | Ídem | Valida. | No | Paso Cobertura. |

**Estados y mensajes**

- La ruta se preselecciona con la sugerencia del tipo de la cita («Estándar» si no tiene) una vez cargados tipos y membresías.

**Tiempo real**

No aplica.

**Reglas de negocio**

- Sin cita: la ruta elegida se envía y prevalece sobre la del tipo.
- Con cita: la petición `CheckIn` solo lleva la cita y su versión; el servidor abre la visita con la ruta sugerida por el tipo de la cita. **Un cambio de ruta hecho aquí no se envía** (la vista de éxito muestra la ruta real devuelta por el servidor).

**Notas para el rediseño**

- Hallazgo funcional importante: para citas programadas el texto «Puede cambiarla» promete algo que el flujo no envía; aclarar con producto antes del rediseño (ver preguntas abiertas).
- Preservar las ayudas de cada ruta (definen a qué cola va el paciente).

**Código fuente:** `features/checkin/presentation/checkin_wizard.dart`, `features/checkin/domain/checkin_draft.dart`, `features/checkin/presentation/checkin_labels.dart`.

---

### <a id="p-rec--s-rec-24--paso-cobertura-tipo-de-pagador"></a>S-REC-24 Paso «Cobertura» (tipo de pagador)

**Ruta:** paso 4 del asistente · **Tipo:** panel

**Propósito**

Indicar cómo pagará la visita: pago directo, seguro o membresía.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Completo | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

Las membresías del paciente se leen con `ReportService/ListPatientMemberships` (exige `SearchPatient`); si responde sin permiso o no encontrado se trata como «sin membresías».

**Cómo se llega**

Cuarto paso.

**Distribución**

- Si el paciente tiene una membresía activa: banner azul con icono «Membresía activa: {plan} (desde {fecha})» (la primera activa; «Plan desconocido» si no se resuelve el nombre).
- Radios «Pago directo» (por defecto), «Seguro», «Membresía».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| Cobertura | Radio | Sí (siempre válida) | Pago directo por defecto | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Elegir «Membresía» | Administrador, Recepción | Preselecciona el plan activo del paciente si no había uno. | No | — |
| «Continuar» | Ídem | — | No | Datos del pagador (Seguro o Membresía) o Confirmar (Pago directo). |

**Estados y mensajes**

- Con o sin banner de membresía activa.

**Tiempo real**

No aplica.

**Reglas de negocio**

- Pago directo no llama a `SetPayerSnapshot` (no hay nada que registrar).

**Notas para el rediseño**

- La cobertura por defecto es Pago directo aunque el paciente tenga una membresía activa (el banner solo informa); se puede destacar mejor sin cambiar la regla sin aprobación.

**Código fuente:** `features/checkin/presentation/checkin_wizard.dart`, `features/checkin/application/checkin_providers.dart`, `features/checkin/infrastructure/checkin_gateway.dart`.

---

### <a id="p-rec--s-rec-25--paso-datos-del-pagador-seguro-o-membresia"></a>S-REC-25 Paso «Datos del pagador» (seguro o membresía)

**Ruta:** paso 5 del asistente (solo con Seguro o Membresía) · **Tipo:** panel

**Propósito**

Capturar los datos del seguro (un único término económico) o el plan de membresía.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Completo | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Quinto paso, solo si la cobertura no es Pago directo.

**Distribución**

- Seguro: «Nombre del seguro», «ID de miembro», texto «Registre uno: copago, coaseguro % o deducible.», selector segmentado «Copago» / «Coaseguro» / «Deducible» y un campo de valor cuya etiqueta es el término elegido.
- Membresía: desplegable «Plan de membresía»; banner de error con «Reintentar» si falla la carga; texto «No hay planes de membresía activos.» si no hay.

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Nombre del seguro» | Texto, mayúscula inicial por palabra | Sí («Ingrese el nombre del seguro.») | — | Sí (cifrado) |
| «ID de miembro» | Texto | No | — | Sí (cifrado) |
| Término | Segmentado | Sí (uno solo) | Copago / Coaseguro / Deducible | No |
| Valor (Copago o Deducible) | Prefijo «$ », sufijo «USD», ayuda «Monto en dólares, p. ej. 25.00» | Sí | Hasta 10 dígitos y 2 decimales; solo dígitos y punto («Ingrese un monto válido (hasta dos decimales).») | Sí (dato del seguro) |
| Valor (Coaseguro) | Sufijo «%», ayuda «Porcentaje entre 0 y 100» | Sí | 0–100 con hasta 2 decimales («Ingrese un porcentaje entre 0 y 100.») | Sí (dato del seguro) |
| «Plan de membresía» | Desplegable de planes activos (orden del catálogo, nombre en el idioma de la interfaz); ayuda «Cargando…» | Sí («Elija un plan de membresía.») | — | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Escribir o elegir y «Continuar» | Administrador, Recepción | Valida. | No | Paso Confirmar. |
| «Reintentar» (planes) | Ídem | Vuelve a cargar los planes. | No | — |

**Estados y mensajes**

- Carga y errores de planes según se describe en Distribución.

**Tiempo real**

No aplica.

**Reglas de negocio**

- Solo se envía el término seleccionado (copago, coaseguro o deducible).
- Los datos del seguro son PHI cifrada en el servidor.

**Notas para el rediseño**

- Preservar «un solo término» y la validación de importes como texto decimal (nunca números de coma flotante).
- Cambiar de término conserva el número tecleado (20 de copago pasa a ser 20 %), lo que puede inducir errores.
- La lista de planes se guarda en caché toda la sesión (solo se refresca al cerrar sesión o con «Reintentar»).

**Código fuente:** `features/checkin/presentation/checkin_wizard.dart`, `features/checkin/domain/checkin_draft.dart`.

---

### <a id="p-rec--s-rec-26--paso-confirmar-revisar-y-confirmar"></a>S-REC-26 Paso «Confirmar» (Revisar y confirmar)

**Ruta:** último paso del asistente · **Tipo:** panel

**Propósito**

Revisar todo antes de abrir la visita.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Completo | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Último paso.

**Distribución**

- Tarjeta «Revisar y confirmar» con pares etiqueta–valor: «Paciente»; «Sede»; «Cita» = «LAN-A-000045 · fecha y hora» (con cita) o «Visita» = «Sin cita» (sin cita); «Tipo de cita» (si hay); «Ruta»; «Cobertura»; con Seguro: «Nombre del seguro», «ID de miembro» (si hay) y el término con «$ x» o «x %»; con Membresía: «Plan de membresía».

**Campos**

Solo lectura (PHI: nombre del paciente y datos del seguro).

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Registrar llegada» / «Iniciar visita sin cita» | Administrador, Recepción | Ver [S-REC-20](07_pantallas_recepcion.md#p-rec--s-rec-20--asistente-de-llegada-marco-comun). | Esta revisión | [S-REC-27](07_pantallas_recepcion.md#p-rec--s-rec-27--llegada-registrada-vista-de-exito). |

**Estados y mensajes**

- Si alguna validación previa falla, se muestran sus incidencias y no se envía.

**Tiempo real**

No aplica.

**Reglas de negocio**

- La ruta mostrada es la elegida en el asistente; para citas programadas la real la decide el servidor ([S-REC-23](07_pantallas_recepcion.md#p-rec--s-rec-23--paso-ruta-ruta-de-atencion-y-tipo)).

**Notas para el rediseño**

- Preservar el resumen completo antes de la acción irreversible.
- Las etiquetas del resumen reutilizan títulos de pasos («Paciente», «Sede», «Ruta», «Cobertura»).

**Código fuente:** `features/checkin/presentation/checkin_wizard.dart`.

---

### <a id="p-rec--s-rec-27--llegada-registrada-vista-de-exito"></a>S-REC-27 Llegada registrada (vista de éxito)

**Ruta:** reemplaza el asistente en [S-REC-18](07_pantallas_recepcion.md#p-rec--s-rec-18--registro-de-llegada-check-in-de-una-cita) / [S-REC-19](07_pantallas_recepcion.md#p-rec--s-rec-19--visita-sin-cita-walk-in) · **Tipo:** panel

**Propósito**

Confirmar la apertura de la visita, mostrar su código y ofrecer el siguiente paso.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Completo | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Automáticamente tras enviar el asistente con éxito.

**Distribución**

- Centrado (máx. 520 px): icono de check verde grande, título «Llegada registrada», nombre del paciente, código completo de la visita en monoespaciado (por ejemplo `LAN-E-000210`, copiable) y la línea «Ruta · Cobertura» (ruta devuelta por el servidor).
- Si la cobertura no se guardó: recuadro ámbar «La visita está abierta pero no se pudo guardar la cobertura.» + mensaje traducido del error + botón «Reintentar».
- Botón relleno «Abrir visita» y botón de texto «Volver a citas».

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Abrir visita» | Administrador, Recepción | — | No | `/app/<código>/encounters/<id>` ([S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita)). |
| «Volver a citas» | Ídem | — | No | Citas. |
| «Reintentar» (solo con fallo de cobertura) | Ídem | Vuelve a llamar a `SetPayerSnapshot`; si el fallo fue un conflicto de versión, antes relee la visita (`GetEncounter`). | No | Cobertura guardada o nuevo error; botón deshabilitado mientras reintenta. |

**Estados y mensajes**

- Éxito completo.
- Éxito parcial (visita abierta, cobertura pendiente) con reintento.

**Tiempo real**

La apertura emite eventos que actualizan el Panel («En espera») en los demás puestos.

**Reglas de negocio**

- El paciente ya está registrado aunque falle la cobertura; reintentar no crea otra visita.
- La cobertura también puede corregirse después desde la pantalla de visita ([S-CLI-11](08_pantallas_clinicas.md#p-cli--s-cli-11--tarjeta-cobertura)).

**Notas para el rediseño**

- Preservar el aviso de éxito parcial con reintento y que no haya navegación automática.
- El título es «Llegada registrada» también para las visitas sin cita.
- No se ofrece imprimir etiqueta ni comprobante aquí (no hay registro de exportación en este flujo).

**Código fuente:** `features/checkin/presentation/checkin_success_view.dart`, `features/checkin/application/checkin_controller.dart`.

---

## <a id="p-rec--preguntas-abiertas-detectadas-en-estas-pantallas"></a>Preguntas abiertas detectadas en estas pantallas

1. Registro de llegada de una cita: el paso «Ruta» dice «Puede cambiarla», pero `AppointmentService/CheckIn` no recibe la ruta y el servidor abre la visita con la sugerencia del tipo. ¿Es un error (falta enviar la ruta o una petición de cambio de ruta) o el paso debería ser de solo lectura para citas? ([S-REC-23](07_pantallas_recepcion.md#p-rec--s-rec-23--paso-ruta-ruta-de-atencion-y-tipo))
2. Editar una cita (`UpdateAppointment`) y marcar no presentado (`MarkNoShow`) no generan evento, por lo que otras agendas y paneles no se actualizan en vivo. ¿Intencional? ([S-REC-06](07_pantallas_recepcion.md#p-rec--s-rec-06--citas-agenda-del-dia-de-la-sede))
3. Panel: la tarjeta «Completados hoy» cuenta finalizaciones de hoy, pero la lista solo trae visitas cerradas con llegada hoy; una visita registrada ayer y completada hoy contaría en la tarjeta y no aparecería en la lista. Confirmar con el servidor. ([S-REC-02](07_pantallas_recepcion.md#p-rec--s-rec-02--tarjetas-de-metricas-del-panel), [S-REC-04](07_pantallas_recepcion.md#p-rec--s-rec-04--lista-en-vivo-cola-de-la-sede))
4. ¿Debe ofrecerse «Yo · » como proveedor (formulario) y «Mis citas» (filtro) a usuarios que no tienen el rol Proveedor? ([S-REC-10](07_pantallas_recepcion.md#p-rec--s-rec-10--formulario-nueva-cita--editar-cita), [S-REC-06](07_pantallas_recepcion.md#p-rec--s-rec-06--citas-agenda-del-dia-de-la-sede))
5. ¿Se permite agendar citas en fechas pasadas? No hay validación ni en el cliente ni en `CreateAppointment`.
6. ¿Se puede marcar «No se presentó» antes de la hora de inicio de la cita? No hay restricción visible. ([S-REC-15](07_pantallas_recepcion.md#p-rec--s-rec-15--marcar-como-no-presentado))
7. Los planes de producto incluían «Check-in» en la navegación de Recepción; hoy solo se accede desde Citas. ¿Se quiere un acceso directo (y «Nueva cita» / «Sin cita» desde el perfil del paciente o el Panel)? El formulario admite precargar un paciente, pero nadie lo usa.
8. La duración por defecto del catálogo admite 1–1440 min mientras la cita exige 5–480. ¿Alinear?
9. Tras editar tipos de cita o planes en Administración, la caché de Citas y del Registro de llegada no se refresca hasta cerrar sesión. ¿Debe invalidarse al guardar en el catálogo?
10. El servidor calcula las visitas sin cita de hoy, pero el Panel no las muestra. ¿Falta una tarjeta? ([S-REC-02](07_pantallas_recepcion.md#p-rec--s-rec-02--tarjetas-de-metricas-del-panel))
11. El mensaje para `encounter_already_open` y `appointment_already_checked_in` es el genérico «Esta acción no está permitida en el estado actual.». ¿Se quiere un texto específico? ([S-REC-20](07_pantallas_recepcion.md#p-rec--s-rec-20--asistente-de-llegada-marco-comun))
12. No se verificó en ejecución qué ocurre al abrir el registro de llegada de una cita de otra sede asignada distinta de la activa (el servidor respondería `location_mismatch` → «No tiene permiso para realizar esta acción.»).
13. No se ejecutó la app: colores exactos, formato final de fechas y horas por idioma y el atenuado de citas finales en la tarjeta no se verificaron visualmente.
