# Demo de la fase 3A: guion para probar en su computadora

Con este guion usted comprueba, en su navegador y sin ayuda, lo que construyó la fase 3A:
- el **Panel en vivo**, con las marcas «Alerta» y «Crítico» de los pacientes que esperan demasiado;
- el **kiosco de autorregistro** en una tableta: vincularla, registrarse en español y en inglés, confirmar el registro en Recepción («Primera vez» y «Ya soy paciente»), descartar un envío de prueba y revocar la tableta;
- la **llegada** de un paciente con cita y de uno sin cita;
- **Enfermería**: signos vitales, alergias en sus tres estados, el bloqueo sin peso ni presión y la excepción de la Propietaria;
- el **Proveedor**: el aviso «Paciente asignado a usted», la consulta y «Listo para caja»;
- **cerrar una visita** con su motivo, su historial, y las alergias que aparecen solas en la visita siguiente;
- que «Clínica Demo Sur» no ve nada de «Clínica Demo Norte».

Todo usa **datos ficticios** de dos clínicas inventadas: «Clínica Demo Norte» y «Clínica Demo Sur».

Cada paso dice:
- **Ventana:** en qué ventana se hace;
- **Usuario:** con quién entrar;
- **Haga:** qué hacer;
- **Debe ver:** el resultado esperado. Si ve otra cosa, anote el número del paso y lo que vio.

Tiempo aproximado: 60 minutos.

---

## Antes de empezar

**Necesita:**
- Docker Desktop abierto (el icono de la ballena, quieto).
- Una terminal abierta en la carpeta del proyecto (`clinic-system-v3`).
- **Google Chrome** y **Microsoft Edge** (viene con Windows).
- Su teléfono con la aplicación de autenticación que usó en las demos anteriores (**Google Authenticator** o **Microsoft Authenticator**).
- Altavoces o auriculares encendidos: la llegada de un registro del kiosco suena en Recepción.

### Las tres ventanas

Este guion usa tres ventanas a la vez. Póngalas una al lado de la otra:

| Ventana | Cómo abrirla | Para qué |
| --- | --- | --- |
| **Chrome normal** | Abra Chrome como siempre. | **Recepción** durante todo el guion (Rosa Recepción). |
| **Chrome incógnito** | En Chrome: menú ⋮ → «Nueva ventana de incógnito», o `Ctrl + Mayús + N`. | Las demás personas, una tras otra: la Propietaria, Enfermería, la Proveedora y, al final, Recepción de Sur. |
| **Edge** | Abra Microsoft Edge (normal, no InPrivate). | La **tableta del kiosco**. Hágala estrecha y alta, como una tableta en vertical. |

> - Use **una sola** ventana de incógnito: todas las de incógnito comparten la misma sesión.
> - En **Edge no inicie sesión** con ningún usuario del personal: es la tableta de los pacientes.
> - Para cambiar de persona en la ventana de incógnito: su nombre (arriba a la derecha) → «Cerrar sesión» → confirmar, y entre con el usuario siguiente.

### Los usuarios

Todos tienen la misma contraseña: la de `DEV_SEED_PASSWORD` en su archivo `.env`. Si no la cambió, es:

```
Ficticia-dev-123
```

| Usuario | Clínica | Rol |
| --- | --- | --- |
| `recepcion.norte@example.test` | Norte (NOR1) | Recepción: Rosa Recepción |
| `propietario.norte@example.test` | Norte | Propietaria Norte (**necesita MFA**) |
| `enfermeria.norte@example.test` | Norte (NOR1) | Enfermería: Nora Enfermería |
| `proveedora.nor1@example.test` | Norte (NOR1) | Proveedora: Diana Doctora |
| `recepcion.sur@example.test` | Sur (SUR1) | Recepción: Raúl Recepción |

### El MFA de la Propietaria

