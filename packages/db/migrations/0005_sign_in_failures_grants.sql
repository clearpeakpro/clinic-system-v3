-- Límite de intentos de inicio de sesión por cuenta (ADR 0023, T-003b).
-- Tabla global (esquema auth, sin RLS de organización): solo guarda el HMAC
-- del correo y la hora. clinic_app cuenta, registra y borra fallos.
GRANT SELECT, INSERT, DELETE ON "auth"."sign_in_failures" TO clinic_app;
