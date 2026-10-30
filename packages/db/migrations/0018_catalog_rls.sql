-- T-011: catálogo mínimo y precios por sede. Escrita a mano.
-- RLS por organización (ADR 0002) en las cinco tablas nuevas.

ALTER TABLE "app"."appointment_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."appointment_types" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."appointment_types"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "app"."procedures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."procedures" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."procedures"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "app"."lab_tests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."lab_tests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."lab_tests"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "app"."referral_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."referral_sources" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."referral_sources"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "app"."prices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."prices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."prices"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

-- Catálogos: se crean, se editan y se desactivan; nunca se borran (sin DELETE).
GRANT SELECT, INSERT, UPDATE ON "app"."appointment_types", "app"."procedures", "app"."lab_tests", "app"."referral_sources" TO clinic_app;--> statement-breakpoint
-- Precios: un cambio es una fila nueva con su fecha de vigencia; nunca se modifican ni se borran.
GRANT SELECT, INSERT ON "app"."prices" TO clinic_app;