La Propietaria es la única de este guion que necesita la verificación en dos pasos (MFA). `pnpm demo:reset` la deja **sin MFA**, así que la primera vez que entre (paso 3) se inscribirá de nuevo:
- **antes de empezar**, en su teléfono, borre las entradas «Clinic System» de demos anteriores: ya no sirven;
- al entrar, escanee el código QR con la aplicación del teléfono y escriba el código de 6 dígitos;
- después verá 10 **códigos de recuperación**. En esta demo basta con marcar «Guardé estos códigos»: son ficticios y desaparecen con `pnpm demo:reset`. En una clínica real se guardan en un lugar seguro fuera de la computadora;
- cuando vuelva a entrar más adelante (paso 15), le pedirá el código de 6 dígitos que muestra el teléfono en ese momento.

### Empiece el bloque A en cuanto arranque la aplicación

La demo trae pacientes que ya llevan un rato esperando, para que vea las marcas sin esperar:
- **«Alerta»** (ámbar, con un triángulo): más de 5 minutos esperando;
- **«Crítico»** (rojo, con un octógono): más de 10 minutos.

El tiempo corre desde que ejecuta `pnpm demo:reset`. Por eso, **haga el bloque A justo después de `pnpm dev`**. Si tarda más de unos 4 minutos, la marca «Alerta» de Tomás ya habrá pasado a «Crítico»: es lo correcto, no un error.

### Lo que ya trae la demo

- Lo de las fases anteriores: el catálogo con precios, los laboratorios, 20 pacientes ficticios por clínica y citas de ayer, hoy y los próximos días.
- **Visitas abiertas solo en NOR1 (Norte Centro) y SUR1 (Sur Centro).** NOR2 y SUR2 no tienen visitas: la demo no tiene Recepción ni Enfermería en esas sedes. **No es un error.**
- En NOR1, una visita en cada estado:

  | Paciente | Estado | Para qué |
  | --- | --- | --- |
  | Gabriela Jiménez Soto | Registrado, hace 12 min | «Crítico» |
  | Tomás Gutiérrez León | Esperando enfermería, hace 6 min | «Alerta» |
  | Ángel Domínguez Vega | Con enfermería, sin signos vitales | el bloqueo y la excepción |
  | Raúl Ortiz Fuentes | Esperando proveedor, hace 15 min | «Crítico» y «Sin alergias conocidas» |
  | Valentina Castillo Ríos | Con proveedor (Diana), con su cita de las 9:00 | alergias registradas |
  | Sofía Navarro Morales | Listo para caja, con su cita de las 8:30 | — |
  | Óscar Delgado Núñez | Procedimiento pendiente (Solo inyección) | — |

- Una tableta ya vinculada en NOR1 y otra en SUR1: «Tableta recepción (demo)».

**La búsqueda de pacientes no se hace sola:** después de escribir, pulse **Enter** o el botón «Buscar».

---

## Paso 0. Dejar la demo como recién instalada

1. **Haga:** si `pnpm dev` está abierto en la terminal, deténgalo con `Ctrl + C`.
2. **Haga:** escriba este comando y pulse Enter:
   ```
   pnpm demo:reset
   ```
3. **Debe ver:** un aviso de que se borrará la base de datos local. **Haga:** escriba `BORRAR` y pulse Enter.
4. **Debe ver:** «✔ Listo. Base de datos de demostración recién creada.» y la lista de 13 usuarios.
5. **Haga:** arranque la aplicación **enseguida**:
   ```
   pnpm dev
   ```
   **Debe ver:** después de unos segundos, una línea con `http://localhost:5173`.

> Si `pnpm demo:reset` dice que hay conexiones abiertas, es que `pnpm dev` sigue en marcha. Deténgalo y repita.

---

## Bloque A. El Panel, con «Alerta» y «Crítico»

### Paso 1. Las marcas de espera

**Ventana:** Chrome normal.

- **Usuario:** `recepcion.norte@example.test`
- **Haga:** abra http://localhost:5173 e inicie sesión.
- **Debe ver:** el **Panel** de «Norte Centro», con «En vivo» y la lista «Pacientes en la clínica».
- **Debe ver en la lista:**
  - **Gabriela Jiménez Soto**, «Registrado», con la marca roja **«Crítico»**;
  - **Tomás Gutiérrez León**, «Esperando enfermería», con la marca ámbar **«Alerta»**;
  - **Raúl Ortiz Fuentes**, «Esperando proveedor», con **«Crítico»**;
  - los demás de la tabla de «Antes de empezar», **sin marca**: «Con enfermería», «Con proveedor», «Listo para caja» y «Procedimiento pendiente» no son estados de espera.
