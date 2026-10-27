# T-005 — Componentes compartidos

**Tamaño:** 2 días · **Depende de:** T-004 · **Pantallas:** S-GEN-26, 27, 28, 30 y la hoja de componentes del PRD de Stitch

## Incluye

- Componentes:
  - chips de estado de la visita (icono, texto y color, tal como la tabla del PRD);
  - insignias de ruta;
  - botones (principal, tonal, contorno, texto, destructivo y con indicador de carga);
  - diálogo de confirmación con motivo obligatorio;
  - «¿Descartar cambios sin guardar?»;
  - estados de carga, vacío, error sin datos y error con datos previos;
  - campo de dinero en formato $1,234.50;
  - campo de código en monoespaciado;
  - fecha y hora en la zona horaria de la sede.
- Una página interna `/dev/ui` (solo en desarrollo) que muestra todos los componentes en claro y oscuro, para compararlos con Stitch.
- Pruebas unitarias de los formatos de dinero, fecha y hora, y una prueba de accesibilidad (axe) en `/dev/ui`.

**Terminada cuando:** `/dev/ui` coincide con la hoja de componentes de Stitch y las pruebas pasan.
