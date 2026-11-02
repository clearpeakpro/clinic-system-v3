# 0039. Alertas de espera en el Panel («Alerta» y «Crítico»)

- **Estado:** Aceptada
- **Fecha:** 2026-11-01
- **Decide:** el dueño del producto, al planificar T-019.
- **Relacionadas:** [T-019](../tasks/FASE-3.md#t-019--panel-en-vivo) (Panel en vivo, S-REC-01 a 05) y [T-022](../tasks/FASE-3.md#t-022--enfermería) (Cola de enfermería, S-CLI-01).

## Contexto

El diseño de Stitch del Panel (`design/stitch/recepcion/S-REC-01_panel`) marca las tarjetas y las filas con «Alerta» y «Crítico», y pinta en rojo un tiempo de espera largo. El manual no las menciona ni dice a partir de cuántos minutos aparecen ni en qué estados.

## Decisión

- **Umbrales:** «Alerta» a los **5 minutos** y «Crítico» a los **10 minutos** de espera, cumplidos.
- **Estados:** solo los de espera: **Registrado**, **Esperando enfermería** y **Esperando proveedor**. No aplican en los estados en atención (Con enfermería, Con proveedor, Procedimiento pendiente), en Caja (Listo para caja, En caja) ni en visitas cerradas.
- **Desde cuándo se cuenta:** desde que la visita **entró en su estado actual** (el último cambio de `encounter_events`), con la **hora del servidor**. No es el «Tiempo de espera» de la lista, que cuenta desde la llegada.
- **Cómo se ve:** icono, texto y color, nunca solo color (CLAUDE.md, regla 10).
- **Configuración por organización:** los minutos se guardan en la organización con esos valores por defecto. Por ahora no hay pantalla para cambiarlos: el Administrador podrá cambiarlos más adelante ([PENDIENTES.md](PENDIENTES.md), P-23).

## Consecuencias

- **Base de datos:** `organizations.wait_alert_minutes` (5) y `organizations.wait_critical_minutes` (10), con la restricción `1 ≤ alerta < crítico ≤ 1440` (migración `0030`). Las organizaciones existentes reciben los valores por defecto.
- **Cálculo único:** `waitLevel()` en `packages/shared/src/panel.ts` lo usan la API (nivel de cada fila en la foto, con el reloj inyectable) y la web (lo recalcula mientras pasa el tiempo, con el desfase respecto a la hora del servidor).
- **Pruebas:** unitarias y de integración con reloj fijado justo antes y después de 5 y de 10 minutos, y con otros minutos de la organización.

## Cómo quedó implementada (T-019, 2026-11-01)

- **API:** `GET /api/panel` devuelve `waitThresholds` de la organización y `waitLevel` de cada fila, calculados a la hora `serverNow` de la respuesta (`apps/api/src/panel.ts`).
- **Web (`apps/web/src/components/panel/`):**
  - en la lista, junto al tiempo de espera, una insignia con icono y texto: «Alerta» (ámbar, triángulo) o «Crítico» (rojo, círculo con exclamación), con los minutos en el estado actual para lectores de pantalla;
  - la fila crítica lleva además un fondo rojo suave, como en Stitch;
  - las tarjetas «En espera» y «Esperando proveedor» muestran la marca más grave de sus visitas;
  - el nivel se recalcula cada 15 s con la hora del servidor estimada, sin pedir datos.

## Ampliación: Cola de enfermería (decidido el 2026-11-01, T-022)

- **Dónde:** también en la Cola de enfermería (S-CLI-01), pero **solo en «Esperando enfermería»**. «Con enfermería» y «Procedimiento pendiente» no llevan marca.
- **Cómo:** con los mismos minutos de la organización y contando desde el estado actual, con la hora del servidor; la misma insignia (icono, texto y color) que en el Panel.
- **Implementación:** `GET /api/nursing/queue` devuelve `waitThresholds` y el `waitLevel` de cada fila (`apps/api/src/nursing.ts`); la web lo recalcula cada 15 s (`apps/web/src/pages/nursing-queue.tsx`). Prueba con reloj fijado justo antes y después de 5 y de 10 minutos en `apps/api/test/nursing.test.ts`.
