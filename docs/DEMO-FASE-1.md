# Demo de la fase 1: guion para probar en su computadora

Con este guion usted comprueba, en su navegador y sin ayuda, lo que construyó la fase 1:
- el acceso y el MFA;
- el marco de la aplicación;
- Usuarios y Sedes;
- el tiempo real: «En vivo», la campana y la revocación.

Todo usa **datos ficticios** de dos clínicas inventadas: «Clínica Demo Norte» y «Clínica Demo Sur».

Cada paso dice:
- **Usuario:** con quién entrar;
- **Haga:** qué hacer;
- **Debe ver:** el resultado esperado. Si ve otra cosa, anote el número del paso y lo que vio.

Tiempo aproximado: 30 minutos.

---

## Antes de empezar

**Necesita:**
- Docker Desktop abierto (el icono de la ballena, quieto).
- Una terminal abierta en la carpeta del proyecto (`clinic-system-v3`).
- Google Chrome.
- Su teléfono con una aplicación de autenticación: Google Authenticator, Microsoft Authenticator o similar.

**La contraseña de todos los usuarios de prueba** es la que figura en `DEV_SEED_PASSWORD` de su archivo `.env`. Si no la cambió, es:

```
Ficticia-dev-123
```

**Dos ventanas a la vez.** Algunos pasos usan dos personas distintas al mismo tiempo:
- una **ventana normal** de Chrome;
- una **ventana de incógnito**: menú ⋮ → «Nueva ventana de incógnito», o `Ctrl + Mayús + N`.

> Todas las ventanas de incógnito comparten la misma sesión entre sí. Use **una sola** ventana de incógnito y **una sola** ventana normal.

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

**Los usuarios de prueba** (todos con la misma contraseña):

| Usuario | Clínica | Rol |
| --- | --- | --- |
| `propietario.norte@example.test` | Norte | Propietaria |
| `admin.norte@example.test` | Norte | Administradora |
| `recepcion.norte@example.test` | Norte (NOR1) | Recepción |
| `enfermeria.norte@example.test` | Norte (NOR1) | Enfermería |
| `proveedor.norte@example.test` | Norte (NOR2) | Proveedor |
| `proveedora.nor1@example.test` | Norte (NOR1) | Proveedora (desde T-014) |
| `propietario.sur@example.test` | Sur | Propietario |
| `admin.sur@example.test` | Sur | Administrador |
| `recepcion.sur@example.test` | Sur (SUR1) | Recepción |
| `enfermeria.sur@example.test` | Sur (SUR2) | Enfermería |
| `proveedor.sur@example.test` | Sur (SUR2) | Proveedora |
| `multi@example.test` | Norte (NOR1) y Sur (SUR1) | Recepción en Norte, Enfermería en Sur |

Nadie tiene el MFA activado. Propietarios y Administradores tendrán que activarlo la primera vez que entren.

---

## Paso 1. Recepción entra a su Panel

**Ventana:** normal.

- **Usuario:** `recepcion.norte@example.test`
- **Haga:** escriba el correo y la contraseña, y pulse «Iniciar sesión».
- **Debe ver:**
  - el Panel, sin elegir sede: solo tiene una, **NOR1 · Norte Centro**, que aparece arriba a la izquierda;
  - en el menú de la izquierda: Panel, Pacientes, Citas, Caja y Reportes. **No** aparece «Administración»;
  - arriba a la derecha: la cápsula **«En vivo»** con un punto verde, la campana y su nombre, «Rosa Recepción (ficticia)».
- **Haga:** pulse su nombre (arriba a la derecha) → «Cerrar sesión» → confirme con «Cerrar sesión».
- **Debe ver:** otra vez «Iniciar sesión».

## Paso 2. La Propietaria activa el MFA con su teléfono

**Ventana:** normal.

- **Usuario:** `propietario.norte@example.test`
- **Haga:** inicie sesión.
- **Debe ver:** «Configurar la verificación en dos pasos», con un código QR. Su rol exige el MFA y no la deja seguir sin él.
- **Haga:**
  1. en su teléfono, abra la aplicación de autenticación, agregue una cuenta y escanee el código QR. Aparece **«Clinic System»** con un código de 6 dígitos;
  2. escriba esos 6 dígitos en «Código de verificación» y pulse «Confirmar».
- **Debe ver:** «Guarde sus códigos de recuperación», con 10 códigos.
- **Haga:** marque «Guardé estos códigos» y pulse «Continuar».
  (En una demo no hace falta guardarlos de verdad.)
- **Debe ver:**
  - **Administración › Usuarios** de NOR1. La ventana recuerda la última sede usada, así que no le pide elegirla;
  - en la lista, solo personas de Norte: Adriana Admin, Rosa Recepción, Nora Enfermería, Pablo Proveedor, Mario Dos Clínicas y ella misma;
  - **ninguna** persona de Sur.

