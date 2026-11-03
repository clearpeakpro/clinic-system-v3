-- T-025: órdenes y cargos. Escrita a mano.
-- RLS por organización (ADR 0002) en las tres tablas nuevas. Nada se borra:
-- clinic_app no tiene DELETE. Las columnas que se pueden cambiar se conceden
-- una a una: el código, el tipo, la visita y los importes no cambian nunca.

ALTER TABLE "app"."orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."orders" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."orders"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
-- Orden: cambia su estado, a quién se asigna, su laboratorio y su cancelación.
GRANT SELECT, INSERT ON "app"."orders" TO clinic_app;--> statement-breakpoint
GRANT UPDATE ("status", "assigned_to_membership_id", "lab_provider_id", "cancel_reason_enc", "cancelled_by_membership_id", "cancelled_at", "version", "updated_at")
  ON "app"."orders" TO clinic_app;--> statement-breakpoint

ALTER TABLE "app"."order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."order_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."order_items"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
-- Líneas de la orden: append-only.
GRANT SELECT, INSERT ON "app"."order_items" TO clinic_app;--> statement-breakpoint

ALTER TABLE "app"."charges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."charges" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."charges"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint
-- Cargos (CLAUDE.md, regla 5): solo se anulan con motivo; el importe no cambia.
GRANT SELECT, INSERT ON "app"."charges" TO clinic_app;--> statement-breakpoint
GRANT UPDATE ("status", "void_reason_enc", "voided_by_membership_id", "voided_at", "version") ON "app"."charges" TO clinic_app;
