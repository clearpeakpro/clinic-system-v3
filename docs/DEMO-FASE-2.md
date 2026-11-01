# Demo de la fase 2: guion para probar en su computadora

Con este guion usted comprueba, en su navegador y sin ayuda, lo que construyó la fase 2:
- el catálogo, con el precio general y el precio propio de una sede;
- los laboratorios y lo que cuesta cada prueba;
- la búsqueda de pacientes, los posibles duplicados y el teléfono compartido;
- la edición de un paciente cuando otra persona lo cambió antes;
- la excepción del Propietario;
- la agenda, con sus acciones y los avisos en vivo.

Todo usa **datos ficticios** de dos clínicas inventadas: «Clínica Demo Norte» y «Clínica Demo Sur».

Cada paso dice:
- **Ventana:** en qué ventana de Chrome se hace;
- **Usuario:** con quién entrar;
- **Haga:** qué hacer;
- **Debe ver:** el resultado esperado. Si ve otra cosa, anote el número del paso y lo que vio.

Tiempo aproximado: 40 minutos.

---

## Antes de empezar

**Necesita:**
- Docker Desktop abierto (el icono de la ballena, quieto).
- Una terminal abierta en la carpeta del proyecto (`clinic-system-v3`).
- Google Chrome.
- Su teléfono con una aplicación de autenticación gratuita, por ejemplo **Google Authenticator** o **Microsoft Authenticator**. Si no la tiene, instálela desde la tienda de aplicaciones del teléfono.

**El MFA (verificación en dos pasos).** En el bloque A, la **Propietaria Norte** se inscribirá en el MFA:
- la aplicación muestra un código QR y usted lo escanea con el teléfono;
- después verá 10 **códigos de recuperación**. En esta demo basta con marcar «Guardé estos códigos»: son ficticios y desaparecen con `pnpm demo:reset`;
- en una clínica real, esos códigos se guardan en un lugar seguro fuera de la computadora (por ejemplo, impresos en un cajón con llave), porque sirven para entrar si se pierde el teléfono.

Los demás usuarios de este guion no necesitan MFA.

**La contraseña de todos los usuarios de prueba** es la que figura en `DEV_SEED_PASSWORD` de su archivo `.env`. Si no la cambió, es:

```
Ficticia-dev-123
```

**Dos ventanas a la vez.** Varios pasos usan dos personas distintas al mismo tiempo:
- una **ventana normal** de Chrome;
- una **ventana de incógnito**: menú ⋮ → «Nueva ventana de incógnito», o `Ctrl + Mayús + N`.

> Todas las ventanas de incógnito comparten la misma sesión entre sí. Use **una sola** ventana de incógnito y **una sola** ventana normal. Póngalas una al lado de la otra.

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
5. **Haga:** arranque la aplicación:
   ```
   pnpm dev
   ```
   **Debe ver:** después de unos segundos, una línea con `http://localhost:5173`.
6. **Haga:** en su teléfono, si tiene entradas «Clinic System» de demos anteriores, bórrelas. Ya no sirven.
7. **Haga:** abra http://localhost:5173 en la ventana normal de Chrome.
   **Debe ver:** la pantalla «Iniciar sesión».

> Si `pnpm demo:reset` dice que hay conexiones abiertas, es que `pnpm dev` sigue en marcha. Deténgalo y repita.

**Los usuarios de este guion** (todos con la misma contraseña):

| Usuario | Clínica | Rol |
| --- | --- | --- |
| `propietario.norte@example.test` | Norte | Propietaria (necesita MFA) |
| `recepcion.norte@example.test` | Norte (NOR1) | Recepción: Rosa Recepción |
| `proveedora.nor1@example.test` | Norte (NOR1) | Proveedora: Diana Doctora |
| `recepcion.sur@example.test` | Sur (SUR1) | Recepción: Raúl Recepción |

