# <a id="p-caj--09--pantallas-de-caja-cobro-recibos-y-reportes-s-caj"></a>09 — Pantallas de caja: cobro, recibos y reportes (S-CAJ)

Este capítulo describe las pantallas donde se cierra la cuenta de una visita y se controla el dinero de la clínica: la **cola de Caja** con sus tarjetas, la **página de checkout** de una visita (barra de estado, estado de cuenta con cargos y descuentos, registro de pagos manuales, anulaciones y recibos), la sección **Facturación** que ve todo el equipo dentro de la visita, la pestaña **Saldos** del perfil del paciente y los **Reportes** de la sede y de la compañía, con la impresión y la exportación auditadas. Recepción y Administración cobran; solo el Administrador anula cargos y pagos y ve las cifras «Saldo pendiente» y «Bono»; Enfermería y el Proveedor solo ven totales dentro de la visita. En V1 no hay procesador de pagos: los pagos se registran a mano tal como se recibieron en el mostrador. Todas las cifras las calcula el servidor (la app nunca suma importes), el dinero es exacto en centavos y solo en USD, y fechas y horas se muestran en la zona horaria de la sede activa. Los textos entre «…» son etiquetas reales de la interfaz y los ejemplos (códigos `LAN-E-000123`, `LAN-R-000045`, importes) son ficticios.

## <a id="p-caj--como-leer-cada-ficha"></a>Cómo leer cada ficha

- **Acceso por rol**: «Completo», «Limitado» (ve una parte o solo algunas acciones), «Sin acceso» (menú oculto o ruta redirigida en silencio al Panel; el servidor también lo rechaza).
- **PHI**: «Sí» = dato protegido del paciente o del pago (nombre del paciente, referencia del pago, motivos de anulación); se cifra en el servidor y su lectura se audita.
- **Códigos humanos**: visita `LAN-E-NNNNNN`, paciente `LAN-P-NNNNNN`, recibo `LAN-R-NNNNNN`; se muestran en monoespaciado, mantener pulsado copia el código y nunca se muestra un UUID.
- **Importes**: se escriben con punto decimal (`1234.50`) y se muestran con el formato del idioma (en español, «1.234,50 $»).
- **Código fuente**: las rutas de archivo son relativas a `frontend/lib/`.
- Los comportamientos comunes (estados de carga, vacío y error; descarte de cambios; marco y navegación) están en [05 — Pantallas generales](05_pantallas_generales.md). La pantalla de la visita y sus órdenes están en [08 — Pantallas clínicas](08_pantallas_clinicas.md); la administración de reglas de bono y catálogos, en [10 — Pantallas de administración](10_pantallas_admin.md).

## <a id="p-caj--matriz-rapida-del-modulo"></a>Matriz rápida del módulo

| Capacidad | Administrador | Recepción | Enfermería / asistente médico | Proveedor |
| --- | --- | --- | --- | --- |
| Cola de Caja y página de checkout | Sí | Sí | No | No |
| «Iniciar checkout» / «Completar visita» | Sí | Sí | No | No |
| Agregar cargo manual, aplicar descuento, recalcular | Sí | Sí | No | No |
| Anular cargo manual o pago | Sí | No | No | No |
| Registrar pago manual | Sí | Sí | No | No |
| Generar, ver, imprimir y compartir recibos | Sí | Sí | No | No |
| Sección Facturación de la visita | Totales + «Ir a checkout» | Totales + «Ir a checkout» | Solo totales | Solo totales |
| Pestaña «Saldos» del paciente | Sí, con «Abrir checkout» | Sí, con «Abrir checkout» | Error de permiso | Sí, con «Abrir visita» |
| Reportes de la sede (Diario y Rango) | Sí, con «Saldo pendiente» y «Bono» | Sí, sin «Saldo pendiente» ni «Bono» | No | No |
| Reportes de la compañía | Sí | No | No | No |
| Imprimir / exportar CSV (con registro de auditoría previo) | Sí | Sí | No | No |

## <a id="p-caj--indice-de-pantallas"></a>Índice de pantallas

