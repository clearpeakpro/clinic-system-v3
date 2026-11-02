-- T-022: signos vitales, historia del paciente (versiones) y valoración de la visita.
CREATE TABLE "app"."encounter_assessments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"encounter_id" uuid NOT NULL,
	"symptoms_enc" text,
	"nursing_notes_enc" text,
	"recorded_by_membership_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"updated_by_membership_id" uuid NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "encounter_assessments_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "encounter_assessments_organization_id_encounter_id_key" UNIQUE("organization_id","encounter_id"),
	CONSTRAINT "encounter_assessments_version_check" CHECK ("app"."encounter_assessments"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "app"."encounter_vitals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"encounter_id" uuid NOT NULL,
	"weight_lb_x100" integer,
	"height_in_x100" integer,
	"systolic" integer,
	"diastolic" integer,
	"pulse" integer,
	"respirations" integer,
	"temperature_f_x10" integer,
	"spo2" integer,
	"glucose" integer,
	"pain" integer,
	"bmi_x10" integer,
	"recorded_by_membership_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"updated_by_membership_id" uuid NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "encounter_vitals_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "encounter_vitals_organization_id_encounter_id_key" UNIQUE("organization_id","encounter_id"),
	CONSTRAINT "encounter_vitals_weight_range" CHECK ("app"."encounter_vitals"."weight_lb_x100" between 100 and 150000),
	CONSTRAINT "encounter_vitals_height_range" CHECK ("app"."encounter_vitals"."height_in_x100" between 1000 and 10800),
	CONSTRAINT "encounter_vitals_systolic_range" CHECK ("app"."encounter_vitals"."systolic" between 40 and 300),
	CONSTRAINT "encounter_vitals_diastolic_range" CHECK ("app"."encounter_vitals"."diastolic" between 20 and 200),
	CONSTRAINT "encounter_vitals_bp_order" CHECK ("app"."encounter_vitals"."systolic" is null or "app"."encounter_vitals"."diastolic" is null or "app"."encounter_vitals"."diastolic" < "app"."encounter_vitals"."systolic"),
	CONSTRAINT "encounter_vitals_pulse_range" CHECK ("app"."encounter_vitals"."pulse" between 20 and 300),
	CONSTRAINT "encounter_vitals_respirations_range" CHECK ("app"."encounter_vitals"."respirations" between 4 and 80),
	CONSTRAINT "encounter_vitals_temperature_range" CHECK ("app"."encounter_vitals"."temperature_f_x10" between 800 and 1150),
	CONSTRAINT "encounter_vitals_spo2_range" CHECK ("app"."encounter_vitals"."spo2" between 50 and 100),
	CONSTRAINT "encounter_vitals_glucose_range" CHECK ("app"."encounter_vitals"."glucose" between 10 and 1000),
	CONSTRAINT "encounter_vitals_pain_range" CHECK ("app"."encounter_vitals"."pain" between 0 and 10),
	CONSTRAINT "encounter_vitals_bmi_range" CHECK ("app"."encounter_vitals"."bmi_x10" between 50 and 2000),
	CONSTRAINT "encounter_vitals_bmi_check" CHECK (("app"."encounter_vitals"."bmi_x10" is null) = ("app"."encounter_vitals"."weight_lb_x100" is null or "app"."encounter_vitals"."height_in_x100" is null)),
	CONSTRAINT "encounter_vitals_version_check" CHECK ("app"."encounter_vitals"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "app"."patient_histories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"allergy_status" text NOT NULL,
	"allergies_enc" text,
	"personal_history_enc" text,
	"family_history_enc" text,
	"surgeries_enc" text,
	"lifestyle_enc" text,
	"reproductive_history_enc" text,
	"encounter_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"recorded_by_membership_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "patient_histories_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "patient_histories_patient_version_key" UNIQUE("organization_id","patient_id","version"),
	CONSTRAINT "patient_histories_allergy_status_check" CHECK ("app"."patient_histories"."allergy_status" in ('not_recorded', 'none_known', 'recorded')),
	CONSTRAINT "patient_histories_allergies_check" CHECK (("app"."patient_histories"."allergy_status" = 'recorded') = ("app"."patient_histories"."allergies_enc" is not null)),
	CONSTRAINT "patient_histories_version_check" CHECK ("app"."patient_histories"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "app"."encounter_assessments" ADD CONSTRAINT "encounter_assessments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."encounter_assessments" ADD CONSTRAINT "encounter_assessments_encounter_fk" FOREIGN KEY ("organization_id","encounter_id") REFERENCES "app"."encounters"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."encounter_assessments" ADD CONSTRAINT "encounter_assessments_recorded_by_fk" FOREIGN KEY ("organization_id","recorded_by_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."encounter_assessments" ADD CONSTRAINT "encounter_assessments_updated_by_fk" FOREIGN KEY ("organization_id","updated_by_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."encounter_vitals" ADD CONSTRAINT "encounter_vitals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."encounter_vitals" ADD CONSTRAINT "encounter_vitals_encounter_fk" FOREIGN KEY ("organization_id","encounter_id") REFERENCES "app"."encounters"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."encounter_vitals" ADD CONSTRAINT "encounter_vitals_recorded_by_fk" FOREIGN KEY ("organization_id","recorded_by_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."encounter_vitals" ADD CONSTRAINT "encounter_vitals_updated_by_fk" FOREIGN KEY ("organization_id","updated_by_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_histories" ADD CONSTRAINT "patient_histories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_histories" ADD CONSTRAINT "patient_histories_patient_fk" FOREIGN KEY ("organization_id","patient_id") REFERENCES "app"."patients"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_histories" ADD CONSTRAINT "patient_histories_encounter_fk" FOREIGN KEY ("organization_id","encounter_id") REFERENCES "app"."encounters"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_histories" ADD CONSTRAINT "patient_histories_location_fk" FOREIGN KEY ("organization_id","location_id") REFERENCES "app"."locations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patient_histories" ADD CONSTRAINT "patient_histories_recorded_by_fk" FOREIGN KEY ("organization_id","recorded_by_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;