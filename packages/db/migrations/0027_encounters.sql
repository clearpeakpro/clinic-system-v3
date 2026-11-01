-- T-017: visitas, su historial y su cobertura. Generada por drizzle-kit.
CREATE TABLE "app"."coverages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"encounter_id" uuid NOT NULL,
	"type" text NOT NULL,
	"insurer_name_enc" text,
	"member_id_enc" text,
	"term" text,
	"amount_cents" integer,
	"coinsurance_bp" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coverages_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "coverages_organization_id_encounter_id_key" UNIQUE("organization_id","encounter_id"),
	CONSTRAINT "coverages_type_check" CHECK ("app"."coverages"."type" in ('self_pay', 'insurance', 'membership')),
	CONSTRAINT "coverages_term_check" CHECK ("app"."coverages"."term" is null or "app"."coverages"."term" in ('copay', 'coinsurance', 'deductible')),
	CONSTRAINT "coverages_amount_range" CHECK ("app"."coverages"."amount_cents" between 0 and 999999999),
	CONSTRAINT "coverages_coinsurance_range" CHECK ("app"."coverages"."coinsurance_bp" between 0 and 10000),
	CONSTRAINT "coverages_insurance_check" CHECK (case when "app"."coverages"."type" = 'insurance' then
            "app"."coverages"."insurer_name_enc" is not null and "app"."coverages"."term" is not null
            and (("app"."coverages"."term" = 'coinsurance') = ("app"."coverages"."coinsurance_bp" is not null))
            and (("app"."coverages"."term" = 'coinsurance') = ("app"."coverages"."amount_cents" is null))
          else
            "app"."coverages"."insurer_name_enc" is null and "app"."coverages"."member_id_enc" is null and "app"."coverages"."term" is null
            and "app"."coverages"."amount_cents" is null and "app"."coverages"."coinsurance_bp" is null
          end),
	CONSTRAINT "coverages_version_check" CHECK ("app"."coverages"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "app"."encounter_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"encounter_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"action" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_membership_id" uuid,
	"reason_enc" text,
	"forced" boolean DEFAULT false NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "encounter_events_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "encounter_events_to_status_check" CHECK ("app"."encounter_events"."to_status" in ('CHECKED_IN', 'WAITING_FOR_NURSE', 'WITH_NURSE', 'WAITING_FOR_PROVIDER', 'WITH_PROVIDER', 'PROCEDURE_PENDING', 'READY_FOR_CHECKOUT', 'CHECKOUT', 'COMPLETED', 'LEFT_EARLY', 'CANCELLED')),
	CONSTRAINT "encounter_events_from_status_check" CHECK ("app"."encounter_events"."from_status" is null or "app"."encounter_events"."from_status" in ('CHECKED_IN', 'WAITING_FOR_NURSE', 'WITH_NURSE', 'WAITING_FOR_PROVIDER', 'WITH_PROVIDER', 'PROCEDURE_PENDING', 'READY_FOR_CHECKOUT', 'CHECKOUT', 'COMPLETED', 'LEFT_EARLY', 'CANCELLED')),
	CONSTRAINT "encounter_events_actor_type_check" CHECK ("app"."encounter_events"."actor_type" in ('user', 'kiosk', 'system')),
	CONSTRAINT "encounter_events_actor_check" CHECK (("app"."encounter_events"."actor_type" = 'user') = ("app"."encounter_events"."actor_membership_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "app"."encounters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"appointment_id" uuid,
	"appointment_type_id" uuid,
	"provider_membership_id" uuid,
	"code" text NOT NULL,
	"source" text NOT NULL,
	"route" text NOT NULL,
	"status" text DEFAULT 'CHECKED_IN' NOT NULL,
	"arrived_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "encounters_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "encounters_organization_id_code_key" UNIQUE("organization_id","code"),
	CONSTRAINT "encounters_code_format" CHECK ("app"."encounters"."code" ~ '^[A-Z][A-Z0-9]{1,7}-V-[0-9]{6,}$'),
	CONSTRAINT "encounters_status_check" CHECK ("app"."encounters"."status" in ('CHECKED_IN', 'WAITING_FOR_NURSE', 'WITH_NURSE', 'WAITING_FOR_PROVIDER', 'WITH_PROVIDER', 'PROCEDURE_PENDING', 'READY_FOR_CHECKOUT', 'CHECKOUT', 'COMPLETED', 'LEFT_EARLY', 'CANCELLED')),
	CONSTRAINT "encounters_route_check" CHECK ("app"."encounters"."route" in ('STANDARD', 'INJECTION_ONLY', 'LAB_ONLY', 'PROCEDURE_ONLY')),
	CONSTRAINT "encounters_source_check" CHECK ("app"."encounters"."source" in ('appointment', 'walk_in', 'kiosk')),
	CONSTRAINT "encounters_source_appointment_check" CHECK (("app"."encounters"."source" = 'appointment') = ("app"."encounters"."appointment_id" is not null)),
	CONSTRAINT "encounters_closed_at_check" CHECK (("app"."encounters"."closed_at" is null) = ("app"."encounters"."status" not in ('COMPLETED', 'LEFT_EARLY', 'CANCELLED'))),
	CONSTRAINT "encounters_version_check" CHECK ("app"."encounters"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "app"."coverages" ADD CONSTRAINT "coverages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."coverages" ADD CONSTRAINT "coverages_encounter_fk" FOREIGN KEY ("organization_id","encounter_id") REFERENCES "app"."encounters"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."encounter_events" ADD CONSTRAINT "encounter_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."encounter_events" ADD CONSTRAINT "encounter_events_encounter_fk" FOREIGN KEY ("organization_id","encounter_id") REFERENCES "app"."encounters"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."encounter_events" ADD CONSTRAINT "encounter_events_location_fk" FOREIGN KEY ("organization_id","location_id") REFERENCES "app"."locations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."encounter_events" ADD CONSTRAINT "encounter_events_actor_fk" FOREIGN KEY ("organization_id","actor_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."encounters" ADD CONSTRAINT "encounters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."encounters" ADD CONSTRAINT "encounters_location_fk" FOREIGN KEY ("organization_id","location_id") REFERENCES "app"."locations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."encounters" ADD CONSTRAINT "encounters_patient_fk" FOREIGN KEY ("organization_id","patient_id") REFERENCES "app"."patients"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."encounters" ADD CONSTRAINT "encounters_appointment_fk" FOREIGN KEY ("organization_id","appointment_id") REFERENCES "app"."appointments"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."encounters" ADD CONSTRAINT "encounters_type_fk" FOREIGN KEY ("organization_id","appointment_type_id") REFERENCES "app"."appointment_types"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."encounters" ADD CONSTRAINT "encounters_provider_fk" FOREIGN KEY ("organization_id","provider_membership_id") REFERENCES "app"."memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "encounter_events_encounter_idx" ON "app"."encounter_events" USING btree ("organization_id","encounter_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "encounters_open_appointment_key" ON "app"."encounters" USING btree ("organization_id","appointment_id") WHERE "app"."encounters"."status" not in ('COMPLETED', 'LEFT_EARLY', 'CANCELLED');--> statement-breakpoint
CREATE UNIQUE INDEX "encounters_open_patient_location_key" ON "app"."encounters" USING btree ("organization_id","patient_id","location_id") WHERE "app"."encounters"."status" not in ('COMPLETED', 'LEFT_EARLY', 'CANCELLED');--> statement-breakpoint
CREATE INDEX "encounters_location_status_idx" ON "app"."encounters" USING btree ("organization_id","location_id","status","arrived_at");--> statement-breakpoint
CREATE INDEX "encounters_patient_arrived_idx" ON "app"."encounters" USING btree ("organization_id","patient_id","arrived_at");