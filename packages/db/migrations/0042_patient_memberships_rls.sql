-- T-026b parte B: membresía del paciente. Escrita a mano.
-- RLS por organización (ADR 0002) en las cuatro tablas nuevas.

ALTER TABLE "app"."patient_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."patient_memberships" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."patient_memberships"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "app"."patient_membership_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."patient_membership_members" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."patient_membership_members"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "app"."patient_membership_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."patient_membership_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."patient_membership_events"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "app"."membership_fees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."membership_fees" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "app"."membership_fees"
  USING ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.org_id', true), '')::uuid);--> statement-breakpoint

-- Nada se borra (sin DELETE). De la membresía no cambian plan, titular, sede,
-- inicio, día de cobro ni las cuotas con que se inscribió («Monto fijo»): solo
-- el estado, el aviso de cancelación y la cancelación.
GRANT SELECT, INSERT ON "app"."patient_memberships" TO clinic_app;--> statement-breakpoint
GRANT UPDATE ("status", "cancel_notice_on", "cancel_notice_by_membership_id", "benefits_end_date", "cancelled_on", "cancellation", "version", "updated_at")
  ON "app"."patient_memberships" TO clinic_app;--> statement-breakpoint
-- Personas: el alta no cambia; solo se registra la baja.
GRANT SELECT, INSERT ON "app"."patient_membership_members" TO clinic_app;--> statement-breakpoint
GRANT UPDATE ("removed_at", "removed_by_membership_id") ON "app"."patient_membership_members" TO clinic_app;--> statement-breakpoint
-- Historial: solo se inserta.
GRANT SELECT, INSERT ON "app"."patient_membership_events" TO clinic_app;--> statement-breakpoint
-- Cuotas: el importe, el periodo y el vencimiento no cambian; se pagan (T-028) o se anulan.
GRANT SELECT, INSERT ON "app"."membership_fees" TO clinic_app;--> statement-breakpoint
GRANT UPDATE ("status", "paid_at", "voided_at", "version") ON "app"."membership_fees" TO clinic_app;--> statement-breakpoint

-- Beneficios: el tipo de cupo de un incluido se edita como el resto de sus campos.
GRANT UPDATE ("quota_mode") ON "app"."membership_benefits" TO clinic_app;--> statement-breakpoint

-- Cargos: los beneficios de membresía se recalculan mientras la visita está
-- abierta (el precio, la cantidad y el importe siguen sin cambiar).
GRANT UPDATE ("patient_membership_id", "benefit_year_start", "included_benefit_id", "membership_included_quantity", "same_visit_labs_benefit_id",
  "discount_benefit_id", "membership_discount_bp", "membership_discount_cents") ON "app"."charges" TO clinic_app;--> statement-breakpoint

-- El trabajo del worker (memberships.daily): las organizaciones con
-- membresías no canceladas. Solo devuelve ids; cada una se procesa después
-- con withTenant.
CREATE POLICY "membership_dispatch_probe" ON "app"."patient_memberships" FOR SELECT TO clinic_owner USING (true);--> statement-breakpoint
CREATE FUNCTION "app"."membership_organizations"()
  RETURNS TABLE ("organization_id" uuid)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
  SELECT DISTINCT m."organization_id" FROM "app"."patient_memberships" m WHERE m."status" <> 'cancelled' ORDER BY 1
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "app"."membership_organizations"() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app"."membership_organizations"() TO clinic_app;