- **Debe ver también:** cada marca tiene icono, texto y color (nunca solo color). La lista está ordenada por la espera más larga.

### Paso 2. Sacar a un paciente de «Crítico»

**Ventana:** Chrome normal (sigue Recepción).

- **Haga:** pulse la fila de **Gabriela Jiménez Soto**.
- **Debe ver:** su visita (código `NOR1-V-…`), «Registrado», la ruta «Estándar» y su cobertura: «Seguro Ficticio Verde», coaseguro **20 %**.
- **Haga:** pulse «Enviar a enfermería».
- **Debe ver:** «Visita movida a Esperando enfermería.».
- **Haga:** pulse «Panel» en el menú.
- **Debe ver:** Gabriela ahora dice «Esperando enfermería» y ya **no** tiene «Crítico»: la marca cuenta desde que entró en el estado actual.

---

## Bloque B. El kiosco de autorregistro

### Paso 3. La Propietaria entra con MFA y genera el código de la tableta

**Ventana:** Chrome incógnito.

- **Usuario:** `propietario.norte@example.test`
- **Haga:** abra http://localhost:5173 e inicie sesión.
- **Debe ver:** «Configurar la verificación en dos pasos», con un código QR.
- **Haga:**
  1. en la aplicación del teléfono, agregue una cuenta y escanee el QR. Aparece **«Clinic System»** con un código de 6 dígitos;
  2. escriba esos 6 dígitos en «Código de verificación» y pulse «Confirmar»;
  3. marque «Guardé estos códigos» y pulse «Continuar».
- **Debe ver:** **Administración › Usuarios**. Si le pide elegir sede, elija **NOR1**.
- **Haga:** pulse «Sedes» en el menú y baje hasta **«Kioscos de autorregistro»**.
- **Debe ver:** la sede **NOR1 · Norte Centro** y la tableta **«Tableta recepción (demo)»**, **Activo**: es la que trae la demo.
- **Haga:** pulse «Vincular kiosco», escriba el nombre `Tableta Edge` y pulse «Generar código».
- **Debe ver:** un código como `K7Q-4M2` y la dirección que termina en `/kiosk/NOR1`. El código **vence a los 10 minutos y sirve una sola vez**. Deje este diálogo abierto.

### Paso 4. Vincular la tableta

**Ventana:** Edge.

- **Haga:** abra http://localhost:5173/kiosk/NOR1
- **Debe ver:** «Vincular esta tableta».
- **Haga:** escriba el código del paso 3 en «Código de vinculación» y pulse «Vincular».
- **Debe ver:** el formulario **«Bienvenido»**: «Regístrese aquí y tome asiento. Le llamaremos por su nombre.». Los botones son grandes, para tocarlos con el dedo.

**Ventana:** Chrome incógnito (Propietaria).
- **Haga:** pulse «Listo» y después «Actualizar».
- **Debe ver:** **Tableta Edge**, **Activo**, con su «Último uso».

### Paso 5. Un paciente nuevo se registra en español

**Ventana:** Edge (la tableta).

- **Haga:** complete el formulario:
  - Nombre: `Rebeca`
  - Apellidos: `Salinas Ortiz`
  - Fecha de nacimiento: Mes **Abril**, Día `23`, Año `1991`
  - Teléfono celular: `2145550171`
  - ¿Es su primera vez en nuestra clínica?: **«Sí, primera vez»**
  - ¿Por qué viene hoy?: **«Me siento enfermo»**
  - Describa brevemente sus síntomas: `Dolor de garganta y fiebre desde ayer`
- **Haga:** pulse «Registrarme».
- **Debe ver:** **«¡Gracias!»** y «Tome asiento. Le llamaremos por su nombre.». La tableta **no muestra el nombre** del paciente.

