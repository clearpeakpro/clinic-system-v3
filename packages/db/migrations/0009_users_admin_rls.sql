-- T-006a (Administración › Usuarios). Escrita a mano.

-- invitation_roles: mismo patrón que membership_roles (ADR 0002).
ALTER TABLE "app"."invitation_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."invitation_roles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."invitation_roles"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT ON "app"."invitation_roles" TO clinic_app;--> statement-breakpoint

-- ADR 0023, condición 3: lo mínimo para fijar una contraseña nueva
-- (restablecimiento, y el cambio desde el Perfil en T-006b) y para quitar el
-- factor TOTP (restablecimiento del MFA por un administrador, y desactivarlo
-- desde el Perfil en T-006b).
GRANT UPDATE ON "auth"."account" TO clinic_app;--> statement-breakpoint
GRANT DELETE ON "auth"."two_factor" TO clinic_app;--> statement-breakpoint

-- ¿Tiene la persona una membresía activa en OTRA organización? Editar el
-- nombre, restablecer el MFA o crear un restablecimiento de contraseña tocan
-- la cuenta global (auth.user), así que una organización solo puede hacerlo
-- si la cuenta es solo suya (decisión de T-006a; si no, lo resuelve el
-- operador de la plataforma, T-007).
--
-- clinic_app no puede leer membresías de otras organizaciones (RLS) y no
-- cambia de contexto para esto. La función corre como su dueño
-- (clinic_owner), que tiene una política de solo lectura propia, y devuelve
-- solo un sí o un no: ningún id ni nombre de la otra organización.
CREATE POLICY "account_sharing_probe" ON "app"."memberships" FOR SELECT TO clinic_owner
  USING (true);--> statement-breakpoint
CREATE FUNCTION "app"."has_active_membership_elsewhere"(p_user_id uuid, p_organization_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "app"."memberships" m
     WHERE m."user_id" = p_user_id
       AND m."organization_id" <> p_organization_id
       AND m."status" = 'active'
  )
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "app"."has_active_membership_elsewhere"(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app"."has_active_membership_elsewhere"(uuid, uuid) TO clinic_app;
