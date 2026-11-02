-- T-022: enfermería. Escrita a mano.
-- RLS por organización (ADR 0002) en las tres tablas nuevas.

ALTER TABLE "app"."encounter_vitals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."encounter_vitals" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."encounter_vitals"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
-- Signos vitales: un registro por visita que se corrige; nunca se borra.
GRANT SELECT, INSERT, UPDATE ON "app"."encounter_vitals" TO clinic_app;--> statement-breakpoint

ALTER TABLE "app"."patient_histories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."patient_histories" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."patient_histories"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
-- Historia del paciente (ADR 0036): cada cambio es una versión nueva; append-only.
GRANT SELECT, INSERT ON "app"."patient_histories" TO clinic_app;--> statement-breakpoint

ALTER TABLE "app"."encounter_assessments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."encounter_assessments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."encounter_assessments"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
-- Valoración de la visita: se corrige; nunca se borra.
GRANT SELECT, INSERT, UPDATE ON "app"."encounter_assessments" TO clinic_app;