**Lo que ya trae la demo:** el catálogo de cada clínica con sus precios, tres laboratorios (LabCorp, Quest Diagnostics y CPL) con sus costos, 20 pacientes ficticios por clínica y citas de ayer, hoy y los próximos días.

---

## Bloque A. La Propietaria configura la clínica

### Paso 1. Entrar y activar el MFA

**Ventana:** normal.

- **Usuario:** `propietario.norte@example.test`
- **Haga:** inicie sesión.
- **Debe ver:** «Configurar la verificación en dos pasos», con un código QR.
- **Haga:**
  1. en la aplicación de autenticación de su teléfono, agregue una cuenta y escanee el código QR. Aparece **«Clinic System»** con un código de 6 dígitos;
  2. escriba esos 6 dígitos en «Código de verificación» y pulse «Confirmar»;
  3. en «Guarde sus códigos de recuperación», marque «Guardé estos códigos» y pulse «Continuar».
- **Debe ver:** **Administración › Usuarios** de NOR1. Si le pide elegir sede, elija **NOR1**.
- **Debe ver también:** en el menú de la izquierda **no** están «Pacientes» ni «Citas». La Propietaria no tiene rol clínico, así que no ve datos de pacientes.

### Paso 2. Un procedimiento nuevo con precio general y precio propio en una sede

**Ventana:** normal (sigue la Propietaria).

- **Haga:** en el menú, pulse «Catálogos» y después la pestaña «Procedimientos».
- **Debe ver:**
  - la columna «Precio en NOR1»;
  - en «Inyección de vitamina B12»: **$20.00** y «Usa el precio general».
- **Haga:** pulse «Nuevo procedimiento» y complete:
  - Código: `INJ-DEMO`
  - Nombre: `Inyección de demostración`
  - Precio general: `25`
- **Haga:** pulse «Crear».
- **Debe ver:** «Guardado.» y la fila **INJ-DEMO** con **$25.00** y «Usa el precio general».
- **Haga:** arriba, en «Sede de los precios», elija **NOR2 · Norte Oeste**.
- **Debe ver:** la columna cambia a «Precio en NOR2». La B12 cuesta **$22.00** en NOR2: esa sede tiene precio propio.
- **Haga:** en la fila INJ-DEMO, pulse el lápiz («Editar»). En «Precio en Norte Oeste» escriba `27` y pulse «Guardar».
- **Debe ver:** INJ-DEMO cuesta **$27.00** en NOR2 y ya no dice «Usa el precio general».

### Paso 3. Un cambio de precio desde mañana

**Ventana:** normal (sigue la Propietaria).

- **Haga:** en «Sede de los precios», vuelva a **NOR1 · Norte Centro**.
- **Haga:** en la fila INJ-DEMO, pulse el lápiz («Editar»). En la sección «Precio general»:
  - Precio general (opcional): `30`
  - Vigente desde: la fecha de **mañana**.
- **Haga:** pulse «Guardar».
- **Debe ver:** en INJ-DEMO, hoy sigue **$25.00** y debajo «Desde {mañana}: $30.00». El precio nuevo queda programado y el anterior no se borra.
- **Haga:** elija otra vez **NOR2 · Norte Oeste**. En la fila INJ-DEMO, pulse el botón «Volver al precio general» (la flecha que regresa). Deje la fecha de hoy y pulse «Volver al precio general».
- **Debe ver:** INJ-DEMO, en NOR2, vuelve a **$25.00** con «Usa el precio general».

### Paso 4. Laboratorios y costos

**Ventana:** normal (sigue la Propietaria).