**Ventana:** Chrome normal (Recepción), sin tocar nada.
- **Debe ver:** en el Panel, en menos de 2 segundos, la bandeja **«Llegadas del kiosco»** con **Rebeca Salinas Ortiz**: «Primera vez», el motivo «Me siento enfermo» con su icono y «Dolor de garganta y fiebre desde ayer». El teléfono aparece tapado: `(***) ***-0171`.
- **Debe oír:** un aviso sonoro. Si no suena, haga clic una vez en cualquier parte de la ventana de Recepción (el navegador no deja sonar una página que aún no se ha tocado) y repita con el paso 6. El botón «Silenciar» lo apaga en esa ventana.

> **Edge:** pulse «Registrar a otra persona» para dejar el formulario vacío. Si no toca nada, a los 60 segundos el formulario se borra solo.

### Paso 6. Recepción confirma a la paciente nueva («Primera vez»)

**Ventana:** Chrome normal (Recepción).

- **Haga:** en la bandeja, pulse «Confirmar llegada» de Rebeca Salinas Ortiz.
- **Debe ver:** los datos del kiosco y «Dice que es su primera vez: cree el paciente…».
- **Haga:** pulse «Crear paciente nuevo».
- **Debe ver:** el diálogo «Nuevo paciente» **ya relleno** con Rebeca, Salinas Ortiz, 23 abril 1991 y su teléfono. **Haga:** pulse «Crear».
- **Debe ver:** el asistente de llegada. **Haga:**
  1. marque «Verifiqué la identidad del paciente» y pulse «Continuar»;
  2. marque «Confirmar esta sede» y pulse «Continuar»;
  3. en **Ruta**: **ninguna viene marcada**, y el motivo del paciente está a la vista. Pulse «Continuar» sin elegir.
- **Debe ver:** «Elija una ruta de atención.». En el kiosco la ruta la decide siempre Recepción, nunca el motivo que escribió el paciente.
- **Haga:** elija **Estándar** y pulse «Continuar». En **Cobertura** deje **Pago directo** y pulse «Continuar». Pulse «Iniciar visita sin cita».
- **Debe ver:** **«Llegada registrada»** con el código de la visita. **Haga:** pulse «Abrir visita».
- **Debe ver:** la visita en «Registrado» y la tarjeta **«Motivo declarado por el paciente (kiosco)»** con «Dolor de garganta y fiebre desde ayer».
- **Haga:** pulse «Enviar a enfermería».
- **Debe ver:** «Visita movida a Esperando enfermería.».

### Paso 7. Una paciente con cita se registra en inglés («Ya soy paciente»)

**Ventana:** Edge (la tableta).

- **Haga:** pulse el botón **«English»**.
- **Debe ver:** todo el formulario en inglés: **«Welcome»**.
- **Haga:** complete:
  - First name: `Paula`
  - Last name: `Romero Aguilar`
  - Date of birth: Month **September**, Day `9`, Year `1991`
  - Mobile phone: `2145550119`
  - Is this your first visit to our clinic?: **«No, I am a patient»**
  - Why are you here today?: **«I am here for results»**
- **Haga:** pulse «Check in».
- **Debe ver:** **«Thank you!»**. Unos segundos después, la tableta vuelve sola al formulario **en español**: el idioma no se guarda.

**Ventana:** Chrome normal (Recepción).
- **Haga:** pulse «Panel».
- **Debe ver:** en «Llegadas del kiosco», **Paula Romero Aguilar**, «Ya es paciente», motivo **«Vengo por resultados»**: Recepción lo ve siempre en español.
- **Haga:** pulse «Confirmar llegada» de Paula.
- **Debe ver:** «Dice que ya es paciente: elija el registro que corresponde…» y, en «Coincidencias», **Paula Romero Aguilar** con su código, «9 sept 1991», su teléfono «(214) 555-0119» y los datos en los que coincide.
- **Haga:** pulse «Es este paciente».
- **Debe ver:** el asistente de llegada con el aviso **«Tiene cita hoy (NOR1-A-…): al confirmar, la cita pasa a «Llegó».»**: es su cita de hoy a las 11:30 a. m.
- **Haga:** marque «Verifiqué la identidad del paciente» → «Continuar» → «Confirmar esta sede» → «Continuar». En **Ruta**, elija **Estándar** → «Continuar». **Pago directo** → «Continuar». Pulse «Registrar llegada».
- **Debe ver:** «Llegada registrada».
- **Haga:** pulse «Citas» en el menú.
- **Debe ver:** la cita de Paula de las 11:30 a. m. dice **Llegó**.

