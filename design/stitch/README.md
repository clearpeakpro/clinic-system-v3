# Pantallas de Google Stitch

Referencia visual para v3. El comportamiento está en `docs/manual/`; aquí solo el aspecto.

## Convención

- Una carpeta por módulo: `generales`, `pacientes`, `recepcion`, `clinicas`, `caja`, `admin`, `kiosco`.
- Nombre de archivo = ID de la pantalla + nombre corto: `S-REC-01_panel.png` y `S-REC-01_panel.html`.
- Variantes de tamaño con sufijo: `_tel`, `_tab` (principal), `_esc`. Ej.: `S-CAJ-03_checkout_tab.png`.
- Exportar siempre PNG; el HTML de Stitch es opcional (sirve para extraer tokens).

## Antes de generar más pantallas

- «Caja» para el cobro en todas partes.
- Trato de «usted».
- Una sola paleta para los estados de la visita (icono + texto + color).
- Dinero en formato regional; saldo a favor no en rojo.
