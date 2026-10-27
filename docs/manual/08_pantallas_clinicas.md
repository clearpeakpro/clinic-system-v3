# <a id="p-cli--08--pantallas-clinicas-colas-visita-enfermeria-y-ordenes-s-cli"></a>08 — Pantallas clínicas: colas, visita, enfermería y órdenes (S-CLI)

Este capítulo describe las pantallas donde transcurre la atención clínica de una visita (encounter) una vez registrada la llegada: las tres **colas de trabajo** (enfermería, proveedor y órdenes), la **pantalla de la visita** con su encabezado, su barra de acciones de flujo y sus secciones (Cobertura, Enfermería, Órdenes, Facturación e Historial), los **formularios de enfermería** (signos vitales y valoración), el ciclo de vida de las **órdenes clínicas** (procedimientos, laboratorios e inyecciones) y los diálogos de cierre, cambio excepcional de estado, asignación y descarte de cambios. Enfermería y el Proveedor viven en estas pantallas; Recepción entra a la visita desde el Panel, el registro de llegada o Caja con una vista limitada sin valores clínicos; el Administrador puede ejecutar cualquier paso y es el único que fuerza estados. La interfaz solo muestra u oculta botones según el estado de la visita, su ruta y los permisos del usuario: el servidor revalida cada operación y tiene siempre la última palabra. Los textos entre «…» son etiquetas reales de la interfaz en español y todos los ejemplos (códigos `LAN-P-000123`, `LAN-E-000045`, nombres) son ficticios.

## <a id="p-cli--como-leer-cada-ficha"></a>Cómo leer cada ficha

- **Acceso por rol**: «Completo», «Limitado» (ve una parte, solo lectura o solo algunas acciones), «Sin acceso» (menú oculto o ruta redirigida en silencio al Panel; el servidor también lo rechaza).
- **PHI**: «Sí» = información de salud protegida del paciente (signos vitales, valoración, notas clínicas, motivos de cierre o cancelación, datos del seguro); se cifra en el servidor y su lectura se audita.
- **Códigos humanos**: paciente `LAN-P-NNNNNN`, visita `LAN-E-NNNNNN`; se muestran en monoespaciado, nunca se muestra un UUID y mantener pulsado un código lo copia (sin aviso visual).
- **Horas**: siempre en la zona horaria de la sede activa; los cronómetros de espera se muestran como mm:ss o h:mm:ss y avanzan cada segundo.
- **Código fuente**: las rutas de archivo son relativas a `frontend/lib/`.
- Los comportamientos comunes (estados de carga, vacío y error; confirmación genérica; descarte de cambios; marco y navegación) están en [05 — Pantallas generales](05_pantallas_generales.md). El registro de llegada y el Panel están en [07 — Pantallas de recepción](07_pantallas_recepcion.md); el cobro en [09 — Pantallas de caja](09_pantallas_caja.md).

## <a id="p-cli--matriz-rapida-del-modulo"></a>Matriz rápida del módulo

| Capacidad | Administrador | Recepción | Enfermería / asistente médico | Proveedor |
| --- | --- | --- | --- | --- |
| Cola de enfermería | Sí, con «Iniciar» | No | Sí, con «Iniciar» | Ve y abre; sin «Iniciar» |
| Cola de proveedor | Sí, filtro inicial «Todos» | No | No | Sí, filtro inicial «Mis pacientes» |
| Cola de órdenes | Sí | No | Sí, sin cancelar | Sí, cancela solo las suyas |
| Abrir la pantalla de la visita | Sí | Sí (vista limitada) | Sí | Sí |
| Pasos de flujo de la barra de acciones | Todos | Enviar a enfermería, Enviar a procedimiento (desde Registrado), Iniciar pago, Completar visita, Cerrar visita | Iniciar enfermería, Enviar al proveedor, Listo para pago (desde Procedimiento pendiente) | Iniciar consulta, Enviar a procedimiento, Listo para pago |
| Forzar estado (cambio excepcional) | Sí | No | No | No |
| Asignar o cambiar el proveedor de la visita | Sí | Sí | No | Solo «Asignarme» |
| Editar la cobertura | Sí | Sí | No (lectura) | No (lectura) |
| Signos vitales | Edita | Solo estado y fecha | Edita | Edita |
| Valoración de enfermería | Edita | Solo estado y fecha | Edita | Solo lectura |
| «Enviar al proveedor» (sección Enfermería) | Sí | No | Sí | No |
| Crear órdenes | Sí | No | No | Sí |
| Iniciar, completar y asignar órdenes | Sí | No | Sí | Sí |
| Cancelar órdenes | Sí (también con la visita cerrada) | No | No | Solo las que ordenó o de visitas donde es el proveedor |
| Sección Facturación | Totales + «Ir a checkout» | Totales + «Ir a checkout» | Solo totales | Solo totales |
| Historial de estados | Sí | Sí | Sí | Sí |
| Documentos de la visita (solo por URL) | Sí, con eliminados | Sí | Sí | Sí |

## <a id="p-cli--indice-de-pantallas"></a>Índice de pantallas