### Paso 8. Descartar un envío de prueba

**Ventana:** Edge (la tableta).

- **Haga:** complete un registro de prueba en español:
  - Nombre `Prueba`, Apellidos `Tableta Edge`
  - Mes **Enero**, Día `1`, Año `1990`
  - Teléfono `2145550172`
  - **«No, ya soy paciente»** y **«Otro motivo»**
- **Haga:** pulse «Registrarme».

**Ventana:** Chrome normal (Recepción).
- **Haga:** en el Panel, en la fila de **Prueba Tableta Edge**, pulse «Descartar…».
- **Debe ver:** «¿Descartar este registro del kiosco?», con un motivo obligatorio.
- **Haga:** escriba `Envío de prueba de la tableta` y pulse «Descartar».
- **Debe ver:** «Registro descartado.» y la bandeja ya no lo tiene. Nada se convierte en visita.

### Paso 9. Revocar la tableta

**Ventana:** Chrome incógnito (Propietaria, en Sedes › Kioscos de autorregistro).

- **Haga:** en la fila de **Tableta Edge**, pulse «Revocar». Escriba el motivo `Fin de la demo del kiosco` y pulse «Revocar».
- **Debe ver:** «Kiosco revocado.» y **Tableta Edge**, **Revocado**. «Tableta recepción (demo)» sigue **Activo**.

**Ventana:** Edge.
- **Haga:** recargue la página (`F5`).
- **Debe ver:** otra vez «Vincular esta tableta». La tableta revocada deja de funcionar al instante; para usarla de nuevo haría falta un código nuevo.

**Ventana:** Chrome incógnito.
- **Haga:** cierre la sesión de la Propietaria.

---

## Bloque C. Llegadas con cita y sin cita

### Paso 10. Llegada con cita

**Ventana:** Chrome normal (Recepción).

- **Haga:** en «Citas» (hoy), pulse la cita de **Isabel Moreno Cruz** de las **10:00 a. m.**, **Confirmada**.
- **Haga:** pulse «Registrar llegada».
- **Debe ver:** «Registro de llegada», paso 1 de 5, con Isabel Moreno Cruz.
- **Haga:** marque «Verifiqué la identidad del paciente» → «Continuar» → «Confirmar esta sede» → «Continuar».
- **Debe ver:** en **Ruta**, **Estándar** ya marcada: «Sugerida por el tipo de cita (Consulta general). Puede cambiarla.».
- **Haga:** «Continuar». En **Cobertura** elija **Seguro** → «Continuar». Complete:
  - Nombre del seguro: `aseguradora ficticia del norte` (al salir del campo se escribe con mayúsculas iniciales);
  - ID de miembro: `FIC-000115`;
  - **Copago**: `20`.
- **Haga:** «Continuar» y, en «Revisar y confirmar», pulse «Registrar llegada».
- **Debe ver:** «Llegada registrada», y en «Citas» la cita de Isabel dice **Llegó**.

### Paso 11. Llegada sin cita

**Ventana:** Chrome normal (Recepción).

- **Haga:** en «Citas», pulse «Sin cita» y después «Elegir paciente». Busque `lucia hernandez` y pulse Enter. Pulse **Lucía Hernández Díaz**.
- **Haga:** marque «Verifiqué la identidad del paciente» → «Continuar» → «Confirmar esta sede» → «Continuar». Deje «Tipo de cita» vacío y la ruta **Estándar** → «Continuar». **Pago directo** → «Continuar». Pulse «Iniciar visita sin cita».
- **Debe ver:** «Llegada registrada».
- **Haga:** pulse «Panel».
- **Debe ver:** Isabel Moreno Cruz, Lucía Hernández Díaz, Rebeca Salinas Ortiz y Paula Romero Aguilar en la lista, todas recién llegadas y sin marca de espera.

