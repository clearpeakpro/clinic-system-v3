-- T-014: citas. Escrita a mano. RLS por organización (ADR 0002).

ALTER TABLE "app"."appointments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."appointments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."appointments"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
-- Citas: se crean y cambian de estado; nunca se borran (una cita se cancela con motivo).
GRANT SELECT, INSERT, UPDATE ON "app"."appointments" TO clinic_app;
