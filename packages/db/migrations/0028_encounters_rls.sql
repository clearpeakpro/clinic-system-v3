-- T-017: visitas, su historial y su cobertura. Escrita a mano.
-- RLS por organización (ADR 0002) en las tres tablas nuevas.

ALTER TABLE "app"."encounters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."encounters" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."encounters"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
-- Visitas: se abren y cambian de estado; nunca se borran (se cierran con motivo).
GRANT SELECT, INSERT, UPDATE ON "app"."encounters" TO clinic_app;--> statement-breakpoint

ALTER TABLE "app"."encounter_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."encounter_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."encounter_events"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
-- Historial: solo se añade (append-only), nunca se cambia ni se borra.
GRANT SELECT, INSERT ON "app"."encounter_events" TO clinic_app;--> statement-breakpoint

ALTER TABLE "app"."coverages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."coverages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."coverages"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
-- Cobertura: se crea con la visita y se corrige (T-018); nunca se borra.
GRANT SELECT, INSERT, UPDATE ON "app"."coverages" TO clinic_app;
