-- Identidad (T-003, ADR 0023). Permisos de clinic_app sobre las tablas de
-- identidad global de Better Auth (esquema auth, sin RLS de organización) y
-- RLS de las tablas de membresías, invitaciones y auditoría.

-- Esquema auth: solo los privilegios que la suite de la prueba ejerció
-- (medido con pg_stat_user_tables en T-002, con 1.7.14 y con 1.7.7; ver
-- docs/spikes/T-002-better-auth.md).
-- T-006 añadirá lo mínimo para cambiar la contraseña (UPDATE en account) y
-- desactivar el MFA (DELETE en two_factor) (ADR 0023, condición 3).
GRANT USAGE ON SCHEMA "auth" TO clinic_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "auth"."user" TO clinic_app;--> statement-breakpoint
GRANT SELECT, INSERT ON "auth"."account" TO clinic_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "auth"."session" TO clinic_app;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "auth"."verification" TO clinic_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "auth"."two_factor" TO clinic_app;--> statement-breakpoint

-- memberships
ALTER TABLE "app"."memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."memberships" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."memberships"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
-- Cambio al patrón del ADR 0002 (ADR 0023): con app.user_id
-- (fijado solo desde la sesión validada) la persona LEE sus propias
-- membresías en todas sus organizaciones. Solo SELECT: escribir sigue
-- exigiendo el contexto de la organización.
CREATE POLICY "own_memberships_read" ON "app"."memberships" FOR SELECT
  USING ("user_id" = NULLIF(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint

-- membership_roles
ALTER TABLE "app"."membership_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."membership_roles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."membership_roles"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
-- Misma regla: solo SELECT, y solo de los roles de las membresías propias.
-- La subconsulta pasa por la RLS de memberships.
CREATE POLICY "own_membership_roles_read" ON "app"."membership_roles" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "app"."memberships" m
     WHERE m."organization_id" = "membership_roles"."organization_id"
       AND m."id" = "membership_roles"."membership_id"
       AND m."user_id" = NULLIF(current_setting('app.user_id', true), '')::uuid
  ));--> statement-breakpoint

-- invitations
ALTER TABLE "app"."invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."invitations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."invitations"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

-- audit_log: append-only. clinic_app solo inserta y no lee nada.
-- Los eventos sin organización (organization_id nulo, p. ej. un inicio de
-- sesión fallido) solo los lee el operador de la plataforma, con un rol
-- propio (T-007, P-11); ninguna organización los ve.
ALTER TABLE "app"."audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."audit_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "audit_insert" ON "app"."audit_log" FOR INSERT
  WITH CHECK (
    "organization_id" IS NULL
    OR "organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid
  );--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON "app"."memberships" TO clinic_app;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "app"."membership_roles" TO clinic_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "app"."invitations" TO clinic_app;--> statement-breakpoint
GRANT INSERT ON "app"."audit_log" TO clinic_app;
