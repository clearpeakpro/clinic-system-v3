# Fase 1 — Cimientos: desglose en tareas

**Objetivo de la fase:** al terminar, en tu computadora puedes abrir la app, iniciar sesión con usuarios ficticios de dos clínicas, activar el MFA, elegir sede, ver el marco con el diseño de Stitch y administrar usuarios y sedes. Debajo queda la base de identidad, auditoría, worker y tiempo real que necesitan las fases 2 y 3.

**Orden:** T-003 → T-004 (primera pantalla visible) → T-005 → T-006 → T-007 → T-008 → T-009 → T-010 (demo de cierre). Una tarea por vez, cada una en su rama y con su PR.

**Reglas para todas las tareas:** las de `CLAUDE.md`, más estas:

- La API y el worker usan solo `clinic_app`.
- Se trabaja con las dos organizaciones ficticias.
- Cada pantalla se construye con su ficha del manual y su captura de `design/stitch/`.
- Toda la interfaz va en español, con «usted».
- La tarea no está terminada sin `pnpm lint`, `pnpm typecheck`, `pnpm test` y la CI en verde.

**Decisiones que necesito antes de ciertas tareas:**

- P-04 (rol de solo lectura para contabilidad): antes de T-006. Si no hay respuesta, va sin ese rol.
- P-11 (rol del operador de la plataforma): antes de T-007.

## Índice

| Tarea | Tamaño | Depende de |
| --- | --- | --- |
| [T-003 — Identidad en main (solo backend)](T-003-identidad.md) | 3–4 días | T-002 |
| [T-004 — Primera pantalla visible: acceso y marco](T-004-acceso-y-marco.md) | 3–4 días | T-003 |
| [T-005 — Componentes compartidos](T-005-componentes-compartidos.md) | 2 días | T-004 |
| [T-006 — Usuarios, invitaciones y perfil](T-006-usuarios-invitaciones-perfil.md) | 3–4 días | T-005 |
| [T-007 — Organizaciones, sedes y operador de la plataforma](T-007-organizaciones-sedes-operador.md) | 2–3 días | T-006 y P-11 |
| [T-008 — Worker, outbox y auditoría completa](T-008-worker-outbox-auditoria.md) | 3 días | T-003 |
| [T-009 — Tiempo real y notificaciones (base)](T-009-tiempo-real-notificaciones.md) | 2 días | T-004 y T-008 |
| [T-010 — Cierre de la fase 1: demo y semilla](T-010-cierre-fase-1.md) | 1–2 días | T-003 a T-009 |

## Cierre de la fase 1 (T-010, 2026-10-29)

**Revisión del ADR 0023:** las cinco condiciones están cumplidas, cada una con sus pruebas en la CI (tabla en el [ADR 0023](../decisions/0023-autenticacion.md), «Revisión de cierre de la fase 1»). Su estado pasa a «Aceptada».

**Decisión tomada para empezar la fase 2:** P-01, cifrado de campos frente a búsqueda ([ADR 0026](../decisions/0026-cifrado-campos-busqueda.md)). Ya no hay ninguna decisión pendiente que bloquee la fase 2.

**Lo que pasa a fases siguientes:**

| Qué | Origen | Fase |
| --- | --- | --- |
| Generar los avisos «Cita actualizada» y sus enlaces al tocarlos | T-009 | 2 (hecho en T-015) |
| Botón «Buscar pacientes» de la cabecera (S-GEN-12) | T-004 | 2 (hecho en T-012) |
| Generar los avisos «Paciente asignado a usted» y «Orden asignada…» | T-009 | 3 |
| `Idempotency-Key` en llegada, kiosco, pagos y anulaciones (ya existe `IdempotencyService`) | T-008 | 3 |
| P-13: anclaje de la cadena de auditoría en S3 con Object Lock | T-008 | 4 |
| P-12: el operador desactiva cuentas globales y resuelve los `409 account_shared` | T-007 | 4 (antes del piloto) |
| Avisos «Configuración incompleta», «Actualización requerida» y «Alerta de seguridad», e insignia de «Seguridad» | T-009 | 5 |

**Límites conocidos, documentados en sus ADR:**

- El correo de invitación se entrega «al menos una vez»: si el worker se cae justo después de enviarlo, puede llegar dos veces, con el mismo `Message-ID` ([ADR 0019](../decisions/0019-operaciones-criticas.md)).
- `auth.password_reset.completed` se audita después de fijar la contraseña: si la auditoría falla, la respuesta es 503, pero la contraseña ya cambió ([ADR 0023](../decisions/0023-autenticacion.md)).
- El límite de intentos por IP vive en memoria: vale con una instancia de la API (entorno B); con varias (entorno C) pasa a la base de datos ([ADR 0023](../decisions/0023-autenticacion.md)).