| Id | Pantalla | Ruta / ubicación | Tipo |
| --- | --- | --- | --- |
| [S-CAJ-01](09_pantallas_caja.md#p-caj--s-caj-01--caja-cola-de-checkout) | Caja (cola de checkout) | `/app/<código>/checkout/queue` | Página |
| [S-CAJ-02](09_pantallas_caja.md#p-caj--s-caj-02--tarjeta-de-visita-en-la-cola-de-caja) | Tarjeta de visita en la cola de caja | Caja | Panel |
| [S-CAJ-03](09_pantallas_caja.md#p-caj--s-caj-03--checkout-de-la-visita) | Checkout de la visita | `/app/<código>/checkout/<visita>` | Página |
| [S-CAJ-04](09_pantallas_caja.md#p-caj--s-caj-04--barra-de-estado-de-la-visita-checkout) | Barra de estado de la visita (checkout) | Checkout | Panel |
| [S-CAJ-05](09_pantallas_caja.md#p-caj--s-caj-05--dialogo-completar-visita-con-saldo-pendiente) | Diálogo «Completar visita» con saldo pendiente | Checkout | Diálogo |
| [S-CAJ-06](09_pantallas_caja.md#p-caj--s-caj-06--dialogo-ordenes-abiertas) | Diálogo «Órdenes abiertas» | Checkout | Diálogo |
| [S-CAJ-07](09_pantallas_caja.md#p-caj--s-caj-07--tarjeta-estado-de-cuenta-lineas-cobertura-totales) | Tarjeta «Estado de cuenta» (líneas, cobertura, totales) | Checkout | Panel |
| [S-CAJ-08](09_pantallas_caja.md#p-caj--s-caj-08--dialogo-agregar-cargo-manual) | Diálogo «Agregar cargo manual» | Checkout | Diálogo |
| [S-CAJ-09](09_pantallas_caja.md#p-caj--s-caj-09--dialogo-aplicar-descuento) | Diálogo «Aplicar descuento» | Checkout | Diálogo |
| [S-CAJ-10](09_pantallas_caja.md#p-caj--s-caj-10--dialogo-anular-cargo) | Diálogo «Anular cargo» | Checkout | Diálogo |
| [S-CAJ-11](09_pantallas_caja.md#p-caj--s-caj-11--tarjeta-pagos-panel-registrar-pago-pago-manual) | Tarjeta «Pagos»: panel «Registrar pago» (pago manual) | Checkout | Panel |
| [S-CAJ-12](09_pantallas_caja.md#p-caj--s-caj-12--lista-de-pagos-registrados-y-anulados) | Lista de pagos registrados y anulados | Checkout | Panel |
| [S-CAJ-13](09_pantallas_caja.md#p-caj--s-caj-13--dialogo-anular-pago) | Diálogo «Anular pago» | Checkout | Diálogo |
| [S-CAJ-14](09_pantallas_caja.md#p-caj--s-caj-14--panel-recibos-generar-ver-imprimir-y-reimprimir) | Panel «Recibos» (generar, ver, imprimir y reimprimir) | Checkout | Panel |
| [S-CAJ-15](09_pantallas_caja.md#p-caj--s-caj-15--hoja-recibo-codigo-vista-de-texto) | Hoja «Recibo {código}» (vista de texto) | Checkout | Hoja inferior |
| [S-CAJ-16](09_pantallas_caja.md#p-caj--s-caj-16--seccion-facturacion-en-la-pantalla-de-la-visita) | Sección «Facturación» en la pantalla de la visita | `/app/<código>/encounters/<visita>` | Panel |
| [S-CAJ-17](09_pantallas_caja.md#p-caj--s-caj-17--pestana-saldos-del-perfil-del-paciente) | Pestaña «Saldos» del perfil del paciente | `/app/<código>/patients/<paciente>` | Panel |
| [S-CAJ-18](09_pantallas_caja.md#p-caj--s-caj-18--reportes-de-la-sede-activa) | Reportes (de la sede activa) | `/app/<código>/reports` | Página |
| [S-CAJ-19](09_pantallas_caja.md#p-caj--s-caj-19--pestana-diario-reporte-diario-de-una-sede) | Pestaña «Diario» (reporte diario de una sede) | Reportes | Panel |
| [S-CAJ-20](09_pantallas_caja.md#p-caj--s-caj-20--pestana-rango-resumen-por-rango-de-fechas) | Pestaña «Rango» (resumen por rango de fechas) | Reportes | Panel |
| [S-CAJ-21](09_pantallas_caja.md#p-caj--s-caj-21--selector-de-fecha-de-reportes) | Selector de fecha de reportes | Reportes | Diálogo |
| [S-CAJ-22](09_pantallas_caja.md#p-caj--s-caj-22--reportes-de-la-compania) | Reportes de la compañía | `/admin/reports` | Página |
| [S-CAJ-23](09_pantallas_caja.md#p-caj--s-caj-23--vista-diaria-de-la-compania-tabla-por-sede) | Vista diaria de la compañía (tabla por sede) | Reportes de la compañía | Panel |
| [S-CAJ-24](09_pantallas_caja.md#p-caj--s-caj-24--impresion-y-exportacion-dialogo-del-sistema-y-auditoria) | Impresión y exportación (diálogo del sistema y auditoría) | Diálogos del sistema | Diálogo |

## <a id="p-caj--recorridos-que-pasan-por-estas-pantallas"></a>Recorridos que pasan por estas pantallas

| Recorrido | Roles | Pantallas, en orden |
| --- | --- | --- |
| Cobro estándar de una visita lista para caja | Proveedor o Enfermería (paso previo), Recepción o Administrador | Visita «Listo para pago» ([S-CLI-07](08_pantallas_clinicas.md#p-cli--s-cli-07--barra-de-acciones-de-la-visita-incluye-banner-de-visita-cerrada)) → [S-CAJ-01](09_pantallas_caja.md#p-caj--s-caj-01--caja-cola-de-checkout) → [S-CAJ-02](09_pantallas_caja.md#p-caj--s-caj-02--tarjeta-de-visita-en-la-cola-de-caja) «Iniciar checkout» → [S-CAJ-03](09_pantallas_caja.md#p-caj--s-caj-03--checkout-de-la-visita) → [S-CAJ-07](09_pantallas_caja.md#p-caj--s-caj-07--tarjeta-estado-de-cuenta-lineas-cobertura-totales) (→ [S-CAJ-08](09_pantallas_caja.md#p-caj--s-caj-08--dialogo-agregar-cargo-manual) / [S-CAJ-09](09_pantallas_caja.md#p-caj--s-caj-09--dialogo-aplicar-descuento)) → [S-CAJ-11](09_pantallas_caja.md#p-caj--s-caj-11--tarjeta-pagos-panel-registrar-pago-pago-manual) → [S-CAJ-14](09_pantallas_caja.md#p-caj--s-caj-14--panel-recibos-generar-ver-imprimir-y-reimprimir) → [S-CAJ-24](09_pantallas_caja.md#p-caj--s-caj-24--impresion-y-exportacion-dialogo-del-sistema-y-auditoria) → [S-CAJ-04](09_pantallas_caja.md#p-caj--s-caj-04--barra-de-estado-de-la-visita-checkout) «Completar visita» |
| Pago parcial y cierre con saldo pendiente | Recepción, Administrador | [S-CAJ-11](09_pantallas_caja.md#p-caj--s-caj-11--tarjeta-pagos-panel-registrar-pago-pago-manual) → [S-CAJ-14](09_pantallas_caja.md#p-caj--s-caj-14--panel-recibos-generar-ver-imprimir-y-reimprimir) → [S-CAJ-04](09_pantallas_caja.md#p-caj--s-caj-04--barra-de-estado-de-la-visita-checkout) → [S-CAJ-05](09_pantallas_caja.md#p-caj--s-caj-05--dialogo-completar-visita-con-saldo-pendiente) → saldo en [S-CAJ-17](09_pantallas_caja.md#p-caj--s-caj-17--pestana-saldos-del-perfil-del-paciente) |
| Cobro anticipado o ajuste antes de que la visita esté lista | Recepción, Administrador | [S-CAJ-16](09_pantallas_caja.md#p-caj--s-caj-16--seccion-facturacion-en-la-pantalla-de-la-visita) «Ir a checkout» → [S-CAJ-03](09_pantallas_caja.md#p-caj--s-caj-03--checkout-de-la-visita) (sin botones de flujo, estado de cuenta editable) |
| Corrección administrativa y nuevo recibo | Administrador | [S-CAJ-07](09_pantallas_caja.md#p-caj--s-caj-07--tarjeta-estado-de-cuenta-lineas-cobertura-totales) → [S-CAJ-10](09_pantallas_caja.md#p-caj--s-caj-10--dialogo-anular-cargo) o [S-CAJ-12](09_pantallas_caja.md#p-caj--s-caj-12--lista-de-pagos-registrados-y-anulados) → [S-CAJ-13](09_pantallas_caja.md#p-caj--s-caj-13--dialogo-anular-pago) → [S-CAJ-14](09_pantallas_caja.md#p-caj--s-caj-14--panel-recibos-generar-ver-imprimir-y-reimprimir) «Generar recibo» → [S-CAJ-24](09_pantallas_caja.md#p-caj--s-caj-24--impresion-y-exportacion-dialogo-del-sistema-y-auditoria) |
| Ver o reimprimir un recibo en otro idioma | Recepción, Administrador | [S-CAJ-14](09_pantallas_caja.md#p-caj--s-caj-14--panel-recibos-generar-ver-imprimir-y-reimprimir) «Ver» → [S-CAJ-15](09_pantallas_caja.md#p-caj--s-caj-15--hoja-recibo-codigo-vista-de-texto) → [S-CAJ-24](09_pantallas_caja.md#p-caj--s-caj-24--impresion-y-exportacion-dialogo-del-sistema-y-auditoria) |
| Visita con órdenes abiertas | Recepción, Administrador; Enfermería o Proveedor resuelven | [S-CAJ-04](09_pantallas_caja.md#p-caj--s-caj-04--barra-de-estado-de-la-visita-checkout) «Iniciar checkout» → [S-CAJ-06](09_pantallas_caja.md#p-caj--s-caj-06--dialogo-ordenes-abiertas) → visita ([S-CLI-17](08_pantallas_clinicas.md#p-cli--s-cli-17--seccion-ordenes-de-la-visita)) |
| Cobro concurrente (conflicto de versión) | Dos usuarios de caja | [S-CAJ-11](09_pantallas_caja.md#p-caj--s-caj-11--tarjeta-pagos-panel-registrar-pago-pago-manual) en dos equipos → snackbar de conflicto y recarga |
| Consultar saldos de un paciente | Recepción, Administrador, Proveedor | [S-PAC-05](06_pantallas_pacientes.md#p-pac--s-pac-05--perfil-del-paciente) → [S-CAJ-17](09_pantallas_caja.md#p-caj--s-caj-17--pestana-saldos-del-perfil-del-paciente) → [S-CAJ-03](09_pantallas_caja.md#p-caj--s-caj-03--checkout-de-la-visita) o visita |
| Cierre diario de la sede | Recepción (limitado), Administrador | [S-CAJ-18](09_pantallas_caja.md#p-caj--s-caj-18--reportes-de-la-sede-activa) → [S-CAJ-19](09_pantallas_caja.md#p-caj--s-caj-19--pestana-diario-reporte-diario-de-una-sede) → «Imprimir» ([S-CAJ-24](09_pantallas_caja.md#p-caj--s-caj-24--impresion-y-exportacion-dialogo-del-sistema-y-auditoria)) |
| Resumen por periodo y CSV | Recepción (su sede), Administrador | [S-CAJ-20](09_pantallas_caja.md#p-caj--s-caj-20--pestana-rango-resumen-por-rango-de-fechas) → [S-CAJ-21](09_pantallas_caja.md#p-caj--s-caj-21--selector-de-fecha-de-reportes) → «Exportar CSV» / «Imprimir» ([S-CAJ-24](09_pantallas_caja.md#p-caj--s-caj-24--impresion-y-exportacion-dialogo-del-sistema-y-auditoria)) |
| Visión de compañía y desglose por sede | Administrador | [S-CAJ-22](09_pantallas_caja.md#p-caj--s-caj-22--reportes-de-la-compania) → [S-CAJ-23](09_pantallas_caja.md#p-caj--s-caj-23--vista-diaria-de-la-compania-tabla-por-sede) → fila de sede → [S-CAJ-19](09_pantallas_caja.md#p-caj--s-caj-19--pestana-diario-reporte-diario-de-una-sede) → [S-CAJ-20](09_pantallas_caja.md#p-caj--s-caj-20--pestana-rango-resumen-por-rango-de-fechas) |

Los pasos detallados están en las guías de rol: [01 — Recepción](01_recepcion.md) y [04 — Administrador](04_administrador.md).

---

### <a id="p-caj--s-caj-01--caja-cola-de-checkout"></a>S-CAJ-01 Caja (cola de checkout)

**Ruta:** `/app/<código>/checkout/queue` (`RouteNames.checkoutQueue`) · **Tipo:** página

**Propósito**

Lista las visitas de la sede activa que están en «Listo para caja» o «En caja» para que Recepción inicie o retome el cobro.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Completo | — |
| Enfermería / asistente médico | Sin acceso | El ítem de menú está oculto (permiso `recordManualPayment`) y la guarda de ruta redirige al Panel de la sede activa. |
| Proveedor | Sin acceso | Ídem. |

En el servidor, `EncounterService/ListQueue` exige `viewQueue` en la sede y `BillingService/ListDailyStatements` exige `ViewCharges` con líneas (a Enfermería le respondería `PERMISSION_DENIED totals_only`).

**Cómo se llega**

- Menú principal «Caja» (icono de caja registradora); en más de 600 px aparece en el riel o en el menú lateral.
- En teléfono (menos de 600 px) la barra inferior muestra solo los 5 primeros destinos: para Recepción (Panel, Pacientes, Citas, Caja, Reportes) «Caja» está en la barra; para el Administrador (Panel, Pacientes, Citas, Cola de enfermería, Cola de proveedor) solo se alcanza desde el menú hamburguesa.
- «Atrás» desde [S-CAJ-03](09_pantallas_caja.md#p-caj--s-caj-03--checkout-de-la-visita) cuando no hay historial.

**Distribución**

- Encabezado: título «Caja». Subtítulo en plural: «Sin visitas en checkout» / «1 visita en checkout» / «{n} visitas en checkout» (oculto mientras carga).
- Acción del encabezado: botón de icono «Actualizar».
- Cuerpo: cuadrícula responsiva de tarjetas de altura fija (184 px); cada tarjeta es [S-CAJ-02](09_pantallas_caja.md#p-caj--s-caj-02--tarjeta-de-visita-en-la-cola-de-caja).
- Orden: primero las visitas «En caja» (alguien ya las atiende) y luego las «Listo para caja», de la que más espera a la que menos (hora en que quedó lista, o la de registro si falta).

**Campos**

Sin campos, filtros ni búsqueda.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Actualizar» (icono) | Administrador, Recepción | Vuelve a llamar a `EncounterService/ListQueue` (estados `READY_FOR_CHECKOUT` y `CHECKOUT`) y `BillingService/ListDailyStatements`. | No | Barra fina; las tarjetas se mantienen. |
| Tocar una tarjeta | Administrador, Recepción | Abre el checkout sin cambiar el estado (ver [S-CAJ-02](09_pantallas_caja.md#p-caj--s-caj-02--tarjeta-de-visita-en-la-cola-de-caja) para «Abrir» e «Iniciar checkout»). | No | [S-CAJ-03](09_pantallas_caja.md#p-caj--s-caj-03--checkout-de-la-visita). |

**Estados y mensajes**

- Cargando sin datos previos: indicador circular centrado.
- Vacío: icono de caja con el texto «No hay visitas listas para checkout.» (el mensaje secundario está vacío).
- Error sin datos: «Algo salió mal», el mensaje traducido (p. ej. «No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.») y «Reintentar».
- Refresco en segundo plano: barra lineal fina arriba; las tarjetas y el scroll se mantienen.
- Fallo de refresco con datos: banner rojo compacto arriba con el mensaje y «Reintentar», sin borrar las tarjetas.
- Sin sede activa: lista vacía.
- Sin permiso: el usuario nunca llega; la guarda redirige al Panel.

**Tiempo real**

`encounter.created.v1`, `encounter.state_changed.v1` y `encounter.provider_assigned.v1` invalidan la cola y los saldos del día; `billing.changed.v1` invalida los saldos de las tarjetas. También se invalida en la resincronización (reconexión del WebSocket o cambio de sede). En modo degradado («Las actualizaciones en vivo están demoradas…») se refresca cada 30 s. Los eventos solo llevan identificadores y la pantalla vuelve a leer por gRPC.

**Reglas de negocio**

- Solo se muestran los estados «Listo para caja» (`READY_FOR_CHECKOUT`) y «En caja» (`CHECKOUT`) de la sede de la URL; el servidor valida la sede y no confía en el encabezado.
- El contador del subtítulo incluye ambos estados.
- Los saldos vienen del servidor; la app no suma importes.

**Notas para el rediseño**

- Preservar la separación entre los dos estados y el orden («En caja» primero, luego por mayor tiempo de espera).
- Preservar «Actualizar» manual, porque en modo degradado el tiempo real se retrasa.
- El subtítulo dice «visitas en checkout» aunque también cuenta las «Listo para caja».
- Terminología mezclada para el mismo concepto: menú «Caja», texto vacío «checkout», chips «Listo para caja» / «En caja», Panel «Listo para cobro» / «En cobro» / «Cobro» y, en la visita, «Listo para pago» / «Iniciar pago». Unificar.
- No hay búsqueda ni filtro por paciente o proveedor; con muchas visitas cuesta encontrar una.
- La altura fija de 184 px puede recortar tarjetas estrechas con nombres o metadatos largos.
- El estado vacío deja una línea en blanco (mensaje secundario vacío).

**Código fuente:** `features/checkout/presentation/checkout_queue_page.dart`, `features/checkout/application/checkout_providers.dart`, `features/billing/billing_feature.dart`, `core/navigation/nav_items.dart`, `core/routing/routes.dart`, `core/routing/app_router.dart`, `core/widgets/app_shell.dart`.

---

### <a id="p-caj--s-caj-02--tarjeta-de-visita-en-la-cola-de-caja"></a>S-CAJ-02 Tarjeta de visita en la cola de caja

**Ruta:** componente de `/app/<código>/checkout/queue` · **Tipo:** panel

**Propósito**

Resume una visita pendiente de cobro y permite abrirla o iniciar su checkout.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Ve la tarjeta, «Abrir» e «Iniciar checkout». |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | No llega a la página (guarda de ruta). |
| Proveedor | Sin acceso | Ídem. |

«Iniciar checkout» solo aparece si la visita está en «Listo para caja» y el usuario tiene `recordManualPayment`. En el servidor, `TransitionEncounter` → `CHECKOUT` exige `RecordManualPayment` (paso de Recepción; el Administrador está implícito).

**Cómo se llega**

Dentro de [S-CAJ-01](09_pantallas_caja.md#p-caj--s-caj-01--caja-cola-de-checkout).

**Distribución**

- Fila 1: nombre del paciente (descifrado, en formato título, una línea con elipsis; «…» mientras carga `GetPatient`) y debajo el código del paciente en monoespaciado (p. ej. `LAN-P-000123`; mantener pulsado lo copia). A la derecha, el chip de estado.
- Fila 2, metadatos con icono: cronómetro que avanza cada segundo desde que la visita quedó lista; «Lista desde {hora}» (zona de la sede); tipo de cita según el catálogo y el idioma, o «Sin cita»; nombre del proveedor, «Sin asignar» si no tiene o «Asignado» si el nombre no está en el directorio.
- Fila 3: «Saldo: $X» en negrita («…» mientras carga, «—» si no hay estado de cuenta). A la derecha, los botones «Abrir» (texto) e «Iniciar checkout» (relleno, icono play; spinner mientras trabaja).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| Nombre del paciente | Texto (solo lectura) | — | — | Sí |
| «Saldo» | Importe (solo lectura) | — | Calculado por el servidor | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Tocar la tarjeta o «Abrir» | Administrador, Recepción | Navega a `/app/<código>/checkout/<encounterId>` sin cambiar el estado. | No | [S-CAJ-03](09_pantallas_caja.md#p-caj--s-caj-03--checkout-de-la-visita). |
| «Iniciar checkout» | Administrador, Recepción; solo en «Listo para caja» | `EncounterService/TransitionEncounter` a `CHECKOUT` con la `expected_version` de la fila. | No | Éxito: refresca la cola, snackbar «Checkout iniciado.» y abre [S-CAJ-03](09_pantallas_caja.md#p-caj--s-caj-03--checkout-de-la-visita). Error: refresca la cola y snackbar con el motivo: órdenes abiertas → «Esta visita aún tiene órdenes pendientes o en curso. Complételas o cancélelas antes de continuar.»; conflicto → «Otra persona actualizó el estado de cuenta. Se ha actualizado.»; `invalid_transition` → «Esta transición no está permitida en el estado actual.»; `transition_not_owned` → «Su rol no realiza este paso.»; `encounter_closed` → «La visita ya está cerrada.» |

**Estados y mensajes**

- Chip «Listo para caja» (tono info, azul) o «En caja» (tono éxito, verde).
- Ocupado: spinner en el botón y botón deshabilitado (evita el doble envío).
- El saldo sale de los estados de cuenta del día; para visitas registradas otro día se pide un `GetStatement` por tarjeta, de forma diferida.

**Tiempo real**

Igual que [S-CAJ-01](09_pantallas_caja.md#p-caj--s-caj-01--caja-cola-de-checkout). El nombre del paciente se lee con `GetPatient` por tarjeta; esa lectura de PHI se audita en el servidor.

**Reglas de negocio**

- «Listo para caja» → «En caja» es un paso de Recepción y el servidor lo rechaza mientras la visita tenga órdenes clínicas abiertas (`open_orders`).
- Concurrencia optimista: si la visita cambió, el servidor responde `ABORTED` y la cola se refresca.

**Notas para el rediseño**

- Preservar la diferencia entre abrir (no cambia el estado) e iniciar checkout (sí lo cambia).
- Preservar el bloqueo de doble envío mientras está ocupado.
- Mostrar solo nombre y código del paciente, sin otros datos personales.
- Las órdenes abiertas aquí salen como snackbar, mientras que en [S-CAJ-03](09_pantallas_caja.md#p-caj--s-caj-03--checkout-de-la-visita) abren un diálogo con «Ir a órdenes» ([S-CAJ-06](09_pantallas_caja.md#p-caj--s-caj-06--dialogo-ordenes-abiertas)). Unificar.
- «Lista desde» muestra la hora de registro cuando falta la hora en que quedó lista: la etiqueta engaña.
- En las visitas «En caja» el cronómetro sigue contando desde que quedaron listas, no desde que empezó el cobro.
- Un conflicto en la visita se muestra con el texto del estado de cuenta (ver [S-CAJ-04](09_pantallas_caja.md#p-caj--s-caj-04--barra-de-estado-de-la-visita-checkout)), lo que confunde.

**Código fuente:** `features/checkout/presentation/checkout_queue_page.dart`, `features/encounters/presentation/waiting_time_ticker.dart`, `appointment_type_text.dart`, `encounter_labels.dart`, `features/patients/presentation/patient_labels.dart`, `features/billing/application/billing_providers.dart`, `core/widgets/human_code_text.dart`.

---

### <a id="p-caj--s-caj-03--checkout-de-la-visita"></a>S-CAJ-03 Checkout de la visita

**Ruta:** `/app/<código>/checkout/<encounterId>` (`RouteNames.checkout`) · **Tipo:** página

**Propósito**

Cerrar la cuenta de una visita: revisar el estado de cuenta, ajustar cargos y descuentos, registrar pagos manuales, generar e imprimir recibos y completar la visita.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Incluye anular cargos y pagos. |
| Recepción | Limitado | Todo salvo las anulaciones: los botones de anular cargo y pago están ocultos (el servidor responde `admin_only`). |
| Enfermería / asistente médico | Sin acceso | Sin ítem de menú; la guarda de ruta (`recordManualPayment`) redirige al Panel. |
| Proveedor | Sin acceso | Ídem. |

En el servidor, `GetStatement` exige `ViewCharges` en la sede de la visita y todas las escrituras exigen `RecordManualPayment` en esa sede.

**Cómo se llega**

- Desde [S-CAJ-02](09_pantallas_caja.md#p-caj--s-caj-02--tarjeta-de-visita-en-la-cola-de-caja) (tocar, «Abrir» o «Iniciar checkout»).
- Desde la sección Facturación de la visita ([S-CAJ-16](09_pantallas_caja.md#p-caj--s-caj-16--seccion-facturacion-en-la-pantalla-de-la-visita), «Ir a checkout»).
- Desde la pestaña Saldos del paciente ([S-CAJ-17](09_pantallas_caja.md#p-caj--s-caj-17--pestana-saldos-del-perfil-del-paciente), «Abrir checkout»).
- Por enlace directo con la URL.

**Distribución**

- Encabezado: flecha «Atrás» (vuelve en el historial o, si no hay, a «Caja»); título = nombre del paciente (PHI), o «Checkout» mientras carga; subtítulo «Checkout».
- Acciones del encabezado: icono «Actualizar», icono «Abrir visita» y, si se conoce el paciente, icono «Abrir perfil del paciente».
- Cuerpo desplazable con 16 px de margen; arriba, la barra de estado ([S-CAJ-04](09_pantallas_caja.md#p-caj--s-caj-04--barra-de-estado-de-la-visita-checkout)).
- Más de 1024 px: dos columnas. Izquierda (3/5): tarjeta «Estado de cuenta» ([S-CAJ-07](09_pantallas_caja.md#p-caj--s-caj-07--tarjeta-estado-de-cuenta-lineas-cobertura-totales)). Derecha (2/5): tarjeta «Pagos» ([S-CAJ-11](09_pantallas_caja.md#p-caj--s-caj-11--tarjeta-pagos-panel-registrar-pago-pago-manual) y [S-CAJ-12](09_pantallas_caja.md#p-caj--s-caj-12--lista-de-pagos-registrados-y-anulados)) y debajo la tarjeta de recibos ([S-CAJ-14](09_pantallas_caja.md#p-caj--s-caj-14--panel-recibos-generar-ver-imprimir-y-reimprimir)).
- 1024 px o menos: una sola columna con barra de estado, Estado de cuenta, Pagos y Recibos.
- Visita cerrada: nota al pie centrada «Esta visita está cerrada. El estado de cuenta es de solo lectura.»

**Campos**

Sin campos propios; están en los paneles hijos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Actualizar» | Administrador, Recepción | Vuelve a leer el estado de cuenta (`GetStatement`), la visita (`GetEncounter` y `GetEncounterTimeline`) y la lista de recibos. | No | Barras finas de refresco. |
| «Abrir visita» | Ídem | Navega a `/app/<código>/encounters/<id>`. | No | [S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita). |
| «Abrir perfil del paciente» | Ídem | Navega a `/app/<código>/patients/<patientId>`. | No | [S-PAC-05](06_pantallas_pacientes.md#p-pac--s-pac-05--perfil-del-paciente). |
| «Atrás» | Ídem | Vuelve en el historial o va a `/app/<código>/checkout/queue`. | No | Pantalla anterior o [S-CAJ-01](09_pantallas_caja.md#p-caj--s-caj-01--caja-cola-de-checkout). |

**Estados y mensajes**

- Visita cargando: spinner. Error: vista de error completa con «Reintentar».
- La tarjeta Pagos no aparece hasta que carga el estado de cuenta.
- Editable = Administrador o Recepción, visita abierta (no «Completada», «Se retiró» ni «Cancelada»), estado de cuenta existente y no anulado. Si no es editable se ocultan «Recalcular», «Agregar cargo», los descuentos, las anulaciones y el panel de pago.
- Visita cerrada: solo lectura, con pagos y recibos visibles; «Generar recibo» sigue disponible porque solo exige que el estado de cuenta no esté anulado.
- Solo se ejecuta una operación a la vez.

**Tiempo real**

La visita se vuelve a leer con `encounter.*` de su identificador y con cualquier `order.*` o `billing.changed.v1`; el estado de cuenta, con `billing.changed.v1` y la resincronización; los recibos, con `receipt.generated.v1`. En modo degradado, cada 30 s.

**Reglas de negocio**

- El servidor calcula todas las cifras (`GetStatement` recalcula); la app solo da formato.
- Se puede cobrar, agregar cargos o descontar en cualquier estado abierto, no solo en «En caja» (cobro anticipado).
- Cada escritura refresca el estado de cuenta, el historial de la visita, los saldos del día y los saldos del paciente, con éxito o con error.
- El servidor valida la sede en cada operación.

**Notas para el rediseño**

- Preservar el cambio a dos columnas a partir de 1024 px y los accesos rápidos a la visita y al perfil.
- Mostrar el nombre del paciente solo en el título; no añadir más datos personales.
- Tras «Completar visita» el usuario se queda en la página sin volver a la cola; valorar el regreso automático u ofrecer un botón «Volver a Caja».
- La tarjeta de Recibos no tiene título de tarjeta (el panel trae el suyo), a diferencia de «Estado de cuenta» y «Pagos».
- El término inglés «Checkout» aparece en la interfaz en español.
- La página no protege un monto escrito en el panel de pago al salir por el menú o con «Atrás» (ver [S-CAJ-11](09_pantallas_caja.md#p-caj--s-caj-11--tarjeta-pagos-panel-registrar-pago-pago-manual)).

**Código fuente:** `features/checkout/presentation/checkout_page.dart`, `features/billing/application/billing_providers.dart`, `billing_commands.dart`, `features/billing/infrastructure/billing_gateway.dart`, `features/billing/domain/statement_view.dart`, `core/widgets/breakpoints.dart`, `core/widgets/page_scaffold.dart`.

---

### <a id="p-caj--s-caj-04--barra-de-estado-de-la-visita-checkout"></a>S-CAJ-04 Barra de estado de la visita (checkout)

**Ruta:** componente de `/app/<código>/checkout/<encounterId>` · **Tipo:** panel

**Propósito**

Muestra el código y el estado de la visita y ofrece los pasos del flujo de caja.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | «Iniciar checkout» y «Completar visita» (`recordManualPayment`). |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | No llega a la página. |
| Proveedor | Sin acceso | Ídem. |

En el servidor, pasar a `CHECKOUT` exige `RecordManualPayment` y pasar a `COMPLETED` exige `GenerateReceipt`; ambos pasos son de Recepción y el Administrador está implícito.

**Cómo se llega**

Parte superior de [S-CAJ-03](09_pantallas_caja.md#p-caj--s-caj-03--checkout-de-la-visita).

**Distribución**

- Tarjeta con: código de la visita en monoespaciado (p. ej. `LAN-E-000123`); chip de estado; botón «Iniciar checkout» (icono play) si está en «Listo para caja»; botón «Completar visita» (icono de tarea hecha) si está en «En caja»; spinner mientras trabaja.
- Texto «Esta visita aún no está en checkout.» solo si está lista y el usuario no tiene permiso; en la práctica no se ve porque la guarda lo impide.

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Iniciar checkout» | Administrador, Recepción | `TransitionEncounter` → `CHECKOUT` con `expected_version`. | No | Snackbar «Checkout iniciado.» e invalida la cola. Con órdenes abiertas abre [S-CAJ-06](09_pantallas_caja.md#p-caj--s-caj-06--dialogo-ordenes-abiertas); otros errores, snackbar traducido. |
| «Completar visita» | Administrador, Recepción | Si el saldo es mayor que cero abre antes [S-CAJ-05](09_pantallas_caja.md#p-caj--s-caj-05--dialogo-completar-visita-con-saldo-pendiente); luego `TransitionEncounter` → `COMPLETED`. | Solo con saldo pendiente | Snackbar «Visita completada.»; invalida la cola y los saldos del día; la página pasa a solo lectura. |

**Estados y mensajes**

- Chips: «Listo para caja» (azul, info), «En caja» (verde, éxito), «Completada» (verde, éxito), «Se retiró» y «Cancelada» (gris, neutro); otros estados abiertos (p. ej. «Con proveedor») en azul o verde según su tono.
- Ocupado: botones deshabilitados y spinner.
- En estados distintos de «Listo para caja» o «En caja» (p. ej. «Con proveedor») solo se ven el código y el chip, sin botones.

**Tiempo real**

Se refresca cuando cambia la visita (`encounter.state_changed.v1` y otros), por ejemplo si otro usuario inició el checkout.

**Reglas de negocio**

- «Listo para caja» → «En caja» queda bloqueado con órdenes abiertas.
- «En caja» → «Completada» se permite aunque quede saldo: el saldo queda abierto en la cuenta del paciente.
- Concurrencia: si la versión de la visita no coincide, el servidor responde `ABORTED`; se muestra el snackbar y la pantalla se refresca.

**Notas para el rediseño**

- Preservar la confirmación obligatoria al completar con saldo pendiente, y que no aparezca cuando no hay saldo.
- Un conflicto de versión al cambiar el estado se muestra como «Otra persona actualizó el estado de cuenta. Se ha actualizado.» aunque lo que cambió fue la visita; en la pantalla de la visita el texto es «Otra persona actualizó esta visita. La pantalla se ha actualizado.».
- En la pantalla de la visita el mismo paso se llama «Iniciar pago» y aquí «Iniciar checkout»; además, allí «Completar visita» no pide confirmación con saldo ([S-CLI-07](08_pantallas_clinicas.md#p-cli--s-cli-07--barra-de-acciones-de-la-visita-incluye-banner-de-visita-cerrada)). Unificar.
- «En caja» y «Completada» comparten el color verde: cuesta distinguirlos de un vistazo.

**Código fuente:** `features/checkout/presentation/checkout_page.dart`, `features/encounters/application/encounter_commands.dart`, `features/encounters/presentation/encounter_labels.dart`.

---

### <a id="p-caj--s-caj-05--dialogo-completar-visita-con-saldo-pendiente"></a>S-CAJ-05 Diálogo «Completar visita» con saldo pendiente

**Ruta:** diálogo sobre `/app/<código>/checkout/<encounterId>` · **Tipo:** diálogo

**Propósito**

Evitar cerrar por descuido una visita con saldo.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Al pulsar «Completar visita» con saldo mayor que cero. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Botón «Completar visita» de [S-CAJ-04](09_pantallas_caja.md#p-caj--s-caj-04--barra-de-estado-de-la-visita-checkout).

**Distribución**

- Título «Completar visita».
- Mensaje «Queda un saldo de {monto}. Permanecerá en la cuenta del paciente como saldo abierto. ¿Completar la visita de todos modos?», con el monto formateado según el idioma.
- Botones «Cancelar» (texto) y «Completar visita» (relleno, no destructivo).

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Completar visita» | Administrador, Recepción | Ejecuta `TransitionEncounter` → `COMPLETED` (ver [S-CAJ-04](09_pantallas_caja.md#p-caj--s-caj-04--barra-de-estado-de-la-visita-checkout)). | Este diálogo | «Visita completada.» |
| «Cancelar» o cerrar el diálogo | Ídem | No hace nada. | — | — |

**Estados y mensajes**

- Modal: devuelve confirmado o no confirmado.

**Tiempo real**

No aplica.

**Reglas de negocio**

- El saldo mostrado es el del servidor en el último estado de cuenta leído.
- El saldo sigue vivo como estado de cuenta «Abierto» o «Pago parcial» y aparece en la pestaña «Saldos» del paciente ([S-CAJ-17](09_pantallas_caja.md#p-caj--s-caj-17--pestana-saldos-del-perfil-del-paciente)).

**Notas para el rediseño**

- Preservar el monto exacto en el mensaje.
- El botón de confirmar no usa estilo de advertencia aunque la acción tiene consecuencias económicas.
- Advertencia funcional: una vez completada la visita, la interfaz no permite registrar pagos ([S-CAJ-03](09_pantallas_caja.md#p-caj--s-caj-03--checkout-de-la-visita) queda en solo lectura), aunque el servidor sí lo permite. El texto promete un saldo abierto que luego no se puede cobrar desde la app (ver las preguntas abiertas).

**Código fuente:** `features/checkout/presentation/checkout_page.dart`, `core/widgets/confirm_dialog.dart`.

---

### <a id="p-caj--s-caj-06--dialogo-ordenes-abiertas"></a>S-CAJ-06 Diálogo «Órdenes abiertas»

**Ruta:** diálogo sobre `/app/<código>/checkout/<encounterId>` · **Tipo:** diálogo

**Propósito**

Explicar que no se puede cobrar mientras haya órdenes clínicas pendientes o en curso, y llevar a ellas.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Cuando el servidor rechaza el cambio de estado con `open_orders`. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Respuesta de error al pulsar «Iniciar checkout» en [S-CAJ-04](09_pantallas_caja.md#p-caj--s-caj-04--barra-de-estado-de-la-visita-checkout).

**Distribución**

- Título «Órdenes abiertas».
- Texto «Esta visita aún tiene órdenes pendientes o en curso. Complételas o cancélelas antes de continuar.»
- Botones «Cerrar» e «Ir a órdenes» (relleno).

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Cerrar» | Administrador, Recepción | Cierra el diálogo. | — | — |
| «Ir a órdenes» | Ídem | Cierra y navega a `/app/<código>/encounters/<id>` (sin `?section=orders`). | — | [S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita), en la parte superior. |

**Estados y mensajes**

- Modal.

**Tiempo real**

No aplica.

**Reglas de negocio**

- El bloqueo del servidor se aplica a «Con proveedor» → «Listo para caja», «Procedimiento pendiente» → «Listo para caja» y «Listo para caja» → «En caja».

**Notas para el rediseño**

- «Ir a órdenes» abre la visita arriba, sin desplazarse a la sección Órdenes; podría usar `?section=orders` como hace el diálogo equivalente de la visita ([S-CLI-08](08_pantallas_clinicas.md#p-cli--s-cli-08--dialogo-ordenes-abiertas)).
- Desde la cola ([S-CAJ-02](09_pantallas_caja.md#p-caj--s-caj-02--tarjeta-de-visita-en-la-cola-de-caja)) el mismo error sale como snackbar, sin este diálogo.

**Código fuente:** `features/checkout/presentation/checkout_page.dart`.

---

### <a id="p-caj--s-caj-07--tarjeta-estado-de-cuenta-lineas-cobertura-totales"></a>S-CAJ-07 Tarjeta «Estado de cuenta» (líneas, cobertura, totales)

**Ruta:** componente de `/app/<código>/checkout/<encounterId>` · **Tipo:** panel

**Propósito**

Mostrar los servicios cobrados, los descuentos y los totales que calcula el servidor, y permitir ajustes.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | «Recalcular», «Agregar cargo», «Aplicar descuento» y «Anular cargo». |
| Recepción | Limitado | Igual, salvo «Anular cargo» (oculto; el servidor responde `admin_only`). |
| Enfermería / asistente médico | Sin acceso | El caso «solo totales» (texto «Su rol solo ve los totales de esta visita.», sin líneas) existe en el código, pero aquí no se alcanza por la guarda de ruta. |
| Proveedor | Sin acceso | — |

Las acciones solo aparecen si el estado de cuenta es editable (visita abierta y estado de cuenta no anulado).

**Cómo se llega**

Columna izquierda (o primera tarjeta) de [S-CAJ-03](09_pantallas_caja.md#p-caj--s-caj-03--checkout-de-la-visita).

**Distribución**

- Encabezado: icono, título «Estado de cuenta» y, si es editable, botón de icono «Recalcular» (calculadora) y botón tonal «Agregar cargo» (+).
- Fila de regla: chip de cobertura (info, icono de tarjeta): «Pago directo», «Seguro», «Membresía» o «Sin definir». Si se aplicaron beneficios de membresía, chip verde «Membresía» con icono de carnet. Frase de la regla según la cobertura: «Pago directo: el paciente debe el monto completo.», «Membresía sin beneficio aplicado: el paciente debe el monto completo.», «Los beneficios de la membresía descontaron una o más líneas.», «Seguro: el paciente debe el copago.», «Seguro: el paciente debe el coaseguro.», «Seguro sin copago ni coaseguro: el paciente debe el monto completo.» o «Regla de porción del paciente no disponible.»
- Líneas en 600 px o más: tabla con desplazamiento horizontal. Columnas «Servicio» (código monoespaciado en negrita y debajo el origen «Orden» o «Manual»), «Cant.», «Precio unitario», «Descuento» (insignia «Manual» azul con lápiz o «Membresía» verde con carnet, y el monto; «—» sin descuento), «Total línea» (negrita) y una columna de acciones: icono % «Aplicar descuento» e icono de bloqueo «Anular cargo».
- Líneas en menos de 600 px: una tarjeta por línea con código y origen, total a la derecha, «Cant. N × $precio», «Descuento: insignia monto» y las acciones a la derecha.
- Sin cargos activos: «Esta visita aún no tiene cargos.»
- Cargos anulados: sección plegable «1 cargo anulado» / «{n} cargos anulados»; cada uno con el código tachado, «Anulado: {motivo}» y el importe tachado.
- Totales: «Subtotal», «Descuento total», «Total a pagar» (destacado), «Pagado» y «Saldo» (grande y en negrita; los negativos en rojo). A la derecha, el chip de estado del estado de cuenta.

**Campos**

Sin campos editables en la tarjeta; ver [S-CAJ-08](09_pantallas_caja.md#p-caj--s-caj-08--dialogo-agregar-cargo-manual), [S-CAJ-09](09_pantallas_caja.md#p-caj--s-caj-09--dialogo-aplicar-descuento) y [S-CAJ-10](09_pantallas_caja.md#p-caj--s-caj-10--dialogo-anular-cargo).

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Servicio» | Código de descripción (solo lectura) | — | Sin texto libre | No |
| Importes («Precio unitario», «Descuento», «Total línea», totales) | Dinero (solo lectura) | — | Calculados por el servidor | No |
| «Anulado: {motivo}» | Texto (solo lectura) | — | — | Sí (cifrado en reposo) |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Recalcular» (icono) | Administrador, Recepción; editable | `BillingService/RecalculateStatement` (idempotente; se reintenta tras renovar la sesión). | No | Snackbar «Estado de cuenta recalculado.». |
| «Agregar cargo» | Ídem | Abre el diálogo de cargo manual. | — | [S-CAJ-08](09_pantallas_caja.md#p-caj--s-caj-08--dialogo-agregar-cargo-manual). |
| «Aplicar descuento» (icono % de una línea activa) | Ídem | Abre el diálogo de descuento. | — | [S-CAJ-09](09_pantallas_caja.md#p-caj--s-caj-09--dialogo-aplicar-descuento). |
| «Anular cargo» (icono de bloqueo) | Solo Administrador | Abre el diálogo de anulación. En cargos de origen «Orden» el botón está deshabilitado con el aviso «Los cargos de órdenes se anulan cancelando la orden.» | — | [S-CAJ-10](09_pantallas_caja.md#p-caj--s-caj-10--dialogo-anular-cargo). |

**Estados y mensajes**

- Cargando sin datos: spinner. Error sin datos: banner rojo compacto con «Reintentar». Refresco: barra fina. Error con datos: banner encima de la tabla.
- Sin estado de cuenta: «Esta visita aún no tiene estado de cuenta.»
- Chip de estado del estado de cuenta: «Abierto» (ámbar, advertencia), «Pago parcial» (azul, info), «Pagado» (verde, éxito), «Anulado» (gris, neutro), «Desconocido» (gris).
- Saldo negativo (crédito a favor del paciente tras anular un cargo ya pagado): se muestra en rojo con signo menos.

**Tiempo real**

Se vuelve a leer con `billing.changed.v1` (por ejemplo, un cargo creado al ordenar en la visita), con cada escritura propia y en la resincronización.

**Reglas de negocio**

- Un estado de cuenta por visita, recalculado a partir de los cargos ACTIVOS y los pagos REGISTRADOS; la app nunca suma.
- «Descuento total» = descuentos de línea + ajuste del seguro (copago o coaseguro).
- Beneficios de membresía: solo con cobertura Membresía y una membresía ACTIVA el día de la visita; solo afectan a cargos de origen «Orden» sin descuento manual. Un descuento manual siempre prevalece y la membresía ya no vuelve a tocar esa línea.
- Los cargos de órdenes solo se anulan cancelando la orden ([S-CLI-21](08_pantallas_clinicas.md#p-cli--s-cli-21--dialogo-cancelar-orden)).
- Las descripciones de cargo son códigos, nunca texto libre (sin PHI).
- Nada se borra: los cargos anulados se conservan con su motivo (cifrado en reposo).
- Según el alcance de V1, un saldo negativo es un crédito a favor del paciente; no hay reembolsos en V1.

**Notas para el rediseño**

- Preservar que las cifras sean exactamente las del servidor, las cinco filas de totales y el chip de estado.
- Preservar las insignias de origen del descuento («Manual» frente a «Membresía») y del cargo («Orden» frente a «Manual»): explican por qué cambia un precio.
- Preservar el botón de anular deshabilitado con su aviso en los cargos de orden.
- Preservar la tabla en tablet y escritorio y las tarjetas en teléfono.
- Un saldo negativo (crédito) se ve en rojo, como si fuera un error; conviene un tratamiento propio de crédito.
- El chip «Membresía» significa «cobertura» en un sitio y «beneficio aplicado» en otro, con el mismo texto.
- «Recalcular» es solo un icono con tooltip; no queda claro cuándo usarlo (por ejemplo, tras cambiar la cobertura o la membresía).
- La tabla puede necesitar desplazamiento horizontal en anchos medianos.

**Código fuente:** `features/billing/presentation/statement_table.dart`, `features/checkout/presentation/checkout_page.dart`, `features/billing/presentation/billing_labels.dart`, `features/billing/domain/statement_view.dart`, `core/widgets/money_text.dart`, `features/patients/presentation/patient_labels.dart`.

---

### <a id="p-caj--s-caj-08--dialogo-agregar-cargo-manual"></a>S-CAJ-08 Diálogo «Agregar cargo manual»

**Ruta:** diálogo sobre `/app/<código>/checkout/<encounterId>` · **Tipo:** diálogo

**Propósito**

Añadir un cargo que no vino de una orden clínica.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | El botón «Agregar cargo» solo existe si el estado de cuenta es editable. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

En el servidor: `RecordManualPayment` en la sede, visita no cancelada y estado de cuenta no anulado.

**Cómo se llega**

Botón «Agregar cargo» del encabezado de [S-CAJ-07](09_pantallas_caja.md#p-caj--s-caj-07--tarjeta-estado-de-cuenta-lineas-cobertura-totales).

**Distribución**

- Título «Agregar cargo manual» (ancho de 420 px).
- Campo «Código de descripción».
- Fila: «Precio unitario (USD)» (3/5) y «Cantidad» (2/5).
- Campo «Descuento (USD)» con la ayuda «Opcional».
- Botones «Cancelar» y «Agregar cargo».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Código de descripción» | Texto con foco automático y mayúsculas automáticas; pista «p. ej. CONSULTA\_SEGUIMIENTO»; ayuda «Hasta 60 caracteres: A–Z, 0–9, \_ . / - (sin texto libre).» | Sí | El filtro de entrada solo deja pasar A-Z, a-z, 0-9, `_ . / -` y descarta en silencio espacios, acentos y ñ; máx. 60; error «Use solo A–Z, 0–9, \_ . / - (máx. 60 caracteres).»; se normaliza con recorte y mayúsculas | No (por diseño) |
| «Precio unitario (USD)» | Dinero; prefijo «$ », alineado a la derecha, teclado decimal; caracteres 0-9 . , $ y espacio; máx. 20 | Sí (admite $0.00) | «Ingrese un monto.» / «Ingrese un monto válido con hasta dos decimales.»; la coma solo vale como separador de miles (`1,234.56`); `12,50` se rechaza | No |
| «Cantidad» | Entero, solo dígitos, máx. 3; valor inicial 1 | Sí | 1 a 999: «Ingrese un número entero de 1 a 999.» | No |
| «Descuento (USD)» | Dinero | No (vacío = sin descuento; admite 0) | Formato como el precio; el tope (no superar precio × cantidad) lo valida el servidor | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Agregar cargo» (o Intro en el campo de descuento) | Administrador, Recepción | Valida el formulario, cierra el diálogo y luego llama a `BillingService/AddManualCharge` (sin `expected_version`: es una fila nueva). | No | Snackbar «Cargo agregado.» y refresco del estado de cuenta. Errores en snackbar: «El código de descripción no es válido.», «El descuento supera el monto de la línea (precio unitario × cantidad).», «Esta visita fue cancelada; la facturación está cerrada.», «Este estado de cuenta está anulado; no se permiten más cambios.», «Solo se admiten montos en USD.» |
| «Cancelar» | Ídem | Cierra sin cambios. | — | — |

**Estados y mensajes**

- Validación al interactuar con cada campo y validación completa al enviar.

**Tiempo real**

No aplica; el alta genera `billing.changed.v1` para los demás usuarios.

**Reglas de negocio**

- El cargo se crea con origen «Manual»; los beneficios de membresía nunca descuentan cargos manuales.
- Dinero exacto en centavos enteros, solo USD.

**Notas para el rediseño**

- Preservar la restricción de código sin texto libre: evita PHI en las descripciones.
- El diálogo se cierra antes de la llamada; si el servidor rechaza (p. ej. el descuento supera el bruto) se pierde lo escrito.
- Los caracteres no permitidos se descartan sin aviso: quien escribe «Consulta niño» no entiende por qué faltan letras.
- No hay un catálogo para elegir: el código se escribe a mano.
- Se escribe `1234.50` (punto decimal) aunque en español los importes se muestran como «1.234,50 $».

**Código fuente:** `features/billing/presentation/billing_dialogs.dart`, `money_field.dart`, `features/billing/domain/money_input.dart`, `statement_view.dart`.

---

### <a id="p-caj--s-caj-09--dialogo-aplicar-descuento"></a>S-CAJ-09 Diálogo «Aplicar descuento»

**Ruta:** diálogo sobre `/app/<código>/checkout/<encounterId>` · **Tipo:** diálogo

**Propósito**

Fijar a mano el descuento de una línea.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Líneas activas de un estado de cuenta editable. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

En el servidor: `RecordManualPayment` en la sede.

**Cómo se llega**

Icono % «Aplicar descuento» de una línea en [S-CAJ-07](09_pantallas_caja.md#p-caj--s-caj-07--tarjeta-estado-de-cuenta-lineas-cobertura-totales).

**Distribución**

- Título «Aplicar descuento» (ancho de 380 px).
- «Línea {código}».
- Fila «Cant. N × $precio» y, a la derecha, «Total línea: $X».
- Campo «Descuento (USD)» con la ayuda «Marca la línea como descuento manual; los beneficios de membresía no la cambiarán después. No debe superar precio unitario × cantidad.»
- Botones «Cancelar» y «Aplicar descuento».

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Descuento (USD)» | Dinero; precargado con el descuento actual si lo hay | Sí (vacío → «Ingrese un monto.») | Admite 0; máx. dos decimales; el tope lo valida el servidor | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Aplicar descuento» (o Intro) | Administrador, Recepción | Cierra el diálogo y llama a `BillingService/ApplyDiscount` con la `expected_version` del cargo. | No | Snackbar «Descuento aplicado.». Errores: «El descuento supera el monto de la línea (precio unitario × cantidad).»; conflicto → «Otra persona actualizó el estado de cuenta. Se ha actualizado.» (y se refresca); «Este cargo ya está anulado.»; «Esta visita fue cancelada; la facturación está cerrada.» |
| «Cancelar» | Ídem | Cierra sin cambios. | — | — |

**Estados y mensajes**

- Validación al interactuar.

**Tiempo real**

No aplica.

**Reglas de negocio**

- Cualquier descuento escrito a mano, incluido 0, marca la línea como «Manual» y deja de recibir beneficios de membresía de forma permanente.
- Debe cumplirse 0 ≤ descuento ≤ precio unitario × cantidad.
- Aplicar el mismo valor que ya tiene una línea manual no cambia nada (no queda auditoría de escritura).

**Notas para el rediseño**

- Preservar la advertencia explícita de que un descuento manual anula los beneficios de membresía de esa línea.
- Escribir 0 para «quitar» un descuento también desactiva la membresía en la línea; no hay forma de devolverla al cálculo automático.
- El diálogo se cierra antes de la respuesta del servidor; ante un error hay que volver a escribir el valor.
- No hay descuento por porcentaje; solo importe.

**Código fuente:** `features/billing/presentation/billing_dialogs.dart`, `money_field.dart`, `features/billing/application/billing_commands.dart`.

---

### <a id="p-caj--s-caj-10--dialogo-anular-cargo"></a>S-CAJ-10 Diálogo «Anular cargo»

**Ruta:** diálogo sobre `/app/<código>/checkout/<encounterId>` · **Tipo:** diálogo

**Propósito**

Invalidar un cargo manual cobrado por error, dejando constancia.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Solo cargos de origen «Manual»; los de «Orden» tienen el botón deshabilitado. |
| Recepción | Sin acceso | Botón oculto; el servidor responde `admin_only` → «Solo un administrador puede hacer esto.» |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Icono de bloqueo «Anular cargo» en una línea de [S-CAJ-07](09_pantallas_caja.md#p-caj--s-caj-07--tarjeta-estado-de-cuenta-lineas-cobertura-totales).

**Distribución**

- Título «Anular cargo».
- Resumen: «{CÓDIGO} · Cant. N» en monoespaciado y el total de la línea.
- Campo «Motivo».
- Botones «Cancelar» y «Anular» (rojo).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Motivo» | Texto de 2 líneas, foco automático, contador | Sí (con recorte): «Se requiere un motivo.» | Máx. 200 caracteres | Sí (cifrado en reposo) |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Anular» (o Intro) | Administrador | Cierra el diálogo y llama a `BillingService/VoidCharge` con `expected_version` y el motivo. | Este diálogo | Snackbar «Cargo anulado.»; el cargo pasa a la sección de anulados y el estado de cuenta se recalcula. Errores: «Los cargos de órdenes se anulan cancelando la orden, no aquí.», «Este cargo ya está anulado.», «Se requiere un motivo.», conflicto («Otra persona actualizó…») y `admin_only`. |
| «Cancelar» | Administrador | Cierra sin cambios. | — | — |

**Estados y mensajes**

- Validación al interactuar.

**Tiempo real**

No aplica; genera `billing.changed.v1`.

**Reglas de negocio**

- El motivo se guarda cifrado y después se ve como «Anulado: {motivo}».
- No se borra nada; queda la auditoría `billing.charge_void`.
- Si ya había pagos, el saldo puede quedar negativo (crédito).

**Notas para el rediseño**

- Preservar el motivo obligatorio y el botón de confirmar en color de peligro.
- Avisar de que anular un cargo ya pagado deja crédito a favor, porque no hay reembolsos en V1.
- El motivo puede contener PHI: no mostrarlo en notificaciones ni registros.

**Código fuente:** `features/billing/presentation/billing_dialogs.dart`, `payments_list.dart`.

---

### <a id="p-caj--s-caj-11--tarjeta-pagos-panel-registrar-pago-pago-manual"></a>S-CAJ-11 Tarjeta «Pagos»: panel «Registrar pago» (pago manual)

**Ruta:** componente de `/app/<código>/checkout/<encounterId>` · **Tipo:** panel

**Propósito**

Registrar lo que el paciente pagó en el mostrador. En V1 no hay procesador de pagos ni cobro con tarjeta integrado: el pago se anota tal como se recibió.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Solo con la visita abierta y el estado de cuenta existente (si no, el panel no se dibuja). |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | No llega a la página. |
| Proveedor | Sin acceso | Ídem. |

En el servidor: `RecordManualPayment` en la sede.

**Cómo se llega**

Columna derecha de [S-CAJ-03](09_pantallas_caja.md#p-caj--s-caj-03--checkout-de-la-visita): tarjeta «Pagos», parte superior.

**Distribución**

- Tarjeta con icono y título «Pagos»; dentro, el subencabezado «Registrar pago» (icono de caja).
- «Método»: botones segmentados «Efectivo» (por defecto), «Tarjeta de crédito», «Tarjeta de débito» y «Otro», cada uno con icono.
- Campo «Monto (USD)» con el botón «Pagar saldo» dentro, a la derecha.
- Línea informativa: «Saldo: $X» a la izquierda y «Estado de cuenta v{n}» a la derecha (pequeño, gris).
- Campo «Referencia (opcional)».
- Botón a la derecha «Registrar pago», al que se añade « · $12.50» cuando el monto es válido.
- Debajo, un separador y la lista de pagos ([S-CAJ-12](09_pantallas_caja.md#p-caj--s-caj-12--lista-de-pagos-registrados-y-anulados)).
- Sin nada que cobrar: icono de check y «No hay nada pendiente en este estado de cuenta.» (o «Este estado de cuenta está anulado; no se permiten más cambios.»).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Método» | Selección única (siempre con valor) | Sí | Se deshabilita mientras se envía | No |
| «Monto (USD)» | Dinero; prefijo «$ », alineado a la derecha, teclado decimal; caracteres 0-9 . , $ y espacio; máx. 20 | Sí | Dos decimales como máximo; la coma solo como separador de miles. Errores: «Ingrese un monto.», «Ingrese un monto válido con hasta dos decimales.», «El monto debe ser mayor que cero.», «El monto supera el saldo.» (tope = saldo del servidor), «Solo se admiten montos en USD.» | No |
| «Referencia (opcional)» | Texto; ayuda «Número de cheque, autorización de tarjeta… Después solo se muestran los últimos 4 caracteres.» | No | Máx. 64: «La referencia es demasiado larga (máx. 64 caracteres).» | Sí (cifrada en reposo) |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Pagar saldo» | Administrador, Recepción | Copia el saldo del servidor al campo de monto (con punto decimal, p. ej. `45.00`) y valida. No envía nada. | No | Monto relleno. |
| «Registrar pago · $X» (o Intro en monto o referencia) | Ídem | `BillingService/RecordManualPayment` con monto, método, referencia y `expected_statement_version` (la versión mostrada). Deshabilitado con el monto vacío o mientras se envía. | No | Vacía monto y referencia, snackbar «Pago de {monto} registrado.» y refresca el estado de cuenta, el historial y los saldos. Errores en snackbar: «El monto supera el saldo actual. El estado de cuenta se ha actualizado.»; «No hay nada pendiente en este estado de cuenta.»; conflicto → «Otra persona actualizó el estado de cuenta. Se ha actualizado.»; «Esta visita fue cancelada; la facturación está cerrada.»; red → «No se pudo conectar con el servidor…». No se reintenta solo (no es idempotente). |

**Estados y mensajes**

- Enviando: spinner en el botón; campos y selector deshabilitados.
- Formulario con cambios: si hay monto o referencia escritos, el formulario cuenta como no guardado. Al cambiar de sede desde la cabecera aparece «¿Descartar cambios sin guardar?» («Tiene cambios sin guardar. Si sale ahora se perderán.», «Descartar» / «Seguir editando», [S-GEN-26](05_pantallas_generales.md#p-gen--s-gen-26--descartar-cambios-sin-guardar)); un cambio de sede por URL se rechaza.
- No se puede pagar si el saldo es menor o igual a cero o el estado de cuenta está anulado.

**Tiempo real**

Cuando llega `billing.changed.v1` el panel se reconstruye con el saldo y la versión nuevos; el monto escrito se conserva.

**Reglas de negocio**

- Se permiten pagos parciales: el estado pasa a «Pago parcial». Pagar de más es imposible (monto ≤ saldo, validado en el dispositivo y en el servidor).
- Concurrencia: si otra persona cambió el estado de cuenta, la versión enviada no coincide → `ABORTED`; nunca se cobra de más.
- De la referencia solo se devuelven los últimos 4 caracteres, y solo en los métodos con tarjeta.
- Cada escritura va con auditoría y evento en la misma transacción del servidor.

**Notas para el rediseño**

- Preservar «Pagar saldo» como atajo que no envía, el tope por saldo, la versión enviada con el pago y el bloqueo de doble envío.
- Preservar el aviso de cambios sin guardar al cambiar de sede.
- Riesgo: Intro en monto o referencia registra el pago sin confirmación; un rediseño no debería añadir más formas accidentales de enviar.
- «Estado de cuenta v{n}» es un dato técnico visible para el usuario.
- Doble título («Pagos» y «Registrar pago») con iconos distintos.
- La ayuda de la referencia promete los últimos 4 caracteres, pero solo se ven con tarjeta de crédito o de débito; en efectivo u otro método la referencia no se ve nunca.
- Salir de la página por el menú o con «Atrás» no avisa de que hay un monto escrito.
- El formato de entrada (punto decimal) no coincide con la presentación en español («1.234,50 $»).

**Código fuente:** `features/billing/presentation/payment_panel.dart`, `manual_payment_panel.dart`, `money_field.dart`, `features/billing/domain/money_input.dart`, `features/locations/application/dirty_forms.dart`.

---

### <a id="p-caj--s-caj-12--lista-de-pagos-registrados-y-anulados"></a>S-CAJ-12 Lista de pagos registrados y anulados

**Ruta:** componente de `/app/<código>/checkout/<encounterId>` · **Tipo:** panel

**Propósito**

Mostrar el historial de pagos de la visita.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Ve la lista (también con la visita cerrada) y tiene «Anular pago» en pagos registrados de un estado de cuenta editable. |
| Recepción | Limitado | Ve la lista; sin «Anular pago». |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Tarjeta «Pagos» de [S-CAJ-03](09_pantallas_caja.md#p-caj--s-caj-03--checkout-de-la-visita), bajo el separador.

**Distribución**

- Una fila por pago: primero los registrados y después los anulados (no es orden cronológico).
- Icono de recibo, o de bloqueo en rojo si está anulado.
- Título: método («Efectivo», «Tarjeta de crédito», «Tarjeta de débito», «Otro» o «Desconocido»), tachado si está anulado, más la etiqueta roja «Anulado».
- Subtítulo unido con « · »: fecha y hora (zona de la sede); «Recibido por {nombre}» (solo si el nombre es conocido); «Ref. ••••1234»; «Anulado: {motivo}».
- Monto a la derecha (negrita si está activo, tachado si está anulado) y botón de icono de bloqueo «Anular pago» (Administrador).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Ref. ••••{últimos 4}» | Texto enmascarado (solo lectura) | — | — | Sí (referencia cifrada) |
| «Anulado: {motivo}» | Texto (solo lectura) | — | — | Sí (cifrado) |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Anular pago» | Administrador | Abre el diálogo de anulación. | — | [S-CAJ-13](09_pantallas_caja.md#p-caj--s-caj-13--dialogo-anular-pago). |

**Estados y mensajes**

- Vacío: «No hay pagos registrados.»

**Tiempo real**

Se refresca junto con el estado de cuenta (`billing.changed.v1`).

**Reglas de negocio**

- Los pagos nunca se borran; al anularse quedan con su motivo.
- Los nombres del personal se resuelven con el directorio de proveedores de la sede más el usuario actual; nunca se muestra un UUID.

**Notas para el rediseño**

- Preservar la referencia enmascarada (solo los últimos 4) y la distinción visual de los pagos anulados.
- «Recibido por» no aparece cuando cobró otro recepcionista, porque el directorio solo conoce a los proveedores y al propio usuario.
- Ordenar por fecha mezclando registrados y anulados podría leerse mejor.

**Código fuente:** `features/billing/presentation/payments_list.dart`, `features/encounters/application/encounter_providers.dart`.

---

### <a id="p-caj--s-caj-13--dialogo-anular-pago"></a>S-CAJ-13 Diálogo «Anular pago»

**Ruta:** diálogo sobre `/app/<código>/checkout/<encounterId>` · **Tipo:** diálogo

**Propósito**

Revertir un pago mal registrado, dejando constancia.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Sin acceso | Botón oculto; el servidor responde `admin_only`. |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Icono «Anular pago» de [S-CAJ-12](09_pantallas_caja.md#p-caj--s-caj-12--lista-de-pagos-registrados-y-anulados).

**Distribución**

- Título «Anular pago».
- Resumen: método y monto.
- Campo «Motivo».
- Botones «Cancelar» y «Anular» (rojo).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Motivo» | Texto de 2 líneas | Sí: «Se requiere un motivo.» | Máx. 200 caracteres | Sí (cifrado en reposo) |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Anular» | Administrador | `BillingService/VoidManualPayment` con `expected_version` y el motivo. | Este diálogo | Snackbar «Pago anulado.» y el saldo vuelve a subir. Errores: «Este pago ya está anulado.», «Solo un administrador puede hacer esto.», conflicto, y estado de cuenta anulado o visita cancelada. |
| «Cancelar» | Administrador | Cierra sin cambios. | — | — |

**Estados y mensajes**

- Validación al interactuar.

**Tiempo real**

No aplica; genera `billing.changed.v1`.

**Reglas de negocio**

- El motivo se guarda cifrado; queda la auditoría `billing.payment_void`.
- Los recibos ya emitidos no cambian: son instantáneas inmutables; hay que generar uno nuevo ([S-CAJ-14](09_pantallas_caja.md#p-caj--s-caj-14--panel-recibos-generar-ver-imprimir-y-reimprimir)).

**Notas para el rediseño**

- Preservar el motivo obligatorio y el estilo destructivo.
- Avisar de que los recibos anteriores siguen mostrando el pago anulado.

**Código fuente:** `features/billing/presentation/billing_dialogs.dart`, `payments_list.dart`.

---

### <a id="p-caj--s-caj-14--panel-recibos-generar-ver-imprimir-y-reimprimir"></a>S-CAJ-14 Panel «Recibos» (generar, ver, imprimir y reimprimir)

**Ruta:** componente de `/app/<código>/checkout/<encounterId>` · **Tipo:** panel

**Propósito**

Emitir el comprobante imprimible de la visita y volver a imprimirlo.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Generar (permiso `generateReceipt` y estado de cuenta no anulado), ver e imprimir. |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | No llega a la página. |
| Proveedor | Sin acceso | Ídem. |

En el servidor, generar exige `GenerateReceipt` en la sede; leer exige `ViewCharges` y además `GenerateReceipt` o el rol Proveedor (`receipt_read_denied` → «No puede ver este recibo.»).

**Cómo se llega**

Última tarjeta de [S-CAJ-03](09_pantallas_caja.md#p-caj--s-caj-03--checkout-de-la-visita), en la columna derecha.

**Distribución**

- Encabezado: icono, «Recibos» y botón tonal «Generar recibo» (+; spinner mientras trabaja).
- Casilla «Vincular al último pago ({monto})», marcada por defecto; solo aparece si hay al menos un pago registrado y se puede generar.
- Lista de recibos, del más nuevo al más antiguo. Cada fila: código del recibo en monoespaciado (p. ej. `LAN-R-000045`) y un subtítulo «fecha, hora · por {nombre} · Vinculado a un pago». Botones «Ver» (ojo) e «Imprimir» en el más reciente, o «Reimprimir» en los anteriores (icono de impresora).
- Vacío: «Aún no se han generado recibos.»

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Vincular al último pago ({monto})» | Casilla | No (marcada por defecto) | Vincula el recibo al pago REGISTRADO más reciente | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Generar recibo» | Administrador, Recepción | `ReceiptService/GenerateReceipt` con la visita y, si la casilla está marcada, el pago; el servidor recalcula el estado de cuenta, reserva el código y guarda una instantánea. | No | Snackbar «Recibo {código} generado.»; se refrescan la lista y el estado de cuenta. Errores: «El pago seleccionado está anulado; genere el recibo sin vincularlo.», «Esta visita fue cancelada; la facturación está cerrada.», «Este estado de cuenta está anulado; no se permiten más cambios.» |
| «Ver» | Ídem | Abre la hoja de texto del recibo. | No | [S-CAJ-15](09_pantallas_caja.md#p-caj--s-caj-15--hoja-recibo-codigo-vista-de-texto). |
| «Imprimir» / «Reimprimir» | Ídem | `ReceiptService/RenderReceiptPdf` (idioma por defecto) → `AuditService/RecordClientExport` (PRINT, recurso `receipt`) → diálogo de impresión del sistema en formato de rollo de 80 mm. | Diálogo del sistema | [S-CAJ-24](09_pantallas_caja.md#p-caj--s-caj-24--impresion-y-exportacion-dialogo-del-sistema-y-auditoria). Si la auditoría falla: «Exportación cancelada: no se pudo registrar en la auditoría. Inténtelo de nuevo en un momento.» y no se imprime. Si falla la impresión: «No se pudo imprimir el recibo.» |

**Estados y mensajes**

- Lista cargando: spinner. Error: banner compacto con «Reintentar». Refresco: barra fina.
- Ocupado: todos los botones deshabilitados.

**Tiempo real**

La lista se invalida con `receipt.generated.v1` y en la resincronización.

**Reglas de negocio**

- Cada «Generar recibo» crea un recibo NUEVO con su propio código correlativo por sede; una visita puede tener varios.
- El recibo es una instantánea inmutable: pagos o anulaciones posteriores no lo cambian. «Reimprimir» imprime la instantánea original.
- No existe anular un recibo, ni en la interfaz ni en el servidor.
- Contenido del recibo (texto de 42 columnas): sede, código del recibo, fecha, visita, código y nombre completo del paciente (PHI), líneas con descuentos, subtotal, descuentos, total a pagar, pagado, saldo, pagos (método, \*\*\*\*últimos 4, hora), cobertura y el pie «Gracias por su visita».
- Imprimir y compartir se auditan ANTES de producir el archivo (sin auditoría no hay archivo; HIPAA 164.312(b)); límite de 30 exportaciones por minuto por usuario.
- «Generar recibo» sigue disponible con la visita completada; el servidor solo lo rechaza si la visita está cancelada o el estado de cuenta anulado.

**Notas para el rediseño**

- Preservar el orden auditar → imprimir; nunca imprimir ni compartir si la auditoría falla.
- Preservar el vínculo opcional al último pago y la distinción entre el recibo más reciente y los anteriores.
- «Reimprimir» aparece en recibos que quizá nunca se imprimieron, y volver a imprimir el más reciente sigue diciendo «Imprimir»; en la hoja [S-CAJ-15](09_pantallas_caja.md#p-caj--s-caj-15--hoja-recibo-codigo-vista-de-texto) siempre dice «Imprimir».
- Sin confirmación, dos toques seguidos, o creer que «Generar» reimprime, producen recibos duplicados con códigos nuevos.
- El comentario del código dice que no se genera con la visita cerrada, pero sí se permite; aclarar la intención.
- «por {nombre}» no aparece cuando el autor es otro recepcionista.
- El panel no indica en qué idioma se imprimirá desde la lista (depende del idioma de la interfaz y de la preferencia).

**Código fuente:** `features/receipts/presentation/receipts_panel.dart`, `features/receipts/application/receipt_commands.dart`, `receipt_providers.dart`, `features/receipts/infrastructure/receipt_gateway.dart`, `receipt_printer.dart`, `features/exports/application/export_audit.dart`, `features/exports/domain/client_export.dart`.

---

### <a id="p-caj--s-caj-15--hoja-recibo-codigo-vista-de-texto"></a>S-CAJ-15 Hoja «Recibo {código}» (vista de texto)

**Ruta:** hoja modal inferior sobre `/app/<código>/checkout/<encounterId>` · **Tipo:** hoja inferior

**Propósito**

Previsualizar el recibo tal como lo genera el servidor, cambiar su idioma e imprimirlo o compartirlo.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | «Compartir» solo fuera de la web (Android o escritorio). |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Botón «Ver» de un recibo en [S-CAJ-14](09_pantallas_caja.md#p-caj--s-caj-14--panel-recibos-generar-ver-imprimir-y-reimprimir).

**Distribución**

- Hoja con asa de arrastre; ocupa el 85 % del alto.
- Encabezado: «Recibo {código}» y selector segmentado «English» / «Español» (por defecto, el idioma de la interfaz).
- Cuerpo desplazable: caja de fondo gris claro con esquinas redondeadas y el texto monoespaciado de 42 columnas, que no se puede seleccionar ni copiar.
- Pie: «Compartir» (con borde, solo fuera de la web) e «Imprimir» (relleno).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| Idioma del recibo | Selector segmentado «English» / «Español» | Sí (por defecto el de la interfaz) | Cada cambio vuelve a pedir el texto | No |
| Texto del recibo | Solo lectura, no seleccionable | — | — | Sí (incluye el nombre del paciente) |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Cambiar idioma | Administrador, Recepción | `ReceiptService/RenderReceiptText` en el idioma elegido. | No | Texto renderizado de nuevo por el servidor. |
| «Imprimir» | Ídem | `RenderReceiptPdf` en el idioma elegido → `RecordClientExport` (PRINT, con el filtro `language` si se eligió idioma) → diálogo de impresión. | Diálogo del sistema | [S-CAJ-24](09_pantallas_caja.md#p-caj--s-caj-24--impresion-y-exportacion-dialogo-del-sistema-y-auditoria). |
| «Compartir» | Ídem, fuera de la web | `RenderReceiptPdf` → `RecordClientExport` (SHARE) → hoja de compartir del sistema. En Android, antes de escribir la copia nueva la app borra la del recibo compartido anteriormente (`cache/share/`); la copia actual queda hasta el siguiente «Compartir» o el cierre de sesión. | Hoja del sistema | [S-CAJ-24](09_pantallas_caja.md#p-caj--s-caj-24--impresion-y-exportacion-dialogo-del-sistema-y-auditoria). |
| — errores | — | — | — | Snackbar: «Exportación cancelada: no se pudo registrar en la auditoría…», «No se pudo imprimir el recibo.», «No se pudo compartir el recibo.» o el error de facturación traducido (p. ej. «No puede ver este recibo.», «Recibo no encontrado.»). |

**Estados y mensajes**

- Cargando: spinner. Error: «Algo salió mal» + «Reintentar».
- Ocupado: botones deshabilitados.

**Tiempo real**

No aplica: es una instantánea inmutable.

**Reglas de negocio**

- El texto contiene el nombre del paciente; solo sale de la app al imprimir o compartir, y ambos se auditan.
- El texto lo renderiza el servidor; la app nunca construye el recibo.
- En Android la hoja de compartir trabaja con una copia del PDF que el complemento `printing` escribe en la caché privada de la app (`cache/share/`) y nunca borra. La llamada de compartir vuelve en cuanto se abre el selector, y la app elegida puede seguir leyendo el archivo, así que la app no lo borra en ese momento: borra la copia anterior antes de compartir el recibo siguiente (en el dispositivo queda como mucho un PDF de recibo) y todas en cada cierre de sesión.

**Notas para el rediseño**

- Preservar que el texto no sea seleccionable ni copiable y que todas las salidas pasen por el registro de exportación.
- Preservar el selector de idioma del recibo, independiente del idioma de la interfaz.
- Las etiquetas del recibo en español van sin tildes («Membresia», «Tarjeta de credito») por la impresora térmica; esto lo decide el servidor.
- Con `printing` 5.15.1 la llamada de compartir de Android vuelve en cuanto se abre la hoja, no al cerrarla: la copia del PDF se borra con la hoja todavía abierta y la app elegida podría no encontrar el archivo. Verificar en dispositivo.
- Compartir no toca `cache/file_picker/`: las copias de los archivos que sigan en la cola de subidas ([S-PAC-16](06_pantallas_pacientes.md#p-pac--s-pac-16--subidas-cola-de-subida)) se conservan.

**Código fuente:** `features/receipts/presentation/receipt_text_sheet.dart`, `features/receipts/application/receipt_commands.dart`, `features/receipts/infrastructure/receipt_printer.dart`, `features/documents/infrastructure/local_file_cleanup.dart`.

---

### <a id="p-caj--s-caj-16--seccion-facturacion-en-la-pantalla-de-la-visita"></a>S-CAJ-16 Sección «Facturación» en la pantalla de la visita

**Ruta:** `/app/<código>/encounters/<encounterId>`, pestaña «Resumen» (sección registrada con orden 30) · **Tipo:** panel

**Propósito**

Resumen económico de la visita para todo el equipo y acceso a caja. Se describe también, en su contexto clínico, en [S-CLI-23](08_pantallas_clinicas.md#p-cli--s-cli-23--seccion-facturacion-de-la-visita-compuesta-detalle-en-el-inventario-de-facturaci).

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Totales + «Ir a checkout». |
| Recepción | Completo | Totales + «Ir a checkout». |
| Enfermería / asistente médico | Limitado | Solo totales; el servidor solo le envía totales y su lectura se audita como «limitada». |
| Proveedor | Limitado | Solo totales; sin «Ir a checkout». |

Visible para quien tiene `viewCharges` (los cuatro roles). La sección nunca muestra líneas. «Ir a checkout» solo aparece con `recordManualPayment`. En el servidor, `GetStatement` exige `ViewCharges` en la sede.

**Cómo se llega**

Pantalla de la visita ([S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita), desde el Panel, las colas, Pacientes → Visitas o «Abrir visita»), pestaña «Resumen», tarjeta «Facturación» tras Enfermería y Órdenes.

**Distribución**

- Tarjeta con icono y título «Facturación».
- Fila: chip de cobertura («Pago directo», «Seguro», «Membresía» o «Sin definir») y la frase de la regla de porción del paciente.
- Bloque de totales: «Subtotal», «Descuento total», «Total a pagar», «Pagado» y «Saldo», más el chip de estado («Abierto», «Pago parcial», «Pagado», «Anulado»).
- Botón tonal «Ir a checkout», alineado a la derecha (Administrador y Recepción).

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Ir a checkout» | Administrador, Recepción | Navega a `/app/<código>/checkout/<encounterId>` en cualquier estado de la visita, incluso cerrada. | No | [S-CAJ-03](09_pantallas_caja.md#p-caj--s-caj-03--checkout-de-la-visita). |

**Estados y mensajes**

- Cargando: spinner. «No encontrado» antes del primer cargo: texto discreto «Esta visita aún no tiene estado de cuenta.» (no es un error). Otros errores: banner compacto con «Reintentar». Refresco: barra fina.

**Tiempo real**

Se refresca con `billing.changed.v1` y la resincronización.

**Reglas de negocio**

- Las mismas cifras del servidor que en el checkout.
- Enfermería solo puede ver totales (docs/06 marca «View charges» como ◐; el comentario de `ViewCharges` en `backend/src/shared/rbac.rs` lo limita a los totales de la visita actual).

**Notas para el rediseño**

- Preservar que Enfermería y el Proveedor vean solo totales y que no tengan acceso a caja.
- Recepción ve aquí el mismo dato que en el checkout pero sin líneas, aunque tiene permiso para verlas.
- «Ir a checkout» usa el término en inglés; en la barra de acciones de la visita el mismo concepto se llama «Iniciar pago» / «Listo para pago».

**Código fuente:** `features/billing/presentation/billing_section.dart`, `features/billing/billing_feature.dart`, `features/encounters/application/encounter_sections.dart`, `features/encounters/presentation/encounter_page.dart`, `features/billing/presentation/statement_table.dart`.

---

### <a id="p-caj--s-caj-17--pestana-saldos-del-perfil-del-paciente"></a>S-CAJ-17 Pestaña «Saldos» del perfil del paciente

**Ruta:** `/app/<código>/patients/<patientId>`, pestaña «Saldos» · **Tipo:** panel

**Propósito**

Ver las deudas abiertas de un paciente en todas las sedes del usuario e ir a cobrarlas. Se describe también, en el contexto del perfil, en [S-PAC-10](06_pantallas_pacientes.md#p-pac--s-pac-10--pestana-saldos).

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Lista con el botón «Abrir checkout». |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso (la pestaña se ve) | El servidor rechaza `ListPatientOpenBalances` (`PERMISSION_DENIED totals_only`) y la pestaña muestra «No tiene permiso para realizar esta acción.» con «Reintentar». |
| Proveedor | Limitado | Lista con el botón «Abrir visita». |

La pestaña se muestra a todos los que abren el perfil (`searchPatient`). En el servidor: `ViewCharges` con líneas y solo las sedes asignadas al usuario.

**Cómo se llega**

Menú «Pacientes» → perfil ([S-PAC-05](06_pantallas_pacientes.md#p-pac--s-pac-05--perfil-del-paciente)) → pestaña «Saldos» (quinta pestaña, tras Resumen, Citas, Visitas y Documentos).

**Distribución**

- 600 px o más: tabla con las columnas «Sede», «Visita» (código humano), «Registro» (fecha), «Total», «Pagado», «Saldo» (negrita), «Estado» (chip) y una columna con el botón.
- Menos de 600 px: tarjeta con el código corto de la visita, «LAN · fecha», el chip de estado, el saldo y el botón.
- Botón: «Abrir checkout» (icono de caja) para Administrador y Recepción, o «Abrir visita» para el resto.
- Vacío: icono de billetera y «No hay saldos pendientes.»

**Campos**

Sin campos.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Tocar la fila o el botón | Administrador, Recepción, Proveedor | Si la sede de la fila no está entre las del usuario: snackbar «Cambie a {código} para abrir esta visita.». Si lo está: navega a `/app/<códigoFila>/checkout/<encounterId>` (Administrador, Recepción) o a `/app/<códigoFila>/encounters/<id>` (resto); si es otra sede propia, la URL cambia la sede activa (se rechaza si hay formularios con cambios). | No | [S-CAJ-03](09_pantallas_caja.md#p-caj--s-caj-03--checkout-de-la-visita) o [S-CLI-04](08_pantallas_clinicas.md#p-cli--s-cli-04--detalle-de-visita-pantalla-de-la-visita). |

**Estados y mensajes**

- Cargando, vacío, error con «Reintentar» y refresco (estados comunes, [S-GEN-28](05_pantallas_generales.md#p-gen--s-gen-28--estados-comunes-de-carga-vacio-y-error)).
- Chips: «Abierto» (ámbar), «Pago parcial» (azul).

**Tiempo real**

Se invalida con `billing.changed.v1`, con la fusión de pacientes (`patient.changed`) y con la resincronización.

**Reglas de negocio**

- Solo estados de cuenta «Abierto» o «Pago parcial» con saldo mayor que cero, de las sedes asignadas al usuario, del más reciente al más antiguo.
- La lectura se audita (`statement.list`).
- Los importes vienen del servidor; no se suman en el dispositivo.

**Notas para el rediseño**

- Preservar el destino según el rol y el bloqueo con aviso para las sedes ajenas.
- No hay total agregado de la deuda del paciente; es intencional, porque la app no suma.
- Enfermería ve la pestaña pero siempre obtiene un error; convendría ocultarla o mostrar un estado vacío explicativo.
- «Abrir checkout» sobre una visita ya completada abre el checkout en solo lectura y no deja cobrar el saldo (ver las preguntas abiertas).

**Código fuente:** `features/billing/presentation/patient_balances_panel.dart`, `features/patients/presentation/tabs/patient_balances_tab.dart`, `features/patients/presentation/patient_profile_page.dart`, `features/patients/application/patient_providers.dart`, `features/patients/infrastructure/patient_history_gateway.dart`.

---

### <a id="p-caj--s-caj-18--reportes-de-la-sede-activa"></a>S-CAJ-18 Reportes (de la sede activa)

**Ruta:** `/app/<código>/reports` (`RouteNames.reports`) · **Tipo:** página

**Propósito**

Ver la actividad y el dinero de la sede por día o por rango de fechas, e imprimirlos o exportarlos.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Incluye las cifras «Saldo pendiente» y «Bono». |
| Recepción | Limitado | El servidor omite el saldo pendiente y el bono, y esas tarjetas y columnas no se dibujan. |
| Enfermería / asistente médico | Sin acceso | Menú oculto; la guarda de ruta (`viewFinancialReports`) redirige al Panel. |
| Proveedor | Sin acceso | Ídem. |

En el servidor, `ReportService` exige `ViewFinancialReports` y pertenencia a la sede (el Administrador puede leer cualquier sede activa).

**Cómo se llega**

Menú principal «Reportes» (icono de barras). En teléfono es el quinto ítem de la barra inferior para Recepción; para el Administrador, en el menú hamburguesa.

**Distribución**

- Encabezado: título «Reportes» y subtítulo «Días en {zona horaria}» (p. ej. `America/New_York`).
- Pestañas «Diario» ([S-CAJ-19](09_pantallas_caja.md#p-caj--s-caj-19--pestana-diario-reporte-diario-de-una-sede)) y «Rango» ([S-CAJ-20](09_pantallas_caja.md#p-caj--s-caj-20--pestana-rango-resumen-por-rango-de-fechas)).

**Campos**

Sin campos propios.

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Cambiar de pestaña | Administrador, Recepción | Muestra el Diario o el Rango. | No | [S-CAJ-19](09_pantallas_caja.md#p-caj--s-caj-19--pestana-diario-reporte-diario-de-una-sede) o [S-CAJ-20](09_pantallas_caja.md#p-caj--s-caj-20--pestana-rango-resumen-por-rango-de-fechas). |

**Estados y mensajes**

- Sin sede activa: spinner centrado.

**Tiempo real**

Sin tiempo real: los reportes no se actualizan con eventos ni en el modo degradado. Se refrescan con «Actualizar» o al volver a entrar.

**Reglas de negocio**

- Los días son días de calendario en la zona horaria de la sede, nunca la del dispositivo.
- Los reportes son agregados sin PHI y no se auditan como lectura.
- La app no recalcula totales de negocio.

**Notas para el rediseño**

- Preservar la nota de zona horaria.
- Preservar que Recepción no vea «Saldo pendiente» ni «Bono» (la ausencia viene del servidor; no basta con ocultarlo).
- La fecha y el rango elegidos se conservan al salir y volver (estado global de la sesión); al cambiar de sede vuelven a «hoy».

**Código fuente:** `features/reports/presentation/reports_page.dart`, `features/reports/application/report_providers.dart`, `core/navigation/nav_items.dart`, `core/routing/routes.dart`.

---

### <a id="p-caj--s-caj-19--pestana-diario-reporte-diario-de-una-sede"></a>S-CAJ-19 Pestaña «Diario» (reporte diario de una sede)

**Ruta:** `/app/<código>/reports`, pestaña Diario; también `/admin/reports` con una sede filtrada · **Tipo:** panel

**Propósito**

Resumen de un día de la sede.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Con «Saldo pendiente» y «Bono». |
| Recepción | Limitado | Sin «Saldo pendiente» ni «Bono» (el servidor no los envía). |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Primera pestaña de [S-CAJ-18](09_pantallas_caja.md#p-caj--s-caj-18--reportes-de-la-sede-activa), o de [S-CAJ-22](09_pantallas_caja.md#p-caj--s-caj-22--reportes-de-la-compania) con una sede seleccionada.

**Distribución**

- Barra de controles: icono «Día anterior» (<), campo «Fecha» (abre [S-CAJ-21](09_pantallas_caja.md#p-caj--s-caj-21--selector-de-fecha-de-reportes)), icono «Día siguiente» (>), botón «Hoy», icono «Actualizar» y botón con borde «Imprimir». En la vista de compañía, además «Exportar CSV» ([S-CAJ-23](09_pantallas_caja.md#p-caj--s-caj-23--vista-diaria-de-la-compania-tabla-por-sede)).
- Si no hubo actividad (0 pacientes, 0 consultas, $0 facturado y $0 recibido): aviso «No se registró actividad este día.» con icono de información.
- Tarjeta «Visitas»: «Pacientes atendidos» (destacado), «Pacientes nuevos», «Seguimiento», «Consultas» y «Sin cita».
- Tarjeta «Cobertura»: «Pago directo», «Seguro» y «Membresía».
- Tarjeta «Citas»: «Programadas», «Confirmadas», «Llegaron», «Canceladas» y «No se presentaron».
- Tarjeta «Dinero»: «Total facturado» y «Total recibido» (destacados); para el Administrador, además «Saldo pendiente» y «Bono» (con el nombre de la regla o «Ninguna regla de bono aplicó»).
- Tarjeta «Recibido por método»: «Efectivo», «Tarjeta de crédito», «Tarjeta de débito» y «Otro».
- Tarjeta «Fuentes de referencia de pacientes nuevos»: tabla «Fuente» | «Pacientes», o «No hubo pacientes nuevos este día.»

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Fecha» | Selector de día de solo lectura ([S-CAJ-21](09_pantallas_caja.md#p-caj--s-caj-21--selector-de-fecha-de-reportes)) | Sí (por defecto hoy) | Máximo hoy en la zona de la sede; mínimo el 1 de enero de 2020 | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Día anterior» / «Día siguiente» | Administrador, Recepción | Mueve un día; «Día siguiente» está deshabilitado en hoy. | No | Nuevo día. |
| «Hoy» | Ídem | Vuelve a hoy (deshabilitado si ya es hoy). | No | — |
| «Actualizar» | Ídem | Vuelve a llamar a `ReportService/GetDailyLocationReport` (deshabilitado mientras carga). | No | Barra fina. |
| «Imprimir» | Ídem; deshabilitado hasta que cargan los datos | Registra la exportación (PRINT, `report.daily_location`, filtros `date` y `location_id`) y abre el diálogo de impresión con un PDF tamaño Carta: título «Reporte diario», subtítulo «LAN · Lancaster · {fecha}» y todas las secciones. | Diálogo del sistema | [S-CAJ-24](09_pantallas_caja.md#p-caj--s-caj-24--impresion-y-exportacion-dialogo-del-sistema-y-auditoria). |

En la vista de una sede no hay «Exportar CSV».

**Estados y mensajes**

- Cargando: spinner. Error: «Algo salió mal» + «Reintentar». Refresco: barra fina.
- Administrador con una sede inactiva que no tiene asignada: «Esta acción no está permitida en el estado actual.» (`location_inactive`).

**Tiempo real**

Ninguno; se actualiza con «Actualizar».

**Reglas de negocio**

- «Pacientes atendidos» = pacientes distintos con visita registrada ese día (sin las canceladas). «Consultas» = número de visitas (≥ pacientes). «Seguimiento» = atendidos − nuevos. «Sin cita» = visitas sin cita.
- «Total facturado» = suma de los cargos ACTIVOS de las visitas del día. «Total recibido» = pagos REGISTRADOS ese día.
- «Saldo pendiente» (Administrador) = saldos abiertos de las visitas del día. «Bono» (Administrador) = la regla activa aplicable a la sede y al día según lo recibido (reglas en [S-ADM-23](10_pantallas_admin.md#p-adm--s-adm-23--reglas-de-bono)).
- Las fuentes de referencia se muestran con su nombre de catálogo (incluidas las inactivas) o con el código si no se conoce.

**Notas para el rediseño**

- Preservar la navegación por día con tope en hoy y la auditoría antes de imprimir.
- Preservar que el Bono muestre la regla aplicada.
- Asimetría: el reporte diario de una sede no tiene CSV; el de compañía y el de rango sí.
- Terminología: «Consultas» (visitas) frente a «Visitas» (título de la sección); «Pacientes» como encabezado del conteo de referencias.
- El mosaico de cifras no tiene gráficos ni comparación con el día anterior.

**Código fuente:** `features/reports/presentation/daily_report_tab.dart`, `widgets/daily_report_view.dart`, `report_sections.dart`, `features/reports/domain/report_money.dart`, `features/reports/infrastructure/report_gateway.dart`, `report_lookup_gateways.dart`.

---

### <a id="p-caj--s-caj-20--pestana-rango-resumen-por-rango-de-fechas"></a>S-CAJ-20 Pestaña «Rango» (resumen por rango de fechas)

**Ruta:** `/app/<código>/reports` y `/admin/reports`, pestaña Rango · **Tipo:** panel

**Propósito**

Tendencia diaria y totales de un periodo, con exportación.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | De una sede o de toda la compañía (desde `/admin/reports` sin filtro), con las columnas «Saldo pendiente» y «Bono». |
| Recepción | Limitado | Solo su sede, sin esas columnas. |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

En el servidor, `GetDateRangeSummary` sin sede exige el rol Administrador (`admin_only`).

**Cómo se llega**

Segunda pestaña de [S-CAJ-18](09_pantallas_caja.md#p-caj--s-caj-18--reportes-de-la-sede-activa) o de [S-CAJ-22](09_pantallas_caja.md#p-caj--s-caj-22--reportes-de-la-compania).

**Distribución**

- Barra de controles: campos «Desde» y «Hasta» ([S-CAJ-21](09_pantallas_caja.md#p-caj--s-caj-21--selector-de-fecha-de-reportes)), chips «Últimos 7 días» y «Últimos 30 días» (marcados cuando coinciden), texto «{n} días» (rojo si hay error), icono «Actualizar» y botones «Exportar CSV» e «Imprimir».
- Tarjeta «Recibido por día»: gráfico de barras de lo recibido cada día. Al pasar el ratón o tocar, una línea superior muestra «{fecha larga} · {monto}»; eje con importes abreviados.
- Tabla (600 px o más) o tarjetas (menos de 600 px), una fila por día más la fila «Total» en negrita. Columnas: «Fecha», «Pacientes», «Nuevos», «Seguimiento», «Consultas», «Sin cita», «Facturado» y «Recibido»; para el Administrador, además «Saldo pendiente» y «Bono» («—» si no hay dato).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Desde» | Selector de fecha (máximo hoy) | Sí (por defecto, hace 30 días) | Antes de cualquier llamada: si es posterior a «Hasta» → «La fecha inicial debe ser igual o anterior a la final.» | No |
| «Hasta» | Selector de fecha (máximo hoy) | Sí (por defecto, hoy) | Rango de más de 92 días → «El rango no puede exceder 92 días.» (mensaje rojo centrado en lugar de los datos) | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| «Últimos 7 días» / «Últimos 30 días» | Administrador, Recepción | Fijan el rango que termina hoy. | No | Recarga. |
| «Actualizar» | Ídem | `ReportService/GetDateRangeSummary` (deshabilitado si el rango no es válido o está cargando). | No | Barra fina. |
| «Exportar CSV» | Ídem; deshabilitado sin datos | Registra la exportación (CSV, `report.range`, filtros `from`, `to` y `location_id` si aplica) y descarga el archivo en la web o abre la hoja de compartir en Android. Nombre: `report-range-<sede>-<desde>_<hasta>.csv` (con `company` en lugar del código de sede en la vista de toda la compañía). | No | «CSV exportado.» o «No se pudo exportar el CSV.» ([S-CAJ-24](09_pantallas_caja.md#p-caj--s-caj-24--impresion-y-exportacion-dialogo-del-sistema-y-auditoria)). |
| «Imprimir» | Ídem | Registra la exportación (PRINT) y genera un PDF tamaño Carta «Resumen por rango», subtítulo «{ámbito} · {desde} – {hasta}», con la tabla de días y el total. | Diálogo del sistema | [S-CAJ-24](09_pantallas_caja.md#p-caj--s-caj-24--impresion-y-exportacion-dialogo-del-sistema-y-auditoria). |

**Estados y mensajes**

- Cargando, error con «Reintentar» y refresco (estados comunes).
- Sin días: icono de gráfico y «Sin actividad en este rango.»
- Error de validación: mensaje rojo y botones deshabilitados.

**Tiempo real**

Ninguno.

**Reglas de negocio**

- Rango inclusivo de como máximo 92 días.
- El CSV contiene solo agregados (sin PHI), con encabezados técnicos estables en inglés (`date`, `patients_seen`, …, `received_other` y, para el Administrador, `open_balance`, `bonus_rule` y `bonus_amount`). Los importes van como decimales del servidor (`123.45`) y la fila de totales se rotula `TOTAL`.
- Para Recepción, los totales del rango también llegan sin las cifras de Administrador.

**Notas para el rediseño**

- Preservar la validación previa (no llamar con un rango inválido), el tope de 92 días y la auditoría antes de exportar o imprimir.
- Preservar que el gráfico sea de una sola serie, accesible (etiqueta para lectores «Gráfico de barras de montos recibidos por día durante {n} días; día más alto {max}.») y con detalle al tocar en tablet.
- La tabla en pantalla y el PDF muestran 7 (o 9) métricas, mientras que el CSV incluye también cobertura, citas y métodos de pago; la diferencia no se explica en la interfaz.
- Los encabezados del CSV no se traducen (es intencional, para importarlo).
- En Android, «CSV exportado.» aparece aunque el usuario cancele la hoja de compartir.

**Código fuente:** `features/reports/presentation/range_report_tab.dart`, `widgets/range_summary_view.dart`, `widgets/received_bar_chart.dart`, `widgets/report_table.dart`, `features/reports/domain/report_range.dart`, `report_csv.dart`.

---

### <a id="p-caj--s-caj-21--selector-de-fecha-de-reportes"></a>S-CAJ-21 Selector de fecha de reportes

**Ruta:** diálogo del sistema sobre las pestañas Diario y Rango · **Tipo:** diálogo

**Propósito**

Elegir un día de calendario.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Quien ve [S-CAJ-19](09_pantallas_caja.md#p-caj--s-caj-19--pestana-diario-reporte-diario-de-una-sede) o [S-CAJ-20](09_pantallas_caja.md#p-caj--s-caj-20--pestana-rango-resumen-por-rango-de-fechas). |
| Recepción | Completo | Ídem. |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

Tocar los campos «Fecha», «Desde» o «Hasta».

**Distribución**

- Campo de solo lectura con borde, etiqueta, fecha formateada (p. ej. «5 ene 2026») e icono de calendario.
- Calendario del sistema con el texto de ayuda igual a la etiqueta del campo.

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| Fecha | Calendario | Sí | Entre el 1 de enero de 2020 y hoy (zona de la sede) | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Elegir una fecha | Administrador, Recepción | Actualiza el día o el extremo del rango. | No | Recarga del reporte. |
| Cancelar | Ídem | Sin cambios. | — | — |

**Estados y mensajes**

- Modal.

**Tiempo real**

No aplica.

**Reglas de negocio**

- Trabaja con días de calendario sin convertir a la zona horaria del dispositivo.

**Notas para el rediseño**

- No se pueden escribir fechas a mano; solo se eligen en el calendario.
- El selector no impide que «Desde» quede después de «Hasta»; lo valida luego la pestaña.

**Código fuente:** `features/reports/presentation/widgets/report_date_field.dart`.

---

### <a id="p-caj--s-caj-22--reportes-de-la-compania"></a>S-CAJ-22 Reportes de la compañía

**Ruta:** `/admin/reports` (`RouteNames.adminReports`) · **Tipo:** página

**Propósito**

Vista consolidada de todas las sedes o de una sede concreta. La misma página se describe, desde Administración, en [S-ADM-24](10_pantallas_admin.md#p-adm--s-adm-24--reportes-de-la-compania-pestana-diario) y [S-ADM-25](10_pantallas_admin.md#p-adm--s-adm-25--reportes-de-la-compania--pestana-rango).

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Guarda de `/admin/*` (rol Administrador) + permiso `viewCompanyReports`. |
| Recepción | Sin acceso | Redirigida al Panel; usa sus Reportes de sede ([S-CAJ-18](09_pantallas_caja.md#p-caj--s-caj-18--reportes-de-la-sede-activa)). |
| Enfermería / asistente médico | Sin acceso | Redirigida al Panel. |
| Proveedor | Sin acceso | Redirigido al Panel. |

En el servidor, `GetDailyCompanyReport` y `GetDateRangeSummary` sin sede exigen el rol Administrador (`admin_only`); `ListLocations` también es de administración.

**Cómo se llega**

Menú, grupo «Administración», ítem «Reportes de la compañía» (icono de insights).

**Distribución**

- Encabezado: título «Reportes de la compañía»; subtítulo con el ámbito («Todas las sedes» o «LAN · Lancaster»).
- Banner de error compacto si falla la carga de sedes, con «Reintentar».
- Desplegable «Sede» (320 px): «Todas las sedes» y una opción por sede, activa o inactiva, como «CÓDIGO · Nombre», ordenadas por código.
- Pestañas «Diario» ([S-CAJ-23](09_pantallas_caja.md#p-caj--s-caj-23--vista-diaria-de-la-compania-tabla-por-sede) sin filtro, o [S-CAJ-19](09_pantallas_caja.md#p-caj--s-caj-19--pestana-diario-reporte-diario-de-una-sede) con sede) y «Rango» ([S-CAJ-20](09_pantallas_caja.md#p-caj--s-caj-20--pestana-rango-resumen-por-rango-de-fechas), de la compañía o de la sede).

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Sede» | Desplegable de selección única | Sí (por defecto «Todas las sedes») | El filtro se conserva durante la sesión | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Cambiar «Sede» | Administrador | Acota ambas pestañas a esa sede o las devuelve a toda la compañía. | No | Recarga. |
| Imprimir o exportar | Administrador | Ver [S-CAJ-19](09_pantallas_caja.md#p-caj--s-caj-19--pestana-diario-reporte-diario-de-una-sede), [S-CAJ-20](09_pantallas_caja.md#p-caj--s-caj-20--pestana-rango-resumen-por-rango-de-fechas) y [S-CAJ-23](09_pantallas_caja.md#p-caj--s-caj-23--vista-diaria-de-la-compania-tabla-por-sede); el nombre de archivo usa `company` o el código de la sede. | Diálogo del sistema | [S-CAJ-24](09_pantallas_caja.md#p-caj--s-caj-24--impresion-y-exportacion-dialogo-del-sistema-y-auditoria). |

**Estados y mensajes**

- Error al listar sedes: banner. Con una sede inactiva no asignada al Administrador, el servidor responde `location_inactive` → «Esta acción no está permitida en el estado actual.»

**Tiempo real**

Ninguno.

**Reglas de negocio**

- Cada sede se evalúa en su propia zona horaria para el día pedido.
- «Hoy» y los límites de fecha se calculan con la zona de la sede activa del Administrador.

**Notas para el rediseño**

- Preservar que el filtro afecte a ambas pestañas y el atajo de tocar una fila de sede para filtrar.
- La página no muestra la nota de zona horaria aunque «hoy» depende de la sede activa.
- El desplegable ofrece sedes inactivas que pueden dar error.

**Código fuente:** `features/reports/presentation/admin_reports_page.dart`, `features/reports/application/report_providers.dart`, `features/reports/infrastructure/report_lookup_gateways.dart`, `core/navigation/nav_items.dart`, `core/routing/app_router.dart`.

---

### <a id="p-caj--s-caj-23--vista-diaria-de-la-compania-tabla-por-sede"></a>S-CAJ-23 Vista diaria de la compañía (tabla por sede)

**Ruta:** `/admin/reports`, pestaña Diario con «Todas las sedes» · **Tipo:** panel

**Propósito**

Comparar todas las sedes activas en un día y ver los totales de la compañía.

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | — |
| Recepción | Sin acceso | — |
| Enfermería / asistente médico | Sin acceso | — |
| Proveedor | Sin acceso | — |

**Cómo se llega**

[S-CAJ-22](09_pantallas_caja.md#p-caj--s-caj-22--reportes-de-la-compania), pestaña «Diario», sin filtro de sede.

**Distribución**

- La misma barra de controles que [S-CAJ-19](09_pantallas_caja.md#p-caj--s-caj-19--pestana-diario-reporte-diario-de-una-sede), más el botón «Exportar CSV».
- Tabla (600 px o más) o tarjetas: columnas «Sede» («CÓDIGO · Nombre», el código o «Sede desconocida»; nunca un UUID), «Pacientes», «Nuevos», «Seguimiento», «Consultas», «Sin cita», «Facturado», «Recibido», «Saldo pendiente» y «Bono»; última fila «Totales de la compañía» en negrita.

**Campos**

| Campo | Tipo | Obligatorio | Validación | PHI |
| --- | --- | --- | --- | --- |
| «Fecha» | Selector ([S-CAJ-21](09_pantallas_caja.md#p-caj--s-caj-21--selector-de-fecha-de-reportes)) | Sí | Máximo hoy | No |

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Tocar una fila de sede (no la de totales) | Administrador | Aplica el filtro de esa sede en [S-CAJ-22](09_pantallas_caja.md#p-caj--s-caj-22--reportes-de-la-compania). | No | [S-CAJ-19](09_pantallas_caja.md#p-caj--s-caj-19--pestana-diario-reporte-diario-de-una-sede) de esa sede. |
| «Imprimir» | Administrador | Registra la exportación (PRINT, `report.daily_company`, filtro `date`) y genera el PDF «Reporte diario de la compañía» con la tabla «Todas las sedes». | Diálogo del sistema | [S-CAJ-24](09_pantallas_caja.md#p-caj--s-caj-24--impresion-y-exportacion-dialogo-del-sistema-y-auditoria). |
| «Exportar CSV» | Administrador | Registra la exportación (CSV, `report.daily_company`) y genera `report-daily-company-<fecha>.csv` con la columna `location`. | No | «CSV exportado.» / «No se pudo exportar el CSV.» |

**Estados y mensajes**

- Sin sedes: estado vacío «Aún no hay nada» con «Sin actividad en este rango.» (reutiliza el texto del rango).
- Cargando, error y refresco.

**Tiempo real**

Ninguno.

**Reglas de negocio**

- Solo sedes activas. El «Bono» total es la suma de los bonos por sede, sin nombre de regla.

**Notas para el rediseño**

- Preservar la fila de totales diferenciada y que una fila de sede sirva para filtrar (no es evidente: no hay icono ni ayuda).
- El texto vacío habla de «rango» en una vista diaria.

**Código fuente:** `features/reports/presentation/widgets/company_daily_view.dart`, `daily_report_tab.dart`, `widgets/report_table.dart`, `features/reports/domain/report_csv.dart`.

---

### <a id="p-caj--s-caj-24--impresion-y-exportacion-dialogo-del-sistema-y-auditoria"></a>S-CAJ-24 Impresión y exportación (diálogo del sistema y auditoría)

**Ruta:** diálogos de la plataforma lanzados desde [S-CAJ-14](09_pantallas_caja.md#p-caj--s-caj-14--panel-recibos-generar-ver-imprimir-y-reimprimir), [S-CAJ-15](09_pantallas_caja.md#p-caj--s-caj-15--hoja-recibo-codigo-vista-de-texto), [S-CAJ-19](09_pantallas_caja.md#p-caj--s-caj-19--pestana-diario-reporte-diario-de-una-sede), [S-CAJ-20](09_pantallas_caja.md#p-caj--s-caj-20--pestana-rango-resumen-por-rango-de-fechas) y [S-CAJ-23](09_pantallas_caja.md#p-caj--s-caj-23--vista-diaria-de-la-compania-tabla-por-sede) · **Tipo:** diálogo

**Propósito**

Sacar información de la app (papel, PDF o CSV) dejando el registro HIPAA antes de producirla. El mismo comportamiento se resume en [S-PAC-21](06_pantallas_pacientes.md#p-pac--s-pac-21--registro-de-exportacion-previo-auditoria-antes-de-imprimir--descargar--compartir).

**Acceso por rol**

| Rol | Acceso | Detalle |
| --- | --- | --- |
| Administrador | Completo | Cualquier sede existente. |
| Recepción | Completo | Sus sedes. |
| Enfermería / asistente médico | Sin acceso en la práctica | Puede registrar exportaciones de sus sedes (docs/06), pero en este alcance no llega a ningún botón que las dispare. |
| Proveedor | Sin acceso en la práctica | Ídem. |

Límite de 30 registros de exportación por minuto por usuario.

**Cómo se llega**

Botones «Imprimir», «Reimprimir», «Compartir» y «Exportar CSV».

**Distribución**

- Web: diálogo de impresión del navegador; el CSV se descarga como archivo.
- Android: servicio de impresión del sistema; hoja de compartir para los recibos compartidos y para el CSV.
- Recibos: PDF generado por el servidor en rollo de 80 mm (el usuario puede cambiar el formato en el diálogo). Reportes: PDF tamaño Carta generado en el dispositivo solo con cifras agregadas.

**Campos**

Ninguno propio de la app (los del diálogo del sistema).

**Acciones**

| Acción | Quién | Qué hace | Confirmación | Resultado |
| --- | --- | --- | --- | --- |
| Imprimir o compartir un recibo | Administrador, Recepción | `RenderReceiptPdf` → `RecordClientExport` → impresión o compartir. | Diálogo del sistema | Papel o archivo compartido. |
| Imprimir o exportar un reporte | Ídem | `RecordClientExport` → construir el PDF o el CSV → impresión o descarga. | Diálogo del sistema | «CSV exportado.» en el caso del CSV. |
| — fallo de la auditoría | — | No se produce ningún archivo. | — | «Exportación cancelada: no se pudo registrar en la auditoría. Inténtelo de nuevo en un momento.» |
| — otros fallos | — | — | — | «No se pudo imprimir el recibo.», «No se pudo compartir el recibo.», «No se pudo imprimir el reporte.», «No se pudo exportar el CSV.» |

**Estados y mensajes**

- Sin auditoría no hay archivo (fallo cerrado) ante cualquier error del registro o el límite por minuto; el mensaje es el mismo para cualquier causa.

**Tiempo real**

No aplica.

**Reglas de negocio**

- Al registro solo viajan identificadores, el número de filas y los NOMBRES de los filtros (`date`, `from`, `to`, `location_id`, `language`), nunca sus valores, nombres de pacientes ni el archivo.
- Recursos permitidos (lista cerrada): `receipt`, `report.daily_location`, `report.daily_company` y `report.range`.
- Tras renovar la sesión se reintenta una vez (una petición rechazada no escribió nada).
- Recibo compartido en Android: la copia del PDF en la caché de la app se borra al compartir el recibo siguiente y en cada cierre de sesión ([S-CAJ-15](09_pantallas_caja.md#p-caj--s-caj-15--hoja-recibo-codigo-vista-de-texto)).

**Notas para el rediseño**

- Imprescindible conservar la auditoría ANTES de producir cualquier archivo, sea cual sea el diseño de los botones.
- Cualquier botón nuevo de exportación (p. ej. un CSV diario por sede) necesita un recurso permitido en el servidor.

**Código fuente:** `features/reports/presentation/report_actions.dart`, `features/reports/application/report_pdf.dart`, `features/reports/infrastructure/report_printer.dart`, `file_saver.dart`, `file_saver_web.dart`, `file_saver_io.dart`, `features/receipts/infrastructure/receipt_printer.dart`, `features/receipts/application/receipt_commands.dart`, `features/exports/application/export_audit.dart`, `features/exports/domain/client_export.dart`.

---

## <a id="p-caj--preguntas-abiertas-detectadas-en-estas-pantallas"></a>Preguntas abiertas detectadas en estas pantallas

1. Saldo pendiente tras completar la visita: el servidor permite facturar y cobrar en visitas completadas o cerradas como «Se retiró» (para poder saldar las cuentas), pero la interfaz deja el checkout en solo lectura en cuanto la visita se cierra. El diálogo de completar promete un «saldo abierto» que luego no se puede cobrar desde la app. ¿Es una carencia o hay otro proceso previsto? ([S-CAJ-03](09_pantallas_caja.md#p-caj--s-caj-03--checkout-de-la-visita), [S-CAJ-05](09_pantallas_caja.md#p-caj--s-caj-05--dialogo-completar-visita-con-saldo-pendiente), [S-CAJ-17](09_pantallas_caja.md#p-caj--s-caj-17--pestana-saldos-del-perfil-del-paciente))
2. Anular un recibo: no existe ni en la interfaz ni en el servidor; los recibos son instantáneas inmutables y solo se generan nuevos. ¿Se necesita la anulación de recibos? ([S-CAJ-14](09_pantallas_caja.md#p-caj--s-caj-14--panel-recibos-generar-ver-imprimir-y-reimprimir))
3. Las reglas de bono no intervienen en el cobro; solo aparecen como la cifra «Bono» del reporte diario del Administrador (y se gestionan en Administración → Reglas de bono, [S-ADM-23](10_pantallas_admin.md#p-adm--s-adm-23--reglas-de-bono)). Confirmar que es lo esperado. ([S-CAJ-19](09_pantallas_caja.md#p-caj--s-caj-19--pestana-diario-reporte-diario-de-una-sede))
4. Estado de cuenta «Anulado»: la interfaz lo contempla (etiqueta y bloqueo de escrituras), pero ninguna operación de V1 anula un estado de cuenta. ¿Se mantiene como caso defensivo? ([S-CAJ-07](09_pantallas_caja.md#p-caj--s-caj-07--tarjeta-estado-de-cuenta-lineas-cobertura-totales))
5. Recepción y reportes por rango: la matriz de permisos (docs/06) solo marca ◐ para Recepción; el comentario de `ViewFinancialReports` en `backend/src/shared/rbac.rs` (repetido en `permission.dart`) dice «own location daily summary only» (solo el resumen diario de su sede), pero la interfaz y el servidor le permiten la pestaña «Rango» (y su CSV) de su sede. ¿Cuál es la regla correcta? ([S-CAJ-20](09_pantallas_caja.md#p-caj--s-caj-20--pestana-rango-resumen-por-rango-de-fechas))
6. Enfermería ve la pestaña «Saldos» del paciente, pero el servidor siempre le devuelve un error de permiso. ¿Ocultar la pestaña o darle una vista de totales? ([S-CAJ-17](09_pantallas_caja.md#p-caj--s-caj-17--pestana-saldos-del-perfil-del-paciente))
7. ¿Debe poder generarse un recibo después de completar la visita? El código lo permite, pero su comentario dice lo contrario. ([S-CAJ-14](09_pantallas_caja.md#p-caj--s-caj-14--panel-recibos-generar-ver-imprimir-y-reimprimir))
8. Formato de importes: en español se muestran como «1.234,50 $», pero la entrada solo acepta el punto decimal y rechaza `12,50`. ¿Se quiere aceptar la coma decimal en español? ([S-CAJ-08](09_pantallas_caja.md#p-caj--s-caj-08--dialogo-agregar-cargo-manual), [S-CAJ-11](09_pantallas_caja.md#p-caj--s-caj-11--tarjeta-pagos-panel-registrar-pago-pago-manual))
9. Saldo negativo (crédito a favor del paciente): se muestra en rojo y no hay flujo de reembolso ni de aplicación del crédito en V1. ¿Cómo debe presentarse? ([S-CAJ-07](09_pantallas_caja.md#p-caj--s-caj-07--tarjeta-estado-de-cuenta-lineas-cobertura-totales))
10. «Reportes de la compañía» calcula «hoy» con la zona horaria de la sede activa del Administrador, aunque cada sede se evalúa en la suya. ¿Debe mostrarse o ajustarse? ([S-CAJ-22](09_pantallas_caja.md#p-caj--s-caj-22--reportes-de-la-compania))
11. No se pudo verificar en ejecución el aspecto de los diálogos nativos (impresión del navegador o de Android, hoja de compartir); se describen a partir del código. ([S-CAJ-24](09_pantallas_caja.md#p-caj--s-caj-24--impresion-y-exportacion-dialogo-del-sistema-y-auditoria))
12. Los nombres de otros recepcionistas no aparecen en «Recibido por» ni en «por» porque el directorio solo cubre a los proveedores. ¿Debe existir un directorio de todo el personal de la sede? ([S-CAJ-12](09_pantallas_caja.md#p-caj--s-caj-12--lista-de-pagos-registrados-y-anulados), [S-CAJ-14](09_pantallas_caja.md#p-caj--s-caj-14--panel-recibos-generar-ver-imprimir-y-reimprimir))
13. **Resuelta (cierre HIPAA):** «Compartir» en Android ya no borra la copia que la app de destino está leyendo; borra la del recibo anterior antes de compartir el siguiente y todas al cerrar sesión ([S-CAJ-15](09_pantallas_caja.md#p-caj--s-caj-15--hoja-recibo-codigo-vista-de-texto)).
