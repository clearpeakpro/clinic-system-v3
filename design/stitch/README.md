# Pantallas de Google Stitch

Referencia visual para v3. El comportamiento está en `docs/manual/`; aquí solo está el aspecto.

## Estructura

```
design/stitch/<módulo>/<ID>_<nombre>/
├── screen.png   captura de referencia (lo que debe verse)
├── code.html    HTML con Tailwind generado por Stitch (solo referencia)
└── DESIGN.md    sistema de diseño de Stitch (YAML de tokens + prosa)
```

- **Módulos:** `generales`, `pacientes`, `recepcion`, `clinicas`, `caja`, `admin`, `kiosco` y `componentes` (la hoja de componentes, S-GEN-30).
- **Carpeta:** el ID estable de la pantalla del manual y un nombre corto, por ejemplo `generales/S-GEN-03_iniciar_sesion/`.
- **Nombres de archivo:** Stitch exporta `DESIGN.md` en **mayúsculas**. Se mantiene así: en Linux (la CI) el nombre distingue mayúsculas de minúsculas.

## Cómo se usa cada archivo

- **`screen.png`** es la referencia de lo que debe verse. Las pantallas se construyen con su ficha del manual y con los componentes de `apps/web` y `packages/ui`.
- **`code.html`** sirve para consultar distribución y clases. **No se copia tal cual.**
  - Carga Tailwind, Google Fonts y Material Symbols desde CDN. La app usa paquetes locales: Tailwind 4, `@fontsource` y lucide.
  - Incluye elementos que no están en el manual, como el selector de idioma, la casilla «Estación de trabajo clínica autorizada», el banner «MODO CONTINGENCIA» y datos de ejemplo. Si no están en el manual, no se construyen.
- **`DESIGN.md`** es el mismo archivo en todas las pantallas: las 27 copias son idénticas. La **fuente de los tokens de la app es `packages/ui/src/tokens.css`**, no este archivo.

## Tokens: cómo se resolvieron las contradicciones de `DESIGN.md` (T-004)

`DESIGN.md` se contradice a sí mismo: el bloque YAML del principio y la prosa dan valores distintos.

| Tema | Decisión | Dónde está |
| --- | --- | --- |
| Colores (47 roles de Material 3) | **Bloque YAML**, que es lo que usan `code.html` y las capturas. Fondo menta `#EBFDFA`, primary `#005C55`. | `packages/ui/src/palette.generated.css`, generado |
| Estados de la visita | **Prosa** («Status Badges & Chips»): son los únicos que existen | Ídem |
| Tipografía y espaciado | Bloque YAML | Ídem |
| Radios | **Prosa**: componentes 8 px, superficies 12 px, insignias redondas. El YAML y `code.html` dan otros valores. | `packages/ui/src/tokens.css` |
| Elevación | Prosa («Elevation Levels») | Ídem |
| Modo oscuro | Stitch no lo trae. **Se deriva** con material-color-utilities desde `#0F766E` (variante de esquema que mejor reproduce el YAML claro). | `palette.generated.css` |

Para regenerar los tokens tras cambiar `DESIGN.md`: `pnpm --filter @clinic/ui tokens:palette`. La prueba `packages/ui/test/tokens.test.ts` falla si el archivo generado no coincide con el YAML, y comprueba el contraste WCAG AA en claro y en oscuro.

## Qué se toma de cada pantalla y qué no (T-004)

Se copia la distribución, los tamaños, el espaciado, los colores, los iconos y las sombras. **No** se construyen datos ni funciones que el sistema no tiene.

| Pantalla | Se toma | No se construye |
| --- | --- |
| Encabezado con título, subtítulo y «Invitar usuario»; **tarjetas de totales** con conteos reales (Total registrados, Activos, Invitaciones pendientes, Deshabilitados); **filtros en una fila** sin etiquetas visibles (búsqueda, Roles, Sedes y Estado como desplegables); tabla compacta con avatar de iniciales, roles en texto secundario bajo el nombre, correo en monoespaciado, «Roles por sede» en cápsulas que no se parten, verificación 2FA y estado con icono; **fila del Propietario** con fondo violeta suave, la etiqueta «PROPIETARIO» y «Sin acceso clínico»; filas deshabilitadas atenuadas, con chips grises; **«Reenviar»** junto al estado de las invitaciones | «Activos en línea» y porcentajes, «Expira en 48h», «Registro de actividad», «Exportar», búsqueda por cédula, filtro por estado del MFA y botón de limpiar filtros, títulos y especialidades (Dr., MD, RN…), el rol Caja, «Sincronización LDAP», «Cifrado HIPAA», IPs, el aviso de HIPAA/HITECH, «Manual de políticas», la etiqueta «Seguridad & Acceso REF» y la paginación |

- **Añadido (no está en Stitch):** la columna **«Último acceso»** («Hoy, 7:45 a. m.», «Ayer…», fecha o «Nunca»), sacada de la auditoría de inicio de sesión y sin IP; «—» en las invitaciones. También el menú de acciones de cada fila.
- **Roles de toda la organización:** como en la fila del Propietario de Stitch, la cápsula dice solo «Organización completa» (el rol ya va bajo el nombre; el lector de pantalla oye «Administrador · Organización completa»).
- **Chips de estado:** Invitado en información y Activo en éxito; Deshabilitado en gris, como en Stitch.
- **Anchos:** desde 1280 px, todas las columnas; entre 1025 y 1279 px el correo pasa bajo el nombre; por debajo de 1025 px (tableta vertical y teléfono), tarjetas.
- **Diálogos** (S-ADM-03 a 09) y **páginas públicas** (S-GEN-09, S-GEN-10): sin captura. Diálogos de la hoja S-GEN-30; páginas con el aspecto de S-GEN-03.

## Perfil (T-006b)

S-GEN-21 a 25 no tienen captura. El Perfil usa el marco de S-GEN-12 y tarjetas blancas como las de S-GEN-11. Los diálogos son los de la hoja S-GEN-30, y los paneles de QR y de códigos son los de S-GEN-07 y 08.

- **Tarjetas:** Cuenta, Preferencias, Verificación en dos pasos, Contraseña y Sesiones. En una columna siguen el orden del manual; en escritorio se reparten en dos columnas.
- **Preferencias:** solo el tema (Claro u Oscuro), guardado en el dispositivo. No hay idioma, porque la interfaz solo está en español.
- **Contraseña:** la tarjeta la pide T-006, aunque el manual decía que no había cambio de contraseña.

## Pantallas sin referencia de Stitch

Si una pantalla del manual no tiene carpeta aquí, se construye con su ficha del manual y los mismos componentes, y su PR lo indica. En T-004 fueron S-GEN-01, 07, 08, 13, 16, 17, 20 y 29; en T-006a, S-ADM-03 a 09, S-GEN-09 y S-GEN-10; en T-006b, S-GEN-21 a 25.

## Antes de generar más pantallas

- «Caja» para el cobro en todas partes.
- Trato de «usted».
- Una sola paleta para los estados de la visita (icono + texto + color).
- Dinero en formato regional; saldo a favor no en rojo.
