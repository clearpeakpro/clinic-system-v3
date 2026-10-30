-- T-011b: laboratorios y costos por prueba (ADR 0028). Escrita a mano.
-- RLS por organización (ADR 0002) en las dos tablas nuevas.

ALTER TABLE "app"."lab_providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."lab_providers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."lab_providers"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "app"."lab_test_costs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."lab_test_costs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."lab_test_costs"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

-- Laboratorios: se crean, se editan y se desactivan; nunca se borran (sin DELETE).
GRANT SELECT, INSERT, UPDATE ON "app"."lab_providers" TO clinic_app;--> statement-breakpoint
-- Costos: un cambio es una fila nueva con su fecha de vigencia; nunca se modifican ni se borran.
GRANT SELECT, INSERT ON "app"."lab_test_costs" TO clinic_app;