- **Haga:** pulse la pestaña «Proveedores de laboratorio».
- **Debe ver:** LabCorp, Quest Diagnostics y CPL, los tres **Activo**, con su orden de preferencia (1, 2 y 3).
- **Haga:** pulse «Nuevo laboratorio», escriba Nombre `Laboratorio Demo Norte` y Orden de preferencia `4`. Pulse «Crear».
- **Debe ver:** «Guardado.» y el laboratorio nuevo, **Activo**.
- **Haga:** pulse la pestaña «Pruebas de laboratorio».
- **Debe ver:** «Prueba rápida de estreptococo» dice **«Sin laboratorio asignado»**.
- **Haga:** pulse su lápiz («Editar»). En «Laboratorios que la realizan», marque **Laboratorio Demo Norte** y escriba `8` en «Costo para la clínica». Pulse «Guardar».
- **Debe ver:** la prueba ya no dice «Sin laboratorio asignado».
- **Haga:** abra el lápiz de **Hemoglobina A1c**.
- **Debe ver:** LabCorp, Quest Diagnostics y CPL marcados, cada uno con su costo (CPL es el más barato: 9.00). Estos costos solo los ven la Propietaria y la Administración; Enfermería y Proveedores nunca los ven. Pulse «Cancelar».

### Paso 5. La excepción del Propietario: asignarse Recepción

**Ventana:** normal (sigue la Propietaria).

- **Haga:** en el menú, pulse «Usuarios». En su propia fila (propietario.norte), pulse «⋮» (Más acciones) → «Mis roles clínicos».
- **Debe ver:** el diálogo «Mis roles clínicos», con Recepción, Enfermería y Proveedor por sede. **No** ofrece Administrador.
- **Haga:** marque **Recepción en NOR1** y pulse «Guardar».
- **Debe ver:** «Se requiere un motivo.». Asignarse un rol siempre lleva motivo.
- **Haga:** en «Motivo del cambio» escriba `Cubre la recepción esta semana` y pulse «Guardar».
- **Debe ver:** su fila dice **Recepción**, y en el menú ya aparecen **«Pacientes»** y **«Citas»**. El cambio queda auditado y la Administradora recibe un aviso.

### Paso 6. Corregir una fecha de nacimiento

**Ventana:** normal (sigue la Propietaria, ahora con Recepción).

- **Haga:** pulse «Pacientes», escriba `paula romero` y pulse Enter. En el resultado, pulse «Ver perfil».
- **Debe ver:** el perfil de **Paula Romero Aguilar**, nacida el **9 sept 1991**.
- **Haga:** pulse «Editar». Cambie la «Fecha de nacimiento» a **09/19/1991** y pulse «Guardar».
- **Debe ver:** «Se requiere un motivo.».
- **Haga:** en «Motivo del cambio de fecha» escriba `Error de captura en el alta` y pulse «Guardar».
- **Debe ver:** «Paciente actualizado.» y la fecha **19 sept 1991** en el encabezado.
- **Haga:** cierre la sesión de la Propietaria (su nombre → «Cerrar sesión» → confirmar).

---

## Bloque B. Recepción busca y da de alta pacientes

### Paso 7. Buscar pacientes, con y sin tildes

**Ventana:** normal.

- **Usuario:** `recepcion.norte@example.test`
- **Haga:** inicie sesión y pulse «Pacientes» en el menú.
- **Haga:** en «Buscar paciente», escriba cada uno de estos textos y pulse Enter después de cada uno:
  1. `maria lop`
  2. `MARÍA`
  3. `Lopez`
- **Debe ver:** las tres veces aparece **María López García**. No importan las tildes ni las mayúsculas.
- **Haga:** busque `02031985` (la fecha de nacimiento como MMDDAAAA: mes, día y año, sin barras).
- **Debe ver:** **dos** resultados nacidos el 3 feb 1985: **María López García** y **Maria Lopez**. Son un posible duplicado de la semilla.
- **Haga:** busque `02301985`.
- **Debe ver:** «Fecha no válida (use MMDDAAAA)». El 30 de febrero no existe.
- **Haga:** busque el teléfono `8175550105`.
- **Debe ver:** **Lucía Hernández Díaz** y **Mateo Hernández Díaz**: madre e hijo con el mismo teléfono.