## Paso 3. Invitar a una persona

**Ventana:** normal (sigue la Propietaria Norte).

- **Haga:** pulse «Invitar usuario» y complete:
  - Correo electrónico: `invitado.demo@example.test`
  - Nombre para mostrar: `Persona Invitada (ficticia)`
  - Rol: **Proveedor**
  - Sede: **Norte Centro (NOR1)**
- **Haga:** pulse «Crear invitación».
- **Debe ver:** el diálogo «Invitación creada», con un enlace y el texto «También se envía por correo…».
- **Haga:** pulse «Copiar enlace» y luego «Cerrar».
- **Debe ver:** a «Persona Invitada (ficticia)» en la lista, como **Pendiente**.
- **Opcional:** abra http://localhost:8025 (Mailpit, el buzón de pruebas).
  **Debe ver:** el correo «Invitación a Clinic System» para `invitado.demo@example.test`.

## Paso 4. La persona invitada acepta en incógnito

**Ventana:** incógnito.

- **Haga:** abra la ventana de incógnito, pegue el enlace en la barra de direcciones (`Ctrl + V`) y pulse Enter.
- **Haga:** escriba el nombre `Persona Invitada (ficticia)` y una contraseña de al menos 12 caracteres dos veces (por ejemplo, `una frase larga de prueba`). Pulse «Aceptar invitación».
- **Debe ver:**
  - el Panel de **NOR1**;
  - el menú de Proveedor: Panel, Pacientes, Citas, Cola de enfermería, Cola de proveedor y Cola de órdenes;
  - **«En vivo»** arriba a la derecha.

## Paso 5. Un aviso llega a la campana sin recargar

**Ventanas:** terminal e incógnito.

- **Haga:** abra **otra** terminal en la carpeta del proyecto. No cierre la de `pnpm dev`. Escriba:
  ```
  pnpm demo:aviso invitado.demo@example.test
  ```
- **Debe ver en la terminal:** «✔ Aviso «Cita actualizada» (NOR1-A-…) enviado…».
- **Debe ver en la ventana de incógnito, sin tocar nada:** en unos segundos, la campana muestra un **1** rojo.
- **Haga:** pulse la campana.
- **Debe ver:** el panel «Notificaciones» con **«Cita actualizada»**, «Cita NOR1-A-… · 31 oct, 9:00 a. m.» (la fecha y la hora de la cita) y un punto de «sin leer».
  Es un aviso de prueba sobre la cita ficticia de la sede más cercana a ahora; desde T-015, las citas generan sus propios avisos.
- **Haga:** pulse el aviso.
- **Debe ver:** se abre el detalle de esa cita en «Citas», en su día. Pulse «Cerrar»: el **1** desapareció.
- **Haga:** abra otra vez la campana y pulse la papelera («Borrar»).
- **Debe ver:** «Está al día».

## Paso 6. Revocación: al deshabilitarla, sale sola

**Ventanas:** normal e incógnito, una al lado de la otra.

- **Ventana normal (Propietaria Norte). Haga:**
  1. pulse el botón «Actualizar» de Usuarios (las flechas circulares). La fila de «Persona Invitada (ficticia)» dice **Activo**;
  2. en esa fila, pulse «⋮» (Más acciones) → «Deshabilitar»;
  3. escriba un motivo, por ejemplo «Demo de la fase 1», y pulse «Deshabilitar».
- **Debe ver en la ventana normal:** la fila dice **Deshabilitado**.
- **Debe ver en la ventana de incógnito, sin tocar nada:** en pocos segundos vuelve **sola** a «Iniciar sesión», con el mensaje «Su sesión terminó.».

## Paso 7. Sedes

**Ventana:** normal (Propietaria Norte).

- **Haga:** en el menú, pulse «Sedes».
- **Debe ver:** las tarjetas **NOR1** (con «Seleccionada») y **NOR2**.
- **Haga:** pulse «Nueva sede» y complete Código `NOR3` y Nombre `Norte Demo`. Pulse «Crear».
- **Debe ver:** «Guardado.» y la tarjeta **NOR3**, **Activo**.
- **Haga:** en NOR3, pulse «⋮» → «Desactivar» y confirme con «Desactivar».
- **Debe ver:** NOR3 pasa a **Inactivo**.

## Paso 8. Una persona de las dos clínicas

**Ventana:** incógnito.

- **Usuario:** `multi@example.test`
- **Haga:** inicie sesión.
- **Debe ver:** el Panel de **NOR1** (la ventana recuerda esa sede), con «Caja» en el menú.
- **Haga:** pulse la sede de arriba a la izquierda («NOR1 Norte Centro»).
- **Debe ver:** las sedes de las dos clínicas, cada una con el nombre de su clínica debajo.
- **Haga:** elija **SUR1 · Sur Centro**.
- **Debe ver:**
  - el Panel de SUR1;
  - el menú de Enfermería, con «Cola de enfermería» y **sin** «Caja»: en Sur esta persona es de Enfermería.