---

## Bloque D. Enfermería

### Paso 12. La cola de enfermería y las alergias en sus tres estados

**Ventana:** Chrome incógnito.

- **Usuario:** `enfermeria.norte@example.test`
- **Haga:** inicie sesión y pulse «Cola de enfermería».
- **Debe ver:** Rebeca Salinas Ortiz, Gabriela Jiménez Soto y Tomás Gutiérrez León en «Esperando enfermería» (Tomás con «Alerta» o «Crítico»), Ángel Domínguez Vega «Con enfermería» y Óscar Delgado Núñez como «Procedimiento pendiente».
- **Haga:** pulse «Abrir» en **Ángel Domínguez Vega**.
- **Debe ver:** arriba, en ámbar, **«Alergias no registradas»** (nadie lo ha preguntado todavía).
- **Haga:** pulse «Panel». El Panel de Enfermería empieza filtrado en «Enfermería»: pulse el filtro **«Todos los abiertos»** y abra la visita de **Raúl Ortiz Fuentes** (Esperando proveedor).
- **Debe ver:** en verde, **«Sin alergias conocidas»** (se preguntó, y no tiene).
- **Haga:** vuelva al Panel («Todos los abiertos») y abra la visita de **Valentina Castillo Ríos** (Con proveedor).
- **Debe ver:** en rojo, **«Alergias: Penicilina (ficticia).»** (tiene alergias registradas).

### Paso 13. Sin peso ni presión no se envía al proveedor

**Ventana:** Chrome incógnito (Enfermería).

- **Haga:** vuelva al Panel («Todos los abiertos»), abra la visita de **Ángel Domínguez Vega** y pulse «Enviar al proveedor».
- **Debe ver:** el diálogo **«Sin signos vitales»**: «Se requiere peso o presión arterial antes de enviar al proveedor.», con «Ir a signos vitales». Enfermería **no** tiene la opción de enviarlo con excepción.
- **Haga:** pulse «Cancelar». Ángel sigue «Con enfermería».

### Paso 14. Enfermería atiende a Rebeca y la envía al proveedor

**Ventana:** Chrome incógnito (Enfermería).

- **Haga:** en «Cola de enfermería», pulse «Iniciar» en **Rebeca Salinas Ortiz**.
- **Debe ver:** «Enfermería iniciada.», la visita «Con enfermería» y «Alergias no registradas».
- **Haga:** en **Signos vitales** escriba:
  - Peso (lb): `152`
  - Estatura: `5` pies y `6` pulgadas
  - Sistólica `120` y Diastólica `80`
- **Debe ver:** «IMC: 24.5» como vista previa (el valor definitivo lo calcula el servidor).
- **Haga:** pulse «Guardar signos vitales».
- **Debe ver:** «Signos vitales guardados.».
- **Haga:** en **Valoración**, abra «Alergias» y escriba `Sulfas (ficticia)`. Pulse «Guardar valoración».
- **Debe ver:** «Valoración guardada.» y arriba, en rojo, **«Alergias: Sulfas (ficticia)»**.
- **Haga:** pulse «Enviar al proveedor» y confírmelo.
- **Debe ver:** «Enviado al proveedor.» y la cola de enfermería, ya sin Rebeca.
- **Haga:** cierre la sesión de Enfermería.

### Paso 15. La Propietaria se asigna un rol clínico, con motivo

**Ventana:** Chrome incógnito.

- **Usuario:** `propietario.norte@example.test`
- **Haga:** inicie sesión y escriba el código de 6 dígitos que muestra ahora el teléfono.
- **Debe ver:** Administración › Usuarios. En el menú **no** está «Pacientes»: sin rol clínico, la Propietaria no ve datos de pacientes.
- **Haga:** en su propia fila (propietario.norte), pulse «⋮» (Más acciones) → «Mis roles clínicos». Marque **Recepción en NOR1** y pulse «Guardar».
- **Debe ver:** «Se requiere un motivo.».
- **Haga:** en «Motivo del cambio» escriba `Supervisa la demo de enfermería` y pulse «Guardar».
- **Debe ver:** su fila dice **Recepción**, y en el menú aparecen «Panel», «Pacientes» y «Citas». El cambio queda auditado.

