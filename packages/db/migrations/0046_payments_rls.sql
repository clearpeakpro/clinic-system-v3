-- T-028: pagos. Escrita a mano.
-- RLS por organización (ADR 0002).

ALTER TABLE "app"."payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."payments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."payments"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

-- Append-only (CLAUDE.md, regla 5): sin UPDATE ni DELETE. Anular es insertar la fila inversa.
GRANT SELECT, INSERT ON "app"."payments" TO clinic_app;