- **Haga:** cierre sesión (su nombre → «Cerrar sesión» → confirmar).

## Paso 9. Sur no ve nada de Norte

**Ventana:** incógnito.

- **Usuario:** `propietario.sur@example.test`
- **Haga:** inicie sesión y active el MFA con su teléfono, igual que en el paso 2. Aparecerá una segunda entrada «Clinic System» en su aplicación.
- **Debe ver:**
  - Administración › Usuarios de **SUR1**;
  - solo personas de Sur: Sergio Admin, Raúl Recepción, Elena Enfermería, Sofía Proveedora, Mario Dos Clínicas y él mismo;
  - **ninguna** de Norte: ni Adriana, ni Rosa, ni la persona invitada.
- **Haga:** en la barra de direcciones, escriba `localhost:5173/app/NOR1/panel` y pulse Enter.
- **Debe ver:** «Página no encontrada». Sur no puede entrar en una sede de Norte.

## Paso 10. Cerrar sesión en todos los dispositivos

**Ventanas:** normal e incógnito, una al lado de la otra. La Propietaria Norte entra en las dos, como si usara dos computadoras.

**Ventana de incógnito:**
- **Haga:** pulse «Atrás» para salir de «Página no encontrada» y cierre la sesión del Propietario Sur (su nombre → «Cerrar sesión» → confirmar).
- **Usuario:** `propietario.norte@example.test`
- **Haga:** inicie sesión.
- **Debe ver:** «Verificación en dos pasos». Como ya activó el MFA, ahora solo pide el código.
- **Haga:** escriba el código de 6 dígitos de la entrada «Clinic System» de **propietario.norte** en su teléfono. Tiene dos entradas: use la de Norte. Al escribir el sexto dígito, entra sola.
- **Debe ver:** «Seleccionar sede», porque esta ventana recordaba SUR1, que no es suya. **Haga:** elija **NOR1**.
- **Debe ver:** Administración › Usuarios, con «En vivo».

**Ventana normal:**
- **Haga:** pulse su nombre → «Cerrar sesión en todos los dispositivos» → confirme con «Cerrar sesión en todos los dispositivos».
- **Debe ver:** la pantalla «Iniciar sesión», **sin ningún aviso**. Usted cerró la sesión a propósito, en esta ventana.

**Ventana de incógnito, sin tocar nada:**
- **Debe ver:** en pocos segundos vuelve **sola** a «Iniciar sesión», con el aviso **«Su sesión terminó.»** y «Inicie sesión de nuevo para continuar.». Su sesión en la otra «computadora» también se cerró.

**Fin del guion.** Si llegó hasta aquí viendo lo que dice cada paso, la fase 1 funciona en su computadora.

---

## Paso opcional. Dar de alta una clínica nueva (operador de la plataforma)

Así se da de alta una clínica cliente en producción: desde la terminal, como operador.

- **Haga:** en la segunda terminal, copie y pegue este comando completo y pulse Enter:
  ```
  pnpm org:create --organizacion "Clínica Demo Este" --propietario-correo propietaria.este@example.test --propietario-nombre "Propietaria Este (ficticia)" --sede-codigo EST1 --sede-nombre "Este Centro" --zona-horaria America/Chicago
  ```
- **Debe ver:** que la clínica se creó, el enlace de la invitación de su Propietaria y «La invitación también se envía por correo». En Mailpit (http://localhost:8025) está ese correo.
- **Si sale un error**, el comando explica qué hacer. Por ejemplo: «La contraseña del operador en .env no coincide…; ejecute pnpm db:bootstrap». Haga lo que indica y repita el comando.
- **Haga:** abra el enlace en la ventana de incógnito, acepte la invitación con una contraseña larga y active el MFA con su teléfono.
- **Debe ver:**
  - Administración › Usuarios de **EST1 · Este Centro**;
  - solo ella en la lista. Una clínica nueva no ve nada de Norte ni de Sur.

---

## Si algo no sale como dice el guion

- **«No se pudo conectar con el servidor»:** `pnpm dev` no está en marcha. Arránquelo y espere a ver `http://localhost:5173`.
- **«Sin conexión» o «Reconectando…» en lugar de «En vivo»:** la aplicación sigue funcionando y se actualiza sola cada 30 segundos. Suele resolverse en unos segundos. Si no, detenga `pnpm dev` (`Ctrl + C`) y vuelva a arrancarlo.
- **El código del teléfono no funciona:** compruebe que usa la entrada «Clinic System» recién creada y que la hora del teléfono es automática.
- **Quiere empezar de nuevo:** detenga `pnpm dev` y vuelva al paso 0.