### Paso 16. La excepción: enviar al proveedor sin signos vitales

**Ventana:** Chrome incógnito (Propietaria, ahora con Recepción en NOR1).

- **Haga:** pulse «Panel», pulse el filtro «Todos los abiertos» si no está marcado, y abra la visita de **Ángel Domínguez Vega**.
- **Debe ver:** el botón **«Enviar con excepción…»**. La Propietaria no ve los valores clínicos, solo si se registraron.
- **Haga:** púlselo.
- **Debe ver:** «Enviar con excepción»: «Sin peso ni presión arterial guardados. El envío queda en el historial de la visita como excepción, con su motivo.».
- **Haga:** pulse «Enviar al proveedor» sin escribir motivo.
- **Debe ver:** «Se requiere un motivo.».
- **Haga:** escriba `Báscula averiada; el paciente no puede esperar` y pulse «Enviar al proveedor».
- **Debe ver:** «Enviado al proveedor.» y la visita en **«Esperando proveedor»**.
- **Haga:** abra la pestaña «Historial».
- **Debe ver:** el envío con el chip **«Excepción»** y su motivo.
- **Haga:** cierre la sesión de la Propietaria.

---

## Bloque E. El Proveedor

### Paso 17. «Paciente asignado a usted»

**Ventana:** Chrome incógnito.

- **Usuario:** `proveedora.nor1@example.test`
- **Haga:** inicie sesión y pulse «Cola de proveedor», después el filtro **«Sin asignar»**.
- **Debe ver:** Rebeca Salinas Ortiz, Raúl Ortiz Fuentes y Ángel Domínguez Vega, «Esperando proveedor», cada una con su aviso de alergias:
  - Rebeca: **«Alergias: Sulfas (ficticia)»**;
  - Raúl: **«Sin alergias conocidas»**;
  - Ángel: **«Alergias no registradas»**.

**Ventana:** Chrome normal (Recepción).
- **Haga:** abra la visita de **Rebeca Salinas Ortiz** (desde el Panel). Pulse «Asignar proveedor» y elija **Diana Doctora (ficticia)**.
- **Debe ver:** «Proveedor actualizado.».

**Ventana:** Chrome incógnito (Diana), sin tocar nada.
- **Debe ver:** en pocos segundos, la campana con un número rojo.
- **Haga:** pulse la campana.
- **Debe ver:** **«Paciente asignado a usted»**, con «Visita NOR1-V-…». El aviso **no lleva el nombre** del paciente.
- **Haga:** pulse el aviso.
- **Debe ver:** la visita de Rebeca, con el proveedor **«Usted»**.

### Paso 18. La consulta y «Listo para caja»

**Ventana:** Chrome incógnito (Diana).

- **Haga:** pulse «Iniciar consulta».
- **Debe ver:** «Visita movida a Con proveedor.».
- **Debe ver también:** los signos vitales de Enfermería (152 lb, 120/80 mmHg) y la valoración, que la proveedora puede leer pero no editar.
- **Haga:** pulse «Listo para caja».
- **Debe ver:** «Visita movida a Listo para caja.». (La Caja llega en la fase 3B.)

---

## Bloque F. Cerrar una visita y la visita siguiente

### Paso 19. Cerrar con motivo y ver el historial

**Ventana:** Chrome normal (Recepción).

