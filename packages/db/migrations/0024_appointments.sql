CREATE TABLE "app"."appointments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"appointment_type_id" uuid NOT NULL,
	"provider_membership_id" uuid,
	"code" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"status" text DEFAULT 'SCHEDULED' NOT NULL,
	"notes_enc" text,
	"cancel_reason_enc" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "appointments_organization_id_code_key" UNIQUE("organization_id","code"),
	CONSTRAINT "appointments_code_format" CHECK ("app"."appointments"."code" ~ '^[A-Z][A-Z0-9]{1,7}-A-[0-9]{6,}$'),
	CONSTRAINT "appointments_duration_range" CHECK ("app"."appointments"."duration_minutes" between 5 and 480),
	CONSTRAINT "appointments_status_check" CHECK ("app"."appointments"."status" in ('SCHEDULED', 'CONFIRMED', 'ARRIVED', 'CANCELLED', 'NO_SHOW')),
	CONSTRAINT "appointments_cancel_reason_check" CHECK ("app"."appointments"."cancel_reason_enc" is null or "app"."appointments"."status" = 'CANCELLED'),
	CONSTRAINT "appointments_version_check" CHECK ("app"."appointments"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "app"."appointments" ADD CONSTRAINT "appointments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."appointments" ADD CONSTRAINT "appointments_location_fk" FOREIGN KEY ("organization_id","location_id") REFERENCES "app"."locations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."appointments" ADD CONSTRAINT "appointments_patient_fk" FOREIGN KEY ("organization_id","patient_id") REFERENCES "app"."patients"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."appointments" ADD CONSTRAINT "appointments_type_fk" FOREIGN KEY ("organization_id","appointment_type_id") REFERENCES "app"."appointment_types"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."appointments" ADD CONSTRAINT "appointments_provider_fk" FOREIGN KEY ("organization_id","provider_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_location_starts_idx" ON "app"."appointments" USING btree ("organization_id","location_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_patient_starts_idx" ON "app"."appointments" USING btree ("organization_id","patient_id","starts_at");