### Paso 8. La búsqueda de la cabecera

**Ventana:** normal (sigue Recepción).

- **Haga:** arriba, en la cabecera, pulse el campo «Buscar pacientes» (con la lupa), escriba `valentina` y pulse Enter.
- **Debe ver:** un panel debajo del campo con **Valentina Castillo Ríos**, su código, su fecha de nacimiento y su edad, y al final «Ver todos los resultados».
- **Haga:** pulse a Valentina.
- **Debe ver:** su perfil, y el campo de la cabecera vacío otra vez.
- **Haga:** en la cabecera, escriba el código `P-000002` y pulse Enter.
- **Debe ver:** se abre directamente el perfil de **José Ramírez Santos**. Así funciona también un código escaneado.

### Paso 9. Un posible duplicado

**Ventana:** normal (sigue Recepción).

- **Haga:** pulse «Pacientes» y después «Crear paciente». Complete:
  - Nombre: `Maria`
  - Apellido: `Lopez Garcia`
  - Fecha de nacimiento: `02/03/1985`
- **Haga:** pulse «Crear».
- **Debe ver:** el aviso **«Posible paciente existente»** con **María López García** («3 feb 1985 · Expediente P-…»), y los botones «Abrir existente» y «Crear de todos modos».
- **Haga:** pulse «Abrir existente».
- **Debe ver:** el perfil de María López García. No se creó ningún paciente nuevo.

### Paso 10. Un teléfono compartido

**Ventana:** normal (sigue Recepción).

- **Haga:** pulse «Volver a Pacientes» y después «Crear paciente». Complete:
  - Nombre: `Sofía`
  - Apellido: `Hernández Díaz`
  - Fecha de nacimiento: `07/07/2015`
  - Teléfono de contacto: `8175550105`
- **Haga:** pulse «Crear».
- **Debe ver:** el diálogo **«Este teléfono ya está registrado en otro paciente»**, con Lucía y Mateo Hernández Díaz.
- **Haga:** pulse «Volver y corregir».
- **Debe ver:** el formulario con todos sus datos intactos y el cursor en el teléfono.
- **Haga:** es el teléfono de la familia, así que no lo cambie. Pulse «Crear» otra vez y, en el diálogo, «Crear de todos modos».
- **Debe ver:** «Paciente creado.» y el perfil de **Sofía Hernández Díaz**.

---

## Bloque C. Dos personas editan al mismo paciente

### Paso 11. El conflicto de versión

**Ventanas:** normal (Recepción) e incógnito, una al lado de la otra.

**Ventana de incógnito:**
- **Usuario:** `proveedora.nor1@example.test`
- **Haga:** inicie sesión, pulse «Pacientes», busque `hector medina` y abra el perfil de **Héctor Medina Salas**. Pulse «Editar».
- **Debe ver:** «Su rol solo puede actualizar el teléfono.». La Proveedora solo cambia el teléfono.

**Ventana normal (Recepción):**
- **Haga:** abra también el perfil de Héctor Medina Salas y pulse «Editar».
- **Debe ver:** la «Fecha de nacimiento» está **bloqueada**: Recepción no puede cambiarla.
- **Haga:** cambie el teléfono a `2145550163` y pulse «Guardar».
- **Debe ver:** «Paciente actualizado.» y el teléfono **(214) 555-0163**.

**Ventana de incógnito (Diana), con el formulario que dejó abierto:**
- **Haga:** cambie el teléfono a `2145550164` y pulse «Guardar».
- **Debe ver:** **«Actualizado por otro usuario»**: «Otro usuario actualizó este paciente. Actualice el registro para continuar.». El único botón es **«Actualizar»**: nunca se ofrece «guardar igualmente».
- **Haga:** pulse «Actualizar».
- **Debe ver:** el perfil con el teléfono que guardó Recepción, **(214) 555-0163**.

---

