# 0018. Auditoría

- **Estado:** Aceptada
- **Fecha:** 2026-10-24

## Contexto

La auditoría no debe copiar registros clínicos ni confundirse con los logs.

## Decisión

Guarda actor, acción, entidad, sede, hora, IP o dispositivo, motivo y request id. En cambios clínicos, solo los nombres de los campos; en cambios administrativos y financieros, antes y después. `clinic_app` solo inserta; leen el Propietario y el Administrador. Cadena de hash con verificación diaria y anclaje en S3 con Object Lock. Retención configurable por organización y definida con su asesor (propuesta inicial: 6 años, que no es obligatoria para todo). Los logs técnicos van aparte, sin PHI y con 30 días de retención.

## Implementación de la cadena de hash (T-008, 2026-10-29)

- **Cadenas:** una por organización y una de plataforma para los eventos sin organización (inicios de sesión, MFA, lecturas del operador). Para el piloto basta una sola cadena de plataforma.
- **Dónde se calcula:** en la base de datos, con un trigger `BEFORE INSERT` sobre `audit_log` (`SECURITY DEFINER` de `clinic_owner`, `search_path` vacío). Así quedan encadenados todos los que escriben (la API, el worker, Better Auth y el operador, también `read_platform_audit`) y ningún rol de la aplicación puede elegir su posición ni su hash. El trigger:
  1. toma un bloqueo transaccional por cadena;
  2. asigna el siguiente `seq`;
  3. calcula `hash = sha256(prev_hash ‖ campos de la fila)`;
  4. actualiza la cabeza en `audit_chain_heads`.

  Si la transacción se deshace, la cabeza también.
- **Filas anteriores:** la migración 0014 las encadena una vez, en orden de creación.
- **Verificación:** `app.verify_audit_chain(cadena)` recalcula la cadena y devuelve solo si está bien, cuántas filas tiene, su cabeza y el primer número roto, sin ningún dato de las filas. Detecta filas alteradas y filas borradas, también al final.
- **Trabajo diario del worker:** verifica cada cadena y deja el resultado en ella misma: `audit.chain_verified`, con el hash de la cabeza, o `audit.chain_broken`, con el primer número roto y un error en el log técnico.
- **Anclaje en S3 con Object Lock:** pendiente para la fase 4, con el entorno B (P-13). Hasta entonces, el hash de la cabeza queda en la propia auditoría.
- **Coste:** la cadena de plataforma serializa durante un instante los inicios de sesión de todas las clínicas. Es aceptable en el piloto; con mucho volumen se podría dividir por tipo de evento.
