# <a id="g-rec--guia-del-rol-recepcion"></a>Guía del rol Recepción

Recepción es la puerta de entrada y de salida del paciente: lo registra, agenda sus citas, registra su llegada, captura cómo va a pagar, lo envía a enfermería o a procedimiento y, al final, cobra y entrega el recibo. Esta guía describe su trabajo paso a paso; las fichas de cada pantalla están en el catálogo (archivos 05 a 10) y la visión general en el [README](README.md).

## <a id="g-rec--en-resumen"></a>En resumen

| Destino del menú | Para qué lo usa Recepción |
| --- | --- |
| **Panel** [S-REC-01](#s-rec-01) | Ver quién está en la clínica, en qué estación y desde cuándo. Filtro inicial «Todos los abiertos» + «Todos los proveedores». |
| **Pacientes** [S-PAC-01](#s-pac-01) | Buscar, registrar y actualizar pacientes; ver su historial, documentos y saldos. |
| **Citas** [S-REC-06](#s-rec-06) | Agenda del día de la sede: crear, confirmar, editar, reprogramar, cancelar, marcar no presentado, registrar llegada y atender visitas sin cita. |
| **Caja** [S-CAJ-01](#s-caj-01) | Cobrar las visitas listas para caja, registrar pagos, ajustar cargos y descuentos, emitir recibos y completar la visita. |
| **Reportes** [S-CAJ-18](#s-caj-18) | Reporte diario y por rango de su sede (sin «Saldo pendiente» ni «Bono»). |

En teléfono los cinco destinos caben en la barra inferior. Recepción no ve las colas clínicas (enfermería, proveedor, órdenes) ni la sección de Administración; llega a la pantalla de cada visita desde el Panel, el registro de llegada, la Caja o el perfil del paciente.

## <a id="g-rec--un-dia-en-recepcion"></a>Un día en recepción

Ana, recepcionista de la sede Lancaster, abre la aplicación en la tableta del mostrador. Inicia sesión con su correo y contraseña; como solo tiene asignada la sede LAN, la app la lleva directamente al **Panel**. Allí ve que hay 14 citas hoy y dos pacientes de ayer todavía abiertos.

A las 8:55 llega Carlos Prueba, que tenía cita a las 9:00. Ana abre **Citas**, toca la tarjeta de Carlos y pulsa «Registrar llegada». En el asistente confirma con Carlos su nombre y fecha de nacimiento, marca la sede, revisa la ruta sugerida, indica que paga con seguro y copia el nombre de la aseguradora y el copago de su tarjeta. Al confirmar aparece «Llegada registrada» con el código de visita LAN-E-000210. Pulsa «Abrir visita» y, en la barra de acciones, «Enviar a enfermería»: Carlos aparece al instante en la cola de enfermería.

A media mañana entra una paciente sin cita para una inyección de B12. Ana pulsa «Sin cita», la busca por nombre exacto y fecha de nacimiento, no la encuentra y la registra como paciente nueva. En el paso «Ruta» elige «Solo inyección», termina el asistente y desde la visita pulsa «Enviar a procedimiento».

Cuando el proveedor termina con Carlos, la visita aparece en **Caja** como «Listo para caja». Ana pulsa «Iniciar checkout», revisa el estado de cuenta, registra el copago en tarjeta de débito, genera el recibo vinculado al pago, lo imprime y pulsa «Completar visita».

Si Ana se aleja del mostrador más de 14 minutos, la app le pregunta «¿Sigues ahí?» y, si no responde, cierra la sesión. Al final del día abre **Reportes**, revisa «Recibido por método» para cuadrar la caja con el efectivo y los vouchers, y pulsa «Imprimir».

## <a id="g-rec--flujos-de-trabajo"></a>Flujos de trabajo

### <a id="g-rec--1-empezar-la-jornada"></a>1. Empezar la jornada

1. Abrir la app: [S-GEN-01](#s-gen-01) lleva a «Iniciar sesión» [S-GEN-03](#s-gen-03).
2. Escribir «Correo electrónico» y «Contraseña» y pulsar «Iniciar sesión» (o «Continuar con Google» si está disponible).
3. Si la cuenta tiene verificación en dos pasos, escribir el código de 6 dígitos de la aplicación de autenticación [S-GEN-06](#s-gen-06); sin el teléfono, «Usar un código de recuperación».
4. Con varias sedes y ninguna recordada, elegir la sede del día en «Seleccionar sede» [S-GEN-11](#s-gen-11). Con una sola sede la app entra directamente.
5. La app abre el Panel [S-REC-01](#s-rec-01) dentro del marco [S-GEN-12](#s-gen-12).

### <a id="g-rec--2-vigilar-la-clinica-desde-el-panel"></a>2. Vigilar la clínica desde el Panel

1. Revisar las tarjetas [S-REC-02](#s-rec-02): «Pacientes hoy», «En espera», «Con enfermería», «Esperando al proveedor», «Con el proveedor», «Procedimiento pendiente», «Listo para cobro», «En cobro», «Completados hoy».
2. Tocar una tarjeta para filtrar la lista por esa estación; tocarla de nuevo vuelve a «Todos los abiertos». «En espera» incluye visitas abiertas de días anteriores.
3. Ajustar el chip de estación o el menú de proveedor [S-REC-03](#s-rec-03) («Todos los proveedores», «Sin asignar» o un proveedor concreto).
4. La lista [S-REC-04](#s-rec-04) ordena por mayor espera. Tocar un paciente abre su visita [S-CLI-04](#s-cli-04).
5. El indicador [S-REC-05](#s-rec-05) muestra «En vivo»; si dice «Reconectando…» o «Sin conexión», los datos se refrescan cada 30 segundos o con «Actualizar».

### <a id="g-rec--3-buscar-a-un-paciente"></a>3. Buscar a un paciente

1. Abrir «Pacientes» (o la lupa de la cabecera) [S-PAC-01](#s-pac-01).
2. Escanear la etiqueta o escribir el código en «Código del paciente» (por ejemplo `LAN-P-000123`) y pulsar Enter o «Buscar». El código tiene prioridad: se ignoran los demás campos.
3. O bien escribir «Nombre» y/o «Apellido» completos, «Fecha de nacimiento» y/o «Teléfono» y pulsar «Buscar».
4. Si no aparece: revisar la ortografía exacta (las tildes cuentan, no hay coincidencia parcial) y usar «Cargar más» si hay más páginas.
5. Tocar la fila para abrir el perfil [S-PAC-05](#s-pac-05). Si la fila dice «Fusionado», usar «Abrir registro principal».

### <a id="g-rec--4-registrar-un-paciente-nuevo"></a>4. Registrar un paciente nuevo

1. Buscar primero al paciente [S-PAC-01](#s-pac-01): el estado vacío ofrece «Crear paciente».
2. Pulsar «Crear paciente» (encabezado, botón flotante en teléfono o estado vacío) → «Nuevo paciente» [S-PAC-02](#s-pac-02).
3. Completar «Nombre», «Apellido» y «Fecha de nacimiento» (obligatorios; la fecha no puede ser futura); «Teléfono» opcional (al menos 7 dígitos); «Fuente de referencia» y, solo si hay fuente, «Detalles de la referencia».
4. Pulsar «Crear». Sin coincidencias aparece «Paciente creado.» y se abre el perfil con su código de la sede ya asignado.
5. Si aparece «Posible paciente existente» [S-PAC-03](#s-pac-03), comparar nombre, fecha de nacimiento y códigos por sede y elegir:
   - «Abrir existente» → abre el perfil del paciente que ya existe (recomendado si es la misma persona);
   - «Cancelar» → vuelve al formulario con los datos;
   - «Crear de todos modos» → alta forzada; queda auditada junto con los candidatos.
6. Si se sale con datos escritos, la app pregunta «¿Descartar cambios sin guardar?» [S-PAC-04](#s-pac-04).

La fuente de referencia solo se captura en el alta; después no hay forma de añadirla.

### <a id="g-rec--5-agendar-una-cita"></a>5. Agendar una cita

1. Abrir «Citas» [S-REC-06](#s-rec-06) y navegar al día con «<», «>», «Hoy» o el selector de fecha.
2. Pulsar «Nueva cita» (o «+» en teléfono) → [S-REC-10](#s-rec-10) con la fecha del día mostrado.
3. Tocar «Paciente» → «Elegir paciente» [S-REC-12](#s-rec-12): buscar y tocar el resultado. Si no existe, «Crear paciente» (flujo 4): al crearlo vuelve directamente al formulario.
4. Elegir «Tipo de cita» (rellena la duración por defecto), «Hora», ajustar «Duración» (5 a 480 minutos), «Proveedor» (opcional) y «Notas» (máximo 1000 caracteres, sin datos clínicos).
5. Pulsar «Crear». Aparece «Cita LAN-A-000045 creada.» y la cita se ve como «Programada» en la vista Día [S-REC-07](#s-rec-07) o Lista [S-REC-08](#s-rec-08).
6. Si el proveedor ya tiene una cita en ese horario aparece «Guardada con una advertencia» [S-REC-11](#s-rec-11): la cita ya está guardada; pulsar «Cerrar».

No elegir «Yo · » como proveedor si usted no tiene el rol Proveedor: el servidor lo rechaza.

### <a id="g-rec--6-gestionar-una-cita-existente"></a>6. Gestionar una cita existente

Tocar la cita en la agenda abre su detalle «Cita» [S-REC-09](#s-rec-09). Botones disponibles según el estado:

| Acción | Disponible en | Pasos | Resultado |
| --- | --- | --- | --- |
| «Confirmar» | Programada | Pulsar; no pide confirmación. | «Cita confirmada.»; chip «Confirmada». |
| «Editar» | Programada, Confirmada | Formulario «Editar cita» [S-REC-10](#s-rec-10): tipo, proveedor, duración y notas (paciente, fecha y hora bloqueadas) → «Guardar». | «Cita actualizada.» |
| «Reprogramar» | Programada, Confirmada | [S-REC-13](#s-rec-13): «Fecha», «Hora», «Duración» → «Reprogramar». | «Cita reprogramada.» (con « El proveedor ya tiene una cita en ese horario.» si hay solapamiento). Ir al nuevo día para verla. |
| «Cancelar cita» | Programada, Confirmada | [S-REC-14](#s-rec-14): escribir el «Motivo» operativo (obligatorio, máx. 500, sin datos clínicos) → «Cancelar cita». | «Cita cancelada.»; estado final «Cancelada». |
| «Marcar no presentado» | Programada, Confirmada | Confirmar en [S-REC-15](#s-rec-15). | «Marcada como no presentado.»; estado final. |
| «Registrar llegada» | Programada, Confirmada | Ver flujo 7. | Abre la visita. |

Si otra persona cambió la cita mientras tanto aparece «Actualizada por otro usuario» [S-REC-16](#s-rec-16): pulsar «Actualizar», revisar y repetir si aún procede. Editar una cita y marcar no presentado no se propagan en vivo a otros puestos: ellos lo ven al refrescar.

### <a id="g-rec--7-registrar-la-llegada-de-un-paciente-con-cita"></a>7. Registrar la llegada de un paciente con cita

1. En «Citas» (día de hoy) tocar la cita «Programada» o «Confirmada» → «Registrar llegada» → «Registro de llegada» [S-REC-18](#s-rec-18).
2. **Paso 1, Paciente** [S-REC-21](#s-rec-21): confirmar nombre y fecha de nacimiento con el paciente y marcar «Verifiqué la identidad del paciente» → «Continuar».
3. **Paso 2, Sede** [S-REC-22](#s-rec-22): marcar «Confirmar esta sede» → «Continuar». Para registrar en otra sede hay que cambiarla antes en la cabecera (se pierde lo escrito y se empieza de nuevo desde la agenda de esa sede).
4. **Paso 3, Ruta** [S-REC-23](#s-rec-23): revisar la ruta sugerida por el tipo de cita → «Continuar». Atención: en citas programadas la visita se abre con la ruta sugerida por el tipo aunque aquí se elija otra; la pantalla final muestra la ruta real.
5. **Paso 4, Cobertura** [S-REC-24](#s-rec-24): «Pago directo» (por defecto), «Seguro» o «Membresía». Si el paciente tiene una membresía activa aparece «Membresía activa: {plan} (desde {fecha})».
6. **Paso 5, Datos del pagador** [S-REC-25](#s-rec-25) (solo con Seguro o Membresía):
   - Seguro: «Nombre del seguro» (obligatorio), «ID de miembro» (opcional) y un solo término: «Copago» o «Deducible» en dólares (`25.00`), o «Coaseguro» en porcentaje (0 a 100). Al cambiar de término se conserva el número escrito: revisarlo.
   - Membresía: elegir el «Plan de membresía».
7. **Último paso, Confirmar** [S-REC-26](#s-rec-26): revisar el resumen «Revisar y confirmar» y pulsar «Registrar llegada».
8. Aparece «Llegada registrada» [S-REC-27](#s-rec-27) con el código de visita (`LAN-E-000210`). Si la cobertura no se guardó aparece «La visita está abierta pero no se pudo guardar la cobertura.»: pulsar «Reintentar» (no crea otra visita).
9. Pulsar «Abrir visita» para enviarla a enfermería (flujo 10) o «Volver a citas». La cita queda «Llegó» y el paciente aparece «En espera» en el Panel de todos los puestos.

El paso actual se ve como «Paso {n} de {total}: {título}» [S-REC-20](#s-rec-20); los pasos completados se pueden tocar para volver. Si un paso no está completo, «Continuar» muestra las incidencias en un banner ámbar.

### <a id="g-rec--8-atender-a-un-paciente-sin-cita"></a>8. Atender a un paciente sin cita

1. En «Citas» pulsar «Sin cita» (icono caminante) → «Visita sin cita» [S-REC-19](#s-rec-19).
2. «Elegir paciente» → [S-REC-12](#s-rec-12): buscar o «Crear paciente».
3. Seguir el asistente como en el flujo 7. En el paso «Ruta» se puede elegir un «Tipo de cita» opcional (ajusta la ruta sugerida) y la ruta elegida sí se aplica.
4. Pulsar «Iniciar visita sin cita» → [S-REC-27](#s-rec-27) → «Abrir visita».
5. Con un paciente equivocado, «Cambiar paciente» reinicia el asistente (sin pedir confirmación).

### <a id="g-rec--9-el-paciente-ya-tiene-una-visita-abierta"></a>9. El paciente ya tiene una visita abierta

1. Al pulsar el botón final del asistente aparece «Esta acción no está permitida en el estado actual.».
2. Si la visita abierta está en la cola aparece «Abrir la visita existente»: abrirla y continuar desde allí en lugar de crear otra.

### <a id="g-rec--10-enviar-la-visita-a-su-circuito-y-asignar-proveedor"></a>10. Enviar la visita a su circuito y asignar proveedor

1. Abrir la visita [S-CLI-04](#s-cli-04) (desde el Panel, «Abrir visita» o el perfil del paciente → «Visitas»).
2. En la barra de acciones [S-CLI-07](#s-cli-07):
   - Ruta Estándar: «Enviar a enfermería» → «Visita movida a Esperando enfermería.».
   - Rutas directas («Solo inyección», «Solo laboratorio», «Solo procedimiento»): «Enviar a procedimiento» → «Procedimiento pendiente». Las órdenes las crea un Proveedor o el Administrador.
3. Para asignar proveedor, en el encabezado [S-CLI-05](#s-cli-05) pulsar «Asignar proveedor» (o «Cambiar proveedor») y tocar un nombre en [S-CLI-06](#s-cli-06) → «Proveedor actualizado.». El proveedor recibe la notificación «Paciente asignado a ti».

### <a id="g-rec--11-corregir-la-cobertura-de-una-visita"></a>11. Corregir la cobertura de una visita

1. En la visita, tarjeta «Cobertura» [S-CLI-11](#s-cli-11) → lápiz «Editar cobertura».
2. En [S-CLI-12](#s-cli-12) elegir «Tipo de cobertura» y completar «Aseguradora», «ID de miembro», «Copago», «Coaseguro», «Deducible» o «Plan de membresía».
3. «Guardar» → «Cobertura guardada.». Solo se puede editar con la visita abierta. Cerrar el diálogo tocando fuera descarta los cambios sin aviso.

### <a id="g-rec--12-cerrar-una-visita-el-paciente-se-fue-o-la-visita-se-anula"></a>12. Cerrar una visita (el paciente se fue o la visita se anula)

1. En la barra de acciones [S-CLI-07](#s-cli-07) pulsar «Cerrar visita…».
2. En [S-CLI-09](#s-cli-09) elegir «Se retiró antes» o «Cancelada» y escribir el «Motivo» (obligatorio, máximo 500).
3. «Cerrar visita» → aparece el banner «Esta visita está cerrada.» con el motivo. La visita sale de las colas; no se puede continuar (solo el Administrador puede reabrirla con «Forzar estado…»).

### <a id="g-rec--13-cobrar-una-visita"></a>13. Cobrar una visita

1. Abrir «Caja» [S-CAJ-01](#s-caj-01). Primero aparecen las visitas «En caja» y luego las «Listo para caja», por mayor espera.
2. En la tarjeta [S-CAJ-02](#s-caj-02) pulsar «Iniciar checkout» → «Checkout iniciado.» y se abre el checkout [S-CAJ-03](#s-caj-03). («Abrir» entra sin cambiar el estado.)
3. Revisar el «Estado de cuenta» [S-CAJ-07](#s-caj-07): cobertura y regla aplicada, líneas (origen «Orden» o «Manual»), descuentos («Manual» o «Membresía») y totales: «Subtotal», «Descuento total», «Total a pagar», «Pagado», «Saldo».
4. Si hace falta:
   - «Agregar cargo» → [S-CAJ-08](#s-caj-08): «Código de descripción» (solo A–Z, 0–9, `_ . / -`, sin texto libre, máximo 60), «Precio unitario (USD)», «Cantidad» (1 a 999), «Descuento (USD)» opcional → «Cargo agregado.».
   - Icono % «Aplicar descuento» en una línea → [S-CAJ-09](#s-caj-09) → «Descuento aplicado.». Un descuento manual (incluso 0) hace que esa línea ya no reciba beneficios de membresía.
   - Icono «Recalcular» (calculadora) para que el servidor vuelva a calcular el estado de cuenta → «Estado de cuenta recalculado.».
5. En «Registrar pago» [S-CAJ-11](#s-caj-11): elegir «Método» («Efectivo», «Tarjeta de crédito», «Tarjeta de débito», «Otro»), escribir el «Monto (USD)» o pulsar «Pagar saldo», añadir «Referencia (opcional)» (número de autorización o cheque; luego solo se ven los últimos 4 caracteres en tarjetas) y pulsar «Registrar pago · $X». Aparece «Pago de {monto} registrado.». Ojo: Enter en el monto o la referencia también registra el pago.
6. En «Recibos» [S-CAJ-14](#s-caj-14), con «Vincular al último pago ({monto})» marcado, pulsar «Generar recibo» → «Recibo LAN-R-000045 generado.». Cada pulsación crea un recibo nuevo: no usarlo para reimprimir.
7. Pulsar «Imprimir» en el recibo: la app registra la exportación y abre el diálogo de impresión (rollo de 80 mm) [S-CAJ-24](#s-caj-24).
8. Pulsar «Completar visita» en la barra de estado [S-CAJ-04](#s-caj-04) → «Visita completada.». La página queda en solo lectura; volver a «Caja» con «Atrás» o el menú.

### <a id="g-rec--14-pago-parcial-y-cierre-con-saldo-pendiente"></a>14. Pago parcial y cierre con saldo pendiente

1. Registrar el pago parcial (flujo 13, paso 5): el estado de cuenta pasa a «Pago parcial».
2. Generar e imprimir el recibo vinculado a ese pago: refleja el saldo restante.
3. «Completar visita» → aparece «Completar visita» [S-CAJ-05](#s-caj-05): «Queda un saldo de {monto}. Permanecerá en la cuenta del paciente como saldo abierto. ¿Completar la visita de todos modos?» → confirmar.
4. El saldo aparece en el perfil del paciente, pestaña «Saldos» [S-CAJ-17](#s-caj-17).
5. Limitación actual: una vez completada la visita, «Abrir checkout» la abre en solo lectura y el saldo no se puede cobrar desde la aplicación. Si el paciente puede pagar todo, registrar el pago antes de completar.

### <a id="g-rec--15-cobro-anticipado-o-ajuste-antes-de-que-la-visita-este-lista"></a>15. Cobro anticipado o ajuste antes de que la visita esté lista

1. Con la visita en otro estado abierto (p. ej. «Con proveedor»), abrirla y en la sección «Facturación» [S-CAJ-16](#s-caj-16) pulsar «Ir a checkout».
2. En [S-CAJ-03](#s-caj-03) la barra de estado no ofrece botones de flujo, pero se puede registrar un pago, agregar cargos y generar el recibo.
3. Cuando la visita quede «Listo para caja», continuar con el flujo 13.

### <a id="g-rec--16-la-visita-tiene-ordenes-abiertas"></a>16. La visita tiene órdenes abiertas

1. Al pulsar «Iniciar checkout» el servidor rechaza el paso: en el checkout aparece el diálogo «Órdenes abiertas» [S-CAJ-06](#s-caj-06); en la tarjeta de la cola, un aviso con el mismo texto.
2. «Ir a órdenes» abre la visita; el personal clínico debe completar o cancelar las órdenes.
3. Volver al checkout y repetir «Iniciar checkout».

### <a id="g-rec--17-ver-o-reimprimir-un-recibo-tambien-en-el-otro-idioma"></a>17. Ver o reimprimir un recibo, también en el otro idioma

1. En «Recibos» [S-CAJ-14](#s-caj-14) pulsar «Ver» en el recibo deseado → hoja «Recibo {código}» [S-CAJ-15](#s-caj-15).
2. Elegir «English» o «Español»; el texto se vuelve a generar en el servidor.
3. Pulsar «Imprimir» (o «Compartir» en Android; la copia del PDF que la app guarda para compartir se borra al compartir el recibo siguiente y al cerrar sesión). Alternativa: «Reimprimir» directamente desde la lista, en el idioma por defecto.
4. Un recibo es una foto fija: si después se anula un pago o se agrega un cargo, generar un recibo nuevo.

### <a id="g-rec--18-consultar-los-saldos-de-un-paciente"></a>18. Consultar los saldos de un paciente

1. «Pacientes» → perfil → pestaña «Saldos» [S-PAC-10](#s-pac-10) (misma vista que [S-CAJ-17](#s-caj-17)).
2. Revisar sede, visita, total, pagado y saldo.
3. Pulsar «Abrir checkout» para ir al cobro. Si la visita es de una sede que no tiene asignada aparece «Cambie a {código} para abrir esta visita.».

### <a id="g-rec--19-actualizar-los-datos-de-un-paciente"></a>19. Actualizar los datos de un paciente

1. En el perfil [S-PAC-05](#s-pac-05) pulsar «Editar» → «Editar paciente» [S-PAC-11](#s-pac-11).
2. Cambiar «Nombre», «Apellido» o «Teléfono» (vaciar el teléfono lo borra) → «Guardar» → «Paciente actualizado.».
3. Si otra persona lo cambió antes aparece «Actualizado por otro usuario» [S-PAC-12](#s-pac-12): «Actualizar» recarga el registro (lo escrito se pierde); volver a «Editar».
4. La fecha de nacimiento no se puede corregir desde ninguna pantalla.

### <a id="g-rec--20-asignar-el-codigo-del-paciente-en-otra-sede"></a>20. Asignar el código del paciente en otra sede

1. Con la sede activa deseada, abrir el perfil → pestaña «Resumen» [S-PAC-06](#s-pac-06).
2. Si no tiene código en esa sede, pulsar «Asignar código en esta sede» → «Código DAL-P-000042 asignado.».
3. No es imprescindible: el código de la sede también se crea solo al agendar o al registrar la llegada allí.

### <a id="g-rec--21-subir-un-documento-identificacion-tarjeta-de-seguro-consentimiento"></a>21. Subir un documento (identificación, tarjeta de seguro, consentimiento)

1. Perfil → pestaña «Documentos» [S-PAC-09](#s-pac-09) → «Subir».
2. En «Categoría del documento» [S-PAC-15](#s-pac-15) elegir la categoría (p. ej. «Tarjeta de seguro») y el origen: «Elegir archivo», «Elegir imagen» o «Tomar foto» (solo Android). Formatos JPEG, PNG, WebP, HEIC o PDF hasta el límite configurado (25 MB por defecto).
3. Seguir el avance en «Subidas» [S-PAC-16](#s-pac-16): «En espera» → «Preparando (suma de verificación)» → «Solicitando subida» → «Subiendo» → «Verificando» → «Subido». Se puede cambiar de pestaña sin perder la cola, pero cerrar sesión (también el cierre por inactividad) la vacía y aborta lo que esté subiendo: esperar a «Subido» antes de salir.
4. Si falla, leer el motivo y usar «Reintentar»; si el archivo fue rechazado por tamaño, tipo o nombre, «Descartar» y elegir otro.
5. Para ver: «Ver» (imágenes en vista previa [S-PAC-17](#s-pac-17), PDF en pestaña nueva) o «Descargar».
6. Un documento subido por error se puede eliminar en las 24 horas siguientes con un motivo [S-PAC-18](#s-pac-18).

### <a id="g-rec--22-cierre-del-dia-reportes-de-la-sede"></a>22. Cierre del día: reportes de la sede

1. Abrir «Reportes» [S-CAJ-18](#s-caj-18), pestaña «Diario» [S-CAJ-19](#s-caj-19) (por defecto, hoy en la zona horaria de la sede).
2. Revisar «Visitas», «Cobertura», «Citas», «Dinero» («Total facturado», «Total recibido»), «Recibido por método» y «Fuentes de referencia de pacientes nuevos».
3. Comparar «Recibido por método» con el efectivo y los comprobantes físicos.
4. Pulsar «Imprimir»: se registra la exportación y se abre el diálogo de impresión.
5. Para un periodo: pestaña «Rango» [S-CAJ-20](#s-caj-20), «Desde» / «Hasta» (máximo 92 días) o «Últimos 7 días» / «Últimos 30 días», y luego «Exportar CSV» o «Imprimir».

### <a id="g-rec--23-sede-sesion-y-cuenta"></a>23. Sede, sesión y cuenta

- **Cambiar de sede:** selector de la cabecera [S-GEN-13](#s-gen-13) → « · ». Si hay un formulario a medias (p. ej. el asistente de llegada), confirmar en [S-REC-17](#s-rec-17). Siempre se aterriza en el Panel de la nueva sede.
- **Inactividad:** al ver «¿Sigues ahí?» [S-GEN-20](#s-gen-20) pulsar «Mantener la sesión». Si se cierra, volver a iniciar sesión.
- **Salir:** menú de cuenta [S-GEN-16](#s-gen-16) → «Cerrar sesión» → confirmar [S-GEN-17](#s-gen-17). En un equipo compartido, cerrar sesión siempre al dejar el mostrador: al salir se vacía la cola de subidas y se borran del dispositivo las copias de los archivos y fotos elegidos [S-PAC-16](#s-pac-16).
- **Idioma y tema:** menú de cuenta o Perfil [S-GEN-21](#s-gen-21).
- **Verificación en dos pasos voluntaria:** Perfil → «Configurar» ([S-GEN-22](#s-gen-22), [S-GEN-23](#s-gen-23)).

## <a id="g-rec--que-puede-y-que-no-puede-hacer"></a>Qué puede y qué no puede hacer

| Puede | No puede |
| --- | --- |
| Buscar, registrar y editar pacientes (nombre, apellido, teléfono). | Fusionar pacientes ni ver registros fusionados en la búsqueda (solo Administrador). |
| Crear, confirmar, editar, reprogramar y cancelar cualquier cita de sus sedes, y marcar no presentado. | Corregir la fecha de nacimiento ni añadir referencias después del alta. |
| Registrar llegadas y visitas sin cita, capturar y corregir la cobertura. | Ver los valores clínicos de enfermería: solo estado y fechas. |
| Enviar la visita a enfermería o a procedimiento, asignar proveedor y cerrar visitas con motivo. | Iniciar enfermería, iniciar consulta, registrar signos vitales o valoración, crear o ejecutar órdenes. |
| Ver las órdenes de la visita (solo lectura, sin notas clínicas). | Abrir las colas de enfermería, proveedor y órdenes. |
| Cobrar: iniciar checkout, agregar cargos manuales, aplicar descuentos, registrar pagos, generar e imprimir recibos y completar la visita. | Anular cargos o pagos (solo Administrador). Anular un recibo (no existe). |
| Ver el reporte diario y por rango de su sede, imprimirlo y exportar CSV del rango. | Ver «Saldo pendiente» y «Bono» ni los reportes de la compañía. |
| Subir, ver y descargar documentos; eliminar los propios en 24 horas. | Eliminar documentos de otros ni ver los eliminados. |
| Gestionar su verificación en dos pasos, idioma y tema. | Entrar en Administración. |
| Cambiar de sede entre las asignadas. | Trabajar en una sede no asignada. |

## <a id="g-rec--errores-frecuentes-y-que-significan"></a>Errores frecuentes y qué significan

| Mensaje | Cuándo aparece | Qué hacer |
| --- | --- | --- |
| «No tiene permiso para realizar esta acción.» | La acción no corresponde a Recepción (el servidor la rechaza aunque la interfaz la haya mostrado). | Pedirla al rol correspondiente o al Administrador. |
| «No está autorizado para esta sede.» | La sede de la operación no está entre las asignadas. | Cambiar de sede o pedir al Administrador que la asigne. |
| Vuelve al Panel sin mensaje | Se abrió una pantalla o URL que el rol no tiene (p. ej. una cola clínica) o de otra sede. | Usar los destinos del menú. |
| «Este registro fue actualizado por otro usuario. Actualice para continuar.» / «Actualizada por otro usuario» / «Otra persona actualizó el estado de cuenta. Se ha actualizado.» | Otro puesto cambió el mismo registro antes. | Revisar los datos recargados y repetir si aún procede. |
| «Su sesión expiró. Inicie sesión de nuevo.» / «Se cerró tu sesión tras {minutes} minutos de inactividad.» | Sesión vencida o cierre por inactividad. | Iniciar sesión de nuevo. |
| «Su sesión fue renovada. Repita la acción.» | La sesión se renovó durante un guardado. | Pulsar otra vez el botón (el guardado no se repite solo). |
| «Esta acción no está permitida en el estado actual.» | Paciente con una visita ya abierta, cita ya registrada, paciente fusionado o inactivo, cita ya cerrada. | Actualizar; usar «Abrir la visita existente» o «Abrir registro principal» si aparecen. |
| «Algunos campos no son válidos. Revíselos.» | Campos fuera de rango; «Yo · » como proveedor sin ser proveedor; «Guardar» en «Editar cita» sin cambiar nada; duración fuera de 5–480 al reprogramar; teléfono de más de 15 dígitos; detalles de referencia sin fuente. | Corregir o cancelar. |
| «Posible paciente existente» | Mismo nombre y fecha de nacimiento que otro paciente. | Abrir el existente salvo que sea otra persona. |
| «No hay tipos de cita activos. Pida a un administrador que agregue uno.» | El catálogo de tipos de cita está vacío. | Avisar al Administrador. Los tipos nuevos aparecen tras volver a iniciar sesión. |
| «Esta visita aún tiene órdenes pendientes o en curso. Complételas o cancélelas antes de continuar.» | «Iniciar checkout» con órdenes abiertas. | Pedir al personal clínico que las resuelva. |
| «El monto supera el saldo actual. El estado de cuenta se ha actualizado.» / «El monto supera el saldo.» | Pago mayor que el saldo (quizá otro puesto ya cobró). | Revisar el saldo nuevo. |
| «El descuento supera el monto de la línea (precio unitario × cantidad).» | Descuento mayor que la línea. | Volver a abrir el diálogo y escribir un valor menor (lo escrito se pierde). |
| «Esta visita fue cancelada; la facturación está cerrada.» | Se intenta facturar una visita cancelada. | No se puede cobrar. |
| «Exportación cancelada: no se pudo registrar en la auditoría. Inténtelo de nuevo en un momento.» | Falló el registro previo a imprimir o exportar (red, límite de 30 por minuto). | Esperar un momento y reintentar. |
| «Los documentos no están disponibles por el momento…» | El almacenamiento de documentos no responde (modo degradado). | El resto del trabajo sigue; reintentar los documentos más tarde. |
| «La configuración del sistema está incompleta.» | Faltan ajustes obligatorios. | Avisar al Administrador. |
| «No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.» | Sin red. | Revisar la conexión y reintentar. |
| «Demasiados intentos. Intente de nuevo en {seconds} segundos.» | Límite de intentos (inicio de sesión, exportaciones). | Esperar la cuenta regresiva. |

## <a id="g-rec--pantallas-que-usa-este-rol"></a>Pantallas que usa este rol

- Generales: [S-GEN-01](#s-gen-01), [S-GEN-03](#s-gen-03) a [S-GEN-06](#s-gen-06), [S-GEN-08](#s-gen-08) a [S-GEN-17](#s-gen-17), [S-GEN-19](#s-gen-19) a [S-GEN-30](#s-gen-30).
- Pacientes: [S-PAC-01](#s-pac-01) a [S-PAC-12](#s-pac-12), [S-PAC-15](#s-pac-15) a [S-PAC-21](#s-pac-21).
- Recepción: [S-REC-01](#s-rec-01) a [S-REC-27](#s-rec-27).
- Clínica: [S-CLI-04](#s-cli-04) a [S-CLI-09](#s-cli-09), [S-CLI-11](#s-cli-11) a [S-CLI-13](#s-cli-13), [S-CLI-17](#s-cli-17), [S-CLI-23](#s-cli-23) a [S-CLI-26](#s-cli-26).
- Caja: [S-CAJ-01](#s-caj-01) a [S-CAJ-09](#s-caj-09), [S-CAJ-11](#s-caj-11), [S-CAJ-12](#s-caj-12), [S-CAJ-14](#s-caj-14) a [S-CAJ-21](#s-caj-21), [S-CAJ-24](#s-caj-24).
