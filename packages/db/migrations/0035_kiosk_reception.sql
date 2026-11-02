-- T-021: llegadas del kiosco en Recepción: paciente, visita y resolución del registro; motivo declarado en la visita.
ALTER TABLE "app"."encounters" ADD COLUMN "declared_reason_enc" text;--> statement-breakpoint
ALTER TABLE "app"."kiosk_checkins" ADD COLUMN "patient_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."kiosk_checkins" ADD COLUMN "encounter_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."kiosk_checkins" ADD COLUMN "resolved_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."kiosk_checkins" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."kiosk_checkins" ADD CONSTRAINT "kiosk_checkins_patient_fk" FOREIGN KEY ("organization_id","patient_id") REFERENCES "app"."patients"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."kiosk_checkins" ADD CONSTRAINT "kiosk_checkins_encounter_fk" FOREIGN KEY ("organization_id","encounter_id") REFERENCES "app"."encounters"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."kiosk_checkins" ADD CONSTRAINT "kiosk_checkins_resolved_by_fk" FOREIGN KEY ("organization_id","resolved_by_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."kiosk_checkins" ADD CONSTRAINT "kiosk_checkins_confirmed" CHECK ("app"."kiosk_checkins"."status" <> 'confirmed' or ("app"."kiosk_checkins"."patient_id" is not null and "app"."kiosk_checkins"."encounter_id" is not null));--> statement-breakpoint
ALTER TABLE "app"."kiosk_checkins" ADD CONSTRAINT "kiosk_checkins_resolved" CHECK (("app"."kiosk_checkins"."status" in ('confirmed', 'discarded')) = ("app"."kiosk_checkins"."resolved_at" is not null and "app"."kiosk_checkins"."resolved_by_membership_id" is not null));--> statement-breakpoint
ALTER TABLE "app"."kiosk_checkins" ADD CONSTRAINT "kiosk_checkins_resolved_purged" CHECK ("app"."kiosk_checkins"."status" not in ('confirmed', 'discarded') or "app"."kiosk_checkins"."content_enc" is null);