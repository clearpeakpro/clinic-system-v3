# Tableta del kiosco: cómo dejarla lista

Guía para quien instala la tableta del kiosco de autorregistro en la recepción (T-020; [`docs/manual/11_kiosco.md`](manual/11_kiosco.md), [ADR 0014](decisions/0014-kiosco.md)). El modo de pantalla fija es configuración de la tableta: el sistema no lo programa.

## Qué hace falta

- Una tableta Android en orientación vertical, con soporte antirrobo y cargador permanente.
- Chrome actualizado.
- Una persona con el rol **Propietario** o **Administrador** para generar el código de vinculación.

## 1. Generar el código (Administración › Sedes)

1. En **Sedes**, baje a **Kioscos de autorregistro** y elija la sede.
2. Pulse **«Vincular kiosco»**, escriba un nombre para reconocer la tableta (por ejemplo, «Tableta recepción 1») y pulse **«Generar código»**.
3. Aparece un código como `K7Q-4M2`. **Vence a los 10 minutos y sirve una sola vez.** Si vence, pulse «Generar nuevo código».

## 2. Vincular la tableta

1. En la tableta, abra Chrome en `https://<dirección del sistema>/kiosk/<CÓDIGO DE SEDE>` (por ejemplo, `/kiosk/NOR1`). La dirección exacta aparece en el diálogo del paso anterior.
2. Escriba el código y pulse **«Vincular»**. Aparece el formulario «Bienvenido».
3. Opcional: en el menú de Chrome, **«Agregar a pantalla principal»** para abrirla como aplicación.

La tableta queda vinculada **90 días**, que se renuevan solos cada vez que se usa. Si pasa 90 días sin usarse, o si alguien la revoca, vuelve a pedir un código.

## 3. Fijar la pantalla (Android)

Para que el paciente no pueda salir del formulario:

1. **Ajustes › Seguridad › Fijar aplicaciones** (según el fabricante: «Fijación de pantalla» o «Anclar aplicación»): actívelo y active también **«Pedir PIN para dejar de fijar»**.
2. Abra el kiosco, toque **Recientes** (el cuadrado), toque el icono de Chrome o de la aplicación y elija **«Fijar»**.
3. Para dejar de fijarla: mantenga pulsados **Atrás** y **Recientes** y escriba el PIN.

Recomendado además:

- **Pantalla:** brillo alto y «Tiempo de espera de la pantalla» de 10 minutos o más.
- **Bloqueo de pantalla** con PIN (lo pide «Fijar aplicaciones»).
- Desactivar las notificaciones de otras aplicaciones.

## Privacidad

- La tableta **no guarda nada del paciente**: los datos solo viven en la memoria de la página y se borran al enviar, a los 60 s sin actividad, al ocultar la pantalla y al recargar.
- La tableta **no puede leer datos**: solo envía registros a Recepción.
- No inicie sesión con una cuenta del personal en el navegador de la tableta.

## Si se pierde o se cambia la tableta

En **Sedes › Kioscos de autorregistro**, pulse **«Revocar»** en esa tableta y escriba el motivo. Deja de funcionar al instante. Para usar otra, vincúlela con un código nuevo.
