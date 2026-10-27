# <a id="g-enf--guia-del-rol-enfermeria--asistente-medico"></a>Guía del rol Enfermería / asistente médico

Enfermería (MA) recibe al paciente después de Recepción: lo llama desde su cola, registra signos vitales y la valoración de enfermería, y lo envía al proveedor. También ejecuta las órdenes clínicas (inyecciones, tomas de laboratorio, procedimientos) desde la Cola de órdenes. Esta guía describe su trabajo paso a paso; la visión general está en el [README](README.md).

En la interfaz el rol se llama «Enfermería / asistente médico» (Perfil) o «Enfermería / MA» (Administración › Usuarios).

## <a id="g-enf--en-resumen"></a>En resumen

| Destino del menú | Para qué lo usa Enfermería |
| --- | --- |
| **Panel** [S-REC-01](#s-rec-01) | Vista de la sede. Abre con el chip «Enfermería» (Registrado, Esperando enfermería, Con enfermería y Procedimiento pendiente). |
| **Pacientes** [S-PAC-01](#s-pac-01) | Buscar pacientes y consultar su historial; subir documentos. No puede crear ni editar pacientes. |
| **Cola de enfermería** [S-CLI-01](#s-cli-01) | Su lista de trabajo: pacientes esperando o con enfermería, mayor espera primero. |
| **Cola de órdenes** [S-CLI-03](#s-cli-03) | Órdenes clínicas de la sede para ejecutar: pendientes, en curso, completadas hoy y canceladas. |

En teléfono los cuatro destinos caben en la barra inferior. Enfermería no ve Citas, Cola de proveedor, Caja, Reportes ni Administración.

## <a id="g-enf--un-dia-en-enfermeria"></a>Un día en enfermería

Luis, asistente médico de la sede Lancaster, inicia sesión en la tableta del consultorio de admisión y abre **Cola de enfermería**. Ve tres tarjetas: dos «Esperando enfermería» con su cronómetro de espera y una «Procedimiento pendiente» de una visita «Solo inyección».

Pulsa «Iniciar» en la tarjeta de Carlos Prueba, que lleva 12 minutos esperando. Aparece «Enfermería iniciada.» y se abre la visita en la sección «Enfermería». Pesa y mide a Carlos (la app calcula una vista previa del IMC), toma presión, pulso, temperatura y saturación, y pulsa «Guardar signos vitales». Luego anota en «Valoración» las alergias que refiere el paciente y el motivo de consulta, y pulsa «Guardar valoración». Al terminar pulsa «Enviar al proveedor», confirma «¿Enviar al proveedor?» y la app lo devuelve a su cola: Carlos ya está en la cola del proveedor.

Más tarde suena la campana: «Orden asignada a ti». En **Cola de órdenes** ve en «Pendientes» una inyección de B12 asignada a él. Pulsa «Iniciar», aplica la inyección y pulsa «Completar» con una nota de finalización. Como era la última orden abierta de una visita en «Procedimiento pendiente», la visita pasa sola a «Listo para caja» y Recepción la ve en Caja.

## <a id="g-enf--flujos-de-trabajo"></a>Flujos de trabajo

### <a id="g-enf--1-empezar-la-jornada"></a>1. Empezar la jornada

1. Iniciar sesión [S-GEN-03](#s-gen-03) (y el código de verificación en dos pasos [S-GEN-06](#s-gen-06) si la cuenta lo tiene).
2. Elegir la sede si se pide [S-GEN-11](#s-gen-11). La app abre el Panel [S-REC-01](#s-rec-01) con el chip «Enfermería».
3. Abrir «Cola de enfermería» [S-CLI-01](#s-cli-01). El subtítulo dice cuántos pacientes hay («{count} pacientes en espera», que incluye también los que ya están con enfermería).

### <a id="g-enf--2-tomar-al-siguiente-paciente"></a>2. Tomar al siguiente paciente

1. En la Cola de enfermería [S-CLI-01](#s-cli-01), las tarjetas están ordenadas por mayor espera. Cada una muestra nombre y código del paciente, estado, hora de registro, cronómetro de espera, tipo de cita (o «Sin cita»), ruta y proveedor.
2. En una tarjeta «Esperando enfermería» pulsar «Iniciar» → «Enfermería iniciada.» y se abre la visita [S-CLI-04](#s-cli-04).
3. «Abrir» (o tocar la tarjeta) entra en la visita sin cambiar su estado.
4. Alternativa: abrir la visita y guardar directamente signos vitales o valoración; el primer guardado en «Esperando enfermería» pasa la visita a «Con enfermería» («Signos vitales guardados. Enfermería iniciada: la visita está ahora con enfermería.»).
5. No hay asignación de enfermera: cualquier enfermera de la sede puede iniciar.

### <a id="g-enf--3-registrar-los-signos-vitales"></a>3. Registrar los signos vitales

En la visita, sección «Enfermería» [S-CLI-13](#s-cli-13), el formulario «Signos vitales» [S-CLI-14](#s-cli-14) está abierto mientras la visita está «Esperando enfermería» o «Con enfermería».

1. Completar los campos (todos opcionales, unidades imperiales):

| Campo | Unidad | Rango aceptado |
| --- | --- | --- |
| Peso | lb | 1 a 1500, hasta 2 decimales |
| Estatura | «ft / in» (pies 0 a 9 + pulgadas menores que 12) o «pulgadas» totales | 10 a 108 pulgadas |
| Presión arterial: Sistólica / Diastólica | mmHg | 40 a 300 / 20 a 200; la diastólica debe ser menor que la sistólica |
| Pulso | lpm | 20 a 300 |
| Respiraciones | /min | 4 a 80 |
| Temperatura | °F | 80 a 115 |
| SpO2 | % | 50 a 100 |
| Glucosa | mg/dL | 10 a 1000 (opcional) |
| Dolor (0–10) | — | Interruptor + deslizador 0 a 10 (opcional) |

2. Revisar la línea «IMC: {valor}». Es solo vista previa: el valor guardado lo calcula el servidor. Si peso y estatura dan un IMC fuera de 5 a 200 aparece «El peso y la estatura dan un IMC inverosímil (debe estar entre 5 y 200).».
3. Pulsar «Guardar signos vitales» (deshabilitado si no hay cambios) → «Signos vitales guardados.».
4. Para enviar al proveedor hacen falta, guardados, el **peso** o la **presión arterial completa**.

### <a id="g-enf--4-registrar-la-valoracion-de-enfermeria"></a>4. Registrar la valoración de enfermería

1. En la misma sección, formulario «Valoración» [S-CLI-15](#s-cli-15): ocho apartados desplegables de texto libre — «Alergias», «Antecedentes personales», «Antecedentes familiares», «Cirugías», «Estilo de vida», «Historia reproductiva», «Síntomas / motivo de consulta» (abierto al inicio) y «Notas de enfermería».
2. Cada apartado admite hasta 4000 caracteres (contador «{n}/4000»).
3. Pulsar «Guardar valoración» → «Valoración guardada.».
4. La valoración es por visita: las alergias y antecedentes no se copian de visitas anteriores. Revisarlas con el paciente en cada visita.

Hay dos formularios con su propio botón de guardar: guardar los dos antes de enviar al proveedor.

### <a id="g-enf--5-enviar-al-paciente-al-proveedor"></a>5. Enviar al paciente al proveedor

1. Al final de la sección «Enfermería» pulsar «Enviar al proveedor» [S-CLI-16](#s-cli-16) (solo en ruta Estándar).
2. Con peso o presión arterial guardados aparece «¿Enviar al proveedor?» / «El paciente pasará a la cola del proveedor.» → «Enviar al proveedor».
3. Sin ellos aparece «Sin signos vitales»: el servidor rechazará el envío. Pulsar «Cancelar» y guardar primero los signos vitales.
4. Resultado: «Enviado al proveedor.», la visita queda «Esperando proveedor» y la app vuelve a la Cola de enfermería.

La barra de acciones de la visita [S-CLI-07](#s-cli-07) tiene otro botón con el mismo nombre que no confirma ni comprueba los signos vitales. Usar el de la sección Enfermería.

### <a id="g-enf--6-ejecutar-ordenes-desde-la-cola-de-ordenes"></a>6. Ejecutar órdenes desde la Cola de órdenes

1. Abrir «Cola de órdenes» [S-CLI-03](#s-cli-03), pestaña «Pendientes» (las más antiguas primero). Activar «Asignadas a mí» para ver solo las propias.
2. Cada tarjeta muestra el ítem (p. ej. «Vitamina B12» con código `INJ_B12`), el tipo («Procedimiento», «Laboratorio», «Inyección»), la cantidad, los códigos del paciente y de la visita, quién la ordenó, cuándo y a quién está asignada, y el estado de la visita («Consulta: …»). No muestra nombres de pacientes ni notas clínicas: para ver el contexto pulsar «Abrir consulta».
3. Para tomar una orden: «Asignar» → «Asignar orden» [S-CLI-22](#s-cli-22) → «Asignarme» → «Orden asignada.».
4. Pulsar «Iniciar» [S-CLI-19](#s-cli-19) → «Orden iniciada.»; pasa a la pestaña «En curso». Solo se puede iniciar una orden sin asignar o asignada a uno mismo.
5. Al terminar, «Completar» → «Completar orden» [S-CLI-20](#s-cli-20): escribir «Notas de finalización (opcional)» (máximo 4000; se añaden a las notas de la orden) → «Completar» → «Orden completada.».
6. La orden pasa a «Completadas hoy» (día de calendario de la sede).
7. Si era la última orden abierta de una visita en «Procedimiento pendiente», la visita pasa sola a «Listo para caja».

Las mismas acciones están en la sección «Órdenes» de la visita [S-CLI-17](#s-cli-17), donde además se ven las notas de la orden.

### <a id="g-enf--7-visitas-de-ruta-directa-solo-inyeccion-laboratorio-o-procedimiento"></a>7. Visitas de ruta directa (solo inyección, laboratorio o procedimiento)

1. Recepción registra la llegada con la ruta directa y pulsa «Enviar a procedimiento».
2. La visita aparece en la Cola de enfermería con el chip «Procedimiento pendiente» (solo «Abrir», sin «Iniciar»). No hay etapa de enfermería: la sección Enfermería no muestra «Enviar al proveedor».
3. Las órdenes las crea un Proveedor o el Administrador (Enfermería no puede crear órdenes). Si la visita no tiene órdenes, avisar al proveedor.
4. Ejecutar cada orden (flujo 6).
5. Al resolverse la última orden la visita pasa a «Listo para caja». Si no queda ninguna orden abierta y la visita sigue en «Procedimiento pendiente», también se puede pulsar «Listo para pago» en la barra de acciones [S-CLI-07](#s-cli-07); con órdenes abiertas aparece «Órdenes abiertas» [S-CLI-08](#s-cli-08) con «Ir a órdenes».

### <a id="g-enf--8-corregir-signos-vitales-o-la-valoracion"></a>8. Corregir signos vitales o la valoración

1. Abrir la visita → sección «Enfermería» [S-CLI-13](#s-cli-13) → «Editar» en «Signos vitales» o en «Valoración».
2. Modificar o vaciar campos (vaciar un campo borra el valor guardado) → «Guardar signos vitales» / «Guardar valoración».
3. Se puede corregir mientras la visita está en Registrado, Esperando o Con enfermería, Esperando o Con proveedor y Procedimiento pendiente. En «Listo para caja» y «En caja» el servidor responde «Los datos de enfermería están bloqueados para esta visita.»; con la visita cerrada, «La visita ya está cerrada.».
4. Si otra persona guardó antes aparece el mensaje de conflicto y el formulario se recarga con los valores del servidor: lo tecleado se pierde y hay que repetir la corrección.

### <a id="g-enf--9-atender-una-notificacion-de-orden"></a>9. Atender una notificación de orden

1. La campana de la cabecera [S-GEN-15](#s-gen-15) muestra el número de avisos sin leer.
2. Abrirla y tocar «Orden asignada a ti» u «Orden asignada actualizada» («Orden {item}»): se marca como leída y se abre la visita.
3. Las notificaciones llegan solo con la conexión en vivo y se pierden al recargar la app.

### <a id="g-enf--10-consultar-a-un-paciente"></a>10. Consultar a un paciente

1. «Pacientes» [S-PAC-01](#s-pac-01): buscar por código, nombre, apellido, fecha de nacimiento o teléfono (coincidencia exacta).
2. En el perfil [S-PAC-05](#s-pac-05) (solo lectura):
   - «Resumen» [S-PAC-06](#s-pac-06): códigos por sede, datos y referencias.
   - «Citas» [S-PAC-07](#s-pac-07): historial de citas. Tocar una cita o «Abrir citas» devuelve al Panel: Enfermería no tiene acceso a la agenda.
   - «Visitas» [S-PAC-08](#s-pac-08): tocar una visita la abre.
   - «Documentos» [S-PAC-09](#s-pac-09): ver, descargar y subir.
   - «Saldos» [S-PAC-10](#s-pac-10): muestra «No tiene permiso para realizar esta acción.» (Enfermería no ve saldos).
3. En la visita, la tarjeta «Cobertura» [S-CLI-11](#s-cli-11) y la sección «Facturación» [S-CLI-23](#s-cli-23) son de solo lectura; Facturación muestra solo totales.

### <a id="g-enf--11-subir-un-documento-consentimiento-resultado-imagen-clinica"></a>11. Subir un documento (consentimiento, resultado, imagen clínica)

1. Perfil → «Documentos» → «Subir» → categoría y origen en [S-PAC-15](#s-pac-15) («Elegir archivo», «Elegir imagen» o «Tomar foto» en Android).
2. Seguir el avance en «Subidas» [S-PAC-16](#s-pac-16) hasta «Subido». Cerrar sesión (también el cierre por inactividad) vacía la cola y aborta lo que esté subiendo; las copias de los archivos y fotos elegidos se borran del dispositivo.
3. Un documento propio subido por error se elimina en las 24 horas siguientes con un motivo [S-PAC-18](#s-pac-18).

### <a id="g-enf--12-sede-sesion-y-cuenta"></a>12. Sede, sesión y cuenta

- Cambiar de sede con el selector de la cabecera [S-GEN-13](#s-gen-13); si hay signos vitales o valoración sin guardar se pide confirmación [S-CLI-26](#s-cli-26).
- «¿Sigues ahí?» [S-GEN-20](#s-gen-20) → «Mantener la sesión». En equipos compartidos, cerrar sesión al terminar [S-GEN-17](#s-gen-17).
- Verificación en dos pasos voluntaria, idioma y tema en el Perfil [S-GEN-21](#s-gen-21).

## <a id="g-enf--que-puede-y-que-no-puede-hacer"></a>Qué puede y qué no puede hacer

| Puede | No puede |
| --- | --- |
| Ver el Panel y su cola de enfermería. | Ver Citas, Cola de proveedor, Caja, Reportes y Administración. |
| Iniciar la etapa de enfermería y enviar al proveedor. | Enviar a enfermería, registrar llegadas, iniciar consulta o cobrar. |
| Registrar y corregir signos vitales y la valoración de enfermería. | Editar enfermería cuando la visita está en caja o cerrada. |
| Ejecutar órdenes: asignarse, iniciar, completar y reasignar. | Crear órdenes o cancelarlas. |
| Pasar a «Listo para pago» una visita en «Procedimiento pendiente» sin órdenes abiertas. | Cerrar visitas o forzar estados. |
| Buscar pacientes y ver su perfil, citas y visitas. | Crear, editar o fusionar pacientes; abrir la agenda desde el perfil. |
| Ver la cobertura y los totales de la visita. | Ver líneas de cargos, saldos del paciente o editar la cobertura. |
| Subir, ver y descargar documentos; eliminar los propios en 24 horas. | Eliminar documentos de otros. |
| Gestionar su verificación en dos pasos, idioma y tema. | Imprimir o exportar reportes y recibos. |

## <a id="g-enf--errores-frecuentes-y-que-significan"></a>Errores frecuentes y qué significan

| Mensaje | Cuándo aparece | Qué hacer |
| --- | --- | --- |
| «Su rol no realiza este paso.» | El servidor rechazó un paso del flujo que pertenece a otro rol. | Dejar el paso al rol correspondiente. |
| «Esta transición no está permitida en el estado actual.» | La visita cambió de estado mientras tanto. | Actualizar la cola o la visita. |
| «Registre peso o presión arterial antes de enviar al proveedor.» | «Enviar al proveedor» sin esos signos vitales guardados. | Guardar peso o sistólica + diastólica y repetir. |
| «La enfermería solo puede completarse mientras el paciente está con enfermería.» | La visita ya no está en la etapa de enfermería. | Actualizar la visita. |
| «Los datos de enfermería están bloqueados para esta visita.» | Se intenta guardar en «Listo para caja» o «En caja». | Ya no se puede corregir. |
| «La visita ya está cerrada.» | La visita se completó o se cerró. | Solo lectura. |
| «La diastólica debe ser menor que la sistólica.» / «Un valor está fuera del rango aceptado.» | Valores fuera de rango. | Revisar la medición. |
| «Máximo 4000 caracteres.» | Apartado de valoración o nota de finalización demasiado largo. | Resumir el texto. |
| «Esta orden está asignada a otro miembro del personal.» | Iniciar una orden asignada a otra persona. | Pedir que se la reasignen o usar «Asignar». |
| «Esta orden no puede pasar a ese estado.» / «Esta orden ya está cerrada.» | La orden cambió o ya se completó o canceló. | Actualizar la cola. |
| «Esta consulta está cerrada.» | La visita de la orden está cerrada. | No se puede ejecutar. |
| «El miembro del personal seleccionado no puede ejecutar órdenes en esta sede.» | Asignar a alguien que no ejecuta órdenes en la sede. | Elegir otra persona o «Asignarme». |
| «Órdenes abiertas» | «Listo para pago» con órdenes pendientes o en curso. | «Ir a órdenes» y completarlas. |
| «Este registro fue actualizado por otro usuario. Actualice para continuar.» / «Otro usuario actualizó esta orden. La lista se ha actualizado.» | Otra persona cambió el registro antes. | Revisar y repetir. |
| «No tiene permiso para realizar esta acción.» | Pestaña «Saldos» del paciente u otra acción fuera del rol. | Es normal para el rol. |
| Vuelve al Panel sin mensaje | Se intentó abrir la agenda o una ruta no permitida. | Usar los destinos del menú. |
| «Su sesión fue renovada. Repita la acción.» | La sesión se renovó durante un guardado. | Pulsar otra vez el botón. |
| «No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.» | Sin red. | No hay modo sin conexión: reintentar cuando vuelva la red. |

## <a id="g-enf--pantallas-que-usa-este-rol"></a>Pantallas que usa este rol

- Generales: [S-GEN-01](#s-gen-01), [S-GEN-03](#s-gen-03) a [S-GEN-06](#s-gen-06), [S-GEN-08](#s-gen-08) a [S-GEN-17](#s-gen-17), [S-GEN-19](#s-gen-19) a [S-GEN-30](#s-gen-30).
- Pacientes: [S-PAC-01](#s-pac-01), [S-PAC-05](#s-pac-05) a [S-PAC-10](#s-pac-10), [S-PAC-15](#s-pac-15) a [S-PAC-20](#s-pac-20).
- Recepción (solo Panel): [S-REC-01](#s-rec-01) a [S-REC-05](#s-rec-05).
- Clínica: [S-CLI-01](#s-cli-01), [S-CLI-03](#s-cli-03) a [S-CLI-05](#s-cli-05), [S-CLI-07](#s-cli-07), [S-CLI-08](#s-cli-08), [S-CLI-11](#s-cli-11), [S-CLI-13](#s-cli-13) a [S-CLI-17](#s-cli-17), [S-CLI-19](#s-cli-19), [S-CLI-20](#s-cli-20), [S-CLI-22](#s-cli-22) a [S-CLI-26](#s-cli-26).
- Caja (solo la sección Facturación de la visita): [S-CAJ-16](#s-caj-16).
