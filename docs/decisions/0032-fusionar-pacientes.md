# 0032. Fusionar pacientes duplicados

- **Estado:** Aceptada
- **Fecha:** 2026-11-01
- **Resuelve:** P-16.
- **Relacionadas:** [ADR 0009](0009-editar-nacimiento-inactivar.md) (cambios sensibles con motivo), [ADR 0018](0018-auditoria.md) (auditoría), [ADR 0027](0027-acceso-clinico-propietario-administrador.md) (sin acceso clínico implícito) y [ADR 0030](0030-busqueda-pacientes-un-campo.md) (búsqueda y duplicados).
- **Implementación:** T-030 ([FASE-3](../tasks/FASE-3.md)), antes del piloto.

## Contexto

En el piloto habrá pacientes duplicados reales, aunque el alta avise de posibles duplicados (S-PAC-03). El manual propone «Fusionar con…» en el perfil (S-PAC-13 y 14), y la columna `merged_into` existe desde T-012. Faltaba decidir quién fusiona, qué pasa con lo que tiene el duplicado, si se puede deshacer y cómo se audita.

## Decisión

- **Quién:** el Propietario o el Administrador, **solo si además tiene un rol clínico en la sede** (el mismo criterio que la fecha de nacimiento, ADR 0009 y 0027). Recepción, Enfermería y el Proveedor no fusionan.
- **Qué pasa al paciente que se conserva:** todo lo del duplicado:
  - citas pasadas y futuras, visitas, órdenes, cargos, pagos y saldos;
  - su historia clínica de paciente (alergias y antecedentes, [ADR 0036](0036-valoracion-paciente-visita.md));
  - sus membresías;
  - los códigos de las sedes donde el principal no tiene código. Los demás códigos quedan en el duplicado, y buscarlos lleva al principal.
- **Bloqueo:** no se fusiona si los dos pacientes tienen una visita abierta en la misma sede. Primero se cierra una.
- **Irreversible:** no se puede deshacer. Por eso exige:
  - que los dos registros estén activos y sean distintos;
  - un motivo obligatorio;
  - escribir «FUSIONAR» y confirmar en un diálogo destructivo.
- **El duplicado no se borra:** queda en estado «Fusionado», con `merged_into` apuntando al principal.
- **Auditoría:** `patient.merge`, en la misma transacción, con los ids de los dos pacientes, quién lo hizo, la sede, el motivo y los conteos de lo movido (citas, visitas, órdenes, cargos y pagos). **Sin nombres** ni datos clínicos.

## Consecuencias

- La fusión es una sola transacción, con `version` de los dos pacientes (409 si cualquiera de los dos cambió).
- Cada tabla que apunta a un paciente debe entrar en la fusión. T-030 lleva una prueba que falla si aparece una tabla nueva con referencia a `patients` que la fusión no trata.
- Un error al fusionar no se corrige desde la aplicación: haría falta una intervención del operador, con su propio registro.
