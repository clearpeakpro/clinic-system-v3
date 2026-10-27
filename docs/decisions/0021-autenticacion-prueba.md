# 0021. Autenticación condicionada a una prueba técnica

- **Estado:** Aceptada
- **Fecha:** 2026-10-24

## Contexto

No se puede suponer que los plugins de Better Auth cubren los requisitos ni los permisos clínicos.

## Decisión

Prueba de 2–3 días con 8 criterios: invitaciones, organizaciones, MFA por rol, sesiones, revocación en menos de 1 min, compatibilidad con RLS y `clinic_app`, separación del token de kiosco y eventos de auditoría. Si falla el punto 3, 5 o 6, plan B: autenticación propia con argon2 + otplib. Los permisos clínicos y por sede son siempre nuestros.
