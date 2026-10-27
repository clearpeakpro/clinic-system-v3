# <a id="g-pro--guia-del-rol-proveedor"></a>Guía del rol Proveedor

El Proveedor es el profesional que hace la consulta. Toma a los pacientes que enfermería le deja listos, revisa la información de enfermería (y corrige signos vitales si hace falta), indica las órdenes clínicas (procedimientos, laboratorios, inyecciones), decide si la visita pasa a procedimiento o queda lista para pago, y gestiona su propia agenda. También puede ejecutar órdenes. Esta guía describe su trabajo paso a paso; la visión general está en el [README](README.md).

## <a id="g-pro--en-resumen"></a>En resumen

| Destino del menú | Para qué lo usa el Proveedor |
| --- | --- |
| **Panel** [S-REC-01](#s-rec-01) | Vista de la sede. Abre con el chip «Proveedor» y el filtro «Mis pacientes». |
| **Pacientes** [S-PAC-01](#s-pac-01) | Buscar pacientes, consultar su historial y actualizar su teléfono. |
| **Citas** [S-REC-06](#s-rec-06) | Su agenda: abre con «Mis citas». Crea citas para sí mismo y gestiona las suyas. |
| **Cola de enfermería** [S-CLI-01](#s-cli-01) | Ver quién está en enfermería (sin poder iniciar la etapa). |
| **Cola de proveedor** [S-CLI-02](#s-cli-02) | Su lista de trabajo: esperando proveedor, en consulta y esperando procedimientos. |
| **Cola de órdenes** [S-CLI-03](#s-cli-03) | Órdenes de la sede para ejecutar o cancelar. |

En teléfono la barra inferior muestra Panel, Pacientes, Citas, Cola de enfermería y Cola de proveedor; «Cola de órdenes» queda en el menú (cajón). El Proveedor no ve Caja, Reportes ni Administración.

## <a id="g-pro--un-dia-del-proveedor"></a>Un día del proveedor

La doctora Elena Muestra inicia sesión y abre **Cola de proveedor** con el filtro «Mis pacientes». Recepción le asignó la visita de Carlos Prueba y a ella le llegó el aviso «Paciente asignado a ti». La tarjeta de Carlos dice «Enfermería lista 9:20» y su cronómetro corre desde ese momento.

Pulsa «Iniciar consulta»: aparece «Consulta iniciada.» y se abre la visita. Revisa los signos vitales y la valoración de enfermería; corrige el peso, que se había anotado mal, con «Editar» en «Signos vitales». Tras la consulta indica una prueba de laboratorio y una inyección con «Nueva orden», revisa el cargo estimado de cada una y pulsa «Enviar a procedimiento». La visita queda «Procedimiento pendiente» y las órdenes aparecen en la cola de órdenes de enfermería.

Con el filtro «Sin asignar» ve un paciente sin proveedor; pulsa «Iniciar consulta» y la app se lo asigna automáticamente. Esta vez no hacen falta órdenes: al terminar pulsa «Listo para pago» y la visita pasa a Caja.

Por la tarde revisa **Citas** con «Mis citas», reprograma una cita propia y crea otra para un paciente que vuelve en dos semanas.

## <a id="g-pro--flujos-de-trabajo"></a>Flujos de trabajo

### <a id="g-pro--1-empezar-la-jornada"></a>1. Empezar la jornada

1. Iniciar sesión [S-GEN-03](#s-gen-03) (y el código de verificación en dos pasos [S-GEN-06](#s-gen-06) si la cuenta lo tiene); elegir la sede si se pide [S-GEN-11](#s-gen-11).
2. El Panel [S-REC-01](#s-rec-01) abre con el chip «Proveedor» (Esperando proveedor, Con proveedor, Procedimiento pendiente) y el menú de proveedor en «Mis pacientes» [S-REC-03](#s-rec-03).
3. Revisar las notificaciones [S-GEN-15](#s-gen-15): «Paciente asignado a ti», «Cita actualizada», «Orden asignada a ti».

### <a id="g-pro--2-tomar-al-siguiente-paciente"></a>2. Tomar al siguiente paciente

1. Abrir «Cola de proveedor» [S-CLI-02](#s-cli-02). Filtro: «Mis pacientes» (por defecto), «Sin asignar» o «Todos».
2. Orden de la lista: primero «Esperando proveedor», después «Con proveedor» y al final «Esperando procedimientos», cada grupo por mayor espera. El cronómetro cuenta desde que terminó enfermería (o desde el registro si no hubo enfermería) y la tarjeta muestra «Enfermería lista {hora}».
3. Pulsar «Iniciar consulta» en una visita «Esperando proveedor» sin asignar o asignada a usted. Si no tenía proveedor, la app se la asigna primero y luego inicia la consulta → «Consulta iniciada.» y se abre la visita [S-CLI-04](#s-cli-04).
4. «Abrir» entra en la visita sin cambiar su estado.

Desde la barra de acciones de la visita [S-CLI-07](#s-cli-07), «Iniciar consulta» no asigna la visita: si se inicia desde ahí, conviene pulsar antes «Asignarme» en el encabezado (flujo 4).

### <a id="g-pro--3-revisar-enfermeria-y-corregir-signos-vitales"></a>3. Revisar enfermería y corregir signos vitales

1. En la visita, sección «Enfermería» [S-CLI-13](#s-cli-13): resumen de «Signos vitales» (peso, estatura, IMC, presión arterial, pulso, respiraciones, temperatura, SpO2, glucosa, dolor) y la «Valoración» (alergias, antecedentes, cirugías, estilo de vida, historia reproductiva, síntomas / motivo de consulta, notas de enfermería).
2. La valoración es de solo lectura para el Proveedor y su texto no se puede copiar.
3. Para corregir signos vitales: «Editar» en «Signos vitales» → [S-CLI-14](#s-cli-14) → «Guardar signos vitales». Permitido hasta «Procedimiento pendiente»; en caja el servidor responde «Los datos de enfermería están bloqueados para esta visita.».
4. La tarjeta «Cobertura» [S-CLI-11](#s-cli-11) y la sección «Facturación» [S-CLI-23](#s-cli-23) son de solo lectura (totales).

### <a id="g-pro--4-asignarse-una-visita"></a>4. Asignarse una visita

1. En el encabezado de la visita [S-CLI-05](#s-cli-05), celda «Proveedor», pulsar «Asignarme» → «Proveedor actualizado.».
2. Funciona también sobre una visita asignada a otro proveedor (la toma).
3. Elegir otro proveedor («Asignar proveedor») solo lo pueden hacer Recepción y el Administrador.

### <a id="g-pro--5-indicar-ordenes-clinicas"></a>5. Indicar órdenes clínicas

1. En la visita, sección «Órdenes» [S-CLI-17](#s-cli-17) → «Nueva orden».
2. Se pueden crear órdenes con la visita en «Esperando proveedor», «Con proveedor» o «Procedimiento pendiente», y en rutas directas también en «Registrado». En otros estados el botón está deshabilitado con el texto «Las órdenes se crean mientras el paciente espera al proveedor o está con él, o durante una consulta solo de procedimiento.».
3. En «Nueva orden» [S-CLI-18](#s-cli-18):
4. «Tipo»: «Procedimiento», «Laboratorio» o «Inyección» (cambiar de tipo limpia la selección).
5. «Buscar por código o nombre» y elegir el ítem de la lista (solo ítems activos, con su precio).
6. «Cantidad» (1 a 1000).
7. En laboratorio, «Laboratorio proveedor» opcional: muestra «Precio del proveedor {importe}» o «El proveedor no tiene precio vigente; aplica el precio por defecto.».
8. «Notas (opcional)» (máximo 4000; nota clínica cifrada).
9. Revisar «Cargo estimado {importe}» (y «{precio} × {cantidad}»): es una estimación del catálogo; el estado de cuenta es la autoridad.
10. «Crear orden» → «Orden creada.». La orden nace «Pendiente» y «Sin asignar», y su cargo se crea en el estado de cuenta.
11. Crear una orden no mueve la visita: después hay que pulsar «Enviar a procedimiento» (flujo 6).
12. Si la visita ya no acepta órdenes aparece «No se permiten órdenes ahora».

### <a id="g-pro--6-terminar-la-consulta"></a>6. Terminar la consulta

En la barra de acciones [S-CLI-07](#s-cli-07), con la visita «Con proveedor»:

- **Hay órdenes que ejecutar:** «Enviar a procedimiento» → «Visita movida a Procedimiento pendiente.». La visita aparece como «Esperando procedimientos» en la Cola de proveedor y sus órdenes en la Cola de órdenes. Cuando se completa o cancela la última orden abierta, pasa sola a «Listo para caja».
- **No hay órdenes pendientes:** «Listo para pago» → «Listo para caja»; Recepción la cobra en Caja.
- Si quedan órdenes «Pendiente» o «En curso», el servidor bloquea «Listo para pago» y aparece «Órdenes abiertas» [S-CLI-08](#s-cli-08): «Ir a órdenes» lleva a la sección para completarlas o cancelarlas.

### <a id="g-pro--7-ejecutar-ordenes"></a>7. Ejecutar órdenes

1. Desde la sección «Órdenes» de la visita o la «Cola de órdenes» [S-CLI-03](#s-cli-03) (pestañas «Pendientes», «En curso», «Completadas hoy», «Canceladas»; conmutador «Asignadas a mí»).
2. «Asignar» → «Asignarme» [S-CLI-22](#s-cli-22) → «Orden asignada.».
3. «Iniciar» [S-CLI-19](#s-cli-19) → «Orden iniciada.» (solo órdenes sin asignar o asignadas a usted).
4. «Completar» → nota opcional en [S-CLI-20](#s-cli-20) → «Orden completada.».

### <a id="g-pro--8-cancelar-una-orden"></a>8. Cancelar una orden

1. En una orden «Pendiente» o «En curso» que usted ordenó, o de una visita donde usted es el proveedor, pulsar «Cancelar orden» [S-CLI-19](#s-cli-19).
2. En [S-CLI-21](#s-cli-21) escribir el «Motivo» (obligatorio, máximo 500) → «Cancelar orden» → «Orden cancelada.». «Conservar orden» sale sin cambios.
3. El cargo de la orden se anula. La orden queda oculta salvo con «Mostrar canceladas ({n})», con el texto «Cancelada: {motivo}».
4. Si era la última orden abierta y la visita estaba en «Procedimiento pendiente», la visita pasa a «Listo para caja». Es irreversible.

### <a id="g-pro--9-visitas-de-ruta-directa"></a>9. Visitas de ruta directa

1. Recepción registra la visita con «Solo inyección», «Solo laboratorio» o «Solo procedimiento» y la envía a procedimiento.
2. El Proveedor (o el Administrador) crea las órdenes en la sección «Órdenes» (permitido ya en «Registrado» y en «Procedimiento pendiente»).
3. Enfermería las ejecuta; la visita pasa a «Listo para caja» al resolverse la última. También se puede pulsar «Listo para pago» si no quedan órdenes abiertas.

### <a id="g-pro--10-gestionar-su-agenda"></a>10. Gestionar su agenda

1. Abrir «Citas» [S-REC-06](#s-rec-06): abre con «Mis citas». Navegar con «<», «>», «Hoy» o el selector de fecha; vistas «Día» [S-REC-07](#s-rec-07) y «Lista» [S-REC-08](#s-rec-08).
2. **Nueva cita:** «Nueva cita» → [S-REC-10](#s-rec-10). El campo «Proveedor» queda fijo en «Yo · » con la ayuda «Solo puede gestionar las citas asignadas a usted.». En «Elegir paciente» [S-REC-12](#s-rec-12) no aparece «Crear paciente»: si el paciente no existe, pedir a Recepción que lo registre. Completar tipo, fecha, hora, duración (5 a 480) y notas → «Crear».
3. **Citas propias** (detalle [S-REC-09](#s-rec-09)): «Confirmar», «Editar», «Reprogramar» [S-REC-13](#s-rec-13), «Cancelar cita» [S-REC-14](#s-rec-14) y «Marcar no presentado» [S-REC-15](#s-rec-15), igual que Recepción.
4. **Citas de otros:** se ven todos los datos y la nota «Solo puede gestionar las citas asignadas a usted.», sin botones.
5. «Registrar llegada» y «Sin cita» no están disponibles para el Proveedor.

### <a id="g-pro--11-actualizar-el-telefono-de-un-paciente"></a>11. Actualizar el teléfono de un paciente

1. Perfil del paciente [S-PAC-05](#s-pac-05) → «Editar» → [S-PAC-11](#s-pac-11).
2. «Nombre» y «Apellido» aparecen deshabilitados con el texto «Su rol solo puede actualizar el teléfono.».
3. Cambiar o vaciar «Teléfono» → «Guardar» → «Paciente actualizado.».

### <a id="g-pro--12-consultar-el-historial-del-paciente"></a>12. Consultar el historial del paciente

1. Perfil [S-PAC-05](#s-pac-05): «Resumen» [S-PAC-06](#s-pac-06), «Citas» [S-PAC-07](#s-pac-07) (abre la agenda del día de la cita), «Visitas» [S-PAC-08](#s-pac-08), «Documentos» [S-PAC-09](#s-pac-09) y «Saldos» [S-PAC-10](#s-pac-10).
2. En «Saldos» el botón es «Abrir visita» (el cobro es de Recepción).
3. En «Resumen» aparece «Asignar código en esta sede», pero el servidor lo rechaza para el Proveedor: pedirlo a Recepción (el código también se crea solo al registrar la llegada).

### <a id="g-pro--13-sede-sesion-y-cuenta"></a>13. Sede, sesión y cuenta

- Cambiar de sede con el selector de la cabecera [S-GEN-13](#s-gen-13); siempre se aterriza en el Panel.
- «¿Sigues ahí?» [S-GEN-20](#s-gen-20) → «Mantener la sesión».
- Cerrar sesión (también el cierre por inactividad) vacía la cola de subidas de documentos y borra del dispositivo las copias de los archivos elegidos [S-PAC-16](#s-pac-16).
- Verificación en dos pasos voluntaria, idioma y tema en el Perfil [S-GEN-21](#s-gen-21).

## <a id="g-pro--que-puede-y-que-no-puede-hacer"></a>Qué puede y qué no puede hacer

| Puede | No puede |
| --- | --- |
| Ver el Panel, la Cola de enfermería (solo lectura) y su Cola de proveedor. | Iniciar la etapa de enfermería ni enviar al proveedor. |
| Iniciar consulta (con autoasignación desde la cola) y asignarse visitas. | Asignar la visita a otro proveedor. |
| Registrar y corregir signos vitales. | Editar la valoración de enfermería (solo lectura). |
| Crear órdenes y cancelar las que ordenó o las de visitas donde es el proveedor. | Ver el «Costo interno» del laboratorio (solo Administrador). |
| Ejecutar órdenes: asignarse, iniciar, completar. | Iniciar una orden asignada a otra persona. |
| «Enviar a procedimiento» y «Listo para pago». | Cerrar visitas, forzar estados, iniciar pago o completar la visita. |
| Crear citas para sí mismo y gestionar las suyas. | Gestionar citas de otros, registrar llegadas o crear visitas sin cita. |
| Buscar pacientes y actualizar su teléfono. | Crear pacientes, cambiar nombres, fusionar o asignar código en una sede. |
| Ver cobertura, totales y saldos del paciente; abrir la visita del saldo. | Cobrar, ver la Caja o los Reportes. |
| Subir, ver y descargar documentos; eliminar los propios en 24 horas. | Entrar en Administración. |

## <a id="g-pro--errores-frecuentes-y-que-significan"></a>Errores frecuentes y qué significan

| Mensaje | Cuándo aparece | Qué hacer |
| --- | --- | --- |
| «No tiene permiso para realizar esta acción.» | Gestionar una cita de otro proveedor, «Asignar código en esta sede» u otra acción fuera del rol. | Pedirlo a Recepción o al Administrador. |
| «Otra persona actualizó esta visita. La pantalla se ha actualizado.» | Otro usuario cambió la visita (p. ej. otro proveedor la tomó). | Revisar el nuevo estado. Si la asignación funcionó pero la consulta no se inició, la visita queda asignada a usted: pulsar de nuevo «Iniciar consulta». |
| «Esta transición no está permitida en el estado actual.» | La visita ya no está en el estado esperado. | Actualizar la cola. |
| «Órdenes abiertas» | «Listo para pago» con órdenes pendientes o en curso. | Completar o cancelar las órdenes. |
| «No se permiten órdenes ahora» | La visita no está en un estado que acepte órdenes. | Revisar el estado de la visita. |
| «Esta consulta está cerrada.» | La visita de la orden está cerrada. | Solo el Administrador puede cancelar órdenes de visitas cerradas. |
| «Solo el proveedor que la ordenó, el proveedor de la consulta o un administrador pueden cancelar esta orden.» | Cancelar una orden ajena. | Pedirlo al proveedor que la ordenó o al Administrador. |
| «Esta orden está asignada a otro miembro del personal.» | Iniciar una orden asignada a otra persona. | Reasignarla con «Asignar». |
| «La cantidad debe estar entre 1 y 1000.» / «Máximo 4000 caracteres.» | Datos fuera de límites en «Nueva orden». | Corregir. |
| «Ese usuario no es un proveedor activo en esta sede.» | La asignación de proveedor no es válida en la sede. | Avisar al Administrador para revisar roles y sedes. |
| «Solo recepción o administradores pueden asignar un proveedor; los proveedores pueden asignarse a sí mismos.» | Intento de asignar a otra persona. | Usar «Asignarme» o pedirlo a Recepción. |
| «Los datos de enfermería están bloqueados para esta visita.» | Corregir signos vitales en «Listo para caja» o «En caja». | Ya no se puede corregir. |
| «Guardada con una advertencia» / «El proveedor ya tiene una cita en ese horario.» | Cita que se cruza con otra propia. | La cita se guardó; revisar la agenda. |
| «Actualizada por otro usuario» | Otra persona cambió la cita antes. | «Actualizar» y repetir si procede. |
| Vuelve al Panel sin mensaje | Se abrió una ruta no permitida (Caja, Reportes, Administración). | Usar los destinos del menú. |
| «Su sesión fue renovada. Repita la acción.» | La sesión se renovó durante un guardado. | Pulsar otra vez el botón. |

## <a id="g-pro--pantallas-que-usa-este-rol"></a>Pantallas que usa este rol

- Generales: [S-GEN-01](#s-gen-01), [S-GEN-03](#s-gen-03) a [S-GEN-06](#s-gen-06), [S-GEN-08](#s-gen-08) a [S-GEN-17](#s-gen-17), [S-GEN-19](#s-gen-19) a [S-GEN-30](#s-gen-30).
- Pacientes: [S-PAC-01](#s-pac-01), [S-PAC-04](#s-pac-04) a [S-PAC-12](#s-pac-12), [S-PAC-15](#s-pac-15) a [S-PAC-20](#s-pac-20).
- Recepción (Panel y citas propias): [S-REC-01](#s-rec-01) a [S-REC-17](#s-rec-17).
- Clínica: [S-CLI-01](#s-cli-01) a [S-CLI-05](#s-cli-05), [S-CLI-07](#s-cli-07), [S-CLI-08](#s-cli-08), [S-CLI-11](#s-cli-11), [S-CLI-13](#s-cli-13), [S-CLI-14](#s-cli-14), [S-CLI-15](#s-cli-15), [S-CLI-17](#s-cli-17) a [S-CLI-26](#s-cli-26) ([S-CLI-21](#s-cli-21) solo en órdenes propias).
- Caja (consulta): [S-CAJ-16](#s-caj-16), [S-CAJ-17](#s-caj-17).
