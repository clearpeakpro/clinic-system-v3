-- T-009: notificaciones guardadas (ADR 0008) y avisos de tiempo real. Escrita a mano.

-- 1. Notificaciones ----------------------------------------------------------
ALTER TABLE "app"."notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."notifications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."notifications"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
-- INSERT y UPDATE: el worker guarda y reemplaza avisos; la API marca leído y
-- «Borrar» (dismissed_at). Sin DELETE: solo la purga de 30 días borra filas.
GRANT SELECT, INSERT, UPDATE ON "app"."notifications" TO clinic_app;--> statement-breakpoint

-- Purga diaria (ADR 0008: 30 días), de todas las organizaciones.
CREATE POLICY "notifications_purge_read" ON "app"."notifications" FOR SELECT TO clinic_owner USING (true);--> statement-breakpoint
CREATE POLICY "notifications_purge" ON "app"."notifications" FOR DELETE TO clinic_owner
  USING ("created_at" <= now() - interval '30 days');--> statement-breakpoint
CREATE FUNCTION "app"."purge_notifications"()
  RETURNS integer
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM "app"."notifications" n WHERE n."created_at" <= now() - interval '30 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "app"."purge_notifications"() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app"."purge_notifications"() TO clinic_app;--> statement-breakpoint

-- 2. Revocación de sockets ---------------------------------------------------
--
-- Toda sesión borrada (desactivar a un usuario o quitarle una membresía,
-- cerrar sesión, también en todos los dispositivos, cambio o restablecimiento
-- de la contraseña, expiración absoluta) avisa en el canal de tiempo real; la
-- API cierra los sockets de esa sesión. El aviso solo sale al confirmarse la
-- transacción y lleva solo el id de la sesión.
CREATE FUNCTION "auth"."session_revoked_notify"()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  PERFORM pg_catalog.pg_notify('clinic_realtime', pg_catalog.json_build_object('t', 'session_revoked', 'session', OLD."id")::text);
  RETURN NULL;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "auth"."session_revoked_notify"() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER "session_revoked_notify" AFTER DELETE ON "auth"."session"
  FOR EACH ROW EXECUTE FUNCTION "auth"."session_revoked_notify"();
