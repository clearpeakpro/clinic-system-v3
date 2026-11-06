-- T-029: recibos. Escrita a mano.
-- RLS por organización (ADR 0002).

ALTER TABLE "app"."receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."receipts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."receipts"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "app"."receipt_prints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."receipt_prints" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."receipt_prints"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

-- Los recibos son instantáneas inmutables que no se anulan, y cada impresión
-- queda registrada: solo SELECT e INSERT (CLAUDE.md, regla 5).
GRANT SELECT, INSERT ON "app"."receipts" TO clinic_app;--> statement-breakpoint
GRANT SELECT, INSERT ON "app"."receipt_prints" TO clinic_app;
