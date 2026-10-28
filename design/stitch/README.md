# Pantallas de Google Stitch

Referencia visual para v3. El comportamiento está en `docs/manual/`; aquí solo está el aspecto.

## Estructura

```
design/stitch/<módulo>/<ID>_<nombre>/
├── screen.png   captura de referencia (lo que debe verse)
├── code.html    HTML con Tailwind generado por Stitch (solo referencia)
└── DESIGN.md    sistema de diseño de Stitch (YAML de tokens + prosa)
```

- **Módulos:** `generales`, `pacientes`, `recepcion`, `clinicas`, `caja`, `admin`, `kiosco`.
- **Carpeta:** el ID estable de la pantalla del manual y un nombre corto, por ejemplo `generales/S-GEN-03_iniciar_sesion/`.
- **Nombres de archivo:** Stitch exporta `DESIGN.md` en **mayúsculas**. Se mantiene así: en Linux (la CI) el nombre distingue mayúsculas de minúsculas.

## Cómo se usa cada archivo

- **`screen.png`** es la referencia de lo que debe verse. Las pantallas se construyen con su ficha del manual y con los componentes de `apps/web` y `packages/ui`.
- **`code.html`** sirve para consultar distribución y clases. **No se copia tal cual.**
  - Carga Tailwind, Google Fonts y Material Symbols desde CDN. La app usa paquetes locales: Tailwind 4, `@fontsource` y lucide.
  - Incluye elementos que no están en el manual, como el selector de idioma, la casilla «Estación de trabajo clínica autorizada», el banner «MODO CONTINGENCIA» y datos de ejemplo. Si no están en el manual, no se construyen.
- **`DESIGN.md`** es el mismo archivo en todas las pantallas: las 26 copias son idénticas. La **fuente de los tokens de la app es `packages/ui/src/tokens.css`**, no este archivo.

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

## Pantallas sin referencia de Stitch

Si una pantalla del manual no tiene carpeta aquí, se construye con su ficha del manual y los mismos componentes, y su PR lo indica. En T-004 fueron S-GEN-01, 07, 08, 13, 16, 17, 20 y 29.

## Antes de generar más pantallas

- «Caja» para el cobro en todas partes.
- Trato de «usted».
- Una sola paleta para los estados de la visita (icono + texto + color).
- Dinero en formato regional; saldo a favor no en rojo.
