-- T-019 (ADR 0039): minutos de espera de «Alerta» y «Crítico» del Panel, por
-- organización. Las organizaciones que ya existen reciben los valores por defecto.
ALTER TABLE "app"."organizations" ADD COLUMN "wait_alert_minutes" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."organizations" ADD COLUMN "wait_critical_minutes" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."organizations" ADD CONSTRAINT "organizations_wait_minutes_check" CHECK ("app"."organizations"."wait_alert_minutes" >= 1 and "app"."organizations"."wait_critical_minutes" > "app"."organizations"."wait_alert_minutes" and "app"."organizations"."wait_critical_minutes" <= 1440);