## Bloque D. La agenda, sus acciones y los avisos en vivo

### Paso 12. Una cita nueva llega sola a la proveedora

**Ventanas:** normal (Recepción) e incógnito (Diana), una al lado de la otra.

**Ventana de incógnito (Diana):**
- **Haga:** pulse «Panel» en el menú.
- **Debe ver:** debajo del título, «Norte Centro · **7 citas hoy**».

**Ventana normal (Recepción):**
- **Haga:** en el perfil de Héctor Medina Salas, pulse **«Nueva cita»**. Complete:
  - Tipo de cita: **Consulta general** (la duración se pone sola: 20 minutos);
  - Fecha: hoy (ya viene puesta);
  - Hora: **la próxima hora en punto**. Por ejemplo, si son las 3:20 p. m., elija 4:00 p. m. Si ya pasó de las 11:00 p. m., elija 11:30 p. m.;
  - Proveedor: **Diana Doctora (ficticia)**.
- **Haga:** pulse «Crear cita».
- **Debe ver:** «Cita A-… creada.».

> Si a esa hora Diana ya tiene otra cita, antes de guardar verá un aviso ámbar de solapamiento. Es normal y no impide guardar: lo verá con calma en el paso 14.

**Ventana de incógnito (Diana), sin tocar nada:**
- **Debe ver:** en pocos segundos:
  - «Norte Centro · **8 citas hoy**»;
  - la campana con un número rojo.
- **Haga:** pulse la campana.
- **Debe ver:** **«Cita asignada a usted»**, con «Cita NOR1-A-… · {hoy}, {la hora}». El aviso no lleva el nombre del paciente.
- **Haga:** pulse el aviso.
- **Debe ver:** se abre «Citas» en el día de hoy, con el detalle de la cita de **Héctor Medina Salas**, **Programada**. Pulse «Cerrar».

### Paso 13. Confirmar la cita

**Ventana:** normal (Recepción).

- **Haga:** pulse «Citas» en el menú y pulse la tarjeta de Héctor Medina Salas.
- **Debe ver:** el detalle de la cita y el botón **«Registrar llegada»** (habilitado desde la fase 3, T-017; no lo pulse en esta demo).
- **Haga:** pulse «Confirmar».
- **Debe ver:** «Cita confirmada.» y el estado **Confirmada** (azul, con su icono).
- **Debe ver en la ventana de incógnito (Diana), sin tocar nada:** la tarjeta de Héctor también dice **Confirmada**, y la campana suma un aviso, «Cita actualizada».

### Paso 14. Reprogramar encima de otra cita: el aviso de solapamiento

**Ventana:** normal (Recepción), con el detalle de la cita de Héctor abierto.

- **Haga:** pulse «Reprogramar». Cambie la Fecha a **mañana** y la Hora a **9:00 a. m.**
- **Debe ver:** antes de guardar, un aviso ámbar: «Diana Doctora (ficticia) ya tiene una cita que se solapa a las 9:00 a. m.». Es solo un aviso: no impide guardar.
- **Haga:** pulse «Reprogramar».
- **Debe ver:** «Cita reprogramada. El proveedor ya tiene una cita en ese horario.».
- **Debe ver en la ventana de incógnito (Diana), sin tocar nada:** la cita desaparece de su agenda de hoy.
- **Haga (Diana):** pulse la campana.
- **Debe ver:** el mismo aviso «Cita actualizada» del paso 13, ahora con la fecha de **mañana** y **9:00 a. m.** El número de la campana no sube: si ya hay un aviso sin leer de esa cita, el nuevo lo reemplaza.
- **Haga (Diana):** pulse ese aviso.
- **Debe ver:** se abre la agenda de **mañana**, con el detalle de la cita de Héctor a las 9:00 a. m. Pulse «Cerrar».

### Paso 15. Cancelar exige un motivo

**Ventana:** normal (Recepción).