- **Haga:** abra la visita de **Rebeca Salinas Ortiz** y pulse «Cerrar visita…».
- **Debe ver:** el diálogo «Cerrar visita», con «Se retiró antes» marcado.
- **Haga:** pulse «Cerrar visita» sin escribir nada.
- **Debe ver:** «Se requiere un motivo.».
- **Haga:** escriba `Se fue antes de pasar a Caja` y pulse «Cerrar visita».
- **Debe ver:** «Visita cerrada: el paciente se retiró.» y el aviso «Esta visita está cerrada.» con el motivo.
- **Haga:** pulse la pestaña «Historial».
- **Debe ver:** 7 filas, de la más reciente a la más antigua: «Se retiró» (con el motivo), «Listo para caja», «Con proveedor», «Esperando proveedor», «Con enfermería», «Esperando enfermería» y «Registrado». Cada una con quién lo hizo y a qué hora.

### Paso 20. Las alergias aparecen solas en la visita siguiente

**Ventana:** Chrome normal (Recepción).

- **Haga:** registre una visita **sin cita** para **Rebeca Salinas Ortiz**, como en el paso 11 (ruta Estándar, Pago directo). Abra la visita y pulse «Enviar a enfermería».
- **Debe ver:** Recepción **no** ve el aviso de alergias: es un dato clínico.

**Ventana:** Chrome incógnito.
- **Haga:** cierre la sesión de Diana y entre como `enfermeria.norte@example.test`. En «Cola de enfermería», pulse «Abrir» en Rebeca Salinas Ortiz.
- **Debe ver:** en rojo, **«Alergias: Sulfas (ficticia)»**, sin que nadie las haya escrito en esta visita: las alergias son del paciente, no de la visita.
- **Haga:** cierre la sesión de Enfermería.

---

## Bloque G. Sur no ve nada de Norte

### Paso 21. Aislamiento entre clínicas

**Ventana:** Chrome incógnito.

- **Usuario:** `recepcion.sur@example.test`
- **Haga:** inicie sesión.
- **Debe ver:** el Panel de **Sur Centro** con sus propios pacientes (Camila Álvarez Ponce, Jorge Mendoza Ibarra, Emilio Cabrera Solís y Ramón Acosta Lara). **Ninguno de Norte.**
- **Debe ver también:** en «Llegadas del kiosco», ningún registro: los de la tableta de Norte no llegan a Sur.
- **Haga:** pulse «Pacientes» y busque `rebeca salinas`.
- **Debe ver:** «No se encontraron pacientes».
- **Haga:** en la barra de direcciones, escriba `localhost:5173/app/NOR1/panel` y pulse Enter.
- **Debe ver:** «Página no encontrada». Sur no puede entrar en una sede de Norte.

**Fin del guion.** Si llegó hasta aquí viendo lo que dice cada paso, la fase 3A funciona en su computadora.

---

## Si algo no sale como dice el guion

- **«No se pudo conectar con el servidor»:** `pnpm dev` no está en marcha. Arránquelo y espere a ver `http://localhost:5173`.
- **No ve «Alerta» en Tomás, sino «Crítico»:** pasaron más de 4 minutos desde `pnpm demo:reset`. Es lo correcto. Para verlo de nuevo, vuelva al paso 0.
- **No ve ninguna marca:** pasó mucho tiempo y los pacientes ya avanzaron o se volvió a sembrar otro día. Vuelva al paso 0.
- **El registro del kiosco no suena:** haga clic una vez en la ventana de Recepción y compruebe que no pulsó «Silenciar». La bandeja se actualiza igual aunque no suene.
- **La tableta dice que el código no es válido:** el código vence a los 10 minutos y sirve una sola vez. En Sedes, pulse «Generar nuevo código».
- **«Sin conexión» o «Reconectando…» en lugar de «En vivo»:** la aplicación sigue funcionando y se actualiza sola cada 30 segundos. Si no se resuelve, detenga `pnpm dev` (`Ctrl + C`) y vuelva a arrancarlo.
- **El aviso de la campana no llega:** espere unos segundos; los avisos los entrega el worker, que arranca con `pnpm dev`.
- **El código del teléfono no funciona:** compruebe que usa la entrada «Clinic System» recién creada y que la hora del teléfono es automática.
- **NOR2 o SUR2 no tienen visitas:** es lo esperado (ver «Antes de empezar»).
- **Quiere empezar de nuevo:** detenga `pnpm dev` y vuelva al paso 0.
