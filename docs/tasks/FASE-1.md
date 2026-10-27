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