| Id | Pantalla | Ruta / ubicación | Tipo |
| --- | --- | --- | --- |
| [S-CLI-01](08_pantallas_clinicas.md#p-cli--s-cli-01--cola-de-enfermeria) | Cola de enfermería | `/app/<código>/nursing/queue` | Página |
| [S-CLI-02](08_pantallas_clinicas.md#p-cli--s-cli-02--cola-de-proveedor) | Cola de proveedor | `/app/<código>/provider/queue` | Página |
| [S-CLI-03](08_pantallas_clinicas.md#p-cli--s-cli-03--cola-de-ordenes) | Cola de órdenes | `/app/<código>/orders/queue` | Página |
| [S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita) | Detalle de visita (pantalla de la visita) | `/app/<código>/encounters/<visita>` | Página |
| [S-CLI-05](08_pantallas_clinicas.md#p-cli--s-cli-05--encabezado-de-la-visita-con-celda-de-proveedor) | Encabezado de la visita (con celda de proveedor) | Pantalla de la visita | Panel |
| [S-CLI-06](08_pantallas_clinicas.md#p-cli--s-cli-06--dialogo-asignar-proveedor) | Diálogo «Asignar proveedor» | Pantalla de la visita | Diálogo |
| [S-CLI-07](08_pantallas_clinicas.md#p-cli--s-cli-07--barra-de-acciones-de-la-visita-incluye-banner-de-visita-cerrada) | Barra de acciones de la visita (incluye banner de visita cerrada) | Pantalla de la visita | Panel |
| [S-CLI-08](08_pantallas_clinicas.md#p-cli--s-cli-08--dialogo-ordenes-abiertas) | Diálogo «Órdenes abiertas» | Pantalla de la visita | Diálogo |
| [S-CLI-09](08_pantallas_clinicas.md#p-cli--s-cli-09--dialogo-cerrar-visita) | Diálogo «Cerrar visita» | Pantalla de la visita | Diálogo |
| [S-CLI-10](08_pantallas_clinicas.md#p-cli--s-cli-10--dialogo-cambio-excepcional-de-estado) | Diálogo «Cambio excepcional de estado» | Pantalla de la visita | Diálogo |
| [S-CLI-11](08_pantallas_clinicas.md#p-cli--s-cli-11--tarjeta-cobertura) | Tarjeta «Cobertura» | Visita, pestaña «Resumen» | Panel |
| [S-CLI-12](08_pantallas_clinicas.md#p-cli--s-cli-12--dialogo-cobertura-editar-cobertura) | Diálogo «Cobertura» (editar cobertura) | Visita | Diálogo |
| [S-CLI-13](08_pantallas_clinicas.md#p-cli--s-cli-13--seccion-enfermeria-vista-completa-y-vista-limitada) | Sección «Enfermería» (vista completa y vista limitada) | Visita, pestaña «Resumen» | Panel |
| [S-CLI-14](08_pantallas_clinicas.md#p-cli--s-cli-14--formulario-signos-vitales-registro-y-correccion) | Formulario «Signos vitales» (registro y corrección) | Sección Enfermería | Panel |
| [S-CLI-15](08_pantallas_clinicas.md#p-cli--s-cli-15--formulario-valoracion-alergias-antecedentes-sintomas-notas-de-enfermeria) | Formulario «Valoración» (alergias, antecedentes, síntomas, notas de enfermería) | Sección Enfermería | Panel |
| [S-CLI-16](08_pantallas_clinicas.md#p-cli--s-cli-16--confirmacion-enviar-al-proveedor-dos-variantes) | Confirmación «Enviar al proveedor» (dos variantes) | Sección Enfermería | Diálogo |
| [S-CLI-17](08_pantallas_clinicas.md#p-cli--s-cli-17--seccion-ordenes-de-la-visita) | Sección «Órdenes» de la visita | Visita, pestaña «Resumen» | Panel |
| [S-CLI-18](08_pantallas_clinicas.md#p-cli--s-cli-18--dialogo-nueva-orden) | Diálogo «Nueva orden» | Sección Órdenes | Diálogo |
| [S-CLI-19](08_pantallas_clinicas.md#p-cli--s-cli-19--barra-de-acciones-de-una-orden) | Barra de acciones de una orden | Sección Órdenes y Cola de órdenes | Panel |
| [S-CLI-20](08_pantallas_clinicas.md#p-cli--s-cli-20--dialogo-completar-orden) | Diálogo «Completar orden» | Sección Órdenes y Cola de órdenes | Diálogo |
| [S-CLI-21](08_pantallas_clinicas.md#p-cli--s-cli-21--dialogo-cancelar-orden) | Diálogo «Cancelar orden» | Sección Órdenes y Cola de órdenes | Diálogo |
| [S-CLI-22](08_pantallas_clinicas.md#p-cli--s-cli-22--dialogo-asignar-orden) | Diálogo «Asignar orden» | Sección Órdenes y Cola de órdenes | Diálogo |
| [S-CLI-23](08_pantallas_clinicas.md#p-cli--s-cli-23--seccion-facturacion-de-la-visita-compuesta-detalle-en-el-inventario-de-facturaci) | Sección «Facturación» de la visita (compuesta; detalle en el inventario de facturación/caja) | Visita, pestaña «Resumen» | Panel |
| [S-CLI-24](08_pantallas_clinicas.md#p-cli--s-cli-24--pestana-historial-de-la-visita) | Pestaña «Historial» de la visita | Visita, pestaña «Historial» | Panel |
| [S-CLI-25](08_pantallas_clinicas.md#p-cli--s-cli-25--documentos-de-la-visita) | Documentos de la visita | `/app/<código>/encounters/<visita>/documents` | Página |
| [S-CLI-26](08_pantallas_clinicas.md#p-cli--s-cli-26--dialogo-descartar-cambios-sin-guardar) | Diálogo «¿Descartar cambios sin guardar?» | Sobre formularios con cambios | Diálogo |

## <a id="p-cli--recorridos-que-pasan-por-estas-pantallas"></a>Recorridos que pasan por estas pantallas

| Recorrido | Roles | Pantallas, en orden |
| --- | --- | --- |
| Visita estándar, de «Registrado» a «Listo para caja» | Recepción → Enfermería → Proveedor → Enfermería → Recepción | Check-in ([S-REC-27](07_pantallas_recepcion.md#p-rec--s-rec-27--llegada-registrada-vista-de-exito)) → [S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita) / [S-CLI-07](08_pantallas_clinicas.md#p-cli--s-cli-07--barra-de-acciones-de-la-visita-incluye-banner-de-visita-cerrada) «Enviar a enfermería» → [S-CLI-01](08_pantallas_clinicas.md#p-cli--s-cli-01--cola-de-enfermeria) «Iniciar» → [S-CLI-14](08_pantallas_clinicas.md#p-cli--s-cli-14--formulario-signos-vitales-registro-y-correccion) → [S-CLI-15](08_pantallas_clinicas.md#p-cli--s-cli-15--formulario-valoracion-alergias-antecedentes-sintomas-notas-de-enfermeria) → [S-CLI-16](08_pantallas_clinicas.md#p-cli--s-cli-16--confirmacion-enviar-al-proveedor-dos-variantes) → [S-CLI-02](08_pantallas_clinicas.md#p-cli--s-cli-02--cola-de-proveedor) «Iniciar consulta» → [S-CLI-13](08_pantallas_clinicas.md#p-cli--s-cli-13--seccion-enfermeria-vista-completa-y-vista-limitada) → [S-CLI-18](08_pantallas_clinicas.md#p-cli--s-cli-18--dialogo-nueva-orden) → [S-CLI-07](08_pantallas_clinicas.md#p-cli--s-cli-07--barra-de-acciones-de-la-visita-incluye-banner-de-visita-cerrada) «Enviar a procedimiento» → [S-CLI-03](08_pantallas_clinicas.md#p-cli--s-cli-03--cola-de-ordenes) → [S-CLI-19](08_pantallas_clinicas.md#p-cli--s-cli-19--barra-de-acciones-de-una-orden) / [S-CLI-20](08_pantallas_clinicas.md#p-cli--s-cli-20--dialogo-completar-orden) → «Listo para caja» automático → Caja ([S-CAJ-01](09_pantallas_caja.md#p-caj--s-caj-01--caja-cola-de-checkout)) |
| Ruta directa (Solo inyección, laboratorio o procedimiento) | Recepción, Proveedor o Administrador, Enfermería | [S-CLI-07](08_pantallas_clinicas.md#p-cli--s-cli-07--barra-de-acciones-de-la-visita-incluye-banner-de-visita-cerrada) «Enviar a procedimiento» → [S-CLI-17](08_pantallas_clinicas.md#p-cli--s-cli-17--seccion-ordenes-de-la-visita) / [S-CLI-18](08_pantallas_clinicas.md#p-cli--s-cli-18--dialogo-nueva-orden) → [S-CLI-03](08_pantallas_clinicas.md#p-cli--s-cli-03--cola-de-ordenes) → [S-CLI-19](08_pantallas_clinicas.md#p-cli--s-cli-19--barra-de-acciones-de-una-orden) / [S-CLI-20](08_pantallas_clinicas.md#p-cli--s-cli-20--dialogo-completar-orden) → «Listo para caja» automático |
| Consulta sin procedimientos | Proveedor | [S-CLI-02](08_pantallas_clinicas.md#p-cli--s-cli-02--cola-de-proveedor) → [S-CLI-13](08_pantallas_clinicas.md#p-cli--s-cli-13--seccion-enfermeria-vista-completa-y-vista-limitada) → [S-CLI-07](08_pantallas_clinicas.md#p-cli--s-cli-07--barra-de-acciones-de-la-visita-incluye-banner-de-visita-cerrada) «Listo para pago» (si quedan órdenes abiertas, [S-CLI-08](08_pantallas_clinicas.md#p-cli--s-cli-08--dialogo-ordenes-abiertas)) |
| Corrección de signos vitales o valoración | Enfermería, Proveedor (solo signos vitales), Administrador | [S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita) → [S-CLI-13](08_pantallas_clinicas.md#p-cli--s-cli-13--seccion-enfermeria-vista-completa-y-vista-limitada) «Editar» → [S-CLI-14](08_pantallas_clinicas.md#p-cli--s-cli-14--formulario-signos-vitales-registro-y-correccion) / [S-CLI-15](08_pantallas_clinicas.md#p-cli--s-cli-15--formulario-valoracion-alergias-antecedentes-sintomas-notas-de-enfermeria) |
| Asignar o tomar el proveedor | Recepción, Administrador, Proveedor | [S-CLI-05](08_pantallas_clinicas.md#p-cli--s-cli-05--encabezado-de-la-visita-con-celda-de-proveedor) → [S-CLI-06](08_pantallas_clinicas.md#p-cli--s-cli-06--dialogo-asignar-proveedor), o «Asignarme» / «Iniciar consulta» en [S-CLI-02](08_pantallas_clinicas.md#p-cli--s-cli-02--cola-de-proveedor) |
| Cancelar una orden | Proveedor dueño, Administrador | [S-CLI-17](08_pantallas_clinicas.md#p-cli--s-cli-17--seccion-ordenes-de-la-visita) o [S-CLI-03](08_pantallas_clinicas.md#p-cli--s-cli-03--cola-de-ordenes) → [S-CLI-19](08_pantallas_clinicas.md#p-cli--s-cli-19--barra-de-acciones-de-una-orden) → [S-CLI-21](08_pantallas_clinicas.md#p-cli--s-cli-21--dialogo-cancelar-orden) |
| Repartir y tomar tareas | Enfermería, Proveedor, Administrador | [S-CLI-03](08_pantallas_clinicas.md#p-cli--s-cli-03--cola-de-ordenes) → [S-CLI-22](08_pantallas_clinicas.md#p-cli--s-cli-22--dialogo-asignar-orden) → [S-CLI-19](08_pantallas_clinicas.md#p-cli--s-cli-19--barra-de-acciones-de-una-orden) «Iniciar» → [S-CLI-20](08_pantallas_clinicas.md#p-cli--s-cli-20--dialogo-completar-orden) |
| Cerrar una visita (se retiró o cancelada) | Recepción, Administrador | [S-CLI-07](08_pantallas_clinicas.md#p-cli--s-cli-07--barra-de-acciones-de-la-visita-incluye-banner-de-visita-cerrada) «Cerrar visita…» → [S-CLI-09](08_pantallas_clinicas.md#p-cli--s-cli-09--dialogo-cerrar-visita) |
| Cambio excepcional de estado | Administrador | [S-CLI-07](08_pantallas_clinicas.md#p-cli--s-cli-07--barra-de-acciones-de-la-visita-incluye-banner-de-visita-cerrada) «Forzar estado…» → [S-CLI-10](08_pantallas_clinicas.md#p-cli--s-cli-10--dialogo-cambio-excepcional-de-estado) → [S-CLI-24](08_pantallas_clinicas.md#p-cli--s-cli-24--pestana-historial-de-la-visita) (chip «Forzado») |
| Corregir la cobertura | Recepción, Administrador | [S-CLI-11](08_pantallas_clinicas.md#p-cli--s-cli-11--tarjeta-cobertura) → [S-CLI-12](08_pantallas_clinicas.md#p-cli--s-cli-12--dialogo-cobertura-editar-cobertura) |
| Adjuntar un documento a la visita | Los cuatro roles | URL directa → [S-CLI-25](08_pantallas_clinicas.md#p-cli--s-cli-25--documentos-de-la-visita) |

Los pasos detallados de cada recorrido están en las guías de rol: [02 — Enfermería](02_enfermeria.md), [03 — Proveedor](03_proveedor.md), [01 — Recepción](01_recepcion.md) y [04 — Administrador](04_administrador.md).

---

### <a id="p-cli--s-cli-01--cola-de-enfermeria"></a>S-CLI-01 Cola de enfermería

**Ruta:** `/app/<código>/nursing/queue` (`RouteNames.nursingQueue`) · **Tipo:** página

**Propósito**

Lista de trabajo de enfermería en la sede activa: pacientes que esperan enfermería o ya están con ella (y, en las rutas directas, los que tienen un procedimiento pendiente), con la mayor espera primero, para iniciar la atención y abrir la visita.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Ve la cola y el botón «Iniciar». |
| Recepción | Sin acceso | El ítem de menú no aparece y la guarda de ruta (exige `enterVitals`, `enterNursingAssessment` o `executeOrder`) redirige en silencio al Panel. |
| Enfermería / asistente médico | Completo | Ve la cola y el botón «Iniciar». |
| Proveedor | Limitado | Ve la cola y «Abrir» (tiene `enterVitals` y `executeOrder`), pero «Iniciar» está oculto porque requiere `enterNursingAssessment`; si forzara la llamada, el servidor responde `transition_not_owned`. |

**Cómo se llega**

Menú «Cola de enfermería» (icono de monitor cardíaco). Después de «Enviar al proveedor» en la sección Enfermería ([S-CLI-16](08_pantallas_clinicas.md#p-cli--s-cli-16--confirmacion-enviar-al-proveedor-dos-variantes)) la app vuelve aquí automáticamente.

**Distribución**

- Cabecera: título «Cola de enfermería»; subtítulo en plural «Sin pacientes en espera» / «1 paciente en espera» / «{count} pacientes en espera» (cuenta todas las filas, también las que están «Con enfermería»); a la derecha, botón de icono «Actualizar».
- Cuerpo: tarjetas en dos columnas de altura fija (176 px) en pantallas de más de 1024 px; lista vertical en tablet pequeña y teléfono.
- Tarjeta, fila 1: nombre del paciente en formato título (si la fila no trae nombre, el código del paciente o, en su defecto, el código de la visita); debajo, el código del paciente en monoespaciado (p. ej. `LAN-P-000123`); a la derecha, el chip de estado de la visita.
- Tarjeta, fila 2 (metadatos con icono): hora de registro (zona horaria de la sede), cronómetro de espera desde el registro, tipo de cita (o «Sin cita»), ruta («Estándar», «Solo inyección», «Solo laboratorio», «Solo procedimiento») y proveedor («Sin asignar», su nombre, o «Asignado» si el nombre no se conoce).
- Tarjeta, fila 3 (alineada a la derecha): botón de texto «Abrir» y botón relleno «Iniciar» (icono play; spinner mientras trabaja).

**Campos**

Sin campos, filtros ni búsqueda.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Tocar la tarjeta o «Abrir» | Todos los que acceden | Abre la visita. | No | [S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita). |
| «Iniciar» | Administrador y Enfermería; solo en «Esperando enfermería» | `EncounterService/TransitionEncounter` a `WITH_NURSE` con la `expected_version` de la fila. | No | Éxito: snackbar «Enfermería iniciada.», recarga la cola y abre [S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita). Error: snackbar con el mensaje traducido (p. ej. «Su rol no realiza este paso.», «Esta transición no está permitida en el estado actual.» o, si otra persona cambió la visita, «Este registro fue actualizado por otro usuario. Actualice para continuar.») y recarga la cola. |
| «Actualizar» (icono) | Todos los que acceden | Vuelve a pedir `EncounterService/ListQueue`. | No | Barra fina mientras recarga; la lista no se vacía. |

**Estados y mensajes**

- Cargando sin datos: spinner centrado.
- Recargando con datos: barra de progreso fina arriba; la lista no se vacía.
- Error sin datos: vista de error «Algo salió mal» + mensaje + botón «Reintentar».
- Error con datos previos: banner rojo compacto sobre la lista con «Reintentar».
- Vacío: icono de monitor + «No hay pacientes esperando enfermería.»
- Chips de estado: «Esperando enfermería» (azul, tono info, icono i), «Con enfermería» (verde, tono éxito, icono check), «Procedimiento pendiente» (ámbar, tono advertencia, icono de alerta; solo rutas directas).
- Botón «Iniciar» deshabilitado con spinner mientras la llamada está en curso (evita la doble pulsación).
- Sin sede activa: lista vacía.

**Tiempo real**

La cola se invalida con `encounter.created`, `encounter.state_changed` y `encounter.provider_assigned` (WebSocket, canal `location:<id>:workflow`) y en cada resincronización al reconectar. Si el WebSocket no está conectado o el servidor informa que la mensajería (NATS) está caída, la pantalla se refresca sola cada 30 s. Los cronómetros avanzan cada segundo en el dispositivo, sin recargar.

**Reglas de negocio**

- Muestra visitas en «Esperando enfermería» (`WAITING_FOR_NURSE`) y «Con enfermería» (`WITH_NURSE`) de cualquier ruta, y en «Procedimiento pendiente» (`PROCEDURE_PENDING`) solo de las rutas directas (Solo inyección, Solo laboratorio, Solo procedimiento).
- Orden: hora de registro ascendente (mayor espera primero).
- Solo la sede activa (la de la URL `/app/<código>/…`).
- No existe asignación de enfermera a la visita: cualquier enfermera de la sede puede iniciar.
- El nombre del paciente viaja en la propia fila (solo para quien tiene `SearchPatient`, es decir, los cuatro roles) y se muestra en formato título aunque se guarda en MAYÚSCULAS.
- «Iniciar» aquí equivale a «Iniciar enfermería» de la barra de acciones de la visita ([S-CLI-07](08_pantallas_clinicas.md#p-cli--s-cli-07--barra-de-acciones-de-la-visita-incluye-banner-de-visita-cerrada)).

**Notas para el rediseño**

- Conservar el orden por mayor espera, el cronómetro vivo, el código humano en monoespaciado y el chip con color + icono + texto (nunca solo color).
- Conservar «Iniciar» solo para quien tiene `enterNursingAssessment` y solo en «Esperando enfermería»: el Proveedor ve la cola pero no inicia.
- Conservar la protección contra doble envío y la recarga de la cola tras éxito o error.
- El subtítulo dice «pacientes en espera» pero también cuenta los que están «Con enfermería» y «Procedimiento pendiente».
- Un conflicto de versión aquí muestra el texto genérico, mientras que la Cola de proveedor usa «Otra persona actualizó esta visita. La pantalla se ha actualizado.».
- No hay filtros (por estado, proveedor o ruta) ni búsqueda; con muchas filas cuesta distinguir «por iniciar» de «en curso».
- La altura fija de 176 px en dos columnas puede recortar nombres largos o texto ampliado.
- Las tarjetas exponen claves de widget usadas por las pruebas (p. ej. `queue-start-<id>`); un rediseño debe mantenerlas o actualizar las pruebas.

**Código fuente:** `features/nursing/presentation/nursing_queue_page.dart`, `features/nursing/application/nursing_providers.dart`, `features/nursing/nursing_feature.dart`, `features/encounters/application/encounter_commands.dart`, `features/encounters/presentation/waiting_time_ticker.dart`, `features/encounters/presentation/appointment_type_text.dart`, `features/encounters/presentation/encounter_labels.dart`, `core/widgets/responsive_card_grid.dart`, `core/navigation/nav_items.dart`, `core/routing/routes.dart`.

---

### <a id="p-cli--s-cli-02--cola-de-proveedor"></a>S-CLI-02 Cola de proveedor

**Ruta:** `/app/<código>/provider/queue` (`RouteNames.providerQueue`) · **Tipo:** página

**Propósito**

Lista de trabajo del proveedor en la sede activa: pacientes que esperan al proveedor, que están en consulta o que esperan procedimientos, para tomar y comenzar consultas.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Filtro inicial «Todos». «Iniciar consulta» en cualquier visita que espera al proveedor; no se autoasigna salvo que también tenga el rol Proveedor. |
| Recepción | Sin acceso | Menú oculto; la guarda de ruta (`createClinicalOrder`) redirige al Panel. |
| Enfermería / asistente médico | Sin acceso | Ídem. |
| Proveedor | Completo | Filtro inicial «Mis pacientes». «Iniciar consulta» solo si la visita está sin asignar o asignada a él; el servidor valida el permiso de la transición. |

**Cómo se llega**

Menú «Cola de proveedor» (icono de maletín médico).

**Distribución**

- Cabecera: título «Cola de proveedor»; subtítulo «Sin pacientes» / «1 paciente» / «{count} pacientes» (según el filtro activo); botón de icono «Actualizar».
- Selector segmentado: «Mis pacientes» · «Sin asignar» · «Todos».
- Cuerpo: tarjetas (dos columnas de 188 px en más de 1024 px; lista en pantallas menores).
- Tarjeta, fila 1: nombre del paciente (se pide aparte con `GetPatient`; muestra «…» mientras carga), código del paciente y chip de estado (aquí «Esperando procedimientos» en lugar de «Procedimiento pendiente»).
- Tarjeta, fila 2: hora de registro; cronómetro de espera desde que terminó enfermería (o desde el registro si no hubo enfermería), oculto en «Esperando procedimientos»; «Enfermería lista {hora}» si enfermería terminó; tipo de cita (o «Sin cita»); ruta; proveedor («Sin asignar», «Asignado a mí», nombre o «Asignado»).
- Tarjeta, fila 3: «Abrir» (texto) e «Iniciar consulta» (relleno, icono play, spinner).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| Filtro «Mis pacientes» / «Sin asignar» / «Todos» | Selector segmentado (un valor) | Sí (siempre hay uno) | «Mis pacientes» = visitas cuyo proveedor es el usuario; «Sin asignar» = sin proveedor; «Todos». Se aplica en el dispositivo (cambio instantáneo) y se recuerda durante la sesión. | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Tocar la tarjeta o «Abrir» | Proveedor, Administrador | Abre la visita. | No | [S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita). |
| «Iniciar consulta» | Proveedor (visita sin asignar o propia) y Administrador; solo en «Esperando proveedor» | Si la visita está sin asignar y el usuario tiene el rol Proveedor, primero `EncounterService/AssignProvider` a sí mismo y luego `TransitionEncounter` → `WITH_PROVIDER` con la versión devuelta por la asignación. | No | Éxito: snackbar «Consulta iniciada.» y abre [S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita). Conflicto: «Otra persona actualizó esta visita. La pantalla se ha actualizado.». Otros errores con el texto traducido. Siempre recarga la cola. |
| «Actualizar» (icono) | Proveedor, Administrador | Vuelve a pedir `ListQueue`. | No | Barra fina. |
| Cambiar el filtro | Proveedor, Administrador | Filtra en el dispositivo. | No | Lista y subtítulo se actualizan al instante. |

**Estados y mensajes**

- Cargando, recargando, error y error con datos: igual que [S-CLI-01](08_pantallas_clinicas.md#p-cli--s-cli-01--cola-de-enfermeria) (spinner, barra fina, «Algo salió mal» + «Reintentar», banner compacto).
- Vacío: «No hay pacientes esperando a un proveedor.» (también cuando el filtro no tiene resultados).
- Chips: «Esperando proveedor» (azul), «Con proveedor» (verde), «Esperando procedimientos» (ámbar).
- Botón ocupado con spinner.

**Tiempo real**

Se invalida con `encounter.created`, `encounter.state_changed`, `encounter.provider_assigned` y `vitals.changed`, y al resincronizar; refresco cada 30 s si no hay WebSocket. Los cronómetros avanzan cada segundo en el dispositivo.

**Reglas de negocio**

- Estados listados: «Esperando proveedor» (`WAITING_FOR_PROVIDER`), «Con proveedor» (`WITH_PROVIDER`) y «Procedimiento pendiente» (`PROCEDURE_PENDING`) de cualquier ruta.
- Orden: primero «Esperando proveedor», luego «Con proveedor», luego «Esperando procedimientos»; dentro de cada grupo, mayor espera primero.
- Autoasignación implícita al iniciar una visita sin asignar (solo rol Proveedor). Si la asignación funciona pero la transición falla, la visita queda asignada al proveedor sin iniciar.
- Un Administrador sin rol Proveedor inicia la consulta sin asignar proveedor.
- Solo la sede activa.

**Notas para el rediseño**

- Conservar el filtro por defecto según el rol («Mis pacientes» para proveedores, «Todos» para administradores) y la regla de quién ve «Iniciar consulta».
- Conservar la secuencia asignar → iniciar con la versión devuelta (evita conflictos de versión propios).
- El nombre se carga con un `GetPatient` por tarjeta (lecturas de PHI auditadas y «…» parpadeando), mientras la Cola de enfermería usa el nombre que ya trae la fila.
- El nombre del proveedor sale del directorio de proveedores y no del campo `provider_display_name` que la fila ya trae.
- El botón «Iniciar consulta» de la barra de acciones de la visita ([S-CLI-07](08_pantallas_clinicas.md#p-cli--s-cli-07--barra-de-acciones-de-la-visita-incluye-banner-de-visita-cerrada)) no autoasigna ni restringe a visitas propias o sin asignar; el de esta cola sí.
- «Proveedor» es un anglicismo; valorar una terminología como «Médico» o «Proveedor de salud».

**Código fuente:** `features/provider/presentation/provider_queue_page.dart`, `features/provider/application/provider_queue_providers.dart`, `features/provider/domain/provider_queue_rules.dart`, `features/provider/provider_feature.dart`, `features/encounters/application/encounter_commands.dart`, `features/patients/application/patient_providers.dart`, `core/navigation/nav_items.dart`.

---

### <a id="p-cli--s-cli-03--cola-de-ordenes"></a>S-CLI-03 Cola de órdenes

**Ruta:** `/app/<código>/orders/queue` (`RouteNames.ordersQueue`) · **Tipo:** página

**Propósito**

Cola de tareas clínicas (procedimientos, laboratorios e inyecciones) de la sede activa para que enfermería y proveedores las ejecuten, organizada por estado y con el filtro «Asignadas a mí».

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Inicia aunque la orden esté asignada a otra persona, completa, asigna y cancela. |
| Recepción | Sin acceso | Menú oculto + guarda `executeOrder`; el servidor (`ListTaskQueue`) también exige `ExecuteOrder`. |
| Enfermería / asistente médico | Limitado | Inicia las órdenes sin asignar o asignadas a ella, completa y asigna; nunca cancela. |
| Proveedor | Completo | Ejecuta como Enfermería y además «Cancelar orden» en órdenes que él ordenó o de visitas donde es el proveedor. |

Los botones se calculan con `OrderRules.actionsFor`; el servidor responde `order_assigned_to_other`, `order_not_owned` o `PERMISSION_DENIED` si no corresponde.

**Cómo se llega**

Menú «Cola de órdenes» (icono de portapapeles).

**Distribución**

- Cabecera: título «Cola de órdenes»; subtítulo «Sin tareas» / «1 tarea» / «{count} tareas»; botón de icono «Actualizar».
- Barra de filtros: selector segmentado «Pendientes» · «En curso» · «Completadas hoy» · «Canceladas» y chip conmutador «Asignadas a mí».
- Cuerpo: tarjetas (dos columnas de 248 px en más de 1024 px; lista en pantallas menores).
- Tarjeta, fila 1: nombre del ítem del catálogo en el idioma de la interfaz (si falta, su código); debajo, código del paciente, código de la visita (`LAN-E-…`), código del ítem en monoespaciado (p. ej. `INJ_B12`) y «Cant. {n}»; a la derecha, chip de estado de la orden y chip de tipo («Procedimiento», «Laboratorio» con icono de matraz, «Inyección» con icono de vacuna).
- Fila 2: «Proveedor: {nombre}» o «Sin proveedor» · «Ordenada {hora}» · «Asignada a {nombre}» o «Sin asignar» (máximo dos líneas).
- Fila 3: icono + «Consulta: {estado de la visita}».
- Fila 4: botón de texto «Abrir consulta» y la barra de acciones de la orden ([S-CLI-19](08_pantallas_clinicas.md#p-cli--s-cli-19--barra-de-acciones-de-una-orden)).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| Pestaña de estado | Selector segmentado (una opción) | Sí | Por defecto «Pendientes»; se recuerda en la sesión. | No |
| «Asignadas a mí» | Conmutador | No | Filtra en el servidor y en el dispositivo por persona asignada = usuario. | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Tocar la tarjeta o «Abrir consulta» | Todos los que acceden | Abre `/app/<código>/encounters/<id>?section=orders`. | No | [S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita) desplazada a la sección Órdenes ([S-CLI-17](08_pantallas_clinicas.md#p-cli--s-cli-17--seccion-ordenes-de-la-visita)). |
| «Iniciar», «Completar», «Asignar», «Cancelar orden» | Según [S-CLI-19](08_pantallas_clinicas.md#p-cli--s-cli-19--barra-de-acciones-de-una-orden) | Ciclo de vida de la orden. | Según la acción | Ver [S-CLI-19](08_pantallas_clinicas.md#p-cli--s-cli-19--barra-de-acciones-de-una-orden) a [S-CLI-22](08_pantallas_clinicas.md#p-cli--s-cli-22--dialogo-asignar-orden). |
| «Actualizar» (icono) | Todos los que acceden | `OrderService/ListTaskQueue`. | No | Barra fina. |

**Estados y mensajes**

- Cargando, recargando y error: patrón estándar (spinner, barra fina, «Algo salió mal» + «Reintentar», banner compacto).
- Vacío: icono de lista + «No hay órdenes en esta vista.»
- Chips de orden: «Pendiente» (ámbar), «En curso» (azul), «Completada» (verde), «Cancelada» (gris).
- Si la visita está cerrada no hay acciones de ejecución (solo el Administrador puede cancelar).

**Tiempo real**

Se invalida con `order.created`, `order.changed` y `encounter.state_changed`, y al resincronizar; refresco cada 30 s sin WebSocket.

**Reglas de negocio**

- Nunca muestra nombres de pacientes ni notas clínicas: la fila del servidor solo trae códigos humanos (PHI mínima).
- «Pendientes» y «En curso»: más antiguas primero (por hora de la orden). «Completadas hoy»: solo las completadas en el día calendario de la sede (zona horaria de la sede), más recientes primero; el servidor no filtra por fecha. «Canceladas»: más recientes primero.
- Una orden asignada a otra persona solo la puede iniciar esa persona o un Administrador.
- Solo la sede activa.

**Notas para el rediseño**

- Conservar la ausencia de nombres y notas en esta cola (decisión HIPAA explícita).
- Conservar el enlace profundo `?section=orders`.
- El nombre del proveedor y del asignado sale del directorio de proveedores: enfermeras y administradores aparecen como «Miembro del personal» aunque el servidor ya envía `provider_display_name` y `assigned_to_display_name`.
- Terminología: aquí la visita se llama «Consulta» («Abrir consulta», «Consulta: …») y en el resto de pantallas «Visita».
- La altura fija de 248 px en dos columnas puede recortar los metadatos.

**Código fuente:** `features/orders/presentation/task_queue_page.dart`, `features/orders/presentation/order_actions.dart`, `features/orders/presentation/orders_section.dart`, `features/orders/application/order_providers.dart`, `features/orders/domain/order_rules.dart`, `features/orders/domain/order_display.dart`, `features/orders/presentation/order_labels.dart`, `features/orders/orders_feature.dart`.

---

### <a id="p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita"></a>S-CLI-04 Detalle de visita (pantalla de la visita)

**Ruta:** `/app/<código>/encounters/<encounterId>`, con `?section=orders`, `?section=nursing` o `?section=billing` opcionales (`RouteNames.encounter`) · **Tipo:** página

**Propósito**

Ficha operativa de una visita: datos de cabecera, acciones de flujo según el rol, cobertura, enfermería, órdenes, facturación e historial de estados.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Todas las secciones y acciones, incluido «Forzar estado…». |
| Recepción | Limitado | Cobertura editable; Enfermería en vista limitada sin valores clínicos; Órdenes solo lectura y sin notas clínicas; Facturación con «Ir a checkout»; acciones de recepción en la barra. |
| Enfermería / asistente médico | Limitado | Cobertura solo lectura; Enfermería completa y editable; Órdenes para ejecutar; Facturación solo totales. |
| Proveedor | Limitado | Signos vitales editables, valoración solo lectura; crea, ejecuta y cancela órdenes; Facturación solo totales. |

Los cuatro roles pueden abrirla (guarda `viewQueue`). Las secciones se filtran por permiso (`encounterSectionsProvider`) y los botones se calculan con estado × ruta × permisos; el servidor revalida cada operación.

**Cómo se llega**

- Fila del Panel ([S-REC-04](07_pantallas_recepcion.md#p-rec--s-rec-04--lista-en-vivo-cola-de-la-sede)).
- Tarjetas de la Cola de enfermería ([S-CLI-01](08_pantallas_clinicas.md#p-cli--s-cli-01--cola-de-enfermeria)), de la Cola de proveedor ([S-CLI-02](08_pantallas_clinicas.md#p-cli--s-cli-02--cola-de-proveedor)) y de la Cola de órdenes ([S-CLI-03](08_pantallas_clinicas.md#p-cli--s-cli-03--cola-de-ordenes), «Abrir consulta»).
- Registro de llegada: «Abrir visita» o «Abrir la visita existente» ([S-REC-27](07_pantallas_recepcion.md#p-rec--s-rec-27--llegada-registrada-vista-de-exito), [S-REC-20](07_pantallas_recepcion.md#p-rec--s-rec-20--asistente-de-llegada-marco-comun)).
- Caja: «Abrir visita» ([S-CAJ-03](09_pantallas_caja.md#p-caj--s-caj-03--checkout-de-la-visita)) y «Ir a órdenes» del diálogo «Órdenes abiertas» ([S-CAJ-06](09_pantallas_caja.md#p-caj--s-caj-06--dialogo-ordenes-abiertas)).
- Perfil del paciente, pestaña Visitas ([S-PAC-08](06_pantallas_pacientes.md#p-pac--s-pac-08--pestana-visitas)).
- Notificaciones «Paciente asignado a ti», «Orden asignada a ti» y «Orden asignada actualizada» ([S-GEN-15](05_pantallas_generales.md#p-gen--s-gen-15--centro-de-notificaciones)).
- URL directa.

**Distribución**

- Barra de página: botón «Atrás» (vuelve si hay historial; si no, al Panel de la sede); título = nombre del paciente en formato título («Visita» mientras carga) y subtítulo «Visita»; acciones «Actualizar» y «Abrir perfil del paciente» (icono de persona).
- Zona superior desplazable: encabezado ([S-CLI-05](08_pantallas_clinicas.md#p-cli--s-cli-05--encabezado-de-la-visita-con-celda-de-proveedor)) y barra de acciones ([S-CLI-07](08_pantallas_clinicas.md#p-cli--s-cli-07--barra-de-acciones-de-la-visita-incluye-banner-de-visita-cerrada)); en pantallas bajas se desplazan en lugar de empujar las pestañas.
- Pestañas: «Resumen» · «Historial».
- Pestaña «Resumen» (lista desplazable): tarjeta Cobertura ([S-CLI-11](08_pantallas_clinicas.md#p-cli--s-cli-11--tarjeta-cobertura)) y después tarjetas de sección con icono y título, en este orden: «Enfermería» ([S-CLI-13](08_pantallas_clinicas.md#p-cli--s-cli-13--seccion-enfermeria-vista-completa-y-vista-limitada)), «Órdenes» ([S-CLI-17](08_pantallas_clinicas.md#p-cli--s-cli-17--seccion-ordenes-de-la-visita)) y «Facturación» ([S-CLI-23](08_pantallas_clinicas.md#p-cli--s-cli-23--seccion-facturacion-de-la-visita-compuesta-detalle-en-el-inventario-de-facturaci)). No hay sección de documentos ni de notas del proveedor.
- Pestaña «Historial»: [S-CLI-24](08_pantallas_clinicas.md#p-cli--s-cli-24--pestana-historial-de-la-visita).

**Campos**

Sin campos propios; los formularios están en las secciones.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Atrás» | Todos | Vuelve atrás en el historial o, si no hay, al Panel. | No | Pantalla anterior o [S-REC-01](07_pantallas_recepcion.md#p-rec--s-rec-01--panel-tablero-operativo-de-la-sede). |
| «Actualizar» | Todos | Recarga la visita y su historial (`EncounterService/GetEncounter`, `GetEncounterTimeline`). | No | Barra fina. |
| «Abrir perfil del paciente» | Todos | Abre `/app/<código>/patients/<patientId>`. | No | [S-PAC-05](06_pantallas_pacientes.md#p-pac--s-pac-05--perfil-del-paciente). |
| Enlace profundo `?section=<id>` | Automático | Al cargar cambia a «Resumen» y desplaza hasta la sección; los identificadores desconocidos se ignoran. | No | Sección visible. |

**Estados y mensajes**

- Cargando: spinner centrado.
- Error (incluye «No se encontró el registro solicitado.», «No tiene permiso para realizar esta acción.», «No está autorizado para esta sede.» y error de red): «Algo salió mal» + mensaje + «Reintentar».
- Recarga en segundo plano: barra fina; formularios y scroll se conservan, salvo el caso descrito en [S-CLI-14](08_pantallas_clinicas.md#p-cli--s-cli-14--formulario-signos-vitales-registro-y-correccion).
- Sin secciones visibles: «No hay secciones disponibles para su rol.» (en la práctica no ocurre: la sección Órdenes no exige permiso).

**Tiempo real**

`encounter.created`, `encounter.state_changed`, `encounter.provider_assigned` y `vitals.changed` de esta visita recargan visita e historial; `order.created`, `order.changed` y `billing.changed` recargan todas las visitas abiertas en pantalla; resincronización al reconectar; refresco cada 30 s sin WebSocket.

**Reglas de negocio**

- Toda mutación lleva `expected_version`; ante un conflicto (`ABORTED`) la pantalla se refresca y se informa.
- Tras cada escritura (con éxito o con error) se recargan la visita, el historial y las listas afectadas.
- Las horas se muestran en la zona horaria de la sede activa.
- El nombre del paciente (PHI) aparece en el título de la página para los cuatro roles.

**Notas para el rediseño**

- Conservar el orden lógico de las secciones y el filtrado por permiso; conservar el desplazamiento por `?section=orders` (lo usan la Cola de órdenes y el diálogo «Órdenes abiertas»).
- Conservar que el encabezado y la barra de acciones no oculten las pestañas en pantallas pequeñas.
- Como casi toda la navegación usa `go()`, «Atrás» suele llevar al Panel y no a la cola de origen.
- Falta en la interfaz el acceso a «Documentos de la visita» ([S-CLI-25](08_pantallas_clinicas.md#p-cli--s-cli-25--documentos-de-la-visita)) y una sección de documentos, aunque el plan de producto la prevé; tampoco hay resumen del paciente ni notas clínicas del proveedor.
- Las acciones de flujo están separadas de las secciones (por ejemplo, hay dos botones «Enviar al proveedor», ver [S-CLI-07](08_pantallas_clinicas.md#p-cli--s-cli-07--barra-de-acciones-de-la-visita-incluye-banner-de-visita-cerrada) y [S-CLI-16](08_pantallas_clinicas.md#p-cli--s-cli-16--confirmacion-enviar-al-proveedor-dos-variantes)): unificarlos sin perder la validación de signos vitales.

**Código fuente:** `features/encounters/presentation/encounter_page.dart`, `features/encounters/application/encounter_sections.dart`, `features/encounters/application/encounter_providers.dart`, `features/encounters/application/encounter_commands.dart`, `features/encounters/encounters_feature.dart`, `features/nursing/nursing_feature.dart`, `features/orders/orders_feature.dart`, `features/billing/billing_feature.dart`.

---

### <a id="p-cli--s-cli-05--encabezado-de-la-visita-con-celda-de-proveedor"></a>S-CLI-05 Encabezado de la visita (con celda de proveedor)

**Ruta:** dentro de `/app/<código>/encounters/<encounterId>` · **Tipo:** panel

**Propósito**

Identificar al paciente y la visita, ver la ruta, el tipo de cita, el proveedor, el estado y los tiempos de espera, y asignar el proveedor de la visita.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Ve el encabezado; «Asignar proveedor» / «Cambiar proveedor» (permiso `checkIn`). |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Limitado | Solo lectura: los botones de asignación están ocultos. |
| Proveedor | Limitado | Solo lectura más «Asignarme» cuando la visita no es suya (también si está asignada a otro proveedor). |

El servidor responde `assign_not_allowed` a quien no es Recepción o Administrador y no se está asignando a sí mismo.

**Cómo se llega**

Parte superior de la pantalla de la visita ([S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita)).

**Distribución**

- Tarjeta con celdas que se reacomodan según el ancho (mínimo 140 px cada una):
- «Paciente»: código del paciente en monoespaciado (p. ej. `LAN-P-000123`) + edad «{n} años».
- «Visita»: código de la visita (p. ej. `LAN-E-000045`).
- «Sede»: nombre de la sede activa.
- «Tipo de cita»: nombre del catálogo en el idioma de la interfaz, o «Sin cita».
- «Ruta»: «Estándar», «Solo inyección», «Solo laboratorio» o «Solo procedimiento».
- «Proveedor»: texto + acciones (ver abajo).
- «Estado actual»: chip de estado.
- «Tiempo de espera» (solo si hay hora de registro): duración total desde el registro (cronómetro vivo si la visita está abierta; fija hasta el cierre si está cerrada); «En este estado {mm:ss}» (solo abierta); «Registro: {hora}».
- Celda «Proveedor»: «Sin asignar», «Usted», el nombre del proveedor o «Asignado»; botones de texto «Asignar proveedor» o «Cambiar proveedor» y «Asignarme»; spinner mientras asigna.

**Campos**

Sin campos editables en línea.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Asignar proveedor» / «Cambiar proveedor» | Recepción, Administrador; visita abierta | Abre [S-CLI-06](08_pantallas_clinicas.md#p-cli--s-cli-06--dialogo-asignar-proveedor); al elegir, `EncounterService/AssignProvider` con `expected_version`. | No (un toque en la lista asigna) | Snackbar «Proveedor actualizado.». Errores: «Ese usuario no es un proveedor activo en esta sede.», «Solo recepción o administradores pueden asignar un proveedor; los proveedores pueden asignarse a sí mismos.», «La visita ya está cerrada.» o el texto genérico. |
| «Asignarme» | Usuario con rol Proveedor; visita abierta y no asignada a él | `AssignProvider` a sí mismo. | No | Mismo resultado que la fila anterior. |
| Mantener pulsado un código humano | Todos | Lo copia al portapapeles. | No | Sin aviso visual. |

**Estados y mensajes**

- Sin edad si la fecha de nacimiento no es válida o el paciente no se cargó.
- Botones de asignación ocultos en visitas cerradas y mientras se asigna.
- Tono del chip de estado: info (azul) para «Registrado», «Esperando enfermería», «Esperando proveedor» y «Listo para caja»; éxito (verde) para «Con enfermería», «Con proveedor», «En caja» y «Completada»; advertencia (ámbar) para «Procedimiento pendiente»; neutro (gris) para «Se retiró» y «Cancelada».

**Tiempo real**

Se reconstruye cada vez que la visita se recarga (`encounter.*`, `vitals.changed`, `order.*`, `billing.changed` o resincronización). Los cronómetros avanzan cada segundo en el dispositivo.

**Reglas de negocio**

- El proveedor asignado debe ser un usuario activo con rol Proveedor en la sede de la visita.
- Un proveedor puede tomar con «Asignarme» una visita asignada a otro proveedor.
- No se puede asignar proveedor en visitas cerradas.
- El nombre del proveedor sale primero del dato que trae la visita y, si falta, del directorio de proveedores de la sede.

**Notas para el rediseño**

- Conservar el código humano en monoespaciado y la edad; el nombre completo del paciente está en el título de la página.
- Conservar los dos tiempos (total y en el estado actual): son la métrica de espera de la clínica.
- El verde «éxito» se usa a la vez para estados en curso («Con enfermería», «Con proveedor», «En caja») y para «Completada», con el mismo icono de check.
- La copia por pulsación larga no tiene aviso ni indicio visible.
- «Sede» muestra la sede activa, no un dato propio de la visita (coinciden por diseño de la guarda de ruta).

**Código fuente:** `features/encounters/presentation/encounter_header.dart`, `waiting_time_ticker.dart`, `appointment_type_text.dart`, `features/encounters/domain/encounter_display.dart`, `core/widgets/human_code_text.dart`.

---

### <a id="p-cli--s-cli-06--dialogo-asignar-proveedor"></a>S-CLI-06 Diálogo «Asignar proveedor»

**Ruta:** diálogo sobre `/app/<código>/encounters/<encounterId>` · **Tipo:** diálogo

**Propósito**

Elegir el proveedor de la visita entre los proveedores activos de la sede.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Lo abre con «Asignar proveedor» o «Cambiar proveedor». |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | Botón oculto. |
| Proveedor | Sin acceso | Botón oculto (solo dispone de «Asignarme» en [S-CLI-05](08_pantallas_clinicas.md#p-cli--s-cli-05--encabezado-de-la-visita-con-celda-de-proveedor)). |

**Cómo se llega**

Encabezado de la visita ([S-CLI-05](08_pantallas_clinicas.md#p-cli--s-cli-05--encabezado-de-la-visita-con-celda-de-proveedor)) → «Asignar proveedor» o «Cambiar proveedor».

**Distribución**

- Título «Asignar proveedor».
- Lista (420 × 320 px) con los proveedores ordenados por nombre (`UserService/ListProviders` de la sede activa); el actual aparece con el radio lleno.
- Acción «Cancelar».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| Proveedor | Lista de selección única (un toque elige y cierra) | Sí, para asignar | Solo proveedores activos de la sede | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Tocar un proveedor | Recepción, Administrador | Cierra y ejecuta `AssignProvider` (ver [S-CLI-05](08_pantallas_clinicas.md#p-cli--s-cli-05--encabezado-de-la-visita-con-celda-de-proveedor)). | No | «Proveedor actualizado.». Tocar el proveedor actual no cambia nada (el servidor responde sin escribir). |
| «Cancelar» | Ídem | Cierra sin cambios. | — | — |

**Estados y mensajes**

- Cargando: spinner. Error: «Algo salió mal» + «Reintentar».
- Vacío: «No hay proveedores activos en esta sede.»

**Tiempo real**

El directorio de proveedores se guarda en caché durante la sesión y se vuelve a leer en cada reconexión del WebSocket.

**Reglas de negocio**

- Solo usuarios ACTIVOS con rol Proveedor en la sede.

**Notas para el rediseño**

- No hay confirmación: un toque asigna. Si se teme el toque accidental, valorar un patrón de selección + «Guardar».
- Sin buscador: con muchos proveedores la lista crece sin filtro.

**Código fuente:** `features/encounters/presentation/assign_provider_dialog.dart`, `core/staff/provider_directory.dart`.

---

### <a id="p-cli--s-cli-07--barra-de-acciones-de-la-visita-incluye-banner-de-visita-cerrada"></a>S-CLI-07 Barra de acciones de la visita (incluye banner de visita cerrada)

**Ruta:** dentro de `/app/<código>/encounters/<encounterId>` · **Tipo:** panel

**Propósito**

Mover la visita por su máquina de estados según el rol, cerrarla o (solo el Administrador) forzar un estado.

**Acceso por rol**

| Rol | Acceso | Botones que puede ver |
| --- | --- | --- |
| Administrador | Completo | Todos los de los demás roles más «Forzar estado…» (permiso `exceptionalStateOverride`). |
| Recepción | Limitado | «Enviar a enfermería», «Enviar a procedimiento» desde «Registrado» y «Cerrar visita…» (`checkIn`); «Iniciar pago» (`recordManualPayment`); «Completar visita» (`generateReceipt`). |
| Enfermería / asistente médico | Limitado | «Iniciar enfermería» y «Enviar al proveedor» (`enterNursingAssessment`); «Listo para pago» desde «Procedimiento pendiente» (`executeOrder`). |
| Proveedor | Limitado | «Iniciar consulta», «Enviar a procedimiento» y «Listo para pago» desde «Con proveedor» (`createClinicalOrder`); «Listo para pago» desde «Procedimiento pendiente» (`executeOrder`). |

Los botones que no aplican se ocultan; el servidor responde `transition_not_owned` o `invalid_transition` si se intenta un paso ajeno.

**Cómo se llega**

Debajo del encabezado en la pantalla de la visita ([S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita)).

**Distribución**

- Fila de botones que se reparte en varias líneas: la primera acción regular como botón relleno (icono de flecha), las siguientes como botón tonal; «Cerrar visita…» como botón con borde (icono de salir); «Forzar estado…» como botón de texto (icono de escudo).
- Spinner a la derecha mientras se ejecuta una acción (todos los botones deshabilitados).
- Sin botones: texto «No hay acciones disponibles para su rol en este estado.»
- Visita cerrada: banner gris con candado «Esta visita está cerrada.» + «Motivo: {motivo}» si existe; si además hay acciones (Administrador), el banner va encima de los botones.

**Campos**

Sin campos (los motivos se piden en [S-CLI-09](08_pantallas_clinicas.md#p-cli--s-cli-09--dialogo-cerrar-visita) y [S-CLI-10](08_pantallas_clinicas.md#p-cli--s-cli-10--dialogo-cambio-excepcional-de-estado)).

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Acción regular («Enviar a enfermería», «Iniciar enfermería», «Enviar al proveedor», «Iniciar consulta», «Enviar a procedimiento», «Listo para pago», «Iniciar pago», «Completar visita») | Según la tabla de acceso, el estado y la ruta | `EncounterService/TransitionEncounter` con `expected_version`. | No | Snackbar «Visita movida a {estado}.». |
| — si quedan órdenes abiertas | — | El servidor responde `open_orders` al pasar a «Listo para caja» o «En caja». | — | Diálogo [S-CLI-08](08_pantallas_clinicas.md#p-cli--s-cli-08--dialogo-ordenes-abiertas). |
| — si otra persona cambió la visita | — | Conflicto de versión. | — | Snackbar «Otra persona actualizó esta visita. La pantalla se ha actualizado.» y la visita se recarga. |
| — otros errores | — | — | — | Snackbar traducido: «Esta transición no está permitida en el estado actual.», «Su rol no realiza este paso.», «La visita ya está cerrada.», «Este cambio requiere un motivo.», etc. |
| «Cerrar visita…» | Recepción, Administrador; visita abierta | Abre [S-CLI-09](08_pantallas_clinicas.md#p-cli--s-cli-09--dialogo-cerrar-visita) → `EncounterService/CloseEncounter`. | Sí (diálogo con motivo) | Visita cerrada con banner. |
| «Forzar estado…» | Administrador; cualquier estado, también cerrada | Abre [S-CLI-10](08_pantallas_clinicas.md#p-cli--s-cli-10--dialogo-cambio-excepcional-de-estado) → `TransitionEncounter` con motivo. | Sí (diálogo con motivo) | Estado cambiado; queda «Forzado» en el historial. |

**Estados y mensajes**

- Ocupado: spinner + botones deshabilitados.
- Visita cerrada sin acciones: solo el banner.
- Visita cerrada vista por un Administrador: banner + «Forzar estado…».

**Tiempo real**

Los botones se recalculan cada vez que la visita se recarga por eventos en tiempo real (p. ej. cuando otro puesto la mueve de estado).

**Reglas de negocio**

- Ruta Estándar: «Registrado» → «Enviar a enfermería» → «Esperando enfermería» → «Iniciar enfermería» → «Con enfermería» → «Enviar al proveedor» → «Esperando proveedor» → «Iniciar consulta» → «Con proveedor» → «Enviar a procedimiento» (→ «Procedimiento pendiente») o «Listo para pago» (→ «Listo para caja»); «Procedimiento pendiente» → «Listo para pago»; «Listo para caja» → «Iniciar pago» (→ «En caja»); «En caja» → «Completar visita» (→ «Completada»).
- Rutas directas (Solo inyección, Solo laboratorio, Solo procedimiento): «Registrado» → «Enviar a procedimiento» → «Procedimiento pendiente» → «Listo para pago» → «Listo para caja» → «Iniciar pago» → «En caja» → «Completar visita». No pasan por enfermería ni por el proveedor.
- Bloqueo por órdenes abiertas: «Con proveedor» → «Listo para caja», «Procedimiento pendiente» → «Listo para caja» y «Listo para caja» → «En caja» se rechazan mientras haya órdenes Pendientes o En curso.
- Cerrar («Se retiró» o «Cancelada») es posible desde cualquier estado abierto y solo con `CloseEncounter` y un motivo; `TransitionEncounter` rechaza esos destinos (`use_close_encounter`).
- Cambio excepcional del Administrador: los destinos son todos los estados excepto el actual, «Se retiró», «Cancelada» y los que ya son acciones regulares; exige motivo; puede reabrir una visita cerrada; queda marcado como «Forzado» en el historial y en la auditoría.
- El servidor no exige proveedor asignado para pasar a «Con proveedor».

**Notas para el rediseño**

- Conservar que las acciones visibles salgan de estado × ruta × permisos y que el servidor tenga la última palabra (sus mensajes de error deben seguir mostrándose).
- Conservar la jerarquía visual: la acción principal destacada, y cerrar y forzar diferenciados como acciones de riesgo.
- Inconsistencia importante: «Enviar al proveedor» aquí hace `TransitionEncounter` sin confirmación y sin exigir signos vitales; el botón del mismo nombre de la sección Enfermería ([S-CLI-16](08_pantallas_clinicas.md#p-cli--s-cli-16--confirmacion-enviar-al-proveedor-dos-variantes)) usa `CompleteNursing`, confirma y el servidor exige peso o presión arterial. Mismo texto, reglas distintas.
- «Iniciar consulta» aquí no autoasigna al proveedor ni impide iniciar la visita de otro proveedor; la Cola de proveedor ([S-CLI-02](08_pantallas_clinicas.md#p-cli--s-cli-02--cola-de-proveedor)) sí lo hace.
- El servidor permite al Administrador forzar el paso con órdenes abiertas dando un motivo, pero la interfaz no lo ofrece (el diálogo de cambio excepcional excluye las acciones regulares y la acción regular no envía motivo).
- Terminología: acción «Listo para pago» frente al estado «Listo para caja»; «Iniciar pago» frente a «En caja»; menú «Caja»; botón «Ir a checkout».
- Gramática del snackbar con estados de cierre: «Visita movida a Se retiró.».

**Código fuente:** `features/encounters/presentation/encounter_action_bar.dart`, `features/encounters/domain/transitions.dart`, `features/encounters/presentation/encounter_labels.dart`, `features/encounters/application/encounter_commands.dart`.

---

### <a id="p-cli--s-cli-08--dialogo-ordenes-abiertas"></a>S-CLI-08 Diálogo «Órdenes abiertas»

**Ruta:** diálogo sobre `/app/<código>/encounters/<encounterId>` · **Tipo:** diálogo

**Propósito**

Explicar que la visita tiene órdenes sin resolver y llevar directamente a la sección de órdenes.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Al intentar cualquiera de las transiciones bloqueadas. |
| Recepción | Completo | Al pulsar «Iniciar pago». |
| Enfermería / asistente médico | Completo | Al pulsar «Listo para pago» desde «Procedimiento pendiente». |
| Proveedor | Completo | Al pulsar «Listo para pago» desde «Con proveedor» o «Procedimiento pendiente». |

Lo decide el servidor (`FAILED_PRECONDITION` con motivo `open_orders`).

**Cómo se llega**

Respuesta del servidor al pulsar una acción de [S-CLI-07](08_pantallas_clinicas.md#p-cli--s-cli-07--barra-de-acciones-de-la-visita-incluye-banner-de-visita-cerrada) mientras hay órdenes Pendientes o En curso.

**Distribución**

- Título «Órdenes abiertas».
- Texto «Esta visita aún tiene órdenes pendientes o en curso. Complételas o cancélelas antes de continuar.»
- Acciones «Cerrar» e «Ir a órdenes» (relleno; solo si existe la sección Órdenes).

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Cerrar» | Todos | Cierra el diálogo. | — | La visita no cambia. |
| «Ir a órdenes» | Todos | Cierra, cambia a la pestaña «Resumen» y desplaza hasta la sección Órdenes. | — | [S-CLI-17](08_pantallas_clinicas.md#p-cli--s-cli-17--seccion-ordenes-de-la-visita) visible. |

**Estados y mensajes**

Sin estados adicionales.

**Tiempo real**

No aplica.

**Reglas de negocio**

- Las órdenes deben completarse o cancelarse antes de pasar a caja.

**Notas para el rediseño**

- Conservar el atajo directo a la sección de órdenes.
- El diálogo podría listar las órdenes abiertas en lugar de solo describirlas.
- En Caja el mismo error aparece como snackbar en la cola ([S-CAJ-02](09_pantallas_caja.md#p-caj--s-caj-02--tarjeta-de-visita-en-la-cola-de-caja)) y como diálogo propio en el checkout ([S-CAJ-06](09_pantallas_caja.md#p-caj--s-caj-06--dialogo-ordenes-abiertas)).

**Código fuente:** `features/encounters/presentation/encounter_action_bar.dart`.

---

### <a id="p-cli--s-cli-09--dialogo-cerrar-visita"></a>S-CLI-09 Diálogo «Cerrar visita»

**Ruta:** diálogo sobre `/app/<código>/encounters/<encounterId>` · **Tipo:** diálogo

**Propósito**

Terminar una visita que no seguirá el flujo (el paciente se fue o la visita se canceló), con motivo obligatorio.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Permiso `checkIn`. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | Botón «Cerrar visita…» oculto; el servidor responde `transition_not_owned`. |
| Proveedor | Sin acceso | Ídem. |

**Cómo se llega**

[S-CLI-07](08_pantallas_clinicas.md#p-cli--s-cli-07--barra-de-acciones-de-la-visita-incluye-banner-de-visita-cerrada) → «Cerrar visita…» (solo en visitas abiertas).

**Distribución**

- Título «Cerrar visita».
- Texto «La visita se cerrará y no podrá continuar. Se requiere un motivo.»
- Etiqueta «Resultado» con los radios «Se retiró antes» (por defecto) y «Cancelada».
- Campo «Motivo» (3 líneas, contador 0/500, foco automático).
- Acciones «Cancelar» y «Cerrar visita» (rojo).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Resultado» | Radio: «Se retiró antes» (`LEFT_EARLY`) o «Cancelada» (`CANCELLED`) | Sí (por defecto «Se retiró antes») | — | No |
| «Motivo» | Texto multilínea; Enter envía | Sí («Se requiere un motivo.») | Máximo 500 caracteres («Máximo 500 caracteres.») | Sí (se guarda cifrado como nota clínica) |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Cerrar visita» | Recepción, Administrador | Valida y llama `EncounterService/CloseEncounter` con `expected_version`. | Este diálogo | Snackbar «Visita movida a {estado}.» y banner de visita cerrada en [S-CLI-07](08_pantallas_clinicas.md#p-cli--s-cli-07--barra-de-acciones-de-la-visita-incluye-banner-de-visita-cerrada); errores como en [S-CLI-07](08_pantallas_clinicas.md#p-cli--s-cli-07--barra-de-acciones-de-la-visita-incluye-banner-de-visita-cerrada). |
| «Cancelar» | Ídem | Cierra sin cambios. | — | — |

**Estados y mensajes**

- Error de validación bajo el campo «Motivo».

**Tiempo real**

La visita sale de las colas en todos los puestos por `encounter.state_changed`.

**Reglas de negocio**

- Visita cerrada = sin más acciones de flujo; los datos de enfermería pasan a solo lectura y las órdenes quedan sin acciones de ejecución (solo el Administrador puede cancelarlas).
- El historial clínico nunca se borra.

**Notas para el rediseño**

- Conservar el motivo obligatorio y el botón destructivo en rojo.
- El nombre del resultado («Se retiró antes») y el del estado resultante («Se retiró») difieren.

**Código fuente:** `features/encounters/presentation/reason_dialogs.dart`, `features/encounters/presentation/encounter_action_bar.dart`.

---

### <a id="p-cli--s-cli-10--dialogo-cambio-excepcional-de-estado"></a>S-CLI-10 Diálogo «Cambio excepcional de estado»

**Ruta:** diálogo sobre `/app/<código>/encounters/<encounterId>` · **Tipo:** diálogo

**Propósito**

Corregir el estado de una visita fuera del flujo normal, con un motivo que queda en la auditoría.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Permiso `exceptionalStateOverride`. |
| Recepción | Sin acceso | Botón «Forzar estado…» oculto. |
| Enfermería / asistente médico | Sin acceso | Ídem. |
| Proveedor | Sin acceso | Ídem. |

**Cómo se llega**

[S-CLI-07](08_pantallas_clinicas.md#p-cli--s-cli-07--barra-de-acciones-de-la-visita-incluye-banner-de-visita-cerrada) → «Forzar estado…» (en cualquier estado, también en visitas cerradas).

**Distribución**

- Título «Cambio excepcional de estado».
- Aviso ámbar con icono: «Esto omite el flujo normal. El cambio queda registrado en la auditoría con su motivo.»
- Desplegable «Nuevo estado» (preseleccionado el primero disponible).
- Campo «Motivo» (3 líneas, contador 0/500).
- Acciones «Cancelar» y «Forzar».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Nuevo estado» | Desplegable | Sí | Lista: todos los estados salvo el actual, «Se retiró», «Cancelada» y los destinos regulares | No |
| «Motivo» | Texto multilínea | Sí («Se requiere un motivo.») | Máx. 500 caracteres | Sí (se guarda cifrado) |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Forzar» | Administrador | `TransitionEncounter` con el estado destino y el motivo. | Este diálogo | Snackbar «Visita movida a {estado}.»; en el historial ([S-CLI-24](08_pantallas_clinicas.md#p-cli--s-cli-24--pestana-historial-de-la-visita)) aparece con el chip «Forzado» y el motivo. |
| «Cancelar» | Administrador | Cierra sin cambios. | — | — |

**Estados y mensajes**

- «Forzar» deshabilitado si no hay ningún destino disponible.

**Tiempo real**

Emite `encounter.state_changed` a todas las pantallas abiertas.

**Reglas de negocio**

- Puede reabrir visitas cerradas (el cambio excepcional no está bloqueado por los estados finales).
- No sirve para cerrar: «Se retiró» y «Cancelada» se aplican con [S-CLI-09](08_pantallas_clinicas.md#p-cli--s-cli-09--dialogo-cerrar-visita).

**Notas para el rediseño**

- Conservar el aviso de auditoría y el motivo obligatorio.
- No hay doble confirmación ni resumen «de → a» antes de forzar, ni un aviso específico cuando se reabre una visita cerrada (con posible impacto en la facturación).

**Código fuente:** `features/encounters/presentation/reason_dialogs.dart`, `features/encounters/domain/transitions.dart`.

---

### <a id="p-cli--s-cli-11--tarjeta-cobertura"></a>S-CLI-11 Tarjeta «Cobertura»

**Ruta:** dentro de `/app/<código>/encounters/<encounterId>` (pestaña «Resumen», primera tarjeta) · **Tipo:** panel

**Propósito**

Mostrar la cobertura capturada en el registro de llegada (pago directo, seguro o membresía) y permitir corregirla.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Ve y edita (permiso `checkIn`) con la visita abierta. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Limitado | Solo lectura (icono de edición oculto). |
| Proveedor | Limitado | Solo lectura. |

El servidor entrega la cobertura a quien tiene `ViewCharges` o `RecordManualPayment` (los cuatro roles).

**Cómo se llega**

Pantalla de la visita ([S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita)), pestaña «Resumen».

**Distribución**

- Encabezado: icono de tarjeta, título «Cobertura», chip azul con el tipo («Pago directo», «Seguro», «Membresía», «Sin definir») y botón de lápiz «Editar cobertura».
- Cuerpo: pares etiqueta / valor, solo de lo informado: «Aseguradora», «ID de miembro», «Copago», «Coaseguro» («{n} %»), «Deducible», «Plan de membresía» (nombre del plan o «Plan» si no se puede resolver).
- Sin cobertura: «No se registró cobertura.»; con tipo pero sin datos: solo el nombre del tipo.

**Campos**

Solo lectura (la edición está en [S-CLI-12](08_pantallas_clinicas.md#p-cli--s-cli-12--dialogo-cobertura-editar-cobertura)).

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Aseguradora», «ID de miembro» | Texto | — | — | Sí (cifrados en reposo) |
| «Copago», «Coaseguro», «Deducible» | Importe / porcentaje | — | — | Sí (datos del seguro) |
| «Plan de membresía» | Nombre de catálogo | — | — | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Lápiz «Editar cobertura» | Recepción, Administrador; visita abierta | Abre el diálogo de edición. | — | [S-CLI-12](08_pantallas_clinicas.md#p-cli--s-cli-12--dialogo-cobertura-editar-cobertura). |

**Estados y mensajes**

- Sin cobertura / solo tipo / con datos.
- Visita cerrada: sin botón de edición.

**Tiempo real**

Se actualiza cuando se recarga la visita.

**Reglas de negocio**

- Los datos del seguro son PHI cifrada en reposo; se muestran en claro a los cuatro roles.
- La cobertura determina la regla de porción del paciente en el estado de cuenta ([S-CAJ-07](09_pantallas_caja.md#p-caj--s-caj-07--tarjeta-estado-de-cuenta-lineas-cobertura-totales)).

**Notas para el rediseño**

- Conservar que solo Recepción y Administración editen, y solo con la visita abierta.
- Los importes de copago y deducible se muestran como texto plano, sin formato de moneda.

**Código fuente:** `features/encounters/presentation/payer_card.dart`, `features/encounters/application/encounter_providers.dart`.

---

### <a id="p-cli--s-cli-12--dialogo-cobertura-editar-cobertura"></a>S-CLI-12 Diálogo «Cobertura» (editar cobertura)

**Ruta:** diálogo sobre `/app/<código>/encounters/<encounterId>` (pantalla completa en menos de 600 px) · **Tipo:** diálogo

**Propósito**

Corregir la cobertura de la visita; afecta a la facturación.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Con la visita abierta. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | No ve el lápiz. |
| Proveedor | Sin acceso | Ídem. |

El servidor (`SetPayerSnapshot`) valida permisos y datos.

**Cómo se llega**

[S-CLI-11](08_pantallas_clinicas.md#p-cli--s-cli-11--tarjeta-cobertura) → lápiz «Editar cobertura».

**Distribución**

- Título «Cobertura» (en teléfono, barra superior con el mismo título).
- Banner rojo de error si falla el guardado.
- Desplegable «Tipo de cobertura».
- Con «Seguro»: «Aseguradora», «ID de miembro», fila «Copago» (pista `0.00`) + «Coaseguro» (sufijo %), «Deducible» (pista `0.00`).
- Con «Membresía»: «ID de miembro» y desplegable «Plan de membresía» (planes activos + el actual).
- Acciones «Cancelar» y «Guardar» (spinner al enviar).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Tipo de cobertura» | Desplegable: «Pago directo» (por defecto si no había), «Seguro», «Membresía» | Sí | — | No |
| «Aseguradora» | Texto (mayúscula inicial por palabra) | Sí con Seguro | «El nombre de la aseguradora es obligatorio para cobertura con seguro.» | Sí (cifrada) |
| «ID de miembro» | Texto | No (Seguro o Membresía) | — | Sí (cifrado) |
| «Copago» | Decimal | No | Hasta 10 dígitos y 2 decimales: «Ingrese un monto válido (hasta 2 decimales).» | Sí |
| «Coaseguro» | Decimal con % | No | 0 a 100: «Ingrese un porcentaje entre 0 y 100.» | Sí |
| «Deducible» | Decimal | No | Igual que Copago | Sí |
| «Plan de membresía» | Desplegable | Sí con Membresía | «Seleccione un plan de membresía.» (en el banner) | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Guardar» | Recepción, Administrador | `EncounterService/SetPayerSnapshot` con `expected_version`; solo se envían los campos del tipo elegido (los demás vacíos). | No | Snackbar «Cobertura guardada.» y cierra. |
| — error de validación del servidor | — | — | — | Banner rojo dentro del diálogo. |
| — conflicto de versión | — | — | — | El diálogo se cierra (la visita se recarga) sin aviso visible. |
| «Cancelar» | Ídem | Cierra sin guardar. | No | — |

**Estados y mensajes**

- Enviando: campos y botones deshabilitados, spinner.
- Error: banner rojo.

**Tiempo real**

No aplica dentro del diálogo; la tarjeta y la facturación se recargan después.

**Reglas de negocio**

- Cualquier edición marca el formulario como «sucio»: cambiar de sede desde la cabecera pide confirmación de descarte ([S-CLI-26](08_pantallas_clinicas.md#p-cli--s-cli-26--dialogo-descartar-cambios-sin-guardar)).

**Notas para el rediseño**

- Conservar las validaciones de monto y porcentaje y el plan obligatorio.
- En un conflicto de versión el diálogo se cierra sin explicar qué pasó.
- Cerrar tocando fuera descarta los cambios sin aviso (no usa la protección de cambios sin guardar).

**Código fuente:** `features/encounters/presentation/payer_card.dart`, `features/encounters/application/encounter_commands.dart`.

---

### <a id="p-cli--s-cli-13--seccion-enfermeria-vista-completa-y-vista-limitada"></a>S-CLI-13 Sección «Enfermería» (vista completa y vista limitada)

**Ruta:** dentro de `/app/<código>/encounters/<encounterId>` (sección `nursing`, orden 10; enlace `?section=nursing`) · **Tipo:** panel

**Propósito**

Registrar y consultar los signos vitales y la valoración de enfermería (alergias, antecedentes, síntomas, notas) y enviar al paciente al proveedor.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Edita signos vitales y valoración; ve «Enviar al proveedor». |
| Recepción | Limitado | Vista limitada: el servidor devuelve solo estado y fechas (`limited_view`), nunca valores. |
| Enfermería / asistente médico | Completo | Edita signos vitales y valoración; ve «Enviar al proveedor». |
| Proveedor | Limitado | Ve todo; edita solo signos vitales (`enterVitals`); la valoración es de solo lectura (no tiene `enterNursingAssessment`). |

La sección exige `viewNursingData` (los cuatro roles). Los botones «Editar» se ocultan sin permiso; el servidor responde `PERMISSION_DENIED` o `nursing_detail_restricted` («Su rol solo puede ver el resumen de enfermería.»).

**Cómo se llega**

Pantalla de la visita ([S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita)), pestaña «Resumen», tarjeta «Enfermería» (icono de monitor). Enlace profundo `?section=nursing`.

**Distribución**

- Vista limitada (Recepción): tres filas con icono de check o círculo: «Signos vitales» → «Registrado {fecha hora}» o «Sin registrar»; «Valoración» → «Actualizado {fecha hora}» o «Sin registrar»; «Enfermería completada» → «Completado {fecha hora}» o «Pendiente»; nota «Los valores clínicos solo son visibles para el personal clínico.»
- Vista completa: si enfermería terminó, chip verde «Completado {fecha hora}».
- Bloque «Signos vitales» (subtítulo «Registrado {fecha hora}» si existe; botón «Editar»): el formulario [S-CLI-14](08_pantallas_clinicas.md#p-cli--s-cli-14--formulario-signos-vitales-registro-y-correccion) o un resumen de solo lectura en rejilla: «Peso» {n} lb, «Estatura» {ft}' {in}" ({total} in), «IMC», «Presión arterial» {sis}/{dia} mmHg, «Pulso» lpm, «Respiraciones» /min, «Temperatura» °F, «SpO2» %, «Glucosa» mg/dL, «Dolor» {n} / 10; vacío: «Aún no se registraron signos vitales.»
- Separador; bloque «Valoración» (subtítulo «Actualizado {fecha hora}»; botón «Editar»): el formulario [S-CLI-15](08_pantallas_clinicas.md#p-cli--s-cli-15--formulario-valoracion-alergias-antecedentes-sintomas-notas-de-enfermeria) o la lectura con un desplegable por apartado con texto (abierto «Síntomas / motivo de consulta»); vacío: «Aún no se registró la valoración.»
- Separador y botón «Enviar al proveedor» ([S-CLI-16](08_pantallas_clinicas.md#p-cli--s-cli-16--confirmacion-enviar-al-proveedor-dos-variantes)) alineado a la derecha, cuando corresponde.

**Campos**

Ver [S-CLI-14](08_pantallas_clinicas.md#p-cli--s-cli-14--formulario-signos-vitales-registro-y-correccion) y [S-CLI-15](08_pantallas_clinicas.md#p-cli--s-cli-15--formulario-valoracion-alergias-antecedentes-sintomas-notas-de-enfermeria).

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Editar» en Signos vitales | Enfermería, Proveedor, Administrador (`enterVitals`); visita abierta | Abre [S-CLI-14](08_pantallas_clinicas.md#p-cli--s-cli-14--formulario-signos-vitales-registro-y-correccion) con botón «Cancelar». | No | Formulario en edición. |
| «Editar» en Valoración | Enfermería, Administrador (`enterNursingAssessment`); visita abierta | Abre [S-CLI-15](08_pantallas_clinicas.md#p-cli--s-cli-15--formulario-valoracion-alergias-antecedentes-sintomas-notas-de-enfermeria) con botón «Cancelar». | No | Formulario en edición. |
| «Enviar al proveedor» | Enfermería, Administrador; estado «Esperando enfermería» o «Con enfermería»; ruta Estándar | Confirmación y `CompleteNursing`. | Sí | [S-CLI-16](08_pantallas_clinicas.md#p-cli--s-cli-16--confirmacion-enviar-al-proveedor-dos-variantes). |

**Estados y mensajes**

- Carga inicial: spinner; error sin datos: banner rojo compacto con «Reintentar»; recarga: barra fina; error con datos: banner compacto encima.
- Modo inicial: en «Esperando enfermería» o «Con enfermería» los formularios se abren directamente en edición para quien tiene el permiso (también para un proveedor en ese estado); en los demás estados se muestra la lectura con «Editar».
- Visita cerrada: solo lectura, sin «Editar».

**Tiempo real**

Se recarga con `vitals.changed` y `encounter.*` de esta visita y al resincronizar; también tras cada guardado propio.

**Reglas de negocio**

- Signos vitales y valoración se pueden escribir en «Registrado», «Esperando enfermería», «Con enfermería», «Esperando proveedor», «Con proveedor» y «Procedimiento pendiente»; en «Listo para caja» y «En caja» el servidor los bloquea («Los datos de enfermería están bloqueados para esta visita.»); con la visita cerrada: «La visita ya está cerrada.».
- La sede activa debe ser la de la visita (si no, `PERMISSION_DENIED`).
- Alergias y antecedentes se registran por visita: no se arrastran de visitas anteriores.
- El texto clínico de solo lectura no se puede seleccionar ni copiar (control HIPAA 164.312(b)).

**Notas para el rediseño**

- Conservar la vista limitada de Recepción sin ningún valor clínico.
- Conservar el texto clínico no copiable en la lectura.
- «Editar» aparece en «Listo para caja» y «En caja» aunque el servidor rechazará el guardado.
- En la etapa de enfermería hay dos formularios abiertos a la vez, cada uno con su propio botón de guardar: riesgo de guardar uno y olvidar el otro (no existe «guardar y enviar»).
- El comentario del código dice que los proveedores empiezan en solo lectura, pero el modo inicial depende del estado de la visita, no del rol.

**Código fuente:** `features/nursing/presentation/nursing_section.dart`, `features/nursing/application/nursing_providers.dart`, `nursing_commands.dart`, `features/nursing/infrastructure/nursing_gateway.dart`, `features/nursing/domain/nursing_summary_display.dart`, `features/nursing/presentation/nursing_labels.dart`.

---

### <a id="p-cli--s-cli-14--formulario-signos-vitales-registro-y-correccion"></a>S-CLI-14 Formulario «Signos vitales» (registro y corrección)

**Ruta:** dentro de la sección Enfermería de `/app/<código>/encounters/<encounterId>` · **Tipo:** panel

**Propósito**

Capturar o corregir los signos vitales en unidades imperiales, con vista previa del IMC.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Permiso `enterVitals`, visita abierta. |
| Recepción | Sin acceso | Solo vista limitada ([S-CLI-13](08_pantallas_clinicas.md#p-cli--s-cli-13--seccion-enfermeria-vista-completa-y-vista-limitada)). |
| Enfermería / asistente médico | Completo | Ídem Administrador. |
| Proveedor | Completo | Ídem Administrador. |

El servidor (`NursingService/UpsertVitals`) exige `EnterVitals` en la sede de la visita.

**Cómo se llega**

Abierto por defecto en la etapa de enfermería, o con «Editar» en el bloque «Signos vitales» de [S-CLI-13](08_pantallas_clinicas.md#p-cli--s-cli-13--seccion-enfermeria-vista-completa-y-vista-limitada).

**Distribución**

- Banner rojo de error (si falla el guardado o el IMC / la estatura no son válidos).
- Fila: «Peso» (lb) | «Estatura»: en modo «ft / in», dos campos (pies «ft» + pulgadas «in»); en modo «pulgadas», un campo «Estatura (pulgadas totales)»; debajo, selector segmentado «ft / in» | «pulgadas» (convierte el valor al cambiar).
- Línea de IMC: «IMC: {valor o —}» y el texto «Solo vista previa; el valor guardado lo calcula el servidor al guardar.» + « · Guardado: {imc}» si existe.
- «Presión arterial»: «Sistólica» | «Diastólica» (mmHg).
- «Pulso» (lpm) | «Respiraciones» (/min).
- «Temperatura» (°F) | «SpO2» (%).
- «Glucosa» (mg/dL, ayuda «Opcional») | interruptor «Dolor (0–10)» (subtítulo «Opcional» o el valor) y deslizador de 0 a 10 cuando está activo.
- Acciones: «Cancelar» (solo si se abrió con «Editar») y «Guardar signos vitales» (deshabilitado si no hay cambios).

**Campos**

Todos son opcionales, se validan al escribir y son PHI.

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Peso» | Decimal (solo dígitos y punto), lb | No | 1 a 1500, máx. 2 decimales: «Ingrese un número (hasta 2 decimales).» / «Debe estar entre 1 y 1500.» | Sí |
| Estatura «ft» | Entero | No | 0 a 9: «Ingrese un número entero.» / «Debe estar entre 0 y 9.» | Sí |
| Estatura «in» (modo ft / in) | Decimal | No | Menor que 12: «Las pulgadas deben ser menores que 12 cuando se indican pies.» | Sí |
| «Estatura (pulgadas totales)» | Decimal | No | 10 a 108 (en modo ft / in el total también se valida al guardar) | Sí |
| «Sistólica» | Entero, mmHg | No | 40 a 300 | Sí |
| «Diastólica» | Entero, mmHg | No | 20 a 200 y menor que la sistólica: «La diastólica debe ser menor que la sistólica.» | Sí |
| «Pulso» | Entero, lpm | No | 20 a 300 | Sí |
| «Respiraciones» | Entero, /min | No | 4 a 80 | Sí |
| «Temperatura» | Decimal, °F | No | 80 a 115 | Sí |
| «SpO2» | Entero, % | No | 50 a 100 | Sí |
| «Glucosa» | Entero, mg/dL | No | 10 a 1000 | Sí |
| «Dolor (0–10)» | Interruptor + deslizador entero | No | 0 a 10 | Sí |
| «IMC» | Calculado (703 × lb / in², 1 decimal) | — | Debe quedar entre 5 y 200: «El peso y la estatura dan un IMC inverosímil (debe estar entre 5 y 200).» | Sí |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Guardar signos vitales» | Enfermería, Proveedor, Administrador | Valida; envía solo los campos cambiados y los borrados como `clear_fields` (`NursingService/UpsertVitals` con `expected_vitals_version` del registro, no la versión de la visita). | No | Snackbar «Signos vitales guardados.» o, si era el primer registro en «Esperando enfermería» hecho por Enfermería o Administración en ruta Estándar, «Signos vitales guardados. Enfermería iniciada: la visita está ahora con enfermería.» (avance automático a «Con enfermería»). |
| — errores | — | — | — | Banner: «Los datos de enfermería están bloqueados para esta visita.», «La visita ya está cerrada.», «La diastólica debe ser menor que la sistólica.», «Un valor está fuera del rango aceptado.», conflicto «Este registro fue actualizado por otro usuario. Actualice para continuar.». |
| «Cancelar» | Ídem (solo si se abrió con «Editar») | Vuelve a la lectura descartando cambios. | No | — |
| Atrás del sistema o cambio de sede con cambios | Ídem | Pide confirmación. | Sí | [S-CLI-26](08_pantallas_clinicas.md#p-cli--s-cli-26--dialogo-descartar-cambios-sin-guardar). |

**Estados y mensajes**

- Enviando: campos deshabilitados, spinner en el botón.
- Sin cambios: botón deshabilitado.
- Error: banner rojo arriba.
- Tras guardar en la etapa de enfermería el formulario sigue abierto, reiniciado con los valores guardados.

**Tiempo real**

`vitals.changed` recarga el resumen; cuando cambia la versión del registro, el formulario se reconstruye con los valores del servidor.

**Reglas de negocio**

- Unidades fijas: lb, ft / in o pulgadas, mmHg, lpm, /min, °F, %, mg/dL.
- Los rangos son los mismos que valida el servidor, para que rara vez rechace.
- El IMC almacenado lo calcula el servidor.
- Vaciar un campo borra ese valor guardado.
- El registro tiene su propia versión: un cambio no clínico de la visita (p. ej. asignar proveedor) no bloquea el guardado.

**Notas para el rediseño**

- Conservar la validación en vivo, los rangos, las unidades y la vista previa del IMC con el aviso de que es preliminar.
- Conservar el envío parcial (solo cambios) y el borrado explícito.
- Conservar el orden de foco «siguiente» entre campos y el teclado numérico.
- Riesgo: si llega una actualización de signos vitales de otra persona mientras se edita, el formulario se reconstruye y lo tecleado se pierde sin aviso; lo mismo tras un conflicto.
- El campo de pulgadas en modo ft / in no tiene etiqueta (etiqueta en blanco): problema de accesibilidad.
- No hay conversión a unidades métricas.

**Código fuente:** `features/nursing/presentation/vitals_form.dart`, `features/nursing/domain/vitals_rules.dart`, `features/nursing/presentation/nursing_labels.dart`, `features/nursing/application/nursing_commands.dart`, `core/widgets/dirty_form_guard.dart`.

---

### <a id="p-cli--s-cli-15--formulario-valoracion-alergias-antecedentes-sintomas-notas-de-enfermeria"></a>S-CLI-15 Formulario «Valoración» (alergias, antecedentes, síntomas, notas de enfermería)

**Ruta:** dentro de la sección Enfermería de `/app/<código>/encounters/<encounterId>` · **Tipo:** panel

**Propósito**

Registrar la valoración de enfermería de la visita en ocho apartados de texto libre.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Permiso `enterNursingAssessment`, visita abierta. |
| Recepción | Sin acceso | Solo vista limitada ([S-CLI-13](08_pantallas_clinicas.md#p-cli--s-cli-13--seccion-enfermeria-vista-completa-y-vista-limitada)). |
| Enfermería / asistente médico | Completo | Ídem Administrador. |
| Proveedor | Limitado | Solo lectura. |

El servidor (`UpsertAssessment`) exige `EnterNursingAssessment`.

**Cómo se llega**

Abierto por defecto en la etapa de enfermería, o con «Editar» en el bloque «Valoración» de [S-CLI-13](08_pantallas_clinicas.md#p-cli--s-cli-13--seccion-enfermeria-vista-completa-y-vista-limitada).

**Distribución**

- Banner rojo de error si falla el guardado.
- Ocho apartados desplegables, en este orden: «Alergias», «Antecedentes personales», «Antecedentes familiares», «Cirugías», «Estilo de vida», «Historia reproductiva», «Síntomas / motivo de consulta», «Notas de enfermería». Cada uno muestra el contador «{n}/4000» (rojo si se excede) y «Sin registrar» si está vacío y cerrado.
- Abiertos al inicio: «Síntomas / motivo de consulta» y los que ya tienen texto.
- Acciones: «Cancelar» (si se abrió con «Editar») y «Guardar valoración».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Alergias» | Texto multilínea (3 a 10 líneas, mayúscula inicial de oración) | No | Máx. 4000 caracteres: «Máximo 4000 caracteres.» | Sí (cifrado en reposo) |
| «Antecedentes personales» | Ídem | No | Ídem | Sí |
| «Antecedentes familiares» | Ídem | No | Ídem | Sí |
| «Cirugías» | Ídem | No | Ídem | Sí |
| «Estilo de vida» | Ídem | No | Ídem | Sí |
| «Historia reproductiva» | Ídem | No | Ídem | Sí |
| «Síntomas / motivo de consulta» | Ídem | No | Ídem | Sí |
| «Notas de enfermería» | Ídem | No | Ídem | Sí |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Guardar valoración» | Enfermería, Administrador | Envía solo los apartados cambiados y los vaciados como `clear_fields` (`NursingService/UpsertAssessment` con `expected_assessment_version`). | No | Snackbar «Valoración guardada.»; igual que los signos vitales, puede avanzar la visita a «Con enfermería». |
| — errores | — | — | — | Banner (datos bloqueados, visita cerrada, conflicto, permiso). |
| «Cancelar» | Ídem (si se abrió con «Editar») | Descarta y vuelve a la lectura. | No | — |
| Atrás del sistema o cambio de sede con cambios | Ídem | Pide confirmación. | Sí | [S-CLI-26](08_pantallas_clinicas.md#p-cli--s-cli-26--dialogo-descartar-cambios-sin-guardar). |

**Estados y mensajes**

- Enviando: campos deshabilitados, spinner.
- Sin cambios: botón deshabilitado.

**Tiempo real**

Igual que [S-CLI-14](08_pantallas_clinicas.md#p-cli--s-cli-14--formulario-signos-vitales-registro-y-correccion): el formulario se reconstruye si cambia la versión del registro.

**Reglas de negocio**

- El texto se recorta (espacios al inicio y al final) antes de comparar y de enviar.
- La valoración es por visita: no existe un historial de alergias del paciente en otra pantalla.

**Notas para el rediseño**

- Conservar los ocho apartados, el contador y el límite de 4000 caracteres.
- Conservar que el Proveedor vea la valoración pero no la edite.
- «Alergias» es texto libre sin estructura y sin alerta destacada en otras pantallas (riesgo clínico).

**Código fuente:** `features/nursing/presentation/assessment_form.dart`, `features/nursing/domain/assessment_rules.dart`, `features/nursing/application/nursing_commands.dart`.

---

### <a id="p-cli--s-cli-16--confirmacion-enviar-al-proveedor-dos-variantes"></a>S-CLI-16 Confirmación «Enviar al proveedor» (dos variantes)

**Ruta:** diálogo sobre `/app/<código>/encounters/<encounterId>` · **Tipo:** diálogo

**Propósito**

Terminar la etapa de enfermería y pasar al paciente a la cola del proveedor.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | En «Esperando enfermería» o «Con enfermería», ruta Estándar. |
| Recepción | Sin acceso | Botón oculto. |
| Enfermería / asistente médico | Completo | Ídem Administrador. |
| Proveedor | Sin acceso | Botón oculto. |

Oculto también en las rutas directas. El servidor (`CompleteNursing`) exige `EnterNursingAssessment`.

**Cómo se llega**

Botón «Enviar al proveedor» al final de la sección Enfermería ([S-CLI-13](08_pantallas_clinicas.md#p-cli--s-cli-13--seccion-enfermeria-vista-completa-y-vista-limitada)).

**Distribución**

- Con peso o presión arterial completa ya guardados: título «¿Enviar al proveedor?», texto «El paciente pasará a la cola del proveedor.», botones «Cancelar» y «Enviar al proveedor».
- Sin ellos: título «Sin signos vitales», texto «Se requiere peso o presión arterial antes de enviar al proveedor; el servidor rechazará la solicitud. ¿Continuar de todos modos?», botones «Cancelar» y «Continuar» (rojo).

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Confirmar («Enviar al proveedor» o «Continuar») | Enfermería, Administrador | `NursingService/CompleteNursing` con `expected_encounter_version` (si la visita estaba en «Esperando enfermería», primero pasa a «Con enfermería» y luego a «Esperando proveedor»). | Este diálogo | Snackbar «Enviado al proveedor.» y navega a la Cola de enfermería ([S-CLI-01](08_pantallas_clinicas.md#p-cli--s-cli-01--cola-de-enfermeria)). Error: snackbar «Registre peso o presión arterial antes de enviar al proveedor.», «La enfermería solo puede completarse mientras el paciente está con enfermería.», conflicto, etc. |
| «Cancelar» | Ídem | No hace nada. | — | — |

**Estados y mensajes**

- El botón de la sección muestra un spinner mientras envía.

**Tiempo real**

`encounter.state_changed` mueve la tarjeta de la Cola de enfermería a la Cola de proveedor en los demás equipos.

**Reglas de negocio**

- Requisito del servidor: signos vitales guardados con peso, o con sistólica y diastólica.
- Solo cuenta lo ya guardado, no lo tecleado en el formulario sin guardar.

**Notas para el rediseño**

- Conservar la confirmación y la regla de peso o presión arterial.
- La variante «Sin signos vitales» invita a «Continuar» sabiendo que el servidor rechazará; mejor bloquear o llevar al formulario.
- Unificar con el «Enviar al proveedor» de la barra de acciones ([S-CLI-07](08_pantallas_clinicas.md#p-cli--s-cli-07--barra-de-acciones-de-la-visita-incluye-banner-de-visita-cerrada)), que hoy no confirma ni exige signos vitales.

**Código fuente:** `features/nursing/presentation/send_to_provider_button.dart`, `core/widgets/confirm_dialog.dart`, `features/nursing/domain/vitals_rules.dart`.

---

### <a id="p-cli--s-cli-17--seccion-ordenes-de-la-visita"></a>S-CLI-17 Sección «Órdenes» de la visita

**Ruta:** dentro de `/app/<código>/encounters/<encounterId>` (sección `orders`, orden 20; enlace `?section=orders`) · **Tipo:** panel

**Propósito**

Ver todas las órdenes de la visita con su estado, responsable y cargo estimado, y crearlas, ejecutarlas o cancelarlas según el rol.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | «Nueva orden» (`createClinicalOrder`) y todas las acciones de [S-CLI-19](08_pantallas_clinicas.md#p-cli--s-cli-19--barra-de-acciones-de-una-orden). |
| Recepción | Limitado | Solo lectura y sin notas clínicas. |
| Enfermería / asistente médico | Limitado | Ejecuta órdenes ([S-CLI-19](08_pantallas_clinicas.md#p-cli--s-cli-19--barra-de-acciones-de-una-orden)); no crea ni cancela. |
| Proveedor | Completo | «Nueva orden» y acciones de ejecución; cancela las suyas. |

La sección no exige permiso propio; el servidor exige `ViewQueue`. Las notas clínicas solo se devuelven a los roles que crean o ejecutan órdenes.

**Cómo se llega**

- Pantalla de la visita ([S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita)), pestaña «Resumen», tarjeta «Órdenes» (icono de portapapeles).
- «Abrir consulta» desde la Cola de órdenes ([S-CLI-03](08_pantallas_clinicas.md#p-cli--s-cli-03--cola-de-ordenes)).
- «Ir a órdenes» desde [S-CLI-08](08_pantallas_clinicas.md#p-cli--s-cli-08--dialogo-ordenes-abiertas).

**Distribución**

- Barra: chip «Mostrar canceladas ({n})» (solo si hay canceladas) y botón «Nueva orden» (icono +; solo para quien puede crear).
- Si no se pueden crear órdenes en el estado actual: texto «Las órdenes se crean mientras el paciente espera al proveedor o está con él, o durante una consulta solo de procedimiento.» y botón deshabilitado.
- Lista (más recientes primero), separadas por líneas. Cada orden:
- Chip de tipo con icono («Procedimiento», «Laboratorio», «Inyección»), nombre del ítem, código en monoespaciado, «Cant. {n}».
- Metadatos: «Ordenada por {nombre}» · «Ordenada {hora}» · «Asignada a {nombre}» o «Sin asignar» · «Laboratorio proveedor: {nombre}».
- «Notas: …» (solo roles clínicos) y «Cancelada: {motivo}».
- A la derecha: chip de estado y «Estimado {importe}» o «Estimación no disponible».
- Debajo: la barra de acciones de la orden ([S-CLI-19](08_pantallas_clinicas.md#p-cli--s-cli-19--barra-de-acciones-de-una-orden)).
- Vacío: «Aún no hay órdenes en esta consulta.»
- Pie (si hay órdenes): «Las estimaciones provienen del catálogo; el estado de cuenta es la autoridad.»

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Mostrar canceladas ({n})» | Conmutador local | No | No persiste al salir | No |
| «Notas» de cada orden | Texto (solo lectura) | — | — | Sí (nota clínica cifrada) |
| «Cancelada: {motivo}» | Texto (solo lectura) | — | — | Sí (cifrado) |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Nueva orden» | Proveedor, Administrador; visita abierta y en un estado que acepta órdenes | Abre [S-CLI-18](08_pantallas_clinicas.md#p-cli--s-cli-18--dialogo-nueva-orden). | — | Al crear: snackbar «Orden creada.». |
| Acciones de cada orden | Según [S-CLI-19](08_pantallas_clinicas.md#p-cli--s-cli-19--barra-de-acciones-de-una-orden) | Iniciar, completar, asignar o cancelar. | Según la acción | Ver [S-CLI-19](08_pantallas_clinicas.md#p-cli--s-cli-19--barra-de-acciones-de-una-orden) a [S-CLI-22](08_pantallas_clinicas.md#p-cli--s-cli-22--dialogo-asignar-orden). |

**Estados y mensajes**

- Cargando: spinner; error sin datos: banner compacto + «Reintentar»; recarga: barra fina; error con datos: banner encima.
- Chips de estado: «Pendiente» (ámbar), «En curso» (azul), «Completada» (verde), «Cancelada» (gris).

**Tiempo real**

`order.created` y `order.changed` recargan la lista; también la resincronización. Tras cada acción propia se recargan además la visita, el historial y la Cola de órdenes.

**Reglas de negocio**

- Estados que aceptan órdenes: «Esperando proveedor», «Con proveedor» y «Procedimiento pendiente»; en las rutas directas también «Registrado». Fuera de ellos el servidor responde `encounter_not_orderable`.
- Crear una orden crea su cargo en el estado de cuenta; cancelarla lo anula.
- Crear una orden no mueve la visita: el proveedor debe pulsar «Enviar a procedimiento» o «Listo para pago» ([S-CLI-07](08_pantallas_clinicas.md#p-cli--s-cli-07--barra-de-acciones-de-la-visita-incluye-banner-de-visita-cerrada)).
- Cuando la visita está en «Procedimiento pendiente» y se resuelve (completa o cancela) la última orden abierta, la visita pasa sola a «Listo para caja».
- Estimado = precio de catálogo × cantidad (en laboratorio con proveedor solicitado, el precio vigente de ese proveedor en la fecha de la sede); dinero exacto en centavos.

**Notas para el rediseño**

- Conservar el aviso de que el estimado no es el cargo oficial.
- Conservar las canceladas ocultas por defecto pero accesibles.
- No se muestra quién ni cuándo inició o completó la orden, aunque el servidor lo envía.
- Los nombres de enfermeras y administradores aparecen como «Miembro del personal» (se ignoran los nombres que ya envía el servidor).
- Terminología: «consulta» en lugar de «visita».

**Código fuente:** `features/orders/presentation/orders_section.dart`, `features/orders/application/order_providers.dart`, `features/orders/domain/order_rules.dart`, `order_display.dart`, `features/orders/infrastructure/order_gateway.dart`, `order_catalog_gateway.dart`.

---

### <a id="p-cli--s-cli-18--dialogo-nueva-orden"></a>S-CLI-18 Diálogo «Nueva orden»

**Ruta:** diálogo sobre `/app/<código>/encounters/<encounterId>` · **Tipo:** diálogo

**Propósito**

Crear una orden clínica (procedimiento, laboratorio o inyección) a partir de los catálogos activos, con el cargo estimado.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Ve además el «Costo interno» del laboratorio. |
| Recepción | Sin acceso | Botón «Nueva orden» oculto. |
| Enfermería / asistente médico | Sin acceso | Ídem. |
| Proveedor | Limitado | Crea órdenes, pero no ve el «Costo interno» del laboratorio (solo Administrador). |

Requiere `createClinicalOrder`, visita abierta y un estado que acepte órdenes. El servidor (`CreateOrder`) exige `CreateClinicalOrder` en la sede.

**Cómo se llega**

[S-CLI-17](08_pantallas_clinicas.md#p-cli--s-cli-17--seccion-ordenes-de-la-visita) → «Nueva orden».

**Distribución**

- Título «Nueva orden»; no se cierra tocando fuera; contenido desplazable.
- «Tipo»: selector segmentado «Procedimiento» | «Laboratorio» | «Inyección», con iconos.
- Buscador «Buscar por código o nombre».
- Lista (220 px) de ítems activos: radio, nombre (idioma de la interfaz), código y precio a la derecha; vacío: «Ningún elemento activo coincide.»; «Seleccione un elemento.» en rojo si se intenta crear sin elegir.
- Fila: «Cantidad» (140 px) y, en Laboratorio, el desplegable «Laboratorio proveedor».
- En Laboratorio con proveedor elegido: «Precio del proveedor {importe}» o «El proveedor no tiene precio vigente; aplica el precio por defecto.»; para el Administrador, además «Costo interno {importe}».
- «Notas (opcional)» (3 líneas, contador 0/4000).
- Estimado: «Cargo estimado {importe}» o «Estimación no disponible», y «{precio} × {cantidad}» si la cantidad es mayor que 1; nota «Las estimaciones provienen del catálogo; el estado de cuenta es la autoridad.»
- Banner rojo de error del servidor.
- Acciones «Cancelar» y «Crear orden» (spinner).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Tipo» | Selector segmentado | Sí (por defecto «Procedimiento») | Cambiar de tipo limpia el ítem y el laboratorio elegidos | No |
| «Buscar por código o nombre» | Texto | No | Filtra por código, nombre EN o nombre ES, sin distinguir mayúsculas | No |
| Ítem | Selección única | Sí («Seleccione un elemento.») | Procedimiento e Inyección eligen del mismo catálogo de procedimientos; Laboratorio, del catálogo de pruebas | No |
| «Cantidad» | Entero (solo dígitos) | Sí (por defecto 1) | 1 a 1000: «Ingrese un número entero.» / «La cantidad debe estar entre 1 y 1000.» | No |
| «Laboratorio proveedor» | Desplegable: «Sin preferencia» + proveedores activos | No (solo Laboratorio) | — | No |
| «Notas (opcional)» | Texto multilínea | No | Máx. 4000: «Máximo 4000 caracteres.» | Sí (nota clínica cifrada) |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Crear orden» | Proveedor, Administrador | Valida (tras el primer intento la validación pasa a ser continua) y llama `OrderService/CreateOrder`. | No | Cierra y [S-CLI-17](08_pantallas_clinicas.md#p-cli--s-cli-17--seccion-ordenes-de-la-visita) muestra «Orden creada.». |
| — estado no admite órdenes | — | El servidor responde `encounter_not_orderable`. | — | Diálogo «No se permiten órdenes ahora» con «Esta consulta no está en un estado que acepte órdenes. Las órdenes se crean mientras el paciente espera al proveedor o está con él, o durante una consulta solo de procedimiento.» y «Cerrar». |
| — otros errores | — | — | — | Banner: «Esta consulta está cerrada.», «La cantidad debe estar entre 1 y 1000.», etc. |
| «Cancelar» | Ídem | Cierra sin crear. | No | — |

**Estados y mensajes**

- Catálogo cargando: spinner en la lista; error: «Algo salió mal» + «Reintentar».
- Precio del proveedor cargando: barra fina.
- Enviando: controles deshabilitados.

**Tiempo real**

Los catálogos se guardan en caché durante la sesión (se limpian al cerrar sesión). La orden creada dispara `order.created` y `billing.changed`.

**Reglas de negocio**

- Solo se ofrecen ítems activos; las órdenes históricas siguen mostrando ítems ya inactivos.
- No se puede elegir ejecutor al crear: la orden nace «Sin asignar».
- El precio del proveedor es la ventana vigente en el día de la sede.

**Notas para el rediseño**

- Conservar el costo interno solo para administradores, el estimado con su aviso, los límites de cantidad y notas, y que no se cierre tocando fuera.
- «Inyección» y «Procedimiento» muestran exactamente la misma lista (el catálogo no distingue el tipo).
- Una orden por vez: no hay creación múltiple ni favoritos.
- El error «Seleccione un elemento.» aparece bajo la lista sin desplazar la vista hasta él.

**Código fuente:** `features/orders/presentation/new_order_dialog.dart`, `order_dialogs.dart`, `features/orders/domain/order_rules.dart`, `features/orders/application/order_providers.dart`.

---

### <a id="p-cli--s-cli-19--barra-de-acciones-de-una-orden"></a>S-CLI-19 Barra de acciones de una orden

**Ruta:** en [S-CLI-17](08_pantallas_clinicas.md#p-cli--s-cli-17--seccion-ordenes-de-la-visita) (visita) y en cada tarjeta de [S-CLI-03](08_pantallas_clinicas.md#p-cli--s-cli-03--cola-de-ordenes) (cola) · **Tipo:** panel

**Propósito**

Ejecutar el ciclo de vida de la orden: «Pendiente» → «En curso» → «Completada», o «Cancelada».

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | «Iniciar» (aunque esté asignada a otra persona), «Completar», «Asignar» y «Cancelar orden» (también en visitas cerradas, como cambio excepcional). |
| Recepción | Sin acceso | Sin botones. |
| Enfermería / asistente médico | Limitado | «Iniciar» (sin asignar o asignada a ella), «Completar» y «Asignar» (`executeOrder`), en visitas abiertas. |
| Proveedor | Limitado | Lo mismo que Enfermería («Iniciar» solo sin asignar o asignada a él) y además «Cancelar orden», solo en las órdenes que él ordenó o de visitas donde es el proveedor. |

Los botones se calculan con `OrderRules.actionsFor`; el servidor responde `order_assigned_to_other`, `order_not_owned` o `encounter_closed`.

**Cómo se llega**

Debajo de cada orden en la sección Órdenes y en las tarjetas de la Cola de órdenes.

**Distribución**

- Fila compacta alineada a la derecha: «Iniciar» (relleno, icono play), «Completar» (relleno, check), «Asignar» (con borde, persona+), «Cancelar orden» (texto, icono de prohibido); spinner mientras trabaja.

**Campos**

Sin campos (los datos se piden en [S-CLI-20](08_pantallas_clinicas.md#p-cli--s-cli-20--dialogo-completar-orden), [S-CLI-21](08_pantallas_clinicas.md#p-cli--s-cli-21--dialogo-cancelar-orden) y [S-CLI-22](08_pantallas_clinicas.md#p-cli--s-cli-22--dialogo-asignar-orden)).

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Iniciar» | Ejecutores; orden Pendiente sin asignar o asignada al usuario (o Administrador) | `OrderService/StartOrder` con `expected_version`. | No | Snackbar «Orden iniciada.». |
| «Completar» | Ejecutores; orden En curso | Abre [S-CLI-20](08_pantallas_clinicas.md#p-cli--s-cli-20--dialogo-completar-orden) → `CompleteOrder`. | Sí (diálogo) | «Orden completada.». |
| «Asignar» | Ejecutores; orden abierta | Abre [S-CLI-22](08_pantallas_clinicas.md#p-cli--s-cli-22--dialogo-asignar-orden) → `AssignOrder`. | Diálogo de selección | «Orden asignada.» (también al quitar la asignación). |
| «Cancelar orden» | Proveedor dueño, Administrador | Abre [S-CLI-21](08_pantallas_clinicas.md#p-cli--s-cli-21--dialogo-cancelar-orden) → `CancelOrder`. | Sí (diálogo con motivo) | «Orden cancelada.». |
| — conflicto | — | — | — | «Otro usuario actualizó esta orden. La lista se ha actualizado.» |
| — otros errores | — | — | — | «Esta orden está asignada a otro miembro del personal.», «Solo el proveedor que la ordenó, el proveedor de la consulta o un administrador pueden cancelar esta orden.», «Esta orden no puede pasar a ese estado.», «Esta orden ya está cerrada.», «El miembro del personal seleccionado no puede ejecutar órdenes en esta sede.», «Esta consulta está cerrada.», «Ya existe un cargo para esta orden.». |

**Estados y mensajes**

- Sin acciones disponibles: la barra no se muestra.
- Ocupado: botones deshabilitados + spinner.

**Tiempo real**

Tras cada acción se recargan las órdenes de la visita, la visita, el historial y la Cola de órdenes; los demás equipos reciben `order.changed`.

**Reglas de negocio**

- Transiciones permitidas: Pendiente → En curso → Completada; Pendiente o En curso → Cancelada; ninguna otra.
- Completar no exige ser quien inició la orden.
- Cualquier ejecutor puede reasignar o quitar la asignación de cualquier orden abierta.

**Notas para el rediseño**

- Conservar las reglas de propiedad (asignado o Administrador para iniciar; ordenante, proveedor de la visita o Administrador para cancelar).
- Conservar la acción destructiva separada visualmente.
- El mismo verbo «Iniciar» se usa en la Cola de enfermería y en las órdenes; «Cancelar» frente a «Cancelar orden» puede confundir.

**Código fuente:** `features/orders/presentation/order_actions.dart`, `features/orders/domain/order_rules.dart`, `features/orders/application/order_commands.dart`, `features/orders/presentation/order_labels.dart`.

---

### <a id="p-cli--s-cli-20--dialogo-completar-orden"></a>S-CLI-20 Diálogo «Completar orden»

**Ruta:** diálogo sobre [S-CLI-17](08_pantallas_clinicas.md#p-cli--s-cli-17--seccion-ordenes-de-la-visita) o [S-CLI-03](08_pantallas_clinicas.md#p-cli--s-cli-03--cola-de-ordenes) · **Tipo:** diálogo

**Propósito**

Cerrar la ejecución de la orden con una nota opcional.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Orden En curso de una visita abierta (`executeOrder`). |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Completo | Ídem Administrador. |
| Proveedor | Completo | Ídem Administrador. |

**Cómo se llega**

[S-CLI-19](08_pantallas_clinicas.md#p-cli--s-cli-19--barra-de-acciones-de-una-orden) → «Completar».

**Distribución**

- Título «Completar orden».
- Campo «Notas de finalización (opcional)» (4 líneas, contador 0/4000, foco automático).
- Acciones «Cancelar» y «Completar».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Notas de finalización (opcional)» | Texto multilínea | No | Máx. 4000: «Máximo 4000 caracteres.»; si la suma con las notas existentes supera 4000, el servidor responde `notes_too_long` | Sí (se añade a las notas cifradas de la orden) |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Completar» | Ejecutores | `OrderService/CompleteOrder` (`expected_version`, notas). | Este diálogo | Snackbar «Orden completada.»; si era la última orden abierta de una visita en «Procedimiento pendiente», la visita pasa a «Listo para caja». |
| «Cancelar» | Ídem | Cierra sin cambios. | — | — |

**Estados y mensajes**

- Error de validación bajo el campo.

**Tiempo real**

`order.changed` y, si corresponde, `encounter.state_changed`.

**Reglas de negocio**

- La nota se concatena a las notas existentes de la orden (no las reemplaza).

**Notas para el rediseño**

- No hay campos estructurados de resultado (p. ej. lote, sitio de inyección): todo va en texto libre.

**Código fuente:** `features/orders/presentation/order_dialogs.dart`.

---

### <a id="p-cli--s-cli-21--dialogo-cancelar-orden"></a>S-CLI-21 Diálogo «Cancelar orden»

**Ruta:** diálogo sobre [S-CLI-17](08_pantallas_clinicas.md#p-cli--s-cli-17--seccion-ordenes-de-la-visita) o [S-CLI-03](08_pantallas_clinicas.md#p-cli--s-cli-03--cola-de-ordenes) · **Tipo:** diálogo

**Propósito**

Anular una orden pendiente o en curso, y su cargo, con motivo obligatorio.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Cualquier orden abierta, también con la visita cerrada. |
| Recepción | Sin acceso | Botón oculto; el servidor responde `PERMISSION_DENIED`. |
| Enfermería / asistente médico | Sin acceso | Botón oculto; el servidor responde `order_not_owned`. |
| Proveedor | Limitado | Solo si ordenó la orden o es el proveedor de la visita. |

**Cómo se llega**

[S-CLI-19](08_pantallas_clinicas.md#p-cli--s-cli-19--barra-de-acciones-de-una-orden) → «Cancelar orden».

**Distribución**

- Título «Cancelar orden».
- Texto «La orden y su cargo quedarán anulados. Esta acción no se puede deshacer.»
- Campo «Motivo» (3 líneas, contador 0/500, foco automático, Enter envía).
- Acciones «Conservar orden» y «Cancelar orden» (rojo).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Motivo» | Texto multilínea | Sí («Se requiere un motivo.») | Máx. 500: «Máximo 500 caracteres.» | Sí (cifrado en reposo) |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Cancelar orden» | Proveedor dueño, Administrador | `OrderService/CancelOrder` con `expected_version` y motivo. | Este diálogo | Snackbar «Orden cancelada.»; anula el cargo y puede pasar la visita a «Listo para caja» si era la última abierta en «Procedimiento pendiente». |
| «Conservar orden» | Ídem | Cierra sin cambios. | — | — |

**Estados y mensajes**

- Error de validación bajo el campo.

**Tiempo real**

`order.changed` y `billing.changed`.

**Reglas de negocio**

- Con la visita cerrada solo el Administrador puede cancelar (cuenta como cambio excepcional).
- Irreversible.

**Notas para el rediseño**

- Conservar el texto de irreversibilidad, el botón rojo y «Conservar orden» como salida segura.

**Código fuente:** `features/orders/presentation/order_dialogs.dart`.

---

### <a id="p-cli--s-cli-22--dialogo-asignar-orden"></a>S-CLI-22 Diálogo «Asignar orden»

**Ruta:** diálogo sobre [S-CLI-17](08_pantallas_clinicas.md#p-cli--s-cli-17--seccion-ordenes-de-la-visita) o [S-CLI-03](08_pantallas_clinicas.md#p-cli--s-cli-03--cola-de-ordenes) · **Tipo:** diálogo

**Propósito**

Indicar quién ejecutará la orden, o quitar la asignación.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Órdenes abiertas de visitas abiertas (`executeOrder`). |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Completo | Ídem Administrador. |
| Proveedor | Completo | Ídem Administrador. |

**Cómo se llega**

[S-CLI-19](08_pantallas_clinicas.md#p-cli--s-cli-19--barra-de-acciones-de-una-orden) → «Asignar».

**Distribución**

- Título «Asignar orden».
- Lista (420 × 320 px) con el directorio de proveedores de la sede (radio lleno en el asignado actual); vacío: «No hay personal elegible en esta sede.»
- Acciones: «Cancelar», «Quitar asignación» (si hay alguien asignado) y «Asignarme» (si el usuario no es el asignado).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| Persona | Lista de selección única (un toque asigna) | — | El servidor valida que pueda ejecutar órdenes en la sede | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Tocar un proveedor, «Asignarme» o «Quitar asignación» | Ejecutores | `OrderService/AssignOrder` (`assigned_to` o vacío) con `expected_version`. | No | Snackbar «Orden asignada.». |
| «Cancelar» | Ídem | Cierra sin cambios. | — | — |

**Estados y mensajes**

- Directorio cargando o con error, con «Reintentar».

**Tiempo real**

La persona asignada recibe la notificación «Orden asignada a ti» ([S-GEN-15](05_pantallas_generales.md#p-gen--s-gen-15--centro-de-notificaciones)).

**Reglas de negocio**

- El servidor acepta como asignado a cualquier enfermera, proveedor o administrador activo de la sede; la lista solo muestra proveedores, así que a una enfermera solo se le puede asignar la orden ella misma con «Asignarme».

**Notas para el rediseño**

- El comentario del código dice que solo los administradores eligen del directorio, pero la lista se muestra a todos.
- Existe el texto «El directorio de personal no está disponible para su rol. Puede asignarse la orden a usted.» sin uso.
- «Orden asignada.» también se muestra al quitar la asignación.

**Código fuente:** `features/orders/presentation/order_dialogs.dart`, `core/staff/provider_directory.dart`.

---

### <a id="p-cli--s-cli-23--seccion-facturacion-de-la-visita-compuesta-detalle-en-el-inventario-de-facturaci"></a>S-CLI-23 Sección «Facturación» de la visita (compuesta; detalle en el inventario de facturación/caja)

**Ruta:** dentro de `/app/<código>/encounters/<encounterId>` (sección `billing`, orden 30) · **Tipo:** panel

**Propósito**

Resumen del estado de cuenta de la visita y acceso a caja. La ficha completa de esta sección, desde el punto de vista de caja, está en [S-CAJ-16](09_pantallas_caja.md#p-caj--s-caj-16--seccion-facturacion-en-la-pantalla-de-la-visita).

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Totales + «Ir a checkout» (`recordManualPayment`). |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Limitado | Solo totales (el servidor no envía líneas). |
| Proveedor | Limitado | Solo totales; sin «Ir a checkout». |

Requiere `viewCharges` (los cuatro roles).

**Cómo se llega**

Pantalla de la visita ([S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita)), pestaña «Resumen», tarjeta «Facturación». Enlace profundo `?section=billing`.

**Distribución**

- Chip azul con el tipo de cobertura y el texto de la regla de cobertura.
- Totales: «Subtotal», «Descuento total», «Total a pagar», «Pagado», «Saldo» (destacado) y chip de estado del estado de cuenta.
- Sin estado de cuenta: «Esta visita aún no tiene estado de cuenta.»
- Botón tonal «Ir a checkout» (Recepción y Administrador).

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Ir a checkout» | Recepción, Administrador | Abre `/app/<código>/checkout/<encounterId>`. | No | [S-CAJ-03](09_pantallas_caja.md#p-caj--s-caj-03--checkout-de-la-visita). |

**Estados y mensajes**

- Cargando: spinner. «No encontrado» (antes del primer cargo) se muestra como el texto tranquilo de arriba, no como error. Otros errores: banner compacto + «Reintentar».

**Tiempo real**

`billing.changed` y `receipt.generated` recargan; también la resincronización.

**Reglas de negocio**

- Las órdenes creadas o canceladas cambian el estado de cuenta en el mismo momento (cargo creado o anulado).
- Las cifras las calcula el servidor; la app no suma importes.

**Notas para el rediseño**

- «Ir a checkout» es un anglicismo frente a «Caja» del menú.

**Código fuente:** `features/billing/presentation/billing_section.dart`, `statement_table.dart`, `features/billing/billing_feature.dart`.

---

### <a id="p-cli--s-cli-24--pestana-historial-de-la-visita"></a>S-CLI-24 Pestaña «Historial» de la visita

**Ruta:** pestaña de `/app/<código>/encounters/<encounterId>` · **Tipo:** panel

**Propósito**

Ver cada cambio de estado de la visita: quién lo hizo, cuándo, la versión y el motivo.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | `EncounterService/GetEncounterTimeline`. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Completo | Ídem. |
| Proveedor | Completo | Ídem. |

**Cómo se llega**

[S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita) → pestaña «Historial».

**Distribución**

- Lista, de la más reciente a la más antigua (por versión y luego por fecha). Cada entrada:
- Icono: entrada inicial, flecha, o escudo si fue forzado.
- Título: «Registrado» en la entrada inicial, o «{estado anterior} → [chip con el estado nuevo]»; chip ámbar «Forzado» si fue un cambio excepcional.
- Subtítulo: «{fecha hora} · por {actor} · v{versión}» (actor: «Usted», el nombre del directorio o «Personal»).
- Motivo en cursiva cuando existe (cierre o cambio excepcional).

**Campos**

Sin campos.

**Acciones**

Solo lectura; no hay acciones.

**Estados y mensajes**

- Cargando, error con «Reintentar» y vacío «Aún no hay historial.»

**Tiempo real**

Se recarga con `encounter.*` y `vitals.changed` de la visita y con `order.*` y `billing.changed`.

**Reglas de negocio**

- Los motivos son notas clínicas cifradas en reposo; se muestran a quien abre la visita.
- Las transiciones automáticas (p. ej. el avance por signos vitales o por la última orden) aparecen como cambios normales.

**Notas para el rediseño**

- Conservar visibles la marca «Forzado» y el motivo.
- Enfermeras y administradores aparecen como «Personal» (el directorio solo contiene proveedores).
- No incluye cambios de órdenes, signos vitales ni cobertura: es solo el historial de estados.

**Código fuente:** `features/encounters/presentation/encounter_timeline_tab.dart`, `features/encounters/application/encounter_providers.dart`.

---

### <a id="p-cli--s-cli-25--documentos-de-la-visita"></a>S-CLI-25 Documentos de la visita

**Ruta:** `/app/<código>/encounters/<encounterId>/documents` (`RouteNames.encounterDocuments`) · **Tipo:** página

**Propósito**

Listar y subir documentos (imágenes o PDF) vinculados a esta visita. Es la misma página descrita, desde el punto de vista del paciente, en [S-PAC-20](06_pantallas_pacientes.md#p-pac--s-pac-20--documentos-de-la-visita); el panel de documentos completo está en [S-PAC-09](06_pantallas_pacientes.md#p-pac--s-pac-09--documentos-pestana-del-perfil--panel-de-documentos).

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Incluye «Mostrar eliminados» y eliminar cualquier documento. |
| Recepción | Limitado | Lista y sube; elimina solo lo que subió en las últimas 24 h; sin «Mostrar eliminados». |
| Enfermería / asistente médico | Limitado | Ídem Recepción. |
| Proveedor | Limitado | Ídem Recepción. |

Guarda de ruta `uploadPatientDocuments` (los cuatro roles); el servidor valida cada operación.

**Cómo se llega**

Ningún botón de la interfaz enlaza esta página: solo se abre por URL directa (no hay acceso desde [S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita) ni desde otra pantalla).

**Distribución**

- Cabecera: botón «Volver a la visita» y título «Documentos de la visita».
- Barra: desplegable «Categoría» («Todas las categorías» + categorías), chip «Mostrar eliminados» (Administrador), «Actualizar» y botón «Subir».
- Cola de subidas «Subidas» con sus etapas («En espera», «Preparando (suma de verificación)», «Solicitando subida», «Subiendo», «Verificando», …) ([S-PAC-16](06_pantallas_pacientes.md#p-pac--s-pac-16--subidas-cola-de-subida)).
- Tabla (tarjetas en teléfono): «Archivo», «Categoría», «Tamaño», «Subido» («{cuándo} · {quién}» o «Usted»), «Estado» («Pendiente» ámbar, «Disponible» verde, «Eliminado» gris), «Acciones» («Ver», «Descargar», «Eliminar»).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Categoría» (filtro) | Desplegable | No | — | No |
| Hoja «Categoría del documento» ([S-PAC-15](06_pantallas_pacientes.md#p-pac--s-pac-15--categoria-del-documento-subir)): «Categoría» | Desplegable | Sí | JPEG, PNG, WebP, HEIC o PDF, hasta el límite configurado | No |
| Diálogo «Eliminar documento» ([S-PAC-18](06_pantallas_pacientes.md#p-pac--s-pac-18--eliminar-documento)): «Motivo» | Texto | Sí («El motivo es obligatorio.») | Máx. 500 caracteres | No se guarda el texto |
| Nombre del archivo (en la tabla) | Texto | — | — | Sí (cifrado en reposo) |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Subir» | Todos | Hoja de categoría y origen («Elegir archivo», «Tomar foto» si hay cámara, «Elegir imagen», «Cancelar»); encola los archivos. | No | Snackbar «{n} archivo(s) añadido(s) a la cola de subida.»; las subidas quedan adjuntas a la visita. |
| «Ver» | Todos | Pide un enlace prefirmado temporal (`DocumentService/GetDownloadUrl`). | No | Imagen en la vista previa interna ([S-PAC-17](06_pantallas_pacientes.md#p-pac--s-pac-17--vista-previa-de-imagen)); PDF en una pestaña del navegador. |
| «Descargar» | Todos | Abre el enlace prefirmado de descarga. | No | Descarga o app externa. |
| «Eliminar» | Quien lo subió dentro de 24 h, o Administrador | Diálogo con motivo → borrado lógico. | Sí | Snackbar «Documento eliminado.». |
| «Volver a la visita» | Todos | Vuelve a la página de la visita. | No | [S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita). |

**Estados y mensajes**

- Cargando la visita: spinner; error: «Algo salió mal» + «Reintentar».
- Vacío: «Aún no hay documentos.» / «Ningún documento coincide con el filtro actual.» + «Suba una imagen o un PDF para adjuntarlo a este expediente.»
- Almacenamiento caído: «Los documentos no están disponibles por el momento. Inténtelo de nuevo en unos minutos; todo lo demás sigue funcionando.»
- Abrir fallido: «No se pudo abrir el archivo.»

**Tiempo real**

`document.changed` y la resincronización recargan la lista.

**Reglas de negocio**

- El nombre del archivo es PHI cifrada.
- Los documentos nunca se borran físicamente (borrado lógico).
- Para subir, la visita debe ser de la sede activa y del mismo paciente.
- La cola «Subidas» es la cola única de la app: se vacía en cada cierre de sesión, que también borra las copias locales de los archivos ([S-PAC-16](06_pantallas_pacientes.md#p-pac--s-pac-16--subidas-cola-de-subida)).

**Notas para el rediseño**

- Página sin punto de entrada en la interfaz: enlazarla desde la visita o integrar el panel en ella.
- El cliente no llama al registro de exportación (`AuditService.RecordClientExport`) antes de «Ver» o «Descargar» en este panel; el servidor sí audita cada enlace emitido.
- El detalle completo del panel de documentos está en las fichas de Pacientes ([S-PAC-09](06_pantallas_pacientes.md#p-pac--s-pac-09--documentos-pestana-del-perfil--panel-de-documentos) a [S-PAC-18](06_pantallas_pacientes.md#p-pac--s-pac-18--eliminar-documento)).

**Código fuente:** `features/documents/presentation/encounter_documents_page.dart`, `documents_panel.dart`, `upload_sheet.dart`, `delete_document_dialog.dart`, `document_preview_dialog.dart`, `upload_queue_view.dart`, `features/documents/application/documents_providers.dart`.

---

### <a id="p-cli--s-cli-26--dialogo-descartar-cambios-sin-guardar"></a>S-CLI-26 Diálogo «¿Descartar cambios sin guardar?»

**Ruta:** diálogo global sobre formularios con cambios (signos vitales, valoración) y en el cambio de sede · **Tipo:** diálogo

**Propósito**

Evitar perder datos clínicos tecleados. Es el mismo diálogo común descrito en [S-GEN-26](05_pantallas_generales.md#p-gen--s-gen-26--descartar-cambios-sin-guardar).

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Con cualquier formulario sucio. |
| Recepción | Limitado | Solo con el diálogo de cobertura sucio al cambiar de sede. |
| Enfermería / asistente médico | Completo | Con signos vitales o valoración sin guardar. |
| Proveedor | Limitado | Solo con signos vitales sin guardar (la valoración es de solo lectura). |

**Cómo se llega**

- Botón atrás del sistema o del navegador con [S-CLI-14](08_pantallas_clinicas.md#p-cli--s-cli-14--formulario-signos-vitales-registro-y-correccion) o [S-CLI-15](08_pantallas_clinicas.md#p-cli--s-cli-15--formulario-valoracion-alergias-antecedentes-sintomas-notas-de-enfermeria) modificados.
- Cambiar de sede en el selector de la cabecera con cualquier formulario registrado como sucio (incluido [S-CLI-12](08_pantallas_clinicas.md#p-cli--s-cli-12--dialogo-cobertura-editar-cobertura)).

**Distribución**

- Título «¿Descartar cambios sin guardar?»
- Texto «Tiene cambios sin guardar. Si sale ahora se perderán.»
- Botones «Seguir editando» y «Descartar» (rojo).

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Descartar» | Todos | Sale o completa el cambio de sede. | — | Se pierden los cambios. |
| «Seguir editando» | Todos | Permanece en el formulario. | — | — |

**Estados y mensajes**

- Si el cambio de sede llega por URL con formularios sucios, la navegación se rechaza sin diálogo y se queda en la URL actual.

**Tiempo real**

No aplica.

**Reglas de negocio**

- Protección de cambios sin guardar del plan de producto (estado «sucio»).

**Notas para el rediseño**

- La protección se basa en interceptar el retroceso (`pop`) y el cambio de sede; navegar con el menú lateral o con botones que usan `go()` puede no pasar por este diálogo (pendiente de verificar en ejecución).

**Código fuente:** `core/widgets/dirty_form_guard.dart`, `features/locations/application/dirty_forms.dart`, `core/routing/app_router.dart`, `core/routing/shell_screen.dart`.

---

## <a id="p-cli--preguntas-abiertas-detectadas-en-estas-pantallas"></a>Preguntas abiertas detectadas en estas pantallas

1. ¿Cuál debe ser el único «Enviar al proveedor»? El de la barra de acciones (`TransitionEncounter`, sin confirmación y sin exigir signos vitales) y el de la sección Enfermería (`CompleteNursing`, con confirmación y con `vitals_required`) coexisten con el mismo texto y reglas distintas. ([S-CLI-07](08_pantallas_clinicas.md#p-cli--s-cli-07--barra-de-acciones-de-la-visita-incluye-banner-de-visita-cerrada), [S-CLI-16](08_pantallas_clinicas.md#p-cli--s-cli-16--confirmacion-enviar-al-proveedor-dos-variantes))
2. ¿Es intencional que «Iniciar consulta» desde la barra de acciones de la visita no autoasigne al proveedor y permita iniciar la visita de otro proveedor, cuando la Cola de proveedor sí restringe y autoasigna? ([S-CLI-02](08_pantallas_clinicas.md#p-cli--s-cli-02--cola-de-proveedor), [S-CLI-07](08_pantallas_clinicas.md#p-cli--s-cli-07--barra-de-acciones-de-la-visita-incluye-banner-de-visita-cerrada))
3. El servidor permite al Administrador avanzar con órdenes abiertas dando un motivo, pero la interfaz no lo ofrece. ¿Debe existir esa vía? ([S-CLI-07](08_pantallas_clinicas.md#p-cli--s-cli-07--barra-de-acciones-de-la-visita-incluye-banner-de-visita-cerrada), [S-CLI-10](08_pantallas_clinicas.md#p-cli--s-cli-10--dialogo-cambio-excepcional-de-estado))
4. La página «Documentos de la visita» no tiene acceso en la interfaz (solo URL) y el plan de producto incluye documentos en la visita. ¿Se añade una sección o un botón? ([S-CLI-25](08_pantallas_clinicas.md#p-cli--s-cli-25--documentos-de-la-visita))
5. No existe pantalla de notas clínicas del proveedor, diagnóstico ni resumen del paciente (previstos en el plan de producto). ¿Están fuera de V1? ([S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita))
6. Alergias y antecedentes se registran por visita, no se arrastran a las siguientes y no se destacan en otras pantallas. ¿Es el comportamiento clínico deseado? ([S-CLI-15](08_pantallas_clinicas.md#p-cli--s-cli-15--formulario-valoracion-alergias-antecedentes-sintomas-notas-de-enfermeria))
7. En las rutas directas sin proveedor presente, solo el Proveedor o el Administrador pueden crear las órdenes. ¿Quién las crea en la operación real (p. ej. una inyección de B12 sin médico)? ([S-CLI-18](08_pantallas_clinicas.md#p-cli--s-cli-18--dialogo-nueva-orden))
8. El catálogo de procedimientos no distingue inyecciones: «Inyección» y «Procedimiento» muestran la misma lista en «Nueva orden». ¿Debe filtrarse por tipo? ([S-CLI-18](08_pantallas_clinicas.md#p-cli--s-cli-18--dialogo-nueva-orden))
9. El servidor acepta asignar órdenes a enfermeras y administradores, pero «Asignar orden» solo lista proveedores. ¿Debería mostrar a todo el personal que ejecuta órdenes? ([S-CLI-22](08_pantallas_clinicas.md#p-cli--s-cli-22--dialogo-asignar-orden))
10. ¿Deben usarse los nombres que el servidor ya envía en órdenes y en la Cola de órdenes, en lugar del directorio de proveedores, para no mostrar «Miembro del personal» o «Personal»? ([S-CLI-03](08_pantallas_clinicas.md#p-cli--s-cli-03--cola-de-ordenes), [S-CLI-17](08_pantallas_clinicas.md#p-cli--s-cli-17--seccion-ordenes-de-la-visita), [S-CLI-24](08_pantallas_clinicas.md#p-cli--s-cli-24--pestana-historial-de-la-visita))
11. «Editar» en Enfermería se muestra en «Listo para caja» y «En caja» aunque el servidor bloquea el guardado (`nursing_locked`). ¿Ocultarlo en esos estados? ([S-CLI-13](08_pantallas_clinicas.md#p-cli--s-cli-13--seccion-enfermeria-vista-completa-y-vista-limitada))
12. Cuando llega una actualización de signos vitales de otra persona o tras un conflicto, el formulario se reconstruye y se pierde lo tecleado sin aviso (deducido del código). ¿Es aceptable? ([S-CLI-14](08_pantallas_clinicas.md#p-cli--s-cli-14--formulario-signos-vitales-registro-y-correccion))
13. ¿La navegación por el menú lateral o por botones que usan `go()` descarta cambios sin pasar por «¿Descartar cambios sin guardar?»? No se verificó en ejecución. ([S-CLI-26](08_pantallas_clinicas.md#p-cli--s-cli-26--dialogo-descartar-cambios-sin-guardar))
14. No hay historial visible de correcciones de signos vitales o de la valoración. ¿Se necesita en pantalla para la auditoría clínica? ([S-CLI-24](08_pantallas_clinicas.md#p-cli--s-cli-24--pestana-historial-de-la-visita))
15. El diálogo «Sin signos vitales» ofrece «Continuar» aunque el servidor rechazará. ¿Debe bloquearse? ([S-CLI-16](08_pantallas_clinicas.md#p-cli--s-cli-16--confirmacion-enviar-al-proveedor-dos-variantes))
16. Las notificaciones abren la visita con la sede del evento o la activa; ¿qué debe ocurrir con una visita de otra sede del usuario cuando hay formularios sin guardar? ([S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita))
17. El plan de producto pide bloquear las operaciones sin conexión con un aviso; en estas pantallas no hay bloqueo previo (solo el error de red al fallar). ¿Se implementará?
18. Hay textos definidos sin uso («El directorio de personal no está disponible para su rol. Puede asignarse la orden a usted.» y la explicación de quién puede eliminar documentos). ¿Eliminarlos o usarlos? ([S-CLI-22](08_pantallas_clinicas.md#p-cli--s-cli-22--dialogo-asignar-orden), [S-CLI-25](08_pantallas_clinicas.md#p-cli--s-cli-25--documentos-de-la-visita))
19. El cambio excepcional que reabre una visita cerrada (permitido por la interfaz y el servidor) ¿tiene impacto en el estado de cuenta o los recibos que deba advertirse? ([S-CLI-10](08_pantallas_clinicas.md#p-cli--s-cli-10--dialogo-cambio-excepcional-de-estado))
20. ¿Debe registrarse la exportación (`RecordClientExport`) al «Ver» o «Descargar» documentos de la visita, o basta la auditoría de lectura del servidor? ([S-CLI-25](08_pantallas_clinicas.md#p-cli--s-cli-25--documentos-de-la-visita))
