-- T-012. Generada por drizzle-kit y editada a mano (código de los pacientes existentes).
CREATE TABLE "app"."code_counters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"last_value" integer NOT NULL,
	CONSTRAINT "code_counters_organization_id_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "code_counters_organization_id_kind_key" UNIQUE("organization_id","kind"),
	CONSTRAINT "code_counters_last_value_check" CHECK ("app"."code_counters"."last_value" >= 1)
);
--> statement-breakpoint
-- Editada a mano: los pacientes que ya existen reciben su código P-000001…
-- por organización, en orden de alta, y el contador queda en el último. Con
-- FORCE la RLS también filtra al dueño, así que se quita mientras dura.
ALTER TABLE "app"."patients" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "app"."patients" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
UPDATE "app"."patients" p SET "code" = 'P-' || lpad(n.rn::text, 6, '0')
  FROM (SELECT "id", row_number() OVER (PARTITION BY "organization_id" ORDER BY "created_at", "id") AS rn FROM "app"."patients") n
 WHERE p."id" = n."id";--> statement-breakpoint
INSERT INTO "app"."code_counters" ("id", "organization_id", "kind", "last_value")
  SELECT gen_random_uuid(), "organization_id", 'patient', count(*) FROM "app"."patients" GROUP BY "organization_id";--> statement-breakpoint
ALTER TABLE "app"."patients" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."patients" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."patients" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "app"."patients" ADD COLUMN "referral_source_id" uuid;--> statement-breakpoint
ALTER TABLE "app"."patients" ADD COLUMN "referral_details_enc" text;--> statement-breakpoint
ALTER TABLE "app"."patients" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."patients" ADD COLUMN "merged_into" uuid;--> statement-breakpoint
ALTER TABLE "app"."patients" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."code_counters" ADD CONSTRAINT "code_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "app"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patients" ADD CONSTRAINT "patients_referral_source_fk" FOREIGN KEY ("organization_id","referral_source_id") REFERENCES "app"."referral_sources"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patients" ADD CONSTRAINT "patients_merged_into_fk" FOREIGN KEY ("organization_id","merged_into") REFERENCES "app"."patients"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."patients" ADD CONSTRAINT "patients_organization_id_code_key" UNIQUE("organization_id","code");--> statement-breakpoint
ALTER TABLE "app"."patients" ADD CONSTRAINT "patients_code_format" CHECK ("app"."patients"."code" ~ '^P-[0-9]{6,}$');--> statement-breakpoint
ALTER TABLE "app"."patients" ADD CONSTRAINT "patients_first_name_length" CHECK (char_length("app"."patients"."first_name") between 1 and 100);--> statement-breakpoint
ALTER TABLE "app"."patients" ADD CONSTRAINT "patients_last_name_length" CHECK (char_length("app"."patients"."last_name") between 1 and 100);--> statement-breakpoint
ALTER TABLE "app"."patients" ADD CONSTRAINT "patients_birth_date_range" CHECK ("app"."patients"."birth_date" >= '1900-01-01');--> statement-breakpoint
ALTER TABLE "app"."patients" ADD CONSTRAINT "patients_phone_format" CHECK ("app"."patients"."phone" ~ '^[0-9]{7,15}$');--> statement-breakpoint
ALTER TABLE "app"."patients" ADD CONSTRAINT "patients_referral_details_check" CHECK ("app"."patients"."referral_details_enc" is null or "app"."patients"."referral_source_id" is not null);--> statement-breakpoint
ALTER TABLE "app"."patients" ADD CONSTRAINT "patients_status_check" CHECK ("app"."patients"."status" in ('active', 'inactive'));--> statement-breakpoint
ALTER TABLE "app"."patients" ADD CONSTRAINT "patients_not_merged_into_self" CHECK ("app"."patients"."merged_into" is null or "app"."patients"."merged_into" <> "app"."patients"."id");