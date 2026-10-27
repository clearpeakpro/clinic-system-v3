-- RLS por organización (ADR 0002). ENABLE + FORCE: FORCE hace que las
-- políticas apliquen también al dueño (clinic_owner).
-- NULLIF: tras una transacción que fijó app.org_id, el valor queda en '' y no
-- en NULL; sin NULLIF, ''::uuid lanzaría un error en vez de no devolver filas.

ALTER TABLE "app"."organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."organizations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."organizations"
  USING ("id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "app"."locations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."locations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."locations"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "app"."patients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."patients" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."patients"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

-- GRANT mínimos a clinic_app. Sin DELETE: nada en esta fase lo necesita.
-- organizations es de solo lectura: las altas son una operación de plataforma.
GRANT USAGE ON SCHEMA "app" TO clinic_app;--> statement-breakpoint
GRANT SELECT ON "app"."organizations" TO clinic_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "app"."locations", "app"."patients" TO clinic_app;
