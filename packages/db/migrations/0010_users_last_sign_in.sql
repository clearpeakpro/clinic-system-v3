-- T-006a, columna «Último acceso» de S-ADM-02. Escrita a mano.
--
-- El último acceso sale de la auditoría de inicio de sesión: los eventos
-- auth.sign_in.success (sin MFA) y auth.mfa.success (con MFA), que se
-- escriben sin organización porque ocurren antes de elegir sede. clinic_app
-- no lee audit_log (append-only, solo INSERT). La función corre como su dueño
-- (clinic_owner), con una política de solo lectura limitada a esos eventos, y
-- devuelve solo el usuario y la hora: nunca la IP, el id de petición ni otros
-- eventos. Solo responde por las personas con membresía en la organización
-- del contexto RLS (app.org_id, fijado por withTenant); sin contexto, nada.
CREATE POLICY "last_sign_in_probe" ON "app"."audit_log" FOR SELECT TO clinic_owner
  USING (
    "organization_id" IS NULL
    AND "action" IN ('auth.sign_in.success', 'auth.mfa.success')
  );--> statement-breakpoint
CREATE INDEX "audit_log_sign_in_idx" ON "app"."audit_log" ("actor_id", "created_at")
  WHERE "organization_id" IS NULL AND "action" IN ('auth.sign_in.success', 'auth.mfa.success');--> statement-breakpoint
CREATE FUNCTION "app"."last_sign_ins"()
  RETURNS TABLE ("user_id" uuid, "last_sign_in_at" timestamptz)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT a."actor_id", max(a."created_at")
    FROM "app"."audit_log" a
   WHERE a."organization_id" IS NULL
     AND a."action" IN ('auth.sign_in.success', 'auth.mfa.success')
     AND a."actor_id" IN (
       SELECT m."user_id" FROM "app"."memberships" m
        WHERE m."organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid
     )
   GROUP BY a."actor_id"
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "app"."last_sign_ins"() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app"."last_sign_ins"() TO clinic_app;