- **Haga:** en «Citas», pulse «Día siguiente» (la flecha de la derecha) para ver **mañana**. Pulse la tarjeta de las **10:30 a. m.** (Juan Pérez Gómez)
- **Haga:** pulse «Cancelar cita». En el diálogo «¿Cancelar esta cita?», pulse «Cancelar cita» sin escribir nada.
- **Debe ver:** «Se requiere un motivo.».
- **Haga:** pulse «Volver».
- **Debe ver:** la cita sigue **Programada**. «Volver» no cambia nada.
- **Haga:** pulse otra vez «Cancelar cita», escriba el motivo `A petición del paciente` y pulse «Cancelar cita».
- **Debe ver:** «Cita cancelada.». En la agenda, la tarjeta dice **Cancelada**, gris y con el nombre del paciente tachado.
- **Debe ver en la ventana de incógnito (Diana), si mira la agenda de mañana:** la misma cita, cancelada, sin recargar.

### Paso 16. Marcar «No se presentó»

**Ventana:** normal (Recepción).

- **Haga:** en «Citas», pulse «Hoy» y después «Día anterior» (la flecha de la izquierda) para ver **ayer**.
- **Debe ver:** a las **4:00 p. m.**, una cita **Programada** de **Natalia Vargas Rojas** que nadie marcó.
- **Haga:** púlsela y pulse «Marcar no presentado».
- **Debe ver:** «¿Marcar como no presentado?». **Haga:** confirme con «Marcar no presentado».
- **Debe ver:** «Marcada como no presentado.» y el estado **No se presentó** (ámbar, con su icono).

> «Marcar no presentado» solo aparece cuando ya pasó la hora de la cita. Por eso se usa una de ayer.

- **Haga:** cierre la sesión de Recepción.

---

## Bloque E. Sur no ve nada de Norte

### Paso 17. Aislamiento entre clínicas

**Ventana:** incógnito.

- **Haga:** cierre la sesión de Diana (su nombre → «Cerrar sesión» → confirmar).
- **Usuario:** `recepcion.sur@example.test`
- **Haga:** inicie sesión, pulse «Pacientes» y busque `Lopez`.
- **Debe ver:** «No se encontraron pacientes». María López García es de Norte.
- **Haga:** busque `02031985`.
- **Debe ver:** otra vez «No se encontraron pacientes».
- **Haga:** pulse «Citas».
- **Debe ver:** la agenda de **SUR1**, con pacientes de Sur (por ejemplo, Diego Torres Campos). Ninguna cita de Norte.
- **Haga:** en la barra de direcciones, escriba `localhost:5173/app/NOR1/citas` y pulse Enter.
- **Debe ver:** «Página no encontrada». Sur no puede entrar en una sede de Norte.

**Fin del guion.** Si llegó hasta aquí viendo lo que dice cada paso, la fase 2 funciona en su computadora.

---

## Si algo no sale como dice el guion

- **«No se pudo conectar con el servidor»:** `pnpm dev` no está en marcha. Arránquelo y espere a ver `http://localhost:5173`.
- **La búsqueda no muestra nada al escribir:** la búsqueda no se hace sola. Pulse Enter o «Buscar».
- **«Sin conexión» o «Reconectando…» en lugar de «En vivo»:** la aplicación sigue funcionando y se actualiza sola cada 30 segundos. Si no se resuelve, detenga `pnpm dev` (`Ctrl + C`) y vuelva a arrancarlo.
- **El aviso de la campana no llega:** espere unos segundos; los avisos los entrega el worker, que arranca con `pnpm dev`.
- **El código del teléfono no funciona:** compruebe que usa la entrada «Clinic System» recién creada y que la hora del teléfono es automática.
- **«No se pueden agendar citas en días anteriores a hoy.»:** las citas solo se crean o reprograman para hoy o para días futuros.
- **Quiere empezar de nuevo:** detenga `pnpm dev` y vuelva al paso 0.
