-- T-027: estado de cuenta de la visita. Escrita a mano.
-- RLS por organización (ADR 0002).

ALTER TABLE "app"."billing_statements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."billing_statements" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."billing_statements"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

-- Nada se borra (sin DELETE): solo sube la versión.
GRANT SELECT, INSERT ON "app"."billing_statements" TO clinic_app;--> statement-breakpoint
GRANT UPDATE ("version", "updated_at") ON "app"."billing_statements" TO clinic_app;
