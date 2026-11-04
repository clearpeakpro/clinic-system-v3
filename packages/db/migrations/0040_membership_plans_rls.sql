-- T-026b parte A: catálogo «Consultas» y planes de membresía. Escrita a mano.
-- RLS por organización (ADR 0002) en las cinco tablas nuevas.

ALTER TABLE "app"."consultations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."consultations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."consultations"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "app"."membership_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."membership_plans" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."membership_plans"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "app"."membership_plan_fees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."membership_plan_fees" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."membership_plan_fees"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "app"."membership_benefits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."membership_benefits" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."membership_benefits"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "app"."membership_benefit_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."membership_benefit_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."membership_benefit_items"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

-- Consultas y planes: se crean, se editan y se desactivan; nunca se borran (sin DELETE).
-- Del plan no cambian ni el código ni la organización.
GRANT SELECT, INSERT, UPDATE ON "app"."consultations" TO clinic_app;--> statement-breakpoint
GRANT SELECT, INSERT ON "app"."membership_plans" TO clinic_app;--> statement-breakpoint
GRANT UPDATE ("name_es", "name_en", "description_es", "description_en", "max_members", "sort_order", "active", "version") ON "app"."membership_plans" TO clinic_app;--> statement-breakpoint
-- Cuotas del plan: como los precios, un cambio es una fila nueva; nunca se modifican ni se borran.
GRANT SELECT, INSERT ON "app"."membership_plan_fees" TO clinic_app;--> statement-breakpoint
-- Beneficios: el tipo y el plan no cambian; se desactivan, no se borran.
GRANT SELECT, INSERT ON "app"."membership_benefits" TO clinic_app;--> statement-breakpoint
GRANT UPDATE ("name_es", "name_en", "quantity_per_year", "includes_same_visit_labs", "category", "discount_bp", "sort_order", "active", "version") ON "app"."membership_benefits" TO clinic_app;--> statement-breakpoint
-- Servicios de un beneficio incluido: configuración; al editarlo se reemplazan (con auditoría del antes y el después).
GRANT SELECT, INSERT, DELETE ON "app"."membership_benefit_items" TO clinic_app;
